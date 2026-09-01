import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
const schema = await readFile(new URL("../../docs/postgresql-schema-draft.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../docs/migrations/003_vendor_reels_analytics.sql", import.meta.url), "utf8");

for (const route of ["/api/catalog", "/api/orders", "/api/orders/:orderId/delivered", "/api/orders/:orderId/returns", "/api/admin/returns/:returnId/decision", "/api/promotion-requests", "/api/admin/promotion-requests", "/api/users/:userId/notifications"]) {
  test(`backend exposes ${route}`, () => assert.match(server, new RegExp(route.replaceAll("/", "\\/"))));
}

test("promotion policy is fixed to seven days and two store prices", () => {
  assert.match(server, /PROMOTION_DURATION_DAYS = 7/);
  assert.match(server, /SMALL_STORE: 1/);
  assert.match(server, /HEAVY_STORE: 10/);
  assert.match(schema, /CREATE TYPE payment_provider AS ENUM \('MANUAL', 'COD', 'SHAM_CASH', 'ICASH'\)/);
});

test("return policy requires proof and VIN for VIN mismatch claims", () => {
  assert.match(server, /At least one proof image is required/);
  assert.match(server, /VIN is required for VIN mismatch claims/);
  assert.match(server, /sellerFault \? 0/);
});

test("electronic providers are rejected by the request route", () => {
  assert.match(server, /paymentProvider !== "MANUAL"/);
  assert.match(server, /Electronic providers are not enabled yet/);
});

for (const route of ["/api/vendors/:vendorId/shipping-contract", "/api/vendors/:vendorId/reels", "/api/reels/:reelId/like", "/api/reels/:reelId/comments", "/api/vendors/:vendorId/follow", "/api/vendors/:vendorId/dashboard", "/api/ai/assistant", "/api/ai/visual-search"]) {
  test(`new MVP route exists ${route}`, () => assert.match(server, new RegExp(route.replaceAll("/", "\\/"))));
}

test("merchant shipping contract is required before orders", () => {
  assert.match(server, /Vendor shipping contract must be verified and active/);
  assert.match(migration, /shipping_contract_verified BOOLEAN NOT NULL DEFAULT FALSE/);
});

test("reels are merchant-only and support approved durations", () => {
  assert.match(server, /publisher: 'VENDOR_ONLY'/);
  assert.match(server, /\[10, 20, 60\]/);
  assert.match(migration, /status VARCHAR\(30\) NOT NULL DEFAULT 'PENDING_REVIEW'/);
});

test("AI provider is Gemini and never falls back to SMS", () => {
  assert.match(server, /provider: 'GEMINI'/);
  assert.match(server, /messageChannel: 'WHATSAPP_ONLY'/);
  assert.match(migration, /ai_provider VARCHAR\(40\) NOT NULL DEFAULT 'GEMINI'/);
});
