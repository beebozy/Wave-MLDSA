import { useState } from "react";
import { toHex } from "./crypto";
import { decryptSeed, loadVault } from "./vault";

/** Shows the recovery seed only after the passphrase is entered again. */
export function RevealSeed() {
  const [pass, setPass] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reveal(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const rec = loadVault();
      if (!rec) throw new Error("no vault");
      setSeed(toHex(await decryptSeed(rec, pass)).slice(2));
    } catch {
      setError("That passphrase did not unlock the wallet.");
    }
  }

  return (
    <div className="pad">
      <div className="wn">Anyone with this seed can spend your funds. Write it down on paper. Never screenshot it, email it or share it.</div>
      {seed ? (
        <>
          <div className="seed mono">{seed.match(/.{8}/g)!.map((g, i) => <span key={i}>{g}</span>)}</div>
          <button onClick={() => setSeed(null)}>Hide seed</button>
        </>
      ) : (
        <form onSubmit={reveal}>
          <label>Passphrase<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></label>
          {error && <p className="error">{error}</p>}
          <button>Show seed</button>
        </form>
      )}
    </div>
  );
}
