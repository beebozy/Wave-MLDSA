import { useState } from "react";
import type { Deployment, HashType } from "./config";

export function DeploymentForm({ dep, onSave, problems }: { dep: Deployment; onSave: (d: Deployment) => void; problems: string[] }) {
  const [draft, setDraft] = useState<Deployment>(dep);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...draft, codeHash: draft.codeHash.trim(), depTxHash: draft.depTxHash.trim() });
      }}
    >
      <label>
        Lock code hash
        <input className="mono" value={draft.codeHash} onChange={(e) => setDraft({ ...draft, codeHash: e.target.value })} />
      </label>
      <label>
        Hash type
        <select value={draft.hashType} onChange={(e) => setDraft({ ...draft, hashType: e.target.value as HashType })}>
          <option value="data1">data1</option>
          <option value="type">type</option>
          <option value="data">data</option>
          <option value="data2">data2</option>
        </select>
      </label>
      <label>
        Deployment transaction hash
        <input className="mono" value={draft.depTxHash} onChange={(e) => setDraft({ ...draft, depTxHash: e.target.value })} />
      </label>
      <label>
        Deployment cell index
        <input type="number" min={0} value={draft.depIndex} onChange={(e) => setDraft({ ...draft, depIndex: Number(e.target.value) })} />
      </label>
      {problems.map((p) => (
        <p key={p} className="error">
          {p}
        </p>
      ))}
      <button>Save settings</button>
    </form>
  );
}
