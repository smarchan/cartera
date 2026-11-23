import { test } from "node:test";
import assert from "node:assert/strict";
import { Market, computePositions, computeSeries, groupPnl, valueAt, rangePerformance } from "../lib/portfolio.ts";
import type { Transaction } from "../lib/types.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

function market(over: Partial<ConstructorParameters<typeof Market>[0]> = {}) {
  return new Market({
    base: "EUR",
    today: "2024-01-05",
    assetCcy: { AAPL: "USD", MSFT: "USD", "SAN.MC": "EUR" },
    prices: {
      AAPL: [["2024-01-02", 101], ["2024-01-03", 105], ["2024-01-04", 118]],
      MSFT: [["2024-01-02", 260], ["2024-01-03", 262], ["2024-01-04", 265]],
      "SAN.MC": [["2024-01-02", 3.5], ["2024-01-03", 3.6], ["2024-01-04", 3.7]],
    },
    live: { AAPL: { price: 120, prevClose: 118 }, MSFT: { price: 270, prevClose: 265 }, "SAN.MC": { price: 3.8, prevClose: 3.7 } },
    fx: { USD: [["2024-01-02", 0.9], ["2024-01-03", 0.85], ["2024-01-04", 0.81]] },
    liveFx: { USD: { price: 0.8, prevClose: 0.81 } },
    ...over,
  });
}

const buy: Transaction = { id: "1", symbol: "AAPL", type: "buy", date: "2024-01-02", quantity: 10, price: 100, currency: "USD", fees: 1 };

test("valueAt forward-fills and back-fills", () => {
  const s: [string, number][] = [["2024-01-02", 1], ["2024-01-04", 2]];
  assert.equal(valueAt(s, "2024-01-01"), 1);
  assert.equal(valueAt(s, "2024-01-03"), 1);
  assert.equal(valueAt(s, "2024-01-09"), 2);
});

test("USD asset bought in USD: price effect vs FX effect", () => {
  const { open, summary } = computePositions([buy], market());
  const p = open[0];
  close(p.costBase, 1001 * 0.9);
  close(p.value, 10 * 120 * 0.8);
  close(p.unrealized, 960 - 900.9);
  close(p.priceEffect, (1200 - 1001) * 0.8);
  close(p.fxEffect, -100.1);
  close(p.avgCost, 100.1);
  close(p.dayChange, 960 - 10 * 118 * 0.81);
  close(summary.totalPnl, 59.1);
  close(p.weight, 100);
});

test("partial sale realizes P/L at average cost", () => {
  const sell: Transaction = { id: "2", symbol: "AAPL", type: "sell", date: "2024-01-03", quantity: 4, price: 130, currency: "USD", fees: 2 };
  const { open, summary } = computePositions([buy, sell], market());
  const p = open[0];
  close(p.quantity, 6);
  close(p.realized, 518 * 0.85 - 90.09 * 4);
  close(p.costBase, 900.9 * 0.6);
  close(p.avgSellPrice, 130);
  close(summary.realized, p.realized);
});

test("USD asset paid in EUR uses EUR cost exactly", () => {
  const t: Transaction = { id: "3", symbol: "MSFT", type: "buy", date: "2024-01-02", quantity: 5, price: 200, currency: "EUR", fees: 0 };
  const { open } = computePositions([t], market());
  close(open[0].costBase, 1000);
  close(open[0].avgCost, 200 / 0.9); // 200 EUR at 0.9 EUR per USD
});

test("manual FX rate overrides history only for its base", () => {
  const t: Transaction = { ...buy, fees: 0, fx: 0.95, fxBase: "EUR" };
  close(computePositions([t], market()).open[0].costBase, 950);
  close(computePositions([t], market({ base: "USD", fx: {}, liveFx: {} })).open[0].costBase, 1000);
});

test("selling more than held is clamped and warned", () => {
  const mk = market();
  const sell: Transaction = { id: "4", symbol: "AAPL", type: "sell", date: "2024-01-03", quantity: 50, price: 110, currency: "USD", fees: 0 };
  const { open, closed } = computePositions([buy, sell], mk);
  assert.equal(open.length, 0);
  assert.equal(closed.length, 1);
  assert.ok(mk.warnings.size === 1);
});

test("series P/L reconciles with positions; TWR sane", () => {
  const txs: Transaction[] = [
    buy,
    { id: "5", symbol: "SAN.MC", type: "buy", date: "2024-01-03", quantity: 100, price: 3.6, currency: "EUR", fees: 0 },
    { id: "6", symbol: "AAPL", type: "sell", date: "2024-01-04", quantity: 3, price: 118, currency: "USD", fees: 1 },
  ];
  const mk = market();
  const series = computeSeries(txs, mk);
  const { summary } = computePositions(txs, mk);
  assert.equal(series.length, 4);
  const last = series[series.length - 1];
  close(last.value, summary.value);
  close(last.pnl, summary.totalPnl);
  close(series.reduce((a, p) => a + p.dayPnl, 0), summary.totalPnl);
  close(last.cost, summary.costBasis);
  const months = groupPnl(series, "month");
  assert.equal(months.length, 1);
  close(months[0].pnl, summary.totalPnl);
  const r = rangePerformance(series, "2024-01-01");
  close(r.pnl, summary.totalPnl);
});

test("full exit day return is not -100%", () => {
  const sell: Transaction = { id: "7", symbol: "AAPL", type: "sell", date: "2024-01-03", quantity: 10, price: 105, currency: "USD", fees: 0 };
  const s = computeSeries([buy, sell], market());
  const d = s.find((p) => p.date === "2024-01-03")!;
  close(d.dayRet, (1050 * 0.85) / (10 * 101 * 0.9) - 1);
});
