import { ccc } from "@ckb-ccc/core";
import type { Deployment } from "./config";
import { ckbHash, toHex } from "./crypto";

export function makeClient(rpcUrl?: string): ccc.Client {
  return rpcUrl ? new ccc.ClientPublicTestnet({ url: rpcUrl }) : new ccc.ClientPublicTestnet();
}

export const getBalance = (client: ccc.Client, lock: ccc.Script): Promise<bigint> =>
  client.getBalance([lock]);

export const formatCkb = (shannons: bigint): string => ccc.fixedPointToString(shannons);
export const parseCkb = (text: string): bigint => ccc.fixedPointFrom(text.trim());

export type DeploymentStatus =
  | { state: "ok"; detail: string }
  | { state: "missing"; detail: string }
  | { state: "mismatch"; detail: string }
  | { state: "unverified"; detail: string };

/** Confirms the deployment cell exists and (for data hash types) that its data hashes to code_hash. */
export async function checkDeployment(client: ccc.Client, dep: Deployment): Promise<DeploymentStatus> {
  const cell = await client.getCellLive({ txHash: dep.depTxHash, index: dep.depIndex }, true);
  if (!cell) {
    return { state: "missing", detail: "No live cell at that tx hash and index on this network." };
  }
  if (dep.hashType === "type") {
    return { state: "unverified", detail: "Cell found. Type hash types cannot be checked from the data alone." };
  }
  const actual = toHex(ckbHash(ccc.bytesFrom(cell.outputData)));
  if (actual.toLowerCase() !== dep.codeHash.toLowerCase()) {
    return { state: "mismatch", detail: `The cell's data hashes to ${actual}, not your code hash.` };
  }
  return { state: "ok", detail: `Cell found, ${ccc.bytesFrom(cell.outputData).length} bytes of code, hash matches.` };
}
