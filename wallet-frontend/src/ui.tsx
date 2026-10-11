import type { ReactNode } from "react";

const paths = {
  send: <path d="M7 17 17 7M9 7h8v8" />,
  receive: <path d="M17 7 7 17M15 17H7V9" />,
  back: <path d="M15 5l-7 7 7 7" />,
  scan: <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  assets: (<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M16 12.5h2M3 9V8a2 2 0 0 1 2-2h11" /></>),
  activity: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  settings: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
};
export type IconName = keyof typeof paths;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="hd">
      <button className="ib" aria-label="Back" onClick={onBack}><Icon name="back" /></button>
      <h1>{title}</h1>
    </header>
  );
}

export type Tab = "home" | "activity" | "settings";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Assets", icon: "assets" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <button key={t.id} className={`tab${t.id === tab ? " on" : ""}`} aria-current={t.id === tab ? "page" : undefined} onClick={() => onTab(t.id)}>
          <Icon name={t.icon} />{t.label}
        </button>
      ))}
    </nav>
  );
}

export function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button className={`sw${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><i /></button>
  );
}

export function Row({ label, value, tone, onClick, children }: { label: string; value?: string; tone?: "up" | "dn"; onClick?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <span>{label}</span>
      {value !== undefined && <span className={`v ${tone ?? ""}`}>{value}{onClick && <Icon name="chevron" size={16} />}</span>}
      {children}
    </>
  );
  return onClick ? <button className="ls" onClick={onClick}>{body}</button> : <div className="ls">{body}</div>;
}
