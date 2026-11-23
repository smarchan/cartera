import { test } from "node:test";
import assert from "node:assert/strict";
import { getPortfolio, upsertTx, deleteTx, saveSettings, importTxs, deleteUserData } from "../lib/server/repo.ts";
import type { Db } from "../lib/server/repo.ts";
import type { Transaction } from "../lib/types.ts";

function fakeDb(rows: Record<string, unknown>[][] = []) {
  const calls: { text: string; params: unknown[]; tx?: boolean }[] = [];
  const db: Db = {
    async query(text, params) {
      calls.push({ text, params });
      return rows.shift() ?? [];
    },
    async transaction(qs) {
      for (const q of qs) calls.push({ ...q, tx: true });
    },
  };
  return { db, calls };
}

const tx: Transaction = { id: "t1", symbol: "AAPL", type: "buy", date: "2024-03-04", quantity: 15, price: 175.1, currency: "USD", fees: 1 };

test("every query is scoped to the user", async () => {
  const { db, calls } = fakeDb();
  await getPortfolio(db, "u1");
  await upsertTx(db, "u1", tx);
  await deleteTx(db, "u1", "x");
  await saveSettings(db, "u1", { base: "EUR", colorPnl: false });
  await importTxs(db, "u1", [tx], "append");
  await deleteUserData(db, "u1");
  assert.ok(calls.length >= 6);
  for (const c of calls) {
    assert.match(c.text, /user_id/, c.text);
    assert.ok(c.params.includes("u1"), c.text);
  }
});

test("delete only touches the user's row", async () => {
  const { db, calls } = fakeDb();
  await deleteTx(db, "u1", "x");
  assert.match(calls[0].text, /DELETE FROM transactions WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(calls[0].params, ["x", "u1"]);
});

test("upsert cannot take over another user's id", async () => {
  const { db, calls } = fakeDb();
  await upsertTx(db, "u1", tx);
  assert.match(calls[0].text, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(calls[0].text, /WHERE transactions\.user_id = EXCLUDED\.user_id/);
});

test("import validates everything before writing", async () => {
  const { db, calls } = fakeDb();
  const many = Array.from({ length: 501 }, (_, i) => ({ ...tx, id: "t" + i }));
  await assert.rejects(() => importTxs(db, "u1", many, "append"), /500/);
  await assert.rejects(() => importTxs(db, "u1", [tx, { ...tx, id: "t2", quantity: 0 }], "append"), /Fila 2/);
  assert.equal(calls.length, 0);
});

test("replace deletes the user's operations first, in one transaction", async () => {
  const { db, calls } = fakeDb();
  const n = await importTxs(db, "u1", [tx], "replace");
  assert.equal(n, 1);
  assert.ok(calls.every((c) => c.tx));
  assert.match(calls[0].text, /DELETE FROM transactions WHERE user_id = \$1/);
  assert.match(calls[1].text, /INSERT INTO transactions/);
});

test("reads numeric and date columns back as numbers and YYYY-MM-DD", async () => {
  const { db } = fakeDb([
    [{ id: "t1", symbol: "AAPL", name: null, type: "buy", date: new Date("2024-03-04T00:00:00Z"), quantity: "15", price: "175.1", currency: "USD", fees: "1", fx: null, fx_base: null, note: null }],
    [{ base: "USD", color_pnl: true }],
  ]);
  const p = await getPortfolio(db, "u1");
  assert.deepEqual(p.txs[0], tx);
  assert.deepEqual(p.settings, { base: "USD", colorPnl: true });
});

test("defaults settings when the user has none", async () => {
  const { db } = fakeDb([[], []]);
  const p = await getPortfolio(db, "u1");
  assert.deepEqual(p.settings, { base: "EUR", colorPnl: true });
});
