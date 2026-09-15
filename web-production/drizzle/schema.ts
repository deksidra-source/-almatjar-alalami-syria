import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  isSuspended: boolean("isSuspended").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const vendors = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id),
  storeName: varchar("storeName", { length: 160 }).notNull(),
  storeType: mysqlEnum("storeType", ["SMALL_STORE", "HEAVY_STORE"]).default("SMALL_STORE").notNull(),
  description: text("description"),
  phone: varchar("phone", { length: 40 }),
  syriatelCashEnabled: boolean("syriatelCashEnabled").default(false).notNull(),
  ecashBemoEnabled: boolean("ecashBemoEnabled").default(false).notNull(),
  paymentAccountNumber: varchar("paymentAccountNumber", { length: 160 }),
  paymentIban: varchar("paymentIban", { length: 160 }),
  paymentInstructions: text("paymentInstructions"),
  trialEndsAt: timestamp("trialEndsAt").notNull(),
  monthlyFeeUsd: decimal("monthlyFeeUsd", { precision: 10, scale: 2 }).default("5.00").notNull(),
  prepaidWalletBalance: decimal("prepaidWalletBalance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  subscriptionStatus: mysqlEnum("subscriptionStatus", ["TRIAL", "ACTIVE", "PAUSED", "EXPIRED"]).default("TRIAL").notNull(),
  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  storeVisibility: mysqlEnum("storeVisibility", ["ACTIVE", "INACTIVE"]).default("ACTIVE").notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ ownerIdx: index("vendors_owner_idx").on(table.ownerId) }));

export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  sectionType: mysqlEnum("sectionType", ["SMALL_STORE", "HEAVY_STORE"]).default("SMALL_STORE").notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
  categoryId: int("categoryId").references(() => categories.id),
  title: varchar("title", { length: 240 }).notNull(),
  slug: varchar("slug", { length: 260 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  compareAtPrice: decimal("compareAtPrice", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 8 }).default("SYP").notNull(),
  stockQuantity: int("stockQuantity").default(0).notNull(),
  images: json("images").$type<string[]>().notNull(),
  options: json("options").$type<Record<string, string[]>>().notNull(),
  status: mysqlEnum("status", ["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ vendorIdx: index("products_vendor_idx").on(table.vendorId), slugIdx: uniqueIndex("products_slug_idx").on(table.slug) }));

export const cartItems = mysqlTable("cartItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id),
  productId: int("productId").notNull().references(() => products.id),
  quantity: int("quantity").default(1).notNull(),
  selectedOptions: json("selectedOptions").$type<Record<string, string>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ userProductIdx: uniqueIndex("cart_user_product_idx").on(table.userId, table.productId) }));

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().references(() => users.id),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
  paymentMethod: mysqlEnum("paymentMethod", ["COD", "SYRIATEL_CASH", "ECASH", "BANK_TRANSFER", "MANUAL"]).default("COD").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["PENDING", "PAID"]).default("PENDING").notNull(),
  orderStatus: mysqlEnum("orderStatus", ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).default("PENDING").notNull(),
  totalProductAmount: decimal("totalProductAmount", { precision: 12, scale: 2 }).notNull(),
  shippingAmount: decimal("shippingAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  customsAmount: decimal("customsAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  grandTotal: decimal("grandTotal", { precision: 12, scale: 2 }).notNull(),
  shippingProvider: varchar("shippingProvider", { length: 160 }),
  waybillOrNotes: text("waybillOrNotes"),
  contactPhone: varchar("contactPhone", { length: 40 }),
  commissionAmount: decimal("commissionAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  commissionDeductedAt: timestamp("commissionDeductedAt"),
  paymentReceiptScreenshot: text("paymentReceiptScreenshot"),
  transactionRefId: varchar("transactionRefId", { length: 160 }),
  shippingAddress: text("shippingAddress"),
  customerNote: text("customerNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ customerIdx: index("orders_customer_idx").on(table.customerId), vendorIdx: index("orders_vendor_idx").on(table.vendorId) }));

export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  productId: int("productId").notNull().references(() => products.id),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  selectedOptions: json("selectedOptions").$type<Record<string, string>>().notNull(),
});

export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull().references(() => users.id),
  recipientId: int("recipientId").notNull().references(() => users.id),
  orderId: int("orderId").references(() => orders.id),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ recipientIdx: index("messages_recipient_idx").on(table.recipientId), orderIdx: index("messages_order_idx").on(table.orderId) }));

export const reels = mysqlTable("reels", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
  title: varchar("title", { length: 200 }).notNull(),
  mediaUrl: text("mediaUrl").notNull(),
  status: mysqlEnum("status", ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED"]).default("PENDING_REVIEW").notNull(),
  viewsCount: int("viewsCount").default(0).notNull(),
  likesCount: int("likesCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformSettings = mysqlTable("platformSettings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: int("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const supportTickets = mysqlTable("supportTickets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  subject: varchar("subject", { length: 180 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["OPEN", "IN_PROGRESS", "RESOLVED"]).default("OPEN").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const imageSearchRequests = mysqlTable("imageSearchRequests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id),
  imageUrl: text("imageUrl"),
  queryText: text("queryText"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const vendorSubscriptionPayments = mysqlTable("vendorSubscriptionPayments", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull().references(() => vendors.id),
  amountUsd: decimal("amountUsd", { precision: 10, scale: 2 }).default("5.00").notNull(),
  receiptImageUrl: text("receiptImageUrl").notNull(),
  status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED"]).default("PENDING").notNull(),
  reviewedBy: int("reviewedBy").references(() => users.id),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ vendorIdx: index("subscription_payments_vendor_idx").on(table.vendorId), statusIdx: index("subscription_payments_status_idx").on(table.status) }));

export const disputeReports = mysqlTable("disputeReports", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => orders.id),
  openedBy: int("openedBy").notNull().references(() => users.id),
  subject: varchar("subject", { length: 180 }).notNull(),
  details: text("details").notNull(),
  status: mysqlEnum("status", ["OPEN", "IN_REVIEW", "RESOLVED"]).default("OPEN").notNull(),
  resolution: text("resolution"),
  resolvedBy: int("resolvedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
}, (table) => ({ orderIdx: index("disputes_order_idx").on(table.orderId), statusIdx: index("disputes_status_idx").on(table.status) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Vendor = typeof vendors.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Reel = typeof reels.$inferSelect;
