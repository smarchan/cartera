"use client";
import { Fragment, useMemo, useState } from "react";
import type { Position, Summary } from "@/lib/portfolio";
import type { Quote, Transaction } from "@/lib/types";
import { dateEs, money, pct, price, qty, tone } from "@/lib/format";
import { initials } from "./ui";

type SortKey = "symbol" | "value" | "weight" | "dayChange" | "unrealized" | "unrealizedPct";

export default function Positions({
  open,
  closed,
  summary,
  quotes,
  txs,
  base,
  loading,
  onTrade,
}: {
  open: Position[];
  closed: Position[];
  summary: Summary;
  quotes: Record<string, Quote>;
  txs: Transaction[];
  base: string;
  loading: boolean;
  onTrade: (symbol: string, type: "buy" | "sell") => void;
}) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "value", dir: -1 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const rows = useMemo(() => {
    const r = [...open];
    r.sort((a, b) => {
      const va = a[sort.k];
      const vb = b[sort.k];
      return (typeof va === "string" ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
    return r;
  }, [open, sort]);

  const th = (k: SortKey, label: string, cls = "") => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}
      aria-sort={sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      {label}
      {sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  const sk = loading ? "skeleton" : "";

  return (
    <section className="panel section" aria-label="Posiciones">
      <div className="panel-h">
        <span className="panel-t">Posiciones</span>
        <span className="muted" style={{ fontSize: 12 }}>{open.length}</span>
        <span className="spacer" />
        {closed.length > 0 && (
          <button className="btn ghost sm" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed}>
            {showClosed ? "Ocultar cerradas" : `Cerradas (${closed.length})`}
          </button>
        )}
      </div>
      {open.length === 0 ? (
        <div className="empty-state">
          <h3>Sin posiciones abiertas</h3>
          Registra tu primera compra con «Nueva operación».
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {th("symbol", "Activo", "l")}
                <th>Cantidad</th>
                <th>Precio medio</th>
                <th>Precio actual</th>
                {th("value", `Valor (${base})`)}
                {th("weight", "Peso")}
                {th("dayChange", "Hoy")}
                {th("unrealized", "Beneficio")}
                {th("unrealizedPct", "%")}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const q = quotes[p.symbol];
                const isOpen = expanded === p.symbol;
                const fxDiff = p.currency !== base;
                return (
                  <Fragment key={p.symbol}>
                    <tr className={`row ${isOpen ? "open" : ""}`} onClick={() => setExpanded(isOpen ? null : p.symbol)} aria-expanded={isOpen}>
                      <td className="l">
                        <div className="asset">
                          <span className="avatar">{initials(p.symbol)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="sym">
                              {p.symbol} {fxDiff && <span className="tag">{p.currency}</span>}
                            </div>
                            <div className="sub asset-name">{q?.name ?? p.name ?? ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{qty(p.quantity)}</td>
                      <td className="num">
                        {price(p.avgCost, p.currency)}
                        {fxDiff && <div className="sub">{price(p.avgCostBase, base)}</div>}
                      </td>
                      <td className="num">
                        <span className={sk}>{price(p.price, p.currency)}</span>
                        <div className={`sub ${tone(p.changePct)}`}>{pct(p.changePct)}</div>
                      </td>
                      <td className={`num ${sk}`}>{money(p.value, base)}</td>
                      <td>
                        <div className="weight">
                          <span className="num">{pct(p.weight, { sign: false, decimals: 1 })}</span>
                          <span className="bar"><span style={{ width: `${Math.min(p.weight, 100)}%` }} /></span>
                        </div>
                      </td>
                      <td className={`num ${tone(p.dayChange)} ${sk}`}>{money(p.dayChange, base, { sign: true })}</td>
                      <td className={`num ${tone(p.unrealized)} ${sk}`}>
                        {money(p.unrealized, base, { sign: true })}
                        {fxDiff && Math.abs(p.fxEffect) >= 0.01 && (
                          <div className="sub" title="Parte del beneficio debida al tipo de cambio">divisa {money(p.fxEffect, base, { sign: true })}</div>
                        )}
                      </td>
                      <td className={`num ${tone(p.unrealizedPct)} ${sk}`}>{pct(p.unrealizedPct)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="detail-cell">
                          <Detail p={p} txs={txs.filter((t) => t.symbol === p.symbol)} base={base} q={q} onTrade={onTrade} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="tfoot">
              <tr>
                <td className="l">Total</td>
                <td />
                <td />
                <td />
                <td className="num">{money(summary.value, base)}</td>
                <td className="num">100 %</td>
                <td className={`num ${tone(summary.dayChange)}`}>{money(summary.dayChange, base, { sign: true })}</td>
                <td className={`num ${tone(summary.unrealized)}`}>{money(summary.unrealized, base, { sign: true })}</td>
                <td className={`num ${tone(summary.unrealizedPct)}`}>{pct(summary.unrealizedPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showClosed && closed.length > 0 && (
        <div className="tbl-wrap" style={{ borderTop: "1px solid var(--line)" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="l">Posición cerrada</th>
                <th>Unidades vendidas</th>
                <th>Precio medio venta</th>
                <th>Última venta</th>
                <th>Beneficio realizado</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((p) => (
                <tr key={p.symbol}>
                  <td className="l">
                    <span className="sym">{p.symbol}</span> <span className="muted">{p.name}</span>
                  </td>
                  <td className="num">{qty(p.soldQty)}</td>
                  <td className="num">{price(p.avgSellPrice, p.currency)}</td>
                  <td className="num">{dateEs(p.lastDate)}</td>
                  <td className={`num ${tone(p.realized)}`}>{money(p.realized, base, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Detail({ p, txs, base, q, onTrade }: { p: Position; txs: Transaction[]; base: string; q?: Quote; onTrade: (s: string, t: "buy" | "sell") => void }) {
  const fxDiff = p.currency !== base;
  return (
    <div>
      <div className="detail">
        <div><div className="k">Coste total</div><div className="v num">{money(p.costBase, base)}</div></div>
        <div><div className="k">Efecto precio</div><div className={`v num ${tone(p.priceEffect)}`}>{money(p.priceEffect, base, { sign: true })}</div></div>
        {fxDiff && <div><div className="k">Efecto divisa ({p.currency}→{base})</div><div className={`v num ${tone(p.fxEffect)}`}>{money(p.fxEffect, base, { sign: true })}</div></div>}
        <div><div className="k">Realizado</div><div className={`v num ${tone(p.realized)}`}>{money(p.realized, base, { sign: true })}</div></div>
        <div><div className="k">Comisiones</div><div className="v num">{money(p.feesBase, base)}</div></div>
        {p.soldQty > 0 && <div><div className="k">Precio medio venta</div><div className="v num">{price(p.avgSellPrice, p.currency)}</div></div>}
        <div><div className="k">Desde</div><div className="v num">{dateEs(p.firstDate)}</div></div>
        {q?.exchange && <div><div className="k">Mercado</div><div className="v">{q.exchange}</div></div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {txs.length} operaci{txs.length === 1 ? "ón" : "ones"}:{" "}
          {txs
            .slice()
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .map((t) => `${t.type === "buy" ? "C" : "V"} ${qty(t.quantity)} × ${price(t.price, t.currency)} (${dateEs(t.date)})`)
            .join(" · ")}
        </span>
        <span className="spacer" />
        <button className="btn sm" onClick={() => onTrade(p.symbol, "buy")}>Comprar más</button>
        <button className="btn sm" onClick={() => onTrade(p.symbol, "sell")}>Vender</button>
      </div>
    </div>
  );
}
