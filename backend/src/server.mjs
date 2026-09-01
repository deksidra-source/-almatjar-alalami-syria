import express from "express";
import cors from "cors";
import { query } from "./db.mjs";
import { DELIVERY_MODES, PAYMENT_METHODS, RETURN_REASONS } from "./order-contract.mjs";
import { askGemini, geminiConfigured } from "./gemini.mjs";

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const promotionPrices = Object.freeze({ SMALL_STORE: 1, HEAVY_STORE: 10 });
const PROMOTION_DURATION_DAYS = 7;

function requireFields(body, fields) {
  const missing = fields.filter((field) => !body?.[field]);
  if (missing.length) {
    const error = new Error(`Missing fields: ${missing.join(", ")}`);
    error.status = 400;
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

app.post("/api/promotion-requests", async (req, res, next) => {
  try {
    requireFields(req.body, ["vendorId", "storeType"]);
    const { vendorId, productId = null, storeType, paymentProvider = "MANUAL" } = req.body;
    if (!(storeType in promotionPrices)) return res.status(400).json({ error: "Unsupported store type" });
    if (paymentProvider !== "MANUAL") return res.status(400).json({ error: "Electronic providers are not enabled yet" });
    const duplicate = await query("SELECT id FROM promotion_requests WHERE vendor_id = $1 AND product_id IS NOT DISTINCT FROM $2 AND status IN ('PENDING', 'ACTIVE') LIMIT 1", [vendorId, productId]);
    if (duplicate.rowCount) return res.status(409).json({ error: "A pending or active promotion already exists" });
    const result = await query(`INSERT INTO promotion_requests (vendor_id, product_id, status, payment_provider, price_usd, duration_days) VALUES ($1, $2, 'PENDING', 'MANUAL', $3, $4) RETURNING id, status, price_usd, duration_days, payment_provider, created_at`, [vendorId, productId, promotionPrices[storeType], PROMOTION_DURATION_DAYS]);
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
    const { customerId, vendorId, totalProductAmount, totalShippingCustoms, techServiceFee = 0, paymentMethod = 'COD', deliveryMode = 'DOOR', shippingAddress = null, nearestLandmark = null, pickupPointId = null } = req.body;
    if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: 'Payment method must be COD or MANUAL' });
    if (!DELIVERY_MODES.has(deliveryMode)) return res.status(400).json({ error: 'Delivery mode must be DOOR or PICKUP' });
    if (deliveryMode === 'DOOR' && !shippingAddress && !nearestLandmark) return res.status(400).json({ error: 'A door delivery address or landmark is required' });
    if (deliveryMode === 'PICKUP' && !pickupPointId) return res.status(400).json({ error: 'A pickup point is required' });
    const grandTotal = Number(totalProductAmount) + Number(totalShippingCustoms) + Number(techServiceFee);
    if (![totalProductAmount, totalShippingCustoms, techServiceFee].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) return res.status(400).json({ error: "Amounts must be non-negative numbers" });
    const vendor = await query("SELECT shipping_contract_verified, shipping_contract_expires_at FROM vendors WHERE id = $1", [vendorId]);
    if (!vendor.rowCount) return res.status(404).json({ error: "Vendor not found" });
    const contract = vendor.rows[0];
    if (!contract.shipping_contract_verified || !contract.shipping_contract_expires_at || new Date(contract.shipping_contract_expires_at).getTime() <= Date.now()) return res.status(409).json({ error: "Vendor shipping contract must be verified and active" });
    const result = await query("INSERT INTO orders (customer_id, vendor_id, total_product_amount, total_shipping_customs, tech_service_fee, grand_total, payment_method, delivery_mode, shipping_address, nearest_landmark, pickup_point_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *", [customerId, vendorId, totalProductAmount, totalShippingCustoms, techServiceFee, grandTotal, paymentMethod, deliveryMode, shippingAddress, nearestLandmark, pickupPointId]);
    res.status(201).json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/orders/:orderId/delivered', async (req, res, next) => {
  try {
    const result = await query("UPDATE orders SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP, escrow_status = 'HOLDING' WHERE id = $1 AND status IN ('SHIPPED', 'CUSTOMS_CLEARED') RETURNING id, status, delivered_at, escrow_status", [req.params.orderId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Order is not ready to be marked delivered' });
    await query("INSERT INTO escrow_events (order_id, to_status, note) VALUES ($1, 'HOLDING', 'Delivery confirmed; 7-day escrow window started')", [req.params.orderId]);
    res.json({ order: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/orders/:orderId/returns', async (req, res, next) => {
  try {
    requireFields(req.body, ['customerId', 'reason']);
    const { customerId, reason, proofImages = [], vinNumber = null } = req.body;
    if (!RETURN_REASONS.has(reason)) return res.status(400).json({ error: 'Unsupported return reason' });
    if (!Array.isArray(proofImages) || proofImages.length > 8) return res.status(400).json({ error: 'proofImages must contain at most 8 URLs' });
    if (['DEFECT', 'MISMATCH', 'DAMAGE', 'VIN_MISMATCH'].includes(reason) && proofImages.length === 0) return res.status(400).json({ error: 'At least one proof image is required for this reason' });
    if (reason === 'VIN_MISMATCH' && !vinNumber) return res.status(400).json({ error: 'VIN is required for VIN mismatch claims' });
    const order = await query("SELECT id, customer_id, status, escrow_status FROM orders WHERE id = $1 AND customer_id = $2", [req.params.orderId, customerId]);
    if (!order.rowCount) return res.status(404).json({ error: 'Order not found' });
    if (order.rows[0].status !== 'DELIVERED') return res.status(400).json({ error: 'Returns are available after delivery' });
    const result = await query("INSERT INTO return_requests (order_id, customer_id, reason, proof_images, vin_number) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING *", [req.params.orderId, customerId, reason, JSON.stringify(proofImages), vinNumber]);
    await query("UPDATE orders SET disputed = TRUE, escrow_status = 'DISPUTED' WHERE id = $1 AND escrow_status = 'HOLDING'", [req.params.orderId]);
    await query("INSERT INTO escrow_events (order_id, from_status, to_status, note) VALUES ($1, 'HOLDING', 'DISPUTED', $2)", [req.params.orderId, `Return requested: ${reason}`]);
    res.status(201).json({ returnRequest: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/admin/returns/:returnId/decision', async (req, res, next) => {
  try {
    requireFields(req.body, ['adminId', 'decision']);
    const { adminId, decision, sellerFault = false, returnShippingCost = 0, decisionNote = null } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });
    if (!Number.isFinite(Number(returnShippingCost)) || Number(returnShippingCost) < 0) return res.status(400).json({ error: 'returnShippingCost must be non-negative' });
    const shippingCostCharged = sellerFault ? 0 : Number(returnShippingCost);
    const result = await query("UPDATE return_requests SET status = $1, seller_fault = $2, shipping_cost_charged = $3, decision_note = $4, reviewed_by = $5, reviewed_at = CURRENT_TIMESTAMP WHERE id = $6 AND status IN ('REQUESTED', 'UNDER_REVIEW') RETURNING *", [decision, Boolean(sellerFault), shippingCostCharged, decisionNote, adminId, req.params.returnId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Return request not found or already decided' });
    const request = result.rows[0];
    if (decision === 'APPROVED') {
      await query("UPDATE orders SET escrow_status = 'REFUNDED' WHERE id = $1 AND escrow_status = 'DISPUTED'", [request.order_id]);
      await query("INSERT INTO escrow_events (order_id, from_status, to_status, actor_id, note) VALUES ($1, 'DISPUTED', 'REFUNDED', $2, $3)", [request.order_id, adminId, sellerFault ? 'Approved: seller bears all return shipping' : 'Approved: return shipping deducted from refund']);
    }
    res.json({ returnRequest: request, shippingCostCharged });
  } catch (error) { next(error); }
});

app.get('/api/orders/:orderId/returns', async (req, res, next) => {
  try { const result = await query('SELECT * FROM return_requests WHERE order_id = $1 ORDER BY created_at DESC', [req.params.orderId]); res.json({ requests: result.rows }); }
  catch (error) { next(error); }
});

app.post('/api/scheduled/release-escrow', async (req, res, next) => {
  try {
    if (!process.env.CRON_SECRET || req.get('x-cron-secret') !== process.env.CRON_SECRET) return res.status(403).json({ error: 'cron-only' });
    const result = await query('SELECT release_eligible_escrow() AS released_count');
    res.json({ ok: true, releasedCount: Number(result.rows[0].released_count) });
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

function validateMerchantShippingContract(body) {
  requireFields(body, ['shippingCompanyName', 'shippingContractReference', 'shippingContractExpiresAt']);
  if (new Date(body.shippingContractExpiresAt).getTime() <= Date.now()) { const error = new Error('Shipping contract must be active'); error.status = 400; throw error; }
}

app.post('/api/vendors/:vendorId/shipping-contract', async (req, res, next) => {
  try {
    validateMerchantShippingContract(req.body);
    const { shippingCompanyName, shippingContractReference, shippingContractExpiresAt, whatsappBusinessNumber = null } = req.body;
    const result = await query(`UPDATE vendors SET shipping_company_name = $1, shipping_contract_reference = $2, shipping_contract_expires_at = $3, shipping_contract_verified = FALSE, whatsapp_business_number = $4 WHERE id = $5 RETURNING id, shipping_company_name, shipping_contract_reference, shipping_contract_expires_at, shipping_contract_verified, whatsapp_business_number, ai_provider`, [shippingCompanyName, shippingContractReference, shippingContractExpiresAt, whatsappBusinessNumber, req.params.vendorId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ vendor: result.rows[0], messageChannel: 'WHATSAPP_ONLY', smsEnabled: false });
  } catch (error) { next(error); }
});

app.post('/api/vendors/:vendorId/reels', async (req, res, next) => {
  try {
    requireFields(req.body, ['title', 'mediaUrl', 'durationSeconds']);
    const { title, mediaUrl, coverUrl = null, durationSeconds, filterName = 'ORIGINAL', isAd = false } = req.body;
    if (![10, 20, 60].includes(Number(durationSeconds))) return res.status(400).json({ error: 'durationSeconds must be 10, 20, or 60' });
    const vendor = await query('SELECT id, shipping_contract_verified FROM vendors WHERE id = $1', [req.params.vendorId]);
    if (!vendor.rowCount) return res.status(404).json({ error: 'Vendor not found' });
    const result = await query(`INSERT INTO reels (vendor_id, title, media_url, cover_url, duration_seconds, filter_name, is_ad) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [req.params.vendorId, title, mediaUrl, coverUrl, durationSeconds, filterName, Boolean(isAd)]);
    res.status(201).json({ reel: result.rows[0], status: 'PENDING_REVIEW', publisher: 'VENDOR_ONLY' });
  } catch (error) { next(error); }
});

app.post('/api/reels/:reelId/like', async (req, res, next) => {
  try { requireFields(req.body, ['userId']); const result = await query('INSERT INTO reel_likes (reel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING reel_id', [req.params.reelId, req.body.userId]); res.json({ liked: Boolean(result.rowCount) }); }
  catch (error) { next(error); }
});

app.post('/api/reels/:reelId/comments', async (req, res, next) => {
  try { requireFields(req.body, ['userId', 'body']); const result = await query('INSERT INTO reel_comments (reel_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, reel_id, user_id, body, created_at', [req.params.reelId, req.body.userId, req.body.body]); res.status(201).json({ comment: result.rows[0] }); }
  catch (error) { next(error); }
});

app.post('/api/vendors/:vendorId/follow', async (req, res, next) => {
  try { requireFields(req.body, ['userId']); const result = await query('INSERT INTO vendor_follows (vendor_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING vendor_id', [req.params.vendorId, req.body.userId]); res.json({ following: Boolean(result.rowCount) }); }
  catch (error) { next(error); }
});

app.get('/api/vendors/:vendorId/dashboard', async (req, res, next) => {
  try { const result = await query('SELECT * FROM vendor_dashboard_metrics WHERE vendor_id = $1', [req.params.vendorId]); if (!result.rowCount) return res.status(404).json({ error: 'Vendor not found' }); res.json({ metrics: result.rows[0], growth: { status: 'CALCULATED_FROM_REAL_DATA' } }); }
  catch (error) { next(error); }
});

app.post('/api/ai/assistant', async (req, res, next) => {
  try {
    requireFields(req.body, ['prompt']);
    const answer = await askGemini({ system: 'أنت مساعد تسوق سوري عملي. اقترح منتجات ونقاط استلام، ولا تعد المستخدم ببيانات غير موجودة.', prompt: req.body.prompt });
    res.json({ provider: 'GEMINI', answer });
  } catch (error) { next(error); }
});

app.post('/api/ai/visual-search', async (req, res, next) => {
  try {
    requireFields(req.body, ['imageDataUrl']);
    const answer = await askGemini({ system: 'حلل صورة المنتج واستخرج وصفًا قصيرًا وكلمات بحث عربية وإنجليزية. لا تدّعِ تطابقًا مع مخزون غير متصل.', prompt: 'حلل المنتج الظاهر في الصورة وحدد نوعه وخصائصه وكلمات البحث المناسبة.', imageDataUrl: req.body.imageDataUrl });
    res.json({ provider: 'GEMINI', query: answer });
  } catch (error) { next(error); }
});

app.get('/api/ai/status', (_req, res) => res.json({ provider: 'GEMINI', configured: geminiConfigured() }));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "Internal server error" });
});

app.listen(port, () => console.log(`Almatjar backend listening on port ${port}`));
