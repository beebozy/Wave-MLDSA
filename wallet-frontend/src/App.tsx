import { useCallback, useEffect, useMemo, useState } from "react";
import { Create, SeedBackup, Unlock } from "./Auth";
import { checkDeployment, getBalance, makeClient, type DeploymentStatus } from "./chain";
import { RPC_URL, deploymentProblems, loadDeployment, saveDeployment, type Deployment } from "./config";
import { DeploymentForm } from "./DeploymentForm";
import { explainError } from "./errors";
import { fetchCkbPrice, type CkbPrice } from "./prices";
import { RevealSeed } from "./RevealSeed";
import { Scan } from "./Scan";
import { Activity, Home, Receive, SettingsScreen } from "./Screens";
import { Send } from "./Send";
import { scanTokens, type TokenHolding } from "./tokens";
import { ScreenHeader, TabBar, type Tab } from "./ui";
import { clearVault, loadVault } from "./vault";
import { addressFor, lockScriptFor, type WalletKeys } from "./wallet";

export default function App() {
  const [wallet, setWallet] = useState<WalletKeys | null>(null);
  const [hasVault, setHasVault] = useState<boolean>(() => loadVault() !== null);
  const [backupSeed, setBackupSeed] = useState<string | null>(null);
  const [dep, setDep] = useState<Deployment>(() => loadDeployment());
  const client = useMemo(() => makeClient(RPC_URL), []);

  if (backupSeed && wallet) return <SeedBackup seed={backupSeed} onDone={() => setBackupSeed(null)} />;
  if (!wallet) {
    return hasVault ? (
      <Unlock onUnlocked={setWallet} onForget={() => { clearVault(); setHasVault(false); }} />
    ) : (
      <Create onCreated={(w, seedHex) => { setHasVault(true); setWallet(w); setBackupSeed(seedHex); }} />
    );
  }
  return <Shell wallet={wallet} dep={dep} setDep={setDep} client={client} onLock={() => setWallet(null)} />;
}

type View = Tab | "send" | "receive" | "scan" | "backup" | "deployment";

function Shell({ wallet, dep, setDep, client, onLock }: {
  wallet: WalletKeys; dep: Deployment; setDep: (d: Deployment) => void; client: ReturnType<typeof makeClient>; onLock: () => void;
}) {
  const problems = deploymentProblems(dep);
  const ready = problems.length === 0;
  const [view, setView] = useState<View>(ready ? "home" : "deployment");
  const [hide, setHide] = useState(() => localStorage.getItem("lithium.hide") === "1");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [tokens, setTokens] = useState<TokenHolding[]>([]);
  const [price, setPrice] = useState<CkbPrice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depStatus, setDepStatus] = useState<DeploymentStatus | null>(null);
  const [scanned, setScanned] = useState("");

  const lock = useMemo(() => (ready ? lockScriptFor(wallet, dep) : null), [ready, wallet, dep]);
  const address = useMemo(() => (lock ? addressFor(wallet, dep, client) : null), [lock, wallet, dep, client]);

  const refresh = useCallback(async () => {
    if (!lock) return;
    try {
      const [b, t] = await Promise.all([getBalance(client, lock), scanTokens(client, lock)]);
      setBalance(b);
      setTokens(t);
      setError(null);
    } catch (e) {
      setError(explainError(e));
    }
  }, [client, lock]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let live = true;
    const load = () => fetchCkbPrice().then((p) => live && p && setPrice(p));
    load();
    const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!ready) return setDepStatus(null);
    let live = true;
    checkDeployment(client, dep)
      .then((s) => live && setDepStatus(s))
      .catch((e) => live && setDepStatus({ state: "unverified", detail: explainError(e) }));
    return () => { live = false; };
  }, [client, dep, ready]);

  const setHidden = (v: boolean) => { localStorage.setItem("lithium.hide", v ? "1" : "0"); setHide(v); };
  const go = (v: View) => { if (v === "send") setScanned(""); setView(v); };
  const tabView = view === "home" || view === "activity" || view === "settings";

  return (
    <div className="app">
      {view === "home" && <Home address={address} balance={balance} price={price} tokens={tokens} hide={hide} error={error} onGo={go} />}
      {view === "activity" && <Activity address={address} />}
      {view === "settings" && <SettingsScreen hide={hide} onHide={setHidden} depStatus={depStatus} onGo={go} onLock={onLock} />}
      {view === "send" && (<><ScreenHeader title="Send" onBack={() => setView("home")} /><div className="pad plain"><Send key={scanned} wallet={wallet} dep={dep} client={client} onSent={refresh} price={price?.usd ?? null} initialTo={scanned} /></div></>)}
      {view === "receive" && address && (<><ScreenHeader title="Receive" onBack={() => setView("home")} /><Receive address={address} /></>)}
      {view === "scan" && (<><ScreenHeader title="Scan address" onBack={() => setView("home")} /><Scan client={client} onAddress={(a) => { setScanned(a); setView("send"); }} /></>)}
      {view === "backup" && (<><ScreenHeader title="Recovery seed" onBack={() => setView("settings")} /><RevealSeed /></>)}
      {view === "deployment" && (
        <>
          <ScreenHeader title="Lock deployment" onBack={() => setView(ready ? "settings" : "deployment")} />
          <div className="pad">
            {depStatus && <p className={`status ${depStatus.state}`}>{depStatus.detail}</p>}
            <DeploymentForm dep={dep} onSave={(d) => { saveDeployment(d); setDep(d); }} problems={problems} />
          </div>
        </>
      )}
      {tabView && <TabBar tab={view} onTab={setView} />}
    </div>
  );
}
