import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOptimistic } from "../lib/optimistic.ts";
import type { Transaction } from "../lib/types.ts";

const a: Transaction = { id: "a", symbol: "AAPL", type: "buy", date: "2024-01-02", quantity: 1, price: 1, currency: "USD", fees: 0 };
const b: Transaction = { ...a, id: "b", symbol: "MSFT" };

test("upsert appends a new operation", () => {
  assert.deepEqual(applyOptimistic([a], { kind: "upsert", tx: b }).map((t) => t.id), ["a", "b"]);
});

test("upsert replaces by id in place", () => {
  const out = applyOptimistic([a, b], { kind: "upsert", tx: { ...a, quantity: 5 } });
  assert.equal(out[0].quantity, 5);
  assert.equal(out.length, 2);
});

test("delete removes only that id and leaves the input untouched", () => {
  const input = [a, b];
  assert.deepEqual(applyOptimistic(input, { kind: "delete", id: "a" }), [b]);
  assert.equal(input.length, 2);
});
