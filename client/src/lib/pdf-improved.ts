import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { type Sale } from "@shared/schema";
import QRCode from "qrcode";

export type ReceiptSize = "A4" | "80mm" | "50mm";

interface TemplateConfig {
  width: number;
  height: number;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  fonts: {
    header: number;
    normal: number;
    small: number;
  };
}

const templateConfigs: Record<ReceiptSize, Omit<TemplateConfig, "height">> = {
  A4: {
    width: 595,
    margins: {
      top: 60,
      right: 50,
      bottom: 60,
      left: 50,
    },
    fonts: {
      header: 16,
      normal: 14,
      small: 12,
    },
  },
  "80mm": {
    width: 230,
    margins: {
      top: 25,
      right: 20,
      bottom: 25,
      left: 20,
    },
    fonts: {
      header: 20,
      normal: 14,
      small: 12,
    },
  },
  "50mm": {
    width: 175,
    margins: {
      top: 20,
      right: 15,
      bottom: 20,
      left: 15,
    },
    fonts: {
      header: 16,
      normal: 11,
      small: 9,
    },
  },
};

export async function generatePDF(
  sale: Sale,
  size: ReceiptSize = "80mm",
): Promise<Uint8Array> {
  try {
    const config = templateConfigs[size];
    const pdfDoc = await PDFDocument.create();
    
    // Set page height based on size
    const pageHeight = size === "A4" ? 842 : 1200; // Use standard A4 height for A4, larger for receipts
    let currentPage = pdfDoc.addPage([config.width, pageHeight]);
    
    // Set up fonts
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    let yOffset = pageHeight - config.margins.top;
    const lineHeight = size === "A4" ? config.fonts.normal * 1.5 : config.fonts.normal * 1.2; // Better spacing for A4
    const { width, margins, fonts } = config;
    const textColor = rgb(0, 0, 0);

    // Helper functions
    const centerText = (text: string, fontSize: number) => {
      const textWidth = courierFont.widthOfTextAtSize(text, fontSize);
      return (width - textWidth) / 2;
    };

    const formatAmount = (amount: number | string) => {
      const num = typeof amount === "string" ? parseFloat(amount) : amount;
      return isNaN(num) ? "$0.00" : `$${num.toFixed(2)}`;
    };

    const checkPageBreak = (requiredSpace: number = lineHeight) => {
      if (size === "A4" && yOffset - requiredSpace < margins.bottom) {
        currentPage = pdfDoc.addPage([config.width, pageHeight]);
        yOffset = pageHeight - margins.top;
        return true;
      }
      return false;
    };

    const drawCenteredText = (text: string, fontSize: number = fonts.small, extraSpace: number = 0) => {
      if (text) {
        checkPageBreak(lineHeight + extraSpace);
        currentPage.drawText(text, {
          x: centerText(text, fontSize),
          y: yOffset,
          size: fontSize,
          font: courierFont,
          color: textColor,
        });
        yOffset -= lineHeight + extraSpace;
      }
    };

    const drawLeftText = (text: string, fontSize: number = fonts.small, bold: boolean = false, extraSpace: number = 0) => {
      checkPageBreak(lineHeight + extraSpace);
      currentPage.drawText(text, {
        x: margins.left,
        y: yOffset,
        size: fontSize,
        font: bold ? courierBold : courierFont,
        color: textColor,
      });
      yOffset -= lineHeight + extraSpace;
    };

    const drawSeparatorLine = () => {
      checkPageBreak(lineHeight);
      currentPage.drawLine({
        start: { x: margins.left, y: yOffset },
        end: { x: width - margins.right, y: yOffset },
        thickness: 0.5,
        color: rgb(0, 0, 0),
        opacity: 0.5,
        dashArray: [1, 1],
      });
      yOffset -= lineHeight;
    };

    // Header Section
    if (sale.receiptType === "FiscalInvoice") {
      drawCenteredText("Fiscal Tax Invoice", fonts.header, 10);
    } else if (sale.receiptType === "CreditNote") {
      drawCenteredText("Credit Note", fonts.header, 10);
    }

    // Store Information
    drawCenteredText(sale.storeName, fonts.header, 5);
    
    if (sale.storeAddress) {
      drawCenteredText(sale.storeAddress, fonts.small);
    }
    if (sale.storeCity) {
      drawCenteredText(sale.storeCity, fonts.small);
    }
    if (sale.storeEmail) {
      drawCenteredText(sale.storeEmail, fonts.small);
    }
    if (sale.storeContactNumber) {
      drawCenteredText(`Tel: ${sale.storeContactNumber}`, fonts.small);
    }
    if (sale.storeTINnumber) {
      drawCenteredText(`TIN No: ${sale.storeTINnumber}`, fonts.small);
    }
    if (sale.storeVATnumber) {
      drawCenteredText(`VAT No: ${sale.storeVATnumber}`, fonts.small);
    }

    drawSeparatorLine();

    // Customer Details
    drawLeftText("Customer Details:", fonts.normal, true, 5);
    
    if (sale.customerName) {
      drawLeftText(sale.customerName, fonts.small);
      if (sale.customerAddress) {
        drawLeftText(sale.customerAddress, fonts.small);
      }
      if (sale.customerContact) {
        drawLeftText(`Tel: ${sale.customerContact}`, fonts.small);
      }
    }

    drawSeparatorLine();

    // Receipt Details
    const pdftime = String(sale.timestamp).split("T")[1].split(".")[0];
    let details: string[] = [];

    if (sale.receiptType === "FiscalInvoice") {
      details = [
        `Receipt: #${sale.receipt}`,
        `Date: ${new Date(sale.timestamp).toLocaleDateString()}`,
        `Ref: ${sale.notes}`,
        `Time: ${pdftime}`,
      ];
    } else if (sale.receiptType === "CreditNote") {
      details = [
        `CreditNote: #${sale.receipt}`,
        `Refund For: #${sale.refundFor}`,
        `Reason: ${sale.notes}`,
        `Date: ${new Date(sale.timestamp).toLocaleDateString()}`,
        `Time: ${new Date(sale.timestamp).toLocaleTimeString()}`,
      ];
    }

    for (const detail of details) {
      drawLeftText(detail, fonts.normal);
    }

    yOffset -= lineHeight;

    // Items Section
    const columns = {
      item: margins.left,
      vat: width * 0.6,
      total: width * 0.8,
    };

    // Column headers
    checkPageBreak(lineHeight * 3);
    currentPage.drawText("Item", {
      x: columns.item,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    currentPage.drawText("VAT", {
      x: columns.vat,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    currentPage.drawText("Total", {
      x: columns.total,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight * 0.5;

    drawSeparatorLine();

    // Items
    for (const item of sale.items) {
      // Check for adequate space for item (HSCode + name + quantity line + spacing)
      checkPageBreak(lineHeight * 4);
      
      // HSCode
      drawLeftText(`HSCode: ${item.hsCode}`, fonts.small);
      
      // Item name (with wrapping for long names)
      const itemName = item.name;
      const maxItemWidth = columns.vat - columns.item - 20;
      const nameWidth = courierFont.widthOfTextAtSize(itemName, fonts.normal);
      
      if (nameWidth > maxItemWidth) {
        // Simple word wrapping for long item names
        const words = itemName.split(" ");
        let currentLine = "";
        let lines: string[] = [];
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? " " : "") + word;
          const testWidth = courierFont.widthOfTextAtSize(testLine, fonts.normal);
          
          if (testWidth > maxItemWidth && currentLine !== "") {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
        }
        
        for (const line of lines) {
          drawLeftText(line, fonts.normal);
        }
      } else {
        drawLeftText(itemName, fonts.normal);
      }
      
      // Quantity and price line
      const qtyPrice = `${item.quantity} x ${formatAmount(item.priceInc)}`;
      const vatAmount = formatAmount(item.vatAmount);
      const totalAmount = formatAmount(item.totalInc);
      
      checkPageBreak(lineHeight);
      currentPage.drawText(qtyPrice, {
        x: columns.item + 10,
        y: yOffset,
        size: fonts.small,
        font: courierFont,
        color: textColor,
      });
      currentPage.drawText(vatAmount, {
        x: columns.vat,
        y: yOffset,
        size: fonts.small,
        font: courierFont,
        color: textColor,
      });
      currentPage.drawText(totalAmount, {
        x: columns.total,
        y: yOffset,
        size: fonts.small,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight * 1.5; // Extra spacing between items
    }

    drawSeparatorLine();

    // Totals Section
    const subtotal = formatAmount(Number(sale.total));
    const vatTotal = formatAmount(sale.vatAmount);
    const total = formatAmount(sale.totalInc);

    checkPageBreak(lineHeight * 4);
    
    currentPage.drawText("Subtotal:", {
      x: columns.vat - 50,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    currentPage.drawText(subtotal, {
      x: columns.total,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;

    currentPage.drawText("VAT (15%):", {
      x: columns.vat - 50,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    currentPage.drawText(vatTotal, {
      x: columns.total,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;

    currentPage.drawText("Total Inc VAT:", {
      x: columns.vat - 50,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    currentPage.drawText(total, {
      x: columns.total,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight * 2;

    // Payment Details
    drawLeftText("Payment Details:", fonts.normal, true, 5);
    for (const payment of sale.payments) {
      // Handle currency which might be an object or string
      const currency = typeof payment.currency === "string" 
        ? payment.currency 
        : (payment.currency as any)?.name || (payment.currency as any)?.isoCode || "USD";
      const paymentText = `Currency: ${currency} ${formatAmount(payment.amount)}`;
      drawLeftText(paymentText, fonts.normal);
    }

    // ZIMRA Information (if submitted)
    if (sale.zimraSubmitted === true) {
      yOffset -= lineHeight;
      drawSeparatorLine();
      
      if (sale.zimraGlobalNo) {
        const globalInvoiceNumber = `Invoice Number: ${sale.receiptCounter}/${sale.zimraGlobalNo}`;
        drawCenteredText(globalInvoiceNumber, fonts.small, 5);
      }
      
      const verificationUrl = import.meta.env.VITE_ZIMRA_QR_URL;
      if (verificationUrl) {
        drawCenteredText("Verify Invoice at:", fonts.small);
        drawCenteredText(verificationUrl, fonts.small, 10);
      }

      // QR Code
      if (sale.zimraQrData) {
        try {
          const generateZimraQrCodeUrl = () => {
            const qrUrl = import.meta.env.VITE_ZIMRA_QR_URL;
            const receiptDate = new Date(sale.timestamp);
            const day = receiptDate.getDate().toString().padStart(2, "0");
            const month = (receiptDate.getMonth() + 1).toString().padStart(2, "0");
            const year = receiptDate.getFullYear().toString();
            const formattedDate = `${day}${month}${year}`;
            const deviceId = (sale.zimraDeviceId ?? "").toString().padStart(10, "0");
            const receiptGlobalNo = (sale.zimraGlobalNo ?? "").toString().padStart(10, "0");
            const qrData = (sale.zimraQrData ?? "").slice(0, 16).padEnd(16, "0");
            return `${qrUrl}/${deviceId}${formattedDate}${receiptGlobalNo}${qrData}`;
          };

          const qrCodeUrl = generateZimraQrCodeUrl();
          const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, {
            width: size === "A4" ? 150 : 120,
            margin: 2,
          });

          const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
          const qrCodeSize = size === "A4" ? 80 : 60;
          
          checkPageBreak(qrCodeSize + 20);
          currentPage.drawImage(qrCodeImage, {
            x: (width - qrCodeSize) / 2,
            y: yOffset - qrCodeSize,
            width: qrCodeSize,
            height: qrCodeSize,
          });
          yOffset -= qrCodeSize + 10;
        } catch (error) {
          console.error("Error generating QR code:", error);
        }
      }
    }

    return await pdfDoc.save();
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}

export async function downloadReceipt(
  sale: Sale,
  size: ReceiptSize = "80mm",
): Promise<boolean> {
  try {
    const pdfBytes = await generatePDF(sale, size);

    if (!pdfBytes || pdfBytes.length === 0) {
      console.error("Generated PDF is empty");
      return false;
    }

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-${sale.receipt}.pdf`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error("Error downloading receipt:", error);
    return false;
  }
}