import type {
  ZimraConfig,
  ZimraReceipt,
  ZimraResponse,
  DeviceRegistrationRequest,
  DeviceRegistrationResponse,
  DeviceOperatingMode,
  FiscalDayResponse,
  FiscalDayStatus,
  FiscalDayReportStatus,
  DeviceStatus,
} from "@shared/zimra";
import { generateSerialNumber } from "./utils";

class ZimraApiClient {
  private config: ZimraConfig;
  private fiscalDayStatus: FiscalDayStatus = "Closed";
  private reportStatus: FiscalDayReportStatus = "Pending";
  private submissionAttempts: number = 0;

  constructor(config: ZimraConfig) {
    this.config = config;
  }

  private async request(
    endpoint: string,
    method: string,
    data?: any,
  ): Promise<ZimraResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "X-Device-ID": this.config.deviceId,
          "X-Operator-ID": this.config.operatorId,
        },
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ZIMRA API Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("ZIMRA API Request Error:", error);
      throw error;
    }
  }

  //=======================================================================================
  //THIS IS THE FUNCTION TO REGISTER THE DEVICE AND GET THE CERTIFICATE DETAILS
  async registerDevice(
    deviceId: string,
    activationKey: string,
    serialNumber: string,
    version: string,
    taxPayerTIN: string,
    vatNumber: string,
  ): Promise<DeviceRegistrationResponse> {
    const response = await fetch(`api/zimraDevice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deviceId: deviceId, // Changed from deviceID to deviceId to match API
        activationKey: activationKey, // Provided by ZIMRA
        serialNumber: serialNumber, // Unique serial number for the device
        version: version,
        taxPayerTIN: taxPayerTIN, // TIN provided by the user
        vatNumber: vatNumber,
      }),
    });
    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: "Unknown error", details: await response.text() } };
      }
      
      // If the server returned structured error data, throw it as is for client handling
      if (errorData.error) {
        const error = new Error(errorData.error.details || errorData.error.message);
        (error as any).response = { data: errorData };
        throw error;
      } else {
        throw new Error(`Device Registration Failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }
    }
    
    const result = await response.json();
    console.log("ZIMRA Registration Response:", result);
    return result;
  }
  //=======================================================================================
  async openFiscalDay(): Promise<FiscalDayResponse> {
    if (this.fiscalDayStatus === "Open") {
      throw new Error("Fiscal day is already open");
    }

    const response = await this.request("/api/v1/fiscal/day/open", "POST");
    this.fiscalDayStatus = "Open";
    this.reportStatus = "Pending";
    this.submissionAttempts = 0;
    return response.data;
  }

  async closeFiscalDay(
    deviceId?: string,
    manualClosure: boolean = false,
  ): Promise<FiscalDayResponse> {
    try {
      // We need to include the merchantId in the request
      const merchantId =
        this.config.merchantId || localStorage.getItem("currentMerchantId");
      console.log(
        "Closing fiscal day for merchant:",
        merchantId,
        "device:",
        deviceId,
      );
      // alert(manualClosure);
      // Call the server API to close the fiscal day
      const response = await fetch(
        // `/api/zimra/closeDay?merchantId=${merchantId}`,
        `/api/zimra/closeDay`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId,
            manualClosure,
            merchantId, // Also include in the body as a fallback
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Close Fiscal Day Failed: ${response.status} - ${errorText}`,
        );
      }

      const data = await response.json();
      this.fiscalDayStatus = "Closed";
      this.reportStatus = manualClosure ? "ManualClosure" : "Success";
      return data;
    } catch (error) {
      console.error("Close fiscal day error:", error);
      this.reportStatus = "Error";
      throw error;
    }
  }

  async getFiscalDayStatus(): Promise<FiscalDayResponse> {
    const response = await this.request("/api/v1/fiscal/day/status", "GET");
    this.fiscalDayStatus = response.data.status;
    this.reportStatus = response.data.reportStatus || "Pending";
    this.submissionAttempts = response.data.submissionAttempts || 0;
    return response.data;
  }

  async resubmitFiscalDayReport(): Promise<FiscalDayResponse> {
    if (this.reportStatus !== "Error") {
      throw new Error("Can only resubmit failed reports");
    }

    try {
      const response = await this.request(
        "/api/v1/fiscal/day/report/resubmit",
        "POST",
      );
      this.reportStatus = "Resubmitted";
      this.submissionAttempts++;
      return response.data;
    } catch (error) {
      this.reportStatus = "Error";
      throw error;
    }
  }

  async submitReceipt(receipt: ZimraReceipt): Promise<ZimraResponse> {
    if (this.fiscalDayStatus !== "Open") {
      throw new Error("Cannot submit receipt when fiscal day is not open");
    }
    return this.request("/api/v1/fiscal/receipt", "POST", receipt);
  }

  async getDeviceStatus(): Promise<ZimraResponse> {
    return this.request("/api/v1/device/status", "GET");
  }

  // Get device configuration from ZIMRA API
  async getDeviceConfig(
    deviceId: string,
    deviceModelName: string = "Server",
    deviceModelVersion: string = "v1",
  ): Promise<any> {
    try {
      console.log(`Getting config for device: ${deviceId}`);
      const response = await fetch(`/api/zimra/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId,
          deviceModelName,
          deviceModelVersion,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Get Device Config Failed: ${response.status} - ${errorText}`,
        );
      }

      return response.json();
    } catch (error) {
      console.error("Get device config error:", error);
      throw error;
    }
  }

  async validateVatNumber(vatNumber: string): Promise<ZimraResponse> {
    return this.request(`/api/v1/validate/vat/${vatNumber}`, "GET");
  }

  async getDailyTotals(date: string): Promise<ZimraResponse> {
    return this.request(`/api/v1/fiscal/daily-totals?date=${date}`, "GET");
  }

  /**
   * Ping all registered ZIMRA devices and get their status
   * @param merchantId The merchant ID to check devices for
   * @returns Object containing device statuses and timestamp
   */
  async pingAllDevices(merchantId: string): Promise<{
    success: boolean;
    deviceStatuses: DeviceStatus[];
    timestamp: Date;
    error?: string;
  }> {
    try {
      // Make a request to our backend API that pings all devices
      const response = await fetch(
        //`/api/zimra/ping-all?merchantId=${encodeURIComponent(merchantId)}`,
        `/api/zimra/ping-all`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ping All Devices Failed: ${response.status} - ${errorText}`,
        );
      }
      console.log("response");
      console.log(response);
      return await response.json();
    } catch (error: any) {
      console.error("Error pinging all ZIMRA devices:", error);
      return {
        success: false,
        deviceStatuses: [],
        timestamp: new Date(),
        error: error.message || "Unknown error occurred",
      };
    }
  }
}

// Helper function to extract TIN and VAT from Loyverse headers
export function extractTaxNumbers(headerText: string): {
  tin?: string;
  vat?: string;
} {
  const result: { tin?: string; vat?: string } = {};

  // Look for TIN: pattern
  const tinMatch = headerText.match(/TIN:\s*([^\s,]+)/i);
  if (tinMatch) {
    result.tin = tinMatch[1];
  }

  // Look for VAT: pattern
  const vatMatch = headerText.match(/VAT:\s*([^\s,]+)/i);
  if (vatMatch) {
    result.vat = vatMatch[1];
  }

  return result;
}

// Create and export the ZIMRA API client instance
export const zimraClient = new ZimraApiClient({
  baseUrl:
    import.meta.env.VITE_ZIMRA_API_URL || "https://fdmsapitest.zimra.co.zw",
  apiKey: import.meta.env.VITE_ZIMRA_API_KEY || "",
  deviceId: import.meta.env.VITE_ZIMRA_DEVICE_ID || "",
  operatorId: import.meta.env.VITE_ZIMRA_OPERATOR_ID || "",
  activationKey: import.meta.env.VITE_ZIMRA_ACTIVATION_KEY || "",
  merchantId: localStorage.getItem("currentMerchantId") || "",
});

export function convertToZimraReceipt(sale: any): ZimraReceipt {
  return {
    receiptNumber: sale.receipt,
    customerVatNumber: sale.customerVatNumber,
    customerBpNumber: sale.customerBpNumber,
    customerName: sale.customerName,
    items: sale.items.map((item: any) => ({
      description: item.item_name,
      quantity: item.quantity,
      unitPrice: item.price,
      vatRate: (item.tax_amount / item.total_money) * 100,
      lineTotal: item.total_money,
    })),
    totalAmount: sale.total,
    vatAmount: sale.items.reduce(
      (sum: number, item: any) => sum + (item.tax_amount || 0),
      0,
    ),
    paymentMethod: sale.payments?.[0]?.type || "CASH",
    operatorId: import.meta.env.VITE_ZIMRA_OPERATOR_ID || "",
    deviceId: import.meta.env.VITE_ZIMRA_DEVICE_ID || "",
  };
}
