import { useState } from "react";
import { fromHex, toHex } from "./crypto";
import { explainError } from "./errors";
import { decryptSeed, encryptSeed, loadVault, saveVault } from "./vault";
import { createWallet, walletFromSeed, type WalletKeys } from "./wallet";

export function Create({ onCreated }: { onCreated: (w: WalletKeys, seedHex: string) => void }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [restore, setRestore] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pass.length < 8) return setError("Use a passphrase of at least 8 characters.");
    if (pass !== confirm) return setError("The two passphrases do not match.");
    setBusy(true);
    try {
      let w: WalletKeys;
      if (restore) {
        const seed = fromHex(seedInput.trim());
        if (seed.length !== 32) throw new Error("A seed is 32 bytes (64 hex characters).");
        w = walletFromSeed(seed);
      } else {
        w = createWallet();
      }
      saveVault(await encryptSeed(w.seed, pass));
      onCreated(w, toHex(w.seed));
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>Lithium</h1>
      <p className="lede">A CKB wallet secured by ML-DSA-65. {restore ? "Restore it from your seed." : "Create one to begin."}</p>
      <form onSubmit={submit}>
        {restore && (
          <label>
            Seed (64 hex characters)
            <input className="mono" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} autoComplete="off" />
          </label>
        )}
        <label>
          Passphrase
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        </label>
        <label>
          Repeat passphrase
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button disabled={busy}>{busy ? "Working…" : restore ? "Restore wallet" : "Create wallet"}</button>
          <button type="button" className="link" onClick={() => setRestore(!restore)}>
            {restore ? "Create a new one instead" : "Restore from a seed"}
          </button>
        </div>
      </form>
      <p className="note">
        The passphrase encrypts your seed in this browser. It cannot be recovered, so keep the seed as your backup.
      </p>
    </main>
  );
}

export function Unlock({ onUnlocked, onForget }: { onUnlocked: (w: WalletKeys) => void; onForget: () => void }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const rec = loadVault();
      if (!rec) throw new Error("No wallet found in this browser.");
      onUnlocked(walletFromSeed(await decryptSeed(rec, pass)));
    } catch {
      setError("That passphrase did not unlock the wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <h1>Lithium</h1>
      <p className="lede">Enter your passphrase to unlock.</p>
      <form onSubmit={submit}>
        <label>
          Passphrase
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button disabled={busy}>{busy ? "Unlocking…" : "Unlock"}</button>
          <button
            type="button"
            className="link danger"
            onClick={() => {
              if (window.confirm("Remove this wallet from the browser? Only your saved seed can bring it back.")) onForget();
            }}
          >
            Remove wallet
          </button>
        </div>
      </form>
    </main>
  );
}

export function SeedBackup({ seed, onDone }: { seed: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <main className="narrow">
      <h1>Save your seed</h1>
      <p className="lede">This is the only way to restore the wallet if this browser is cleared. Anyone who has it can spend your funds.</p>
      <pre className="block mono">{seed}</pre>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved the seed somewhere safe
      </label>
      <button disabled={!saved} onClick={onDone}>
        Open wallet
      </button>
    </main>
  );
}
