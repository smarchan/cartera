"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserButton, useClerk } from "@clerk/nextjs";
import { Market, computePositions, computeSeries, sortTx } from "@/lib/portfolio";
import { fromCsv, toCsv, usePortfolio } from "@/lib/store";
import { useMarket } from "@/lib/useMarket";
import { money, pct, tone } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import ValueChart from "./ValueChart";
import Allocation from "./Allocation";
import PeriodPnl from "./PeriodPnl";
import Positions from "./Positions";
import Transactions from "./Transactions";
import TxModal, { type TxPreset } from "./TxModal";

const BASES = ["EUR", "USD", "GBP", "CHF", "JPY"];

export default function Dashboard() {
  const pf = usePortfolio();
  const { txs, settings } = pf;
  const { signOut } = useClerk();
  const base = settings.base;
  const mkt = useMarket(txs, base);

  const [modal, setModal] = useState<{ edit?: Transaction; preset?: TxPreset } | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showWarn, setShowWarn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("pnl-color", settings.colorPnl);
  }, [settings.colorPnl]);

  useEffect(() => {
    if (pf.error) {
      setToast(pf.error);
      pf.clearError();
    }
  }, [pf]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && (setMenu(false), setConfirmClear(false), setConfirmDelete(false));
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  /* "N" opens a new operation */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (modal || el.tagName === "INPUT" || el.tagName === "SELECT" || e.metaKey || e.ctrlKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setModal({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal]);

  const calc = useMemo(() => {
    const mk = new Market(mkt.input);
    const pos = computePositions(txs, mk);
    const series = computeSeries(txs, mk);
    return { ...pos, series, warnings: [...mk.warnings], mk };
  }, [txs, mkt.input]);

  const { open, closed, summary: s, series } = calc;
  const warnings = [...mkt.errors, ...calc.warnings];
  const firstLoad = !pf.ready || (mkt.loading && !mkt.lastUpdate && txs.length > 0);
  const sk = firstLoad ? "skeleton" : "";

  const heldBefore = useCallback(
    (symbol: string, date: string, excludeId?: string) => {
      let q = 0;
      for (const t of sortTx(txs)) {
        if (t.symbol !== symbol || t.id === excludeId || t.date > date) continue;
        q += t.type === "buy" ? t.quantity : -Math.min(t.quantity, q);
      }
      return Math.max(q, 0);
    },
    [txs],
  );

  const download = (name: string, content: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const j = JSON.parse(text);
        const list: Transaction[] = Array.isArray(j) ? j : j.txs;
        if (!Array.isArray(list)) throw new Error();
        pf.replaceAll(list, j.settings);
        setToast(`${list.length} operaciones importadas.`);
      } else {
        const { txs: list, errors } = fromCsv(text);
        if (!list.length) throw new Error(errors[0]);
        pf.appendMany(list);
        setToast(`${list.length} operaciones importadas${errors.length ? ` · ${errors.length} filas ignoradas` : ""}.`);
      }
    } catch (e) {
      setToast((e as Error).message || "No se pudo leer el archivo. Usa el JSON o CSV exportado desde aquí.");
    }
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const time = mkt.lastUpdate ? new Date(mkt.lastUpdate).toLocaleTimeString("es-ES") : null;

  return (
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Cartera
          </div>
          <div className="status" aria-live="polite">
            <span className={`dot ${mkt.anyOpen ? "live" : ""}`} />
            <span className="hide-sm">{mkt.anyOpen ? "Mercado abierto" : "Mercados cerrados"}</span>
            {time && <span className="num">· {time}</span>}
          </div>
          {pf.saving && <span className="status hide-sm">Guardando…</span>}
          {warnings.length > 0 && (
            <button className="btn ghost sm" onClick={() => setShowWarn((v) => !v)} aria-expanded={showWarn}>
              {warnings.length} aviso{warnings.length > 1 ? "s" : ""}
            </button>
          )}
          <span className="spacer" />
          <label htmlFor="base" className="hide-sm muted" style={{ fontSize: 12 }}>Moneda</label>
          <select id="base" className="select" value={base} onChange={(e) => pf.setSettings({ base: e.target.value })} aria-label="Moneda de la cartera">
            {BASES.map((b) => <option key={b}>{b}</option>)}
          </select>
          <button className="btn icon hide-sm" onClick={mkt.refresh} aria-label="Actualizar precios" title="Actualizar precios">↻</button>
          <div style={{ position: "relative" }} ref={menuRef}>
            <button className="btn icon" onClick={() => setMenu((v) => !v)} aria-label="Más opciones" aria-expanded={menu}>⋯</button>
            {menu && (
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => pf.setSettings({ colorPnl: !settings.colorPnl })}>
                  Color en ganancias y pérdidas <span className={`switch ${settings.colorPnl ? "on" : ""}`} />
                </button>
                <hr />
                <button role="menuitem" onClick={() => { download(`cartera-${stamp}.csv`, toCsv(txs), "text/csv"); setMenu(false); }}>Exportar operaciones (CSV)</button>
                <button role="menuitem" onClick={() => { download(`cartera-${stamp}.json`, JSON.stringify({ txs, settings }, null, 2), "application/json"); setMenu(false); }}>Copia de seguridad (JSON)</button>
                <button role="menuitem" onClick={() => { fileRef.current?.click(); setMenu(false); }}>Importar CSV o JSON…</button>
                <hr />
                {confirmClear ? (
                  <button role="menuitem" onClick={() => { pf.replaceAll([]); setConfirmClear(false); setMenu(false); setToast("Cartera vaciada."); }}>
                    Confirmar: borrar todas las operaciones
                  </button>
                ) : (
                  <button role="menuitem" className="muted" onClick={() => setConfirmClear(true)}>Borrar todas las operaciones…</button>
                )}
                {confirmDelete ? (
                  <button
                    role="menuitem"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await pf.deleteAccount();
                        await signOut({ redirectUrl: "/sign-in" });
                      } catch (e) {
                        setToast((e as Error).message);
                        setDeleting(false);
                      }
                    }}
                  >
                    {deleting ? "Eliminando…" : "Confirmar: eliminar mi cuenta y todos mis datos"}
                  </button>
                ) : (
                  <button role="menuitem" className="muted" onClick={() => setConfirmDelete(true)}>Eliminar mi cuenta…</button>
                )}
                <hr />
                <a role="menuitem" className="mi-link" href="/privacidad">Privacidad</a>
              </div>
            )}
          </div>
          <button className="btn primary" onClick={() => setModal({})}>
            <span aria-hidden="true">+</span> <span className="hide-sm">Nueva operación</span>
          </button>
          <UserButton appearance={{ elements: { avatarBox: { width: 30, height: 30 } } }} />
          <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" hidden id="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
        </div>
      </header>

      <main className="wrap">
        {showWarn && warnings.length > 0 && (
          <div className="banner" role="status">
            <ul className="warnings">{warnings.map((w, i) => <li key={i}>· {w}</li>)}</ul>
          </div>
        )}
        {pf.localCandidate && (
          <div className="banner">
            <strong>Tienes {pf.localCandidate.length} operaciones guardadas en este navegador.</strong>
            <span>Pásalas a tu cuenta para verlas en cualquier dispositivo.</span>
            <span className="spacer" />
            <button className="btn sm primary" onClick={async () => { await pf.importLocal(); setToast("Cartera importada a tu cuenta."); }}>Importar a mi cuenta</button>
            <button className="btn sm ghost" onClick={pf.dismissLocal}>Ahora no</button>
          </div>
        )}
        {pf.ready && txs.length === 0 && !pf.localCandidate && (
          <div className="banner">
            <strong>Tu cartera está vacía.</strong>
            <span>Añade tu primera compra o importa un CSV con tus operaciones.</span>
            <span className="spacer" />
            <button className="btn sm" onClick={() => fileRef.current?.click()}>Importar CSV</button>
            <button className="btn sm primary" onClick={() => setModal({})}>Nueva operación</button>
          </div>
        )}

        <section className="kpis" aria-label="Resumen">
          <div className="kpi main">
            <div className="kpi-label">Valor de la cartera</div>
            <div className={`kpi-value num ${sk}`}>{money(s.value, base)}</div>
            <div className="kpi-sub"><span>Coste {money(s.costBasis, base)}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Hoy</div>
            <div className={`kpi-value num ${tone(s.dayChange)} ${sk}`}>{money(s.dayChange, base, { sign: true })}</div>
            <div className="kpi-sub"><span className={`num ${tone(s.dayChangePct)}`}>{pct(s.dayChangePct)}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Beneficio total</div>
            <div className={`kpi-value num ${tone(s.totalPnl)} ${sk}`}>{money(s.totalPnl, base, { sign: true })}</div>
            <div className="kpi-sub"><span className={`num ${tone(s.totalPnlPct)}`}>{pct(s.totalPnlPct)}</span><span>sobre {money(s.invested, base, { compact: true })} invertidos</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-label">No realizado</div>
            <div className={`kpi-value num ${tone(s.unrealized)} ${sk}`}>{money(s.unrealized, base, { sign: true })}</div>
            <div className="kpi-sub">
              <span className={`num ${tone(s.unrealizedPct)}`}>{pct(s.unrealizedPct)}</span>
              {Math.abs(s.fxEffect) >= 0.01 && <span>divisa <span className={`num ${tone(s.fxEffect)}`}>{money(s.fxEffect, base, { sign: true })}</span></span>}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Realizado</div>
            <div className={`kpi-value num ${tone(s.realized)}`}>{money(s.realized, base, { sign: true })}</div>
            <div className="kpi-sub"><span>comisiones {money(s.fees, base)}</span></div>
          </div>
        </section>

        <div className="grid-2">
          <ValueChart series={series} base={base} today={mkt.input.today} dayChange={s.dayChange} dayChangePct={s.dayChangePct} />
          <Allocation positions={open} quotes={mkt.quotes} base={base} />
        </div>

        <Positions
          open={open}
          closed={closed}
          summary={s}
          quotes={mkt.quotes}
          txs={txs}
          base={base}
          loading={firstLoad}
          onTrade={(symbol, type) => setModal({ preset: { symbol, type, name: mkt.quotes[symbol]?.name } })}
        />

        <PeriodPnl series={series} base={base} colorPnl={settings.colorPnl} />

        <Transactions
          txs={txs}
          base={base}
          toBase={(t) => calc.mk.txToBase(t)}
          onEdit={(t) => setModal({ edit: t })}
          onDelete={(t) => { pf.removeTx(t.id); setToast(`Operación de ${t.symbol} eliminada.`); }}
        />

        <p className="faint" style={{ fontSize: 11, marginTop: 24 }}>
          Precios de Yahoo Finance con posible retraso según el mercado; tipos de cambio de Yahoo o, si faltan, del BCE. Coste medio ponderado con comisiones incluidas. Rentabilidad por periodo ponderada en el tiempo (TWR). Pulsa N para añadir una operación.
        </p>
      </main>

      {modal && (
        <TxModal
          key={modal.edit?.id ?? modal.preset?.symbol ?? "new"}
          base={base}
          edit={modal.edit}
          preset={modal.preset}
          heldBefore={heldBefore}
          onClose={() => setModal(null)}
          onSave={(t) => {
            pf.upsertTx(t);
            setModal(null);
            setToast(modal.edit ? "Operación actualizada." : "Operación añadida.");
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
