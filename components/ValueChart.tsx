"use client";
import { useMemo, useState } from "react";
import { Area, ComposedChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Point } from "@/lib/portfolio";
import { addDays, rangePerformance } from "@/lib/portfolio";
import { dateEs, money, pct, tone } from "@/lib/format";

type RangeKey = "1S" | "1M" | "3M" | "YTD" | "1A" | "3A" | "Todo";
const RANGES: RangeKey[] = ["1M", "3M", "YTD", "1A", "3A", "Todo"];

export function rangeStart(key: RangeKey, today: string, first: string): string {
  const y = today.slice(0, 4);
  const s =
    key === "1S" ? addDays(today, -7)
    : key === "1M" ? addDays(today, -30)
    : key === "3M" ? addDays(today, -91)
    : key === "YTD" ? `${+y - 1}-12-31`
    : key === "1A" ? addDays(today, -365)
    : key === "3A" ? addDays(today, -1095)
    : "0000-00-00";
  return s < first ? "0000-00-00" : s;
}

export default function ValueChart({
  series,
  base,
  today,
  dayChange,
  dayChangePct,
}: {
  series: Point[];
  base: string;
  today: string;
  dayChange: number;
  dayChangePct: number;
}) {
  const [range, setRange] = useState<RangeKey>("1A");
  const first = series[0]?.date ?? today;

  const { data, perf } = useMemo(() => {
    const start = rangeStart(range, today, first);
    const data = series.filter((p) => p.date >= start);
    return { data, perf: rangePerformance(series, start === "0000-00-00" ? "0000-00-00" : start) };
  }, [series, range, today, first]);

  const perfRows = useMemo(
    () =>
      (["1S", "1M", "3M", "YTD", "1A", "Todo"] as RangeKey[]).map((k) => {
        const st = rangeStart(k, today, first);
        return { k, ...rangePerformance(series, st), partial: st === "0000-00-00" && k !== "Todo" };
      }),
    [series, today, first],
  );

  const last = data[data.length - 1];
  const domain = useMemo(() => {
    if (!data.length) return [0, 1];
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data) {
      lo = Math.min(lo, p.value, p.cost);
      hi = Math.max(hi, p.value, p.cost);
    }
    const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
    return [Math.max(0, lo - pad), hi + pad];
  }, [data]);

  const tickFmt = (d: string) => {
    const span = data.length;
    const [yy, m, dd] = d.split("-");
    if (span > 400) return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+m - 1]} ${yy.slice(2)}`;
    return `${+dd}/${+m}`;
  };

  return (
    <section className="panel" aria-label="Evolución de la cartera">
      <div className="panel-h">
        <span className="panel-t">Evolución</span>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-head">
        <span className="big num">{last ? money(last.value, base) : "—"}</span>
        <span className={`num ${tone(perf.pnl)}`}>{money(perf.pnl, base, { sign: true })}</span>
        <span className={`num ${tone(perf.ret)}`}>{pct(perf.ret)} TWR</span>
        <span className="spacer" />
        <span className="legend-inline">
          <span><i style={{ borderTopColor: "#3987e5" }} />Valor</span>
          <span><i className="dash" />Coste</span>
        </span>
      </div>
      <div style={{ height: 300, padding: "8px 8px 0 0" }}>
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3987e5" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#3987e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e1e22" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={48} />
              <YAxis
                domain={domain as [number, number]}
                tickFormatter={(v) => money(v, base, { compact: true })}
                tick={{ fill: "#62626a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
                orientation="right"
              />
              <Tooltip
                cursor={{ stroke: "#3a3a40" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Point;
                  return (
                    <div className="tt">
                      <div className="tt-date">{dateEs(p.date, "long")}</div>
                      <div className="tt-row"><span>Valor</span><span className="num">{money(p.value, base)}</span></div>
                      <div className="tt-row"><span className="muted">Coste</span><span className="num muted">{money(p.cost, base)}</span></div>
                      <div className="tt-row"><span className="muted">Beneficio acum.</span><span className={`num ${tone(p.pnl)}`}>{money(p.pnl, base, { sign: true })}</span></div>
                      <div className="tt-row"><span className="muted">Día</span><span className={`num ${tone(p.dayPnl)}`}>{money(p.dayPnl, base, { sign: true })}</span></div>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#3987e5" strokeWidth={2} fill="url(#gv)" isAnimationActive={false} dot={false} activeDot={{ r: 4, fill: "#3987e5", stroke: "#111113", strokeWidth: 2 }} />
              <Line type="stepAfter" dataKey="cost" stroke="#7a7a82" strokeWidth={1.2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">Añade operaciones para ver la evolución.</div>
        )}
      </div>
      <div className="ranges">
        <div>
          <div className="k">Hoy</div>
          <div className={`v num ${tone(dayChange)}`}>{money(dayChange, base, { sign: true })}</div>
          <div className={`s num ${tone(dayChangePct)}`}>{pct(dayChangePct)}</div>
        </div>
        {perfRows.map((r) => (
          <div key={r.k} title={r.partial ? "La cartera es más reciente que este periodo" : undefined}>
            <div className="k">{r.k}</div>
            <div className={`v num ${tone(r.pnl)}`}>{money(r.pnl, base, { sign: true })}</div>
            <div className={`s num ${tone(r.ret)}`}>{pct(r.ret)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
