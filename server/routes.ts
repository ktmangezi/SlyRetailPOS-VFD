// Add type declaration for express-session
declare module "express-session" {
  interface SessionData {
    loyverseToken?: string;
  }
}
import https from "https";
import type { Express } from "express";
import { createServer, type Server } from "http";
import axios from "axios";
import fs from "fs";

import {
  type LoyverseReceipt,
  type LoyverseStore,
  type LoyverseProductItem,
  type LoyverseCategories,
  type CustomerInfo,
  type LoyverseMerchant,
  webhookQueue,
} from "@shared/schema";
import {
  generateZimraKeyAndCSR,
  getDeviceConfig,
  submitZimraReceipts,
  closeDayOnZimra,
  getZimraCredentials,
  pingAllZimraDevices,
  generateFiscalDayReport,
  ZIMRA_API_URL,
} from "./zimra-functions";
import { createDebitNote } from "./debit-note-controller";
import {
  extractHsCode,
  extractstoreTINnumber,
  extractstoreVATnumber,
  extractstoreEmail,
  extractstoreProvince,
  extractcustomerTIN,
  extractcustomerVAT,
  extractcustomerBal,
  extractcustomerTaxMoney,
  checkDescriptionStructure,
  checkNoteStructure,
} from "@shared/utils";
import {
  createTenantDatabase,
  getTenantDB,
  getMerchantIDBYToken,
  getTokenByMerchantID,
} from "./tenant-db";
import {
  saveSalesData,
  getSalesFromDb,
  saveZIMRAData,
  resubmitSalesData,
} from "./SalesController";
import { and, eq, sql } from "drizzle-orm";
import {
  sales,
  fiscalizationCredentials,
  currencies,
  fiscalDays,
} from "@shared/schema";
import * as schema from "@shared/schema";
import { createFiscalHarmonyClient } from "./lib/fiscalHarmony";
// WhatsApp functionality removed as per client request
import { storage } from "./storage";

const LOYVERSE_API_URL = "https://api.loyverse.com/v1.0";
// const ZIMRA_API_URL = "https://fdmsapitest.zimra.co.zw";

async function determineCurrency(paymentType: string, token: string) {
  //LOOP WITHIN DATABASE TO GET ISO CODE AND RATE IF THE PAYMENT TYPE FROM LOYVERSE IS NOT IN THE DATABASE, THEN RETURN USD
  let currenciesName;
  let currenciesISOCODE;
  let currenciesRate;

  const merchantId = await getMerchantIDBYToken(token);
  if (!merchantId) {
    console.log("Failed to get merchant ID");
    return;
  }
  // Connect to tenant database
  const tenantDb = await getTenantDB(merchantId);
  if (!tenantDb) {
    console.log("Failed to connect to tenant database");
  }
  // Query the database to find the currency with the matching paymentType
  const queryResult = await tenantDb.db
    .select()
    .from(currencies)
    .where(eq(currencies.name, paymentType))
    .execute();

  // If the paymentType matches a currency name in the database, return the isocode and the corresponding rate to USD
  if (queryResult.length > 0) {
    // return queryResult[0].currencyName;
    currenciesName = queryResult[0].name;
    currenciesISOCODE = queryResult[0].iso_code;
    currenciesRate = queryResult[0].rate;
    return { currenciesISOCODE, currenciesRate }; //"USD";
  } else {
    //ON CONDITION THAT THE CURRENCY IS NOT FOUND IN THE DATABASE, RETURN USD and ZWG the old way
    if (
      paymentType === "ECOCASH USD" ||
      paymentType === "SWIPE USD" ||
      paymentType === "Cash" ||
      paymentType === "ACCOUNT SALE"
    ) {
      currenciesISOCODE = "USD";
      currenciesRate = 1;
      return { currenciesISOCODE, currenciesRate };
    } else {
      currenciesISOCODE = "ZWG";
      currenciesRate = 38;
      return { currenciesISOCODE, currenciesRate };
    }
  }
}

async function getCategoryByItemId(itemId: string, token: string) {
  try {
    const categoryIdResponse = await axios.get<LoyverseProductItem>(
      `${LOYVERSE_API_URL}/items/${itemId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const categoryId = categoryIdResponse.data.category_id;
    const categoryNameResponse = await axios.get<LoyverseCategories>(
      `${LOYVERSE_API_URL}/categories/${categoryId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    return categoryNameResponse.data.name;
  } catch (error: any) {
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // app.use(
  //   session({
  //     secret: process.env.SESSION_SECRET || "your-secret-key",
  //     resave: false,
  //     saveUninitialized: true,
  //   }),
  // );

  app.get("/api/test-token", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      console.error("API token missing in request");
      return res.status(401).json({ message: "API token required" });
    }
    res.json({ message: "Token received", token_length: token.length });
  });

  // Endpoint to create a debit note
  app.post("/api/debit-notes", async (req, res) => {
    try {
      const { authorization } = req.headers;
      if (!authorization) {
        return res
          .status(401)
          .json({ message: "Authorization token required" });
      }

      const token = authorization.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Invalid authorization token" });
      }

      const { supplierName, supplierVAT, supplierTIN, reason, items } =
        req.body;

      // Validate request body
      if (!supplierName) {
        return res.status(400).json({ message: "Supplier name is required" });
      }

      if (!reason) {
        return res
          .status(400)
          .json({ message: "Reason for debit note is required" });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one item is required" });
      }

      // Create the debit note
      const result = await createDebitNote({
        token,
        supplierName,
        supplierVAT: supplierVAT || "",
        supplierTIN: supplierTIN || "",
        reason,
        items,
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error("Error creating debit note:", error);
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to create debit note",
      });
    }
  });

  app.post("/api/validate-token", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        console.error("Token missing in request body");
        return res.status(400).json({ message: "API token required" });
      }

      // Save token to session
      req.session.loyverseToken = token;
      //console.log("Token saved to session:", token.substring(0, 8) + "...");

      const response = await axios.get<{ stores: LoyverseStore[] }>(
        `${LOYVERSE_API_URL}/stores`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      // console.log("mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm");
      // console.log("response", response.data.stores);
      if (response.status === 200 && response.data.stores.length > 0) {
        let databaseStatus = "";
        let message = "Initial API token validated";
        let storeResponses;
        let allStoreDescriptions = true;

        for (const store of response.data.stores) {
          if (store.description === null) {
            allStoreDescriptions = false;
          } else {
            const descriptionStructure = checkDescriptionStructure(
              store.description,
            );
            if (descriptionStructure === "ValidStructure") {
            } else {
              allStoreDescriptions = false;
              message = "Invalid description structure";
              storeResponses = [];
            }
          }
        }

        if (allStoreDescriptions === true) {
          message = "Final API token validated";

          const merchantResponse = await axios.get<LoyverseMerchant>(
            `${LOYVERSE_API_URL}/merchant`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (merchantResponse.status === 200) {
            const merchantId = merchantResponse.data.id;
            //console.log("Merchant ID:", merchantId);

            // Extract merchant information
            const merchantData = {
              business_name: merchantResponse.data.business_name || "",
              // TIN and VAT are not directly available in the Loyverse API response
              // These will be extracted from store descriptions if available
              tin: "",
              vat: "",
            };

            // If there's at least one store with TIN/VAT information, use it for the merchant
            for (const store of response.data.stores) {
              if (store.description) {
                const storeTin = extractstoreTINnumber(store.description);
                const storeVat = extractstoreVATnumber(store.description);

                if (storeTin && !merchantData.tin) {
                  merchantData.tin = storeTin;
                }

                if (storeVat && !merchantData.vat) {
                  merchantData.vat = storeVat;
                }

                // Break if we found both
                if (merchantData.tin && merchantData.vat) {
                  break;
                }
              }
            }

            const dbExists = await getTenantDB(merchantId);
            if (!dbExists) {
              // console.log("Creating new database for merchant:", merchantId);
              const created = await createTenantDatabase(
                merchantId,
                token,
                merchantData,
              );
              if (!created) {
                console.error("Failed to create tenant database");
                return res.status(500).json({
                  message: "Failed to initialize tenant database",
                });
              }
              databaseStatus = "created";
            } else {
              databaseStatus = "existing";
            }

            storeResponses = response.data.stores;
            message = "Connected to Loyverse successfully";
          }
        }

        res.json({
          message,
          stores: storeResponses,
          database: databaseStatus,
        });
      }
    } catch (error: any) {
      console.error(
        "Token validation error:",
        error.response?.data || error.message,
      );

      if (error.response?.status === 401) {
        return res.status(401).json({
          message: "Invalid or expired API token",
          details:
            error.response?.data?.message ||
            "Please check your token and try again",
        });
      }

      res.status(error.response?.status || 500).json({
        message: "Failed to validate token",
        details: error.response?.data?.message || error.message,
      });
    }
  });

  async function slyRetailInvoices(
    token: string,
    getReceiptsFromResponse: LoyverseReceipt[],
  ): Promise<
    Array<{
      receipt: string;
      receiptType: string;
      refundFor: string | null;
      cancelledAt: string | null;
      notes: string | null;
      total: number;
      totalInc: number;
      vatAmount: number;
      timestamp: Date;
      items: Array<{
        hsCode: string | null;
        name: string;
        quantity: number;
        priceInc: number;
        vatAmount: number;
        taxDetails: Array<{
          taxName: string;
          taxAmount: number;
        }>;
        totalInc: number;
      }>;
      storeId: string;
      storeName: string;
      storeTINnumber: string;
      storeVATnumber: string;
      storeAddress: string;
      storeCity: string;
      storeProvince: string;
      storeEmail: string;
      storeContactNumber: string;
      customerName: string;
      customerAddress: string;
      customerCity: string;
      customerEmail: string;
      customerContact: string;
      customerTIN: string;
      customerVAT: string;
      footerText: string;
      payments: Array<{ amount: number; currency: string; type: string }>;
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
    }>
  > {
    const storeResponse = await axios.get<{ stores: LoyverseStore[] }>(
      `${LOYVERSE_API_URL}/stores`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    let receiptStructureError = "NoError";
    const processedSales: Array<any> = [];
    for (const store of storeResponse.data.stores) {
      const storeReceipts = getReceiptsFromResponse.filter(
        (receipt) => receipt.store_id === store.id,
      );

      const storeName = store.name;
      const storeAddress = store.address;
      const storeCity = store.city;
      let storeProvince = store.state;
      const storeContactNumber = store.phone_number;
      let storeDescription = store.description;

      let storeTINnumber = "";
      let storeVATnumber = "";
      let storeEmail = "";
      if (storeDescription) {
        storeTINnumber = extractstoreTINnumber(storeDescription);
        storeVATnumber = extractstoreVATnumber(storeDescription);
        storeEmail = extractstoreEmail(storeDescription);
        storeProvince = extractstoreProvince(storeDescription);
      }
      const storeSales = await Promise.all(
        storeReceipts.map(async (receipt) => {
          let customerName = "Cash Sale";
          let customerContact = "";
          let customerAddress = "";
          let customerCity = "";
          let customerEmail = "";
          let customerTIN = "";
          let customerVAT = "";
          let receiptTotal = 0;
          let mmm = 0;
          let receiptVatAmount = 0;
          let currentRate = 0;
          let zimraReceiptType = "";
          let receiptNote = null;
          let zimraSubmitted = "";
          let zimraSubmissionDate = "";
          let zimraError = "";
          let zimraReceiptId = "";
          let zimraDeviceId = "";
          let zimraQrData = "";
          let zimraQrUrl = "";
          let zimraOperationId = "";
          let zimraFiscalDayId = "";
          let zimraFiscalDayNo = "";
          let zimraGlobalNo = "";
          let submissionRoute = "";
          const customerId = receipt.customer_id;

          if (customerId) {
            try {
              const customerResponse = await axios.get<CustomerInfo>(
                `${LOYVERSE_API_URL}/customers/${customerId}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                },
              );

              const customerNOTE = customerResponse.data.note;

              customerName = customerResponse.data.name || "Cash Sale";
              customerContact = customerResponse.data.phone_number || "";
              customerAddress = customerResponse.data.address || "";
              customerCity = customerResponse.data.city || "";
              customerEmail = customerResponse.data.email || "";

              if (customerNOTE) {
                //check the structure if it is correct
                const customerStructure = checkNoteStructure(customerNOTE);
                if (customerStructure === "ValidStructure") {
                  customerTIN = extractcustomerTIN(customerNOTE) || "";
                  customerVAT = extractcustomerVAT(customerNOTE) || "";
                } else {
                  console.log("INVALID CUSTOMER NOTE STRUCTURE");
                  const merchantId = await getMerchantIDBYToken(token);
                  if (!merchantId) {
                    throw new Error("Failed to get merchant ID");
                  }
                  const tenantDB = await getTenantDB(merchantId);
                  if (!tenantDB) {
                    throw new Error("Failed to connect to tenant database");
                  }
                  await tenantDB.db
                    .delete(webhookQueue)
                    .where(
                      sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${receipt.receipt_number}`,
                    )
                    .execute();
                  //create a log that will show the user failed receipts
                  receiptStructureError = "Error";
                }
              } else {
                customerName = "Cash Sale";
              }
            } catch (error) {
              console.error("Error fetching customer details:", error);
              customerName = "Cash Sale";
            }
          }
          let paymentType = "";
          let isoCode = "";

          const payments = await Promise.all(
            (receipt.payments || []).map(async (payment) => {
              //GET THE CURRENCY TYPE FROM LOYVERSE AND CONVERT IT TO THE CURRENCY TYPE THAT ZIMRA ACCEPTS
              let paymentType = payment.type; // BY DEFAULT ITS EITHER CASH OR OTHER;
              if (paymentType === "CASH") {
                paymentType = "Cash";
              }
              if (paymentType === "OTHER") {
                paymentType = "Other";
              }
              if (paymentType === "NONINTEGRATEDCARD") {
                paymentType = "Card";
              }
              if (paymentType === "Check") {
                paymentType = "BankTransfer";
              }
              if (payment.name === "ACCOUNT SALE") {
                paymentType = "Credit";
              }
              if (
                payment.name === "ECOCASH USD" ||
                payment.name === "ECOCASH ZIG"
              ) {
                paymentType = "MobileWallet";
              }
              //GET THE CURRENCY ISO CODE AND RATE FROM THE DATABASE
              let moneyAmount = 0;
              let currencyDataResponse = await determineCurrency(
                payment.name,
                token,
              );
              if (currencyDataResponse && receipt.receipt_type === "SALE") {
                isoCode = currencyDataResponse.currenciesISOCODE;
                currentRate = Number(currencyDataResponse.currenciesRate);
                moneyAmount = payment.money_amount * currentRate;
              } else if (
                currencyDataResponse &&
                receipt.receipt_type === "REFUND"
              ) {
                isoCode = currencyDataResponse.currenciesISOCODE;
                currentRate = Number(currencyDataResponse.currenciesRate);
                moneyAmount = payment.money_amount * currentRate * -1;
              }
              return {
                amount: Number(moneyAmount),
                currency: isoCode,
                type: paymentType,
              };
            }),
          );
          // Get the original timestamp and add 2 hours
          let originalDate = new Date(receipt.receipt_date);
          originalDate.setHours(originalDate.getHours() + 2);
          let currentDate = new Date();
          currentDate.setHours(currentDate.getHours() + 2);

          const day = originalDate.getDate();
          const month = originalDate.getMonth() + 1; // Months are 0-based, so add 1
          const year = originalDate.getFullYear();
          let originalDate2 = month + "/" + day + "/" + year;
          //CHECK FOR THE RECEIPT TYPE SO THAT IT WILL BE TREATED CORRECTLY IN DATABASE, IN FISCALISATION AND IN SALES COMPUTATION
          if (
            receipt.receipt_type === "SALE" &&
            receipt.cancelled_at === null
          ) {
            zimraReceiptType = "FiscalInvoice";
            receiptNote = "OG Date " + originalDate2;
          } else {
            zimraReceiptType = "CreditNote";
            currentRate = currentRate * -1;
            receiptNote = "Error in Sale";
          }
          const processedItems = await Promise.all(
            receipt.line_items.map(async (item) => {
              //IF THE RECEIPT TYPE IS REFUND, THEN THE PRICE AND TOTAL SHOULD BE NEGATIVE
              // we would like to handle existense of the item price, if not there, stop the whole process
              // console.log(item);

              if (
                item.price === undefined ||
                item.price === null ||
                item.price === 0
              ) {
                // console.log(item.price);
                // ''then delete them from the webhook queue table so that the others can be sorted
                const merchantId = await getMerchantIDBYToken(token);
                if (!merchantId) {
                  throw new Error("Failed to get merchant ID");
                }
                const tenantDB = await getTenantDB(merchantId);
                if (!tenantDB) {
                  throw new Error("Failed to connect to tenant database");
                }
                console.log("MISSING PRICE FOR", receipt.receipt_number);
                await tenantDB.db
                  .delete(webhookQueue)
                  .where(
                    sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${receipt.receipt_number}`,
                  )
                  .execute();
                //create a log that will show the user failed receipts
                receiptStructureError = "Error";
              }
              let priceInc; //= Number(item.price * currentRate);
              // let totalInc = Number(item.total_money * currentRate);
              // if (
              //   item.line_modifiers.length > 0 ||
              //   item.line_discounts.length > 0
              // ) {
              //   console.log("in here now", totalInc);
              //   //on condition that there are modifieres, the price per unit will have to be modified
              //   priceInc = Number((totalInc / item.quantity).toFixed(2)); // IT HAS TO BE ROUNDED LEAST WE GET RCPT024
              // } else {
              //   priceInc = Number((item.price * currentRate).toFixed(2));
              // }
              // console.log(item);
              // let totalInc = Math // Number(item.total_money * currentRate);
              let totalInc = Number(item.total_money * currentRate);
              if (
                item.line_modifiers.length > 0 ||
                item.line_discounts.length > 0
              ) {
                //on condition that there are modifieres, the price per unit will have to be modified
                priceInc = Number(totalInc / item.quantity); // IT HAS TO BE ROUNDED LEAST WE GET RCPT024
              } else {
                priceInc = Number(item.price * currentRate);
              }
              // //console.log(item.line_taxes);
              //SINCE THERE IS GOING TO BE MULTIPLE TAX TYPES, WE WILL NEED TO LOOP THROUGH THEM AND GET THE TOTAL TAX AMOUNT AS WELL AS THE TAX NAME
              // let itemVatAmount = 0;
              let itemVatAmount = 0;
              let taxName = "";
              let lineTaxes = [];
              //IF THERE ARE MORE THAN1 TAX TYPES, WE WILL NEED TO USE THE VAT ONLY
              if (item.line_taxes.length > 1) {
                for (const tax of item.line_taxes || []) {
                  if (tax.name === "VAT") {
                    lineTaxes = [tax];
                  }
                }
              } else {
                lineTaxes = item.line_taxes;
              }

              for (const tax of lineTaxes || []) {
                //FOR NOW EACH LINE ITEM WILL HAVE ONLY ONE TAX TYPE {when other taxes come, we will upgrade here eg food tax, etc}}

                if (tax.name === "VAT") {
                  taxName = tax.name;
                  if (
                    paymentType === "ECOCASH USD" ||
                    paymentType === "SWIPE USD" ||
                    paymentType === "Cash"
                  ) {
                    itemVatAmount =
                      itemVatAmount + tax.money_amount * currentRate;
                  } else {
                    itemVatAmount =
                      itemVatAmount +
                      (item.total_money - item.total_money / 1.15) *
                        currentRate; //THE RATE SHOULD COME FROM THE DATABASE
                  }
                }
                if (tax.name === "ZERO RATED") {
                  taxName = tax.name;
                  itemVatAmount =
                    itemVatAmount + tax.money_amount * currentRate;
                }
                if (tax.name === "EXEMPT") {
                  taxName = tax.name;
                  itemVatAmount =
                    itemVatAmount + tax.money_amount * currentRate;
                }
                if (tax.name === "WITHOLD VAT") {
                  taxName = tax.name;
                  itemVatAmount =
                    itemVatAmount + tax.money_amount * currentRate;
                }
              }

              receiptVatAmount += itemVatAmount;
              receiptTotal += totalInc;

              const categoryName =
                (await getCategoryByItemId(item.item_id, token)) || "";
              const hsCode = extractHsCode(categoryName);
              // //console.log(hsCode);
              // we would like to handle existense of hscode in the category name, if not there, stop the whole process
              if (
                hsCode === "00000000" ||
                hsCode.length < 8 ||
                hsCode === "10000000" ||
                hsCode.length > 8
              ) {
                console.log("HSCODE NOT FOUND for", receipt.receipt_number);
                const merchantId = await getMerchantIDBYToken(token);
                if (!merchantId) {
                  throw new Error("Failed to get merchant ID");
                }
                const tenantDB = await getTenantDB(merchantId);
                if (!tenantDB) {
                  throw new Error("Failed to connect to tenant database");
                }
                await tenantDB.db
                  .delete(webhookQueue)
                  .where(
                    sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${receipt.receipt_number}`,
                  )
                  .execute();
                //create a log that will show the user failed receipts
                receiptStructureError = "Error";
              }

              // console.log("total line =", parseFloat(mmm.toFixed(2)));
              // console.log("receiptTotal:", parseFloat(receiptTotal.toFixed(2)));
              return {
                hsCode,
                name: item.item_name,
                quantity: item.quantity,
                priceInc,
                vatAmount: itemVatAmount,
                taxDetails: [
                  {
                    taxName: taxName,
                    taxAmount: itemVatAmount,
                  },
                ],
                totalInc,
              };
            }),
          );

          receiptVatAmount = Math.round(receiptVatAmount * 100) / 100;
          receiptTotal = Math.round(receiptTotal * 100) / 100;

          //AT TIMES USERS WILL MAKE A PARTIAL REFUND, ZIMRA DOES NOT WORK WELL WITH THESE
          processedSales.push({
            receipt: receipt.receipt_number,
            receiptType: zimraReceiptType,
            refundFor: receipt.refund_for || null,
            cancelledAt: receipt.cancelled_at || null,
            notes: receiptNote, //THIS ON CONDITION THAT IT IS A FISCALTAX INVOICE WILL NOW PRESENT THE ORIGINAL DATE OF THE INVOICE
            total: receiptTotal - receiptVatAmount,
            totalInc: receiptTotal,
            vatAmount: receiptVatAmount,
            timestamp: currentDate, //let the date part show only the processed date so that the sytem will fiscalise correctly.
            items: processedItems,
            storeId: receipt.store_id,
            storeName,
            storeTINnumber,
            storeVATnumber,
            storeAddress,
            storeCity,
            storeProvince,
            storeEmail,
            storeContactNumber,
            customerName,
            customerAddress,
            customerCity,
            customerEmail,
            customerContact,
            customerTIN,
            customerVAT,
            footerText: "",
            payments,
            zimraSubmitted,
            zimraSubmissionDate,
            zimraError,
            zimraReceiptId,
            zimraDeviceId,
            zimraQrData,
            zimraQrUrl,
            zimraOperationId,
            zimraFiscalDayId,
            zimraFiscalDayNo,
            zimraGlobalNo,
            submissionRoute,
          });
        }),
      );
      await Promise.all(storeSales);
    }

    if (receiptStructureError === "Error") {
      //this means there where errors that discourages the system to fiscalise that invoice
      return [];
    } else {
      return processedSales;
    }
  }

  //======================================================================================

  app.get("/slyretail/sales", async (req, res) => {
    try {
      // Try to get token from session first
      const sessionData = req.session as { loyverseToken?: string };
      const sessionToken = sessionData.loyverseToken;

      // Fallback to Authorization header for backward compatibility
      const token = sessionToken || req.headers.authorization?.split(" ")[1];
      // Get store_id from query params, default to "All Stores" if not provided
      let store_id =
        typeof req.query.store_id === "string"
          ? req.query.store_id
          : "All Stores";
      // Get pagination parameters from query
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.page_size
        ? parseInt(req.query.page_size as string, 10)
        : 50;

      if (!token) {
        console.log(
          "ERROR: Missing API token in request (checked session and Authorization header)",
        );
        return res
          .status(401)
          .json({ message: "API token required. Please log in again." });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res
          .status(401)
          .json({ message: "Invalid token Or No Database connection" });
      }

      // Get additional filter parameters with default values
      const search = (req.query.search as string) || "All";
      const posNumber = (req.query.pos_number as string) || "All";
      const currency = (req.query.currency as string) || "All";
      const lastProcessedSaleId = req.query.since_id as string;

      // Default date range - if not provided, start from beginning of current month
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const dateFrom =
        (req.query.date_from as string) ||
        startOfMonth.toISOString().split("T")[0];
      const dateTo =
        (req.query.date_to as string) || today.toISOString().split("T")[0];

      // Get sales with pagination and filtering
      const result = await getSalesFromDb(
        merchantId,
        store_id,
        page,
        pageSize,
        search,
        currency,
        dateFrom,
        dateTo,
        lastProcessedSaleId,
        posNumber,
      );
      if (result && result.allSales) {
        const count = result.allSales.length;
        const totalRecords = result.totalRecords || count;
        // Calculate total pages properly
        const totalPages = Math.ceil(totalRecords / pageSize);
        const currentResults = result.allSales;
        // Find the highest sale ID for tracking latest records
        const highestId =
          currentResults.length > 0
            ? Math.max(...currentResults.map((sale) => sale.id))
            : 0;

        // Return formatted response with complete pagination info and metadata
        res.json({
          sales: currentResults,
          pagination: {
            totalRecords: totalRecords,
            totalPages: totalPages,
            currentPage: page,
            pageSize: pageSize,
          },
          meta: {
            highestId: highestId, // Use the calculated highest ID for tracking latest records
            lastUpdated: new Date().toISOString(),
          },
          taxSummary: {
            periodTaxByCurrency: result.periodTaxByCurrency || 0.0,
            periodTotalZeroRatedByCurrency: result.totalZeroRated || 0.0,
            periodtotalSalesIncVatByCurrency: result.totalSalesIncVat || 0.0,
          },
        });
      } else {
        // Return empty results with pagination info
        res.json({
          sales: [],
          pagination: {
            totalRecords: 0,
            totalPages: 0,
            currentPage: page,
            pageSize: pageSize,
          },
          meta: {
            highestId: 0,
            lastUpdated: new Date().toISOString(),
          },
          taxSummary: {
            periodTaxByCurrency: {},
          },
        });
      }
    } catch (error: any) {
      console.error("CRITICAL ERROR: Failed to fetch sales:", error);
      res.status(500).json({
        message: "Failed to fetch sales data",
        details: error.message,
      });
    }
  });

  // Sales endpoints
  //=============================================================================================================================

  interface WebHook {
    merchant_id: string; // Unique identifier for the merchant
    receipts: any[]; // Array of receipt objects
    _timestamp?: number; // Optional timestamp (added by queue system)
  }

  interface TenantQueue {
    queue: WebHook[];
    isProcessing: boolean;
    processingLock: Promise<void>;
  }

  const webhookQueueSystem = {
    // Stores all tenant queues
    tenantQueues: new Map<string, TenantQueue>(),

    // Configuration
    MAX_IN_MEMORY_PER_TENANT: 250, // Max queue size per tenant
    MAX_PARALLEL_TENANTS: 10, // Max concurrent tenant processing
    activeTenantCount: 0, // Currently processing tenants

    /**
     * Get or create a queue for a specific tenant
     * @param tenantId - The merchant/tenant ID
     */
    getTenantQueue(tenantId: string): TenantQueue {
      if (!this.tenantQueues.has(tenantId)) {
        this.tenantQueues.set(tenantId, {
          queue: [],
          isProcessing: false,
          processingLock: Promise.resolve(),
        });
      }
      return this.tenantQueues.get(tenantId)!;
    },

    /**
     * Add a webhook to the appropriate tenant queue
     * @param webhook - The incoming webhook
     */
    async add(webhook: WebHook) {
      const tenantId = webhook.merchant_id;
      const tenantQueue = this.getTenantQueue(tenantId);

      // Add timestamp if not already set
      const timestampedWebhook: WebHook = {
        ...webhook,
        _timestamp: webhook._timestamp || Date.now(),
      };

      // Check if receipt exists in queue (thread-safe check)
      const receiptNumber = webhook.receipts[0].receipt_number;
      const receiptExists = tenantQueue.queue.some(
        (item) => item.receipts[0].receipt_number === receiptNumber,
      );
      //FIST CHECK IF THE RECEIPT EXIST IN THE DATABASE IN SALES TABLE
      const tenantDb = await getTenantDB(tenantId);
      if (!tenantDb) {
        return;
      }
      const existingReceipt = await tenantDb.db
        .select()
        .from(sales)
        .where(eq(sales.receipt, receiptNumber))
        .execute();
      //IF THE RECEIPT EXISTS IN THE DATABASE, THEN STOP THE PROCESS
      if (existingReceipt.length > 0) {
        // console.log("RECEIPT ALREADY EXISTS IN THE DATABASE");
        return;
      }
      //IF THE RECEIPT DOES NOT EXIST IN THE DATABASE, THEN CHECK IF IT EXISTS IN THE WEBHOOK QUEUE
      if (receiptExists) {
        console.log(
          `[${tenantId}] Receipt ${receiptNumber} already in queue, skipping.`,
        );
        return;
      }

      // Check queue capacity
      if (tenantQueue.queue.length >= this.MAX_IN_MEMORY_PER_TENANT) {
        console.warn(
          `[${tenantId}] Queue full (${tenantQueue.queue.length}/${this.MAX_IN_MEMORY_PER_TENANT}),`,
        );
        return;
      }

      // First save to DB (as source of truth)
      try {
        await this.saveToDb(tenantId, timestampedWebhook);

        // Only add to in-memory queue after successful DB save
        tenantQueue.queue.push(timestampedWebhook);
        tenantQueue.queue.sort((a, b) => a._timestamp! - b._timestamp!);

        this.triggerProcessing(tenantId);
      } catch (error) {
        console.error(`[${tenantId}] Failed to save webhook to DB:`, error);
        // throw error; // Or handle it differently
      }
    },

    async saveToDb(tenantId: string, timestampedWebhook: WebHook) {
      const tenantDb = await getTenantDB(tenantId);
      if (!tenantDb) {
        return;
      }
      //USE THE RECEIPT NO// TO CHECK IF THE RECEIPT EXISTS IN THE DATABASE
      const existingReceipt = await tenantDb.db
        .select()
        .from(webhookQueue)
        .where(
          sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${timestampedWebhook.receipts[0].receipt_number}`,
        )
        .execute();

      if (existingReceipt.length > 0) {
      } else {
        // console.log("BACKING UP TO THE DATABASE TOO");
        await tenantDb.db
          .insert(webhookQueue)
          .values({
            payload: timestampedWebhook,
            merchantId: tenantId,
            status: "pending",
            attempts: "0", // Note the string "0" instead of number 0
            createdAt: new Date(),
          })
          .execute()
          .catch((err) => {
            console.error(
              `[${tenantId}] Failed to save webhook to database:`,
              err,
            );
          });
      }
    },
    /**
     * Trigger processing for a tenant queue
     * @param tenantId - The tenant/merchant ID
     */
    async triggerProcessing(tenantId: string) {
      const tenantQueue = this.getTenantQueue(tenantId);

      tenantQueue.processingLock = tenantQueue.processingLock
        .then(async () => {
          // Check if we can process (queue not empty + not already processing + under parallel limit)
          if (
            !tenantQueue.isProcessing &&
            tenantQueue.queue.length > 0 &&
            this.activeTenantCount < this.MAX_PARALLEL_TENANTS
          ) {
            await this.processTenant(tenantId);
          }
        })
        .catch((err) => console.error(`[${tenantId}] Processing error:`, err));
    },

    /**
     * Process webhooks for a specific tenant
     * @param tenantId - The tenant/merchant ID
     */
    async processTenant(tenantId: string) {
      const tenantQueue = this.getTenantQueue(tenantId);

      if (tenantQueue.isProcessing) {
        console.log(
          `[${tenantId}] Processing is already in progress, skipping.`,
        );
        return;
      }

      tenantQueue.isProcessing = true;
      this.activeTenantCount++;

      try {
        // while (tenantQueue.queue.length > 0) {
        //loop within the queue and process each webhook
        for (const webHook of tenantQueue.queue) {
          await this.processWebhook(webHook);
          //remove the processed item from the queue
          tenantQueue.queue.shift();

          if (tenantQueue.queue.length === 0) {
            tenantQueue.isProcessing = false;
            continue; //if there is no item in the queue, continue to stop the loop
          }
        }
        //loop only on condition that the queue is not empty else stop
        //const webHook =
        //}
        //WHY NOT HERE
      } catch (error) {
        console.error(`[${tenantId}] Processing failed:`, error);
      } finally {
        tenantQueue.isProcessing = false;
        this.activeTenantCount--;
        // console.log(`[${tenantId}] Processing completed.`);
        //check if there are any in the database webhook queue add them to the queue to be processed
        const tenantDb = await getTenantDB(tenantId);
        if (!tenantDb) {
          console.error(`[${tenantId}] Failed to get tenant database`);
          return;
        }
        const pendingWebhooks = await tenantDb.db
          .select()
          .from(webhookQueue)
          .where(
            and(
              eq(webhookQueue.merchantId, tenantId),
              eq(webhookQueue.status, "pending"),
            ),
          )
          .execute();
        if (tenantQueue.queue.length < pendingWebhooks.length) {
          if (pendingWebhooks.length > 0) {
            for (const webhook of pendingWebhooks) {
              // Check if receipt already exists in queue
              let receiptNumber = (webhook.payload as any).receipts[0]
                .receipt_number;

              const receiptExists = tenantQueue.queue.some(
                (item) => item.receipts[0].receipt_number === receiptNumber,
              );

              if (!receiptExists) {
                await this.add(webhook.payload as WebHook);
              } else {
                console.log(
                  `[${tenantId}] Receipt ${receiptNumber} already in queue, skipping DB entry`,
                );
                return;
              }
            }
          }
        }

        if (tenantQueue.queue.length > 0) {
          setImmediate(() => this.triggerProcessing(tenantId));
        }
      }
    },

    /**
     * Process an individual webhook's receipts
     * @param webhook - The webhook to process
     */
    async processWebhook(webhook: WebHook) {
      const merchantId = webhook.merchant_id;

      try {
        const token = await getTokenByMerchantID(merchantId);
        if (!token) {
          throw new Error(`No token for merchant ${merchantId}`);
        }

        // Process each receipt individually
        for (const receipt of webhook.receipts) {
          //just incase the webhook carries more than 1 receipt, we will loop through them
          //check again if the receipt number is not in the database in sales table
          const tenantDb = await getTenantDB(merchantId);
          if (!tenantDb) {
            return;
          }
          const existingReceipt = await tenantDb.db
            .select()
            .from(sales)
            .where(eq(sales.receipt, receipt.receipt_number))
            .execute();
          if (existingReceipt.length > 0) {
            // console.log("RECEIPT ALREADY EXISTS IN THE DATABASE");
            //delete the receipt from the webhook queue
            if (webhook.receipts.length === 1) {
              // console.log("DELETING IT FROM THE DATABASE");
              //? if the webhook carries more than1 receipt? i suppose we must not delete it here
              await tenantDb.db
                .delete(webhookQueue)
                .where(
                  sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${receipt.receipt_number}`,
                )
                .execute();
            }
          } else {
            try {
              const salesData = await slyRetailInvoices(token, [receipt]);
              if (salesData.length > 0) {
                console.log(
                  `[${merchantId}] Processing Receipt No.`,
                  receipt.receipt_number,
                );
                //MAKE THIS A VARIABLE SO THAT WE KNOW IF THE DATA HAS BEEN SAVED TO THE DATABASE OR NOT
                let resubmitReceipt = false;
                let savedReponse = await saveSalesData(
                  salesData,
                  merchantId,
                  resubmitReceipt,
                  token,
                );
                //AFTER WE KNOW, THIS IS THE RIGHT PLACE TO DELETE THE RECEIPT FROM THE WEBHOOK DATABASE QUEUE
                //lets investigate if there is a failed receipt, and if zimra is back for resubmission
                if (savedReponse && savedReponse.failedReceipts?.length > 0) {
                  resubmitReceipt = true;
                  console.log(
                    "We Have ",
                    savedReponse.failedReceipts?.length,
                    " Failed Receipts in routes",
                  );
                  //OPTION ONE, WE MAY TRY TO PUSH THE FAILED ONES IN THE QUEUE AGAIN

                  //OPTION TWO, WE MAY TRY TO RESUBMIT THEM AGAIN

                  //loop within the failed receipts
                  // for (const failedReceipt of savedReponse.failedReceipts) {
                  //   //first check if it is there in the failed receipts table
                  //   const existingFailedReceipt = await tenantDb.db
                  //     .select()
                  //     .from(sales)
                  //     .where(eq(sales.receipt, failedReceipt.receipt))
                  //     .execute();
                  //   if (existingFailedReceipt.length > 0) {
                  //     if (existingFailedReceipt[0].zimraReceiptId !== "") {
                  //       console.log(
                  //         "Receipt already submitted to ZIMRA Cannot Resubmit",
                  //       );
                  //     } else {
                  //       //if somehow it has been resubmitted, we do noy have to retry it
                  //       await saveSalesData(
                  //         [failedReceipt],
                  //         merchantId,
                  //         resubmitReceipt,
                  //         token,
                  //       );
                  //     }
                  //   }
                  // }
                  for (const failedReceipt of savedReponse.failedReceipts) {
                    console.log(failedReceipt.receipt);
                    //first check if it is there in the failed receipts table
                    const existingFailedReceiptInSales = await tenantDb.db
                      .select()
                      .from(sales)
                      .where(
                        sql`${sales.receipt} = ${failedReceipt.receipt} AND ${sales.zimraSubmitted} = TRUE`,
                      )
                      .execute();
                    console.log("routesssssssssssssssssssssssssssssssssssss");
                    console.log(existingFailedReceiptInSales.length);
                    if (existingFailedReceiptInSales.length > 0) {
                      console.log(
                        "Receipt already submitted to ZIMRA Cannot Resubmit",
                        existingFailedReceiptInSales[0].receipt,
                      );
                      return;
                    } else {
                      console.log("Receipt now resubmitted to ZIMRA");
                      //if somehow it has been resubmitted, we do noy have to retry it
                      await saveSalesData(
                        [failedReceipt],
                        merchantId,
                        resubmitReceipt,
                        token,
                      );
                    }
                  }
                  //try usining a do while loop
                }
              }
            } catch (receiptError) {
              console.error(`[${merchantId}] Receipt failed:`, receiptError);
              // Continue with next receipt
            }
          }
        }
      } catch (error) {
        console.error(`[${merchantId}] Webhook failed:`, error);
        //        throw error;
      }
    },
  };

  // Webhook endpoint
  app.post("/api/webhook/loyverse", async (req, res) => {
    try {
      const webhook = req.body as WebHook;
      if (!webhook?.merchant_id || !webhook?.receipts?.length) {
        console.log("Invalid webhook: missing merchant_id or receipts");
        //then stop the process
        return;
      }
      //we can check if the receipt has been processed before righ here if the webhook containes 1 receipt
      if (webhook.receipts.length === 1) {
        const tenantDb = await getTenantDB(webhook.merchant_id);
        if (!tenantDb) {
          return;
        }
        const existingReceipt = await tenantDb.db
          .select()
          .from(sales)
          .where(eq(sales.receipt, webhook.receipts[0].receipt_number))
          .execute();
        if (existingReceipt.length > 0) {
          //delete the receipt from the webhook queue
          //AT TIMES THE WEBHOOK CARRIES TWO INVOICES
          if (webhook.receipts.length === 1) {
            await tenantDb.db
              .delete(webhookQueue)
              .where(
                sql`${webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${webhook.receipts[0].receipt_number}`,
              )
              .execute();
            return;
          }
        }
      }
      await webhookQueueSystem.add(webhook);

      res.json({
        success: true,
        message: "Webhook queued for processing",
      });
    } catch (error) {
      console.error("Webhook endpoint error:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });

  //=============================================================================================================================
  app.post("/slyretail/sales/reSubmitReceipt", async (req, res) => {
    try {
      const token = req.body.token;
      const zimraDeviceId = req.body.zimraDeviceId;
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid merchant" });
      }

      const result = await resubmitSalesData(merchantId, zimraDeviceId);
      // console.log(result);
      if (result && result.success) {
        res.json({
          success: true,
          message: result.message,
        });
      }
    } catch (error) {
      console.error("Error resubmiting receipt:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  });
  //==========================================================================================
  //THE FISCAL HARMONY INTERGRATION
  app.post("/api/fiscalization/credentials", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const { provider, appId, appSecret } = req.body;
      if (!provider || !appId || !appSecret) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const [result] = await tenantDb
        .insert(fiscalizationCredentials)
        .values({
          provider,
          merchantId,
          appId,
          appSecret,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.json({
        success: true,
        message: "Fiscalization credentials stored successfully",
        data: result,
      });
    } catch (error) {
      console.error("Failed to store fiscalization credentials:", error);
      res.status(500).json({
        message: "Failed to store fiscalization credentials",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/fiscalization/credentials/check", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      // Get all active provider credentials for this merchant
      const allCredentials = await tenantDb
        .select({
          provider: fiscalizationCredentials.provider,
        })
        .from(fiscalizationCredentials)
        .where(
          and(
            eq(fiscalizationCredentials.merchantId, merchantId),
            eq(fiscalizationCredentials.active, true),
          ),
        );

      // Extract unique provider names
      const connectedProviders = Array.from(
        new Set(allCredentials.map((cred) => cred.provider)),
      );

      res.json({
        success: true,
        message: "Provider connection status retrieved",
        providers: connectedProviders,
        hasAnyCredentials: connectedProviders.length > 0,
      });
    } catch (error) {
      console.error("Failed to check fiscalization credentials:", error);
      res.status(500).json({
        message: "Failed to check fiscalization credentials",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/fiscalization/credentials/:provider", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const { provider } = req.params;
      if (!provider) {
        return res
          .status(400)
          .json({ message: "Provider parameter is required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const credentials = await tenantDb
        .select()
        .from(fiscalizationCredentials)
        .where(
          and(
            eq(fiscalizationCredentials.merchantId, merchantId),
            eq(fiscalizationCredentials.provider, provider),
            eq(fiscalizationCredentials.active, true),
          ),
        );

      if (credentials.length === 0) {
        return res.json({
          success: false,
          hasCredentials: false,
          message: "No active credentials found for this provider",
        });
      }

      res.json({
        success: true,
        hasCredentials: true,
        message: "Credentials found",
        data: {
          id: credentials[0].id,
          provider: credentials[0].provider,
          // We don't return the actual secrets for security
          hasAppId: !!credentials[0].appId,
          hasAppSecret: !!credentials[0].appSecret,
        },
      });
    } catch (error) {
      console.error("Failed to retrieve fiscalization credentials:", error);
      res.status(500).json({
        message: "Failed to retrieve fiscalization credentials",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/fiscalization/submit/:saleId", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const { saleId } = req.params;
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const [sale] = await tenantDb
        .select()
        .from(sales)
        .where(eq(sales.id, parseInt(saleId)));

      if (!sale) {
        return res.status(404).json({ message: "Sale not found" });
      }

      const [credentials] = await tenantDb
        .select()
        .from(fiscalizationCredentials)
        .where(
          and(
            eq(fiscalizationCredentials.merchantId, merchantId),
            eq(fiscalizationCredentials.provider, "FiscalHarmony"),
            eq(fiscalizationCredentials.active, true),
          ),
        );

      if (!credentials) {
        return res
          .status(400)
          .json({ message: "Fiscal Harmony credentials not found" });
      }

      const client = createFiscalHarmonyClient({
        appId: credentials.appId,
        appSecret: credentials.appSecret,
      });

      const result = await client.submitInvoice(sale);

      // Update ZIMRA fields since Fiscal Harmony is a ZIMRA agency
      await tenantDb
        .update(sales)
        .set({
          zimraSubmitted: result.success,
          zimraSubmissionDate: new Date(),
          zimraError: result.error || null,
          zimraQrUrl: result.qrCode || null,
          zimraOperationId: result.fiscalNumber || null,
          submissionRoute: "FISCAL_HARMONY",
        })
        .where(eq(sales.id, parseInt(saleId)));

      res.json({
        success: result.success,
        message: result.success
          ? "Invoice submitted successfully to ZIMRA via Fiscal Harmony"
          : "Failed to submit invoice",
        error: result.error,
        qrCode: result.qrCode,
        fiscalNumber: result.fiscalNumber,
      });
    } catch (error) {
      console.error(
        "Failed to submit invoice to ZIMRA via Fiscal Harmony:",
        error,
      );
      res.status(500).json({
        message: "Failed to submit invoice",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // API endpoint to fetch merchant information
  app.get("/api/merchant/info", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];

      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      //console.log("Merchant ID found:", merchantId);

      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Get tenant database connection
      const tenantDb = await getTenantDB(merchantId);

      if (!tenantDb) {
        return res.status(404).json({ message: "Merchant database not found" });
      }

      // Import schemas for query
      const { merchantCredentials } = await import("@shared/schema");

      // Use Drizzle to query the merchant credentials
      try {
        const credentials = await tenantDb.db
          .select({
            merchantName: merchantCredentials.merchantName,
            tin: merchantCredentials.tin,
            vat: merchantCredentials.vat,
          })
          .from(merchantCredentials)
          .where(eq(merchantCredentials.merchantId, merchantId))
          .execute();

        if (!credentials || credentials.length === 0) {
          //console.log("No credentials found for merchant");
          return res
            .status(404)
            .json({ message: "Merchant credentials not found" });
        }

        const responseData = {
          success: true,
          data: {
            merchantName: credentials[0].merchantName || "",
            tin: credentials[0].tin || "",
            vat: credentials[0].vat || "",
          },
        };

        //console.log("Response data:", JSON.stringify(responseData));
        res.json(responseData);
      } catch (queryError) {
        console.error("Database query error:", queryError);
        return res.status(500).json({
          success: false,
          message: "Error querying merchant database",
          error:
            queryError instanceof Error
              ? queryError.message
              : "Unknown database error",
        });
      }
    } catch (error) {
      console.error("Error fetching merchant information:", error);
      res.status(500).json({
        success: false,
        message:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      //console.log("--------- MERCHANT INFO REQUEST COMPLETED ---------------");
    }
  });

  // Get currencies from database
  app.get("/api/currencies", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }
      const currencyList = await tenantDb.db
        .select({
          name: currencies.name,
          isoCode: currencies.iso_code,
          rate: currencies.rate,
        })
        .from(currencies)
        .execute();

      res.json({
        success: true,
        data: currencyList,
      });
    } catch (error) {
      console.error("Error fetching currencies:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch currencies",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add currency endpoint
  app.post("/api/currencies", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const { name, isoCode, rate } = req.body;

      if (!name || !isoCode || !rate) {
        return res
          .status(400)
          .json({ message: "Name, isoCode, and rate are required" });
      }

      await tenantDb.db.insert(currencies).values({
        name,
        iso_code: isoCode,
        rate: rate.toString(),
      });

      res.json({
        success: true,
        message: "Currency added successfully",
      });
    } catch (error) {
      console.error("Error adding currency:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add currency",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Update currency endpoint
  app.put("/api/currencies/:isoCode", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const { isoCode } = req.params;
      const { name, rate } = req.body;

      await tenantDb.db
        .update(currencies)
        .set({
          name,
          rate: rate.toString(),
        })
        .where(sql`${currencies.iso_code} = ${isoCode}`);

      res.json({
        success: true,
        message: "Currency updated successfully",
      });
    } catch (error) {
      console.error("Error updating currency:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update currency",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Delete currency endpoint
  app.delete("/api/currencies/:isoCode", async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "API token required" });
      }

      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(401).json({ message: "Invalid token" });
      }

      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      const { isoCode } = req.params;

      await tenantDb.db
        .delete(currencies)
        .where(sql`${currencies.iso_code} = ${isoCode}`);

      res.json({
        success: true,
        message: "Currency deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting currency:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete currency",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  //==========================================================================
  app.post("/api/zimraDevice", async (req, res) => {
    const {
      deviceId,
      activationKey,
      serialNumber,
      version,
      taxPayerTIN,
      vatNumber,
    } = req.body;
    // console.log("wwwwwwwwwww");
    // console.log(ZIMRA_API_URL);
    //get the type of deviceId
    const generatedCertificate = await generateZimraKeyAndCSR(
      serialNumber,
      deviceId,
    );
    const certificateRequest = generatedCertificate.csr;
    const privateKey = generatedCertificate.privateKey;
    const deviceModelName = "Server";
    const deviceModelVersion = version;
    let message = "";
    let configData = null;
    // console.log(certificateRequest);

    // Read the CA certificate file
    // const caCert = fs.readFileSync(
    //   "/home/runner/workspace/certificates/zimra-cert.pem",
    // );
    // console.log(caCert);
    try {
      // Create an HTTPS agent with the certificate and private key for mTLS
      // const httpsAgent = new https.Agent({
      //   ca: caCert,
      // });
      //console.log("Attempting ZIMRA deviceID ", { deviceId });
      //the order in which this is laid out must be of importancy
      const response = await axios.post(
        `${ZIMRA_API_URL}/Public/v1/${deviceId}/RegisterDevice`,
        {
          // Only include certificateRequest and activationKey in the body
          certificateRequest: certificateRequest,
          activationKey: activationKey,
        },

        {
          // Set DeviceModelName and DeviceModelVersion as headers
          headers: {
            "Content-Type": "application/json",
            DeviceModelName: deviceModelName,
            DeviceModelVersion: deviceModelVersion,
          },
          // httpsAgent: httpsAgent,
        },
      );

      // console.log("ZIMRA registration successful:", response.data);

      const myCertificate = response.data.certificate;
      // const myCertificate = `
      //   -----BEGIN CERTIFICATE-----
      //   MIIEMjCCAxqgAwIBAgIIMmLerS0zBM8wDQYJKoZIhvcNAQELBQAwVDELMAkGA1UE
      //   BhMCTFQxEDAOBgNVBAgMB1ZpbG5pdXMxEDAOBgNVBAcMB1ZpbG5pdXMxDjAMBgNV
      //   BAoMBVpJTVJBMREwDwYDVQQDDAhaSU1SQV9DQTAeFw0yNTA4MDYxMDA0MjRaFw0y
      //   NjA4MDYxMDA0MjRaMHUxCzAJBgNVBAYTAlpXMREwDwYDVQQIDAhaaW1iYWJ3ZTEj
      //   MCEGA1UECgwaWmltYmFid2UgUmV2ZW51ZSBBdXRob3JpdHkxLjAsBgNVBAMMJVpJ
      //   TVJBLTVENTVBNzc3MkVCOTAwMDQwRUFFLTAwMDAwMjY4MDYwggEiMA0GCSqGSIb3
      //   DQEBAQUAA4IBDwAwggEKAoIBAQDddaIwMiRA1bsOw8bcdjHEGi6j3USFekij0nAQ
      //   vAHX2f/23LwxeYuyCTKdDEQAyTmouxFjkrSG6URijL7OCnqt1eqCcZHvDoKu5dfx
      //   +ymFNkgyclf9u1/j6DPgChITup3/dm6rAcoE/3ftQl1GE2P0w21zu7GPbaIScxBC
      //   0wcIKOoiSSmeeBMx1TPPwKFQDeCYQ8oy2oHhVKk1YZSx1t4XbOjdI/8kzAeXYyKK
      //   pNt5mhQkna4EP+ePIgt2j7qmbHIqVkxGNSuM76RUzE5UskfdwcPUaxTeZfcwkTrI
      //   bQjiFqa45qLVYrmWFM2INwzhc5wrW4lIGUqB4Bzgbilkf9o9AgMBAAGjgeYwgeMw
      //   CQYDVR0TBAIwADAdBgNVHQ4EFgQUydV5GJesP6jRXwRpL3qPWTF2CN8wgZEGA1Ud
      //   IwSBiTCBhoAUU7/avL3rxixSYklqUei9iWSpTjahWKRWMFQxCzAJBgNVBAYTAkxU
      //   MRAwDgYDVQQIDAdWaWxuaXVzMRAwDgYDVQQHDAdWaWxuaXVzMQ4wDAYDVQQKDAVa
      //   SU1SQTERMA8GA1UEAwwIWklNUkFfQ0GCFHDBnrsbY/FDI3iqezfqBp0Wqo5gMA4G
      //   A1UdDwEB/wQEAwIF4DATBgNVHSUEDDAKBggrBgEFBQcDAjANBgkqhkiG9w0BAQsF
      //   AAOCAQEAV16oY9grvkbn2+RNNXUY0s/QNn0kQEBiRxsChcXVQtpPX6LpXW5RJVrn
      //   jaoYcBToPP4yrj8IClzYUGkdqnsLU2JtEKY29Og6ji5MGYT5uftVgy8cXFCkPWcu
      //   XoKJJBRXjvd2nNRyCGXE6yVxZruJpMRLobMkNL0TlUUemuelE5oEctUCf9zYALq5
      //   24NlaTgNxbUnCKlOIf/5jN91R1Do7sxSEEHZiZZadNkryyVWdgMwvPBEW7vJpYvW
      //   GzjSRQpeLTYrZW7dJJywLwR/2zPDGT93ihRZJyGpy61ODKRWdDCB2Npm/fDxrMyl
      //   vpQ9sAQ37NIZZmtEv2pKzi1UZsV76w==
      //   -----END CERTIFICATE-----`;

      //AFTER THIS, BEFORE SAVING THE CERTIFICATE DETAILS TO THE DATABASE, GET THE TIN DETAILS FROM THE USER AND COMPARE THEM WITH THE ZIMRA ONEs, THEN ONLY WE WILL BE ABLE TO SAVE UP THE REGISTRATION DETAILS

      const taxPayerDetailsResponse = await axios.post(
        `${ZIMRA_API_URL}/Public/v1/${deviceId}/VerifyTaxpayerInformation`,
        {
          activationKey: activationKey,
          deviceSerialNo: serialNumber,
        },
        {},
      );

      if (
        taxPayerDetailsResponse.data.taxPayerTIN === taxPayerTIN.trim() &&
        taxPayerDetailsResponse.data.vatNumber === vatNumber.trim()
      ) {
        //console.log("TIN/VAT matched with ZIMRA records" + deviceId);

        // Get the session data
        const sessionData = req.session as { loyverseToken?: string };

        // Get token from session instead of Authorization header
        const token = sessionData.loyverseToken;
        if (!token) {
          return res
            .status(401)
            .json({ message: "Session token not found. Please log in again." });
        }

        //console.log("Using token from session:", token);
        const merchantId = await getMerchantIDBYToken(token);
        if (!merchantId) {
          return res.status(404).json({ message: "Merchant not found" });
        }

        // Get or create the tenant database
        const tenantDb = await getTenantDB(merchantId);
        if (!tenantDb) {
          return res
            .status(500)
            .json({ message: "Failed to access tenant database" });
        }

        try {
          // First check if ZIMRA credentials already exist with this deviceId

          // Call the function to get device configuration
          const configResponse = await getDeviceConfig(
            deviceId,
            myCertificate,
            privateKey,
          );
          // //console.log(configResponse);
          configData = configResponse.data;
          const zimraCredentialsData = configData;
          if (configResponse.status === 200) {
            //THEN WHEN THIS IS ALRIGHT, SAVE TO DATABASE, THE CERTIFICATE, DEVICE ID, PRIVATE KEY AND THE CONFIG DATA\
            const savedCredentials = await saveZIMRAData(
              [zimraCredentialsData], // Wrap in array as the function expects an array
              merchantId,
              deviceId,
              myCertificate,
              privateKey,
            );
            //console.log("Saved ZIMRA credentials:", savedCredentials);

            // Use the actual database ID in the response
            if (
              savedCredentials.status === "updated" ||
              savedCredentials.status === "new"
            ) {
              //console.log("ZIMRA Device Configuration:", configData);
              // Update the response message with config details if available
              message = "Device Config Saved Successfully";
            } else {
              message = "Failed to register The ZIMRA Device";
            }
          } else {
            message = "Failed To Register Fiscal Device";
          }
        } catch (dbError) {
          console.error("Error saving ZIMRA credentials:", dbError);
          return res.status(500).json({
            success: false,
            error: {
              message: "Failed to save ZIMRA credentials to database",
              details:
                dbError instanceof Error
                  ? dbError.message
                  : "Database save failed",
            },
            config: null,
          });
        }
      } else {
        // TIN/VAT mismatch
        return res.status(400).json({
          error: {
            message: "TIN/VAT Verification Failed",
            details:
              "The provided TIN and VAT numbers do not match with ZIMRA records",
          },
        });
      }
      // Return the config data to the client with proper structure
      return res.json({
        success: true,
        message,
        config: configData,
        operationID: configData?.operationID || null,
        deviceId: deviceId,
        status: "registered",
      });
    } catch (error) {
      const errorResponse = error as {
        response?: {
          status?: number;
          data?: any;
        };
        message: string;
      };

      // Better error handling with proper structure
      const errorMessage =
        errorResponse.response?.data?.detail ||
        errorResponse.response?.data?.message ||
        errorResponse.message ||
        "Unknown registration error";

      console.error("ZIMRA registration failed:", {
        status: errorResponse.response?.status,
        data: errorResponse.response?.data,
        message: errorMessage,
        fullError: error,
      });

      // Return proper error response with status code
      return res.status(errorResponse.response?.status || 500).json({
        success: false,
        error: {
          message: "ZIMRA Device Registration Failed",
          details: errorMessage,
          code: errorResponse.response?.status || 500,
        },
        config: null,
      });
    }
  });

  // Add ZIMRA device status endpoint
  // Get all ZIMRA credentials for device list
  app.get("/api/zimraCredentials/all", async (req, res) => {
    try {
      // Check token from multiple sources with better error handling
      const sessionData = req.session as { loyverseToken?: string };
      const authHeader = req.headers.authorization;
      const token =
        sessionData?.loyverseToken ||
        (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

      if (!token) {
        console.error(
          "ERROR: Missing API token in request (checked session and Authorization header)",
        );
        console.error("Session data:", JSON.stringify(sessionData, null, 2));
        console.error("Authorization header:", authHeader);
        return res.status(401).json({
          error: "API token required. Please log in again.",
          details: "No valid authentication token found",
        });
      }

      console.log("Token found for ZIMRA credentials request, validating...");

      // Get merchantID from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        console.error("ERROR: Invalid or expired token provided");
        return res.status(401).json({
          error: "Invalid or expired token. Please log in again.",
          details: "Token validation failed",
        });
      }

      // Get all credentials using the existing getZimraCredentials function
      // Pass only merchantId to get all credentials for this tenant
      const credentials = await getZimraCredentials(merchantId);

      // Ensure credentials is always an array for processing
      const credentialsArray = Array.isArray(credentials)
        ? credentials
        : credentials
          ? [credentials]
          : [];

      if (credentialsArray.length === 0) {
        return res.status(404).json({ error: "No ZIMRA credentials found" });
      }

      // Transform the credentials to include additional fields
      const transformedCredentials = credentialsArray.map((cred) => {
        // Determine status based on certificate validity (if available)
        let status = "registered";
        if (cred.certificateValidTill) {
          const validUntil = new Date(cred.certificateValidTill);
          const now = new Date();
          status = validUntil < now ? "expired" : "registered";
        }

        return {
          ...cred,
          status,
          // Add any other derived fields as needed
          displayName:
            cred.taxPayerName || cred.deviceBranchName || "Unknown Device",
        };
      });

      res.json(transformedCredentials);
    } catch (error) {
      console.error("Error getting ZIMRA credentials:", error);
      res.status(500).json({ error: "Failed to retrieve ZIMRA credentials" });
    }
  });

  // Get specific ZIMRA credential by device ID
  app.get("/api/zimraCredentials", async (req, res) => {
    try {
      // Check token from request
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        console.error("The token is missing from the request!");
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get merchantID from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        // console.error("No merchantId found for token");
        return res.status(401).json({ error: "Invalid token" });
      }

      // Get deviceId from query params
      const deviceId = req.query.deviceId as string;

      if (!deviceId) {
        return res.status(400).json({ error: "Device ID is required" });
      }

      // Get credential from storage
      const credential = await storage.getZimraCredentials(
        merchantId,
        deviceId,
      );

      if (!credential) {
        return res.status(404).json({ error: "ZIMRA credential not found" });
      }

      res.json(credential);
    } catch (error) {
      console.error("Error getting ZIMRA credential:", error);
      res.status(500).json({ error: "Failed to retrieve ZIMRA credential" });
    }
  });

  app.get("/api/zimra/status", async (req, res) => {
    try {
      // Check token from session
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        return res.status(401).json({
          message: "Session token not found. Please log in again.",
        });
      }

      // Get merchantId from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get deviceId from query parameters
      const deviceId = req.query.deviceId as string;
      if (!deviceId) {
        return res.status(400).json({ message: "Device ID is required" });
      }

      // Call the function to get device status
      const statusResponse = await getDeviceStatus(merchantId, deviceId);

      return res.json(statusResponse);
    } catch (error) {
      console.error("Error getting ZIMRA device status:", error);
      return res.status(500).json({
        message: "Failed to get device status",
        error: error.message,
      });
    }
  });

  // Add endpoint to open fiscal day
  app.post("/api/zimra/openDay", async (req, res) => {
    try {
      // Check token from session
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        return res.status(401).json({
          message: "Session token not found. Please log in again.",
        });
      }

      // Get merchantId from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get deviceId from request body
      const { deviceId } = req.body;
      if (!deviceId) {
        return res.status(400).json({ message: "Device ID is required" });
      }

      // Call the function to open fiscal day
      const openDayResponse = await openDay(merchantId, deviceId);

      return res.json(openDayResponse);
    } catch (error) {
      console.error("Error opening ZIMRA fiscal day:", error);
      return res.status(500).json({
        message: "Failed to open fiscal day",
        error: error.message,
      });
    }
  });

  // Add endpoint to submit receipts to ZIMRA Manually
  app.post("/api/zimra/submitReceipts", async (req, res) => {
    try {
      // Check token from session
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        return res.status(401).json({
          message: "Session token not found. Please log in again.",
        });
      }

      // Get merchantId from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get deviceId and sale IDs from request body
      const { deviceId, saleIds } = req.body;

      // Device ID is optional here since the submitZimraReceipts function can get it from the merchant credentials

      if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one sale ID is required" });
      }

      // Get the tenant database
      const tenantDb = await getTenantDB(merchantId);
      if (!tenantDb) {
        return res
          .status(500)
          .json({ message: "Failed to access tenant database" });
      }

      // Fetch the sales from the database
      const selectedSales = await tenantDb.db
        .select()
        .from(sales)
        .where(sql`${sales.id} IN (${saleIds.join(", ")})`)
        .execute();

      if (!selectedSales || selectedSales.length === 0) {
        return res
          .status(404)
          .json({ message: "No sales found with the provided IDs" });
      }

      // Call the function to submit receipts to ZIMRA
      const submissionResponse = await submitZimraReceipts(
        selectedSales,
        merchantId,
        deviceId,
      );

      // If successful, update the sales records in the database to mark them as submitted
      if (submissionResponse.success) {
        const successfulReceipts = submissionResponse.data.successful.map(
          (sr) => sr.receipt,
        );

        if (successfulReceipts.length > 0) {
          // Update the sales records to mark them as submitted to ZIMRA
          await tenantDb.db
            .update(sales)
            .set({
              zimraSubmitted: true,
              zimraSubmissionDate: new Date(),
              zimraError: null,
            })
            .where(
              sql`${sales.receipt} IN (${successfulReceipts.map((r) => `'${r}'`).join(", ")})`,
            )
            .execute();
        }

        // Update the failed submissions with their error messages
        for (const failedSubmission of submissionResponse.data.failed) {
          await tenantDb.db
            .update(sales)
            .set({
              zimraSubmitted: false,
              zimraSubmissionDate: new Date(),
              zimraError:
                typeof failedSubmission.error === "string"
                  ? failedSubmission.error
                  : JSON.stringify(failedSubmission.error),
            })
            .where(sql`${sales.receipt} = ${failedSubmission.receipt}`)
            .execute();
        }
      }

      return res.json(submissionResponse);
    } catch (error) {
      console.error("Error submitting receipts to ZIMRA:", error);
      return res.status(500).json({
        message: "Failed to submit receipts",
        error: error.message,
      });
    }
  });

  // Add endpoint to close fiscal day
  app.post("/api/zimra/closeDay", async (req, res) => {
    try {
      // Try to get merchantId from query string or request body
      let merchantId;

      // Check token from session
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;
      // console.log("Session token exists:", !!token);

      if (!token) {
        console.log("No session token found and no merchantId provided");
        return res.status(400).json({
          message:
            "MerchantId is required. Please provide it in the request or log in again.",
        });
      }

      // Get merchantId from token
      merchantId = await getMerchantIDBYToken(token);
      // console.log("Retrieved merchantId from token:", merchantId);

      if (!merchantId) {
        console.log("Merchant not found for token");
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get deviceId and optional parameters from request body
      const { deviceId, manualClosure } = req.body;
      if (!deviceId) {
        console.log("Missing deviceId in request");
        return res.status(400).json({ message: "Device ID is required" });
      }

      // Call the function to close fiscal day with manual closure parameters
      const closeDayResponse = await closeDayOnZimra(
        merchantId,
        deviceId,
        manualClosure,
      );

      if (closeDayResponse?.success) {
        console.log("Close day successful");
        return res.json(closeDayResponse);
      } else {
        console.log("Close day failed:", closeDayResponse?.message);
        return res.status(400).json({
          success: false,
          message: closeDayResponse?.message || "Failed to close fiscal day",
          error: closeDayResponse?.error || "Unknown error",
        });
      }
    } catch (error) {
      console.error("Error closing ZIMRA fiscal day:", error);
      return res.status(500).json({
        message: "Failed to close fiscal day",
        error: error.message,
      });
    }
  });

  // API endpoint to ping all registered ZIMRA devices and get their status
  app.get("/api/zimra/ping-all", async (req, res) => {
    try {
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        return res.status(401).json({
          message: "Session token not found. Please log in again.",
        });
      }

      // Get merchantId from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      const deviceStatuses = await pingAllZimraDevices(merchantId);
      return res.json({
        success: true,
        deviceStatuses,
        timestamp: new Date(),
      });
    } catch (error) {
      // console.error("Error pinging ZIMRA devices:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while pinging ZIMRA devices",
        error: (error as any).message,
      });
    }
  });

  // API endpoint to get all fiscal days for the merchant
  app.get("/api/fiscal-days", async (req, res) => {
    try {
      const sessionData = req.session as { loyverseToken?: string };
      const token = sessionData.loyverseToken;

      if (!token) {
        return res.status(401).json({
          message: "Session token not found. Please log in again.",
        });
      }

      // Parse pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const offset = (page - 1) * pageSize;

      // Get merchantId from token
      const merchantId = await getMerchantIDBYToken(token);
      if (!merchantId) {
        return res.status(404).json({ message: "Merchant not found" });
      }

      // Get tenant database
      const tenantDB = await getTenantDB(merchantId);
      if (!tenantDB) {
        return res.status(500).json({
          message: "Unable to connect to merchant database",
        });
      }

      // Get total count for pagination
      const totalCountResult = await tenantDB.db
        .select({ count: sql`count(*)` })
        .from(schema.fiscalDays)
        .execute();

      const totalRecords = parseInt(totalCountResult[0]?.count as string) || 0;
      const totalPages = Math.ceil(totalRecords / pageSize);

      // Query fiscal days from the database with pagination
      const fiscalDaysData = await tenantDB.db
        .select()
        .from(schema.fiscalDays)
        .orderBy(sql`${schema.fiscalDays.openedAt} DESC`)
        .limit(pageSize)
        .offset(offset)
        .execute();

      // Calculate totals from ALL fiscal days (not just current page)
      const allFiscalDays = await tenantDB.db
        .select()
        .from(schema.fiscalDays)
        .execute();

      let totalsUSD = {
        totalZeroRated: 0,
        totalExempt: 0,
        totalStandardRated: 0,
        totalZeroRatedTax: 0,
        totalExemptTax: 0,
        totalStandardRatedTax: 0,
      };

      let totalsZWG = {
        totalZeroRated: 0,
        totalExempt: 0,
        totalStandardRated: 0,
        totalZeroRatedTax: 0,
        totalExemptTax: 0,
        totalStandardRatedTax: 0,
      };

      allFiscalDays.forEach((fiscalDay) => {
        if (fiscalDay.fiscalCounters) {
          const counters =
            typeof fiscalDay.fiscalCounters === "string"
              ? JSON.parse(fiscalDay.fiscalCounters)
              : fiscalDay.fiscalCounters;

          counters.forEach((counter: any) => {
            const currency = counter.fiscalCounterCurrency;
            const value = counter.fiscalCounterValue;

            if (counter.fiscalCounterType === "SaleByTax") {
              if (counter.fiscalCounterTaxPercent === 0) {
                // Zero rated (0% tax)
                if (currency === "USD") {
                  totalsUSD.totalZeroRated += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalZeroRated += value;
                }
              } else if (counter.fiscalCounterTaxPercent === null) {
                // Exempt (null tax)
                if (currency === "USD") {
                  totalsUSD.totalExempt += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalExempt += value;
                }
              } else if (counter.fiscalCounterTaxPercent === 15) {
                // Standard rated (15% tax)
                if (currency === "USD") {
                  totalsUSD.totalStandardRated += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalStandardRated += value;
                }
              }
            } else if (counter.fiscalCounterType === "SaleTaxByTax") {
              // Tax amounts
              if (counter.fiscalCounterTaxPercent === 0) {
                // Zero rated tax (should be 0)
                if (currency === "USD") {
                  totalsUSD.totalZeroRatedTax += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalZeroRatedTax += value;
                }
              } else if (counter.fiscalCounterTaxPercent === null) {
                // Exempt tax (should be 0)
                if (currency === "USD") {
                  totalsUSD.totalExemptTax += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalExemptTax += value;
                }
              } else if (counter.fiscalCounterTaxPercent === 15) {
                // Standard rated tax (15% VAT)
                if (currency === "USD") {
                  totalsUSD.totalStandardRatedTax += value;
                } else if (currency === "ZWG") {
                  totalsZWG.totalStandardRatedTax += value;
                }
              }
            }
          });
        }
      });

      return res.json({
        data: fiscalDaysData,
        pagination: {
          currentPage: page,
          pageSize: pageSize,
          totalRecords: totalRecords,
          totalPages: totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
        totals: {
          USD: totalsUSD,
          ZWG: totalsZWG,
        },
      });
    } catch (error) {
      console.error("Error fetching fiscal days:", error);
      return res.status(500).json({
        message: "Failed to fetch fiscal days",
        error: (error as any).message,
      });
    }
  });

  // API endpoint to generate and download fiscal day PDF report
  app.get(
    "/api/zimra/fiscal-day-report/:deviceId/:fiscalDayNo",
    async (req, res) => {
      try {
        const sessionData = req.session as { loyverseToken?: string };
        const token = sessionData.loyverseToken;

        if (!token) {
          return res.status(401).json({
            message: "Session token not found. Please log in again.",
          });
        }

        // Get merchantId from token
        const merchantId = await getMerchantIDBYToken(token);
        if (!merchantId) {
          return res.status(404).json({ message: "Merchant not found" });
        }
        const { deviceId, fiscalDayNo } = req.params;
        if (!deviceId) {
          return res.status(400).json({ message: "Device ID is required" });
        }

        // Generate fiscal day report PDF
        const fiscalDay = await generateFiscalDayReport(
          merchantId,
          deviceId,
          fiscalDayNo,
        );

        if (!fiscalDay) {
          return res.status(500).json({
            message: "Failed to generate fiscal day report",
          });
        }
        console.log("eeeeeeeeeeeeee");
        console.log(fiscalDay.fiscalDay);

        return res.send(fiscalDay); //send to the user side the zreport payload
      } catch (error) {
        console.error("Error generating fiscal day PDF:", error);
        return res.status(500).json({
          message: "Failed to generate fiscal day report",
          error: (error as any).message,
        });
      }
    },
  );

  // Endpoint to fetch items from Loyverse API
  app.get("/api/loyverse/items", async (req, res) => {
    try {
      const { authorization } = req.headers;
      if (!authorization) {
        return res
          .status(401)
          .json({ message: "Authorization token required" });
      }

      const token = authorization.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Invalid authorization token" });
      }

      // Define the Loyverse API URL
      const LOYVERSE_API_URL = "https://api.loyverse.com/v1.0";

      try {
        // Fetch items from Loyverse API
        const itemsResponse = await axios.get(`${LOYVERSE_API_URL}/items`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        return res.json(itemsResponse.data);
      } catch (error: any) {
        console.error("Error fetching Loyverse items:", error);
        const status = error.response?.status || 500;
        const message =
          error.response?.data?.message || "Failed to fetch items";
        return res.status(status).json({ message });
      }
    } catch (error) {
      console.error("Error in Loyverse items endpoint:", error);
      return res.status(500).json({ message: "Server error fetching items" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
