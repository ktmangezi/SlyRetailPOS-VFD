import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  numeric,
  doublePrecision,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Add currencies table
export const currencies = pgTable("currencies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  iso_code: text("iso_code"),
  rate: numeric("rate").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Add merchant credentials table
export const merchantCredentials = pgTable("merchant_credentials", {
  id: serial("id").primaryKey(),
  merchantId: text("merchant_id").notNull().unique(),
  loyverseToken: text("loyverse_token").notNull(),
  merchantName: text("merchant_name"),
  tin: text("tin"),
  vat: text("vat"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
});

export const insertMerchantCredentialsSchema = createInsertSchema(
  merchantCredentials,
).pick({
  merchantId: true,
  loyverseToken: true,
  merchantName: true,
  tin: true,
  vat: true,
});

export type InsertMerchantCredentials = z.infer<
  typeof insertMerchantCredentialsSchema
>;
export type MerchantCredentials = typeof merchantCredentials.$inferSelect;

export const insertCurrencySchema = createInsertSchema(currencies).pick({
  name: true,
  iso_code: true,
  rate: true,
});

export type InsertCurrency = z.infer<typeof insertCurrencySchema>;
export type Currency = typeof currencies.$inferSelect;

// Interface definitions
export interface LoyverseWebhook {
  id: string;
  business_name: string;
  email: string;
  currency: string;
  created_at: string;
}

export interface LoyverseMerchant {
  id: string;
  business_name: string;
  email: string;
  currency: string;
  created_at: string;
}

export interface SaleItem {
  name: string;
  quantity: number;
  priceInc: number;
  totalInc: number;
  vatAmount: number;
  taxDetails: Array<{
    taxName: string;
    taxAmount: number;
  }>;
  hsCode?: string;
}
export interface fiscalCounter {
  fiscalCounterType: string;
  fiscalCounterCurrency: string;
  fiscalCounterTaxPercent: number | null;
  fiscalCounterTaxID: number | null;
  fiscalCounterValue: number;
  fiscalCounterMoneyType?: string;
}

export interface PaymentInfo {
  amount: number;
  currency: string;
  type: string;
}

export interface CustomerInfo {
  name: string;
  phone_number: string;
  address: string;
  city: string;
  email: string;
  note: string;
}

export interface LoyverseStore {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone_number: string;
  description: string;
}

export interface LoyversePOS {
  id: string;
  name: string;
  store_id: string;
  activated: true;
}

export interface LoyverseProductItem {
  id: string;
  handle: string;
  item_name: string;
  category_id: string;
} // Device Branch Address Schema
export interface DeviceBranchAddress {
  province: string;
  street: string;
  houseNo: string;
  city: string;
}

// Device Branch Contacts Schema
export interface DeviceBranchContacts {
  phoneNo: string;
  email: string;
}

// Applicable Tax Schema
export interface ApplicableTax {
  taxPercent: number;
  taxName: string;
}
export interface LoyverseCategories {
  id: string;
  name: string;
}

export interface LoyverseReceipt {
  id: string;
  receipt_number: string;
  receipt_type: string;
  refund_for: string;
  cancelled_at: string;
  notes: string;
  receipt_date: string;
  total_money: number;
  created_at: string;
  store_id: string;
  pos_id: string;
  customer_id: string;
  payments: Array<{
    payment_type_id: string;
    name: string;
    money_amount: number;
    type: string;
  }>;
  line_items: Array<{
    item_id: string;
    item_name: string;
    quantity: number;
    price: number;
    total_money: number;
    tax_amount: number;
    category: string;
    line_taxes?: Array<{
      name: string;
      money_amount: number;
    }>;
  }>;
  receiptHash: string;
  zimraSubmitted: string;
  zimraSubmissionDate: string;
  zimraError: string;
  zimraReceiptId: string;
  zimraDeviceId: string;
  zimraQrData: string;
  zimraQrUrl: string;
  zimraOperationId: string;
  zimraFiscalDayId: string;
  zimraFiscalDayNo: string;
  zimraGlobalNo: string;
  submissionRoute: string;
}

// Add fiscal days table
export const fiscalDays = pgTable("fiscal_days", {
  id: serial("id").primaryKey(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  deviceId: text("device_id").notNull(),
  deviceSerialNumber: text("device_serial_number"),
  fiscalDayNo: text("fiscal_day_no").notNull(),
  fiscalCounters: jsonb("fiscal_counters").notNull().$type<fiscalCounter[]>(),
  operatorId: text("operator_id").notNull(),
  dayEndTime: timestamp("day_end_time").notNull(),
  totalTransactions: numeric("total_transactions").default("0"),
  totalAmount: numeric("total_amount").default("0"),
  totalVat: numeric("total_vat").default("0"),
  status: text("status").notNull(),
  reportStatus: text("report_status").notNull(),
  errorDetails: text("error_details"),
  submissionAttempts: numeric("submission_attempts").default("0"),
  manualClosure: boolean("manual_closure").default(false),
  manualClosureReason: text("manual_closure_reason"),
  lastSubmissionDate: timestamp("last_submission_date"),
});
// Update insertFiscalDaysSchema with fiscal fields
export const insertFiscalDaysSchema = createInsertSchema(fiscalDays).pick({
  openedAt: true,
  closedAt: true,
  deviceId: true,
  deviceSerialNumber: true,
  fiscalDayNo: true,
  fiscalCounters: true,
  operatorId: true,
  dayEndTime: true,
  totalTransactions: true,
  totalAmount: true,
  totalVat: true,
  status: true,
  reportStatus: true,
  errorDetails: true,
  submissionAttempts: true,
  manualClosure: true,
  manualClosureReason: true,
  lastSubmissionDate: true,
});

export type InsertFiscalDays = z.infer<typeof insertFiscalDaysSchema>;
export type FiscalDays = typeof fiscalDays.$inferSelect;

// Sales table with ZIMRA fields
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  receipt: text("receipt").notNull(),
  receiptType: text("receipt_type").notNull(),
  refundFor: text("refund_for").notNull(),
  cancelledAt: text("cancelled_at").notNull(),
  notes: text("note").notNull(),
  total: numeric("total").notNull(),
  totalInc: numeric("total_inc").notNull(),
  vatAmount: numeric("vat_amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  items: jsonb("items").notNull().$type<SaleItem[]>(),
  storeName: text("store_name").notNull(),
  storeId: text("store_id").notNull(),
  storeAddress: text("store_address").notNull(),
  storeTINnumber: text("store_tin_number").notNull(),
  storeVATnumber: text("store_vat_number").notNull(),
  storeCity: text("store_city").notNull(),
  storeProvince: text("store_province").notNull(),
  storeEmail: text("store_email_number").notNull(),
  storeContactNumber: text("store_contact_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  customerEmail: text("customer_email"),
  customerContact: text("customer_contact"),
  customerTIN: text("customer_tin"),
  customerVAT: text("customer_vat"),
  footerText: text("footer_text"),
  payments: jsonb("payments").notNull().$type<PaymentInfo[]>(),
  receiptHash: text("receipt_hash"),
  zimraSubmitted: boolean("zimra_submitted").default(false),
  zimraSubmissionDate: timestamp("zimra_submission_date"),
  zimraReceiptId: text("zimra_receipt_id"),
  zimraDeviceId: text("zimra_device_id"),
  zimraQrData: text("zimra_receipt_qr_data"),
  zimraError: text("zimra_error"),
  zimraQrUrl: text("zimra_qr_url"),
  zimraFiscalDayNo: text("zimra_fiscal_day_no"),
  zimraOperationId: text("zimra_operation_id"),
  zimraFiscalDayId: text("zimra_fiscal_day_id"),
  zimraGlobalNo: text("zimra_global_no"),
  receiptCounter: text("receipt_counter"),
  submissionRoute: text("submission_route"),
  // receiptStatus: text("receiptStatus"),
});

// Update insertSaleSchema with sales fields
export const insertSaleSchema = createInsertSchema(sales).pick({
  receipt: true,
  receiptType: true,
  refundFor: true,
  cancelledAt: true,
  notes: true,
  total: true,
  totalInc: true,
  vatAmount: true,
  timestamp: true,
  items: true,
  storeName: true,
  storeId: true,
  storeAddress: true,
  storeTINnumber: true,
  storeVATnumber: true,
  storeCity: true,
  storeProvince: true,
  storeEmail: true,
  storeContactNumber: true,
  customerName: true,
  customerAddress: true,
  customerCity: true,
  customerEmail: true,
  customerContact: true,
  customerTIN: true,
  customerVAT: true,
  footerText: true,
  payments: true,
  receiptHash: true,
  zimraSubmitted: true,
  zimraSubmissionDate: true,
  zimraError: true,
  zimraReceiptId: true,
  zimraDeviceId: true,
  zimraQrData: true,
  zimraQrUrl: true,
  zimraOperationId: true,
  zimraFiscalDayId: true,
  zimraFiscalDayNo: true,
  zimraGlobalNo: true,
  receiptCounter: true,
  submissionRoute: true,
  // receiptStatus: true,
});

export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;
export const failedReceipts = pgTable("failed_receipts", {
  id: serial("id").primaryKey(),
  receipt: text("receipt").notNull(),
  receiptType: text("receipt_type").notNull(),
  refundFor: text("refund_for").notNull(),
  cancelledAt: text("cancelled_at").notNull(),
  notes: text("note").notNull(),
  total: numeric("total").notNull(),
  totalInc: numeric("total_inc").notNull(),
  vatAmount: numeric("vat_amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  items: jsonb("items").notNull().$type<SaleItem[]>(),
  storeName: text("store_name").notNull(),
  storeId: text("store_id").notNull(),
  storeAddress: text("store_address").notNull(),
  storeTINnumber: text("store_tin_number").notNull(),
  storeVATnumber: text("store_vat_number").notNull(),
  storeCity: text("store_city").notNull(),
  storeProvince: text("store_province").notNull(),
  storeEmail: text("store_email_number").notNull(),
  storeContactNumber: text("store_contact_number").notNull(),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  customerEmail: text("customer_email"),
  customerContact: text("customer_contact"),
  customerTIN: text("customer_tin"),
  customerVAT: text("customer_vat"),
  footerText: text("footer_text"),
  payments: jsonb("payments").notNull().$type<PaymentInfo[]>(),
  receiptHash: text("receipt_hash"),
  zimraSubmitted: boolean("zimra_submitted").default(false),
  zimraSubmissionDate: timestamp("zimra_submission_date"),
  zimraReceiptId: text("zimra_receipt_id"),
  zimraDeviceId: text("zimra_device_id"),
  zimraQrData: text("zimra_receipt_qr_data"),
  zimraError: text("zimra_error"),
  zimraQrUrl: text("zimra_qr_url"),
  zimraFiscalDayNo: text("zimra_fiscal_day_no"),
  zimraOperationId: text("zimra_operation_id"),
  zimraFiscalDayId: text("zimra_fiscal_day_id"),
  zimraGlobalNo: text("zimra_global_no"),
  receiptCounter: text("receipt_counter"),
  submissionRoute: text("submission_route"),
});

// Update insertFailedReceiptsSchema with fiscal fields
export const insertFailedReceiptsSchema = createInsertSchema(
  failedReceipts,
).pick({
  receipt: true,
  receiptType: true,
  refundFor: true,
  cancelledAt: true,
  notes: true,
  total: true,
  totalInc: true,
  vatAmount: true,
  timestamp: true,
  items: true,
  storeName: true,
  storeId: true,
  storeAddress: true,
  storeTINnumber: true,
  storeVATnumber: true,
  storeCity: true,
  storeProvince: true,
  storeEmail: true,
  storeContactNumber: true,
  customerName: true,
  customerAddress: true,
  customerCity: true,
  customerEmail: true,
  customerContact: true,
  customerTIN: true,
  customerVAT: true,
  footerText: true,
  payments: true,
  receiptHash: true,
  zimraSubmitted: true,
  zimraSubmissionDate: true,
  zimraError: true,
  zimraReceiptId: true,
  zimraDeviceId: true,
  zimraQrData: true,
  zimraQrUrl: true,
  zimraOperationId: true,
  zimraFiscalDayId: true,
  zimraFiscalDayNo: true,
  zimraGlobalNo: true,
  receiptCounter: true,
  submissionRoute: true,
});

export type InsertFailedReceipt = z.infer<typeof insertFailedReceiptsSchema>;
export type failedReceipt = typeof failedReceipts.$inferSelect;

//tabel for webhook queue
export const webhookQueue = pgTable("webhook_queue", {
  id: serial("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  merchantId: text("merchant_id").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: numeric("attempts").notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
});
// Update insertWebhookQueueSchema with fiscal fields
export const insertWebhookQueueSchema = createInsertSchema(webhookQueue).pick({
  payload: true,
  merchantId: true,
  status: true,
  attempts: true,
  createdAt: true,
  processedAt: true,
  errorMessage: true,
});

export type InsertWebhookQueue = z.infer<typeof insertWebhookQueueSchema>;
export type webhookQueue = typeof webhookQueue.$inferSelect;

// Add the submissionRoute type
export const SubmissionRoute = z.enum(["DIRECT_ZIMRA", "FISCAL_HARMONY"]);
export type SubmissionRoute = z.infer<typeof SubmissionRoute>;

// Add fiscalization provider type
export const FiscalizationProvider = z.enum([
  "ZIMRA",
  "FiscalHarmony",
  "AxisSolution",
]);
export type FiscalizationProvider = z.infer<typeof FiscalizationProvider>;

// Add fiscalization credentials table
export const fiscalizationCredentials = pgTable("fiscalization_credentials", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  merchantId: text("merchant_id").notNull(),
  appId: text("app_id").notNull(),
  appSecret: text("app_secret").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFiscalizationCredentialsSchema = createInsertSchema(
  fiscalizationCredentials,
).pick({
  provider: true,
  merchantId: true,
  appId: true,
  appSecret: true,
  active: true,
});

export type InsertFiscalizationCredentials = z.infer<
  typeof insertFiscalizationCredentialsSchema
>;
export type FiscalizationCredentials =
  typeof fiscalizationCredentials.$inferSelect;

// Add ZIMRA credentials table - using snake_case for table name
export const zimraCredentials = pgTable("zimra_credentials", {
  id: serial("id").primaryKey(),
  taxPayerName: text("taxpayer_name"),
  taxPayerTIN: text("taxpayer_tin"),
  vatNumber: text("vat_number"),
  certificate: text("certificate"),
  privateKey: text("private_key"),
  deviceId: text("device_id"), // Added deviceId field with snake_case column name
  deviceSerialNo: text("device_serial_no"),
  deviceBranchName: text("device_branch_name"),
  deviceBranchAddress: jsonb("device_branch_address").$type<
    DeviceBranchAddress[]
  >(),
  deviceBranchContacts: jsonb("device_branch_contacts").$type<
    DeviceBranchContacts[]
  >(),
  deviceOperatingMode: text("device_operating_mode"),
  taxPayerDayMaxHrs: numeric("taxpayer_day_max_hrs"),
  applicableTaxes: jsonb("applicable_taxes").$type<ApplicableTax[]>(),
  certificateValidTill: text("certificate_valid_till"),
  qrUrl: text("qr_url"),
  taxpayerDayEndNotificationHrs: numeric("taxpayer_day_end_notification_hrs"),
  zimraFiscalDayNo: text("zimra_fiscal_day_no"),
  zimraFiscalOpenedDate: text("fiscal_opened_date"),
  zimraFiscalDayStatus: text("fiscal_day_status"),
  nextZimraGlobalNo: text("next_zimra_global_no"),
  nextZimraReceiptCounter: text("next_zimra_receipt_counter"),
  receiptHash: text("receipt_hash"),
  progress: text("progress_receipt"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertZimraCredentialsSchema = createInsertSchema(
  zimraCredentials,
).pick({
  taxPayerName: true,
  taxPayerTIN: true,
  vatNumber: true,
  certificate: true,
  privateKey: true,
  deviceId: true, // Added deviceId field to insert schema,
  deviceSerialNo: true,
  deviceBranchName: true,
  deviceBranchAddress: true,
  deviceBranchContacts: true,
  deviceOperatingMode: true,
  taxPayerDayMaxHrs: true,
  applicableTaxes: true,
  certificateValidTill: true,
  qrUrl: true,
  taxpayerDayEndNotificationHrs: true,
  zimraFiscalDayNo: true,
  zimraFiscalOpenedDate: true,
  nextZimraGlobalNo: true,
  nextZimraReceiptCounter: true,
  receiptHash: true,
  progress: true,
  active: true,
});

export type InsertZimraCredentials = z.infer<
  typeof insertZimraCredentialsSchema
>;
export type ZimraCredentials = typeof zimraCredentials.$inferSelect;

// Notification settings table and types removed as per client request
