"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings, Transaction } from "./types";
import { applyOptimistic } from "./optimistic";

const LOCAL_KEY = "cartera:v1";

export type { Settings };


const DEFAULT_SETTINGS: Settings = { base: "EUR", colorPnl: true };

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error || "No se pudo guardar. Inténtalo de nuevo.");
  return body as T;
}

/** Portfolio stored in the user's account. Writes are optimistic and roll back on failure. */
export function usePortfolio() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [localCandidate, setLocalCandidate] = useState<Transaction[] | null>(null);
  const txsRef = useRef<Transaction[]>([]);
  txsRef.current = txs;

  const load = useCallback(async () => {
    try {
      const p = await api<{ txs: Transaction[]; settings: Settings }>("/api/portfolio");
      setTxs(p.txs);
      setSettingsState(p.settings);
      setLocalCandidate(p.txs.length === 0 ? readLocal() : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const write = useCallback(async (next: Transaction[], call: () => Promise<unknown>) => {
    const prev = txsRef.current;
    setTxs(next);
    setSaving((n) => n + 1);
    try {
      await call();
      setError(null);
    } catch (e) {
      setTxs(prev);
      setError((e as Error).message);
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);

  const upsertTx = useCallback(
    (tx: Transaction) =>
      write(applyOptimistic(txsRef.current, { kind: "upsert", tx }), () => api("/api/portfolio/tx", { method: "PUT", body: JSON.stringify(tx) })),
    [write],
  );

  const removeTx = useCallback(
    (id: string) =>
      write(applyOptimistic(txsRef.current, { kind: "delete", id }), () => api(`/api/portfolio/tx?id=${encodeURIComponent(id)}`, { method: "DELETE" })),
    [write],
  );

  const replaceAll = useCallback(
    (list: Transaction[], patch?: Partial<Settings>) => {
      if (patch) setSettings(patch);
      return write(list, () => api("/api/portfolio/import", { method: "POST", body: JSON.stringify({ txs: list, mode: "replace" }) }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [write],
  );

  const appendMany = useCallback(
    (list: Transaction[]) =>
      write([...txsRef.current, ...list], () => api("/api/portfolio/import", { method: "POST", body: JSON.stringify({ txs: list, mode: "append" }) })),
    [write],
  );

  const setSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...patch };
        api("/api/portfolio/settings", { method: "PUT", body: JSON.stringify(next) }).catch((e) => {
          setSettingsState(prev);
          setError((e as Error).message);
        });
        return next;
      });
    },
    [],
  );

  const importLocal = useCallback(async () => {
    if (!localCandidate) return;
    await appendMany(localCandidate);
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
    setLocalCandidate(null);
  }, [localCandidate, appendMany]);

  const dismissLocal = useCallback(() => setLocalCandidate(null), []);

  const deleteAccount = useCallback(async () => {
    await api("/api/account", { method: "DELETE" });
  }, []);

  return {
    txs,
    settings,
    isSample: false,
    ready,
    saving: saving > 0,
    error,
    clearError: () => setError(null),
    localCandidate,
    upsertTx,
    removeTx,
    replaceAll,
    appendMany,
    setSettings,
    importLocal,
    dismissLocal,
    deleteAccount,
  };
}

/** Portfolio saved in this browser by the previous version (ignores the example portfolio). */
function readLocal(): Transaction[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { txs?: Transaction[]; isSample?: boolean };
    if (s.isSample || !Array.isArray(s.txs) || s.txs.length === 0) return null;
    return s.txs;
  } catch {
    return null;
  }
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
