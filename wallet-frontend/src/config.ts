export type HashType = "type" | "data" | "data1" | "data2";

export interface Deployment {
  codeHash: string;
  hashType: HashType;
  depTxHash: string;
  depIndex: number;
}

const env = import.meta.env;
const STORE_KEY = "lithium.deployment";

export const RPC_URL: string | undefined = env.VITE_RPC_URL || undefined;
export const explorerTxUrl = (hash: string) =>
  `https://testnet.explorer.nervos.org/transaction/${hash}`;

export const envDeployment = (): Deployment => ({
  codeHash: env.VITE_LOCK_CODE_HASH ?? "",
  hashType: (env.VITE_LOCK_HASH_TYPE as HashType) ?? "data1",
  depTxHash: env.VITE_DEP_TX_HASH ?? "",
  depIndex: Number(env.VITE_DEP_INDEX ?? 0),
});

/** Settings saved in the browser win over .env values. */
export function loadDeployment(): Deployment {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...envDeployment(), ...JSON.parse(raw) };
  } catch {
    /* fall through to env */
  }
  return envDeployment();
}

export function saveDeployment(d: Deployment): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(d));
}

const HASH32 = /^0x[0-9a-fA-F]{64}$/;

export function deploymentProblems(d: Deployment): string[] {
  const out: string[] = [];
  if (!HASH32.test(d.codeHash)) out.push("Code hash must be 0x followed by 64 hex characters.");
  if (!HASH32.test(d.depTxHash)) out.push("Deployment tx hash must be 0x followed by 64 hex characters.");
  if (!Number.isInteger(d.depIndex) || d.depIndex < 0) out.push("Deployment index must be a whole number.");
  if (!["type", "data", "data1", "data2"].includes(d.hashType)) out.push("Hash type is not valid.");
  return out;
}
