import { ccc } from "@ckb-ccc/core";
import { describe, expect, it } from "vitest";
import { deploymentProblems, type Deployment } from "./config";
import { ckbHash, keyPairFromSeed, mlDsaSign, mlDsaVerify, newSeed, toHex } from "./crypto";
import {
  buildConfig,
  buildLockField,
  ENTRY_LEN,
  lockArgs,
  oneOfOneConfig,
  PK_LEN,
  placeholderLockField,
  SIG_LEN,
} from "./lockFormat";
import { messageForTx } from "./sighash";
import { selfCheck, signPayment } from "./transfer";
import { decryptSeed, encryptSeed } from "./vault";
import { addressFor, lockScriptFor, walletFromSeed } from "./wallet";

const dep: Deployment = {
  codeHash: "0x" + "ab".repeat(32),
  hashType: "data1",
  depTxHash: "0x" + "cd".repeat(32),
  depIndex: 0,
};

const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/** A transaction shaped like the one buildPayment assembles, with fake input cells. */
function fakeTx(w: ReturnType<typeof walletFromSeed>, inputs = 1) {
  const lock = lockScriptFor(w, dep);
  const tx = ccc.Transaction.from({
    outputs: [{ lock, capacity: 100n * 100_000_000n }, { lock, capacity: 90n * 100_000_000n }],
    outputsData: ["0x", "0x"],
    cellDeps: [{ outPoint: { txHash: dep.depTxHash, index: dep.depIndex }, depType: "code" }],
  });
  for (let i = 0; i < inputs; i++) {
    tx.addInput({ previousOutput: { txHash: "0x" + String(i + 1).padStart(2, "0").repeat(32), index: 0 } });
  }
  const placeholder = placeholderLockField(w.config, [
    { index: 0, publicKey: w.keys.publicKey, signature: new Uint8Array(SIG_LEN) },
  ]);
  tx.setWitnessArgsAt(0, ccc.WitnessArgs.from({ lock: ccc.hexFrom(placeholder) }));
  return tx;
}

describe("ML-DSA-65 keys", () => {
  it("is deterministic from the seed and has the expected sizes", () => {
    const a = keyPairFromSeed(seed);
    const b = keyPairFromSeed(seed);
    expect(a.publicKey).toEqual(b.publicKey);
    expect(a.publicKey.length).toBe(PK_LEN);
    expect(a.publicKey.length).toBe(1952);
  });

  it("signs and verifies, and rejects a different message", () => {
    const { publicKey, secretKey } = keyPairFromSeed(newSeed());
    const msg = new Uint8Array(32).fill(7);
    const sig = mlDsaSign(msg, secretKey);
    expect(sig.length).toBe(SIG_LEN);
    expect(sig.length).toBe(3309);
    expect(mlDsaVerify(sig, msg, publicKey)).toBe(true);
    expect(mlDsaVerify(sig, new Uint8Array(32).fill(8), publicKey)).toBe(false);
  });
});

describe("config, args and lock field", () => {
  const w = walletFromSeed(seed);

  it("1-of-1 config is 01 01 01 + blake2b(pubkey); args = blake2b(config)", () => {
    const pkHash = ckbHash(w.keys.publicKey);
    const cfg = oneOfOneConfig(w.keys.publicKey, ckbHash);
    expect(Array.from(cfg.slice(0, 3))).toEqual([1, 1, 1]);
    expect(cfg.slice(3)).toEqual(pkHash);
    expect(lockArgs(cfg, ckbHash).length).toBe(32);
  });

  it("rejects invalid M/N and duplicate signers", () => {
    const h = ckbHash(new Uint8Array([1]));
    expect(() => buildConfig(2, [h])).toThrow();
    expect(() => buildConfig(0, [h])).toThrow();
    expect(() => buildConfig(1, [h, h])).toThrow(/duplicate/);
  });

  it("lock field has the exact length the lock expects", () => {
    const field = placeholderLockField(w.config, [
      { index: 0, publicKey: w.keys.publicKey, signature: new Uint8Array(SIG_LEN) },
    ]);
    expect(field.length).toBe(w.config.length + 1 + ENTRY_LEN);
    expect(field[w.config.length]).toBe(1); // count byte
  });

  it("enforces strictly increasing signer indexes", () => {
    const hs = [ckbHash(new Uint8Array([1])), ckbHash(new Uint8Array([2]))];
    const cfg = buildConfig(2, hs);
    const e = (index: number) => ({
      index,
      publicKey: new Uint8Array(PK_LEN),
      signature: new Uint8Array(SIG_LEN),
    });
    expect(() => buildLockField(cfg, [e(1), e(0)])).toThrow();
    expect(() => buildLockField(cfg, [e(0), e(0)])).toThrow();
    expect(() => buildLockField(cfg, [e(0), e(1)])).not.toThrow();
  });
});

describe("address derivation", () => {
  it("produces a testnet full-format address that decodes back to the same lock", async () => {
    const client = new ccc.ClientPublicTestnet();
    const w = walletFromSeed(seed);
    const addr = addressFor(w, dep, client);
    expect(addr.startsWith("ckt1")).toBe(true);
    const back = await ccc.Address.fromString(addr, client);
    expect(back.script.eq(lockScriptFor(w, dep))).toBe(true);
  });

  it("changes when the public key changes", () => {
    const client = new ccc.ClientPublicTestnet();
    const a = addressFor(walletFromSeed(seed), dep, client);
    const b = addressFor(walletFromSeed(newSeed()), dep, client);
    expect(a).not.toBe(b);
  });
});

describe("witness encoding", () => {
  it("WitnessArgs with only a lock matches the molecule layout the on-chain parser reads", () => {
    const lock = new Uint8Array(100).fill(9);
    const bytes = ccc.bytesFrom(ccc.WitnessArgs.from({ lock: ccc.hexFrom(lock) }).toBytes());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const total = 16 + 4 + lock.length;
    expect(bytes.length).toBe(total);
    expect(view.getUint32(0, true)).toBe(total); // total size
    expect(view.getUint32(4, true)).toBe(16); // offset of lock
    expect(view.getUint32(8, true)).toBe(total); // input_type empty
    expect(view.getUint32(12, true)).toBe(total); // output_type empty
    expect(view.getUint32(16, true)).toBe(lock.length); // Bytes length prefix
  });
});

describe("signing a transaction", () => {
  it("signs, passes the self-check, and keeps the signature slot size stable", () => {
    const w = walletFromSeed(seed);
    const tx = fakeTx(w);
    const sizeBefore = tx.toBytes().length;
    signPayment(tx, w);
    expect(tx.toBytes().length).toBe(sizeBefore);
    expect(() => selfCheck(tx, w)).not.toThrow();
  });

  it("works with several inputs from the same lock", () => {
    const w = walletFromSeed(seed);
    const tx = fakeTx(w, 3);
    signPayment(tx, w);
    expect(() => selfCheck(tx, w)).not.toThrow();
  });

  it("fails the self-check if an output is changed after signing", () => {
    const w = walletFromSeed(seed);
    const tx = fakeTx(w);
    signPayment(tx, w);
    tx.outputs[0].capacity += 1n;
    expect(() => selfCheck(tx, w)).toThrow();
  });

  it("fails if a witness beyond the inputs is added after signing", () => {
    const w = walletFromSeed(seed);
    const tx = fakeTx(w);
    signPayment(tx, w);
    tx.witnesses.push("0xdeadbeef");
    expect(() => selfCheck(tx, w)).toThrow();
  });

  it("fails if the signature belongs to a different wallet", () => {
    const w = walletFromSeed(seed);
    const other = walletFromSeed(newSeed());
    const tx = fakeTx(w);
    signPayment(tx, w);
    expect(() => selfCheck(tx, other)).toThrow();
  });

  it("message depends on the tx hash", () => {
    const w = walletFromSeed(seed);
    const placeholder = placeholderLockField(w.config, [
      { index: 0, publicKey: w.keys.publicKey, signature: new Uint8Array(SIG_LEN) },
    ]);
    const a = fakeTx(w);
    const b = fakeTx(w);
    b.outputs[0].capacity += 1n;
    expect(toHex(messageForTx(a, [0], placeholder))).not.toBe(toHex(messageForTx(b, [0], placeholder)));
  });
});

describe("vault", () => {
  it("round-trips the seed and rejects a wrong passphrase", async () => {
    const rec = await encryptSeed(seed, "correct horse battery staple");
    expect(await decryptSeed(rec, "correct horse battery staple")).toEqual(seed);
    await expect(decryptSeed(rec, "wrong passphrase")).rejects.toThrow();
  }, 20_000);
});

describe("deployment settings validation", () => {
  it("accepts a good config and flags bad ones", () => {
    expect(deploymentProblems(dep)).toEqual([]);
    expect(deploymentProblems({ ...dep, codeHash: "0x12" }).length).toBe(1);
    expect(deploymentProblems({ ...dep, depIndex: -1 }).length).toBe(1);
  });
});
