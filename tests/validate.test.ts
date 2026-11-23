import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTx, validateSettings } from "../lib/validate.ts";

const good = { id: "s2", symbol: "aapl", name: "Apple Inc.", type: "buy", date: "2024-03-04", quantity: 15, price: 175.1, currency: "USD", fees: 1 };

test("accepts a valid operation and normalizes the symbol", () => {
  const r = validateTx(good);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.tx.symbol, "AAPL");
    assert.equal(r.tx.quantity, 15);
  }
});

test("rejects invalid operations", () => {
  const bad = [
    { quantity: 0 },
    { price: -1 },
    { type: "hold" },
    { currency: "EURO" },
    { date: "2099-01-01" },
    { date: "2024-13-40" },
    { symbol: "" },
    { fx: 0, fxBase: "EUR" },
    { id: "" },
    { fees: -2 },
  ];
  for (const patch of bad) {
    const r = validateTx({ ...good, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
  }
  assert.equal(validateTx(null).ok, false);
});

test("keeps a manual FX rate only with its base", () => {
  const r = validateTx({ ...good, fx: 0.92, fxBase: "eur" });
  assert.ok(r.ok && r.tx.fx === 0.92 && r.tx.fxBase === "EUR");
});

test("validates settings", () => {
  assert.ok(validateSettings({ base: "USD", colorPnl: true }).ok);
  assert.equal(validateSettings({ base: "XX", colorPnl: false }).ok, false);
  assert.equal(validateSettings({ base: "EUR", colorPnl: "yes" }).ok, false);
});
