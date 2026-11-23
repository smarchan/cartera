"use client";
import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { dateEs, money, price, qty, rate } from "@/lib/format";

export default function Transactions({
  txs,
  base,
  toBase,
  onEdit,
  onDelete,
}: {
  txs: Transaction[];
  base: string;
  toBase: (t: Transaction) => number;
  onEdit: (t: Transaction) => void;
  onDelete: (t: Transaction) => void;
}) {
  const [filter, setFilter] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [limit, setLimit] = useState(15);

  const rows = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return txs
      .filter((t) => !f || t.symbol.includes(f) || (t.name ?? "").toUpperCase().includes(f))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [txs, filter]);

  return (
    <section className="panel section" aria-label="Operaciones">
      <div className="panel-h">
        <span className="panel-t">Operaciones</span>
        <span className="muted" style={{ fontSize: 12 }}>{txs.length}</span>
        <span className="spacer" />
        <input
          id="tx-filter"
          className="input"
          style={{ width: 180, height: 30, fontSize: 13 }}
          placeholder="Filtrar por activo"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrar operaciones por activo"
        />
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">{txs.length ? "Ninguna operación coincide." : "Aún no hay operaciones."}</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="l">Fecha</th>
                <th className="l">Tipo</th>
                <th className="l">Activo</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Comisión</th>
                <th>Importe</th>
                <th className="hide-sm">Tipo de cambio</th>
                <th>{`Importe (${base})`}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => {
                const gross = t.quantity * t.price;
                const total = t.type === "buy" ? gross + t.fees : gross - t.fees;
                const r = toBase(t);
                return (
                  <tr key={t.id}>
                    <td className="l num">{dateEs(t.date)}</td>
                    <td className="l">
                      <span className={`tag ${t.type === "buy" ? "solid" : ""}`}>{t.type === "buy" ? "Compra" : "Venta"}</span>
                    </td>
                    <td className="l">
                      <span className="sym">{t.symbol}</span>
                    </td>
                    <td className="num">{qty(t.quantity)}</td>
                    <td className="num">{price(t.price, t.currency)}</td>
                    <td className="num muted">{t.fees ? money(t.fees, t.currency) : "—"}</td>
                    <td className="num">{money(total, t.currency)}</td>
                    <td className="num muted hide-sm" title={t.fx && t.fxBase === base ? "Tipo introducido a mano" : "Tipo de mercado de ese día"}>
                      {t.currency === base ? "—" : `${rate(r)}${t.fx && t.fxBase === base ? " ✎" : ""}`}
                    </td>
                    <td className="num">{money(total * r, base)}</td>
                    <td style={{ width: 1 }}>
                      {confirm === t.id ? (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <button className="btn sm danger" onClick={() => { onDelete(t); setConfirm(null); }}>Eliminar</button>
                          <button className="btn ghost sm" onClick={() => setConfirm(null)}>Cancelar</button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 2 }}>
                          <button className="btn ghost sm" onClick={() => onEdit(t)} aria-label={`Editar operación de ${t.symbol}`}>Editar</button>
                          <button className="btn ghost sm" onClick={() => setConfirm(t.id)} aria-label={`Eliminar operación de ${t.symbol}`}>✕</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > limit && (
            <div style={{ padding: 12, textAlign: "center" }}>
              <button className="btn sm" onClick={() => setLimit((l) => l + 30)}>Mostrar más ({rows.length - limit})</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
