import { ccc } from "@ckb-ccc/core";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { PK_LEN, SIG_LEN, type CkbHash } from "./lockFormat";

/** BLAKE2b-256 with the "ckb-default-hash" personalization, over concatenated parts. */
export const ckbHash: CkbHash = (...parts) => ccc.bytesFrom(ccc.hashCkb(...parts));

export const SEED_LEN = 32;

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const newSeed = (): Uint8Array => crypto.getRandomValues(new Uint8Array(SEED_LEN));

/** FIPS 204 key generation is deterministic from a 32-byte seed, so the seed is the backup. */
export function keyPairFromSeed(seed: Uint8Array): KeyPair {
  if (seed.length !== SEED_LEN) throw new Error("Seed must be 32 bytes");
  const { publicKey, secretKey } = ml_dsa65.keygen(seed);
  if (publicKey.length !== PK_LEN) throw new Error("Unexpected public key length");
  return { publicKey, secretKey };
}

// Pure ML-DSA-65 with an EMPTY context string, to match the lock's fips204 verify(.., &[]).
export function mlDsaSign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  const sig = ml_dsa65.sign(message, secretKey);
  if (sig.length !== SIG_LEN) throw new Error("Unexpected signature length");
  return sig;
}

export const mlDsaVerify = (sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean =>
  ml_dsa65.verify(sig, message, publicKey);

export const toHex = (b: Uint8Array): string => ccc.hexFrom(b);
export const fromHex = (h: string): Uint8Array => ccc.bytesFrom(h);
