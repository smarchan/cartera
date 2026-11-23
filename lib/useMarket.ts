"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FxResponse, HistoryResponse, Quote, Series, Transaction } from "./types";
import type { LivePrice, MarketInput } from "./portfolio";
import { addDays } from "./portfolio";
import { todayLocal } from "./format";

const POLL_MS = 30_000;

export interface MarketState {
  input: MarketInput;
  quotes: Record<string, Quote>;
  fxSource: Record<string, string>;
  loading: boolean;
  lastUpdate: number | null;
  errors: string[];
  anyOpen: boolean;
  refresh: () => void;
}

export function useMarket(txs: Transaction[], base: string): MarketState {
  const symbols = useMemo(() => [...new Set(txs.map((t) => t.symbol))].sort(), [txs]);
  const firstDate = useMemo(() => (txs.length ? txs.reduce((m, t) => (t.date < m ? t.date : m), txs[0].date) : todayLocal()), [txs]);
  const from = addDays(firstDate, -7);

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quoteErr, setQuoteErr] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Record<string, { currency: string; points: Series }>>({});
  const [fx, setFx] = useState<Record<string, Series>>({});
  const [fxSource, setFxSource] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Currencies to convert: quote currencies of assets + currencies operations were paid in
  const ccys = useMemo(() => {
    const set = new Set<string>();
    for (const t of txs) set.add(t.currency);
    for (const s of symbols) {
      const c = quotes[s]?.currency ?? history[s]?.currency;
      if (c) set.add(c);
    }
    set.delete(base);
    return [...set].sort();
  }, [txs, symbols, quotes, history, base]);

  const fxSymbols = useMemo(() => ccys.map((c) => `${c}${base}=X`), [ccys, base]);
  const quoteKey = [...symbols, ...fxSymbols].join(",");

  /* ---- live quotes (polling) ---- */
  const inflight = useRef<AbortController | null>(null);
  const fetchQuotes = useCallback(async () => {
    if (!quoteKey) {
      setLoading(false);
      return;
    }
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(quoteKey)}`, { signal: ac.signal, cache: "no-store" });
      if (!r.ok) throw new Error();
      const data = (await r.json()) as Record<string, Quote | { error: string }>;
      const ok: Record<string, Quote> = {};
      const bad: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if ("error" in v) bad[k] = v.error;
        else ok[k] = v;
      }
      setQuotes((q) => ({ ...q, ...ok }));
      setQuoteErr(bad);
      setLastUpdate(Date.now());
    } catch (e) {
      if ((e as Error).name !== "AbortError") setQuoteErr((b) => ({ ...b, _net: "No se pudo actualizar precios. Reintentando…" }));
    } finally {
      setLoading(false);
    }
  }, [quoteKey]);

  useEffect(() => {
    fetchQuotes();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchQuotes();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && fetchQuotes();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [fetchQuotes, tick]);

  /* ---- daily history ---- */
  const histKey = symbols.join(",") + "|" + from;
  useEffect(() => {
    if (!symbols.length) return;
    let alive = true;
    fetch(`/api/history?symbols=${encodeURIComponent(symbols.join(","))}&from=${from}`)
      .then((r) => r.json() as Promise<HistoryResponse>)
      .then((data) => {
        if (!alive) return;
        const next: Record<string, { currency: string; points: Series }> = {};
        const errs: string[] = [];
        for (const [k, v] of Object.entries(data)) {
          if ("error" in v) errs.push(v.error);
          else next[k] = v;
        }
        setHistory(next);
        setErrors((e) => [...e.filter((x) => !x.startsWith("Sin histórico")), ...errs]);
      })
      .catch(() => alive && setErrors((e) => [...e, "No se pudo cargar el histórico."]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histKey, tick]);

  /* ---- FX history ---- */
  const fxKey = ccys.join(",") + "|" + base + "|" + from;
  useEffect(() => {
    if (!ccys.length) {
      setFx({});
      return;
    }
    let alive = true;
    fetch(`/api/fx?base=${base}&ccys=${ccys.join(",")}&from=${from}`)
      .then((r) => r.json() as Promise<FxResponse>)
      .then((data) => {
        if (!alive) return;
        const next: Record<string, Series> = {};
        const src: Record<string, string> = {};
        const errs: string[] = [];
        for (const [c, v] of Object.entries(data.pairs ?? {})) {
          if ("error" in v) errs.push(v.error);
          else {
            next[c] = v.points;
            src[c] = v.source;
          }
        }
        setFx(next);
        setFxSource(src);
        setErrors((e) => [...e.filter((x) => !x.startsWith("Tipo de cambio")), ...errs]);
      })
      .catch(() => alive && setErrors((e) => [...e, "No se pudo cargar el histórico de divisas."]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxKey, tick]);

  const input = useMemo<MarketInput>(() => {
    const assetCcy: Record<string, string> = {};
    const prices: Record<string, Series> = {};
    const live: Record<string, LivePrice> = {};
    for (const s of symbols) {
      const c = quotes[s]?.currency ?? history[s]?.currency;
      if (c) assetCcy[s] = c;
      if (history[s]) prices[s] = history[s].points;
      if (quotes[s]) live[s] = { price: quotes[s].price, prevClose: quotes[s].prevClose };
    }
    const liveFx: Record<string, LivePrice> = {};
    for (const c of ccys) {
      const q = quotes[`${c}${base}=X`];
      if (q) liveFx[c] = { price: q.price, prevClose: q.prevClose };
    }
    return { base, today: todayLocal(), assetCcy, prices, live, fx, liveFx };
  }, [symbols, ccys, quotes, history, fx, base]);

  const allErrors = useMemo(() => [...Object.values(quoteErr), ...errors], [quoteErr, errors]);
  const anyOpen = symbols.some((s) => quotes[s]?.marketState === "REGULAR");

  return {
    input,
    quotes,
    fxSource,
    loading,
    lastUpdate,
    errors: allErrors,
    anyOpen,
    refresh: () => setTick((t) => t + 1),
  };
}
