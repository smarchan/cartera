const nf = new Map<string, Intl.NumberFormat>();
function fmt(key: string, opts: Intl.NumberFormatOptions) {
  let f = nf.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", opts);
    nf.set(key, f);
  }
  return f;
}

export function money(v: number, ccy: string, opts: { sign?: boolean; compact?: boolean; decimals?: number } = {}): string {
  if (!isFinite(v)) return "—";
  const decimals = opts.decimals ?? 2;
  const f = fmt(`m:${ccy}:${decimals}:${opts.compact}`, {
    style: "currency",
    currency: ccy,
    minimumFractionDigits: opts.compact ? 0 : decimals,
    maximumFractionDigits: opts.compact ? 1 : decimals,
    notation: opts.compact ? "compact" : "standard",
  });
  const s = f.format(Math.abs(v) < 0.005 && !opts.compact ? 0 : Math.abs(v));
  if (v < -0.0049) return "−" + s;
  if (opts.sign && v > 0.0049) return "+" + s;
  return s;
}

/** Unit price: more decimals for small prices */
export function price(v: number, ccy: string): string {
  if (!isFinite(v) || v === 0) return "—";
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return money(v, ccy, { decimals: d });
}

export function pct(v: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (!isFinite(v)) return "—";
  const d = opts.decimals ?? 2;
  const s = fmt(`p:${d}`, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Math.abs(v)) + " %";
  if (v < -0.00499) return "−" + s;
  if (opts.sign !== false && v > 0.00499) return "+" + s;
  return s;
}

export function qty(v: number): string {
  return fmt("q", { maximumFractionDigits: 8 }).format(v);
}

export function rate(v: number): string {
  return fmt("r", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(v);
}

export function dateEs(d: string, style: "short" | "long" = "short"): string {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
  return dt.toLocaleDateString("es-ES", style === "short" ? { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function periodLabel(key: string): string {
  if (key.length === 4) return key;
  const [y, m, d] = key.split("-");
  if (key.length === 7) return `${MONTHS[+m - 1]} ${y.slice(2)}`;
  return `${+d} ${MONTHS[+m - 1]}`;
}
export { MONTHS };

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tone(v: number): "pos" | "neg" | "flat" {
  return v > 0.0049 ? "pos" : v < -0.0049 ? "neg" : "flat";
}
