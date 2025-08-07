import type { Sale } from "@shared/schema";
import { generatePDF } from "./pdf";

export type ReceiptSize = "A4" | "80mm" | "50mm";

// Check if running on Windows
const isWindows = () => {
  return navigator.platform.indexOf('Win') > -1;
};

export async function printReceipt({ sale }: { sale: Sale }): Promise<boolean> {
  try {
    const pdfBytes = await generatePDF(sale, "80mm"); // Use the same PDF generation for both preview and print
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    // Open in new window
    const receiptWindow = window.open(url, '_blank');
    if (!receiptWindow) {
      throw new Error('Could not open receipt window');
    }

    // Wait for window to load
    return new Promise((resolve) => {
      receiptWindow.onload = () => {
        if (isWindows()) {
          receiptWindow.print();
        }
        receiptWindow.onafterprint = () => {
          receiptWindow.close();
          URL.revokeObjectURL(url);
          resolve(true);
        };
      };
    });

  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
}