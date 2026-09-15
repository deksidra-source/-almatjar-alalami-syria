import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function publicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("marketplace public procedures", () => {
  it("exposes the buyer-facing marketplace modules", () => {
    expect(appRouter._def.procedures).toHaveProperty("catalog.list");
    expect(appRouter._def.procedures).toHaveProperty("catalog.categories");
    expect(appRouter._def.procedures).toHaveProperty("reels.list");
    expect(appRouter._def.procedures).toHaveProperty("ai.chat");
    expect(appRouter._def.procedures).toHaveProperty("support.createTicket");
    expect(appRouter._def.procedures).toHaveProperty("imageSearch.analyze");
    expect(appRouter._def.procedures).toHaveProperty("auth.me");
    expect(appRouter._def.procedures).toHaveProperty("auth.logout");
  });

  it("returns an array from the public catalog endpoint", async () => {
    const caller = appRouter.createCaller(publicContext());
    const result = await caller.catalog.list({ query: "" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("keeps subscription policy explicit in the vendor creation contract", () => {
    const vendorRoute = appRouter._def.procedures["vendor.create"];
    expect(vendorRoute).toBeDefined();
    expect(appRouter._def.procedures).toHaveProperty("admin.updateSubscriptionPolicy");
  });
});
