import { type Sale } from "@shared/schema";
import { getToken } from "./store";

interface FiscalHarmonyConfig {
  appId: string;
  appSecret: string;
}

interface FiscalHarmonyResponse {
  success: boolean;
  qrCode?: string;
  error?: string;
  fiscalNumber?: string;
}

interface CredentialCheckResponse {
  success: boolean;
  hasCredentials: boolean;
  message: string;
  data?: {
    id: number;
    provider: string;
    hasAppId: boolean;
    hasAppSecret: boolean;
  };
}

interface ProvidersCheckResponse {
  success: boolean;
  message: string;
  providers: string[];
  hasAnyCredentials: boolean;
}

/**
 * Check if the current merchant has Fiscal Harmony credentials stored
 * @returns Promise with credential check result
 */
export async function checkFiscalHarmonyCredentials(): Promise<CredentialCheckResponse> {
  try {
    const token = getToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    const response = await fetch("/api/fiscalization/credentials/FiscalHarmony", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to check credentials");
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking Fiscal Harmony credentials:", error);
    return {
      success: false,
      hasCredentials: false,
      message: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Check all connected fiscalization providers for the current merchant
 * @returns Promise with connected providers list
 */
export async function checkConnectedProviders(): Promise<ProvidersCheckResponse> {
  try {
    const token = getToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    const response = await fetch("/api/fiscalization/credentials/check", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error("Failed to check connected providers");
    }

    return await response.json();
  } catch (error) {
    console.error("Error checking connected providers:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      providers: [],
      hasAnyCredentials: false
    };
  }
}

class FiscalHarmonyClient {
  private appId: string;
  private appSecret: string;
  private baseUrl = "https://api.fiscalharmony.co.zw/v1";

  constructor(config: FiscalHarmonyConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
  }

  private async getAuthToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: this.appId,
        appSecret: this.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get auth token');
    }

    const data = await response.json();
    return data.token;
  }

  async submitInvoice(sale: Sale): Promise<FiscalHarmonyResponse> {
    try {
      const token = await this.getAuthToken();
      
      const invoiceData = {
        invoiceNumber: sale.receipt,
        date: sale.timestamp,
        totalAmount: sale.totalInc,
        vatAmount: sale.vatAmount,
        customerInfo: {
          name: sale.customerName,
          vatNumber: sale.customerVAT,
          address: sale.customerAddress,
          email: sale.customerEmail,
        },
        items: sale.items.map(item => ({
          description: item.name,
          quantity: item.quantity,
          unitPrice: item.priceInc / item.quantity,
          vatAmount: item.vatAmount,
          hsCode: item.hsCode || "",
        })),
        payments: sale.payments.map(payment => ({
          amount: payment.amount,
          method: payment.currency === "USD" ? "USD_CASH" : "ZWL_CASH",
        })),
      };

      const response = await fetch(`${this.baseUrl}/invoices/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceData),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Failed to submit invoice',
        };
      }

      return {
        success: true,
        qrCode: data.qrCode,
        fiscalNumber: data.fiscalNumber,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async checkInvoiceStatus(fiscalNumber: string): Promise<FiscalHarmonyResponse> {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${this.baseUrl}/invoices/${fiscalNumber}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Failed to check invoice status',
        };
      }

      return {
        success: true,
        qrCode: data.qrCode,
        fiscalNumber: data.fiscalNumber,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}

export function createFiscalHarmonyClient(config: FiscalHarmonyConfig) {
  return new FiscalHarmonyClient(config);
}

export type { FiscalHarmonyResponse, CredentialCheckResponse, ProvidersCheckResponse };
