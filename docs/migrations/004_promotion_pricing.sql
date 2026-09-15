-- Migration 004: administrator-managed promotion pricing.
-- Prices are intentionally not seeded: an authenticated administrator must configure them.

CREATE TABLE IF NOT EXISTS promotion_pricing (
  store_type VARCHAR(20) PRIMARY KEY CHECK (store_type IN ('SMALL_STORE', 'HEAVY_STORE')),
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS promotion_pricing_updated_idx ON promotion_pricing(updated_at DESC);
