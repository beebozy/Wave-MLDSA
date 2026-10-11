// Reference implementation of the formats the on-chain lock (dillithium-lock-multisig) expects.
// Pure functions: you inject the hash, so plug in whatever your SDK already uses.
//
// ckbHash MUST be BLAKE2b-256 with personalization "ckb-default-hash" and must accept
// several byte arrays that it hashes as one concatenated stream.

export type CkbHash = (...parts: Uint8Array[]) => Uint8Array;

export const PK_LEN = 1952; // ML-DSA-65 public key
export const SIG_LEN = 3309; // ML-DSA-65 signature
export const ENTRY_LEN = 1 + PK_LEN + SIG_LEN;
export const VERSION = 1;
export const MAX_SIGNERS = 16;
export const HASH_LEN = 32;

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const u64le = (n: number): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// ── CONFIG: version | M | N | N x pubkey_hash ────────────────────────────────
export function buildConfig(m: number, pubkeyHashes: Uint8Array[]): Uint8Array {
  const n = pubkeyHashes.length;
  if (m < 1 || m > n || n > MAX_SIGNERS) throw new Error("invalid M/N");
  for (const h of pubkeyHashes) if (h.length !== HASH_LEN) throw new Error("bad hash length");
  // The lock does not reject duplicates (so a mistaken config cannot strand funds),
  // so the wallet must.
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if (equal(pubkeyHashes[i], pubkeyHashes[j])) throw new Error("duplicate signer");
  return concat(Uint8Array.of(VERSION, m, n), ...pubkeyHashes);
}

/** A normal single-owner account is 1-of-1. */
export const oneOfOneConfig = (publicKey: Uint8Array, ckbHash: CkbHash) =>
  buildConfig(1, [ckbHash(publicKey)]);

// ── ARGS: blake2b-256(config). NOT blake2b(publicKey) any more. ───────────────
export const lockArgs = (config: Uint8Array, ckbHash: CkbHash) => ckbHash(config);

// ── WITNESS lock field: config | count | M x (index | pubkey | signature) ─────
export interface SignerEntry {
  index: number; // position of the signer's hash inside the config
  publicKey: Uint8Array;
  signature: Uint8Array; // pass new Uint8Array(SIG_LEN) for the placeholder
}

export function buildLockField(config: Uint8Array, entries: SignerEntry[]): Uint8Array {
  const m = config[1];
  if (entries.length !== m) throw new Error("need exactly M entries");
  entries.forEach((e, i) => {
    if (i > 0 && e.index <= entries[i - 1].index) throw new Error("indexes must strictly increase");
    if (e.publicKey.length !== PK_LEN || e.signature.length !== SIG_LEN) throw new Error("bad entry size");
  });
  return concat(
    config,
    Uint8Array.of(entries.length),
    ...entries.flatMap((e) => [Uint8Array.of(e.index), e.publicKey, e.signature]),
  );
}

export const placeholderLockField = (config: Uint8Array, entries: SignerEntry[]) =>
  buildLockField(config, entries.map((e) => ({ ...e, signature: new Uint8Array(SIG_LEN) })));

// ── SIGNING MESSAGE ──────────────────────────────────────────────────────────
// blake2b-256 over, in order, each witness prefixed with its u64 LE length:
//   tx_hash
//   first witness of the group (WitnessArgs with lock = placeholder lock field)
//   the group's remaining witnesses  (witnesses at the group's input indexes, 2nd onward)
//   witnesses beyond the inputs      (tx.witnesses[inputCount..])
export interface MessageParts {
  txHash: Uint8Array; // 32 bytes
  firstWitnessWithPlaceholder: Uint8Array; // molecule WitnessArgs bytes, signature slots zeroed
  otherGroupWitnesses: Uint8Array[]; // stop at the first missing index, like the on-chain loop
  extraWitnesses: Uint8Array[];
}

export function signingMessage(p: MessageParts, ckbHash: CkbHash): Uint8Array {
  const parts: Uint8Array[] = [p.txHash];
  const push = (w: Uint8Array) => parts.push(u64le(w.length), w);
  push(p.firstWitnessWithPlaceholder);
  p.otherGroupWitnesses.forEach(push);
  p.extraWitnesses.forEach(push);
  return ckbHash(...parts);
}
