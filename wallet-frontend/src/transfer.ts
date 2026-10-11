import { ccc } from "@ckb-ccc/core";
import type { Deployment } from "./config";
import { mlDsaSign, mlDsaVerify } from "./crypto";
import { buildLockField, ENTRY_LEN, PK_LEN, placeholderLockField, SIG_LEN, type SignerEntry } from "./lockFormat";
import { messageForTx } from "./sighash";
import { lockScriptFor, type WalletKeys } from "./wallet";

const SHANNONS_PER_CKB = 100_000_000n;
const MAX_CELLS_SCANNED = 200;

/** 1 CKB of locked capacity per byte: 8 (capacity) + lock (33 + args) + data. */
export const minCapacity = (lock: ccc.Script, dataLen = 0): bigint =>
  BigInt(8 + lock.occupiedSize + dataLen) * SHANNONS_PER_CKB;

export interface PaymentPlan {
  tx: ccc.Transaction;
  fee: bigint;
  change: bigint;
  inputCount: number;
  sizeBytes: number;
}

const entryFor = (w: WalletKeys, signature: Uint8Array): SignerEntry => ({
  index: 0,
  publicKey: w.keys.publicKey,
  signature,
});

/** Builds an unsigned transaction (with a correctly sized placeholder witness) for a plain CKB payment. */
export async function buildPayment(
  client: ccc.Client,
  w: WalletKeys,
  dep: Deployment,
  toAddress: string,
  amount: bigint,
): Promise<PaymentPlan> {
  const lock = lockScriptFor(w, dep);
  const to = await ccc.Address.fromString(toAddress, client);

  const recipientMin = minCapacity(to.script);
  if (amount < recipientMin) {
    throw new Error(`The recipient needs at least ${ccc.fixedPointToString(recipientMin)} CKB in a cell.`);
  }
  const changeMin = minCapacity(lock);
  const feeRate = await client.getFeeRate();

  // Plain CKB cells only: no type script, no data.
  const spendable: ccc.Cell[] = [];
  for await (const cell of client.findCellsByLock(lock, null, true)) {
    if (cell.cellOutput.type || cell.outputData !== "0x") continue;
    spendable.push(cell);
    if (spendable.length >= MAX_CELLS_SCANNED) break;
  }
  spendable.sort((a, b) => (a.cellOutput.capacity > b.cellOutput.capacity ? -1 : 1));
  if (spendable.length === 0) throw new Error("This wallet has no spendable cells yet. Fund it first.");

  const placeholder = placeholderLockField(w.config, [entryFor(w, new Uint8Array(SIG_LEN))]);

  const assemble = (used: ccc.Cell[]) => {
    const tx = ccc.Transaction.from({
      outputs: [{ lock: to.script, capacity: amount }, { lock }],
      outputsData: ["0x", "0x"],
      cellDeps: [{ outPoint: { txHash: dep.depTxHash, index: dep.depIndex }, depType: "code" }],
    });
    let sum = 0n;
    for (const c of used) {
      tx.addInput({ previousOutput: c.outPoint, cellOutput: c.cellOutput, outputData: c.outputData });
      sum += c.cellOutput.capacity;
    }
    // The signature slot is zero but the length is final, so the fee estimate is exact.
    tx.setWitnessArgsAt(0, ccc.WitnessArgs.from({ lock: ccc.hexFrom(placeholder) }));
    const fee = tx.estimateFee(feeRate);
    const change = sum - amount - fee;
    tx.outputs[1].capacity = change > 0n ? change : 0n;
    return { tx, fee, change };
  };

  const used: ccc.Cell[] = [];
  for (const cell of spendable) {
    used.push(cell);
    const { tx, fee, change } = assemble(used);
    if (change >= changeMin) {
      return { tx, fee, change, inputCount: used.length, sizeBytes: tx.toBytes().length };
    }
  }
  const total = used.reduce((s, c) => s + c.cellOutput.capacity, 0n);
  throw new Error(
    `Not enough balance. You need the amount plus fee plus at least ${ccc.fixedPointToString(changeMin)} CKB of change ` +
      `(wallet holds ${ccc.fixedPointToString(total)} CKB in spendable cells).`,
  );
}

/** Signs input 0's witness; the lock only reads the first witness of the group. */
export function signPayment(tx: ccc.Transaction, w: WalletKeys): void {
  const group = tx.inputs.map((_, i) => i);
  const placeholder = placeholderLockField(w.config, [entryFor(w, new Uint8Array(SIG_LEN))]);
  const message = messageForTx(tx, group, placeholder);
  const signature = mlDsaSign(message, w.keys.secretKey);
  const lockField = buildLockField(w.config, [entryFor(w, signature)]);
  const existing = tx.getWitnessArgsAt(0);
  tx.setWitnessArgsAt(
    0,
    ccc.WitnessArgs.from({
      lock: ccc.hexFrom(lockField),
      inputType: existing?.inputType,
      outputType: existing?.outputType,
    }),
  );
}

/** Re-derives the message from the finished transaction and checks the signature, like the lock will. */
export function selfCheck(tx: ccc.Transaction, w: WalletKeys): void {
  const wa = tx.getWitnessArgsAt(0);
  if (!wa?.lock) throw new Error("Self-check: witness 0 has no lock field.");
  const lock = ccc.bytesFrom(wa.lock);
  const expectedLen = w.config.length + 1 + ENTRY_LEN;
  if (lock.length !== expectedLen) throw new Error(`Self-check: lock field is ${lock.length} bytes, expected ${expectedLen}.`);

  const sigStart = w.config.length + 1 + 1 + PK_LEN;
  const signature = lock.slice(sigStart);
  const zeroed = lock.slice();
  zeroed.fill(0, sigStart);

  const message = messageForTx(tx, tx.inputs.map((_, i) => i), zeroed);
  if (!mlDsaVerify(signature, message, w.keys.publicKey)) {
    throw new Error("Self-check failed: the signature does not verify against the transaction.");
  }
}

export const estimateCycles = (client: ccc.Client, tx: ccc.Transaction) => client.estimateCycles(tx);
export const sendSigned = (client: ccc.Client, tx: ccc.Transaction) => client.sendTransaction(tx);
export const waitForCommit = (client: ccc.Client, txHash: string) =>
  client.waitTransaction(txHash, 0, 120_000, 3_000);
