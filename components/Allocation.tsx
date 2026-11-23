"use client";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Position } from "@/lib/portfolio";
import type { Quote } from "@/lib/types";
import { money, pct } from "@/lib/format";
import { OTHER, colorMap } from "./ui";

type By = "asset" | "ccy" | "type";
const TYPE_ORDER = ["Acciones", "ETF", "Fondos", "Cripto", "Divisas", "Índices", "Futuros", "Otros"];
const TYPE_ES: Record<string, string> = {
  EQUITY: "Acciones",
  ETF: "ETF",
  MUTUALFUND: "Fondos",
  CRYPTOCURRENCY: "Cripto",
  CURRENCY: "Divisas",
  INDEX: "Índices",
  FUTURE: "Futuros",
};

export default function Allocation({ positions, quotes, base, assetColors }: { positions: Position[]; quotes: Record<string, Quote>; base: string; assetColors: Record<string, string> }) {
  const [by, setBy] = useState<By>("asset");
  const [hover, setHover] = useState<number | null>(null);

  const rows = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      const key = by === "asset" ? p.symbol : by === "ccy" ? p.currency : TYPE_ES[quotes[p.symbol]?.type ?? ""] ?? "Otros";
      m.set(key, (m.get(key) ?? 0) + p.value);
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    let list = [...m.entries()].map(([name, value]) => ({ name, value, w: total ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
    if (list.length > 8) {
      const rest = list.slice(7);
      list = [...list.slice(0, 7), { name: `Otros (${rest.length})`, value: rest.reduce((a, r) => a + r.value, 0), w: rest.reduce((a, r) => a + r.w, 0) }];
    }
    return list;
  }, [positions, quotes, by]);

  // color follows the entity (stable across filters and value changes), never its rank
  const colors = useMemo(() => {
    if (by === "asset") return rows.map((r) => assetColors[r.name] ?? OTHER);
    const order =
      by === "ccy"
        ? [...new Set([...positions].sort((a, b) => (a.firstDate < b.firstDate ? -1 : 1)).map((p) => p.currency))]
        : TYPE_ORDER;
    const map = colorMap(order);
    return rows.map((r) => map[r.name] ?? OTHER);
  }, [rows, by, positions, assetColors]);
  const focus = hover != null ? rows[hover] : null;

  return (
    <section className="panel" aria-label="Distribución">
      <div className="panel-h">
        <span className="panel-t">Distribución</span>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Agrupar por">
          <button aria-pressed={by === "asset"} onClick={() => setBy("asset")}>Activo</button>
          <button aria-pressed={by === "ccy"} onClick={() => setBy("ccy")}>Divisa</button>
          <button aria-pressed={by === "type"} onClick={() => setBy("type")}>Tipo</button>
        </div>
      </div>
      <div className="panel-b">
        {rows.length === 0 ? (
          <div className="empty-state">Sin posiciones abiertas.</div>
        ) : (
          <div className="alloc">
            <div style={{ width: 150, height: 150, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rows}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={0}
                    isAnimationActive={false}
                    onMouseEnter={(_, i) => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {rows.map((r, i) => (
                      <Cell key={r.name} fill={colors[i]} stroke="#111113" strokeWidth={2} opacity={hover == null || hover === i ? 1 : 0.35} />
                    ))}
                  </Pie>
                  <Tooltip content={() => null} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center" }}>
                <div>
                  <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>{focus ? pct(focus.w, { sign: false, decimals: 1 }) : rows.length}</div>
                  <div className="muted" style={{ fontSize: 10, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {focus ? focus.name : rows.length === 1 ? "posición" : by === "asset" ? "posiciones" : "grupos"}
                  </div>
                </div>
              </div>
            </div>
            <ul className="alloc-list">
              {rows.map((r, i) => (
                <li key={r.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ opacity: hover == null || hover === i ? 1 : 0.5 }}>
                  <span className="sw" style={{ background: colors[i] }} />
                  <span className="lbl">{r.name}</span>
                  <span className="num muted">{money(r.value, base, { compact: true })}</span>
                  <span className="num" style={{ minWidth: 52, textAlign: "right" }}>{pct(r.w, { sign: false, decimals: 1 })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
