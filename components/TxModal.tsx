"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FxResponse, HistoryResponse, Quote, SearchResult, Transaction, TxType } from "@/lib/types";
import { addDays, valueAt } from "@/lib/portfolio";
import { dateEs, money, qty as fmtQty, rate, todayLocal } from "@/lib/format";
import { newId } from "@/lib/store";

const CCYS = ["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN", "MXN", "BRL", "HKD"];

export interface TxPreset {
  symbol?: string;
  name?: string;
  type?: TxType;
}

function parseNum(s: string): number {
  if (!s.trim()) return NaN;
  // accept both "1.234,56" and "1234.56"
  const t = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(t);
}

export default function TxModal({
  base,
  edit,
  preset,
  heldBefore,
  onSave,
  onClose,
}: {
  base: string;
  edit?: Transaction;
  preset?: TxPreset;
  heldBefore: (symbol: string, date: string, excludeId?: string) => number;
  onSave: (t: Transaction) => void;
  onClose: () => void;
}) {
  const today = todayLocal();
  const [type, setType] = useState<TxType>(edit?.type ?? preset?.type ?? "buy");
  const [symbol, setSymbol] = useState(edit?.symbol ?? preset?.symbol ?? "");
  const [name, setName] = useState(edit?.name ?? preset?.name ?? "");
  const [query, setQuery] = useState(edit?.symbol ?? preset?.symbol ?? "");
  const [date, setDate] = useState(edit?.date ?? today);
  const [quantity, setQuantity] = useState(edit ? String(edit.quantity) : "");
  const [priceStr, setPriceStr] = useState(edit ? String(edit.price) : "");
  const [priceTouched, setPriceTouched] = useState(!!edit);
  const [currency, setCurrency] = useState(edit?.currency ?? base);
  const [ccyTouched, setCcyTouched] = useState(!!edit);
  const [fees, setFees] = useState(edit ? String(edit.fees || "") : "");
  const [manualFx, setManualFx] = useState(!!(edit?.fx && edit.fxBase === base));
  const [fxStr, setFxStr] = useState(edit?.fx && edit.fxBase === base ? String(edit.fx) : "");
  const [marketFx, setMarketFx] = useState<{ v: number; date: string; source: string } | null>(null);
  const [assetQuote, setAssetQuote] = useState<Quote | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showList, setShowList] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* search */
  useEffect(() => {
    const q = query.trim();
    if (!q || q === symbol) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await r.json()) as SearchResult[];
        setResults(Array.isArray(data) ? data : []);
        setActive(0);
      } catch {
        setResults([]);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [query, symbol]);

  /* quote of the chosen asset → its currency and current price */
  useEffect(() => {
    if (!symbol) {
      setAssetQuote(null);
      return;
    }
    let alive = true;
    fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((d: Record<string, Quote | { error: string }>) => {
        if (!alive) return;
        const q = d[symbol];
        if (q && !("error" in q)) {
          setAssetQuote(q);
          if (!name) setName(q.name);
          if (!ccyTouched) setCurrency(q.currency);
        } else setAssetQuote(null);
      })
      .catch(() => alive && setAssetQuote(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  /* prefill price: today's quote or that day's close */
  useEffect(() => {
    if (priceTouched || !symbol || !assetQuote || currency !== assetQuote.currency) return;
    if (date >= today) {
      setPriceStr(String(+assetQuote.price.toPrecision(6)));
      return;
    }
    let alive = true;
    fetch(`/api/history?symbols=${encodeURIComponent(symbol)}&from=${addDays(date, -7)}`)
      .then((r) => r.json() as Promise<HistoryResponse>)
      .then((d) => {
        const h = d[symbol];
        if (!alive || !h || "error" in h) return;
        const v = valueAt(h.points.filter(([dd]) => dd <= date), date);
        if (v) setPriceStr(String(+v.toPrecision(6)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [symbol, date, assetQuote, currency, priceTouched, today]);

  /* market FX for the trade currency on that date */
  useEffect(() => {
    setMarketFx(null);
    if (currency === base) return;
    let alive = true;
    fetch(`/api/fx?base=${base}&ccys=${currency}&from=${addDays(date, -10)}`)
      .then((r) => r.json() as Promise<FxResponse>)
      .then((d) => {
        const p = d.pairs?.[currency];
        if (!alive || !p || "error" in p) return;
        const pts = p.points.filter(([dd]) => dd <= date);
        const last = pts[pts.length - 1];
        if (last) setMarketFx({ v: last[1], date: last[0], source: p.source });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currency, date, base]);

  const pick = (r: SearchResult) => {
    setSymbol(r.symbol);
    setName(r.name);
    setQuery(r.symbol);
    setShowList(false);
    setCcyTouched(false);
    setPriceTouched(false);
  };

  const q = parseNum(quantity);
  const p = parseNum(priceStr);
  const f = parseNum(fees) || 0;
  const fxManual = parseNum(fxStr);
  const fxUsed = currency === base ? 1 : manualFx && fxManual > 0 ? fxManual : marketFx?.v;
  const gross = q * p;
  const total = type === "buy" ? gross + f : gross - f;
  const held = useMemo(() => (symbol ? heldBefore(symbol, date, edit?.id) : 0), [symbol, date, edit?.id, heldBefore]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = (symbol || query).trim().toUpperCase();
    if (!sym) return setError("Elige un activo.");
    if (!(q > 0)) return setError("La cantidad debe ser mayor que 0.");
    if (!(p > 0)) return setError("El precio debe ser mayor que 0.");
    if (date > today) return setError("La fecha no puede ser futura.");
    if (f < 0) return setError("La comisión no puede ser negativa.");
    if (type === "sell" && q > held + 1e-9) return setError(`Solo tenías ${fmtQty(held)} unidades de ${sym} en esa fecha.`);
    if (manualFx && currency !== base && !(fxManual > 0)) return setError("Introduce un tipo de cambio válido o desmarca la casilla.");
    const tx: Transaction = {
      id: edit?.id ?? newId(),
      symbol: sym,
      name: name || undefined,
      type,
      date,
      quantity: q,
      price: p,
      currency,
      fees: f,
    };
    if (manualFx && currency !== base && fxManual > 0) {
      tx.fx = fxManual;
      tx.fxBase = base;
    }
    onSave(tx);
  };

  const onKeyList = (e: React.KeyboardEvent) => {
    if (!showList || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="tx-title" onSubmit={submit}>
        <div className="modal-h">
          <h2 id="tx-title">{edit ? "Editar operación" : "Nueva operación"}</h2>
          <span className="spacer" />
          <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-b">
          <div className="seg" role="group" aria-label="Tipo de operación" style={{ justifySelf: "start" }}>
            <button type="button" aria-pressed={type === "buy"} onClick={() => setType("buy")}>Compra</button>
            <button type="button" aria-pressed={type === "sell"} onClick={() => setType("sell")}>Venta</button>
          </div>

          <div className="field combo">
            <label htmlFor="tx-symbol">Activo</label>
            <input
              id="tx-symbol"
              ref={firstRef}
              className="input"
              placeholder="Busca por nombre o ticker: Apple, IWDA, BTC-EUR, SAN.MC…"
              value={query}
              autoComplete="off"
              role="combobox"
              aria-expanded={showList && results.length > 0}
              aria-controls="tx-symbol-list"
              onChange={(e) => {
                setQuery(e.target.value);
                setSymbol("");
                setShowList(true);
              }}
              onFocus={() => setShowList(true)}
              onBlur={() => setTimeout(() => setShowList(false), 150)}
              onKeyDown={onKeyList}
            />
            {showList && results.length > 0 && (
              <div className="combo-list" id="tx-symbol-list" role="listbox">
                {results.map((r, i) => (
                  <div key={r.symbol} className="combo-item" role="option" aria-selected={i === active} onMouseDown={() => pick(r)}>
                    <div style={{ minWidth: 0 }}>
                      <div className="sym">{r.symbol}</div>
                      <div className="n">{r.name}</div>
                    </div>
                    <div className="x">{r.type}<br />{r.exchange}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="hint">
              {assetQuote
                ? `${assetQuote.name} · cotiza en ${assetQuote.currency} · ${money(assetQuote.price, assetQuote.currency)}`
                : symbol
                  ? "Buscando cotización…"
                  : "Si no aparece, escribe el ticker de Yahoo Finance tal cual."}
              {type === "sell" && symbol ? ` · Tienes ${fmtQty(held)}` : ""}
            </div>
          </div>

          <div className="row-3">
            <div className="field">
              <label htmlFor="tx-date">Fecha</label>
              <input id="tx-date" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tx-qty">Cantidad</label>
              <input id="tx-qty" className="input num" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label htmlFor="tx-price">Precio por unidad</label>
              <input
                id="tx-price"
                className="input num"
                inputMode="decimal"
                value={priceStr}
                onChange={(e) => {
                  setPriceStr(e.target.value);
                  setPriceTouched(true);
                }}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label htmlFor="tx-ccy">Moneda de la operación</label>
              <select
                id="tx-ccy"
                className="select"
                style={{ height: 36 }}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setCcyTouched(true);
                }}
              >
                {[...new Set([currency, base, assetQuote?.currency ?? base, ...CCYS])].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tx-fees">Comisión ({currency})</label>
              <input id="tx-fees" className="input num" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {currency !== base && (
            <div className="field">
              <label className="hint" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={manualFx} onChange={(e) => setManualFx(e.target.checked)} id="tx-manualfx" />
                Usar el tipo de cambio que me aplicó el bróker
              </label>
              {manualFx ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="hint">1 {currency} =</span>
                  <input id="tx-fx" className="input num" style={{ maxWidth: 140 }} inputMode="decimal" value={fxStr} onChange={(e) => setFxStr(e.target.value)} placeholder={marketFx ? rate(marketFx.v) : ""} />
                  <span className="hint">{base}</span>
                </div>
              ) : (
                <div className="hint">
                  {marketFx
                    ? `Tipo de mercado: 1 ${currency} = ${rate(marketFx.v)} ${base} (${marketFx.source}, ${dateEs(marketFx.date)})`
                    : "Obteniendo tipo de cambio…"}
                </div>
              )}
            </div>
          )}

          {q > 0 && p > 0 && (
            <div className="summary-box">
              <div className="tt-row"><span className="muted">{type === "buy" ? "Total pagado" : "Total recibido"}</span><strong className="num">{money(total, currency)}</strong></div>
              {currency !== base && fxUsed && (
                <div className="tt-row"><span className="muted">Equivalente en {base}</span><strong className="num">{money(total * fxUsed, base)}</strong></div>
              )}
              {assetQuote && date >= today && type === "buy" && currency === assetQuote.currency && (
                <div className="tt-row"><span className="muted">Valor a precio actual</span><span className="num">{money(q * assetQuote.price, currency)}</span></div>
              )}
            </div>
          )}

          {error && <div className="err" role="alert">{error}</div>}
        </div>
        <div className="modal-f">
          <span className="hint" style={{ marginRight: "auto" }}>Esc para cerrar</span>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary">{edit ? "Guardar cambios" : type === "buy" ? "Añadir compra" : "Añadir venta"}</button>
        </div>
      </form>
    </div>
  );
}
