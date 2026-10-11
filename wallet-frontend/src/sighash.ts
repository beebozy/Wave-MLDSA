import { ccc } from "@ckb-ccc/core";
import { ckbHash } from "./crypto";
import { signingMessage } from "./lockFormat";

/**
 * Builds the message the lock verifies, from a transaction.
 * `groupIndexes` are the input indexes that share this lock (all of them, for this wallet).
 * `placeholderLock` is the lock field with every signature slot zeroed.
 */
export function messageForTx(
  tx: ccc.Transaction,
  groupIndexes: number[],
  placeholderLock: Uint8Array,
): Uint8Array {
  const existing = tx.getWitnessArgsAt(groupIndexes[0]);
  const first = ccc.WitnessArgs.from({
    lock: ccc.hexFrom(placeholderLock),
    inputType: existing?.inputType,
    outputType: existing?.outputType,
  }).toBytes();

  const witnesses = tx.witnesses.map((w) => ccc.bytesFrom(w));

  // Same rule as the on-chain loop: stop at the first group witness that does not exist.
  const otherGroupWitnesses: Uint8Array[] = [];
  for (const i of groupIndexes.slice(1)) {
    if (i >= witnesses.length) break;
    otherGroupWitnesses.push(witnesses[i]);
  }

  return signingMessage(
    {
      txHash: ccc.bytesFrom(tx.hash()),
      firstWitnessWithPlaceholder: ccc.bytesFrom(first),
      otherGroupWitnesses,
      extraWitnesses: witnesses.slice(tx.inputs.length),
    },
    ckbHash,
  );
}
