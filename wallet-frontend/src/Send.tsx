import { useState } from "react";
import { formatCkb, makeClient, parseCkb } from "./chain";
import { explorerTxUrl, type Deployment } from "./config";
import { explainError } from "./errors";
import { usd } from "./prices";
import { buildPayment, estimateCycles, selfCheck, sendSigned, signPayment, waitForCommit, type PaymentPlan } from "./transfer";
import type { WalletKeys } from "./wallet";

interface Review {
  plan: PaymentPlan;
  cycles?: bigint;
  cycleError?: string;
}

export function Send({
  wallet,
  dep,
  client,
  onSent,
  price,
}: {
  wallet: WalletKeys;
  dep: Deployment;
  client: ReturnType<typeof makeClient>;
  onSent: () => void;
  price: number | null;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTxHash(null);
    setProgress(null);
    setReview(null);
    setBusy(true);
    try {
      const plan = await buildPayment(client, wallet, dep, to.trim(), parseCkb(amount));
      signPayment(plan.tx, wallet);
      selfCheck(plan.tx, wallet);
      try {
        setReview({ plan, cycles: await estimateCycles(client, plan.tx) });
      } catch (err) {
        setReview({ plan, cycleError: explainError(err) });
      }
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await sendSigned(client, review.plan.tx);
      setTxHash(hash);
      setReview(null);
      setProgress("Submitted. Waiting for confirmation…");
      const res = await waitForCommit(client, hash);
      setProgress(res?.status === "committed" ? "Confirmed on chain." : "Not confirmed yet. Check the explorer.");
      onSent();
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <form onSubmit={prepare}>
        <label>
          Recipient address
          <input className="mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ckt1…" required />
        </label>
        <label>
          Amount (CKB)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="100" required />
        </label>
        {price !== null && Number(amount) > 0 && <p className="note">≈ {usd(Number(amount) * price)}</p>}
        <button disabled={busy}>{busy && !review ? "Preparing…" : "Review payment"}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {review && (
        <div className="review">
          <dl>
            <dt>Fee</dt>
            <dd>{formatCkb(review.plan.fee)} CKB</dd>
            <dt>Change back to you</dt>
            <dd>{formatCkb(review.plan.change)} CKB</dd>
            <dt>Inputs</dt>
            <dd>{review.plan.inputCount}</dd>
            <dt>Transaction size</dt>
            <dd>{(review.plan.sizeBytes / 1024).toFixed(1)} KB</dd>
            <dt>Verification cost</dt>
            <dd>{review.cycles !== undefined ? `${review.cycles.toLocaleString()} cycles` : "not available"}</dd>
          </dl>
          {review.cycleError && <p className="error">{review.cycleError}</p>}
          <p className="note">Signed in your browser and checked locally before sending.</p>
          <div className="row">
            <button onClick={send} disabled={busy || !!review.cycleError}>
              {busy ? "Sending…" : "Send payment"}
            </button>
            <button className="link" onClick={() => setReview(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {txHash && (
        <div className="review">
          <p>{progress}</p>
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="mono small">
            {txHash}
          </a>
        </div>
      )}
    </section>
  );
}
