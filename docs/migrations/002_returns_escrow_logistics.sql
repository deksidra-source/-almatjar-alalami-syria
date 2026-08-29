-- Migration 002: returns, escrow, VIN, warranties and flexible delivery.
-- Safe additive migration: no existing rows are deleted.

ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'COD';

DO $$ BEGIN
  CREATE TYPE escrow_status AS ENUM ('HOLDING', 'RELEASED', 'DISPUTED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE return_reason AS ENUM ('DEFECT', 'MISMATCH', 'VIN_MISMATCH', 'DAMAGE', 'BUYER_REMORSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE return_status AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escrow_status escrow_status NOT NULL DEFAULT 'HOLDING',
  ADD COLUMN IF NOT EXISTS escrow_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_method payment_provider NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS delivery_mode VARCHAR(20) NOT NULL DEFAULT 'DOOR',
  ADD COLUMN IF NOT EXISTS shipping_address TEXT,
  ADD COLUMN IF NOT EXISTS nearest_landmark TEXT,
  ADD COLUMN IF NOT EXISTS pickup_point_id UUID,
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(120);

CREATE TABLE IF NOT EXISTS return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason return_reason NOT NULL,
  proof_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  vin_number VARCHAR(32),
  status return_status NOT NULL DEFAULT 'REQUESTED',
  seller_fault BOOLEAN,
  shipping_cost_charged NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_cost_charged >= 0),
  decision_note TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 3 AND 12),
  terms TEXT,
  requires_maintenance_report BOOLEAN NOT NULL DEFAULT TRUE,
  requires_vin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  governorate VARCHAR(80) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS escrow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status escrow_status,
  to_status escrow_status NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_escrow_release_idx ON orders(escrow_status, delivered_at) WHERE escrow_status = 'HOLDING';
CREATE INDEX IF NOT EXISTS return_requests_order_idx ON return_requests(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS return_requests_vin_idx ON return_requests(vin_number) WHERE vin_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS pickup_points_governorate_idx ON pickup_points(governorate) WHERE is_active = TRUE;

-- Idempotent function. Invoke from a platform-managed scheduled handler, never setInterval.
CREATE OR REPLACE FUNCTION release_eligible_escrow()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE released_count INTEGER;
BEGIN
  WITH eligible AS (
    UPDATE orders
    SET escrow_status = 'RELEASED', escrow_released_at = CURRENT_TIMESTAMP
    WHERE status = 'DELIVERED'
      AND delivered_at IS NOT NULL
      AND delivered_at <= CURRENT_TIMESTAMP - INTERVAL '7 days'
      AND disputed = FALSE
      AND escrow_status = 'HOLDING'
    RETURNING id
  )
  INSERT INTO escrow_events (order_id, from_status, to_status, note)
  SELECT id, 'HOLDING', 'RELEASED', 'Automatic release after 7 calendar days'
  FROM eligible;
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;
