import { getMerchantIDBYToken } from "./tenant-db";
import { v4 as uuidv4 } from "uuid";
//SHOULD ME IN SCHEMAS
// Interface for a debit note item
interface DebitNoteItem {
  itemId: string;
  sku: string;
  hscode: string;
  name: string;
  quantity: number;
  price: number;
}

// Interface for the debit note data
interface DebitNoteData {
  supplierName: string;
  supplierVAT: string;
  supplierTIN: string;
  reason: string;
  items: DebitNoteItem[];
}

/**
 * Create a debit note for a purchase from a supplier
 */
export async function createDebitNote({
  token,
  supplierName,
  supplierVAT,
  supplierTIN,
  reason,
  items,
}: DebitNoteData & { token: string }) {
  try {
    // Get the merchant ID from the token for tenant identification
    const merchantId = await getMerchantIDBYToken(token);
    if (!merchantId) {
      throw new Error("Invalid API token");
    }

    // Generate a unique receipt number for the debit note
    const debitNoteId = `DN-${uuidv4().substring(0, 8).toUpperCase()}`;
    const timestamp = new Date();

    // Calculate totals
    const subtotal = items.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );
    const vatAmount = subtotal * 0.15; // Assuming 15% VAT for demonstration
    const totalAmount = subtotal + vatAmount;

    // Create the debit note record
    const debitNote = {
      id: debitNoteId,
      merchantId,
      timestamp,
      supplierName,
      supplierVAT: supplierVAT || null,
      supplierTIN: supplierTIN || null,
      reason,
      subtotal,
      vatAmount,
      totalAmount,
      items: items.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity,
      })),
    };

    // In a real implementation, you would store this in the database
    // For example:
    // await db.insert(debitNotes).values(debitNote);

    return {
      success: true,
      debitNote,
      message: "Debit note created successfully",
    };
  } catch (error) {
    console.error("Error creating debit note:", error);
    throw error;
  }
}
