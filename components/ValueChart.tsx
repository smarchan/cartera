"use client";
import { useMemo, useState } from "react";
import { Area, ComposedChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Point } from "@/lib/portfolio";
import { addDays, rangePerformance } from "@/lib/portfolio";
import { dateEs, money, pct, tone } from "@/lib/format";

type RangeKey = "Semana" | "Mes";
const RANGES: RangeKey[] = ["Semana", "Mes"];
const DAYS: Record<RangeKey, number> = { Semana: 7, Mes: 30 };

type Row = { date: string; pnl: number; day: number; value: number };

/** Día base del periodo; "0000-00-00" si la cartera es más reciente que el periodo. */
function windowStart(key: RangeKey, today: string, first: string): string {
  const s = addDays(today, -DAYS[key]);
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
  const [range, setRange] = useState<RangeKey>("Mes");
  const first = series[0]?.date ?? today;

  /** Beneficio acumulado dentro del periodo, partiendo de 0 en el día base. */
  const { rows, perf } = useMemo(() => {
    const start = windowStart(range, today, first);
    let acc = 0;
    const rows: Row[] = [];
    for (const p of series) {
      if (p.date < start) continue;
      if (p.date > start) acc += p.dayPnl;
      rows.push({ date: p.date, pnl: acc, day: p.dayPnl, value: p.value });
    }
    return { rows, perf: rangePerformance(series, start) };
  }, [series, range, today, first]);

  const perfRows = useMemo(
    () =>
      RANGES.map((k) => ({ k, ...rangePerformance(series, windowStart(k, today, first)) })),
    [series, today, first],
  );

  const { domain, ticks, split } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const r of rows) {
      lo = Math.min(lo, r.pnl);
      hi = Math.max(hi, r.pnl);
    }
    // posición del cero dentro del degradado (0 = arriba, 1 = abajo)
    const split = hi <= 0 ? 0 : lo >= 0 ? 1 : hi / (hi - lo);
    // ejes con valores redondos que siempre incluyen el 0
    const span = hi - lo || 1;
    const raw = span / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { domain: [start, end] as [number, number], ticks, split };
  }, [rows]);

  const tickFmt = (d: string) => {
    const [, m, dd] = d.split("-");
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
        <span className={`big num ${tone(perf.pnl)}`}>{money(perf.pnl, base, { sign: true })}</span>
        <span className={`num ${tone(perf.ret)}`}>{pct(perf.ret)}</span>
        <span className="spacer" />
        <span className="muted">{range === "Semana" ? "Últimos 7 días" : "Últimos 30 días"}</span>
      </div>
      <div style={{ height: 300, padding: "8px 8px 0 0" }}>
        {rows.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="pl-line" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={split} style={{ stopColor: "var(--pos-fill)" }} />
                  <stop offset={split} style={{ stopColor: "var(--neg-fill)" }} />
                </linearGradient>
                <linearGradient id="pl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={split} style={{ stopColor: "var(--pos-fill)" }} stopOpacity={0.22} />
                  <stop offset={split} style={{ stopColor: "var(--neg-fill)" }} stopOpacity={0.22} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e1e22" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickFmt} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32} />
              <YAxis
                domain={domain}
                ticks={ticks}
                tickFormatter={(v) => money(v, base, { compact: true })}
                tick={{ fill: "#62626a", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={64}
                orientation="right"
              />
              <ReferenceLine y={0} stroke="#3a3a40" />
              <Tooltip
                cursor={{ stroke: "#3a3a40" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Row;
                  return (
                    <div className="tt">
                      <div className="tt-date">{dateEs(p.date, "long")}</div>
                      <div className="tt-row"><span>{range === "Semana" ? "Semana" : "Mes"}</span><span className={`num ${tone(p.pnl)}`}>{money(p.pnl, base, { sign: true })}</span></div>
                      <div className="tt-row"><span className="muted">Día</span><span className={`num ${tone(p.day)}`}>{money(p.day, base, { sign: true })}</span></div>
                      <div className="tt-row"><span className="muted">Valor cartera</span><span className="num muted">{money(p.value, base)}</span></div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="pnl"
                stroke="url(#pl-line)"
                strokeWidth={2}
                fill="url(#pl-fill)"
                baseValue={0}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4, fill: "#f2f2f3", stroke: "#111113", strokeWidth: 2 }}
              />
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
          <div key={r.k}>
            <div className="k">{r.k}</div>
            <div className={`v num ${tone(r.pnl)}`}>{money(r.pnl, base, { sign: true })}</div>
            <div className={`s num ${tone(r.ret)}`}>{pct(r.ret)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
