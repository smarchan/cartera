"use client";
import { money, pct, tone } from "@/lib/format";

export function Money({ v, ccy, sign, className = "" }: { v: number; ccy: string; sign?: boolean; className?: string }) {
  return <span className={`num ${sign ? tone(v) : ""} ${className}`}>{money(v, ccy, { sign })}</span>;
}

export function Pct({ v, className = "", arrow }: { v: number; className?: string; arrow?: boolean }) {
  const t = tone(v);
  return (
    <span className={`num ${t} ${className}`}>
      {arrow && t !== "flat" ? (t === "pos" ? "▲ " : "▼ ") : ""}
      {pct(v)}
    </span>
  );
}

/** "+1.234,56 €  +3,21 %" */
export function Change({ v, p, ccy }: { v: number; p?: number; ccy: string }) {
  return (
    <span className={`num ${tone(v)}`}>
      {money(v, ccy, { sign: true })}
      {p != null && <span style={{ marginLeft: 8 }}>{pct(p)}</span>}
    </span>
  );
}

export function initials(symbol: string): string {
  const s = symbol.replace(/[-.=].*$/, "");
  return s.slice(0, 4);
}

export const PALETTE = {
  mono: { pos: "rgba(242,242,243,0.9)", neg: "rgba(242,242,243,0.28)", posText: "#f2f2f3", negText: "#8e8e96" },
  color: { pos: "#6cc495", neg: "#e07c7c", posText: "#7fd3a1", negText: "#ef8f8f" },
};

/** Categorical palette for the dark surface, validated for color-blind separation (fixed order, never cycled). */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER = "#5e5e66";

/** Stable color per key: the first 8 keys get palette slots in order, the rest share the neutral "other" gray. */
export function colorMap(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  keys.forEach((k, i) => (out[k] = i < SERIES.length ? SERIES[i] : OTHER));
  return out;
}

export function shades(n: number): string[] {
  if (n <= 1) return ["#ececee"];
  return Array.from({ length: n }, (_, i) => {
    const l = 93 - (i * 70) / Math.max(n - 1, 1);
    return `hsl(240 4% ${l.toFixed(1)}%)`;
  });
}
