import { useEffect, useRef, useState } from "react";
import { ccc } from "@ckb-ccc/core";
import jsQR from "jsqr";

/** Accepts a plain address or a ckb: style link and returns the address if it is valid, else null. */
async function parseAddress(client: ccc.Client, text: string): Promise<string | null> {
  const candidate = text.trim().replace(/^ckb:/i, "").split("?")[0];
  try {
    await ccc.Address.fromString(candidate, client);
    return candidate;
  } catch {
    return null;
  }
}

export function Scan({ client, onAddress }: { client: ccc.Client; onAddress: (address: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let stream: MediaStream | null = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current;
        if (!v || stopped) return;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          if (ctx && v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code) {
              const address = await parseAddress(client, code.data);
              if (address) return onAddress(address);
              setError("That QR code is not a CKB address.");
            }
          }
          timer = setTimeout(tick, 200);
        };
        tick();
      } catch {
        setError("The camera is not available. Allow camera access (this needs https or localhost), or paste the address below.");
      }
    }
    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [client, onAddress]);

  async function usePasted(e: React.FormEvent) {
    e.preventDefault();
    const address = await parseAddress(client, pasted);
    if (address) onAddress(address);
    else setError("That is not a valid CKB address.");
  }

  return (
    <div className="pad">
      <div className="cam"><video ref={video} muted playsInline aria-label="Camera preview" /></div>
      <p className="s">Point the camera at a CKB address QR code.</p>
      {error && <p className="error">{error}</p>}
      <form onSubmit={usePasted}>
        <label>Or paste an address<input className="mono" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="ckt1…" /></label>
        <button>Use this address</button>
      </form>
    </div>
  );
}
