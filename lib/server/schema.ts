/** Kept in sync with db/migrations/001_init.sql. Every statement is idempotent. */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS transactions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL,
  symbol     text NOT NULL,
  name       text,
  type       text NOT NULL CHECK (type IN ('buy', 'sell')),
  date       date NOT NULL,
  quantity   numeric NOT NULL CHECK (quantity > 0),
  price      numeric NOT NULL CHECK (price > 0),
  currency   char(3) NOT NULL,
  fees       numeric NOT NULL DEFAULT 0 CHECK (fees >= 0),
  fx         numeric CHECK (fx > 0),
  fx_base    char(3),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
  `CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id, date)`,
  `CREATE TABLE IF NOT EXISTS settings (
  user_id    text PRIMARY KEY,
  base       char(3) NOT NULL DEFAULT 'EUR',
  color_pnl  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
];
