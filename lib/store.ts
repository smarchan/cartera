"use client";
import { useCallback, useEffect, useState } from "react";
import type { Transaction } from "./types";

const KEY = "cartera:v1";

export interface Settings {
  base: string;
  colorPnl: boolean;
}

interface Stored {
  txs: Transaction[];
  settings: Settings;
  isSample: boolean;
}

export const SAMPLE: Transaction[] = [
  { id: "s1", symbol: "IWDA.AS", name: "iShares Core MSCI World UCITS ETF", type: "buy", date: "2024-02-12", quantity: 40, price: 85.4, currency: "EUR", fees: 2 },
  { id: "s2", symbol: "AAPL", name: "Apple Inc.", type: "buy", date: "2024-03-04", quantity: 15, price: 175.1, currency: "USD", fees: 1 },
  { id: "s3", symbol: "SAN.MC", name: "Banco Santander, S.A.", type: "buy", date: "2024-04-08", quantity: 500, price: 4.55, currency: "EUR", fees: 3 },
  { id: "s4", symbol: "BTC-EUR", name: "Bitcoin EUR", type: "buy", date: "2024-05-02", quantity: 0.05, price: 53800, currency: "EUR", fees: 5 },
  { id: "s5", symbol: "NVDA", name: "NVIDIA Corporation", type: "buy", date: "2024-06-20", quantity: 40, price: 130.8, currency: "USD", fees: 1 },
  { id: "s6", symbol: "IWDA.AS", name: "iShares Core MSCI World UCITS ETF", type: "buy", date: "2025-01-15", quantity: 25, price: 101.2, currency: "EUR", fees: 2 },
  { id: "s7", symbol: "NVDA", name: "NVIDIA Corporation", type: "sell", date: "2025-02-10", quantity: 15, price: 133.6, currency: "USD", fees: 1 },
  { id: "s8", symbol: "MSFT", name: "Microsoft Corporation", type: "buy", date: "2025-04-07", quantity: 6, price: 322, currency: "EUR", fees: 2 },
];

const DEFAULT: Stored = { txs: SAMPLE, settings: { base: "EUR", colorPnl: false }, isSample: true };

export function usePortfolio() {
  const [state, setState] = useState<Stored>(DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        setState({ ...DEFAULT, ...s, settings: { ...DEFAULT.settings, ...s.settings } });
      }
    } catch {
      /* storage unavailable: keep defaults */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const upsertTx = useCallback((tx: Transaction) => {
    setState((s) => {
      const base = s.isSample ? [] : s.txs;
      const i = base.findIndex((t) => t.id === tx.id);
      const txs = i >= 0 ? base.map((t) => (t.id === tx.id ? tx : t)) : [...base, tx];
      return { ...s, txs, isSample: false };
    });
  }, []);

  const removeTx = useCallback((id: string) => {
    setState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }));
  }, []);

  const replaceAll = useCallback((txs: Transaction[], settings?: Partial<Settings>) => {
    setState((s) => ({ txs, settings: { ...s.settings, ...settings }, isSample: false }));
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  return { ...state, ready, upsertTx, removeTx, replaceAll, setSettings };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- CSV import/export ---------- */

const CSV_HEAD = "fecha,tipo,simbolo,nombre,cantidad,precio,moneda,comision,tipo_cambio,moneda_base";

export function toCsv(txs: Transaction[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    CSV_HEAD,
    ...txs.map((t) =>
      [t.date, t.type === "buy" ? "compra" : "venta", t.symbol, t.name ?? "", t.quantity, t.price, t.currency, t.fees, t.fx ?? "", t.fxBase ?? ""].map(esc).join(","),
    ),
  ].join("\n");
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Accepts the exported format; also ';' separators and decimal commas. */
export function fromCsv(text: string): { txs: Transaction[]; errors: string[] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { txs: [], errors: ["El archivo está vacío."] };
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvLine(lines[0].toLowerCase(), sep);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const ix = {
    date: col("fecha", "date"),
    type: col("tipo", "type"),
    sym: col("simbolo", "símbolo", "symbol", "ticker"),
    name: col("nombre", "name"),
    qty: col("cantidad", "quantity", "unidades"),
    price: col("precio", "price"),
    ccy: col("moneda", "currency"),
    fees: col("comision", "comisión", "fees"),
    fx: col("tipo_cambio", "fx"),
    fxBase: col("moneda_base", "fxbase"),
  };
  if (ix.date < 0 || ix.sym < 0 || ix.qty < 0 || ix.price < 0)
    return { txs: [], errors: ["Faltan columnas. Necesarias: fecha, simbolo, cantidad, precio."] };
  const num = (s: string | undefined) => {
    if (!s) return NaN;
    const t = sep === ";" ? s.replace(/\./g, "").replace(",", ".") : s;
    return Number(t);
  };
  const txs: Transaction[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, n) => {
    const c = splitCsvLine(line, sep);
    let date = c[ix.date];
    const m = date?.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
    const t = (c[ix.type] ?? "compra").toLowerCase();
    const tx: Transaction = {
      id: newId(),
      date,
      type: /^(venta|sell|v)$/.test(t) ? "sell" : "buy",
      symbol: (c[ix.sym] ?? "").toUpperCase(),
      name: ix.name >= 0 ? c[ix.name] || undefined : undefined,
      quantity: num(c[ix.qty]),
      price: num(c[ix.price]),
      currency: ((ix.ccy >= 0 && c[ix.ccy]) || "EUR").toUpperCase(),
      fees: ix.fees >= 0 ? num(c[ix.fees]) || 0 : 0,
    };
    const fx = ix.fx >= 0 ? num(c[ix.fx]) : NaN;
    if (fx > 0) {
      tx.fx = fx;
      tx.fxBase = ((ix.fxBase >= 0 && c[ix.fxBase]) || "EUR").toUpperCase();
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tx.date) || !tx.symbol || !(tx.quantity > 0) || !(tx.price > 0)) {
      errors.push(`Fila ${n + 2}: datos incompletos o inválidos.`);
    } else txs.push(tx);
  });
  return { txs, errors };
}
