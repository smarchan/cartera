export type TxType = "buy" | "sell";

export interface Transaction {
  id: string;
  symbol: string;
  name?: string;
  type: TxType;
  /** YYYY-MM-DD */
  date: string;
  quantity: number;
  /** Price per unit, in `currency` */
  price: number;
  /** Currency the operation was paid/received in (may differ from the asset's quote currency) */
  currency: string;
  /** Fees, in `currency` */
  fees: number;
  /** Optional manual exchange rate: 1 `currency` = `fx` units of `fxBase` */
  fx?: number;
  fxBase?: string;
  note?: string;
}

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  marketState: string;
  type: string;
  exchange: string;
  /** epoch ms of last trade */
  time: number;
}

/** [YYYY-MM-DD, close] sorted ascending */
export type Series = [string, number][];

export interface HistoryResponse {
  [symbol: string]: { currency: string; points: Series } | { error: string };
}

export interface FxResponse {
  base: string;
  pairs: { [currency: string]: { points: Series; source: string } | { error: string } };
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}
