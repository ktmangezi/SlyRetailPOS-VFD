import * as schema from "@shared/schema";
import { sql } from "drizzle-orm";
import { getTenantDB, getMerchantIDBYToken } from "./tenant-db";
import {
  getZimraCredentials,
  getDeviceStatusFromZimra,
  submitZimraReceipts,
  ZIMRA_API_URL,
  closeDayOnZimra,
} from "./zimra-functions";

//THIS FUNCTION WILL ONLY SAVE THE SALES DATA TO THE DB
export async function saveSalesData(
  sales: schema.Sale[],
  merchantId: string,
  resubmitReceipt: boolean,
  token: string,
) {
  try {
    if (!merchantId) {
      throw new Error("Merchant ID not found");
    }

    // Retrieve the tenant-specific database using the merchant ID
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }
    // Get all the devices from merchant's ZIMRA credentials
    const zimraCredentialsResponse = await getZimraCredentials(merchantId);
    if (!zimraCredentialsResponse) {
      return {
        success: false,
        message: "No ZIMRA device found for this merchant",
      };
    }
    let deviceId = "";
    let deviceStatusResponse = "";
    if (
      Array.isArray(zimraCredentialsResponse) &&
      zimraCredentialsResponse.length > 0
    ) {
      // console.log(zimraCredentialsResponse);
      deviceId = zimraCredentialsResponse[0].deviceId ?? "";
      deviceStatusResponse =
        zimraCredentialsResponse[0].deviceOperatingMode ?? "";
    }

    // Clear caches for this merchant to ensure polling clients get fresh data
    // This is crucial for real-time updates when new sales come in via webhooks
    const merchantCachePrefix = `${merchantId}:`;
    for (const key of salesCache.keys()) {
      if (key.startsWith(merchantCachePrefix)) {
        // console.log(`Clearing sales cache for key ${key} after webhook data`);
        salesCache.delete(key);
      }
    }

    for (const key of slimSalesCache.keys()) {
      if (key.startsWith(merchantCachePrefix)) {
        slimSalesCache.delete(key);
      }
    }
    //TRYING THE MAP PROMISE ALL
    let zimraReceiptId = "";
    let failedReceipts: any[] = [];
    const results1 = await Promise.all(
      sales.map(async (sale) => {
        try {
          let existingCheck = null; // BE INNITIALISED ALWAYS BECAUSE I SUSPECT YOU ARE SLEEPING ON DUTY
          let receiptInFailedDB = null;
          //CHECH IF THE STORE BRANCH NAME IS BLACK LISTED
          if (
            sale.storeName === "2 GREENBELT INVESTMENTS" ||
            sale.storeName === "1 GREENBELT INVESTMENTS"
          ) {
            console.log("BLACK LISTED STORE BRANCH NAME");
            //then delete from the webhook que table
            await tenantDB.db
              .delete(schema.webhookQueue)
              .where(
                sql`${schema.webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${sale.receipt}`,
              )
              .execute();

            return {
              success: true,
              id: 0,
              receipt: sale.receipt,
              status: "existing",
            };
          }
          // Verify if the sale exists in the tenant database
          //CHECK IF THE RECEIPT IS IN THE SALES RECEIPTS TABLE and it does not h
          existingCheck = await tenantDB.db
            // .select({ id: schema.sales.id })
            .select()
            .from(schema.sales)
            .where(sql`${schema.sales.receipt} = ${sale.receipt}`)
            .execute();

          if (existingCheck.length > 0 && resubmitReceipt === false) {
            //now delete the recipt if it was awaiting processing from the webhook queue table
            await tenantDB.db
              .delete(schema.webhookQueue)
              .where(
                sql`${schema.webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${sale.receipt}`,
              )
              .execute();
            return {
              success: true,
              id: existingCheck[0].id,
              receipt: sale.receipt,
              status: "existing",
            };
          } else {
            if (resubmitReceipt === true) {
              console.log("RE-SUBMITTING RECEIPT ", sale.receipt);
              //RECHECK IF THE RESUBMITED INVOICE HAS NOT BE SUBMITED TO ZIMRA ALREADY
              let checkDuplicateResubmission = await tenantDB.db
                .select()
                .from(schema.sales)
                .where(
                  sql`${schema.sales.receipt} = ${sale.receipt} AND ${schema.sales.zimraSubmitted} = TRUE`,
                )
                .execute();
              console.log(checkDuplicateResubmission);
              if (checkDuplicateResubmission.length > 0) {
                console.log("RECEIPT NO ", sale.receipt, " IS A DUPLICATE");
                //DELETE IT FROM THE FAILED RECEIPT TABLE IF IT EXISTS
                await tenantDB.db
                  .delete(schema.failedReceipts)
                  .where(
                    sql`${schema.failedReceipts.receipt} = ${sale.receipt}`,
                  )
                  .execute();

                //do not go anywhere
                return {
                  success: true,
                  id: checkDuplicateResubmission[0].id,
                  receipt: sale.receipt,
                  status: "existing",
                };
              }
            }
            //ALSO CREDIT NOTE MUST NOT GO ANYWHERE IF IT IS INVALID
            let creditNoteValid = "y";
            if (sale.receiptType === "CreditNote" && sale.refundFor) {
              //THEN WE WILL NEED TO CHECK IF THE ORIGINAL RECEIPT EXISTS IN THE DATABASE
              const merchantId = await getMerchantIDBYToken(token);
              if (!merchantId) {
                throw new Error("Failed to get merchant ID");
              }
              const tenantDB = await getTenantDB(merchantId);
              if (!tenantDB) {
                throw new Error("Failed to connect to tenant database");
              }
              const originalReceipt = await tenantDB.db
                .select()
                .from(schema.sales)
                .where(sql`${schema.sales.receipt} = ${sale.refundFor}`)
                .execute();
              // //IF THE ORIGINAL RECEIPT DOES NOT EXIST IN THE DATABASE, THEN STOP THE PROCESS
              if (originalReceipt.length > 0) {
                console.log(
                  "The invoice to be refunded is found ",
                  sale.refundFor,
                );
              }
              //   //WE WILL NEED TO INVESTIGATE THE ORIGINAL RECEIPT TO SEE IF IT HAS THE SAME NUMBER OF ITEMS AS THE REFUND RECEIPT
              if (originalReceipt.length > 0) {
                if (originalReceipt[0].items.length !== sale.items.length) {
                  console.log("INVALID CREDIT NOTE");
                  creditNoteValid = "n";
                }
              } else {
                console.log("ORIGINAL INVOICE NOT FOUND FOR CREDIT NOTE");
                creditNoteValid = "n";
              }
            }

            let submissionStatus = true;
            let fiscalDayStatus = "";
            //WHETHER THE CLIENT'S ROUTE OF SUBMISSION IS ZIMRA OR NOT, WE WILL STILL TO HAVE THESE
            sale.zimraSubmitted = false; //INNITIALISE THE SUBMISSION AS FALSE
            sale.zimraQrUrl = ZIMRA_API_URL;
            sale.zimraSubmissionDate = sale.timestamp; //DATE SUBMITTED{lets experiment which date is this}
            let receiptHash = "";
            let receiptCounter = "";

            if (deviceId && creditNoteValid === "y") {
              //THIS MEANS THE DAY IS OPENED OR FISCAL DAY ERROR AND WE CAN SUBMIT and FISCALISE THE RECEIPT
              const submittedReciptResponse = await submitZimraReceipts(
                sale,
                merchantId,
              );
              // console.log(submittedReciptResponse?.data?.successful[0]);
              fiscalDayStatus = submittedReciptResponse?.fiscalDayStatus ?? "";

              sale.submissionRoute =
                submittedReciptResponse?.submissionRoute ?? null;
              receiptCounter =
                submittedReciptResponse?.data?.successful[0]
                  ?.currentZimraReceiptCounter ?? "";

              receiptHash =
                submittedReciptResponse?.data?.successful[0]?.receiptHash ?? "";
              sale.zimraDeviceId = submittedReciptResponse?.zimraDeviceId ?? "";
              //VERIFY IF THE RECEIPT WAS SUBMITTED SUCCESSFULLY
              if (submittedReciptResponse?.success === true) {
                console.log(
                  "Receipt No. ",
                  sale.receipt,
                  " Submitted Successfully For Device ",
                  Number(sale.zimraDeviceId),
                );
                console.log(
                  submittedReciptResponse?.data?.successful[0].response
                    .validationErrors,
                );

                //save to zimra crentials table the receipt hash from the response
                sale.zimraError =
                  submittedReciptResponse?.data?.successful[0].response
                    .validationErrors || [];
                // ?   WHETHER THE STATUS IS TRUE OR FALSE ON SUBMISSION IT WILL ALSO DEPEND ON VALIDATION ERRORS
                sale.zimraSubmitted = true;

                sale.zimraFiscalDayId =
                  submittedReciptResponse?.data?.successful[0].response.zimraFiscalDayId;

                sale.zimraFiscalDayNo =
                  submittedReciptResponse?.data?.successful[0]
                    ?.zimraFiscalDayNo ?? null;

                sale.zimraGlobalNo =
                  submittedReciptResponse?.data?.successful[0]
                    .currentZimraGlobalNumber ?? null;

                sale.zimraOperationId =
                  submittedReciptResponse?.data?.successful[0].response.operationID;

                sale.zimraReceiptId =
                  submittedReciptResponse?.data?.successful[0].response.receiptID;

                sale.zimraQrData =
                  submittedReciptResponse?.data?.successful[0].zimraQrData ??
                  null;
                zimraReceiptId = sale.zimraReceiptId;

                //update the zimracredentials table
                //DELETE IT FROM THE FAILED RECEIPT TABLE IF IT EXISTS
                await tenantDB.db
                  .delete(schema.failedReceipts)
                  .where(
                    sql`${schema.failedReceipts.receipt} = ${sale.receipt}`,
                  )
                  .execute();
              } else {
                //THE SUBMISSION TO ZIMRA FAILED

                console.log("Failed to submit receipt");
                submissionStatus = false;
                console.log(
                  submittedReciptResponse?.data?.failed[0].error.message,
                );
                sale.zimraFiscalDayId =
                  submittedReciptResponse?.data?.failed[0].zimraFiscalDayId ??
                  "";
                sale.zimraFiscalDayNo =
                  submittedReciptResponse?.data?.failed[0]?.zimraFiscalDayNo ??
                  "";
                sale.zimraGlobalNo =
                  submittedReciptResponse?.data?.failed[0]
                    .currentZimraGlobalNumber ?? "";
                receiptCounter =
                  submittedReciptResponse?.data?.failed[0]
                    .currentZimraReceiptCounter ?? "";
                receiptHash =
                  submittedReciptResponse?.data?.failed[0]?.receiptHash ?? "";
                sale.zimraQrData =
                  submittedReciptResponse?.data?.failed[0].zimraQrData ?? "";
                sale.receiptStatus = "pending";
              }
            }
            // Insert the new sale data into the tenant database
            const validatedSale = {
              receipt: sale.receipt,
              receiptType: sale.receiptType,
              refundFor: sale.refundFor,
              cancelledAt: sale.cancelledAt,
              notes: sale.notes,
              total: sale.total,
              totalInc: sale.totalInc,
              vatAmount: sale.vatAmount,
              timestamp: sale.timestamp,
              items: sale.items,
              storeName: sale.storeName,
              storeId: sale.storeId,
              storeTINnumber: sale.storeTINnumber,
              storeVATnumber: sale.storeVATnumber,
              storeAddress: sale.storeAddress,
              storeCity: sale.storeCity,
              storeProvince: sale.storeProvince,
              storeEmail: sale.storeEmail,
              storeContactNumber: sale.storeContactNumber,
              customerName: sale.customerName || "Cash Sale",
              customerAddress: sale.customerAddress || "",
              customerCity: sale.customerCity || "",
              customerEmail: sale.customerEmail || "",
              customerContact: sale.customerContact || "",
              customerTIN: sale.customerTIN || "",
              customerVAT: sale.customerVAT || "",
              footerText: sale.footerText || "",
              payments: sale.payments,
              receiptHash: receiptHash,
              zimraSubmitted: sale.zimraSubmitted || false,
              zimraSubmissionDate: sale.zimraSubmissionDate,
              zimraError: sale.zimraError,
              zimraReceiptId: sale.zimraReceiptId,
              zimraDeviceId: sale.zimraDeviceId,
              zimraQrData: sale.zimraQrData,
              zimraQrUrl: sale.zimraQrUrl,
              zimraOperationId: sale.zimraOperationId,
              zimraFiscalDayId: sale.zimraFiscalDayId,
              zimraFiscalDayNo: sale.zimraFiscalDayNo,
              zimraGlobalNo: sale.zimraGlobalNo,
              receiptCounter: receiptCounter,
              submissionRoute: sale.submissionRoute,
              receiptStatus: sale.receiptStatus,
            };
            let result = null;
            if (resubmitReceipt === false && creditNoteValid === "y") {
              // console.log("Saving new sale data.");
              result = await tenantDB.db
                .insert(schema.sales)
                .values(validatedSale)
                .returning();
            } else {
              //update the sales table
              // console.log("Updating existing sale data.");
              result = await tenantDB.db
                .update(schema.sales)
                .set(validatedSale)
                .where(sql`${schema.sales.receipt} = ${sale.receipt}`)
                .returning();
            }

            //now delete the processed recipt from the webhook queue table
            await tenantDB.db
              .delete(schema.webhookQueue)
              .where(
                sql`${schema.webhookQueue.payload}->'receipts'->0->>'receipt_number' = ${sale.receipt}`,
              )
              .execute()
              .catch((error) => {
                console.error("Error deleting processed receipt:", error);
              });
            // Send notification for new sale (we will also use this stage to send invoices via email to the client)
            // await sendSaleNotification(validatedSale, merchantId);
            //TRY ATTEMPTING TO CLOSE DAY HERE
            if (
              sale.zimraDeviceId &&
              fiscalDayStatus !== "FiscalDayCloseFailed" &&
              fiscalDayStatus !== null &&
              fiscalDayStatus !== undefined &&
              fiscalDayStatus !== "" &&
              fiscalDayStatus !== "FiscalDayInitiated"
            ) {
              let manualClosure = false;
              //BEFORE CLOSING, TRY TO RESUBMIT ALL FAILED RECEIPTS FOR THAT DEVICE
              //await resubmitSalesData(merchantId, sale.zimraDeviceId);
              await closeDayOnZimra(
                merchantId,
                sale.zimraDeviceId,
                manualClosure,
              );
            } else if (fiscalDayStatus === "FiscalDayCloseFailed") {
              //THIS MUST BE THERE IN THE DATABASE, AND THE ANDROID POS SHOULD SIGNAL THIS TO THEIR USERS SO THAT THEY SEND TO ZIMRA TO CLOSE DAY
              console.log(
                "Closing Day Has Failed For The Device, Send To ZIMRA",
                sale.zimraDeviceId,
              );
            }

            return {
              success: true,
              id: result[0].id,
              receipt: sale.receipt,
              status: "new",
            };
          }
        } catch (error: any) {
          console.error(`Error saving sale ${sale.receipt}:`, error.message);
          return {
            success: false,
            receipt: sale.receipt,
            error: error.message,
          };
        }
      }),
    );
    const successful = results1.filter((r) => r.success);
    const newSaved = successful.filter((r) => r.status === "new").length;
    const existing = successful.filter((r) => r.status === "existing").length;
    const failed = results1.filter((r) => !r.success);
    console.log(
      `Auto-save complete: ${newSaved} new, ${existing} existing, ${failed.length} failed`,
    );
    sales.forEach((sale: any) => {
      const result = results1.find((r) => r.receipt === sale.receipt);
      if (result) {
        sale.saveStatus =
          result.status || (result.success ? "saved" : "failed");
      }
    });

    if (newSaved === 1) {
      //WE WANT TO VERIFY IF THIS CURRENT RECEIPT WAS SUBMITTED TO ZIMRA, IF IT WAS SUBMITTED SUCCESSFULLY, WE WILL NEED TO CHECK IF THERE ARE PREVIOUSLY FAILED RECEIPTS AND PERFORM A RE-SUBMISSION
      if (zimraReceiptId !== "") {
        console.log("ZIMRA ONLINE ", zimraReceiptId);
        //CHECK IF THERE ARE PREVIOUSLY FAILED RECEIPTS in failed table
        failedReceipts = await tenantDB.db
          .select()
          .from(schema.failedReceipts)
          .execute();
      } else {
        console.log("ZIMRA OFFLINE ...................");
      }
    }
    if (existing === 1) {
      //THIS MEANS IT WAS A RESUBMISSION, EDIT
    }

    return {
      success: true,
      failedReceipts: failedReceipts,
    };
  } catch (error: any) {
    console.error("Error during auto-save:", error);
  }
}
//===================================================================================
// Environment variables for optimized performance
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SHOULD_LOG_VERBOSE = !IS_PRODUCTION;

// In-memory cache for sales data to reduce database load
const salesCache = new Map<
  string,
  {
    data: any[];
    lastFetched: number;
  }
>();

// Separate cache for the slim version of sales data
const slimSalesCache = new Map<
  string,
  {
    data: any[];
    lastFetched: number;
  }
>();

// Cache validity in milliseconds (30 seconds)
const CACHE_TTL = 30000;

//THIS FUNCTION WILL BE USED TO ONLY GET THE SALES FROM THE DATABASE WITH PAGINATION AND CACHING
export async function getSalesFromDb(
  merchantId: string,
  store_id: string,
  page: number,
  pageSize: number,
  search?: string,
  currency?: string,
  dateFrom?: string,
  dateTo?: string,
  lastProcessedSaleId?: string,
  posNumber: string,
) {
  try {
    //INNITIALISE THE SALES DATA
    let allSales: any[] = [];
    //INNITIALISE THE COMPUTATION OF TAX
    let totalTax = 0;
    let totalSalesIncVat = 0;
    let totalSalesExcVat = 0;
    let totalZeroRated = 0;
    let storeName = "";

    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }

    // Fetch data with appropriate filter
    let fromDate;
    let toDate;
    if (dateFrom || dateTo) {
      fromDate = dateFrom ? new Date(dateFrom) : null;
      toDate = dateTo ? new Date(dateTo) : null;
    }

    if (store_id !== "All Stores") {
      const query = tenantDB.db.select().from(schema.sales)
        .where(sql`${schema.sales.storeId} = ${store_id} 
              AND (${fromDate ? sql`${schema.sales.timestamp} >= ${fromDate}` : sql`1=1`})
              AND (${toDate ? sql`${schema.sales.timestamp} <= ${toDate}` : sql`1=1`})`);
      allSales = await query.execute();
    } else {
      const query = tenantDB.db.select().from(schema.sales)
        .where(sql`${fromDate ? sql`${schema.sales.timestamp} >= ${fromDate}` : sql`1=1`}
        AND (${toDate ? sql`${schema.sales.timestamp} <= ${toDate}` : sql`1=1`})`);
      //log the timestamp of the sales

      allSales = await query.execute();
    }

    //THEN UPDATE THE TOTALS PER THAT CURRENCY
    await Promise.all(
      allSales.map(async (sale) => {
        try {
          if (currency) {
            //THE USER HAS SPECIFIED THE CURRENCY
            if (currency !== "All" && sale.payments[0].currency === currency) {
              //CALCULATE THE TOTAL TAX
              totalTax = totalTax + Number(sale.vatAmount) || 0;
              //CALCULATE THE TOTAL SALES EXCLUDING VAT
              if (Number(sale.vatAmount) > 0) {
                totalSalesExcVat = totalSalesExcVat + Number(sale.total);
              }
              //CALCULATE THE TOTAL ZERO RATED SALES
              if (Number(sale.vatAmount) === 0) {
                totalZeroRated = totalZeroRated + Number(sale.totalInc) || 0;
              }
              storeName = sale.storeName;
              //THE USER HAS NOT SPECIFIED THE CURRENCY
            } else if (currency === "All") {
              //CALCULATE THE TOTAL TAX
              totalTax = totalTax + Number(sale.vatAmount) || 0;
              //CALCULATE THE TOTAL SALES EXCLUDING VAT
              if (Number(sale.vatAmount) > 0) {
                totalSalesExcVat = totalSalesExcVat + Number(sale.total); //WE SHOULD GET THIS RATE FROM THE DAtaBASE
              }
              //CALCULATE THE TOTAL ZERO RATED SALES
              if (Number(sale.vatAmount) === 0) {
                totalZeroRated = totalZeroRated + Number(sale.totalInc) || 0;
              }
              storeName = sale.storeName;
            }
          }
        } catch (error: any) {
          console.error(`Error computing tax:`, error.message);
        }
      }),
    );
    //CALCULATE THE TOTAL SALES INCLUDING VAT
    // totalSalesIncVat = totalSalesExcVat + totalTax;
    totalSalesIncVat = totalTax / 0.15 + totalTax;
    // Apply filters if provided
    // Search by receipt number or customer name
    if (search && search !== "All") {
      allSales = [];
      //take the data from the database and filter it based on the search term
      allSales = await tenantDB.db
        .select()
        .from(schema.sales)
        .where(
          sql`(${schema.sales.receipt} ILIKE '%' || ${search} || '%' OR ${schema.sales.customerName} ILIKE '%' || ${search} || '%')`,
        )
        .execute();
    }

    //now filter the allsales data by currency
    if (currency && currency !== "All" && currency !== "all") {
      allSales = allSales.filter((sale) =>
        sale.payments.some((payment: any) => payment.currency === currency),
      );
    }
    //DEPENDING ON WHETHER THE USER HAS USED THE ANDROID APP TO LOG IN OR USED THE WEBAPP, DATA WILL BE FILTERED ACCORDINGLY, THE WEBAPP DOES NOT FILTER ACCORDING TO THE POSS NUMBER, BUT THE ANDROID APP WILL FILTER ACCORDING TO THE POS NUMBER
    let allSales2 = [];
    if (posNumber === "All") {
      // console.log(storeName, " WEB APP REQUESTING ", posNumber);
      allSales2 = allSales; //WE WILL REFILTER ACCORDING TO POS NUMBER
    } else {
      //LOOP WITHIN allSales
      console.log(storeName, " ANDROID APP REQUESTING FOR POS ", posNumber);
      for (const sale of allSales) {
        const parts = sale.receipt.split("-");
        const receiptPos = parts[0];
        if (Number(receiptPos) === Number(posNumber)) {
          allSales2.push(sale); //WE WILL REFILTER ACCORDING TO POS NUMBER
        }
      }
    }
    // Sort by timestamp descending
    allSales2.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Calculate pagination info
    let paginatedSales = [];
    const totalRecords = allSales2.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    //THE HIEGHEST ID WITHIN allSales IS
    const highestId = allSales2.reduce((max, sale) => {
      return sale.id > max ? sale.id : max;
    }, 0);

    // Extract requested page
    paginatedSales = allSales2.slice(startIndex, endIndex);
    return {
      allSales: paginatedSales,
      totalPages,
      totalRecords,
      currentPage: page, // Always include current page in response
      periodTaxByCurrency: totalTax.toFixed(2),
      totalZeroRated,
      totalSalesIncVat,
    };
  } catch (error) {
    console.error("Error getting data from db:", error);
    return {
      allSales: [],
      totalRecords: 0,
      totalPages: 0,
      currentPage: 1,
      periodTaxByCurrency: 0.0,
    };
  }
}
//===============================================================================================
export async function resubmitSalesData(
  merchantId: string,
  zimraDeviceId: string,
) {
  try {
    if (!merchantId) {
      throw new Error("Merchant ID not found");
    }
    // Retrieve the tenant-specific database using the merchant ID
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }

    return {
      success: true,
      message: "Sales data updated successfully",
    };
  } catch (error) {
    console.error("Error updating sales data:", error);
    return {
      success: true,
      message: error,
    };
  }
}
//======================================================================================
export async function getLoyverseToken(merchantId: string) {
  try {
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }

    const credentials = await tenantDB.db
      .select()
      .from(schema.merchantCredentials)
      .where(sql`${schema.merchantCredentials.merchantId} = ${merchantId}`)
      .execute();

    return credentials[0]?.loyverseToken;
  } catch (error) {
    console.error("Error getting Loyverse token:", error);
    return null;
  }
}
//=============================================================================================
//SAVE THE ZIMRA CREDENTIALS {CERTIFICATE REQUEST AND DEVICE ID} TO THE DATABASE}
export async function saveZIMRAData(
  zimraCredentialsData: schema.ZimraCredentials[],
  merchantId: string,
  deviceId: string,
  myCertificate: string,
  privateKey: string,
) {
  try {
    if (!merchantId) {
      throw new Error("Merchant ID not found");
    }

    // Retrieve the tenant-specific database using the merchant ID
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }

    // We'll store the result to return
    let savedCredential = null;

    const results = await Promise.all(
      zimraCredentialsData.map(async (credentials) => {
        try {
          // Verify if the credentials table exists in the tenant database
          // Check if the table "zimra_credentials" exists
          await tenantDB.db.execute(sql`
            CREATE TABLE IF NOT EXISTS zimra_credentials (
                id SERIAL PRIMARY KEY,
                taxpayer_name TEXT,
                taxpayer_tin TEXT,
                vat_number TEXT,
                certificate TEXT,
                private_key TEXT,
                device_id TEXT,
                device_serial_no TEXT,
                device_branch_name TEXT,
                device_branch_address JSONB,
                device_branch_contacts JSONB,
                device_operating_mode TEXT,
                fiscal_opened_date TEXT,
                taxpayer_day_max_hrs NUMERIC,
                applicable_taxes JSONB,
                certificate_valid_till TEXT,
                qr_url TEXT,
                taxpayer_day_end_notification_hrs NUMERIC,
                zimra_fiscal_day_no TEXT DEFAULT '1',
                fiscal_day_status TEXT ,
                next_zimra_global_no TEXT DEFAULT '1',
                next_zimra_receipt_counter TEXT DEFAULT '1',
                receipt_hash TEXT,
                progress_receipt TEXT,
                active BOOLEAN,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
          `);

          const existingCheck = await tenantDB.db
            .select({ id: schema.zimraCredentials.id })
            .from(schema.zimraCredentials)
            .where(sql`${schema.zimraCredentials.deviceId} = ${deviceId}`)
            .execute();

          if (existingCheck.length > 0) {
            // UPDATE THE EXISTING CREDENTIALS
            const updateResult = await tenantDB.db
              .update(schema.zimraCredentials)
              .set({
                taxPayerName: credentials.taxPayerName,
                taxPayerTIN: credentials.taxPayerTIN,
                vatNumber: credentials.vatNumber,
                certificate: myCertificate,
                privateKey: privateKey,
                deviceId: deviceId,
                deviceSerialNo: credentials.deviceSerialNo,
                deviceBranchName: credentials.deviceBranchName,
                deviceBranchAddress: credentials.deviceBranchAddress,
                deviceBranchContacts: credentials.deviceBranchContacts,
                deviceOperatingMode: credentials.deviceOperatingMode,
                taxPayerDayMaxHrs: credentials.taxPayerDayMaxHrs,
                applicableTaxes: credentials.applicableTaxes,
                certificateValidTill: credentials.certificateValidTill,
                qrUrl: credentials.qrUrl,
                taxpayerDayEndNotificationHrs:
                  credentials.taxpayerDayEndNotificationHrs,
                active: true,
                updatedAt: new Date(),
              })
              .where(sql`${schema.zimraCredentials.deviceId} = ${deviceId}`)
              .returning();

            console.log(
              "Found and updating existing ZIMRA credentials for deviceId:",
              deviceId,
            );
            console.log(updateResult);

            // Store the result to return
            savedCredential = {
              id: updateResult[0].id,
              deviceId: deviceId,
              status: "updated",
            };

            return savedCredential;
          } else {
            // INSERT THE NEW CREDENTIALS
            const result = await tenantDB.db
              .insert(schema.zimraCredentials)
              .values({
                taxPayerName: credentials.taxPayerName,
                taxPayerTIN: credentials.taxPayerTIN,
                vatNumber: credentials.vatNumber,
                certificate: myCertificate,
                // Private key no longer stored - generated dynamically as needed
                privateKey: privateKey,
                deviceId: deviceId,
                deviceSerialNo: credentials.deviceSerialNo,
                deviceBranchName: credentials.deviceBranchName,
                deviceBranchAddress: credentials.deviceBranchAddress,
                deviceBranchContacts: credentials.deviceBranchContacts,
                deviceOperatingMode: credentials.deviceOperatingMode,
                zimraFiscalDayNo: "0",
                zimraFiscalOpenedDate: "",
                zimraFiscalDayStatus: "",
                nextZimraGlobalNo: "1",
                nextZimraReceiptCounter: "1",
                receiptHash: "",
                taxPayerDayMaxHrs: credentials.taxPayerDayMaxHrs,
                applicableTaxes: credentials.applicableTaxes,
                certificateValidTill: credentials.certificateValidTill,
                qrUrl: credentials.qrUrl,
                taxpayerDayEndNotificationHrs:
                  credentials.taxpayerDayEndNotificationHrs,
                active: true,
              })
              .returning();

            console.log(
              "ZIMRA registration successful, certificate saved for deviceId:",
              deviceId,
            );
            console.log(result);

            // Store the result to return
            savedCredential = {
              id: result[0].id,
              deviceId: deviceId,
              status: "new",
            };

            return savedCredential;
          }
        } catch (error: any) {
          console.error(
            `Error saving ZIMRA Credentials for deviceId ${deviceId}:`,
            error.message,
          );
          throw error; // Propagate the error
        }
      }),
    );

    // Return the first result (since we typically only save one credential at a time)
    return results[0] || { id: 0, deviceId: "", status: "error" };
  } catch (error: any) {
    console.error("Error during ZIMRA credential save:", error);
    throw error; // Propagate the error to be handled by the caller
  }
}
//===============================================================================================================
