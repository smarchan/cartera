"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Granularity, Point } from "@/lib/portfolio";
import { groupPnl } from "@/lib/portfolio";
import { MONTHS, money, pct, periodLabel, tone } from "@/lib/format";
import { PALETTE } from "./ui";

const LIMIT: Record<Granularity, number> = { day: 30, month: 24, year: 50 };

export default function PeriodPnl({ series, base, colorPnl }: { series: Point[]; base: string; colorPnl: boolean }) {
  const [g, setG] = useState<Granularity>("month");
  const pal = colorPnl ? PALETTE.color : PALETTE.mono;

  const all = useMemo(() => groupPnl(series, g), [series, g]);
  const rows = useMemo(() => {
    const r = g === "day" ? all.filter((x) => Math.abs(x.pnl) >= 0.005) : all;
    return r.slice(-LIMIT[g]);
  }, [all, g]);

  const monthGrid = useMemo(() => {
    if (g !== "month") return null;
    const years = new Map<string, { m: (number | null)[]; pnl: number; growth: number }>();
    for (const r of all) {
      const [y, m] = r.key.split("-");
      const row = years.get(y) ?? { m: Array(12).fill(null), pnl: 0, growth: 1 };
      row.m[+m - 1] = r.ret;
      row.pnl += r.pnl;
      row.growth *= 1 + r.ret / 100;
      years.set(y, row);
    }
    return [...years.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [all, g]);

  const maxAbs = useMemo(() => Math.max(1, ...all.map((r) => Math.abs(r.ret))), [all]);
  const cellStyle = (v: number | null): React.CSSProperties => {
    if (v == null) return {};
    const a = Math.min(Math.abs(v) / Math.min(maxAbs, 15), 1);
    if (colorPnl) return { background: v >= 0 ? `rgba(108,196,149,${0.1 + a * 0.45})` : `rgba(224,124,124,${0.1 + a * 0.45})` };
    if (v >= 0) return { background: `rgba(255,255,255,${0.05 + a * 0.32})` };
    return { background: `repeating-linear-gradient(135deg, rgba(255,255,255,${0.04 + a * 0.12}) 0 3px, transparent 3px 6px)`, color: "var(--neg)" };
  };

  return (
    <section className="panel section" aria-label="Resultado por periodo">
      <div className="panel-h">
        <span className="panel-t">Resultado por periodo</span>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Agrupar">
          <button aria-pressed={g === "day"} onClick={() => setG("day")}>Días</button>
          <button aria-pressed={g === "month"} onClick={() => setG("month")}>Meses</button>
          <button aria-pressed={g === "year"} onClick={() => setG("year")}>Años</button>
        </div>
      </div>
      <div style={{ height: 220, padding: "14px 8px 0 0" }}>
        {rows.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="#1e1e22" vertical={false} />
              <XAxis dataKey="key" tickFormatter={periodLabel} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tickFormatter={(v) => money(v, base, { compact: true })} tick={{ fill: "#62626a", fontSize: 11 }} axisLine={false} tickLine={false} width={64} orientation="right" />
              <ReferenceLine y={0} stroke="#3a3a40" />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as { key: string; pnl: number; ret: number };
                  return (
                    <div className="tt">
                      <div className="tt-date">{periodLabel(r.key)}</div>
                      <div className="tt-row"><span>Resultado</span><span className={`num ${tone(r.pnl)}`}>{money(r.pnl, base, { sign: true })}</span></div>
                      <div className="tt-row"><span className="muted">Rentabilidad</span><span className={`num ${tone(r.ret)}`}>{pct(r.ret)}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pnl" isAnimationActive={false} radius={[2, 2, 0, 0]} maxBarSize={36}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.pnl >= 0 ? pal.pos : pal.neg} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">Sin datos todavía.</div>
        )}
      </div>

      {g === "month" && monthGrid && monthGrid.length > 0 && (
        <div className="tbl-wrap" style={{ padding: "8px 14px 16px" }}>
          <table className="rgrid">
            <thead>
              <tr>
                <th className="y">Año</th>
                {MONTHS.map((m) => <th key={m}>{m}</th>)}
                <th>Total</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {monthGrid.map(([y, row]) => {
                const yr = (row.growth - 1) * 100;
                return (
                  <tr key={y}>
                    <th className="y">{y}</th>
                    {row.m.map((v, i) => (
                      <td key={i} className={`num ${v == null ? "empty" : ""}`} style={cellStyle(v)}>
                        {v == null ? "·" : pct(v, { decimals: 1 })}
                      </td>
                    ))}
                    <td className={`num total ${tone(yr)}`}>{pct(yr, { decimals: 1 })}</td>
                    <td className={`num total ${tone(row.pnl)}`}>{money(row.pnl, base, { sign: true, decimals: 0 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {g === "year" && rows.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th className="l">Año</th><th>Resultado</th><th>Rentabilidad (TWR)</th></tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key}>
                  <td className="l num">{r.key}</td>
                  <td className={`num ${tone(r.pnl)}`}>{money(r.pnl, base, { sign: true })}</td>
                  <td className={`num ${tone(r.ret)}`}>{pct(r.ret)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
