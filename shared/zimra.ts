import { z } from "zod";

// ZIMRA API Response Types
export const ZimraResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type ZimraResponse = z.infer<typeof ZimraResponseSchema>;

// Define device operating modes
export const DeviceOperatingMode = z.enum(["Online", "Offline"]);
export type DeviceOperatingMode = z.infer<typeof DeviceOperatingMode>;

// Define fiscal day status
export const FiscalDayStatus = z.enum(["Open", "Closed"]);
export type FiscalDayStatus = z.infer<typeof FiscalDayStatus>;

// ZIMRA Device Registration Request Schema
export const DeviceRegistrationRequestSchema = z.object({
  deviceId: z.string(),  // Changed from deviceID to deviceId to match API
  activationKey: z.string(),
  serialNumber: z.string().length(20, "Serial number must be 20 characters"),
  version: z.string().default("v1"),
});

// Device Branch Address Schema
export const DeviceBranchAddressSchema = z.object({
  province: z.string(),
  street: z.string(),
  houseNo: z.string(),
  city: z.string(),
});

// Device Branch Contacts Schema
export const DeviceBranchContactsSchema = z.object({
  phoneNo: z.string(),
  email: z.string(),
});

// Applicable Tax Schema
export const ApplicableTaxSchema = z.object({
  taxPercent: z.number().optional(),
  taxName: z.string(),
});

// ZIMRA Device Registration Response Schema
export const DeviceRegistrationResponseSchema = z.object({
  operationID: z.string(),
  taxPayerName: z.string(),
  taxPayerTIN: z.string(),
  vatNumber: z.string(),
  deviceSerialNo: z.string(),
  deviceBranchName: z.string(),
  deviceBranchAddress: DeviceBranchAddressSchema,
  deviceBranchContacts: DeviceBranchContactsSchema,
  deviceOperatingMode: DeviceOperatingMode,
  taxPayerDayMaxHrs: z.number(),
  applicableTaxes: z.array(ApplicableTaxSchema),
  certificateValidTill: z.string(),
  qrUrl: z.string(),
  taxpayerDayEndNotificationHrs: z.number(),
});

// Fiscal Day Report Status
export const FiscalDayReportStatus = z.enum([
  "Pending",
  "Success",
  "Error",
  "Resubmitted",
  "ManualClosure",
]);

// Fiscal Day Response Schema
export const FiscalDayResponseSchema = z.object({
  status: FiscalDayStatus,
  openedAt: z.string().optional(),
  dayEndTime: z.string().optional(),
  reportStatus: FiscalDayReportStatus.optional(),
  errorDetails: z.string().optional(),
  submissionAttempts: z.number().default(0),
  manualClosure: z.boolean().default(false),
  manualClosureReason: z.string().optional(),
});

// ZIMRA Receipt Schema
export const ZimraReceiptSchema = z.object({
  receiptNumber: z.string(),
  customerVatNumber: z.string().optional(),
  customerBpNumber: z.string().optional(),
  customerName: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      vatRate: z.number(),
      discount: z.number().optional(),
      lineTotal: z.number(),
    }),
  ),
  totalAmount: z.number(),
  vatAmount: z.number(),
  paymentMethod: z.string(),
  operatorId: z.string(),
  deviceId: z.string(),
});

export type ZimraReceipt = z.infer<typeof ZimraReceiptSchema>;
export type DeviceRegistrationRequest = z.infer<
  typeof DeviceRegistrationRequestSchema
>;
export type DeviceRegistrationResponse = z.infer<
  typeof DeviceRegistrationResponseSchema
>;
export type DeviceBranchAddress = z.infer<typeof DeviceBranchAddressSchema>;
export type DeviceBranchContacts = z.infer<typeof DeviceBranchContactsSchema>;
export type ApplicableTax = z.infer<typeof ApplicableTaxSchema>;
export type FiscalDayResponse = z.infer<typeof FiscalDayResponseSchema>;
export type FiscalDayReportStatus = z.infer<typeof FiscalDayReportStatus>;

// Device Status Interface
export const DeviceStatusSchema = z.object({
  deviceId: z.string(),
  isOnline: z.boolean(),
  lastPingTimestamp: z.date(),
  reportingFrequency: z.number(),
  operationID: z.string(),
  error: z.string().optional()
});

export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

// ZIMRA API Configuration
export interface ZimraConfig {
  baseUrl: string; // This will be https://fdmsapitest.zimra.co.zw for testing
  activationKey: string; // Initial key for device activation
  apiKey: string; // Key received after successful activation
  deviceId: string; // Fiscal device identifier
  operatorId: string; // Authorized operator identifier
  merchantId?: string; // Optional merchant ID for API calls
}
