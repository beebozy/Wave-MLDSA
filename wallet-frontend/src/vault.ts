// Encrypts the 32-byte seed with a passphrase (PBKDF2-SHA256 -> AES-256-GCM) using WebCrypto.
export interface VaultRecord {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const ITERATIONS = 600_000;
const enc = new TextEncoder();

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const buf = (b: Uint8Array) => b as unknown as BufferSource;

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", buf(enc.encode(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations: iter, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSeed(seed: Uint8Array, passphrase: string): Promise<VaultRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(seed)));
  return { v: 1, iter: ITERATIONS, salt: hex(salt), iv: hex(iv), ct: hex(ct) };
}

/** Throws if the passphrase is wrong (AES-GCM authentication fails). */
export async function decryptSeed(rec: VaultRecord, passphrase: string): Promise<Uint8Array> {
  const key = await deriveKey(passphrase, unhex(rec.salt), rec.iter);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(unhex(rec.iv)) }, key, buf(unhex(rec.ct)));
  return new Uint8Array(pt);
}

const KEY = "lithium.vault";
export const loadVault = (): VaultRecord | null => {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as VaultRecord) : null;
};
export const saveVault = (r: VaultRecord) => localStorage.setItem(KEY, JSON.stringify(r));
export const clearVault = () => localStorage.removeItem(KEY);
