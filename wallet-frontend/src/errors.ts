// Exit codes of the lock script (dillithium-lock-multisig). Adjust if your deployed build differs.
export const LOCK_ERRORS: Record<number, string> = {
  1: "A syscall failed while the lock was loading data.",
  2: "The lock args are not 32 bytes.",
  3: "The witness is malformed (wrong length or count).",
  4: "The config version is not supported.",
  5: "The config is invalid (M and N out of range).",
  6: "The config in the witness does not hash to the lock args.",
  7: "A signer index is outside the config.",
  8: "Signer indexes are not strictly increasing.",
  9: "A public key does not match the config entry.",
  10: "A public key could not be decoded.",
  11: "A signature has the wrong length.",
  12: "A signature did not verify.",
};

export function explainError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = /error code (\d+)/i.exec(msg)?.[1];
  if (code && LOCK_ERRORS[Number(code)]) {
    return `The lock rejected this transaction (code ${code}): ${LOCK_ERRORS[Number(code)]}`;
  }
  return msg;
}
