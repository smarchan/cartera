import type { Transaction } from "./types";

export type TxOp = { kind: "upsert"; tx: Transaction } | { kind: "delete"; id: string };

/** Returns a new array with the operation applied; the input is not mutated. */
export function applyOptimistic(txs: Transaction[], op: TxOp): Transaction[] {
  if (op.kind === "delete") return txs.filter((t) => t.id !== op.id);
  const i = txs.findIndex((t) => t.id === op.tx.id);
  if (i < 0) return [...txs, op.tx];
  const out = txs.slice();
  out[i] = op.tx;
  return out;
}
