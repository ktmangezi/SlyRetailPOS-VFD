import crypto from 'crypto';
import axios from 'axios';
import type { Sale } from '@shared/schema';

interface FiscalHarmonyConfig {
  appId: string;
  appSecret: string;
  apiUrl?: string;
}

interface FiscalHarmonyResponse {
  success: boolean;
  error: string | null;
  qrCode: string | null;
  fiscalNumber: string | null;
}

export class FiscalHarmonyClient {
  private config: FiscalHarmonyConfig;
  private apiUrl: string;

  constructor(config: FiscalHarmonyConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://api.fiscalharmony.com/v1';
  }

  private generateSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', this.config.appSecret);
    hmac.update(payload);
    return hmac.digest('base64');
  }

  private generateHeaders(payload: string = '') {
    return {
      'X-Api-Key': this.config.appId,
      'X-Api-Signature': payload ? this.generateSignature(payload) : '',
      'X-Application': 'SlyRetail',
      'Content-Type': 'application/json',
    };
  }

  async submitInvoice(sale: Sale): Promise<FiscalHarmonyResponse> {
    try {
      // Convert sale to Fiscal Harmony format
      const payload = {
        buyer: {
          name: sale.customerName,
          address: {
            street: sale.customerAddress || '',
            city: sale.customerCity || '',
          },
          contact: {
            email: sale.customerEmail || '',
            phone: sale.customerContact || '',
          },
          tin: sale.customerTIN || '',
          vat: sale.customerVAT || '',
        },
        items: sale.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          priceInc: item.priceInc,
          vatAmount: item.vatAmount,
          hsCode: item.hsCode || '',
        })),
        totalAmount: sale.totalInc,
        vatAmount: sale.vatAmount,
        receipt: sale.receipt,
        timestamp: sale.timestamp,
      };

      const response = await axios.post(
        `${this.apiUrl}/submit-invoice`,
        payload,
        { headers: this.generateHeaders(JSON.stringify(payload)) }
      );

      if (response.status === 200 && response.data.success) {
        return {
          success: true,
          error: null,
          qrCode: response.data.qrUrl,
          fiscalNumber: response.data.fiscalNumber,
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Failed to submit invoice',
          qrCode: null,
          fiscalNumber: null,
        };
      }
    } catch (error: any) {
      console.error('Fiscal Harmony API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        qrCode: null,
        fiscalNumber: null,
      };
    }
  }
}

export function createFiscalHarmonyClient(config: FiscalHarmonyConfig) {
  return new FiscalHarmonyClient(config);
}
