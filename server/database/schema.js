import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role", {
    enum: ["administrator", "treasurer", "cashier", "encoder"],
  }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const barangays = sqliteTable("barangays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const owners = sqliteTable("owners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  address: text("address").notNull(),
  contactNumber: text("contact_number"),
  tin: text("tin"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const establishments = sqliteTable("establishments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  barangayId: integer("barangay_id")
    .notNull()
    .references(() => barangays.id),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owners.id),
  businessType: text("business_type").notNull(),
  address: text("address").notNull(),
  status: text("status", { enum: ["active", "inactive", "closed"] })
    .notNull()
    .default("active"),
  notes: text("notes"),
  isArchived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const taxRecords = sqliteTable("tax_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  establishmentId: integer("establishment_id")
    .notNull()
    .references(() => establishments.id),
  taxYear: integer("tax_year").notNull(),
  taxDue: real("tax_due").notNull(),
  paymentSchedule: text("payment_schedule", {
    enum: ["full", "quarterly", "semi_annual"],
  }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taxRecordId: integer("tax_record_id")
    .notNull()
    .references(() => taxRecords.id),
  paymentDate: text("payment_date").notNull(),
  orNumber: text("or_number").notNull(),
  // amount == Business Tax paid in this receipt. Kept as-is so the Business
  // Tax balance engine is unchanged. The remaining fees below are record-only
  // (no assessed due, no balance) — staff simply enter what was paid.
  amount: real("amount").notNull(),
  mayorsPermit: real("mayors_permit").notNull().default(0),
  swm: real("swm").notNull().default(0),
  sanitaryPermit: real("sanitary_permit").notNull().default(0),
  peso: real("peso").notNull().default(0),
  occupancyFee: real("occupancy_fee").notNull().default(0),
  inspectionFee: real("inspection_fee").notNull().default(0),
  healthCert: real("health_cert").notNull().default(0),
  remarks: text("remarks"),
  recordedBy: integer("recorded_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

/* Catalog of selectable charge items, grouped by category. Admins/staff can
   add, rename, or deactivate these over time. Payment items snapshot the label
   at time of payment, so editing this catalog never alters past records. */
export const feeOptions = sqliteTable("fee_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", {
    enum: ["business_tax", "mayors_permit", "regulatory"],
  }).notNull(),
  label: text("label").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

/* Individual line items making up a payment. Each has a category, a label
   (snapshot), and an amount. A payment's total is the sum of its items and is
   also mirrored onto payments.amount for balance calculations. */
export const paymentItems = sqliteTable("payment_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  paymentId: integer("payment_id")
    .notNull()
    .references(() => payments.id),
  category: text("category").notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  module: text("module").notNull(),
  details: text("details"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
