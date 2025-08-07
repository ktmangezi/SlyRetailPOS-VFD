import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { type Sale, type FiscalDays } from "@shared/schema";
import QRCode from "qrcode";
// import NotoEmoji from "@/fonts/NotoColorEmoji-Regular.ttf?url";
// import NotoEmoji from "@/fonts/NotoColorEmoji.ttf?url";
import NotoEmoji from "@/fonts/NotoEmoji-VariableFont_wght.ttf?url";
//import pdf lib fontkit
import fontkit from "@pdf-lib/fontkit";

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
      top: 30,
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
  size: ReceiptSize = "A4",
): Promise<Uint8Array> {
  try {
    const config = templateConfigs[size];
    const pdfDoc = await PDFDocument.create();

    // Set page height based on size
    const pageHeight = size === "A4" ? 842 : 1200; // Use standard A4 height for A4, larger for receipts
    let currentPage = pdfDoc.addPage([config.width, pageHeight]);

    // Set up fonts
    const courierFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

    pdfDoc.registerFontkit(fontkit);

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Try to embed emoji font
    let emojiFont = font; // fallback to regular font
    try {
      const fontResponse = await fetch(NotoEmoji);
      const fontBytes = await fontResponse.arrayBuffer();
      emojiFont = await pdfDoc.embedFont(fontBytes);
    } catch (error) {
      console.warn("Could not load emoji font, using fallback:", error);
    }

    let yOffset = pageHeight - config.margins.top;
    const lineHeight =
      size === "A4" ? config.fonts.normal * 1.2 : config.fonts.normal * 1.2; // Optimized spacing for A4
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

    const drawCenteredText = (
      text: string,
      fontSize: number = fonts.small,
      extraSpace: number = 0,
    ) => {
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

    const drawLeftText = (
      text: string,
      fontSize: number = fonts.small,
      bold: boolean = false,
      extraSpace: number = 0,
    ) => {
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

    // ZIMRA Information at the top (if any ZIMRA data exists)
    if (
      sale.zimraSubmitted === true ||
      sale.zimraQrData ||
      sale.zimraGlobalNo
    ) {
      // Add QR Code at the top
      if (sale.zimraQrData) {
        try {
          const generateZimraQrCodeUrl = () => {
            const qrUrl = import.meta.env.VITE_ZIMRA_QR_URL;
            const receiptDate = new Date(sale.timestamp);
            const day = receiptDate.getDate().toString().padStart(2, "0");
            const month = (receiptDate.getMonth() + 1)
              .toString()
              .padStart(2, "0");
            const year = receiptDate.getFullYear().toString();
            const formattedDate = `${day}${month}${year}`;
            const deviceId = (sale.zimraDeviceId ?? "")
              .toString()
              .padStart(10, "0");
            const receiptGlobalNo = (sale.zimraGlobalNo ?? "")
              .toString()
              .padStart(10, "0");
            const qrData = (sale.zimraQrData ?? "")
              .slice(0, 16)
              .padEnd(16, "0");
            return `${qrUrl}/${deviceId}${formattedDate}${receiptGlobalNo}${qrData}`;
          };

          const qrCodeUrl = generateZimraQrCodeUrl();
          const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, {
            width: size === "A4" ? 120 : 100,
            margin: 1,
          });

          const qrCodeImage = await pdfDoc.embedPng(qrCodeDataUrl);
          const qrCodeSize = size === "A4" ? 50 : 40; // Smaller QR code for header

          currentPage.drawImage(qrCodeImage, {
            x: (width - qrCodeSize) / 2,
            y: yOffset - qrCodeSize,
            width: qrCodeSize,
            height: qrCodeSize,
          });
          yOffset -= qrCodeSize + 10;

          // Add verification URL below QR code
          const verificationUrl = import.meta.env.VITE_ZIMRA_QR_URL;
          if (verificationUrl) {
            drawCenteredText("Verify at:", fonts.small);
            drawCenteredText(verificationUrl, fonts.small, 10);
          }
        } catch (error) {
          console.error("Error generating QR code:", error);
        }
      }
      // Add ZIMRA Verification Code
      if (sale.zimraQrData) {
        const verificationCode = `Verification Code: ${sale.zimraQrData}`;
        drawCenteredText(verificationCode, fonts.small);
      }

      // Add ZIMRA information right after header
      if (sale.zimraGlobalNo) {
        const globalInvoiceNumber = `Invoice Number: ${sale.receiptCounter}/${sale.zimraGlobalNo}`;
        drawCenteredText(globalInvoiceNumber, fonts.small, 2);
      }
      // Add Fiscal Day and Device ID on same line to save space
      let fiscalInfo = "";

      if (sale.zimraFiscalDayNo && sale.zimraDeviceId) {
        fiscalInfo = `Fiscal Day: ${sale.zimraFiscalDayNo} | Device ID: ${sale.zimraDeviceId}`;
      } else if (sale.zimraFiscalDayNo) {
        fiscalInfo = `Fiscal Day: ${sale.zimraFiscalDayNo}`;
      } else if (sale.zimraDeviceId) {
        fiscalInfo = `Device ID: ${sale.zimraDeviceId}`;
      }

      if (fiscalInfo) {
        drawCenteredText(fiscalInfo, fonts.small);
      }

      drawSeparatorLine();
    }
    // Header Section
    if (sale.receiptType === "FiscalInvoice") {
      drawCenteredText("Fiscal Tax Invoice", fonts.header, 5);
    } else if (sale.receiptType === "CreditNote") {
      drawCenteredText("Credit Note", fonts.header, 5);
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
      if (sale.customerTIN) {
        drawLeftText("TIN: " + sale.customerTIN, fonts.small);
      }
      if (sale.customerVAT) {
        drawLeftText("VAT: " + sale.customerVAT, fonts.small);
      }
      if (sale.customerAddress) {
        drawLeftText(sale.customerAddress, fonts.small);
      }
      if (sale.customerCity) {
        drawLeftText(sale.customerCity, fonts.small);
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
    const columns =
      size === "A4"
        ? {
            hsCode: margins.left,
            item: margins.left + 80,
            vat: width * 0.65,
            total: width * 0.8,
          }
        : {
            item: margins.left,
            vat: width * 0.6,
            total: width * 0.8,
          };

    // Column headers
    checkPageBreak(lineHeight * 3);
    if (size === "A4") {
      currentPage.drawText("HSCode", {
        x: columns.hsCode,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
    }
    currentPage.drawText("Item", {
      x: columns.item,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
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

      if (size === "A4") {
        // For A4: HSCode in dedicated column, item name on same line
        currentPage.drawText(item.hsCode || "", {
          x: columns.hsCode,
          y: yOffset,
          size: fonts.small,
          font: courierFont,
          color: textColor,
        });

        // Process the entire item name with mixed font rendering
        const itemName = item.name;
        // More specific emoji regex that excludes numbers and common punctuation
        const emojiRegex =
          /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
        let lastIndex = 0;
        const segments = [];

        // Find all emoji positions and create segments
        let match;
        while ((match = emojiRegex.exec(itemName)) !== null) {
          // Add preceding non-emoji text
          if (match.index > lastIndex) {
            segments.push({
              text: itemName.substring(lastIndex, match.index),
              isEmoji: false,
            });
          }

          // Add the emoji
          segments.push({
            text: match[0],
            isEmoji: true,
          });

          lastIndex = match.index + match[0].length;
        }

        // Add remaining non-emoji text
        if (lastIndex < itemName.length) {
          segments.push({
            text: itemName.substring(lastIndex),
            isEmoji: false,
          });
        }

        // If no emojis found, treat entire line as non-emoji
        if (segments.length === 0) {
          segments.push({
            text: itemName,
            isEmoji: false,
          });
        }

        // Draw each segment with appropriate font
        let xOffset = columns.item;
        for (const segment of segments) {
          console.log(segment);
          if (segment.text.length > 0) {
            const font = segment.isEmoji ? emojiFont : courierFont;

            currentPage.drawText(segment.text, {
              x: xOffset,
              y: yOffset,
              size: fonts.normal,
              font: font,
              color: textColor,
            });

            // Calculate width using the actual font
            xOffset += font.widthOfTextAtSize(segment.text, fonts.normal);
          }
        }

        // Move to next line for quantity, price, VAT and Total amounts
        yOffset -= lineHeight;

        const qtyPrice = `${item.quantity} x ${formatAmount(item.priceInc)}`;
        currentPage.drawText(qtyPrice, {
          x: columns.item + 10,
          y: yOffset,
          size: fonts.small,
          font: courierFont,
          color: textColor,
        });
        currentPage.drawText(formatAmount(item.vatAmount), {
          x: columns.vat,
          y: yOffset,
          size: fonts.small,
          font: courierFont,
          color: textColor,
        });
        currentPage.drawText(formatAmount(item.totalInc), {
          x: columns.total,
          y: yOffset,
          size: fonts.small,
          font: courierFont,
          color: textColor,
        });

        yOffset -= lineHeight * 0.8;
      } else {
        // For receipts: keep inline HSCode display
        drawLeftText(`HSCode: ${item.hsCode}`, fonts.small);

        // Item name (with wrapping for long names)
        const itemName = item.name;
        const maxItemWidth = columns.vat - columns.item - 20;
        const nameWidth = emojiFont.widthOfTextAtSize(itemName, fonts.normal);

        if (nameWidth > maxItemWidth) {
          // Simple word wrapping for long item names
          const words = itemName.split(" ");
          let currentLine = "";
          let lines: string[] = [];

          for (const word of words) {
            //get where the word is not  characters but an emoji
            const emojiRegex =
              /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
            const emojiMatch = word.match(emojiRegex);
            const testLine = currentLine + (currentLine ? " " : "") + word;
            let testWidth = 0;
            if (emojiMatch) {
              testWidth = emojiFont.widthOfTextAtSize(testLine, fonts.normal);
            } else {
              testWidth = courierFont.widthOfTextAtSize(testLine, fonts.normal);
            }
            console.log(testWidth, maxItemWidth);

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

          // Display item name lines with mixed font rendering
          for (const line of lines) {
            const emojiRegex =
              /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
            let lastIndex = 0;
            const segments = [];

            // Find all emoji positions and create segments
            let match;
            while ((match = emojiRegex.exec(line)) !== null) {
              // Add preceding non-emoji text
              if (match.index > lastIndex) {
                segments.push({
                  text: line.substring(lastIndex, match.index),
                  isEmoji: false,
                });
              }

              // Add the emoji
              segments.push({
                text: match[0],
                isEmoji: true,
              });

              lastIndex = match.index + match[0].length;
            }

            // Add remaining non-emoji text
            if (lastIndex < line.length) {
              segments.push({
                text: line.substring(lastIndex),
                isEmoji: false,
              });
            }

            // If no emojis found, treat entire line as non-emoji
            if (segments.length === 0) {
              segments.push({
                text: line,
                isEmoji: false,
              });
            }

            // Draw each segment with appropriate font
            let xOffset = columns.item;
            for (const segment of segments) {
              if (segment.text.length > 0) {
                const font = segment.isEmoji ? emojiFont : courierFont;

                currentPage.drawText(segment.text, {
                  x: xOffset,
                  y: yOffset,
                  size: fonts.normal,
                  font: font,
                  color: textColor,
                });

                // Calculate width using the actual font
                xOffset += font.widthOfTextAtSize(segment.text, fonts.normal);
              }
            }

            yOffset -= lineHeight;
          }
        } else {
          // Process the entire item name with mixed font rendering (same as A4)
          const emojiRegex =
            /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
          let lastIndex = 0;
          const segments = [];

          // Find all emoji positions and create segments
          let match;
          while ((match = emojiRegex.exec(itemName)) !== null) {
            // Add preceding non-emoji text
            if (match.index > lastIndex) {
              segments.push({
                text: itemName.substring(lastIndex, match.index),
                isEmoji: false,
              });
            }

            // Add the emoji
            segments.push({
              text: match[0],
              isEmoji: true,
            });

            lastIndex = match.index + match[0].length;
          }

          // Add remaining non-emoji text
          if (lastIndex < itemName.length) {
            segments.push({
              text: itemName.substring(lastIndex),
              isEmoji: false,
            });
          }

          // If no emojis found, treat entire line as non-emoji
          if (segments.length === 0) {
            segments.push({
              text: itemName,
              isEmoji: false,
            });
          }

          // Draw each segment with appropriate font
          let xOffset = columns.item;
          for (const segment of segments) {
            if (segment.text.length > 0) {
              const font = segment.isEmoji ? emojiFont : courierFont;

              currentPage.drawText(segment.text, {
                x: xOffset,
                y: yOffset,
                size: fonts.normal,
                font: font,
                color: textColor,
              });

              // Calculate width using the actual font
              xOffset += font.widthOfTextAtSize(segment.text, fonts.normal);
            }
          }

          yOffset -= lineHeight;
        }

        // Quantity and price line for receipts only
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
        yOffset -= lineHeight * 0.8; // Reduced spacing between items
      }
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
    yOffset -= lineHeight * 1;

    // Payment Details
    drawLeftText("Payment Details:", fonts.normal, true, 5);
    for (const payment of sale.payments) {
      // Handle currency which might be an object or string
      const currency =
        typeof payment.currency === "string"
          ? payment.currency
          : (payment.currency as any)?.name ||
            (payment.currency as any)?.isoCode ||
            "USD";
      const paymentText = `Currency: ${currency} ${formatAmount(payment.amount)}`;
      drawLeftText(paymentText, fonts.normal);
    }

    // ZIMRA information is now at the top of the invoice for better visibility

    return await pdfDoc.save();
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}

export async function downloadReceipt(
  sale: Sale,
  size: ReceiptSize = "A4",
): Promise<boolean> {
  try {
    const pdfBytes = await generatePDF(sale, size);

    if (!pdfBytes || pdfBytes.length === 0) {
      console.error("Generated PDF is empty");
      return false;
    }

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    console.log("url", url);

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

export async function downloadCSV(sale: Sale): Promise<boolean> {
  try {
    console.log("Starting CSV download process for receipt:", sale.receipt);

    // Create CSV content
    const headers = [
      "Item Name",
      "HSCode",
      "Quantity",
      "Price Inc",
      "VAT Amount",
      "Total Inc",
    ];
    // console.log("CSV headers prepared, processing items...");

    const itemRows = sale.items.map((item) => [
      item.name,
      item.hsCode,
      item.quantity,
      Number(item.priceInc).toFixed(2),
      Number(item.vatAmount).toFixed(2),
      Number(item.totalInc).toFixed(2),
    ]);

    // Add summary rows
    const summaryRows = [
      ["", "", "", "", "", ""],
      ["Receipt Details", "", "", "", "", ""],
      ["Receipt Number", sale.receipt, "", "", "", ""],
      ["Date", new Date(sale.timestamp), "", "", "", ""],
      ["", "", "", "", "", ""],
      ["Customer Details", "", "", "", "", ""],
      ["Customer Name", sale.customerName || "Cash Sale", "", "", "", ""],
      ["Customer Address", sale.customerAddress || "", "", "", "", ""],
      ["Customer City", sale.customerCity || "", "", "", "", ""],
      ["Customer Email", sale.customerEmail || "", "", "", "", ""],
      ["Customer Contact", sale.customerContact || "", "", "", "", ""],
      ["Customer TIN", sale.customerTIN || "", "", "", "", ""],
      ["Customer VAT", sale.customerVAT || "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["Totals", "", "", "", "", ""],
      ["Subtotal", "", "", "", "", Number(sale.total).toFixed(2)],
      ["VAT Amount", "", "", "", "", Number(sale.vatAmount).toFixed(2)],
      ["Total Inc VAT", "", "", "", "", Number(sale.totalInc).toFixed(2)],
      ["", "", "", "", "", ""],
      ["Payment Details", "", "", "", "", ""],
    ];

    // Add payment rows
    const paymentRows = sale.payments.map((payment) => [
      "Payment",
      payment.currency,
      Number(payment.amount).toFixed(2),
      "",
      "",
      "",
    ]);

    // Combine all rows
    const allRows = [headers, ...itemRows, ...summaryRows, ...paymentRows];

    // Convert to CSV string
    const csvContent = allRows
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt-${sale.receipt}.csv`;

    // Add same debugging for CSV downloads
    // console.log("Creating download link for CSV:", url);

    document.body.appendChild(link);
    // console.log("CSV link appended to document, dispatching click event");

    try {
      // Use only one click method to avoid duplicate downloads
      // Standard method works in most browsers
      link.click();
      // console.log("CSV link click() method called");

      // No longer using the MouseEvent approach to avoid duplicate downloads
    } catch (e) {
      console.error("Error during CSV click event:", e);
    }

    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log("CSV download cleanup completed");
    }, 1000); // Increased timeout to ensure download starts

    return true;
  } catch (error) {
    console.error("Error creating CSV:", error);
    return false;
  }
}

export async function downloadTaxSchedule(
  sales: Sale[],
  dateFrom?: Date,
  dateTo?: Date,
): Promise<boolean> {
  try {
    // Filter sales by date range if provided
    let filteredSales = sales;
    if (dateFrom && dateTo) {
      filteredSales = sales.filter((sale) => {
        const saleDate = new Date(sale.timestamp);
        return saleDate >= dateFrom && saleDate <= dateTo;
      });
    }

    // Create CSV content for tax schedule
    const headers = [
      "Date",
      "Invoice Number",
      "Customer",
      "Tax Amount",
      "Invoice Total Inclusive",
    ];
    const csvRows = [headers.join(",")];
    // Add sales data rows
    // for (const sale of filteredSales) {
    for (const sale of sales) {
      const row = [
        new Date(sale.timestamp).toLocaleDateString(),
        "#" + sale.receipt,
        `"${(sale.customerName || "Cash Sale").replace(/"/g, '""')}"`,
        parseFloat(sale.vatAmount.toString()).toFixed(2),
        parseFloat(sale.totalInc.toString()).toFixed(2),
      ];
      csvRows.push(row.join(","));
    }

    // Create and download CSV file
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    link.download = `tax-schedule.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error("Error downloading tax schedule:", error);
    return false;
  }
}
//======================================================FISCAL DAY REPORT==============================================================
export async function generateFiscalDayReportPDF(
  fiscalData: FiscalDays,
): Promise<Uint8Array | null> {
  try {
    console.log(fiscalData.closedAt);
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();
    const margins = { top: 30, right: 50, bottom: 60, left: 50 };
    const fonts = {
      header: 16,
      normal: 14,
      small: 12,
    };
    const textColor = rgb(0, 0, 0);
    let yOffset = height - margins.top;
    const lineHeight = fonts.normal * 1.2;
    const courierFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);
    // Add header
    page.drawText("Z REPORT", {
      x: margins.left,
      y: yOffset,
      size: fonts.header,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight * 2;
    // Add company details
    page.drawText("Company Name", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Company Address", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Company TIN", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Company VAT", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight * 1;
    //put a dotet line seperator
    page.drawLine({
      start: { x: margins.left, y: yOffset },
      end: { x: width - margins.right, y: yOffset },
      thickness: 1.9,
      color: rgb(0, 0, 0),
      opacity: 0.5,
      dashArray: [2, 2],
    });
    yOffset -= lineHeight * 2;

    // Add fiscal day details
    page.drawText("Fiscal Day No: " + fiscalData.fiscalDayNo, {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Opened At: " + fiscalData.openedAt, {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Closed At: " + fiscalData.closedAt, {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight;
    page.drawText("Device ID: " + fiscalData.deviceId, {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierFont,
      color: textColor,
    });
    yOffset -= lineHeight * 1;

    // Add fiscal counters
    //loop within counters for USD Sales Exc Statistics
    let totalUSDVATNetSales = 0;
    let totalUSDZeroRatedNetSales = 0;
    let totalUSDExemptNetSales = 0;

    let totalUSDTaxation = 0;

    // Add column headers
    page.drawText("Description", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    page.drawText("Amount", {
      x: width - margins.right - 100,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;

    // Add separator line for headers
    page.drawLine({
      start: { x: margins.left, y: yOffset },
      end: { x: width - margins.right, y: yOffset },
      thickness: 1,
      color: rgb(0, 0, 0),
      opacity: 0.3,
    });
    yOffset -= lineHeight;

    page.drawText("USD", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "USD") {
        //Total Inc, Standard rated 15%
        if (
          counter.fiscalCounterTaxPercent === 15 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalUSDVATNetSales += counter.fiscalCounterValue;
          page.drawText("Total Sales Inc @ Standard rated 15%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
        //Total Inc, Zero rated 0%
        if (
          counter.fiscalCounterTaxPercent === 0 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalUSDZeroRatedNetSales += counter.fiscalCounterValue;
          page.drawText("Net Sales @ Zero rated 0%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
        //Total Inc Exempt
        if (
          counter.fiscalCounterTaxID === 3 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalUSDExemptNetSales += counter.fiscalCounterValue;
          page.drawText("Net Exempt Sales", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
      }
    }
    //Total USD Net Sales Inc Tax
    let totalNetSalesUSD =
      totalUSDVATNetSales + totalUSDZeroRatedNetSales + totalUSDExemptNetSales;
    page.drawText("Total Net Sales Inc", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    page.drawText(totalNetSalesUSD.toFixed(2), {
      x: width - margins.right - 100,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;

    yOffset -= lineHeight * 1;

    //===================USD TAXATION TOTALS==================================
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "USD") {
        //Tax, Standard rated 15%
        if (
          counter.fiscalCounterTaxPercent === 15 &&
          counter.fiscalCounterType === "SaleTaxByTax"
        ) {
          totalUSDTaxation += counter.fiscalCounterValue;
          page.drawText("Taxation @ Standard rated 15%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
      }
    }
    //Total USD Taxation on Sales
    page.drawText("Total Taxation On Sales ", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    page.drawText(totalUSDTaxation.toFixed(2), {
      x: width - margins.right - 100,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;
    yOffset -= lineHeight * 1;

    //================TOTALs EXCLUDING TAX SUBTOTALS=====================
    let grossUSDTotal = totalUSDVATNetSales - totalUSDTaxation;
    //Gross, Standard rated 15%
    if (totalUSDVATNetSales > 0) {
      page.drawText("Net Sales @ Standard rated 15%", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(grossUSDTotal.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }

    //Gross, Zero rated 0%
    if (totalUSDZeroRatedNetSales > 0) {
      page.drawText("Total Zero Rated Sales ", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(totalUSDZeroRatedNetSales.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }
    //Exempt
    if (totalUSDExemptNetSales > 0) {
      page.drawText("Total Exempt Sales", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(totalUSDExemptNetSales.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }
    //Total net Sales
    let totalUSDSalesInc =
      grossUSDTotal + totalUSDZeroRatedNetSales + totalUSDExemptNetSales;
    page.drawText("Total Net Sales Exc", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    page.drawText(totalUSDSalesInc.toFixed(2), {
      x: width - margins.right - 100,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;
    yOffset -= lineHeight * 1;

    //PAYMENTS
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "USD") {
        //Tax, Standard rated 15%
        if (counter.fiscalCounterType === "BalanceByMoneyType") {
          //create and array with Cash, Card
          const paymentMethods = [
            "Cash",
            "Card",
            "MobileWallet",
            "Coupon",
            "Credit",
            "BankTransfer",
            "Other",
          ];
          //loop within paymentMethods
          for (const paymentMethod of paymentMethods) {
            if (counter.fiscalCounterMoneyType === paymentMethod) {
              page.drawText("Payment Methods: " + paymentMethod, {
                x: margins.left,
                y: yOffset,
                size: fonts.normal,
                font: courierFont,
                color: textColor,
              });
              page.drawText(counter.fiscalCounterValue.toFixed(2), {
                x: width - margins.right - 100,
                y: yOffset,
                size: fonts.normal,
                font: courierFont,
                color: textColor,
              });
            }
          }
          yOffset -= lineHeight;
        }
      }
    }

    //put a dotet line seperator
    page.drawLine({
      start: { x: margins.left, y: yOffset },
      end: { x: width - margins.right, y: yOffset },
      thickness: 1.9,
      color: rgb(0, 0, 0),
      opacity: 0.5,
      dashArray: [2, 2],
    });
    yOffset -= lineHeight * 1;

    //==============================ZWG Z-REPORTING================================
    let totalZWGVATNetSales = 0;
    let totalZWGZeroRatedNetSales = 0;
    let totalZWGExemptNetSales = 0;

    let totalZWGTaxation = 0;
    page.drawText("ZWG", {
      x: margins.left,
      y: yOffset,
      size: fonts.normal,
      font: courierBold,
      color: textColor,
    });
    yOffset -= lineHeight;
    //========================ZWG inlusive TOTALS===========================
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "ZWG") {
        //Total Inc, Standard rated 15%
        if (
          counter.fiscalCounterTaxPercent === 15 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalZWGVATNetSales += counter.fiscalCounterValue;
          page.drawText("Total Sales Inc @ Standard rated 15%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
        //Total Inc, Zero rated 0%
        if (
          counter.fiscalCounterTaxPercent === 0 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalZWGZeroRatedNetSales += counter.fiscalCounterValue;
          page.drawText("Net Sales @ Zero rated 0%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
        //Total Inc Exempt
        if (
          counter.fiscalCounterTaxID === 3 &&
          counter.fiscalCounterType === "SaleByTax"
        ) {
          totalZWGExemptNetSales += counter.fiscalCounterValue;
          page.drawText("Net Exempt Sales", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
      }
    }
    //Total ZWG Net Sales Inc Tax
    let totalNetSalesZWG =
      totalZWGVATNetSales + totalZWGZeroRatedNetSales + totalZWGExemptNetSales;
    if (totalNetSalesZWG > 0) {
      page.drawText("Total Net Sales Inc", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
      page.drawText(totalNetSalesZWG.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
    }
    yOffset -= lineHeight;
    yOffset -= lineHeight * 1;

    //================ZWG TAXATION TOTALS============
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "ZWG") {
        //Tax, Standard rated 15%
        if (
          counter.fiscalCounterTaxPercent === 15 &&
          counter.fiscalCounterType === "SaleTaxByTax"
        ) {
          totalZWGTaxation += counter.fiscalCounterValue;
          page.drawText("Taxation @ Standard rated 15%", {
            x: margins.left,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          page.drawText(counter.fiscalCounterValue.toFixed(2), {
            x: width - margins.right - 100,
            y: yOffset,
            size: fonts.normal,
            font: courierFont,
            color: textColor,
          });
          yOffset -= lineHeight;
        }
      }
    }
    //Total ZWG taxation on Sales
    if (totalZWGTaxation > 0) {
      page.drawText("Total Taxation On Sales ", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
      page.drawText(totalZWGTaxation.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
      yOffset -= lineHeight;
      yOffset -= lineHeight * 1;
    }
    //================TOTALs EXCLUDING TAX SUBTOTALS=====================
    let grossZWGTotal = totalZWGVATNetSales - totalZWGTaxation;
    //TOTAL Exc, Standard rated 15%
    if (totalZWGVATNetSales > 0) {
      page.drawText("Net Sales @ Standard rated 15%", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(grossZWGTotal.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }

    //TOTAL Exc, Zero rated 0%
    if (totalZWGZeroRatedNetSales > 0) {
      page.drawText("Total Zero Rated Sales ", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(totalZWGZeroRatedNetSales.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }
    //TOTAL Exc Exempt
    if (totalZWGExemptNetSales > 0) {
      page.drawText("Total Exempt Sales", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      page.drawText(totalZWGExemptNetSales.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierFont,
        color: textColor,
      });
      yOffset -= lineHeight;
    }
    //Total Net Sales Exc Tax
    let totalZWGSalesExc =
      grossZWGTotal + totalZWGZeroRatedNetSales + totalZWGExemptNetSales;
    if (totalZWGSalesExc > 0) {
      page.drawText("Total Net Sales Exc", {
        x: margins.left,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
      page.drawText(totalZWGSalesExc.toFixed(2), {
        x: width - margins.right - 100,
        y: yOffset,
        size: fonts.normal,
        font: courierBold,
        color: textColor,
      });
    }
    yOffset -= lineHeight;
    yOffset -= lineHeight * 1;

    //PAYMENTS
    for (const counter of fiscalData.fiscalCounters) {
      if (counter.fiscalCounterCurrency === "ZWG") {
        //Tax, Standard rated 15%
        if (counter.fiscalCounterType === "BalanceByMoneyType") {
          //create an array with Cash, Card AND ALL OTHER PAYMENT METHODS
          const paymentMethods = [
            "Cash",
            "Card",
            "MobileWallet",
            "Coupon",
            "Credit",
            "BankTransfer",
            "Other",
          ];
          //loop within paymentMethods
          for (const paymentMethod of paymentMethods) {
            if (counter.fiscalCounterMoneyType === paymentMethod) {
              page.drawText("Payment Methods: " + paymentMethod, {
                x: margins.left,
                y: yOffset,
                size: fonts.normal,
                font: courierFont,
                color: textColor,
              });
              page.drawText(counter.fiscalCounterValue.toFixed(2), {
                x: width - margins.right - 100,
                y: yOffset,
                size: fonts.normal,
                font: courierFont,
                color: textColor,
              });
            }
          }
          yOffset -= lineHeight;
        }
      }
    }
    //put a dotet line seperator
    page.drawLine({
      start: { x: margins.left, y: yOffset },
      end: { x: width - margins.right, y: yOffset },
      thickness: 1.9,
      color: rgb(0, 0, 0),
      opacity: 0.5,
      dashArray: [2, 2],
    });
    yOffset -= lineHeight * 2;

    // Save and return the PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
  } catch (error) {
    console.error("Error generating fiscal day PDF:", error);
    return null;
  }
}
