import { ccc } from "@ckb-ccc/core";

export interface TokenHolding {
  id: string; // type script hash
  amount: bigint; // raw units; decimals and names are not on-chain for sUDT
  cells: number;
}

/** Groups this lock's cells that carry a type script. sUDT/xUDT keep a little-endian u128 amount in the first 16 data bytes. */
export async function scanTokens(client: ccc.Client, lock: ccc.Script): Promise<TokenHolding[]> {
  const found = new Map<string, TokenHolding>();
  let scanned = 0;
  for await (const cell of client.findCellsByLock(lock, null, true)) {
    if (++scanned > 300) break;
    const type = cell.cellOutput.type;
    const data = ccc.bytesFrom(cell.outputData);
    if (!type || data.length < 16) continue;
    let amount = 0n;
    for (let i = 15; i >= 0; i--) amount = (amount << 8n) | BigInt(data[i]);
    const id = type.hash();
    const prev = found.get(id);
    found.set(id, { id, amount: (prev?.amount ?? 0n) + amount, cells: (prev?.cells ?? 0) + 1 });
  }
  return [...found.values()];
}
