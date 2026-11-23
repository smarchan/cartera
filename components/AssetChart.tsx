"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, ComposedChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { pct, price as fmtPrice, qty as fmtQty, tone } from "@/lib/format";

export type ChartRange = "1d" | "5d" | "1mo" | "1y" | "5y";
const RANGES: { k: ChartRange; label: string; days: number }[] = [
  { k: "1d", label: "1D", days: 1 },
  { k: "5d", label: "5D", days: 7 },
  { k: "1mo", label: "1M", days: 31 },
  { k: "1y", label: "1A", days: 365 },
  { k: "5y", label: "5A", days: 1825 },
];

export interface ChartMarker {
  date: string;
  type: "buy" | "sell";
  /** price in the asset's quote currency, when known */
  price?: number;
  quantity: number;
  highlight?: boolean;
}

interface ChartData {
  currency: string;
  prevClose: number;
  points: [number, number][];
}

/** Smallest range that still contains `date` (for opening an operation in context). */
export function rangeFor(date: string): ChartRange {
  const days = (Date.now() - new Date(date + "T12:00:00Z").getTime()) / 864e5;
  return RANGES.find((r) => days <= r.days)?.k ?? "5y";
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function AssetChart({
  symbol,
  currency,
  live,
  markers = [],
  refLine,
  defaultRange = "1d",
  colorPnl,
}: {
  symbol: string;
  currency: string;
  live?: number;
  markers?: ChartMarker[];
  refLine?: { value: number; label: string };
  defaultRange?: ChartRange;
  colorPnl: boolean;
}) {
  const [range, setRange] = useState<ChartRange>(defaultRange);
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Sin datos");
          return j as ChartData;
        })
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
    setData(null);
    load();
    const id = range === "1d" ? setInterval(() => document.visibilityState === "visible" && load(), 60_000) : undefined;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [symbol, range]);

  const series = useMemo(() => {
    if (!data) return [];
    const pts = data.points.map(([t, v]) => ({ t, v }));
    // the live quote extends the intraday line between refreshes
    if (live != null && range === "1d" && pts.length) pts.push({ t: Math.max(Date.now(), pts[pts.length - 1].t + 1), v: live });
    return pts;
  }, [data, live, range]);

  const first = series[0]?.v;
  const last = series[series.length - 1]?.v;
  const ref = range === "1d" ? data?.prevClose || first : first;
  const change = last != null && ref ? last - ref : 0;
  const changePct = ref ? (change / ref) * 100 : 0;
  const up = change >= 0;
  const stroke = colorPnl ? (up ? "#6cc495" : "#e07c7c") : "#3987e5";
  const gradId = `ac-${symbol.replace(/[^a-z0-9]/gi, "")}-${range}`;

  // operations inside the visible window, snapped to the nearest point
  const dots = useMemo(() => {
    if (series.length < 2) return [];
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    return markers
      .map((m) => {
        const t = new Date(m.date + "T15:00:00Z").getTime();
        if (t < t0 - 864e5 || t > t1 + 864e5) return null;
        let best = series[0];
        for (const p of series) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
        return { ...m, x: best.t, y: m.price ?? best.v };
      })
      .filter(Boolean) as (ChartMarker & { x: number; y: number })[];
  }, [markers, series]);

  const domain = useMemo(() => {
    if (!series.length) return [0, 1];
    const vals = series.map((p) => p.v).concat(dots.map((d) => d.y));
    // on intraday views the average cost would flatten the day's curve: only show it if it is in range
    if (refLine && refLine.value > 0 && range !== "1d" && range !== "5d") vals.push(refLine.value);
    if (range === "1d" && ref) vals.push(ref);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
    return [lo - pad, hi + pad];
  }, [series, dots, refLine, range, ref]);

  const tick = (t: number) => {
    const d = new Date(t);
    if (range === "1d") return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    if (range === "5d") return d.toLocaleDateString("es-ES", { weekday: "short" });
    if (range === "1mo") return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  };

  return (
    <div className="asset-chart">
      <div className="asset-chart-head">
        <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{last != null ? fmtPrice(last, currency) : "—"}</span>
        <span className={`num ${tone(change)}`}>{pct(changePct)}</span>
        <span className="muted" style={{ fontSize: 12 }}>{RANGES.find((r) => r.k === range)?.label === "1D" ? "hoy" : `en ${RANGES.find((r) => r.k === range)?.label}`}</span>
        <span className="spacer" />
        <div className="seg" role="group" aria-label={`Periodo de ${symbol}`}>
          {RANGES.map((r) => (
            <button key={r.k} type="button" aria-pressed={range === r.k} onClick={(e) => { e.stopPropagation(); setRange(r.k); }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 220 }}>
        {error ? (
          <div className="empty-state">{error}</div>
        ) : !data ? (
          <div className="skeleton" style={{ height: "100%" }} />
        ) : series.length < 2 ? (
          <div className="empty-state">Sin cotizaciones en este periodo.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e1e22" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis domain={domain as [number, number]} tickFormatter={(v) => fmtPrice(v, currency)} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} width={78} orientation="right" />
              {range === "1d" && ref ? <ReferenceLine y={ref} stroke="#3a3a40" strokeDasharray="3 3" /> : null}
              {refLine && refLine.value > domain[0] && refLine.value < domain[1] && (
                <ReferenceLine y={refLine.value} stroke="#9b9ba3" strokeDasharray="5 4" label={{ value: refLine.label, position: "insideTopLeft", fill: "#9b9ba3", fontSize: 11 }} />
              )}
              <Tooltip
                cursor={{ stroke: "#3a3a40" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { t: number; v: number };
                  const d = new Date(p.t);
                  return (
                    <div className="tt">
                      <div className="tt-date">
                        {range === "1d" || range === "5d"
                          ? d.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                          : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      <div className="tt-row"><span>Precio</span><span className="num">{fmtPrice(p.v, currency)}</span></div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: stroke, stroke: "#111113", strokeWidth: 2 }} />
              {dots.map((d, i) => (
                <ReferenceDot
                  key={i}
                  x={d.x}
                  y={d.y}
                  r={d.highlight ? 7 : 5}
                  fill={d.type === "buy" ? "#3987e5" : "#d95926"}
                  stroke="#111113"
                  strokeWidth={2}
                  label={{ value: d.type === "buy" ? "C" : "V", position: "top", fill: "#f2f2f3", fontSize: 10, fontWeight: 700 }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      {dots.length > 0 && (
        <div className="asset-chart-legend">
          <span><i style={{ background: "#3987e5" }} />Compra</span>
          <span><i style={{ background: "#d95926" }} />Venta</span>
          {dots.filter((d) => d.highlight).map((d, i) => (
            <span key={i} className="muted">
              {d.type === "buy" ? "Compraste" : "Vendiste"} {fmtQty(d.quantity)} {d.price != null ? `a ${fmtPrice(d.price, currency)}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
