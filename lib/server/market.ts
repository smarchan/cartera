import "server-only";
import YahooFinance from "yahoo-finance2";
import type { Quote, Series, SearchResult } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const MOCK = process.env.PRICE_SOURCE === "mock";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], versionCheck: false });
const NO_VALIDATE = { validateResult: false } as const;

/* Small in-memory TTL cache (lives while the serverless instance is warm) */
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* Some exchanges quote in minor units (LSE pence, JSE cents, TASE agorot) */
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100],
  GBX: ["GBP", 100],
  ZAc: ["ZAR", 100],
  ILA: ["ILS", 100],
};
function normCurrency(ccy: string | undefined): { currency: string; div: number } {
  if (!ccy) return { currency: "USD", div: 1 };
  const m = MINOR_UNITS[ccy];
  return m ? { currency: m[0], div: m[1] } : { currency: ccy.toUpperCase(), div: 1 };
}

function isoDay(d: Date, gmtOffsetSec = 0): string {
  return new Date(d.getTime() + gmtOffsetSec * 1000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote | { error: string }>> {
  if (MOCK) return Object.fromEntries(symbols.map((s) => [s, mockQuote(s)]));

  const out: Record<string, Quote | { error: string }> = {};
  let rows: any[] = [];
  try {
    rows = (await yf.quote(symbols, { return: "array" }, NO_VALIDATE)) as any[];
  } catch {
    rows = [];
  }
  for (const r of rows) {
    if (!r?.symbol || typeof r.regularMarketPrice !== "number") continue;
    const { currency, div } = normCurrency(r.currency);
    const price = r.regularMarketPrice / div;
    const prevClose = (r.regularMarketPreviousClose ?? r.regularMarketPrice) / div;
    out[r.symbol] = {
      symbol: r.symbol,
      name: r.longName || r.shortName || r.symbol,
      currency,
      price,
      prevClose,
      change: price - prevClose,
      changePct: prevClose ? (price / prevClose - 1) * 100 : 0,
      marketState: r.marketState ?? "CLOSED",
      type: r.quoteType ?? "EQUITY",
      exchange: r.fullExchangeName || r.exchange || "",
      time: r.regularMarketTime ? new Date(r.regularMarketTime).getTime() : Date.now(),
    };
  }
  // Fallback through the chart endpoint for anything the quote endpoint missed
  const missing = symbols.filter((s) => !out[s]);
  await Promise.all(
    missing.map(async (s) => {
      try {
        const c: any = await yf.chart(s, { period1: new Date(Date.now() - 10 * 864e5), interval: "1d" }, NO_VALIDATE);
        const m = c.meta;
        const { currency, div } = normCurrency(m.currency);
        const price = m.regularMarketPrice / div;
        const prevClose = (m.chartPreviousClose ?? m.previousClose ?? m.regularMarketPrice) / div;
        out[s] = {
          symbol: s,
          name: m.longName || m.shortName || s,
          currency,
          price,
          prevClose,
          change: price - prevClose,
          changePct: prevClose ? (price / prevClose - 1) * 100 : 0,
          marketState: "CLOSED",
          type: m.instrumentType ?? "EQUITY",
          exchange: m.fullExchangeName || m.exchangeName || "",
          time: m.regularMarketTime ? new Date(m.regularMarketTime).getTime() : Date.now(),
        };
      } catch (e) {
        out[s] = { error: `No se encontró ${s}` };
      }
    }),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Daily history                                                       */
/* ------------------------------------------------------------------ */

export async function getHistory(symbol: string, from: string): Promise<{ currency: string; points: Series }> {
  if (MOCK) return mockHistory(symbol, from);
  return cached(`h:${symbol}:${from}`, 6 * 3600e3, async () => {
    const c: any = await yf.chart(symbol, { period1: from, interval: "1d" }, NO_VALIDATE);
    const { currency, div } = normCurrency(c.meta?.currency);
    const off = c.meta?.gmtoffset ?? 0;
    const byDay = new Map<string, number>();
    for (const q of c.quotes ?? []) {
      if (q?.close == null || !q.date) continue;
      byDay.set(isoDay(new Date(q.date), off), q.close / div);
    }
    const points = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) as Series;
    return { currency, points };
  });
}

/* ------------------------------------------------------------------ */
/* FX history (Yahoo first, ECB reference rates via Frankfurter second) */
/* ------------------------------------------------------------------ */

export async function getFxHistory(ccy: string, base: string, from: string): Promise<{ points: Series; source: string }> {
  if (MOCK) return { points: mockFxHistory(ccy, base, from), source: "mock" };
  return cached(`fx:${ccy}:${base}:${from}`, 6 * 3600e3, async () => {
    try {
      const h = await getHistory(`${ccy}${base}=X`, from);
      if (h.points.length > 0) return { points: h.points, source: "Yahoo" };
    } catch {
      /* fall through */
    }
    const res = await fetch(`https://api.frankfurter.dev/v1/${from}..?base=${ccy}&symbols=${base}`, {
      next: { revalidate: 21600 },
    });
    if (!res.ok) throw new Error(`FX ${ccy}/${base} no disponible`);
    const j = (await res.json()) as { rates: Record<string, Record<string, number>> };
    const points = Object.entries(j.rates)
      .map(([d, r]) => [d, r[base]] as [string, number])
      .filter(([, v]) => typeof v === "number")
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return { points, source: "BCE" };
  });
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  EQUITY: "Acción",
  ETF: "ETF",
  MUTUALFUND: "Fondo",
  CRYPTOCURRENCY: "Cripto",
  CURRENCY: "Divisa",
  INDEX: "Índice",
  FUTURE: "Futuro",
};

export async function search(q: string): Promise<SearchResult[]> {
  if (MOCK) return mockSearch(q);
  return cached(`s:${q.toLowerCase()}`, 3600e3, async () => {
    const r: any = await yf.search(q, { quotesCount: 8, newsCount: 0 }, NO_VALIDATE);
    return (r.quotes ?? [])
      .filter((x: any) => x.isYahooFinance && x.symbol)
      .map((x: any) => ({
        symbol: x.symbol,
        name: x.longname || x.shortname || x.symbol,
        exchange: x.exchDisp || x.exchange || "",
        type: TYPE_LABEL[x.quoteType] ?? x.typeDisp ?? x.quoteType ?? "",
      }));
  });
}

/* ------------------------------------------------------------------ */
/* Intraday / range charts                                             */
/* ------------------------------------------------------------------ */

const RANGE_CFG = {
  "1d": { days: 6, interval: "5m", ttl: 60e3 },
  "5d": { days: 9, interval: "15m", ttl: 5 * 60e3 },
  "1mo": { days: 32, interval: "60m", ttl: 30 * 60e3 },
  "1y": { days: 370, interval: "1d", ttl: 3600e3 },
  "5y": { days: 1830, interval: "1wk", ttl: 6 * 3600e3 },
} as const;
export type ChartRange = keyof typeof RANGE_CFG;
export const CHART_RANGES = Object.keys(RANGE_CFG) as ChartRange[];

export interface ChartData {
  currency: string;
  /** reference price: previous session close for 1d, first point otherwise */
  prevClose: number;
  /** [epoch ms, price] */
  points: [number, number][];
}

/** Keeps the last `n` trading days of an intraday series (days in the exchange's time zone). */
function lastDays(points: [number, number][], n: number, offSec: number): { kept: [number, number][]; before?: number } {
  const day = (t: number) => new Date(t + offSec * 1000).toISOString().slice(0, 10);
  const days = [...new Set(points.map(([t]) => day(t)))];
  const keep = new Set(days.slice(-n));
  const kept = points.filter(([t]) => keep.has(day(t)));
  const firstKept = kept[0]?.[0];
  const prior = points.filter(([t]) => firstKept != null && t < firstKept);
  return { kept, before: prior[prior.length - 1]?.[1] };
}

export async function getChart(symbol: string, range: ChartRange): Promise<ChartData> {
  if (MOCK) return mockChart(symbol, range);
  const cfg = RANGE_CFG[range];
  return cached(`c:${symbol}:${range}`, cfg.ttl, async () => {
    const c: any = await yf.chart(
      symbol,
      { period1: new Date(Date.now() - cfg.days * 864e5), interval: cfg.interval as any },
      NO_VALIDATE,
    );
    const { currency, div } = normCurrency(c.meta?.currency);
    const off = c.meta?.gmtoffset ?? 0;
    const all: [number, number][] = (c.quotes ?? [])
      .filter((q: any) => q?.close != null && q.date)
      .map((q: any) => [new Date(q.date).getTime(), q.close / div]);
    if (range === "1d" || range === "5d") {
      const { kept, before } = lastDays(all, range === "1d" ? 1 : 5, off);
      const prev = before ?? (c.meta?.chartPreviousClose != null ? c.meta.chartPreviousClose / div : kept[0]?.[1] ?? 0);
      return { currency, prevClose: prev, points: kept };
    }
    return { currency, prevClose: all[0]?.[1] ?? 0, points: all };
  });
}

/* ------------------------------------------------------------------ */
/* Mock data (PRICE_SOURCE=mock) for local development without network */
/* ------------------------------------------------------------------ */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(seed: number): number {
  const u = Math.max(rand(seed), 1e-9);
  const v = rand(seed ^ 0x9e3779b9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const MOCK_START = Date.UTC(2019, 0, 1);
function isCrypto(s: string) {
  return /^(BTC|ETH|SOL|ADA|XRP|DOGE)-/.test(s);
}
function mockCurrency(s: string): string {
  if (/=X$/.test(s)) return s.slice(3, 6);
  if (/-EUR$|\.(MC|DE|PA|AS|MI|BR|LS|F)$/.test(s)) return "EUR";
  if (/\.L$/.test(s)) return "GBP";
  if (/\.SW$/.test(s)) return "CHF";
  if (/\.T$/.test(s)) return "JPY";
  return "USD";
}
const KNOWN: Record<string, [string, number]> = {
  AAPL: ["Apple Inc.", 150],
  MSFT: ["Microsoft Corporation", 260],
  NVDA: ["NVIDIA Corporation", 40],
  "IWDA.AS": ["iShares Core MSCI World UCITS ETF", 70],
  "SAN.MC": ["Banco Santander, S.A.", 3.2],
  "ITX.MC": ["Industria de Diseño Textil, S.A.", 28],
  "BTC-EUR": ["Bitcoin EUR", 30000],
  "ETH-EUR": ["Ethereum EUR", 1800],
  "VUSA.L": ["Vanguard S&P 500 UCITS ETF", 65],
};
function mockPath(symbol: string, to: number): Map<string, number> {
  const seed = hash(symbol);
  const [, base] = KNOWN[symbol] ?? ["", 20 + (seed % 400)];
  const vol = isCrypto(symbol) ? 0.032 : 0.014;
  const drift = 0.00045;
  const out = new Map<string, number>();
  let logp = Math.log(base);
  for (let t = MOCK_START, i = 0; t <= to; t += 864e5, i++) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (!isCrypto(symbol) && (wd === 0 || wd === 6)) continue;
    logp += drift + vol * gauss(seed + i * 7919);
    out.set(d.toISOString().slice(0, 10), Math.exp(logp));
  }
  return out;
}
function mockHistory(symbol: string, from: string) {
  if (/=X$/.test(symbol)) return { currency: symbol.slice(3, 6), points: mockFxHistory(symbol.slice(0, 3), symbol.slice(3, 6), from) };
  const path = mockPath(symbol, Date.now());
  return { currency: mockCurrency(symbol), points: [...path.entries()].filter(([d]) => d >= from) as Series };
}
function mockQuote(symbol: string): Quote | { error: string } {
  if (symbol.startsWith("ZZZ")) return { error: `No se encontró ${symbol}` };
  let pts: Series;
  let currency: string;
  if (/=X$/.test(symbol)) {
    pts = mockFxHistory(symbol.slice(0, 3), symbol.slice(3, 6), new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10));
    currency = symbol.slice(3, 6);
  } else {
    pts = [...mockPath(symbol, Date.now()).entries()].slice(-2) as Series;
    currency = mockCurrency(symbol);
  }
  const last = pts[pts.length - 1][1];
  const prev = pts[pts.length - 2]?.[1] ?? last;
  const minute = Math.floor(Date.now() / 60000);
  const price = last * (1 + 0.002 * gauss(hash(symbol) + minute));
  return {
    symbol,
    name: KNOWN[symbol]?.[0] ?? symbol,
    currency,
    price,
    prevClose: prev,
    change: price - prev,
    changePct: (price / prev - 1) * 100,
    marketState: "REGULAR",
    type: /=X$/.test(symbol) ? "CURRENCY" : isCrypto(symbol) ? "CRYPTOCURRENCY" : /IWDA|VUSA/.test(symbol) ? "ETF" : "EQUITY",
    exchange: "Simulado",
    time: Date.now(),
  };
}
const EUR_PER: Record<string, number> = { EUR: 1, USD: 0.9, GBP: 1.16, CHF: 0.98, JPY: 0.0068 };
function mockFxHistory(ccy: string, base: string, from: string): Series {
  const a = mockFxPath(ccy);
  const b = mockFxPath(base);
  const out: Series = [];
  for (const [d, v] of a) if (d >= from) out.push([d, v / (b.get(d) ?? 1)]);
  return out;
}
function mockFxPath(ccy: string): Map<string, number> {
  const out = new Map<string, number>();
  if (ccy === "EUR") {
    for (let t = MOCK_START; t <= Date.now(); t += 864e5) out.set(new Date(t).toISOString().slice(0, 10), 1);
    return out;
  }
  let logp = Math.log(EUR_PER[ccy] ?? 0.5);
  const seed = hash("fx" + ccy);
  for (let t = MOCK_START, i = 0; t <= Date.now(); t += 864e5, i++) {
    logp += 0.004 * gauss(seed + i * 104729) - 0.00002;
    out.set(new Date(t).toISOString().slice(0, 10), Math.exp(logp));
  }
  return out;
}
function mockSearch(q: string): SearchResult[] {
  const ql = q.toLowerCase();
  return Object.entries(KNOWN)
    .filter(([s, [n]]) => s.toLowerCase().includes(ql) || n.toLowerCase().includes(ql))
    .map(([s, [n]]) => ({ symbol: s, name: n, exchange: "Simulado", type: isCrypto(s) ? "Cripto" : "Acción" }));
}

function mockChart(symbol: string, range: ChartRange): ChartData {
  const q = mockQuote(symbol);
  const price = "error" in q ? 100 : q.price;
  const prev = "error" in q ? 100 : q.prevClose;
  const cfg = { "1d": [78, 5], "5d": [130, 15], "1mo": [160, 280], "1y": [252, 1440], "5y": [260, 10080] }[range];
  const [n, stepMin] = cfg;
  const seed = hash(symbol + range);
  const pts: [number, number][] = [];
  const vol = range === "1d" ? 0.0015 : range === "5d" ? 0.003 : 0.012;
  let lp = Math.log(range === "1d" ? prev : price * 0.8);
  const target = Math.log(price);
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    lp += (target - lp) / (n - i) + vol * gauss(seed + i * 31);
    pts.push([now - (n - 1 - i) * stepMin * 60e3, Math.exp(lp)]);
  }
  pts[pts.length - 1][1] = price;
  return { currency: mockCurrency(symbol), prevClose: range === "1d" ? prev : pts[0][1], points: pts };
}
