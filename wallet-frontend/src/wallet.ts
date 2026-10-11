import { ccc } from "@ckb-ccc/core";
import type { Deployment } from "./config";
import { ckbHash, keyPairFromSeed, newSeed, type KeyPair } from "./crypto";
import { lockArgs, oneOfOneConfig } from "./lockFormat";

export interface WalletKeys {
  seed: Uint8Array;
  keys: KeyPair;
  /** 1-of-1 config committed to by the lock args. */
  config: Uint8Array;
}

export function walletFromSeed(seed: Uint8Array): WalletKeys {
  const keys = keyPairFromSeed(seed);
  return { seed, keys, config: oneOfOneConfig(keys.publicKey, ckbHash) };
}

export const createWallet = (): WalletKeys => walletFromSeed(newSeed());

export function lockScriptFor(w: WalletKeys, dep: Deployment): ccc.Script {
  return ccc.Script.from({
    codeHash: dep.codeHash,
    hashType: dep.hashType,
    args: ccc.hexFrom(lockArgs(w.config, ckbHash)),
  });
}

export const addressFor = (w: WalletKeys, dep: Deployment, client: ccc.Client): string =>
  ccc.Address.fromScript(lockScriptFor(w, dep), client).toString();
