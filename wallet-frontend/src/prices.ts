export interface CkbPrice {
  usd: number;
  change24h: number;
}

/** Mainnet CKB price from CoinGecko. Returns null when offline or rate-limited. */
export async function fetchCkbPrice(): Promise<CkbPrice | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=nervos-network&vs_currencies=usd&include_24hr_change=true",
    );
    if (!res.ok) return null;
    const d = (await res.json())["nervos-network"];
    return d ? { usd: d.usd, change24h: d.usd_24h_change ?? 0 } : null;
  } catch {
    return null;
  }
}

export const usd = (n: number): string =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
