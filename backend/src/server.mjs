import express from "express";
import cors from "cors";
import { query } from "./db.mjs";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const PROMOTION_DURATION_DAYS = 7;
const PROMOTION_STORE_TYPES = new Set(["SMALL_STORE", "HEAVY_STORE"]);

function requireFields(body, fields) {
  const missing = fields.filter((field) => !body?.[field]);
  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }
}

function normalizeStoreType(value) {
  const storeType = String(value || "").trim().toUpperCase();
  return PROMOTION_STORE_TYPES.has(storeType) ? storeType : null;
}

async function requireAdmin(adminId) {
  requireFields({ adminId }, ["adminId"]);
  const result = await query("SELECT id FROM users WHERE id = $1 AND role = 'ADMIN' AND deleted_at IS NULL", [adminId]);
  if (!result.rowCount) {
    const error = new Error("A valid admin account is required");
    error.status = 403;
    throw error;
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "almatjar-alalami-syria-backend" });
});

app.get("/api/catalog", async (req, res, next) => {
  try {
    const values = [];
    const clauses = ["stock_quantity > 0"];
    if (req.query.category) {
      values.push(req.query.category);
      clauses.push(`category_id = $${values.length}`);
    }
    const result = await query(`SELECT id, vendor_id, title, product_code, description, base_price, shipping_customs_fee, is_shipping_included, images, stock_quantity, is_rfq_only FROM products WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 100`, values);
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});

app.get("/api/promotion-pricing", async (_req, res, next) => {
  try {
    const result = await query("SELECT store_type, price_usd, updated_at FROM promotion_pricing ORDER BY store_type");
    res.json({ pricing: result.rows });
  } catch (error) { next(error); }
});

app.get("/api/admin/promotion-pricing", async (req, res, next) => {
  try {
    await requireAdmin(req.query.adminId);
    const result = await query("SELECT store_type, price_usd, updated_by, updated_at FROM promotion_pricing ORDER BY store_type");
    res.json({ pricing: result.rows });
  } catch (error) { next(error); }
});

app.patch("/api/admin/promotion-pricing/:storeType", async (req, res, next) => {
  try {
    const storeType = normalizeStoreType(req.params.storeType);
    if (!storeType) return res.status(400).json({ error: "Unsupported store type" });
    await requireAdmin(req.body?.adminId);
    const price = Number(req.body?.priceUsd);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Price must be a non-negative number" });
    const result = await query(`INSERT INTO promotion_pricing (store_type, price_usd, updated_by, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (store_type) DO UPDATE SET price_usd = EXCLUDED.price_usd, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP
      RETURNING store_type, price_usd, updated_by, updated_at`, [storeType, price, req.body.adminId]);
    res.json({ pricing: result.rows[0] });
  } catch (error) { next(error); }
});

app.post("/api/promotion-requests", async (req, res, next) => {
  try {
    requireFields(req.body, ["vendorId", "storeType"]);
    const { vendorId, productId = null, paymentProvider = "MANUAL" } = req.body;
    const storeType = normalizeStoreType(req.body.storeType);
    if (!storeType) return res.status(400).json({ error: "Unsupported store type" });
    if (paymentProvider !== "MANUAL") return res.status(400).json({ error: "Electronic providers are not enabled yet" });
    const pricing = await query("SELECT price_usd FROM promotion_pricing WHERE store_type = $1", [storeType]);
    if (!pricing.rowCount) return res.status(409).json({ error: "Promotion price is not configured by an administrator" });
    const duplicate = await query("SELECT id FROM promotion_requests WHERE vendor_id = $1 AND product_id IS NOT DISTINCT FROM $2 AND status IN ('PENDING', 'ACTIVE') LIMIT 1", [vendorId, productId]);
    if (duplicate.rowCount) return res.status(409).json({ error: "A pending or active promotion already exists" });
    const result = await query(`INSERT INTO promotion_requests (vendor_id, product_id, status, payment_provider, price_usd, duration_days) VALUES ($1, $2, 'PENDING', 'MANUAL', $3, $4) RETURNING id, status, price_usd, duration_days, payment_provider, created_at`, [vendorId, productId, pricing.rows[0].price_usd, PROMOTION_DURATION_DAYS]);
    res.status(201).json({ request: result.rows[0] });
  } catch (error) { next(error); }
});

app.get("/api/vendors/:vendorId/promotion-requests", async (req, res, next) => {
  try {
    const result = await query("SELECT id, product_id, status, payment_provider, price_usd, duration_days, starts_at, ends_at, rejection_reason, created_at FROM promotion_requests WHERE vendor_id = $1 ORDER BY created_at DESC", [req.params.vendorId]);
    res.json({ requests: result.rows });
  } catch (error) { next(error); }
});

app.get("/api/admin/promotion-requests", async (req, res, next) => {
  try {
    const status = req.query.status || "PENDING";
    if (!["PENDING", "ACTIVE", "REJECTED", "EXPIRED", "CANCELLED"].includes(status)) return res.status(400).json({ error: "Unsupported status" });
    const result = await query("SELECT id, vendor_id, product_id, status, payment_provider, price_usd, duration_days, starts_at, ends_at, rejection_reason, created_at FROM promotion_requests WHERE status = $1 ORDER BY created_at ASC", [status]);
    res.json({ requests: result.rows });
  } catch (error) { next(error); }
});

app.get("/api/users/:userId/notifications", async (req, res, next) => {
  try {
    const result = await query("SELECT id, notification_type, title, body, entity_id, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [req.params.userId]);
    res.json({ notifications: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    requireFields(req.body, ["customerId", "vendorId", "totalProductAmount", "totalShippingCustoms"]);
    const { customerId, vendorId, totalProductAmount, totalShippingCustoms, techServiceFee = 0 } = req.body;
    const grandTotal = Number(totalProductAmount) + Number(totalShippingCustoms) + Number(techServiceFee);
    if (![totalProductAmount, totalShippingCustoms, techServiceFee].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) return res.status(400).json({ error: "Amounts must be non-negative numbers" });
    const result = await query("INSERT INTO orders (customer_id, vendor_id, total_product_amount, total_shipping_customs, tech_service_fee, grand_total) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [customerId, vendorId, totalProductAmount, totalShippingCustoms, techServiceFee, grandTotal]);
    res.status(201).json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

app.post("/api/admin/promotion-requests/:id/decision", async (req, res, next) => {
  try {
    requireFields(req.body, ["adminId", "decision"]);
    const { adminId, decision, rejectionReason = null } = req.body;
    if (!['ACTIVE', 'REJECTED'].includes(decision)) return res.status(400).json({ error: "Decision must be ACTIVE or REJECTED" });
    const result = decision === "ACTIVE"
      ? await query("UPDATE promotion_requests SET status = 'ACTIVE', starts_at = CURRENT_TIMESTAMP, ends_at = CURRENT_TIMESTAMP + INTERVAL '7 days', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2 AND status = 'PENDING' RETURNING *", [adminId, req.params.id])
      : await query("UPDATE promotion_requests SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'PENDING' RETURNING *", [rejectionReason, adminId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Pending promotion request not found" });
    const request = result.rows[0];
    const vendor = await query("SELECT user_id FROM vendors WHERE id = $1", [request.vendor_id]);
    if (vendor.rowCount) {
      const title = request.status === "ACTIVE" ? "تم قبول الإعلان المروّج" : "تم رفض الإعلان المروّج";
      const body = request.status === "ACTIVE" ? "تم تفعيل الإعلان لمدة 7 أيام بعد المراجعة اليدوية." : `تم رفض الطلب بعد المراجعة اليدوية.${request.rejection_reason ? ` السبب: ${request.rejection_reason}` : ""}`;
      await query("INSERT INTO notifications (user_id, notification_type, title, body, entity_id) VALUES ($1, 'promotion_status_changed', $2, $3, $4)", [vendor.rows[0].user_id, title, body, request.id]);
    }
    res.json({ request, notification: { type: "promotion_status_changed", status: request.status } });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "Internal server error" });
});

app.listen(port, () => console.log(`Almatjar backend listening on port ${port}`));
