import type { Settings, Transaction } from "./types";

type Result<K extends string, T> = ({ ok: true } & { [P in K]: T }) | { ok: false; error: string };

const CCY = /^[A-Z]{3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SYMBOL = /^[A-Z0-9.\-=^]{1,20}$/;

function isRealDay(s: string): boolean {
  if (!DAY.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
}

/** Validates and normalizes an operation coming from a client. */
export function validateTx(input: unknown): Result<"tx", Transaction> {
  if (!input || typeof input !== "object") return { ok: false, error: "Operación vacía." };
  const o = input as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id || id.length > 64) return { ok: false, error: "Identificador inválido." };
  const symbol = typeof o.symbol === "string" ? o.symbol.trim().toUpperCase() : "";
  if (!SYMBOL.test(symbol)) return { ok: false, error: "Símbolo inválido." };
  if (o.type !== "buy" && o.type !== "sell") return { ok: false, error: "El tipo debe ser compra o venta." };
  const date = typeof o.date === "string" ? o.date : "";
  // one day of slack for users ahead of UTC
  const maxDay = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  if (!isRealDay(date) || date > maxDay || date < "1970-01-01") return { ok: false, error: "Fecha inválida." };
  const quantity = num(o.quantity);
  if (!(quantity > 0) || !isFinite(quantity)) return { ok: false, error: "La cantidad debe ser mayor que 0." };
  const price = num(o.price);
  if (!(price > 0) || !isFinite(price)) return { ok: false, error: "El precio debe ser mayor que 0." };
  const currency = typeof o.currency === "string" ? o.currency.toUpperCase() : "";
  if (!CCY.test(currency)) return { ok: false, error: "Moneda inválida." };
  const fees = o.fees == null || o.fees === "" ? 0 : num(o.fees);
  if (!(fees >= 0) || !isFinite(fees)) return { ok: false, error: "La comisión no puede ser negativa." };

  const tx: Transaction = { id, symbol, type: o.type, date, quantity, price, currency, fees };
  if (typeof o.name === "string" && o.name.trim()) tx.name = o.name.trim().slice(0, 120);
  if (typeof o.note === "string" && o.note.trim()) tx.note = o.note.trim().slice(0, 500);
  if (o.fx != null && o.fx !== "") {
    const fx = num(o.fx);
    const fxBase = typeof o.fxBase === "string" ? o.fxBase.toUpperCase() : "";
    if (!(fx > 0) || !isFinite(fx) || !CCY.test(fxBase)) return { ok: false, error: "Tipo de cambio inválido." };
    tx.fx = fx;
    tx.fxBase = fxBase;
  }
  return { ok: true, tx };
}

export function validateSettings(input: unknown): Result<"settings", Settings> {
  if (!input || typeof input !== "object") return { ok: false, error: "Ajustes vacíos." };
  const o = input as Record<string, unknown>;
  const base = typeof o.base === "string" ? o.base.toUpperCase() : "";
  if (!CCY.test(base)) return { ok: false, error: "Moneda base inválida." };
  if (typeof o.colorPnl !== "boolean") return { ok: false, error: "Ajuste de color inválido." };
  return { ok: true, settings: { base, colorPnl: o.colorPnl } };
}
