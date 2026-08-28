import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../src/server.mjs", import.meta.url), "utf8");
const schema = await readFile(new URL("../../docs/postgresql-schema-draft.sql", import.meta.url), "utf8");

for (const route of ["/api/catalog", "/api/orders", "/api/promotion-requests", "/api/admin/promotion-requests", "/api/users/:userId/notifications"]) {
  test(`backend exposes ${route}`, () => assert.match(server, new RegExp(route.replaceAll("/", "\\/"))));
}

test("promotion policy is fixed to seven days and two store prices", () => {
  assert.match(server, /PROMOTION_DURATION_DAYS = 7/);
  assert.match(server, /SMALL_STORE: 1/);
  assert.match(server, /HEAVY_STORE: 10/);
  assert.match(schema, /CREATE TYPE payment_provider AS ENUM \('MANUAL', 'SHAM_CASH', 'ICASH'\)/);
});

test("electronic providers are rejected by the request route", () => {
  assert.match(server, /paymentProvider !== "MANUAL"/);
  assert.match(server, /Electronic providers are not enabled yet/);
});
