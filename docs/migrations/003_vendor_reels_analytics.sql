-- Migration 003: merchant shipping contract, reels, follows and analytics.
-- Safe additive migration; does not delete or rewrite existing business data.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS shipping_company_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS shipping_contract_reference VARCHAR(120),
  ADD COLUMN IF NOT EXISTS shipping_contract_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_contract_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_business_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(40) NOT NULL DEFAULT 'GEMINI';

CREATE TABLE IF NOT EXISTS reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  media_url TEXT NOT NULL,
  cover_url TEXT,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds IN (10, 20, 60)),
  filter_name VARCHAR(80) NOT NULL DEFAULT 'ORIGINAL',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED')),
  is_ad BOOLEAN NOT NULL DEFAULT FALSE,
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reel_likes (
  reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE' CHECK (status IN ('VISIBLE', 'HIDDEN', 'REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_follows (
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS reels_vendor_status_idx ON reels(vendor_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS reel_comments_reel_idx ON reel_comments(reel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_follows_user_idx ON vendor_follows(user_id, created_at DESC);

CREATE OR REPLACE VIEW vendor_dashboard_metrics AS
SELECT
  v.id AS vendor_id,
  COUNT(DISTINCT o.id) FILTER (WHERE o.status <> 'CANCELLED') AS orders_count,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'PUBLISHED') AS published_reels_count,
  COALESCE(SUM(r.views_count) FILTER (WHERE r.status = 'PUBLISHED'), 0) AS reel_views_count,
  COALESCE(SUM(r.likes_count) FILTER (WHERE r.status = 'PUBLISHED'), 0) AS reel_likes_count,
  COALESCE(SUM(r.comments_count) FILTER (WHERE r.status = 'PUBLISHED'), 0) AS reel_comments_count
FROM vendors v
LEFT JOIN orders o ON o.vendor_id = v.id
LEFT JOIN reels r ON r.vendor_id = v.id
GROUP BY v.id;
