import type { Series, Transaction } from "./types";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface LivePrice {
  price: number;
  prevClose: number;
}

export interface MarketInput {
  base: string;
  /** YYYY-MM-DD (local) */
  today: string;
  /** symbol → quote currency */
  assetCcy: Record<string, string>;
  /** symbol → daily closes in quote currency */
  prices: Record<string, Series>;
  /** symbol → live quote */
  live: Record<string, LivePrice>;
  /** currency → daily rate (1 ccy = x base) */
  fx: Record<string, Series>;
  /** currency → live rate (1 ccy = x base) */
  liveFx: Record<string, LivePrice>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Value at the last date <= `date`; first value if `date` precedes the series. */
export function valueAt(series: Series | undefined, date: string): number | undefined {
  if (!series || series.length === 0) return undefined;
  let lo = 0;
  let hi = series.length - 1;
  if (date < series[0][0]) return series[0][1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (series[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return series[lo][1];
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function sortTx(txs: Transaction[]): Transaction[] {
  return txs
    .map((t, i) => [t, i] as const)
    .sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]))
    .map(([t]) => t);
}

const EPS = 1e-9;

export class Market {
  readonly warnings = new Set<string>();
  private lastTxPrice: Record<string, number> = {};
  readonly m: MarketInput;
  constructor(m: MarketInput) {
    this.m = m;
  }

  ccyOf(symbol: string, fallback: string): string {
    return this.m.assetCcy[symbol] ?? fallback;
  }

  /** 1 ccy = x base, at `date` */
  fxAt(ccy: string, date: string): number {
    if (ccy === this.m.base) return 1;
    const live = this.m.liveFx[ccy];
    if (date >= this.m.today && live) return live.price;
    const v = valueAt(this.m.fx[ccy], date) ?? live?.price;
    if (v == null || !isFinite(v)) {
      this.warnings.add(`Falta el tipo de cambio ${ccy}/${this.m.base}; se usa 1.`);
      return 1;
    }
    return v;
  }

  rememberTxPrice(symbol: string, priceAsset: number) {
    this.lastTxPrice[symbol] = priceAsset;
  }

  /** Close (or live price for today) in quote currency */
  priceAt(symbol: string, date: string): number {
    const live = this.m.live[symbol];
    if (date >= this.m.today && live) return live.price;
    const v = valueAt(this.m.prices[symbol], date) ?? live?.price ?? this.lastTxPrice[symbol];
    if (v == null) {
      this.warnings.add(`Sin precio para ${symbol}.`);
      return 0;
    }
    return v;
  }

  /** Trade currency → base, honouring a manual rate if it was given for this base */
  txToBase(tx: Transaction): number {
    if (tx.currency === this.m.base) return 1;
    if (tx.fx && tx.fx > 0 && tx.fxBase === this.m.base) return tx.fx;
    return this.fxAt(tx.currency, tx.date);
  }

  /** Trade currency → asset quote currency */
  txToAsset(tx: Transaction): number {
    const a = this.ccyOf(tx.symbol, tx.currency);
    if (tx.currency === a) return 1;
    return this.txToBase(tx) / this.fxAt(a, tx.date);
  }
}

/* ------------------------------------------------------------------ */
/* Positions                                                           */
/* ------------------------------------------------------------------ */

export interface Position {
  symbol: string;
  name?: string;
  currency: string;
  quantity: number;
  /** average cost per unit in quote currency (fees included) */
  avgCost: number;
  /** average cost per unit in base currency (fees included) */
  avgCostBase: number;
  costBase: number;
  price: number;
  prevClose: number;
  changePct: number;
  value: number;
  weight: number;
  dayChange: number;
  dayChangePct: number;
  unrealized: number;
  unrealizedPct: number;
  priceEffect: number;
  fxEffect: number;
  realized: number;
  feesBase: number;
  boughtBase: number;
  soldQty: number;
  /** average sale price per unit in quote currency */
  avgSellPrice: number;
  firstDate: string;
  lastDate: string;
  txCount: number;
}

export interface Summary {
  value: number;
  costBasis: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  totalPnl: number;
  totalPnlPct: number;
  /** cost of everything ever bought (base) */
  invested: number;
  dayChange: number;
  dayChangePct: number;
  fees: number;
  fxEffect: number;
}

export function computePositions(txs: Transaction[], mk: Market): { open: Position[]; closed: Position[]; summary: Summary } {
  const { today } = mk.m;
  const map = new Map<string, Position & { _qtyPrev: number; _buysToday: number; _sellsToday: number; _sellAsset: number }>();

  for (const tx of sortTx(txs)) {
    const ccy = mk.ccyOf(tx.symbol, tx.currency);
    let p = map.get(tx.symbol);
    if (!p) {
      p = {
        symbol: tx.symbol, name: tx.name, currency: ccy, quantity: 0, avgCost: 0, avgCostBase: 0, costBase: 0,
        price: 0, prevClose: 0, changePct: 0, value: 0, weight: 0, dayChange: 0, dayChangePct: 0,
        unrealized: 0, unrealizedPct: 0, priceEffect: 0, fxEffect: 0, realized: 0, feesBase: 0, boughtBase: 0,
        soldQty: 0, avgSellPrice: 0, firstDate: tx.date, lastDate: tx.date, txCount: 0,
        _qtyPrev: 0, _buysToday: 0, _sellsToday: 0, _sellAsset: 0,
      };
      map.set(tx.symbol, p);
    }
    if (tx.name) p.name = tx.name;
    p.lastDate = tx.date;
    p.txCount++;
    const rB = mk.txToBase(tx);
    const rA = mk.txToAsset(tx);
    mk.rememberTxPrice(tx.symbol, tx.price * rA);
    const fees = tx.fees || 0;
    p.feesBase += fees * rB;
    // avgCost holds the total cost in quote currency until the end of the loop
    if (tx.type === "buy") {
      const costTrade = tx.quantity * tx.price + fees;
      p.quantity += tx.quantity;
      p.costBase += costTrade * rB;
      p.avgCost += costTrade * rA;
      p.boughtBase += costTrade * rB;
      if (tx.date >= today) p._buysToday += costTrade * rB;
    } else {
      let q = tx.quantity;
      if (q > p.quantity + EPS) {
        mk.warnings.add(`Venta de ${tx.symbol} el ${tx.date} supera las unidades que tenías; se ajusta a ${+p.quantity.toFixed(8)}.`);
        q = p.quantity;
      }
      if (q <= EPS) continue;
      const proceedsTrade = q * tx.price - fees * (q / tx.quantity);
      const unitBase = p.costBase / p.quantity;
      const unitAsset = p.avgCost / p.quantity;
      p.realized += proceedsTrade * rB - unitBase * q;
      p.costBase -= unitBase * q;
      p.avgCost -= unitAsset * q;
      p.quantity -= q;
      p.soldQty += q;
      p._sellAsset += q * tx.price * rA;
      if (tx.date >= today) p._sellsToday += proceedsTrade * rB;
      if (p.quantity < EPS) {
        p.quantity = 0;
        p.costBase = 0;
        p.avgCost = 0;
      }
    }
    if (tx.date < today) p._qtyPrev = p.quantity;
  }

  const open: Position[] = [];
  const closed: Position[] = [];
  const s: Summary = {
    value: 0, costBasis: 0, unrealized: 0, unrealizedPct: 0, realized: 0, totalPnl: 0, totalPnlPct: 0,
    invested: 0, dayChange: 0, dayChangePct: 0, fees: 0, fxEffect: 0,
  };
  let dayBase = 0;

  for (const p of map.values()) {
    const live = mk.m.live[p.symbol];
    const fxNow = mk.fxAt(p.currency, today);
    const liveFx = mk.m.liveFx[p.currency];
    const fxPrev = p.currency === mk.m.base ? 1 : liveFx?.prevClose ?? mk.fxAt(p.currency, addDays(today, -1));
    p.price = mk.priceAt(p.symbol, today);
    p.prevClose = live?.prevClose ?? mk.priceAt(p.symbol, addDays(today, -1));
    p.changePct = p.prevClose ? (p.price / p.prevClose - 1) * 100 : 0;
    const totalCostAsset = p.avgCost;
    p.avgCost = p.quantity > 0 ? totalCostAsset / p.quantity : 0;
    p.avgCostBase = p.quantity > 0 ? p.costBase / p.quantity : 0;
    p.avgSellPrice = p.soldQty > 0 ? p._sellAsset / p.soldQty : 0;
    p.value = p.quantity * p.price * fxNow;
    p.unrealized = p.value - p.costBase;
    p.unrealizedPct = p.costBase > 0 ? (p.unrealized / p.costBase) * 100 : 0;
    p.priceEffect = (p.quantity * p.price - totalCostAsset) * fxNow;
    p.fxEffect = p.unrealized - p.priceEffect;
    const prevValue = p._qtyPrev * p.prevClose * fxPrev;
    p.dayChange = p.value - prevValue - p._buysToday + p._sellsToday;
    const dayDenom = prevValue + p._buysToday;
    p.dayChangePct = dayDenom > 0 ? (p.dayChange / dayDenom) * 100 : 0;
    dayBase += dayDenom;

    s.realized += p.realized;
    s.invested += p.boughtBase;
    s.fees += p.feesBase;
    s.dayChange += p.dayChange;
    if (p.quantity > 0) {
      s.value += p.value;
      s.costBasis += p.costBase;
      s.unrealized += p.unrealized;
      s.fxEffect += p.fxEffect;
    }
    const { _qtyPrev, _buysToday, _sellsToday, _sellAsset, ...clean } = p;
    (p.quantity > 0 ? open : closed).push(clean);
  }
  for (const p of open) p.weight = s.value > 0 ? (p.value / s.value) * 100 : 0;
  open.sort((a, b) => b.value - a.value);
  closed.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
  s.unrealizedPct = s.costBasis > 0 ? (s.unrealized / s.costBasis) * 100 : 0;
  s.totalPnl = s.unrealized + s.realized;
  s.totalPnlPct = s.invested > 0 ? (s.totalPnl / s.invested) * 100 : 0;
  s.dayChangePct = dayBase > 0 ? (s.dayChange / dayBase) * 100 : 0;
  return { open, closed, summary: s };
}

/* ------------------------------------------------------------------ */
/* Daily series                                                        */
/* ------------------------------------------------------------------ */

export interface Point {
  date: string;
  /** market value (base) */
  value: number;
  /** cost basis of units held (base) */
  cost: number;
  /** cumulative net money in (buys − sale proceeds) */
  contributed: number;
  /** cumulative P/L = value − contributed */
  pnl: number;
  dayPnl: number;
  dayRet: number;
}

export function computeSeries(txs: Transaction[], mk: Market): Point[] {
  if (txs.length === 0) return [];
  const sorted = sortTx(txs);
  const byDate = new Map<string, Transaction[]>();
  for (const t of sorted) {
    const arr = byDate.get(t.date) ?? [];
    arr.push(t);
    byDate.set(t.date, arr);
  }
  const qty: Record<string, number> = {};
  const cost: Record<string, number> = {};
  const txCcy: Record<string, string> = {};
  for (const t of sorted) txCcy[t.symbol] ??= t.currency;
  const out: Point[] = [];
  let contributed = 0;
  let prevValue = 0;
  const end = mk.m.today;

  for (let d = sorted[0].date; d <= end; d = addDays(d, 1)) {
    let buys = 0;
    let sells = 0;
    for (const tx of byDate.get(d) ?? []) {
      const rB = mk.txToBase(tx);
      mk.rememberTxPrice(tx.symbol, tx.price * mk.txToAsset(tx));
      const held = qty[tx.symbol] ?? 0;
      if (tx.type === "buy") {
        const c = (tx.quantity * tx.price + (tx.fees || 0)) * rB;
        buys += c;
        qty[tx.symbol] = held + tx.quantity;
        cost[tx.symbol] = (cost[tx.symbol] ?? 0) + c;
      } else {
        const q = Math.min(tx.quantity, held);
        if (q <= EPS) continue;
        sells += (q * tx.price - (tx.fees || 0) * (q / tx.quantity)) * rB;
        cost[tx.symbol] = (cost[tx.symbol] ?? 0) * (1 - q / held);
        qty[tx.symbol] = held - q;
      }
    }
    let value = 0;
    let costSum = 0;
    for (const sym in qty) {
      if (qty[sym] <= EPS) continue;
      value += qty[sym] * mk.priceAt(sym, d) * mk.fxAt(mk.ccyOf(sym, txCcy[sym]), d);
      costSum += cost[sym];
    }
    contributed += buys - sells;
    const denom = prevValue + buys;
    const dayPnl = value - prevValue - buys + sells;
    const dayRet = denom > EPS ? (value + sells) / denom - 1 : 0;
    out.push({ date: d, value, cost: costSum, contributed, pnl: value - contributed, dayPnl, dayRet });
    prevValue = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Aggregations                                                        */
/* ------------------------------------------------------------------ */

export type Granularity = "day" | "month" | "year";

export interface PeriodRow {
  key: string;
  pnl: number;
  /** time-weighted return, % */
  ret: number;
}

export function groupPnl(series: Point[], g: Granularity): PeriodRow[] {
  const len = g === "day" ? 10 : g === "month" ? 7 : 4;
  const rows: PeriodRow[] = [];
  let cur: { key: string; pnl: number; growth: number } | null = null;
  for (const p of series) {
    const key = p.date.slice(0, len);
    if (!cur || cur.key !== key) {
      if (cur) rows.push({ key: cur.key, pnl: cur.pnl, ret: (cur.growth - 1) * 100 });
      cur = { key, pnl: 0, growth: 1 };
    }
    cur.pnl += p.dayPnl;
    cur.growth *= 1 + p.dayRet;
  }
  if (cur) rows.push({ key: cur.key, pnl: cur.pnl, ret: (cur.growth - 1) * 100 });
  return rows;
}

/** P/L and TWR for dates strictly after `fromExclusive` */
export function rangePerformance(series: Point[], fromExclusive: string): { pnl: number; ret: number } {
  let pnl = 0;
  let growth = 1;
  for (const p of series) {
    if (p.date <= fromExclusive) continue;
    pnl += p.dayPnl;
    growth *= 1 + p.dayRet;
  }
  return { pnl, ret: (growth - 1) * 100 };
}
