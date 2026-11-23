import type { Settings, Transaction } from "../types";
import { validateTx } from "../validate.ts";

/** Minimal database interface: real implementation in db.ts, fakes in tests. */
export interface Db {
  query(text: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  transaction(qs: { text: string; params: unknown[] }[]): Promise<void>;
}

export const MAX_IMPORT = 500;
const DEFAULT_SETTINGS: Settings = { base: "EUR", colorPnl: false };

const COLS = "id, user_id, symbol, name, type, date, quantity, price, currency, fees, fx, fx_base, note";

function insertQuery(userId: string, t: Transaction, upsert: boolean) {
  const text =
    `INSERT INTO transactions (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)` +
    (upsert
      ? ` ON CONFLICT (id) DO UPDATE SET symbol = EXCLUDED.symbol, name = EXCLUDED.name, type = EXCLUDED.type,
          date = EXCLUDED.date, quantity = EXCLUDED.quantity, price = EXCLUDED.price, currency = EXCLUDED.currency,
          fees = EXCLUDED.fees, fx = EXCLUDED.fx, fx_base = EXCLUDED.fx_base, note = EXCLUDED.note, updated_at = now()
          WHERE transactions.user_id = EXCLUDED.user_id`
      : " ON CONFLICT (id) DO NOTHING");
  const params = [t.id, userId, t.symbol, t.name ?? null, t.type, t.date, t.quantity, t.price, t.currency, t.fees || 0, t.fx ?? null, t.fxBase ?? null, t.note ?? null];
  return { text, params };
}

function toDay(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function rowToTx(r: Record<string, unknown>): Transaction {
  const t: Transaction = {
    id: String(r.id),
    symbol: String(r.symbol),
    type: r.type === "sell" ? "sell" : "buy",
    date: toDay(r.date),
    quantity: Number(r.quantity),
    price: Number(r.price),
    currency: String(r.currency),
    fees: Number(r.fees ?? 0),
  };
  if (r.name != null) t.name = String(r.name);
  if (r.fx != null) {
    t.fx = Number(r.fx);
    t.fxBase = String(r.fx_base);
  }
  if (r.note != null) t.note = String(r.note);
  return t;
}

export async function getPortfolio(db: Db, userId: string): Promise<{ txs: Transaction[]; settings: Settings }> {
  const rows = await db.query(`SELECT ${COLS} FROM transactions WHERE user_id = $1 ORDER BY date, created_at`, [userId]);
  const s = await db.query("SELECT base, color_pnl FROM settings WHERE user_id = $1", [userId]);
  const settings = s[0] ? { base: String(s[0].base), colorPnl: Boolean(s[0].color_pnl) } : DEFAULT_SETTINGS;
  return { txs: rows.map(rowToTx), settings };
}

export async function upsertTx(db: Db, userId: string, tx: Transaction): Promise<void> {
  const q = insertQuery(userId, tx, true);
  await db.query(q.text, q.params);
}

export async function deleteTx(db: Db, userId: string, id: string): Promise<void> {
  await db.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
}

export async function saveSettings(db: Db, userId: string, s: Settings): Promise<void> {
  await db.query(
    `INSERT INTO settings (user_id, base, color_pnl) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET base = EXCLUDED.base, color_pnl = EXCLUDED.color_pnl, updated_at = now()`,
    [userId, s.base, s.colorPnl],
  );
}

/** Validates every row first; writes all or nothing. Returns the number of rows sent. */
export async function importTxs(db: Db, userId: string, input: unknown[], mode: "append" | "replace"): Promise<number> {
  if (input.length > MAX_IMPORT) throw new Error(`Máximo ${MAX_IMPORT} operaciones por importación.`);
  const txs: Transaction[] = [];
  input.forEach((row, i) => {
    const r = validateTx(row);
    if (!r.ok) throw new Error(`Fila ${i + 1}: ${r.error}`);
    txs.push(r.tx);
  });
  const qs: { text: string; params: unknown[] }[] = [];
  if (mode === "replace") qs.push({ text: "DELETE FROM transactions WHERE user_id = $1", params: [userId] });
  for (const t of txs) qs.push(insertQuery(userId, t, false));
  if (qs.length) await db.transaction(qs);
  return txs.length;
}

export async function deleteUserData(db: Db, userId: string): Promise<void> {
  await db.transaction([
    { text: "DELETE FROM transactions WHERE user_id = $1", params: [userId] },
    { text: "DELETE FROM settings WHERE user_id = $1", params: [userId] },
  ]);
}
