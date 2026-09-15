import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  cartItems,
  categories,
  messages,
  orderItems,
  orders,
  platformSettings,
  products,
  reels,
  imageSearchRequests,
  supportTickets,
  vendors,
} from "../drizzle/schema";
import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const storeType = z.enum(["SMALL_STORE", "HEAVY_STORE"]);
const paymentMethod = z.enum(["COD", "SYRIATEL_CASH", "ECASH", "BANK_TRANSFER", "MANUAL"]);

const vendorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.select().from(vendors).where(eq(vendors.ownerId, ctx.user.id)).limit(1);
  if (!result[0]) throw new Error("Vendor account is required");
  return next({ ctx: { ...ctx, db, vendor: result[0] } });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new Error("Administrator access is required");
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  catalog: router({
    list: publicProcedure.input(z.object({ query: z.string().optional(), categoryId: z.number().optional(), storeType: storeType.optional() }).optional()).query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = [eq(products.status, "PUBLISHED")];
      if (input?.categoryId) filters.push(eq(products.categoryId, input.categoryId));
      const rows = await db.select().from(products).where(and(...filters)).orderBy(desc(products.createdAt)).limit(60);
      const query = input?.query?.trim().toLowerCase();
      return query ? rows.filter(product => `${product.title} ${product.description ?? ""}`.toLowerCase().includes(query)) : rows;
    }),
    categories: publicProcedure.query(async () => {
      const db = await getDb();
      return db ? db.select().from(categories) : [];
    }),
  }),
  reels: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      return db ? db.select().from(reels).where(eq(reels.status, "PUBLISHED")).orderBy(desc(reels.createdAt)).limit(30) : [];
    }),
    submit: vendorProcedure.input(z.object({ title: z.string().min(2), mediaUrl: z.string().url() })).mutation(async ({ input, ctx }) => {
      const [result] = await ctx.db.insert(reels).values({ vendorId: ctx.vendor.id, title: input.title, mediaUrl: input.mediaUrl, status: "PENDING_REVIEW" });
      return { id: Number(result.insertId), status: "PENDING_REVIEW" as const };
    }),
  }),
  ai: router({
    chat: protectedProcedure.input(z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(20) })).mutation(async ({ input }) => {
      const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 700, messages: [{ role: "system", content: "أنت مساعد المتجر العالمي سوريا. أجب بالعربية بإيجاز ووضوح. ساعد في اختيار المنتجات، فهم الطلبات، الشحن، الدفع، وفتح المتجر. لا تخترع أسعارًا أو توفرًا غير موجود، واذكر أن السعر النهائي يؤكده التاجر." }, ...input.messages] });
      const content = result.choices[0]?.message.content;
      return { content: typeof content === "string" ? content : "أعتذر، لم أتمكن من إعداد إجابة الآن." };
    }),
  }),
  support: router({
    createTicket: protectedProcedure.input(z.object({ subject: z.string().min(2).max(180), body: z.string().min(5).max(5000) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const [result] = await db.insert(supportTickets).values({ userId: ctx.user.id, subject: input.subject, body: input.body });
      return { id: Number(result.insertId), status: "OPEN" as const };
    }),
  }),
  imageSearch: router({
    analyze: protectedProcedure.input(z.object({ imageUrl: z.string().max(2_000_000).optional(), description: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (db) await db.insert(imageSearchRequests).values({ userId: ctx.user.id, imageUrl: input.imageUrl, queryText: input.description });
      const userContent = input.imageUrl ? [{ type: "text" as const, text: input.description ? `حلل الصورة واقترح كلمات بحث عربية قصيرة. اسم الملف: ${input.description}` : "حلل الصورة واقترح كلمات بحث عربية قصيرة." }, { type: "image_url" as const, image_url: { url: input.imageUrl, detail: "low" as const } }] : (input.description ? `الوصف: ${input.description}` : "اقترح كلمات بحث عامة لمنتج من صورة مرفوعة.");
      const result = await invokeLLM({ model: "gpt-5-mini", maxTokens: 220, messages: [{ role: "system", content: "أنت مساعد بحث بصري لمتجر عربي. اقترح كلمات بحث عربية قصيرة من الصورة أو الوصف فقط. لا تدّعي التعرف الدقيق على منتج غير واضح." }, { role: "user", content: userContent }] });
      const content = result.choices[0]?.message.content;
      return { query: typeof content === "string" ? content : "منتج، متجر، شراء" };
    }),
  }),
  vendor: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      return (await db.select().from(vendors).where(eq(vendors.ownerId, ctx.user.id)).limit(1))[0] ?? null;
    }),
    create: protectedProcedure.input(z.object({ storeName: z.string().min(2), storeType, description: z.string().optional(), phone: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const existing = await db.select().from(vendors).where(eq(vendors.ownerId, ctx.user.id)).limit(1);
      if (existing[0]) return existing[0];
      const trialEndsAt = new Date();
      trialEndsAt.setMonth(trialEndsAt.getMonth() + 3);
      const [result] = await db.insert(vendors).values({ ownerId: ctx.user.id, storeName: input.storeName, storeType: input.storeType, description: input.description, phone: input.phone, trialEndsAt, monthlyFeeUsd: "5.00", subscriptionStatus: "TRIAL" });
      return (await db.select().from(vendors).where(eq(vendors.id, Number(result.insertId))).limit(1))[0];
    }),
    products: vendorProcedure.query(async ({ ctx }) => ctx.db.select().from(products).where(eq(products.vendorId, ctx.vendor.id)).orderBy(desc(products.createdAt))),
    addProduct: vendorProcedure.input(z.object({ title: z.string().min(2), description: z.string().optional(), price: z.string().regex(/^\d+(\.\d{1,2})?$/), stockQuantity: z.number().int().nonnegative(), categoryId: z.number().optional(), images: z.array(z.string()).default([]) })).mutation(async ({ input, ctx }) => {
      const slug = `${input.title.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")}-${Date.now()}`;
      const [result] = await ctx.db.insert(products).values({ vendorId: ctx.vendor.id, title: input.title, slug, description: input.description, price: input.price, stockQuantity: input.stockQuantity, categoryId: input.categoryId, images: input.images, options: {}, status: "PUBLISHED" });
      return { id: Number(result.insertId), slug };
    }),
  }),
  cart: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ item: cartItems, product: products }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, ctx.user.id));
    }),
    add: protectedProcedure.input(z.object({ productId: z.number(), quantity: z.number().int().positive().default(1), selectedOptions: z.record(z.string(), z.string()).default({}) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const product = (await db.select().from(products).where(eq(products.id, input.productId)).limit(1))[0];
      if (!product || product.status !== "PUBLISHED") throw new Error("Product is not available");
      if (product.stockQuantity < input.quantity) throw new Error("Quantity exceeds stock");
      const selectedOptions = input.selectedOptions as Record<string, string>;
      await db.insert(cartItems).values({ userId: ctx.user.id, productId: input.productId, quantity: input.quantity, selectedOptions }).onDuplicateKeyUpdate({ set: { quantity: input.quantity, selectedOptions } });
      return { success: true } as const;
    }),
    remove: protectedProcedure.input(z.object({ productId: z.number() })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.delete(cartItems).where(and(eq(cartItems.userId, ctx.user.id), eq(cartItems.productId, input.productId)));
      return { success: true } as const;
    }),
  }),
  orders: router({
    create: protectedProcedure.input(z.object({ vendorId: z.number(), paymentMethod, shippingAddress: z.string().min(5), customerNote: z.string().optional(), items: z.array(z.object({ productId: z.number(), quantity: z.number().int().positive(), selectedOptions: z.record(z.string(), z.string()).default({}) })).min(1) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const rows = await db.select().from(products).where(and(eq(products.vendorId, input.vendorId), inArray(products.id, input.items.map(item => item.productId)), eq(products.status, "PUBLISHED")));
      if (rows.length !== input.items.length) throw new Error("One or more products are unavailable");
      const totalProductAmount = input.items.reduce((sum, item) => {
        const product = rows.find(row => row.id === item.productId);
        if (!product || product.stockQuantity < item.quantity) throw new Error("Quantity exceeds stock");
        return sum + Number(product.price) * item.quantity;
      }, 0);
      const [result] = await db.insert(orders).values({ customerId: ctx.user.id, vendorId: input.vendorId, paymentMethod: input.paymentMethod, totalProductAmount: totalProductAmount.toFixed(2), grandTotal: totalProductAmount.toFixed(2), shippingAddress: input.shippingAddress, customerNote: input.customerNote });
      const orderId = Number(result.insertId);
      await db.insert(orderItems).values(input.items.map(item => ({ orderId, productId: item.productId, quantity: item.quantity, unitPrice: rows.find(row => row.id === item.productId)!.price, selectedOptions: item.selectedOptions as Record<string, string> })));
      return { orderId };
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      return db ? db.select().from(orders).where(eq(orders.customerId, ctx.user.id)).orderBy(desc(orders.createdAt)) : [];
    }),
    vendorList: vendorProcedure.query(async ({ ctx }) => ctx.db.select().from(orders).where(eq(orders.vendorId, ctx.vendor.id)).orderBy(desc(orders.createdAt))),
    confirmPaid: vendorProcedure.input(z.object({ orderId: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await ctx.db.update(orders).set({ paymentStatus: "PAID", orderStatus: "PROCESSING" }).where(and(eq(orders.id, input.orderId), eq(orders.vendorId, ctx.vendor.id), eq(orders.paymentStatus, "PENDING"), inArray(orders.paymentMethod, ["SYRIATEL_CASH", "ECASH", "BANK_TRANSFER"])));
      if (!result[0].affectedRows) throw new Error("Order is not pending payment or does not belong to this vendor");
      return { success: true, paymentStatus: "PAID" as const, orderStatus: "PROCESSING" as const };
    }),
    markShipped: vendorProcedure.input(z.object({ orderId: z.number(), shippingProvider: z.string().min(2), waybillOrNotes: z.string().optional(), contactPhone: z.string().optional() })).mutation(async ({ input, ctx }) => {
      const result = await ctx.db.update(orders).set({ orderStatus: "SHIPPED", shippingProvider: input.shippingProvider, waybillOrNotes: input.waybillOrNotes, contactPhone: input.contactPhone }).where(and(eq(orders.id, input.orderId), eq(orders.vendorId, ctx.vendor.id), or(eq(orders.orderStatus, "PROCESSING"), eq(orders.orderStatus, "PENDING")), or(eq(orders.paymentMethod, "COD"), eq(orders.paymentStatus, "PAID"))));
      if (!result[0].affectedRows) throw new Error("Order cannot be shipped from its current state");
      return { success: true, orderStatus: "SHIPPED" as const };
    }),
    markDelivered: vendorProcedure.input(z.object({ orderId: z.number() })).mutation(async ({ input, ctx }) => {
      return ctx.db.transaction(async tx => {
        const order = (await tx.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.vendorId, ctx.vendor.id), eq(orders.orderStatus, "SHIPPED"), isNull(orders.commissionDeductedAt))).limit(1))[0];
        if (!order) throw new Error("Order must be shipped and not already settled");
        const setting = (await tx.select().from(platformSettings).where(eq(platformSettings.key, "platform_commission_percent")).limit(1))[0];
        const commissionRate = Math.max(0, Number(setting?.value ?? "0"));
        const commissionAmount = (Number(order.grandTotal) * commissionRate / 100).toFixed(2);
        if (Number(commissionAmount) > Number(ctx.vendor.prepaidWalletBalance)) throw new Error("Vendor prepaid wallet balance is insufficient");
        const walletUpdate = await tx.update(vendors).set({ prepaidWalletBalance: (Number(ctx.vendor.prepaidWalletBalance) - Number(commissionAmount)).toFixed(2) }).where(and(eq(vendors.id, ctx.vendor.id), gte(vendors.prepaidWalletBalance, commissionAmount)));
        if (!walletUpdate[0].affectedRows && Number(commissionAmount) > 0) throw new Error("Vendor prepaid wallet balance changed; retry");
        const result = await tx.update(orders).set({ orderStatus: "DELIVERED", commissionAmount, commissionDeductedAt: new Date() }).where(and(eq(orders.id, input.orderId), eq(orders.vendorId, ctx.vendor.id), eq(orders.orderStatus, "SHIPPED"), isNull(orders.commissionDeductedAt)));
        if (!result[0].affectedRows) throw new Error("Order was updated by another action");
        return { success: true, orderStatus: "DELIVERED" as const, commissionAmount };
      });
    }),
  }),
  chat: router({
    list: protectedProcedure.input(z.object({ otherUserId: z.number().optional(), orderId: z.number().optional() }).optional()).query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const filters = input?.orderId ? eq(messages.orderId, input.orderId) : input?.otherUserId ? or(and(eq(messages.senderId, ctx.user.id), eq(messages.recipientId, input.otherUserId)), and(eq(messages.senderId, input.otherUserId), eq(messages.recipientId, ctx.user.id))) : or(eq(messages.senderId, ctx.user.id), eq(messages.recipientId, ctx.user.id));
      return db.select().from(messages).where(filters).orderBy(desc(messages.createdAt)).limit(100);
    }),
    send: protectedProcedure.input(z.object({ recipientId: z.number(), orderId: z.number().optional(), body: z.string().min(1).max(4000) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      const [result] = await db.insert(messages).values({ senderId: ctx.user.id, recipientId: input.recipientId, orderId: input.orderId, body: input.body });
      return { id: Number(result.insertId) };
    }),
  }),
  admin: router({
    subscriptionPolicy: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { trialMonths: 3, monthlyFeeUsd: "5.00", commissionPercent: "0.00" };
      const rows = await db.select().from(platformSettings).where(inArray(platformSettings.key, ["trial_months", "monthly_fee_usd", "platform_commission_percent"]));
      return { trialMonths: Number(rows.find(row => row.key === "trial_months")?.value ?? 3), monthlyFeeUsd: rows.find(row => row.key === "monthly_fee_usd")?.value ?? "5.00", commissionPercent: rows.find(row => row.key === "platform_commission_percent")?.value ?? "0.00" };
    }),
    updateSubscriptionPolicy: adminProcedure.input(z.object({ trialMonths: z.literal(3), monthlyFeeUsd: z.literal("5.00") })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      for (const [key, value] of [["trial_months", String(input.trialMonths)], ["monthly_fee_usd", input.monthlyFeeUsd]] as const) {
        await db.insert(platformSettings).values({ key, value, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { value, updatedBy: ctx.user.id } });
      }
      return input;
    }),
    updateCommissionPolicy: adminProcedure.input(z.object({ commissionPercent: z.string().regex(/^(100|[0-9]{1,2})(\.\d{1,2})?$/) })).mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database is not configured");
      await db.insert(platformSettings).values({ key: "platform_commission_percent", value: input.commissionPercent, updatedBy: ctx.user.id }).onDuplicateKeyUpdate({ set: { value: input.commissionPercent, updatedBy: ctx.user.id } });
      return input;
    }),
  }),
});

export type AppRouter = typeof appRouter;
