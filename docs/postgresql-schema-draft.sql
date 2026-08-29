-- مخطط PostgreSQL أولي لمشروع المتجر العالمي سوريا.
-- لا يُنفّذ قبل مراجعة الصلاحيات والهجرة والامتثال.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'VENDOR', 'ADMIN');
CREATE TYPE vendor_category AS ENUM ('SMALL_STORE', 'HEAVY_STORE', 'SHIPPING_OFFICE');
CREATE TYPE subscription_status AS ENUM ('FREE_TRIAL', 'ACTIVE', 'PAUSED', 'EXPIRED');
CREATE TYPE order_status AS ENUM ('PENDING', 'PROCESSING', 'SHIPPED', 'CUSTOMS_CLEARED', 'DELIVERED', 'CANCELLED');
CREATE TYPE promotion_status AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REJECTED', 'CANCELLED');
CREATE TYPE payment_provider AS ENUM ('MANUAL', 'COD', 'SHAM_CASH', 'ICASH');
CREATE TYPE escrow_status AS ENUM ('HOLDING', 'RELEASED', 'DISPUTED', 'REFUNDED');
CREATE TYPE return_reason AS ENUM ('DEFECT', 'MISMATCH', 'VIN_MISMATCH', 'DAMAGE', 'BUYER_REMORSE');
CREATE TYPE return_status AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  phone_number VARCHAR(20) UNIQUE,
  email VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255),
  role user_role NOT NULL DEFAULT 'CUSTOMER',
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name VARCHAR(150) NOT NULL,
  category vendor_category NOT NULL,
  commercial_register_doc VARCHAR(255),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '4 months'),
  subscription_fee NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  subscription_status subscription_status NOT NULL DEFAULT 'FREE_TRIAL',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  section_type vendor_category NOT NULL
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  product_code VARCHAR(100),
  description TEXT,
  base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  shipping_customs_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (shipping_customs_fee >= 0),
  is_shipping_included BOOLEAN NOT NULL DEFAULT FALSE,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  stock_quantity INTEGER NOT NULL DEFAULT 1 CHECK (stock_quantity >= 0),
  is_rfq_only BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  total_product_amount NUMERIC(12, 2) NOT NULL CHECK (total_product_amount >= 0),
  total_shipping_customs NUMERIC(12, 2) NOT NULL CHECK (total_shipping_customs >= 0),
  tech_service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tech_service_fee >= 0),
  grand_total NUMERIC(12, 2) NOT NULL CHECK (grand_total >= 0),
  status order_status NOT NULL DEFAULT 'PENDING',
  delivered_at TIMESTAMPTZ,
  escrow_status escrow_status NOT NULL DEFAULT 'HOLDING',
  escrow_released_at TIMESTAMPTZ,
  disputed BOOLEAN NOT NULL DEFAULT FALSE,
  payment_method payment_provider NOT NULL DEFAULT 'MANUAL',
  delivery_mode VARCHAR(20) NOT NULL DEFAULT 'DOOR',
  shipping_address TEXT,
  nearest_landmark TEXT,
  pickup_point_id UUID,
  tracking_number VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  is_ai_response BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_vendor_idx ON products(vendor_id);
CREATE INDEX products_category_idx ON products(category_id);
CREATE INDEX orders_customer_idx ON orders(customer_id);
CREATE INDEX orders_vendor_idx ON orders(vendor_id);
CREATE INDEX chat_order_idx ON chat_messages(order_id);

-- الإعلان المروّج منفصل عن المنتج والطلب العادي؛ التفعيل قرار إداري لا نتيجة لإرسال نموذج الدفع.
CREATE TABLE promotion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  status promotion_status NOT NULL DEFAULT 'PENDING',
  payment_provider payment_provider NOT NULL DEFAULT 'MANUAL',
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  duration_days INTEGER NOT NULL DEFAULT 7 CHECK (duration_days = 7),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((status = 'ACTIVE' AND starts_at IS NOT NULL AND ends_at IS NOT NULL) OR status <> 'ACTIVE'),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX promotion_pending_or_active_idx
  ON promotion_requests(vendor_id, product_id)
  WHERE status IN ('PENDING', 'ACTIVE');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX promotion_status_idx ON promotion_requests(status);
CREATE INDEX promotion_vendor_idx ON promotion_requests(vendor_id);
CREATE INDEX promotion_active_window_idx ON promotion_requests(starts_at, ends_at)
  WHERE status = 'ACTIVE';
CREATE INDEX notifications_user_idx ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX orders_escrow_release_idx ON orders(escrow_status, delivered_at) WHERE escrow_status = 'HOLDING';

CREATE TABLE return_requests (
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

CREATE TABLE product_warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL CHECK (duration_months BETWEEN 3 AND 12),
  terms TEXT,
  requires_maintenance_report BOOLEAN NOT NULL DEFAULT TRUE,
  requires_vin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  governorate VARCHAR(80) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE escrow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status escrow_status,
  to_status escrow_status NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
