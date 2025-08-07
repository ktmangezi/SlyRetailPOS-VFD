# VAT and Payment Implementation Details

## Schema (shared/schema.ts)
```typescript
export interface PaymentInfo {
  type: string;
  amount: number;
  currency: string;
}

export interface LoyverseReceipt {
  // ... other fields
  payments: Array<{
    type: string;
    amount: number;
    currency: string;
  }>;
  line_items: Array<{
    item_name: string;
    quantity: number;
    price: number;
    total_money: number;
    tax_amount: number;
  }>;
}
```

## Routes (server/routes.ts)
```typescript
// Current VAT calculation logic
const processedItems = receipt.line_items.map(item => {
  if (hasVAT(item)) {
    // For items with VAT
    const priceInc = item.price;
    const totalInc = item.total_money;
    const itemVatAmount = item.tax_amount;
    const priceExVAT = item.price - (item.tax_amount / item.quantity);
    const totalExVAT = item.total_money - item.tax_amount;
    
    return {
      name: item.item_name,
      quantity: item.quantity,
      price: priceExVAT,
      priceInc: priceInc,
      total: totalExVAT,
      totalInc: totalInc,
      vatAmount: itemVatAmount
    };
  } else {
    // Item without VAT
    return {
      name: item.item_name,
      quantity: item.quantity,
      price: item.price,
      priceInc: item.price,
      total: item.total_money,
      totalInc: item.total_money,
      vatAmount: 0
    };
  }
});

// Payment processing
const payments = receipt.payments?.map(payment => ({
  type: payment.type,
  amount: payment.amount,
  currency: determineCurrency(payment.type)
})) || [];
```

## Key Points for Fixing:

1. Check if payments array exists before mapping:
```typescript
const payments = Array.isArray(receipt.payments) 
  ? receipt.payments.map(payment => ({
      type: payment.type,
      amount: payment.amount,
      currency: determineCurrency(payment.type)
    }))
  : [];
```

2. For VAT calculations:
```typescript
// Use tax_amount directly from Loyverse
const itemVatAmount = item.tax_amount || 0;
const totalInc = item.total_money;
const totalExVAT = totalInc - itemVatAmount;
const priceInc = item.price;
const priceExVAT = priceInc - (itemVatAmount / item.quantity);
```

You can access the full implementation in these files and modify them to fix the VAT calculations and payment mapping.
