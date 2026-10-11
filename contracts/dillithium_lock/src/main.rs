#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use alloc::vec::Vec;
use blake2b_ref::{Blake2b, Blake2bBuilder};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, packed::WitnessArgs, prelude::*},
    debug,
    error::SysError,
    high_level::{load_input_since, load_script, load_tx_hash, load_witness, load_witness_args},
};
use fips204::ml_dsa_65;
use fips204::traits::{SerDes, Verifier};

// ───────────────────────────── LAYOUTS ─────────────────────────────
//
// CONFIG (committed by args):
//   version (1 byte) || M (1 byte) || N (1 byte) || N x pubkey_hash (32 bytes each)
//
// ARGS (32 bytes):
//   ckb_blake2b_256(CONFIG)
//
// WITNESS (WitnessArgs.lock, in the first witness of this script group):
//   CONFIG || count (1 byte, must equal M) || M x ENTRY
//   ENTRY = signer_index (1 byte) || public_key (PK_LEN) || signature (SIG_LEN)
//
// A 1-of-1 account is simply M = 1, N = 1.
//
// SIGNING MESSAGE (blake2b-256, "ckb-default-hash"), in this order:
//   1. tx_hash
//   2. first witness of the group, with every signature slot zeroed (u64 LE length prefix)
//   3. the group's remaining witnesses (GroupInput index 1..)
//   4. witnesses beyond the inputs (Input index >= input count)
// ────────────────────────────────────────────────────────────────────

const CKB_PERSONALIZATION: &[u8] = b"ckb-default-hash";

const VERSION: u8 = 1;
const MAX_SIGNERS: usize = 16; // keeps witness size and cycle cost bounded
const HASH_LEN: usize = 32;
const HEADER_LEN: usize = 3;
const PUBKEY_BYTES: usize = ml_dsa_65::PK_LEN;
const SIG_BYTES: usize = ml_dsa_65::SIG_LEN;
const ENTRY_LEN: usize = 1 + PUBKEY_BYTES + SIG_BYTES;

const ERR_SYSCALL: i8 = 1;
const ERR_INVALID_ARGS_LENGTH: i8 = 2;
const ERR_INVALID_WITNESS: i8 = 3;
const ERR_UNSUPPORTED_VERSION: i8 = 4;
const ERR_INVALID_CONFIG: i8 = 5;
const ERR_CONFIG_HASH_MISMATCH: i8 = 6;
const ERR_INVALID_SIGNER_INDEX: i8 = 7;
const ERR_SIGNER_ORDER: i8 = 8;
const ERR_PUBKEY_HASH_MISMATCH: i8 = 9;
const ERR_INVALID_PUBKEY: i8 = 10;
const ERR_INVALID_SIGNATURE: i8 = 11;
const ERR_SIGNATURE_VERIFICATION: i8 = 12;

pub fn program_entry() -> i8 {
    debug!("dilithium-multisig: starting");
    match run() {
        Ok(()) => 0,
        Err(code) => code,
    }
}

struct Layout {
    m: usize,
    n: usize,
    config_len: usize,
    entries_start: usize,
}

fn run() -> Result<(), i8> {
    // 1. ARGS: hash of the config
    let script = load_script().map_err(|_| ERR_SYSCALL)?;
    let args: Bytes = script.args().unpack();
    if args.len() != HASH_LEN {
        return Err(ERR_INVALID_ARGS_LENGTH);
    }

    // 2. WITNESS: config + signature entries
    let witness_args =
        load_witness_args(0, Source::GroupInput).map_err(|_| ERR_INVALID_WITNESS)?;
    let lock: Bytes = witness_args
        .lock()
        .to_opt()
        .ok_or(ERR_INVALID_WITNESS)?
        .unpack();
    let layout = parse_layout(&lock)?;

    // 3. The config in the witness must be the one this cell was locked to
    let config = &lock[..layout.config_len];
    if ckb_blake2b_256(config)[..] != args[..] {
        return Err(ERR_CONFIG_HASH_MISMATCH);
    }

    // 4. Signing message (signature slots zeroed so the message does not contain itself)
    let mut placeholder = Vec::from(&lock[..]);
    for j in 0..layout.m {
        let sig_start = layout.entries_start + j * ENTRY_LEN + 1 + PUBKEY_BYTES;
        placeholder[sig_start..sig_start + SIG_BYTES].fill(0);
    }
    let message = build_signing_message(&witness_args, placeholder)?;

    // 5. Verify M entries: strictly increasing indexes, key matches config, signature valid
    let mut prev: Option<usize> = None;
    for j in 0..layout.m {
        let base = layout.entries_start + j * ENTRY_LEN;
        let idx = lock[base] as usize;
        if idx >= layout.n {
            return Err(ERR_INVALID_SIGNER_INDEX);
        }
        if let Some(p) = prev {
            if idx <= p {
                return Err(ERR_SIGNER_ORDER); // also rejects duplicates
            }
        }
        prev = Some(idx);

        let pk = &lock[base + 1..base + 1 + PUBKEY_BYTES];
        let sig = &lock[base + 1 + PUBKEY_BYTES..base + ENTRY_LEN];

        let hash_start = HEADER_LEN + idx * HASH_LEN;
        let expected_hash = &lock[hash_start..hash_start + HASH_LEN];
        if ckb_blake2b_256(pk)[..] != expected_hash[..] {
            return Err(ERR_PUBKEY_HASH_MISMATCH);
        }

        let pk_array: [u8; PUBKEY_BYTES] = pk.try_into().map_err(|_| ERR_INVALID_PUBKEY)?;
        let public_key =
            ml_dsa_65::PublicKey::try_from_bytes(pk_array).map_err(|_| ERR_INVALID_PUBKEY)?;
        let sig_array: [u8; SIG_BYTES] = sig.try_into().map_err(|_| ERR_INVALID_SIGNATURE)?;

        if !public_key.verify(&message, &sig_array, &[]) {
            debug!("dilithium-multisig: signature {} failed", j);
            return Err(ERR_SIGNATURE_VERIFICATION);
        }
    }
    Ok(())
}

/// Parses and bounds-checks the witness lock field. Everything after this can index freely.
fn parse_layout(lock: &[u8]) -> Result<Layout, i8> {
    if lock.len() < HEADER_LEN + 1 {
        return Err(ERR_INVALID_WITNESS);
    }
    if lock[0] != VERSION {
        return Err(ERR_UNSUPPORTED_VERSION);
    }
    let m = lock[1] as usize;
    let n = lock[2] as usize;
    if m == 0 || m > n || n > MAX_SIGNERS {
        return Err(ERR_INVALID_CONFIG);
    }
    let config_len = HEADER_LEN + n * HASH_LEN;
    let entries_start = config_len + 1;
    let expected_len = entries_start + m * ENTRY_LEN;
    if lock.len() != expected_len {
        return Err(ERR_INVALID_WITNESS);
    }
    if lock[config_len] as usize != m {
        return Err(ERR_INVALID_WITNESS);
    }
    Ok(Layout { m, n, config_len, entries_start })
}

fn ckb_blake2b_256(data: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut hasher = Blake2bBuilder::new(32)
        .personal(CKB_PERSONALIZATION)
        .build();
    hasher.update(data);
    hasher.finalize(&mut out);
    out
}

fn hash_witness(hasher: &mut Blake2b, witness: &[u8]) {
    hasher.update(&(witness.len() as u64).to_le_bytes());
    hasher.update(witness);
}

fn input_count() -> Result<usize, i8> {
    let mut i = 0;
    loop {
        match load_input_since(i, Source::Input) {
            Ok(_) => i += 1,
            Err(SysError::IndexOutOfBound) => return Ok(i),
            Err(_) => return Err(ERR_SYSCALL),
        }
    }
}

fn hash_witnesses_from(hasher: &mut Blake2b, start: usize, source: Source) -> Result<(), i8> {
    let mut i = start;
    loop {
        match load_witness(i, source) {
            Ok(w) => {
                hash_witness(hasher, &w);
                i += 1;
            }
            Err(SysError::IndexOutOfBound) => return Ok(()),
            Err(_) => return Err(ERR_SYSCALL),
        }
    }
}

fn build_signing_message(
    witness_args: &WitnessArgs,
    placeholder_lock: Vec<u8>,
) -> Result<[u8; 32], i8> {
    let tx_hash = load_tx_hash().map_err(|_| ERR_SYSCALL)?;
    let first_witness = witness_args
        .clone()
        .as_builder()
        .lock(Some(Bytes::from(placeholder_lock)).pack())
        .build()
        .as_bytes();

    let mut hasher = Blake2bBuilder::new(32)
        .personal(CKB_PERSONALIZATION)
        .build();
    hasher.update(&tx_hash);
    hash_witness(&mut hasher, first_witness.as_ref());
    hash_witnesses_from(&mut hasher, 1, Source::GroupInput)?;
    hash_witnesses_from(&mut hasher, input_count()?, Source::Input)?;

    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    Ok(out)
}