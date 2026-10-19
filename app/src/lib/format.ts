/** Display helpers shared by server and client components. */

export function shortHex(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Credits are units of 0.01 ha-year. */
export function unitsToHaYears(units: number): number {
  return units / 100;
}

export function formatNumber(locale: string, value: number, digits = 0): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatDate(locale: string, unixSeconds: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Africa/Porto-Novo" }).format(new Date(unixSeconds * 1000));
}

export function formatMonth(locale: string, month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat(locale, { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Payment token amount (6 decimals) as a currency-like string. */
/** Real USDC only on Base mainnet (8453); everywhere else it is the test token tUSDC. */
const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_CHAIN_ID === "8453" ? "USDC" : "tUSDC";

export function formatToken(locale: string, baseUnits: string | bigint, symbol = TOKEN_SYMBOL): string {
  const value = Number(BigInt(baseUnits)) / 1e6;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${symbol}`;
}
