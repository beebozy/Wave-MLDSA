import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { formatCkb, type DeploymentStatus } from "./chain";
import type { CkbPrice } from "./prices";
import { usd } from "./prices";
import type { TokenHolding } from "./tokens";
import { Icon, Row, Switch } from "./ui";

const HIDDEN = "••••";
const EXPLORER = "https://testnet.explorer.nervos.org";

export type Go = (view: "send" | "receive" | "scan" | "backup" | "deployment") => void;

/** 199799.9962067 -> "199,799.9962": thousands separators, at most 4 decimals. */
const fmtQty = (shannons: bigint): string => {
  const [i, f = ""] = formatCkb(shannons).split(".");
  const frac = f.slice(0, 4).replace(/0+$/, "");
  return `${BigInt(i).toLocaleString("en-US")}${frac ? "." + frac : ""}`;
};

function AssetRow({ color, glyph, name, sub, value, qty }: { color: string; glyph: string; name: string; sub: React.ReactNode; value: string; qty: string }) {
  return (
    <div className="as">
      <div className="ic" style={{ background: color }}>{glyph}</div>
      <div><div className="n">{name}</div><div className="s">{sub}</div></div>
      <div className="r"><div className="n">{value}</div><div className="s">{qty}</div></div>
    </div>
  );
}

export function Home({ address, balance, price, tokens, hide, error, onGo }: {
  address: string | null; balance: bigint | null; price: CkbPrice | null; tokens: TokenHolding[]; hide: boolean; error: string | null; onGo: Go;
}) {
  const ckb = balance === null ? null : Number(formatCkb(balance));
  const value = ckb !== null && price ? ckb * price.usd : null;
  const mask = (s: string) => (hide ? HIDDEN : s);
  return (
    <>
      <header className="hd between">
        <div className="who"><div className="ic sm">A1</div><div><div className="n">Account 1</div><div className="s mono">{address ? `${address.slice(0, 8)}…${address.slice(-4)}` : "No deployment set"}</div></div></div>
        <span className="badge">Testnet</span>
      </header>
      <section className="total">
        <div className="s">Total value</div>
        <div className="big">{value === null ? "—" : mask(usd(value))}</div>
        {price && <div className={price.change24h >= 0 ? "up" : "dn"}>{price.change24h >= 0 ? "+" : ""}{price.change24h.toFixed(1)}% CKB today</div>}
        {error && <p className="error">{error}</p>}
      </section>
      <div className="actions">
        <button className="act" onClick={() => onGo("send")} disabled={!address}><span className="disc"><Icon name="send" /></span>Send</button>
        <button className="act" onClick={() => onGo("receive")} disabled={!address}><span className="disc"><Icon name="receive" /></span>Receive</button>
      <button className="act" onClick={() => onGo("scan")} disabled={!address}><span className="disc"><Icon name="scan" /></span>Scan</button>
      </div>
      <div className="sheet">
        <div className="n head">Assets</div>
        <AssetRow color="#08755A" glyph="C" name="CKB" sub={price ? <>{usd(price.usd)} <span className={price.change24h >= 0 ? "up" : "dn"}>{price.change24h >= 0 ? "+" : ""}{price.change24h.toFixed(1)}%</span></> : "Price unavailable"} value={ckb !== null && price ? mask(usd(ckb * price.usd)) : "—"} qty={balance === null ? "…" : mask(`${fmtQty(balance)} CKB`)} />
        {tokens.map((t) => (
          <AssetRow key={t.id} color="#5B6B70" glyph="?" name="Unknown token" sub={`${t.id.slice(0, 10)}…`} value="—" qty={mask(`${t.amount.toLocaleString("en-US")} units`)} />
        ))}
      </div>
      <p className="foot">Testnet coins have no real value. Dollar values use the mainnet CKB price as a preview.{tokens.length > 0 && " Token names and prices need a token list, so tokens show their ID for now."}</p>
    </>
  );
}

export function Receive({ address }: { address: string }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toString(address, { type: "svg", margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [address]);
  return (
    <div className="pad center">
      <p className="s">Send only CKB and CKB tokens to this address.</p>
      {qr && <div className="qr" role="img" aria-label="QR code of your address" dangerouslySetInnerHTML={{ __html: qr }} />}
      <pre className="block mono">{address}</pre>
      <button onClick={async () => { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy address"}</button>
      <p className="s">Each cell needs at least 73 CKB. Testnet only.</p>
    </div>
  );
}

export function Activity({ address }: { address: string | null }) {
  return (
    <>
      <header className="hd"><h1 className="lg">Activity</h1></header>
      <div className="pad">
        <p className="s">A list of your transfers is coming. Until then, the explorer shows every transaction for this account.</p>
        {address && <a className="linkbtn" href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">Open in explorer</a>}
      </div>
    </>
  );
}

export function SettingsScreen({ hide, onHide, depStatus, onGo, onLock }: {
  hide: boolean; onHide: (v: boolean) => void; depStatus: DeploymentStatus | null; onGo: Go; onLock: () => void;
}) {
  return (
    <>
      <header className="hd"><h1 className="lg">Settings</h1></header>
      <div className="group">
        <div className="gh">Security</div>
        <Row label="Recovery seed" value="Show" onClick={() => onGo("backup")} />
        <Row label="Lock wallet now" value="" onClick={onLock} />
        <div className="gh">Privacy</div>
        <Row label="Hide balances"><Switch on={hide} label="Hide balances" onChange={onHide} /></Row>
        <div className="gh">Network</div>
        <Row label="Network" value="Testnet" />
        <Row label="Lock deployment" value={depStatus ? (depStatus.state === "ok" ? "Verified" : "Needs attention") : "Not set"} tone={depStatus?.state === "ok" ? "up" : "dn"} onClick={() => onGo("deployment")} />
        <div className="gh">About</div>
        <Row label="Version" value="0.2.0" />
      </div>
    </>
  );
}
