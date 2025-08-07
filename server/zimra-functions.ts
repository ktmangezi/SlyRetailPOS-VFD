import https from "https";
import * as schema from "@shared/schema";
import axios from "axios";
import { getTenantDB } from "./tenant-db";
import {
  type ZimraCredentials,
  zimraCredentials,
  sales,
  type Sale,
  type SaleItem,
  PaymentInfo,
} from "@shared/schema";
import { resubmitSalesData } from "./SalesController";
import { eq, sql, desc } from "drizzle-orm";
import crypto from "crypto";
import forge from "node-forge";
import { Result } from "postcss";
import { ReceiptRussianRuble } from "lucide-react";
import { NODATA } from "dns";
import PDFDocument from "pdfkit";

// Centralized environment detection for optimized logging
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SHOULD_LOG_VERBOSE = !IS_PRODUCTION;

export const ZIMRA_API_URL = process.env.ZIMRA_API_URL; //TESTING URL
console.log("ZIMRA API URL: ", ZIMRA_API_URL);
// export const ZIMRA_API_URL = "https://fdmsapi.zimra.co.zw"; PRODUCTION URL

/**
 * Interface for ping response from ZIMRA API
 */

export interface ZimraPingResponse {
  operationID: string;
  reportingFrequency: number;
}

/**
 * Interface for device status
 */
export interface DeviceStatus {
  deviceId: string;
  isOnline: boolean;
  lastPingTimestamp: Date;
  reportingFrequency: number;
  operationID: string;
  error?: string;
}
interface receiptStructure {
  receiptLines: any;
  receiptTaxes: any;
  receiptHash: string;
  receiptSale: Sale;
  currentZimraReceiptCounter: string;
  currentZimraGlobalNumber: string;
  deviceIdInt: number;
  payment: PaymentInfo;
}

export async function getZimraCredentials(
  merchantId: string,
  deviceId?: string,
): Promise<ZimraCredentials | ZimraCredentials[] | undefined> {
  try {
    // Get tenant-specific database for this merchant
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      console.error(`Cannot get tenant database for merchant ${merchantId}`);
      return;
    }

    // Query to get all credentials from zimra_credentials table
    // Create the base query
    const query = tenantDB.db.select().from(zimraCredentials);

    // If deviceId is provided, filter by deviceId
    if (deviceId) {
      const results = await query.where(
        eq(zimraCredentials.deviceId, deviceId),
      );

      // Check if any credentials were found
      if (results.length === 0) {
        console.log(`No ZIMRA credentials found for deviceId=${deviceId}`);
        return undefined;
      }

      // Return the specific device credential
      return results[0];
    } else {
      // If no deviceId provided, return all credentials for this merchant
      const results = await query;

      // Check if any credentials were found
      if (results.length === 0) {
        console.log(`No ZIMRA credentials found for merchantId=${merchantId}`);
        return [];
      }

      // Return all credentials as an array
      return results;
    }
  } catch (error) {
    console.error(
      `Error getting ZIMRA credentials for merchant ${merchantId || "unknown"}:`,
      error,
    );
    return undefined;
  }
}

/**
 * Get all ZIMRA credentials for a specific merchant
 */
export async function getAllZimraCredentials(
  merchantId: string,
): Promise<ZimraCredentials[] | undefined> {
  try {
    // Get tenant-specific database for this merchant
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      console.error(`Cannot get tenant database for merchant ${merchantId}`);
      return undefined;
    }

    // Query to get all credentials from zimra_credentials table
    const credentials = await tenantDB.db.select().from(zimraCredentials);

    // Return the array of credentials
    return credentials;
  } catch (error) {
    console.error(
      `Error getting all ZIMRA credentials for merchant ${merchantId}:`,
      error,
    );
    return undefined;
  }
}
//=======================================================================================================================
//CREATE A FUNCTION THAT WILL GENERATE NEW CERTIFICATE DETAILS
export async function generateZimraKeyAndCSR(
  serialNumber: string,
  deviceId: number,
) {
  //generate a function that will get the deviceId length then add some zeros before so that it adds up to 10 digits in total
  const deviceIdString = deviceId.toString();
  const paddedDeviceId = deviceIdString.padStart(10, "0");

  try {
    // Generate EC key pair (prime256v1)
    const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
    console.log("Generated Private Key:", privateKeyPem);
    // Create CSR
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keyPair.publicKey;

    // Set subject attributes
    csr.setSubject([
      {
        name: "commonName",
        value: "ZIMRA-" + serialNumber + "-" + paddedDeviceId,
      },
      {
        name: "countryName",
        value: "ZW",
      },
      {
        name: "organizationName",
        value: "Zimbabwe Revenue Authority",
      },
      {
        name: "stateOrProvinceName",
        value: "Zimbabwe",
      },
    ]);

    // Sign the CSR using SHA-256
    csr.sign(keyPair.privateKey, forge.md.sha256.create());

    // Convert CSR to PEM format
    const csrPem = forge.pki.certificationRequestToPem(csr);
    console.log("Generated CSR:", csrPem);

    // Verify the CSR
    const verified = csr.verify();
    if (!verified) {
      throw new Error("Failed to verify CSR");
    }

    // Output results (in a real app, you'd save these to files)
    return {
      privateKey: privateKeyPem,
      csr: csrPem,
    };
  } catch (error) {
    console.error("Error generating key and CSR:", error);
    throw error;
  }
}
//====================================================================================================================================
/**
 * Ping a ZIMRA device to report its online status
 * @param deviceId The numeric device ID
 * @param myCertificate The device certificate in PEM format
 * @param privateKey The device private key in PEM format
 * @returns Object containing operation ID and reporting frequency
 */
export async function pingZimraDevice(
  deviceId: string,
  myCertificate: string,
  privateKey: string,
): Promise<{
  status: number;
  data: ZimraPingResponse | null;
  message: string;
  error?: string;
  zimraStatus?: string;
}> {
  try {
    // Ensure deviceId is treated as an integer
    const deviceIdInt = parseInt(deviceId, 10);
    if (isNaN(deviceIdInt)) {
      throw new Error("Invalid deviceId: must be a valid integer");
    }

    // Use the correct API URL format
    const apiUrl = `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/ping`;
    // console.log(`Pinging ZIMRA device at: ${apiUrl}`);

    // Prepare headers for the request
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      DeviceModelName: "Server",
      DeviceModelVersion: "v1",
    };

    try {
      // Create an HTTPS agent with the certificate and private key for mTLS
      const httpsAgent = new https.Agent({
        cert: myCertificate,
        key: privateKey,
        rejectUnauthorized: true, // Verify ZIMRA's server certificate
      });

      // Make the request using axios with mTLS authentication
      const pingResponse = await axios.post(
        apiUrl,
        {},
        {
          headers,
          httpsAgent,
          timeout: 15000, // 15 second timeout
        },
      );

      return {
        status: 200,
        data: {
          operationID: pingResponse.data.operationID,
          reportingFrequency: pingResponse.data.reportingFrequency,
        },
        message: "Device ping successful",
      };
    } catch (apiError: any) {
      // Handle common network errors with user-friendly messages

      if (apiError.code === "ECONNABORTED") {
        return {
          status: 408,
          data: null,
          message: "The ZIMRA server connection timed out during ping.",
          error: "Connection timeout",
          zimraStatus: "SERVER_TIMEOUT",
        };
      } else if (apiError.code === "ECONNREFUSED") {
        return {
          status: 503,
          data: null,
          message: "Cannot connect to ZIMRA servers for ping operation.",
          error: "Connection refused",
          zimraStatus: "SERVER_DOWN",
        };
      } else {
        // For other errors, log them and give a generic response
        return {
          status: apiError.response?.status || 500,
          data: null,
          message:
            apiError.response?.data?.message ||
            "ZIMRA service error during ping operation.",
          error: apiError.message,
          zimraStatus: "OTHER_ERROR",
        };
      }
    }
  } catch (error: any) {
    console.error("Error in pingZimraDevice function:", error);
    return {
      status: 500,
      data: null,
      message: "An unexpected error occurred during ping operation.",
      error: error.message,
      zimraStatus: "INTERNAL_ERROR",
    };
  }
}

/**
 * Ping all registered ZIMRA devices to update their status
 * @param merchantId The merchant ID to get all devices for
 * @returns Array of device status objects
 */
export async function pingAllZimraDevices(
  merchantId: string,
): Promise<DeviceStatus[]> {
  try {
    // Get all ZIMRA credentials for this merchant
    const allCredentials = await getAllZimraCredentials(merchantId);
    if (!allCredentials || allCredentials.length === 0) {
      console.log(`No ZIMRA devices found for merchant ${merchantId}`);
      return [];
    }

    // Array to store all device statuses
    const deviceStatuses: DeviceStatus[] = [];

    // Process each device credential in parallel
    const statusPromises = allCredentials.map(async (credential) => {
      if (
        !credential.deviceId ||
        !credential.certificate ||
        !credential.privateKey
      ) {
        console.log(
          `Skipping device with missing credentials: ${credential.id}`,
        );
        return {
          deviceId: credential.deviceId || "unknown",
          isOnline: false,
          lastPingTimestamp: new Date(),
          reportingFrequency: 0,
          operationID: "",
          error: "Missing device credentials",
        };
      }

      // Perform the ping operation
      //run this on condition i have device id
      if (!credential.deviceId) {
        return;
      }
      //s  console.log("Pinging device with ID:", credential.deviceId);
      const pingResult = await pingZimraDevice(
        credential.deviceId,
        credential.certificate,
        credential.privateKey,
      );
      //update the zimra credentials table deviceStatus with the status result from the response
      const tenantDB = await getTenantDB(merchantId);
      if (!tenantDB) {
        console.error(`Cannot get tenant database for merchant ${merchantId}`);
        return;
      }
      await tenantDB.db
        .update(zimraCredentials)
        .set({
          deviceOperatingMode: pingResult.status === 200 ? "Online" : "Offline",
        })
        .where(eq(zimraCredentials.deviceId, credential.deviceId))
        .returning()
        .catch((error) => {
          console.error("Error updating device status:", error);
        });
      // Create a device status object based on the ping result
      const deviceStatus: DeviceStatus = {
        deviceId: credential.deviceId,
        isOnline: pingResult.status === 200,
        lastPingTimestamp: new Date(),
        reportingFrequency: pingResult.data?.reportingFrequency || 5, // Default to 5 minutes if not provided
        operationID: pingResult.data?.operationID || "",
        error: pingResult.error,
      };

      return deviceStatus;
    });

    // Wait for all ping operations to complete
    const results = await Promise.all(statusPromises);

    // Filter out any undefined results
    return results.filter(Boolean) as DeviceStatus[];
  } catch (error) {
    console.error(
      `Error pinging all ZIMRA devices for merchant ${merchantId}:`,
      error,
    );
    return [];
  }
}

//====================================================================================================================================
/**
 * Process and submit receipt(s) to ZIMRA fiscal device
 */
export async function getDeviceConfig(
  deviceId: string,
  myCertificate: string,
  privateKey: string,
) {
  try {
    // Make a request to ZIMRA's getConfig endpoint
    // Ensure deviceId is treated as an integer
    const deviceIdInt = parseInt(deviceId, 10);
    if (isNaN(deviceIdInt)) {
      throw new Error("Invalid deviceId: must be a valid integer");
    }

    // Use the correct API URL format with /api prefix
    const apiUrl = `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/GetConfig`;
    // console.log(`Making request to ZIMRA GetConfig API at: ${apiUrl}`);

    // Prepare headers for the request
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      DeviceModelName: "Server",
      DeviceModelVersion: "v1",
    };

    // console.log("Using headers for ZIMRA GetConfig:", {
    //   ...headers,
    // });

    try {
      // Create an HTTPS agent with the certificate and private key for mTLS
      const httpsAgent = new https.Agent({
        cert: myCertificate,
        key: privateKey,
        rejectUnauthorized: false, // Verify ZIMRA's server certificate
      });

      // Make the request using axios with mTLS authentication with timeout to prevent hanging
      const configResponse = await axios.get(apiUrl, {
        headers,
        httpsAgent,
        timeout: 15000, // 15 second timeout to prevent hanging
      });

      return {
        status: 200,
        data: configResponse.data,
        message: "Device configuration retrieved successfully",
      };
    } catch (apiError: any) {
      // Handle common network errors with user-friendly messages
      console.error("Error getting device config:", apiError);

      if (apiError.code === "ECONNABORTED") {
        return {
          status: 408,
          data: null,
          message:
            "The ZIMRA server connection timed out. Please try again later.",
          error: "Connection timeout",
          zimraStatus: "SERVER_TIMEOUT",
        };
      } else if (apiError.code === "ECONNREFUSED") {
        return {
          status: 503,
          data: null,
          message:
            "Cannot connect to ZIMRA servers. The service might be down or unavailable.",
          error: "Connection refused",
          zimraStatus: "SERVER_DOWN",
        };
      } else if (
        apiError.code === "ECONNRESET" ||
        (apiError.message && apiError.message.includes("socket hang up"))
      ) {
        return {
          status: 503,
          data: null,
          message:
            "Connection to ZIMRA servers was unexpectedly closed. Please try again later.",
          error: "Connection reset",
          zimraStatus: "CONNECTION_RESET",
        };
      } else if (apiError.code === "ETIMEDOUT") {
        return {
          status: 408,
          data: null,
          message:
            "ZIMRA server response timed out. The service might be experiencing high load.",
          error: "Network timeout",
          zimraStatus: "NETWORK_TIMEOUT",
        };
      } else if (apiError.code === "ENETUNREACH") {
        return {
          status: 503,
          data: null,
          message:
            "ZIMRA servers are currently unreachable. Please check your network connection.",
          error: "Network unreachable",
          zimraStatus: "NETWORK_UNREACHABLE",
        };
      } else if (apiError.response && apiError.response.status === 401) {
        return {
          status: 401,
          data: null,
          message:
            "Authentication with ZIMRA server failed. Please check your device credentials.",
          error: "Authentication failed",
          zimraStatus: "AUTH_FAILED",
        };
      } else if (apiError.response && apiError.response.status === 429) {
        return {
          status: 429,
          data: null,
          message: "ZIMRA server rate limit exceeded. Please try again later.",
          error: "Rate limit exceeded",
          zimraStatus: "RATE_LIMITED",
        };
      } else {
        // For other errors, log them and give a generic response
        return {
          status: apiError.response?.status || 500,
          data: null,
          message:
            apiError.response?.data?.message ||
            "ZIMRA service error. Please try again later.",
          error: apiError.message,
          zimraStatus: "OTHER_ERROR",
        };
      }
    }
  } catch (configError: any) {
    console.error("Error in getDeviceConfig function:", configError);
    return {
      status: 500,
      data: null,
      message: "An unexpected error occurred while processing your request.",
      error: configError.message,
      zimraStatus: "INTERNAL_ERROR",
    };
  }
}
//===================================================================================================================
export async function getDeviceStatusFromZimra(
  deviceId: string,
  myCertificate: string,
  privateKey: string,
  merchantId: string,
  zimraCredentialsResponse?: any,
  isCloseDay: boolean,
) {
  try {
    // Make a request to ZIMRA's getConfig endpoint
    // Ensure deviceId is treated as an integer
    const deviceIdInt = parseInt(deviceId, 10);
    if (isNaN(deviceIdInt)) {
      throw new Error("Invalid deviceId: must be a valid integer");
    }

    // Use the correct API URL format with /api prefix
    const apiUrl = `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/GetStatus`;

    // Prepare headers for the request
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      DeviceModelName: "Server",
      DeviceModelVersion: "v1",
    };
    let fiscalDayStatus;

    try {
      // Create an HTTPS agent with the certificate and private key for mTLS
      const httpsAgent = new https.Agent({
        cert: myCertificate,
        key: privateKey,
        rejectUnauthorized: true, // Verify ZIMRA's server certificate
      });

      // Make the request using axios with mTLS authentication with timeout to prevent hanging
      const configResponse = await axios.get(apiUrl, {
        headers,
        httpsAgent,
        // timeout: 15000, // 15 second timeout to prevent hanging
      });

      //IF THE STATUS IS 200, AND ALSO THE DAY IS CLOSED, CALL THE OPEN DAY FUNCTION
      fiscalDayStatus = configResponse.data.fiscalDayStatus;
      // console.log("FISCAL DAY STATUS: ", configResponse);
      let fiscalDayNo = configResponse.data.lastFiscalDayNo; //OTHERWISE IT WILL BE UPDATED AFTER OPENING THE DAY
      if (fiscalDayStatus === "FiscalDayClosed" && isCloseDay === false) {
        //TO ENSURE THAT THE DAY STATUS WAS NOT CALLED BECAUSE OF CLOSING DAY EVENT
        //GET THE PREVIOUS DAY NUMBER FROM THE ZIMRA CREDENTIALS TABLE
        let lastFiscalDayNo = configResponse.data.lastFiscalDayNo; //zimraCredentialsResponse.zimraFiscalDayNo
        if (!lastFiscalDayNo) {
          lastFiscalDayNo = Number(zimraCredentialsResponse.zimraFiscalDayNo);
        }
        // console.log("OPENING DAY: ", lastFiscalDayNo);
        const openDayResponse = await openDayOnZimra(
          deviceId,
          merchantId,
          lastFiscalDayNo,
          zimraCredentialsResponse,
        );

        if (openDayResponse?.status === 200) {
          fiscalDayStatus = "FiscalDayOpened";
          // console.log(typeof openDayResponse.fiscalDayNo);
          fiscalDayNo = Number(openDayResponse.fiscalDayNo);
        }
      } else {
        fiscalDayStatus;
        //ALSO MAKESURE TO UPDATE THE ZIMRA CREDENTIALS TABLE WITH THE STATUS {this will avoid the code to continously loop of innitialisation of day, just incase ZIMRA is down}}
        const tenantDB = await getTenantDB(merchantId);
        if (!tenantDB) {
          console.error(
            `Cannot get tenant database for merchant ${merchantId}`,
          );
          return;
        }
        await tenantDB.db
          .update(zimraCredentials)
          .set({
            zimraFiscalDayStatus: fiscalDayStatus,
          })
          .where(eq(zimraCredentials.deviceId, deviceId))
          .returning();
      }

      //DO NOT CALL DAY HERE
      return {
        status: 200,
        data: configResponse.data,
        fiscalDayStatus: fiscalDayStatus,
        fiscalDayNo: fiscalDayNo,
        message: "Device configuration retrieved successfully",
      };
    } catch (apiError: any) {
      // Handle common network errors with user-friendly messages
      console.error("Error getting device status:", apiError);

      if (apiError.code === "ECONNABORTED") {
        return {
          status: 408,
          data: null,
          message:
            "The ZIMRA server connection timed out. Please try again later.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Connection timeout",
          zimraStatus: "SERVER_TIMEOUT",
        };
      } else if (apiError.code === "ECONNREFUSED") {
        return {
          status: 503,
          data: null,
          message:
            "Cannot connect to ZIMRA servers. The service might be down or unavailable.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Connection refused",
          zimraStatus: "SERVER_DOWN",
        };
      } else if (
        apiError.code === "ECONNRESET" ||
        (apiError.message && apiError.message.includes("socket hang up"))
      ) {
        return {
          status: 503,
          data: null,
          message:
            "Connection to ZIMRA servers was unexpectedly closed. Please try again later.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Connection reset",
          zimraStatus: "CONNECTION_RESET",
        };
      } else if (apiError.code === "ETIMEDOUT") {
        return {
          status: 408,
          data: null,
          message:
            "ZIMRA server response timed out. The service might be experiencing high load.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Network timeout",
          zimraStatus: "NETWORK_TIMEOUT",
        };
      } else if (apiError.code === "ENETUNREACH") {
        return {
          status: 503,
          data: null,
          message:
            "ZIMRA servers are currently unreachable. Please check your network connection.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Network unreachable",
          zimraStatus: "NETWORK_UNREACHABLE",
        };
      } else if (apiError.response && apiError.response.status === 401) {
        return {
          status: 401,
          data: null,
          message:
            "Authentication with ZIMRA server failed. Please check your device credentials.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Authentication failed",
          zimraStatus: "AUTH_FAILED",
        };
      } else if (apiError.response && apiError.response.status === 429) {
        return {
          status: 429,
          data: null,
          message: "ZIMRA server rate limit exceeded. Please try again later.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: "Rate limit exceeded",
          zimraStatus: "RATE_LIMITED",
        };
      } else {
        // For other errors, log them and give a generic response
        return {
          status: apiError.response?.status || 500,
          data: null,
          message:
            apiError.response?.data?.message ||
            "ZIMRA service error. Please try again later.",
          fiscalDayStatus: fiscalDayStatus,
          fiscalDayNo: null,
          error: apiError.message,
          zimraStatus: "OTHER_ERROR",
        };
      }
    }
  } catch (configError: any) {
    console.error("Error in getDeviceConfig function:", configError);
    return {
      status: 500,
      data: null,
      message: "An unexpected error occurred while processing your request.",
      fiscalDayStatus: "",
      fiscalDayNo: null,
      error: configError.message,
      zimraStatus: "INTERNAL_ERROR",
    };
  }
}

/**
 * Get the status of a ZIMRA fiscal device
 */
export async function openDayOnZimra(
  deviceId: string,
  merchantId: string,
  lastFiscalDayNo: number,
  zimraCredentialsResponse: any,
) {
  try {
    console.log("OPENING DAY ON ZIMRA WITH DEVICE ID: ", deviceId);
    //SINCE THIS PROCCESS IS ASYNCHRONOUS, WE NEED TO ENSURE THAT THERE ARE NO OTHER INVOICES THAT WILL COME WHILE THE SYSTEM IS BUSY OPENING DAY SO TO DO THIS, UPDATE THE ZIMRA CREDENTIALS TABLE WITH THE STATUS "FiscalDayInitiated"
    const tenantDB = await getTenantDB(merchantId);
    if (tenantDB) {
      await tenantDB.db
        .update(zimraCredentials)
        .set({
          zimraFiscalDayStatus: "FiscalDayInitiated",
        })
        .where(eq(zimraCredentials.deviceId, deviceId))
        .returning();
    }

    if (!deviceId) {
      return;
    }
    // Ensure deviceId is treated as an integer
    const deviceIdInt = parseInt(deviceId, 10);
    if (isNaN(deviceIdInt)) {
      throw new Error("Invalid deviceId: must be a valid integer");
    }

    // Use the correct API URL format with
    const apiUrl = `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/OpenDay`;
    // console.log(`Making request to ZIMRA OPEN DAY: ${apiUrl}`);

    try {
      //GET THE FISCAL DAY NUMBER FROM THE ZIMRA CREDENTIALS TABLE,IF ITS NULL SET IT TO 1 ELSE TAKE WHATS THERE
      // const zimraCredentialsResponse = await getZimraCredentials(merchantId);
      if (!zimraCredentialsResponse) {
        console.error(`ZIMRA credentials not found for deviceId=${deviceId}`);
        return {
          success: false,
          message: "ZIMRA credentials not found",
        };
      }
      let fiscalDayNo = lastFiscalDayNo + 1; //THE SOON AFTER SAVE TO THE DATABASE

      let myCertificate = zimraCredentialsResponse.certificate; // THIS SHOULD BE VALIDATED BY LOOKING AT THE EXPIRY DATE
      let privateKey = zimraCredentialsResponse.privateKey;

      //CHECK IF THE CERTIFICATE IS EXPIRED
      // Assuming zimraCredentialsResponse is a variable holding the ZIMRA credentials
      let certificateExpiryDate;
      const certificateExpiryValue =
        zimraCredentialsResponse.certificateValidTill;

      if (certificateExpiryValue !== null) {
        certificateExpiryDate = new Date(certificateExpiryValue);
        // Use certificateExpiryDate as needed
        const currentDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
        if (certificateExpiryDate < currentDate) {
          // console.log("Certificate has expired");
          let serialNumber = zimraCredentialsResponse.deviceSerialNo;

          //GENERATE A NEW CERTIFICATE
          const newCertificate = await generateZimraKeyAndCSR(
            serialNumber,
            deviceId,
          );
          myCertificate = newCertificate.csr;
          privateKey = newCertificate.privateKey;
          //UPDATE THE DATABASE WITH THE NEW CERTIFICATE AND PRIVATE KEY
          const tenantDB = await getTenantDB(merchantId);
          if (!tenantDB) {
            console.error(
              `Cannot get tenant database for merchant ${merchantId}`,
            );
            return;
          }
          await tenantDB.db
            .update(zimraCredentials)
            .set({
              certificate: myCertificate,
              privateKey: privateKey,
            })
            .where(eq(zimraCredentials.deviceId, deviceId))
            .returning();
        }
      } else {
        console.error("Certificate expiry date is null");
        // Handle the null case appropriately
      }

      //VERIFY IF THESE VARIABLES ARE NOT NULL
      if (!myCertificate || !privateKey) {
        return;
      }
      // Create an HTTPS agent with the certificate and private key for mTLS
      const httpsAgent = new https.Agent({
        cert: myCertificate,
        key: privateKey,
        rejectUnauthorized: true, // Verify ZIMRA's server certificate
      });

      //get the fiscal day number from the zimra credentials table,if its null set it to 1 else take whats there
      // Make the request using axios with mTLS authentication with timeout to prevent hanging
      const openDayResponse = await axios.post(
        apiUrl,
        {
          fiscalDayNo: fiscalDayNo, //THIS SHOULD BE EXTRACTED FROM THE DATABASE (currently taking it from the device status response)
          fiscalDayOpened: new Date().toISOString().slice(0, 19),
        },
        {
          // Set DeviceModelName and DeviceModelVersion as headers
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            DeviceModelName: "Server",
            DeviceModelVersion: "v1",
          },
          httpsAgent,
        },
      );
      // Use a delay to wait before checking status and getting config, in production things delay a bit
      await new Promise((resolve) => setTimeout(resolve, 60000));
      //save the open date in database if the response is successful,update in the zimra_credentials table
      if (openDayResponse.status === 200) {
        const tenantDB = await getTenantDB(merchantId);
        if (!tenantDB) {
          console.error(
            `Cannot get tenant database for merchant ${merchantId}`,
          );
          return;
        }
        const currentDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

        await tenantDB.db
          .update(zimraCredentials)
          .set({
            zimraFiscalDayNo: fiscalDayNo.toString(), //SOON AFTER OPENING THE DAY SUCCESSFULLY, SAVE IT TO THE DATABASE
            zimraFiscalOpenedDate: currentDate.toISOString().slice(0, 19), //KEEP THE DATE AND TIME OF WHEN THE DAY WAS OPENED
            nextZimraReceiptCounter: "1", //RECEIPT COUNTER SHOULD BE SET TO 1 WHEN THE DAY IS OPENED
            receiptHash: "",
            zimraFiscalDayStatus: "FiscalDayOpened", // SO THAT RECEIPTS MADE WHILE THE OPENING DAY  CAN BE SUBMITTED
          })
          .where(sql`${zimraCredentials.deviceId} = ${deviceId}`)
          .returning();
        //NOW GET CONFIG OF THE DEVICE
        const configResponse = await getDeviceConfig(
          deviceId,
          myCertificate,
          privateKey,
        );

        if (configResponse.status === 200) {
          //now update the zimra credentials with the response
          const tenantDB = await getTenantDB(merchantId);
          if (!tenantDB) {
            console.error(
              `Cannot get tenant database for merchant ${merchantId}`,
            );
            return;
          }
          try {
            const updateResult = await tenantDB.db
              .update(zimraCredentials)
              .set({
                taxPayerName: configResponse.data.taxPayerName,
                taxPayerTIN: configResponse.data.taxPayerTIN,
                vatNumber: configResponse.data.vatNumber,
                deviceSerialNo: configResponse.data.deviceSerialNo,
                //deviceBranchName: configResponse.data.deviceBranchName,
                deviceBranchAddress: configResponse.data.deviceBranchAddress,
                deviceBranchContacts: configResponse.data.deviceBranchContacts,
                deviceOperatingMode: configResponse.data.deviceOperatingMode,
                taxPayerDayMaxHrs: configResponse.data.taxPayerDayMaxHrs,
                applicableTaxes: configResponse.data.applicableTaxes,
                certificateValidTill: configResponse.data.certificateValidTill,
                qrUrl: configResponse.data.qrUrl,
                taxpayerDayEndNotificationHrs:
                  configResponse.data.taxpayerDayEndNotificationHrs,
              })
              .where(sql`${zimraCredentials.deviceId} = ${deviceId}`)
              .returning();
            console.log(
              "Day Opening Done, The wait is over continue submiting invoices",
            );

            if (!updateResult || updateResult.length === 0) {
              console.error(`No records updated for deviceId=${deviceId}`);
              return {
                status: 404,
                data: null,
                message: "No matching device found to update",
              };
            }
          } catch (error) {
            console.error("Error updating ZIMRA credentials:", error);
            throw error;
          }
        }
      }
      return {
        status: 200,
        data: openDayResponse.data,
        fiscalDayNo: fiscalDayNo,
        message: "Device day opened successfully",
      };
    } catch (apiError: any) {
      // Handle common network errors with user-friendly messages
      console.error("Error opening day:", apiError);
      //ALSO MAKESURE TO UPDATE THE ZIMRA CREDENTIALS TABLE WITH THE STATUS {this will avoid the code to continously loop of innitialisation of day, just incase ZIMRA is down}}
      const tenantDB = await getTenantDB(merchantId);
      if (tenantDB) {
        await tenantDB.db
          .update(zimraCredentials)
          .set({
            zimraFiscalDayStatus: "",
          })
          .where(eq(zimraCredentials.deviceId, deviceId))
          .returning();
      }

      if (apiError.code === "ECONNABORTED") {
        return {
          status: 408,
          data: null,
          message:
            "The ZIMRA server connection timed out. Please try again later.",
          error: "Connection timeout",
          zimraStatus: "SERVER_TIMEOUT",
        };
      } else if (apiError.code === "ECONNREFUSED") {
        return {
          status: 503,
          data: null,
          message:
            "Cannot connect to ZIMRA servers. The service might be down or unavailable.",
          error: "Connection refused",
          zimraStatus: "SERVER_DOWN",
        };
      } else if (
        apiError.code === "ECONNRESET" ||
        (apiError.message && apiError.message.includes("socket hang up"))
      ) {
        return {
          status: 503,
          data: null,
          message:
            "Connection to ZIMRA servers was unexpectedly closed. Please try again later.",
          error: "Connection reset",
          zimraStatus: "CONNECTION_RESET",
        };
      } else if (apiError.code === "ETIMEDOUT") {
        return {
          status: 408,
          data: null,
          message:
            "ZIMRA server response timed out. The service might be experiencing high load.",
          error: "Network timeout",
          zimraStatus: "NETWORK_TIMEOUT",
        };
      } else if (apiError.code === "ENETUNREACH") {
        return {
          status: 503,
          data: null,
          message:
            "ZIMRA servers are currently unreachable. Please check your network connection.",
          error: "Network unreachable",
          zimraStatus: "NETWORK_UNREACHABLE",
        };
      } else if (apiError.response && apiError.response.status === 401) {
        return {
          status: 401,
          data: null,
          message:
            "Authentication with ZIMRA server failed. Please check your device credentials.",
          error: "Authentication failed",
          zimraStatus: "AUTH_FAILED",
        };
      } else if (apiError.response && apiError.response.status === 429) {
        return {
          status: 429,
          data: null,
          message: "ZIMRA server rate limit exceeded. Please try again later.",
          error: "Rate limit exceeded",
          zimraStatus: "RATE_LIMITED",
        };
      } else {
        // For other errors, log them and give a generic response
        return {
          status: apiError.response?.status || 500,
          data: null,
          message:
            apiError.response?.data?.message ||
            "ZIMRA service error. Please try again later.",
          error: apiError.message,
          zimraStatus: "OTHER_ERROR",
        };
      }
    }
  } catch (configError: any) {
    console.error("Error in getDeviceConfig function:", configError);
    return {
      status: 500,
      data: null,
      message: "An unexpected error occurred while processing your request.",
      error: configError.message,
      zimraStatus: "INTERNAL_ERROR",
    };
  }
}
//====================================================================================================================================
/**
 * Implementation function that handles the actual ZIMRA API call
 */
export async function closeDayOnZimra(
  merchantId: string,
  deviceId: string,
  manualClosure: boolean,
) {
  try {
    // Validate deviceId is a number
    const deviceIdInt = parseInt(deviceId, 10);
    if (isNaN(deviceIdInt)) {
      throw new Error("Invalid deviceId: must be a valid integer");
    }

    // Get ZIMRA credentials
    const credential2 = await getZimraCredentials(merchantId);
    if (!credential2) {
      return;
    }
    let zimraCredentialsResponse: any;
    if (Array.isArray(credential2) && credential2.length > 1) {
      zimraCredentialsResponse = credential2.find(
        (cred) => cred.deviceId === deviceId,
      );
    } else {
      zimraCredentialsResponse = Array.isArray(credential2)
        ? credential2[0]
        : credential2;
    }
    if (!zimraCredentialsResponse) {
      return {
        success: false,
        message: "ZIMRA credentials not found",
      };
    }
    // Validate required fields
    const requiredFields = [
      "zimraFiscalOpenedDate",
      "zimraFiscalDayNo",
      "certificate",
      "privateKey",
      "nextZimraReceiptCounter",
    ];

    const missingFields = requiredFields.filter(
      (field) => !zimraCredentialsResponse[field],
    );
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Check if day should be closed (after 10pm or open for >24 hours)
    const fiscalOpenDate = new Date(
      zimraCredentialsResponse.zimraFiscalOpenedDate,
    );
    // console.log("Fiscal Open Date ", fiscalOpenDate);
    const currentDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    //  console.log("Current Date ", currentDate);
    const dayHours =
      (currentDate.getTime() - fiscalOpenDate.getTime()) / (1000 * 60 * 60);
    const currentHour = currentDate.getHours();
    //WE ONLY CLOSE THE ON THESE CONDITIONS
    console.log("Day Hours ", Math.floor(dayHours));
    // console.log("Day minutes ", (dayHours * 60).toFixed(2))

    if (dayHours >= 23 || manualClosure === true) {
      //continue to close the day

      // Get device status from ZIMRA
      let isCloseDay = false;
      let deviceStatusResponse = await getDeviceStatusFromZimra(
        deviceId,
        zimraCredentialsResponse.certificate,
        zimraCredentialsResponse.privateKey,
        merchantId,
        zimraCredentialsResponse,
        isCloseDay, //THIS IS TO ENSURE THAT THE DAY STATUS WAS NOT CALLED BECAUSE OF CLOSING DAY EVENT
      );

      if (!deviceStatusResponse?.data) {
        console.log("Failed to get device status from ZIMRA");
        return; //return silently, so that ther close day be retried also silently
      }
      console.log("Device Status Response", deviceStatusResponse);
      let fiscalDayNo = deviceStatusResponse.data.lastFiscalDayNo; //THIS LOGIC NEED CHANGING, MAKE SIMILA TO HOW WE DID ON SUBMIT RECEIPT
      // Get all receipts for this fiscal day and for this current device
      const tenantDB = await getTenantDB(merchantId);
      if (!tenantDB) {
        throw new Error(
          `Cannot get tenant database for merchant ${merchantId}`,
        );
      }
      //UPDATE THE ZIMRA CREDENTIALS WITH THE STATUS "FiscalDayInnitiated"
      await tenantDB.db
        .update(zimraCredentials)
        .set({
          zimraFiscalDayStatus: "FiscalDayInitiated",
        })
        .where(eq(zimraCredentials.deviceId, deviceId))
        .returning();

      //BEFORE CLOSING DAY, ATTEMPT TO RESUBMIT THE PENDING OFFLINE FAILED RECEIPTS
      // const failedReceipts = await tenantDB.db
      //   .select()
      //   .from(schema.failedReceipts)
      //   .where(sql`${schema.failedReceipts.zimraDeviceId} = ${deviceId}`)
      //   .execute();

      const httpsAgent = new https.Agent({
        cert: zimraCredentialsResponse.certificate,
        key: zimraCredentialsResponse.privateKey,
        rejectUnauthorized: true,
      });
      //CALL THE RESUBMIT FUNCTION
      // if (failedReceipts.length > 0) {
      //   // //sort the array by receipt global number
      //   // failedReceipts.sort((a, b) => {
      //   //   return Number(a.receiptGlobalNo) - Number(b.receiptGlobalNo);
      //   // });
      //   // //WE WILL RARELY SEE THIS AS ALL FAILED INVOICES ARE ATIMES RETRIED DURING RECEIPT SUBMISSION
      //   // await resubmitPendingInvoices(failedReceipts, httpsAgent, tenantDB);
      // }

      //THEN TAKE ALL RECEIPTS FOR CLOSING DAY COMPILATION
      const receipts = await tenantDB.db
        .select()
        .from(sales)
        .where(
          sql`${sales.zimraFiscalDayNo} = ${fiscalDayNo} AND ${sales.zimraDeviceId} = ${deviceId}`,
        )
        .execute();
      console.log(
        "We haveeeeeeeeeeeeeeeeeeeeeeee ",
        receipts.length,
        " Receipts ",
      );
      // Process receipts to create fiscalDaycounters
      //the system should loop in all receipts getting the totals and data for each day counter
      const fiscalDayCounters: any[] = [];

      // Group all tax types across all receipts
      const taxTypes = ["VAT", "EXEMPT", "ZERO RATED", "WITHOLD VAT"];
      interface Tax {
        taxName: string;
        taxID: number;
        taxCode: string;
        taxPercent: number;
      }
      // Get all currencies used in receipts for the purpose of fiscalCounterType
      const currencySet = new Set<string>();
      let paymentByMoneyTypeArray = [];
      for (const receipt of receipts) {
        paymentByMoneyTypeArray.push(receipt.payments);
        currencySet.add(receipt.payments[0].currency?.toUpperCase());
      }
      const currencies = Array.from(currencySet);
      let dddUSDCash = 0.0;
      let dddUSDCard = 0.0;
      let dddUSDMobileWallet = 0.0;
      let dddUSDCredit = 0.0;
      let dddUSDBankTransfer = 0.0;
      let dddUSDOther = 0.0;

      let dddZWGCash = 0.0;
      let dddZWGCard = 0.0;
      let dddZWGMobileWallet = 0.0;
      let dddZWGCredit = 0.0;
      let dddZWGBankTransfer = 0.0;
      let dddZWGOther = 0.0;

      let dddUSDCR = 0.0;
      let dddZWGCR = 0.0;
      // console.log("Found currencies:", currencies);
      // First, sort all taxes by taxID and assign letter codes
      const sortedTaxes = [...zimraCredentialsResponse.applicableTaxes]
        .sort((a, b) => a.taxID - b.taxID)
        .map((tax, index) => ({
          ...tax,
          taxCode: String.fromCharCode(65 + index), // 65 = 'A' in ASCII
        }));
      // For each combination of tax type and currency, create a counter
      for (const taxType of taxTypes) {
        for (const currency of currencies) {
          //loop the zimraCredentialsResponse.applicableTaxes to get the taxID, taxCode, taxPercent
          // Get tax configuration for this tax type
          let taxConfig = {
            taxName: "",
            taxID: 0,
            taxCode: "",
            taxPercent: 0,
          };

          const searchTerm = taxType.toLowerCase().trim();

          // Find the tax where the name matches flexibly (case-insensitive + partial match)
          // Explicit keyword-to-tax-name mapping
          let matchedTax;
          if (searchTerm.includes("vat")) {
            // For "VAT" to match "Standard rated 15%"
            matchedTax = sortedTaxes.find((tax: Tax) =>
              tax.taxName.toLowerCase().includes("standard"),
            );
          } else if (searchTerm.includes("exempt")) {
            matchedTax = sortedTaxes.find((tax: Tax) =>
              tax.taxName.toLowerCase().includes("exempt"),
            );
          } else if (searchTerm.includes("zero")) {
            matchedTax = sortedTaxes.find((tax: Tax) =>
              tax.taxName.toLowerCase().includes("zero"),
            );
          } else if (searchTerm.includes("withhold")) {
            matchedTax = sortedTaxes.find((tax: Tax) =>
              tax.taxName.toLowerCase().includes("withhold"),
            );
          }

          // Update taxConfig if a match is found
          if (matchedTax) {
            taxConfig = {
              taxName: matchedTax.taxName,
              taxID: matchedTax.taxID,
              taxCode: matchedTax.taxCode || "",
              taxPercent: matchedTax.taxPercent || 0,
            };
          }
          // FILTER RECEIPTS WITH this tax type and currency FOR THE PURPOSE OF SALE BY TAX AND SALE TAX BY TAX COUNTERS
          const receiptsWithThisTax = receipts.filter((receipt) => {
            if (taxType === "ZERO RATED") {
              return (
                receipt.payments &&
                receipt.payments.length > 0 &&
                receipt.payments[0].currency.toUpperCase() === currency &&
                receipt.items.some(
                  (item) =>
                    (item.taxDetails &&
                      item.taxDetails.some(
                        (taxDetail) => taxDetail.taxName === taxType,
                      )) ||
                    item.taxDetails.some(
                      (taxDetail) => taxDetail.taxName === "",
                    ),
                )
              );
            } else {
              return (
                receipt.payments &&
                receipt.payments.length > 0 &&
                receipt.payments[0].currency.toUpperCase() === currency &&
                receipt.items.some(
                  (item) =>
                    item.taxDetails &&
                    item.taxDetails.some(
                      (taxDetail) => taxDetail.taxName === taxType,
                    ),
                )
              );
            }
          });

          // Skip if no receipts with this tax type and currency
          if (receiptsWithThisTax.length === 0) {
            continue;
          }

          // Calculate VAT AMOUNT ONLY
          let totalTaxValue = 0.0;
          let totalTaxValueCR = 0.0;
          let totalCounterValue = 0.0;
          let totalCounterValueCR = 0.0;
          // Go through each receipt and extract the counters that are found in the receipt line items
          for (const receipt of receiptsWithThisTax) {
            //Calculate SaleByTax total Values
            for (const item of receipt.items) {
              let taxDetail = null;
              if (taxType === "ZERO RATED") {
                taxDetail =
                  item.taxDetails &&
                  item.taxDetails.find(
                    (taxDetail) =>
                      taxDetail.taxName === taxType || taxDetail.taxName === "",
                  );
                if (taxDetail && receipt.receiptType === "FiscalInvoice") {
                  totalCounterValue =
                    totalCounterValue + Number(item.totalInc.toFixed(2)); //THIS HAS ROUNED AMOUNT
                } else if (taxDetail && receipt.receiptType === "CreditNote") {
                  totalCounterValueCR =
                    totalCounterValueCR + Number(item.totalInc.toFixed(2)); //THIS HAS ROUNED AMOUNT
                }
              } else if (taxType !== "ZERO RATED") {
                taxDetail =
                  item.taxDetails &&
                  item.taxDetails.find(
                    (taxDetail) => taxDetail.taxName === taxType,
                  );
                if (taxDetail && receipt.receiptType === "FiscalInvoice") {
                  totalCounterValue =
                    totalCounterValue + Number(item.totalInc.toFixed(2)); //THIS HAS ROUNED AMOUNT
                } else if (taxDetail && receipt.receiptType === "CreditNote") {
                  totalCounterValueCR =
                    totalCounterValueCR + Number(item.totalInc.toFixed(2)); //THIS HAS ROUNED AMOUNT
                }
              }
            }
            // Calculate SaleTaxByTax total Values
            if (receipt.receiptType === "FiscalInvoice") {
              totalTaxValue = totalTaxValue + Number(receipt?.vatAmount); //THIS HAS EXACT NON ROUNED AMOUNT
            } else if (receipt.receiptType === "CreditNote") {
              totalTaxValueCR = totalTaxValueCR + Number(receipt?.vatAmount); //THIS HAS ROUNED AMOUNT
            }
          }
          console.log(
            receiptsWithThisTax.length,
            " Receipts With a tax type ",
            taxType,
          );

          //INVOICE Counters
          if (totalCounterValue > 0) {
            if (taxConfig.taxName.toLowerCase().includes("standard")) {
              //PUSH SaleByTax
              fiscalDayCounters.push({
                fiscalCounterType: "SaleByTax",
                fiscalCounterCurrency: currency,
                fiscalCounterTaxPercent: Number(
                  parseFloat(taxConfig.taxPercent.toFixed(2)),
                ),
                fiscalCounterTaxID: taxConfig.taxID,
                fiscalCounterValue: Number(
                  parseFloat(totalCounterValue.toFixed(2)),
                ),
              });
            } else {
              if (taxConfig.taxName.toLowerCase().includes("exempt")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "SaleByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: null,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalCounterValue.toFixed(2)),
                  ),
                });
              }
              if (taxConfig.taxName.toLowerCase().includes("zero")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "SaleByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: 0.0,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalCounterValue.toFixed(2)),
                  ),
                });
              }
            }
            //PUSH SaleTaxByTax
            if (totalTaxValue > 0) {
              if (taxConfig.taxName.toLowerCase().includes("standard")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "SaleTaxByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: taxConfig.taxPercent,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalTaxValue.toFixed(2)),
                  ),
                });
              }
            }
          }
          //CREDIT NOTE Counters
          if (totalCounterValueCR < 0) {
            if (taxConfig.taxName.toLowerCase().includes("standard")) {
              //PUSH SaleByTax
              fiscalDayCounters.push({
                fiscalCounterType: "CreditNoteByTax",
                fiscalCounterCurrency: currency,
                fiscalCounterTaxPercent: Number(
                  parseFloat(taxConfig.taxPercent.toFixed(2)),
                ),
                fiscalCounterTaxID: taxConfig.taxID,
                fiscalCounterValue: Number(
                  parseFloat(totalCounterValueCR.toFixed(2)),
                ),
              });
            } else {
              if (taxConfig.taxName.toLowerCase().includes("exempt")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "CreditNoteByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: null,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalCounterValueCR.toFixed(2)),
                  ),
                });
              }
              if (taxConfig.taxName.toLowerCase().includes("zero")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "CreditNoteByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: 0.0,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalCounterValueCR.toFixed(2)),
                  ),
                });
              }
            }
            //PUSH CreditNoteTaxByTax
            if (totalTaxValueCR < 0) {
              if (taxConfig.taxName.toLowerCase().includes("standard")) {
                fiscalDayCounters.push({
                  fiscalCounterType: "CreditNoteTaxByTax",
                  fiscalCounterCurrency: currency,
                  fiscalCounterTaxPercent: taxConfig.taxPercent,
                  fiscalCounterTaxID: taxConfig.taxID,
                  fiscalCounterValue: Number(
                    parseFloat(totalTaxValueCR.toFixed(2)),
                  ),
                });
              }
            }
          }
        }
      }
      // For each currency, create a BalanceByMoney type counter
      for (const currency of currencies) {
        //for each currency reloop within paymentByMoneyTypeArray to get the total for each money type
        for (const payment of paymentByMoneyTypeArray) {
          if (payment[0].currency === currency) {
            if (payment[0].type === "Cash" || !payment[0].type) {
              if (currency === "USD") {
                dddUSDCash = dddUSDCash + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGCash = dddZWGCash + payment[0].amount;
              }
            }
            if (payment[0].type === "Card") {
              if (currency === "USD") {
                dddUSDCard = dddUSDCard + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGCard = dddZWGCard + payment[0].amount;
              }
            }
            if (payment[0].type === "MobileWallet") {
              if (currency === "USD") {
                dddUSDMobileWallet = dddUSDMobileWallet + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGMobileWallet = dddZWGMobileWallet + payment[0].amount;
              }
            }
            if (payment[0].type === "Credit") {
              if (currency === "USD") {
                dddUSDCredit = dddUSDCredit + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGCredit = dddZWGCredit + payment[0].amount;
              }
            }
            if (payment[0].type === "BankTransfer") {
              if (currency === "USD") {
                dddUSDBankTransfer = dddUSDBankTransfer + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGBankTransfer = dddZWGBankTransfer + payment[0].amount;
              }
            }
            if (payment[0].type === "Other") {
              if (currency === "USD") {
                dddUSDOther = dddUSDOther + payment[0].amount;
              } else if (currency === "ZWG") {
                dddZWGOther = dddZWGOther + payment[0].amount;
              }
            }
          }
        }
      }

      //..............................................................
      //USD BalanceByMoneyType
      //PUSH BalanceByMoneyType For Cash
      if (dddUSDCash > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Cash",
          fiscalCounterValue: Number(parseFloat(dddUSDCash.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Card
      if (dddUSDCard > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Card",
          fiscalCounterValue: Number(parseFloat(dddUSDCard.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For MobileWallet
      if (dddUSDMobileWallet > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "MobileWallet",
          fiscalCounterValue: Number(parseFloat(dddUSDMobileWallet.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Credit
      if (dddUSDCredit > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Credit",
          fiscalCounterValue: Number(parseFloat(dddUSDCredit.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For BankTransfer
      if (dddUSDBankTransfer > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "BankTransfer",
          fiscalCounterValue: Number(parseFloat(dddUSDBankTransfer.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Other
      if (dddUSDOther > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "USD",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Other",
          fiscalCounterValue: Number(parseFloat(dddUSDOther.toFixed(2))),
        });
      }
      //...............................................................................
      //ZWG BalanceByMoneyType
      //PUSH BalanceByMoneyType For Cash
      if (dddZWGCash > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Cash",
          fiscalCounterValue: Number(parseFloat(dddZWGCash.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Card
      if (dddZWGCard > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Card",
          fiscalCounterValue: Number(parseFloat(dddZWGCard.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For MobileWallet
      if (dddZWGMobileWallet > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "MobileWallet",
          fiscalCounterValue: Number(parseFloat(dddZWGMobileWallet.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Credit
      if (dddZWGCredit > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Credit",
          fiscalCounterValue: Number(parseFloat(dddZWGCredit.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For BankTransfer
      if (dddZWGBankTransfer > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "BankTransfer",
          fiscalCounterValue: Number(parseFloat(dddZWGBankTransfer.toFixed(2))),
        });
      }
      //PUSH BalanceByMoneyType For Other
      if (dddZWGOther > 0) {
        fiscalDayCounters.push({
          fiscalCounterType: "BalanceByMoneyType",
          fiscalCounterCurrency: "ZWG",
          fiscalCounterTaxID: null, //taxConfig.taxID,
          fiscalCounterMoneyType: "Other",
          fiscalCounterValue: Number(parseFloat(dddZWGOther.toFixed(2))),
        });
      }

      // Format fiscal day date exactly as YYYY-MM-DD as required by ZIMRA
      const fiscalOpenedDateObj = new Date(
        zimraCredentialsResponse.zimraFiscalOpenedDate,
      );
      //today date
      const fiscalDayDateFormatted = fiscalOpenedDateObj
        .toISOString()
        .split("T")[0]; // Get only YYYY-MM-DD part

      // Generate hash and signature
      const { hash, signature } = await generateCloseDayHash(
        fiscalDayCounters,
        deviceId,
        zimraCredentialsResponse.privateKey,
        fiscalDayNo.toString(), // Use the fiscalDayNo from device status, ensure it's a string
        fiscalDayDateFormatted, // Use the correctly formatted date
      );

      const closeDayRequest: any = {
        fiscalDayNo: Number(fiscalDayNo),
        fiscalDayCounters: fiscalDayCounters.map((counter) => {
          // Create the counter object
          const counterObj: any = {
            fiscalCounterType: counter.fiscalCounterType,

            fiscalCounterCurrency: counter.fiscalCounterCurrency,

            ...(counter.fiscalCounterTaxPercent !== undefined
              ? { fiscalCounterTaxPercent: counter.fiscalCounterTaxPercent }
              : {}), //fiscalCounterTaxPercent: null

            fiscalCounterTaxID:
              counter.fiscalCounterTaxID !== undefined
                ? counter.fiscalCounterTaxID
                : null,

            ...(counter.fiscalCounterMoneyType !== undefined &&
            counter.fiscalCounterMoneyType !== 0
              ? { fiscalCounterMoneyType: counter.fiscalCounterMoneyType }
              : {}), //fiscalCounterMoneyType: null

            fiscalCounterValue: counter.fiscalCounterValue,
          };
          return counterObj;
        }),

        fiscalDayDeviceSignature: {
          hash: hash,
          signature: signature,
        },
        receiptCounter:
          Number(zimraCredentialsResponse.nextZimraReceiptCounter) - 1,
      };
      // console.log(
      //   "=======================================================================================================",
      // );
      // console.log("Close Day Payload");
      // console.log(closeDayRequest);

      console.log("Attempting to Close day For Device ", deviceIdInt);
      // Make close day request
      const apiUrl = `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/CloseDay`;
      const closeDayResponse = await axios.post(apiUrl, closeDayRequest, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          DeviceModelName: "Server",
          DeviceModelVersion: "v1",
        },
        httpsAgent,
      });

      // // Update database if successful {ALWAYS USE THE DAY NUMBER FROM THE DEVICE STATUS RESPONSE}}
      if (closeDayResponse.status === 200) {
        //GET THE DEVICE STATUS AGAIN TO CONFIRM IF THE DEVICE HAS CLOSED THE DAY
        isCloseDay = true;
        // Use a delay to wait before checking status
        await new Promise((resolve) => setTimeout(resolve, 60000));
        deviceStatusResponse = await getDeviceStatusFromZimra(
          deviceId,
          zimraCredentialsResponse.certificate,
          zimraCredentialsResponse.privateKey,
          merchantId,
          zimraCredentialsResponse,
          isCloseDay, //THIS IS TO ENSURE THAT THE DAY STATUS WAS NOT CALLED BECAUSE OF CLOSING DAY EVENT
        );
        console.log("After attempitng to close day For Device ", deviceIdInt);
        console.log(deviceStatusResponse);
        //WHAT WAS NEEDED HERE WAS THE CLOSING DAY PAYLOAD{because the day number is important}
        let fiscalDayData = {
          openedAt: zimraCredentialsResponse.zimraFiscalOpenedDate //NEEDED
            ? new Date(zimraCredentialsResponse.zimraFiscalOpenedDate) // Convert string to Date
            : null, //new Date(), //NEEDED
          closedAt: deviceStatusResponse?.data.fiscalDayClosed //NEEDED
            ? new Date(deviceStatusResponse.data.fiscalDayClosed) // Convert string to Date
            : null, //deviceStatusResponse?.data.fiscalDayClosed,
          deviceSerialNumber: null, //NO NEED
          fiscalDayNo: fiscalDayNo, //NEEDED
          fiscalCounters: fiscalDayCounters,
          status: deviceStatusResponse.fiscalDayStatus,
          deviceId: deviceId, //NEEDED
          operatorId: "",
          dayEndTime: new Date(),
          totalTransactions: "0", //NO NEED
          totalAmount: "0", //NO NEED
          totalVat: "0", //NO NEED
          reportStatus: "",
          errorDetails: null,
          submissionAttempts: "0",
          manualClosure: false,
          manualClosureReason: null,
          lastSubmissionDate: null,
        };
        //IF THE DAY IS CLOSED, UPDATE THE DATABASE
        if (deviceStatusResponse?.fiscalDayStatus === "FiscalDayClosed") {
          try {
            //UPDATE THE FISCAL DAY TABLE WITH ALL THE NECCESSARY DETAILS;
            await tenantDB.db
              .insert(schema.fiscalDays)
              .values(fiscalDayData)
              .returning();
          } catch (error) {
            console.error("Failed to insert fiscal day:", error);
            throw error; // Or handle gracefully
          }
          // ALSO THE ZIMRA CREDENTIALS TABLE WITH THE STATUS "FiscalDayClosed"
          await tenantDB.db
            .update(zimraCredentials)
            .set({
              zimraFiscalDayStatus: "FiscalDayClosed",
            })
            .where(eq(zimraCredentials.deviceId, deviceId))
            .returning();

          return {
            success: true,
            message: "Fiscal day closed successfully",
            data: closeDayResponse.data,
          };
        } else {
          // ALSO THE ZIMRA CREDENTIALS TABLE WITH THE STATUS "FiscalDayClosed"
          await tenantDB.db
            .update(zimraCredentials)
            .set({
              zimraFiscalDayStatus: "FiscalDayCloseFailed",
            })
            .where(eq(zimraCredentials.deviceId, deviceId))
            .returning();
          console.log(
            "Day Closing Failed, The wait is over continue submiting invoices{ BUT Send To ZIMRA So that they close it}",
          );

          return {
            success: false,
            message: "Failed To Close Day",
            data: closeDayResponse.data,
          };
        }
      }
    }
  } catch (error: any) {
    console.error("Error in closeDayOnZimra function:", error);
    // ALSO THE ZIMRA CREDENTIALS TABLE WITH THE STATUS "FiscalDayClosed"
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error(`Cannot get tenant database for merchant ${merchantId}`);
    }

    await tenantDB.db
      .update(zimraCredentials)
      .set({
        zimraFiscalDayStatus: "FiscalDayCloseFailed",
      })
      .where(eq(zimraCredentials.deviceId, deviceId))
      .returning();

    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while processing your request.",
      error: error,
      zimraStatus: "INTERNAL_ERROR",
    };
  }
}
//=====================================================================================
async function generateCloseDayHash(
  fiscalDayCounters: any[],
  deviceId: string,
  privateKey: string,
  fiscalDayNo: string,
  fiscalDayDateFormatted: string,
) {
  interface FiscalCounter {
    fiscalCounterType: string;
    fiscalCounterCurrency?: string;
    fiscalCounterTaxPercent?: number;
    fiscalCounterTaxID?: number | null;
    fiscalCounterValue: number;
    fiscalCounterMoneyType?: string;
  }

  const sortedCounters = sortFiscalCounters(fiscalDayCounters);

  function sortFiscalCounters(counters: FiscalCounter[]): FiscalCounter[] {
    // Define the priority order for counter types
    const typePriority: Record<string, number> = {
      SaleByTax: 1,
      SaleTaxByTax: 2,
      CreditNoteByTax: 3,
      CreditNoteTaxByTax: 4,
      BalanceByMoneyType: 5,
    };
    // Define the priority order for tax IDs (1 comes first, then 2, then 3)
    const taxIdPriority = (id: number | null | undefined): number => {
      if (id === null || id === undefined) return 999; // Put at end
      return id;
    };

    return counters.sort((a, b) => {
      // First, sort by counter type priority
      const typeCompare =
        typePriority[a.fiscalCounterType] - typePriority[b.fiscalCounterType];

      if (typeCompare !== 0) return typeCompare;

      // For counters of the same type, sort by currency (alphabetical)
      if (a.fiscalCounterCurrency && b.fiscalCounterCurrency) {
        const currencyCompare = a.fiscalCounterCurrency.localeCompare(
          b.fiscalCounterCurrency,
        );
        if (currencyCompare !== 0) return currencyCompare;
      }

      // For SaleByTax and SaleTaxByTax, sort by tax ID AS WELL AS CreditNoteByTax and CreditNoteTaxByTax
      if (
        a.fiscalCounterType === "SaleByTax" ||
        a.fiscalCounterType === "SaleTaxByTax" ||
        a.fiscalCounterType === "CreditNoteByTax" ||
        a.fiscalCounterType === "CreditNoteTaxByTax"
      ) {
        const taxIdCompare =
          taxIdPriority(a.fiscalCounterTaxID) -
          taxIdPriority(b.fiscalCounterTaxID);
        if (taxIdCompare !== 0) return taxIdCompare;
      }

      // For BalanceByMoneyType, sort by money type if needed
      if (
        a.fiscalCounterType === "BalanceByMoneyType" &&
        a.fiscalCounterMoneyType &&
        b.fiscalCounterMoneyType
      ) {
        return a.fiscalCounterMoneyType.localeCompare(b.fiscalCounterMoneyType);
      }

      // If all else is equal, maintain original order
      return 0;
    });
  }

  const concatenatedString = generateConcatenatedString(sortedCounters);
  // Function to generate the concatenated string
  function generateConcatenatedString(counters: FiscalCounter[]): string {
    // let result = "24285102025-05-07"; // Assuming this is a prefix
    const today = new Date(Date.now() + 2 * 60 * 60 * 1000); // Adjust by adding 2 hours

    let result = deviceId + fiscalDayNo + fiscalDayDateFormatted; // this is the prefix

    // const todayFormatted = today.toISOString().slice(0, 19);
    // let result =
    //   deviceId + fiscalDayNo + fiscalDayDateFormatted + todayFormatted + "AUTO"; // Assuming this is a prefix

    for (const counter of counters) {
      switch (counter.fiscalCounterType) {
        case "SaleByTax":
          result += `SALEBYTAX${counter.fiscalCounterCurrency?.toUpperCase()}`;
          //CONCATINATE THE PERCENTAGE, PUT AN EMPTY STRING IF EXEMPT
          // if (counter.fiscalCounterTaxID === 1) {
          //   result += "";
          // } else {
          //   result += `${counter.fiscalCounterTaxPercent?.toFixed(2) || "0.00"}`;
          // }

          if (counter.fiscalCounterTaxPercent === null) {
            result += "";
          } else if (counter.fiscalCounterTaxPercent !== 0) {
            result += `${counter.fiscalCounterTaxPercent?.toFixed(2)}`;
          } else {
            result += `0.00`;
          }

          result += `${(counter.fiscalCounterValue * 100).toFixed(0)}`;
          break;
        case "SaleTaxByTax":
          result += `SALETAXBYTAX${counter.fiscalCounterCurrency?.toUpperCase()}`;
          result += `${counter.fiscalCounterTaxPercent?.toFixed(2) || "0.00"}`;
          result += `${(counter.fiscalCounterValue * 100).toFixed(0)}`;
          break;
        case "CreditNoteByTax":
          result += `CREDITNOTEBYTAX${counter.fiscalCounterCurrency?.toUpperCase()}`;
          // if (counter.fiscalCounterTaxID === 1) {
          //   result += "";
          // } else {
          //   result += `${counter.fiscalCounterTaxPercent?.toFixed(2) || "0.00"}`;
          // }

          //CONCATINATE THE PERCENTAGE, PUT AN EMPTY STRING IF EXEMPT
          if (counter.fiscalCounterTaxPercent === null) {
            result += "";
          } else if (counter.fiscalCounterTaxPercent !== 0) {
            result += `${counter.fiscalCounterTaxPercent?.toFixed(2)}`;
          } else {
            result += `0.00`;
          }
          result += `${(counter.fiscalCounterValue * 100).toFixed(0)}`;
          break;
        case "CreditNoteTaxByTax":
          result += `CREDITNOTETAXBYTAX${counter.fiscalCounterCurrency?.toUpperCase()}`;
          result += `${counter.fiscalCounterTaxPercent?.toFixed(2) || "0.00"}`;
          result += `${(counter.fiscalCounterValue * 100).toFixed(0)}`;
          break;
        case "BalanceByMoneyType":
          result += `BALANCEBYMONEYTYPE${counter.fiscalCounterCurrency?.toUpperCase()}${counter.fiscalCounterMoneyType?.toUpperCase()}`;
          result += `${(counter.fiscalCounterValue * 100).toFixed(0)}`;
          break;
      }
    }

    return result;
  }
  // console.log("Concatinated Input");
  // console.log(
  //   "=======================================================================================================",
  // );
  // console.log(concatenatedString);

  // Generate SHA-256 hash
  const hash = crypto
    .createHash("sha256")
    .update(concatenatedString)
    .digest("base64");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(concatenatedString);
  sign.end();

  // console.log("Generated SHA-256 hash (base64):", hash);
  // Generate signature
  const signature = sign.sign(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    "base64",
  );
  return { hash, signature };
}
//====================================================================================================================================
//FUNCTION TO SUBMIT RECEIPTS TO ZIMRA
export async function submitZimraReceipts(
  salesParam: Sale[] | Sale,
  merchantIdParam?: string,
) {
  // Normalize parameters to handle both single sale and array of sales
  const sales = Array.isArray(salesParam) ? salesParam : [salesParam];
  let merchantId = merchantIdParam;
  let deviceId = ""; //SO THAT WHEN THERE IS AN ERROR THAT HAS OCCURED, WE CAN KNOW WHICH DEVICE IT WAS {We also need the day, the inv number, the global number, the qr data}
  let fiscalDayStatus = "";

  // If merchantId is not provided, try to get it from the first sale's merchantId field
  if (!merchantId) {
    console.error("No merchantId provided and unable to determine from sales");
    return {
      success: false,
      message: "No merchantId provided",
    };
  }
  interface Tax {
    taxName: string;
    taxID: number;
    // taxCode: string;
    taxPercent: number;
  }

  // Results tracking currentZimraGlobalNumber,zimraFiscalDayId,zimraFiscalDayNo
  const results = {
    successful: [] as Array<{
      receipt: string;
      currentZimraReceiptCounter: string;
      currentZimraGlobalNumber: string;
      zimraFiscalDayId: string;
      zimraFiscalDayNo: string;
      receiptHash: string; // Added 'receiptHash' to the type definition
      zimraQrData: string;
      response: any;
    }>,
    failed: [] as Array<{
      receipt: string;
      error: any;
      currentZimraReceiptCounter: string;
      currentZimraGlobalNumber: string;
      zimraFiscalDayId: string;
      zimraFiscalDayNo: string;
      zimraQrData: string;
    }>,
  };

  let deviceStatusResponse: any;

  // Process each receipt
  for (const sale of sales) {
    let receiptHash;
    let currentZimraReceiptCounter;
    let currentZimraGlobalNumber;
    let zimraFiscalDayId;
    let zimraFiscalDayNo;
    let zimraQrData = "";
    const requiredFields = [
      "zimraFiscalDayNo",
      "receiptHash",
      "receiptCounter",
      "zimraGlobalNo",
    ];
    try {
      // // THE SALES AT TIMES COMES AS AN ARRAY SO FOR EACH SET OF SALE WE NEED NEW CREDENTIALS DATA AND WOULD WANT TO HANDLE THE MULTIPLE DEVICES
      const zimraCredentialsResponse = await getZimraCredentials(merchantId);
      let credential2: any;

      if (
        Array.isArray(zimraCredentialsResponse) &&
        zimraCredentialsResponse.length > 1
      ) {
        credential2 = zimraCredentialsResponse.find(
          (cred) => cred.deviceBranchName === sale.storeName,
        );
      } else {
        // If not an array, THIS MEANS THERE ARE NO MUTIPLE DEVICES try to get deviceId directly
        credential2 = zimraCredentialsResponse[0]; //zimraCredentialsResponse;
      }
      if (!credential2) {
        return {
          success: false,
          message: "No ZIMRA device found for this merchant",
        };
      }

      //FIRST CHECK IF THE DAY HAS INNITIATED EITHER CLOSING OR OPENING, THIS INFORMATION IS OBTAINED FROM ZIMRA CREDENTIALS TABLE
      // if (credential2.zimraFiscalDayStatus === "FiscalDayInitiated") {
      //   //IF THE DAY HAS INNITIATED, WAIT FOR THEN CHECK AGAIN
      //   console.log("Day has innitiated, waiting for some seconds");
      //   await new Promise((resolve) => setTimeout(resolve, 120000)); //PLAN A ATTEMPT IS TRYING TO HANDLE IT SILENTLY BY JUST PATIENTLY WAITING FOR THE DAY TO BE OPENED OR CLOSED
      // }
      while (credential2.zimraFiscalDayStatus === "FiscalDayInitiated") {
        //IF THE DAY HAS INNITIATED, WAIT FOR THEN CHECK AGAIN
        console.log(
          "Day has innitiated on device ",
          credential2.deviceId,
          " waiting for some seconds",
        );
        await new Promise((resolve) => setTimeout(resolve, 10000)); //WAIT FOR 10 SECONDS
        //recheck after 10s
        const zimraCredentialsResponse = await getZimraCredentials(merchantId);
        if (
          Array.isArray(zimraCredentialsResponse) &&
          zimraCredentialsResponse.length > 1
        ) {
          zimraCredentialsResponse.forEach((credential) => {
            //GET THE DEVICE ID FOR THE BRANCH THAT MATCHES THE STORE NAME OF THE SALE
            if (credential.deviceBranchName === sale.storeName) {
              credential2 = credential;
            }
          });
        } else {
          // If not an array, THIS MEANS THERE ARE NO MUTIPLE DEVICES try to get deviceId directly
          credential2 = zimraCredentialsResponse[0];
        }

        if (credential2.zimraFiscalDayStatus !== "FiscalDayInitiated") {
          console.log("FiscalDayInitiation Done...");
          break;
        }
      }
      //ALSO CHECK IF THERE IS A RECEIPT SUBMISSION IN PROGRESS, IF THERE IS, WAIT FOR IT TO FINISH LOOP{this avoids conflicts in numbering, as well as previous receipt hash}
      let checkCheck = credential2.progress;
      while (checkCheck === "ReceiptSubmissionInProgress") {
        // Loop until receipt submission completes
        console.log(
          "Receipt Submission In Progress, XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX...",
        );
        await new Promise((resolve) => setTimeout(resolve, 10000)); //WAIT FOR 10 SECONDS

        //recheck after 10s
        const zimraCredentialsResponse = await getZimraCredentials(merchantId);
        if (
          Array.isArray(zimraCredentialsResponse) &&
          zimraCredentialsResponse.length > 1
        ) {
          zimraCredentialsResponse.forEach((credential) => {
            //GET THE DEVICE ID FOR THE BRANCH THAT MATCHES THE STORE NAME OF THE SALE
            if (credential.deviceBranchName === sale.storeName) {
              credential2 = credential;
            }
          });
        } else {
          // If not an array, THIS MEANS THERE ARE NO MUTIPLE DEVICES try to get deviceId directly
          credential2 = zimraCredentialsResponse[0];
        }

        checkCheck == credential2.progress;
        if (checkCheck !== "") {
          console.log(
            "Ndamira The system no longer busy saving...",
            sale.receipt,
          );
          break;
        }
      }
      //======================================================================

      const tenantDB = await getTenantDB(merchantId);
      if (!tenantDB) {
        console.error(`Cannot get tenant database for merchant ${merchantId}`);
        return;
      }
      //first check if that receipt had not been somehow already submitted and this is done by checking the receiptID in the sales table
      const checkDuplicateResubmission = await tenantDB.db
        .select()
        .from(schema.sales)
        .where(
          sql`${schema.sales.receipt} = ${sale.receipt} AND ${schema.sales.zimraSubmitted} = TRUE`,
        )
        .execute();
      if (checkDuplicateResubmission.length > 0) {
        //THIS MEANS THE RECEIPT HAS BEEN SUBMITTED BEFORE, SO WE NEED TO CHECK IF IT HAS A RECEIPTID
        if (checkDuplicateResubmission[0].zimraReceiptId !== "") {
          console.log(
            "RECEIPT NO ",
            sale.receipt,
            " IS A DUPLICATE RESUBMISSION FOR DEVICE",
            credential2.deviceId,
          );
          console.log(
            "ALREADY HAS A RECEIPTID ",
            checkDuplicateResubmission[0].zimraReceiptId,
          );
          return;
        }

        if (checkDuplicateResubmission[0].zimraReceiptId === "") {
          console.log(
            checkDuplicateResubmission[0].receipt,
            " Hasssssssssssssss ID ",
            checkDuplicateResubmission[0].zimraReceiptId,
          );
          //CHECK IF THE RECEIPT IS ALREADY IN THE FAILED RECEIPTS DATABASE
          const failedReceipt = await tenantDB.db
            .select()
            .from(schema.failedReceipts)
            .where(sql`${schema.failedReceipts.receipt} = ${sale.receipt}`)
            .execute();
          if (failedReceipt.length > 0) {
            console.log(
              "Resubmitting Receipt No ",
              sale.receipt,
              " For Device ",
              credential2.deviceId,
            );
          }
        }
      }
      //======================================================================
      checkCheck == credential2.progress;
      if (!credential2) {
        return {
          success: false,
          message: "No ZIMRA device found for this merchant",
        };
      }
      deviceId = credential2.deviceId;
      if (
        !deviceId ||
        !credential2.certificate ||
        !credential2.privateKey ||
        !credential2.nextZimraReceiptCounter ||
        !credential2.nextZimraGlobalNo
      ) {
        return {
          success: false,
          message:
            "Missing required ZIMRA credentials (deviceId, certificate, or privateKey)",
        };
      }

      // Create an HTTPS agent with the certificate and private key for mTLS
      const httpsAgent = new https.Agent({
        cert: credential2.certificate,
        key: credential2.privateKey,
        rejectUnauthorized: true, // Verify ZIMRA's server certificate
      });

      // Convert deviceId to integer
      const deviceIdInt = parseInt(deviceId, 10);
      if (isNaN(deviceIdInt)) {
        throw new Error("Invalid deviceId: must be a valid integer");
      }

      // Get the applicable taxes from the ZIMRA credentials
      const applicableTaxes = credential2.applicableTaxes || [];
      const sortedTaxes = [...applicableTaxes]
        .sort((a, b) => a.taxID - b.taxID)
        .map((tax, index) => ({
          ...tax,
          taxCode: String.fromCharCode(65 + index), // 65 = 'A' in ASCII
        }));
      //LETS TRY TO PUT IT HERE {trying to put order on the global number and receipt counter and the rest of numbering}}
      // set progress to ReceiptSubmissionInProgress
      await tenantDB.db
        .update(zimraCredentials)
        .set({
          progress: " ",
        })
        .where(eq(zimraCredentials.deviceId, deviceId))
        .returning();

      let isCloseDay = false;
      deviceStatusResponse = await getDeviceStatusFromZimra(
        deviceId,
        credential2.certificate,
        credential2.privateKey,
        merchantId,
        credential2,
        isCloseDay,
      );

      console.log("deviceStatusResponse", deviceStatusResponse);
      if (deviceStatusResponse?.fiscalDayStatus === "FiscalDayClosed") {
        //"The system is not going to fail to submit receipt due to the fact that the day is closed, the first receipt to be made in this condition will trigger the system to open day, during opening day, the fiscalDayStatus=FiscalDayInitiated let the system handle it silently{PLAN A} /keep the PILING UP receipts In another salesTable somewhere on tenant database {PLAN B}
        return;
      } else if (
        deviceStatusResponse?.fiscalDayStatus === "FiscalDayOpened" ||
        deviceStatusResponse?.fiscalDayStatus === "FiscalDayCloseFailed"
      ) {
        fiscalDayStatus = deviceStatusResponse?.fiscalDayStatus;
        //WHEN THE RESPONSE IS OK WITHOUT AN ERROR, USE THE FISCAL DAY NUMBER FROM THE DEVICE STATUS RESPONSE
        zimraFiscalDayNo = deviceStatusResponse.fiscalDayNo;

        //POSSIBLY,THE DAY WAS CLOSED MANUALLY, OPEN DAY HAS RUN AND THE DAY NUMBER UPDATED IN THE CREDENTIALS RETAKE ENTIRE CREDENTIALS2 {receipt counter and global number ??}}
        const zimraCredentialsResponse = await getZimraCredentials(merchantId);
        if (
          Array.isArray(zimraCredentialsResponse) &&
          zimraCredentialsResponse.length > 1
        ) {
          zimraCredentialsResponse.forEach((credential) => {
            //GET THE DEVICE ID FOR THE BRANCH THAT MATCHES THE STORE NAME OF THE SALE
            if (credential.deviceBranchName === sale.storeName) {
              credential2 = credential;
            }
          });
        } else {
          // If not an array, THIS MEANS THERE ARE NO MUTIPLE DEVICES try to get deviceId directly
          credential2 = zimraCredentialsResponse[0];
        }

        //GET THE GLOBAL RECEIPT COUNTER
        currentZimraGlobalNumber = credential2.nextZimraGlobalNo;
        //GET THE RECEIPT COUNTER
        currentZimraReceiptCounter = credential2.nextZimraReceiptCounter;
        const duplicateCounterResponse = await checkDuplicateCounters(
          currentZimraGlobalNumber,
          currentZimraReceiptCounter,
          deviceId,
          merchantId,
        );
        //GET THE GLOBAL NUMBER THAT HAS BEEN VERIFIED
        currentZimraGlobalNumber =
          duplicateCounterResponse?.currentZimraGlobalNumber;
        //GET THE RECEIPT COUNTER THAT HAS BEEN VERIFIED
        currentZimraReceiptCounter =
          duplicateCounterResponse?.currentZimraReceiptCounter;

        //if the fiscal day from the device status is not equal to the one in the database, update the database
        if (
          zimraFiscalDayNo &&
          credential2.zimraFiscalDayNo !== zimraFiscalDayNo //SINCE OPEN DAY HAS RUN AND ADDED A +1 WRONGLY, WE NEED TO UPDATE THE DATABASE
        ) {
          // UPDATE THE DATABASE WITH THE DAY NUMBER FROM THE STATUS;
          const tenantDB = await getTenantDB(merchantId);
          if (!tenantDB) {
            console.error(
              `Cannot get tenant database for merchant ${merchantId}`,
            );
            return;
          }
          await tenantDB.db
            .update(zimraCredentials)
            .set({
              zimraFiscalDayNo: zimraFiscalDayNo,
              nextZimraGlobalNo: currentZimraGlobalNumber,
              nextZimraReceiptCounter: currentZimraReceiptCounter,
            })
            .where(eq(zimraCredentials.deviceId, deviceId))
            .returning();
        }
      } else {
        //WHEN THE IS ONE OR MORE ERRORS FROM THE DEVICE STATUS RESPONSE, USE THE FISCAL DAY NUMBER FROM THE CREDENTIALS RESPONSE/ IF THE DAY HAS BEEN CLOSED MANUALLY, OPEN DAY HAS RUN AND THE DAY NUMBER UPDATED IN THE CREDENTIALS RETAKE ENTIRE CREDENTIALS2 {receipt counter and global number ??}}
        const zimraCredentialsResponse = await getZimraCredentials(merchantId);
        if (
          Array.isArray(zimraCredentialsResponse) &&
          zimraCredentialsResponse.length > 1
        ) {
          zimraCredentialsResponse.forEach((credential) => {
            //GET THE DEVICE ID FOR THE BRANCH THAT MATCHES THE STORE NAME OF THE SALE
            if (credential.deviceBranchName === sale.storeName) {
              credential2 = credential;
            }
          });
        } else {
          // If not an array, THIS MEANS THERE ARE NO MUTIPLE DEVICES try to get deviceId directly
          credential2 = zimraCredentialsResponse[0];
        }
        zimraFiscalDayNo = credential2.zimraFiscalDayNo; //TAKE THE DAY FROM THE DATABASE THE DATABASE
        //WHEN ZIMRA DOWN WE STILL BE USING THE GLOBAL NUMBER FROM THE DATABASE
        currentZimraGlobalNumber = credential2.nextZimraGlobalNo;
        currentZimraReceiptCounter = credential2.nextZimraReceiptCounter;
        let duplicateCounterResponse = await checkDuplicateCounters(
          currentZimraGlobalNumber,
          currentZimraReceiptCounter,
          deviceId,
          merchantId,
        );
        //GET THE GLOBAL NUMBER THAT HAS BEEN VERIFIED
        currentZimraGlobalNumber =
          duplicateCounterResponse?.currentZimraGlobalNumber;
        //GET THE RECEIPT COUNTER THAT HAS BEEN VERIFIED
        currentZimraReceiptCounter =
          duplicateCounterResponse?.currentZimraReceiptCounter;
      }

      if (
        !deviceId ||
        !credential2.certificate ||
        !credential2.privateKey ||
        !credential2.nextZimraReceiptCounter ||
        !credential2.nextZimraGlobalNo ||
        !zimraFiscalDayNo
      ) {
        return {
          success: false,
          message:
            "Missing required Data for receipt submission (zimraFiscalDayNo,deviceId, certificate, or privateKey)",
        };
      }
      //GET THE PREVIOUS RECEIPT HASH {and lock the system to discourage the other receipt to come and take the same receipts hash as its own previous receipt hasg}
      receiptHash = credential2.receiptHash;
      //IF THE RECEIPT HASH IS NULL OR EMPTY, SET IT TO EMPTY STRING
      if (
        credential2.receiptHash === null ||
        Number(currentZimraReceiptCounter) === 1
      ) {
        receiptHash = ""; //THIS MEANS IT WAS THE FIRST RECEIPT OF THE DAY
      }
      zimraFiscalDayId = "";

      // Prepare the receipt lines and taxes
      let receiptLines: any[] = [];
      receiptLines = sale.items.map((item, index) => {
        // Find the applicable tax for this item
        let taxCode = "";
        let taxPercent = 0;
        let taxID = 0;
        let itemTaxName = "";
        itemTaxName = item.taxDetails[0].taxName.toLowerCase();
        if (!itemTaxName) {
          itemTaxName = "zero rated";
        }
        // console.log("ddddddddddddddddddddddddddddddd");
        // console.log(itemTaxName);
        let matchedTax;

        if (
          itemTaxName.includes("vat") &&
          !itemTaxName.includes("non") &&
          !itemTaxName.includes("zero")
        ) {
          // For "VAT" to match "Standard rated 15%"
          matchedTax = sortedTaxes.find(
            (tax: Tax) =>
              tax.taxName.toLowerCase().includes("standard") &&
              tax.taxName.toLowerCase().includes("rated"),
          );
        } else if (itemTaxName.includes("exempt")) {
          matchedTax = sortedTaxes.find((tax: Tax) =>
            tax.taxName.toLowerCase().includes("exempt"),
          );
        } else if (itemTaxName.includes("zero")) {
          matchedTax = sortedTaxes.find((tax: Tax) =>
            tax.taxName.toLowerCase().includes("zero"),
          );
        } else if (
          itemTaxName.includes("withhold") ||
          itemTaxName.includes("non")
        ) {
          matchedTax = sortedTaxes.find(
            (tax: Tax) =>
              tax.taxName.toLowerCase().includes("withhold") ||
              tax.taxName.toLowerCase().includes("non"),
          );
        } else {
          // Fallback: Broad search
          matchedTax = sortedTaxes.find((tax: Tax) =>
            tax.taxName.toLowerCase().includes(itemTaxName),
          );
        }

        // Update taxConfig if a match is found
        if (matchedTax) {
          taxID = matchedTax.taxID;
          taxCode = matchedTax.taxCode || "";
          taxPercent = matchedTax.taxPercent;
        }

        return {
          receiptLineType: "Sale", // Always use "Sale" as the line type even for credit notes
          receiptLineNo: index + 1,
          receiptLineHSCode: item.hsCode,
          receiptLineName: item.name,
          receiptLinePrice: parseFloat(item.priceInc.toFixed(6)), //Number(item.priceInc), // Number(parseFloat(item.priceInc.toFixed(2))),
          receiptLineQuantity: item.quantity,
          receiptLineTotal: parseFloat(item.totalInc.toFixed(2)),
          taxCode: taxCode,
          taxPercent: taxPercent,
          taxID: taxID,
        };
      });
      // console.log("uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu");
      // console.log(receiptLines);

      // Remove taxPercent from receiptLines if it is undefined
      receiptLines = receiptLines.map((line) => {
        if (line.taxPercent === undefined) {
          const { taxPercent, ...rest } = line;
          return rest;
        }
        return line;
      });
      // Prepare receipt taxes (grouped by tax type)
      let receiptTaxes: any[] = [];
      receiptTaxes = sortedTaxes
        .map((tax) => {
          // console.log(tax);
          let taxCode = "";
          const itemsWithThisTax = sale.items.filter((item) => {
            if (
              tax.taxName.toLowerCase().includes("standard") &&
              tax.taxName.toLowerCase().includes("rated") &&
              item.taxDetails[0].taxName === "VAT"
            ) {
              taxCode = tax.taxCode;
              return true;
            }
            if (
              tax.taxName.toLowerCase().includes("exempt") &&
              item.taxDetails[0].taxName === "EXEMPT"
            ) {
              taxCode = tax.taxCode;
              return true;
            }
            if (
              (tax.taxName.toLowerCase().includes("zero") &&
                item.taxDetails[0].taxName === "ZERO RATED") ||
              (tax.taxName.toLowerCase().includes("zero") &&
                !item.taxDetails[0].taxName)
            ) {
              taxCode = tax.taxCode;
              return true;
            }
            if (
              tax.taxName.toLowerCase().includes("withhold") &&
              tax.taxName.toLowerCase().includes("non") &&
              item.taxDetails[0].taxName === "WITHOLD VAT"
            ) {
              taxCode = tax.taxCode;
              return true;
            }
            return false;
          });
          receiptTaxes = receiptTaxes.map((line) => {
            if (line.taxPercent === undefined) {
              const { taxPercent, ...rest } = line;
              return rest;
            }
            return line;
          });
          // Determine if prices are tax-inclusive (this is coming from slyretail system settings)
          // Determine if prices are tax-inclusive (should probably come from system settings)
          const receiptLinesTaxInclusive = true; // This should be dynamic based on your system

          let salesAmountWithTax;
          if (receiptLinesTaxInclusive) {
            // Case 1: Prices include tax - sum of line totals
            salesAmountWithTax = itemsWithThisTax.reduce(
              (sum, item) => sum + (item.totalInc || 0),
              0,
            );
          } else {
            // Case 2: Prices don't include tax - sum of line totals multiplied by (1 + taxPercent)
            salesAmountWithTax = itemsWithThisTax.reduce(
              (sum, item) =>
                sum + (item.totalInc || 0) * (1 + (tax.taxPercent || 0) / 100),
              0,
            );
          }
          let taxAmount = itemsWithThisTax.reduce(
            (sum, item) => sum + (item.vatAmount || 0),
            0,
          );
          //if they hapen to be a figure like 2.9999999, ZIMRA DOES NOT WORK GOOD WITH THEREFORE ROUND IT TO 2 DECIMAL PLACES
          taxAmount = parseFloat(taxAmount.toFixed(2));

          // Additional validation to ensure the calculation matches the rules
          if (receiptLinesTaxInclusive) {
            const expectedAmount = itemsWithThisTax.reduce(
              (sum, item) => sum + (item.totalInc || 0),
              0,
            );
            if (Math.abs(salesAmountWithTax - expectedAmount) > 0.01) {
              console.error(`RCPT027 validation failed for tax ${tax.taxName}: 
                              salesAmountWithTax (${salesAmountWithTax}) should equal sum of line totals (${expectedAmount})`);
            }
          } else {
            const expectedAmount = itemsWithThisTax.reduce(
              (sum, item) =>
                sum + (item.totalInc || 0) * (1 + (tax.taxPercent || 0) / 100),
              0,
            );
            if (Math.abs(salesAmountWithTax - expectedAmount) > 0.01) {
              console.error(`RCPT027 validation failed for tax ${tax.taxName}: 
                              salesAmountWithTax (${salesAmountWithTax}) should equal sum of line totals multiplied by (1 + taxPercent) (${expectedAmount})`);
            }
          }
          return {
            taxCode: taxCode,
            taxPercent: tax.taxPercent,
            taxID: tax.taxID,
            taxAmount: taxAmount,
            salesAmountWithTax: Number(salesAmountWithTax.toFixed(2)),
          };
        })
        .filter((tax) => tax.salesAmountWithTax > 0); // Only include taxes with actual amounts
      receiptTaxes = receiptTaxes.map((line) => {
        if (line.taxPercent === undefined) {
          const { taxPercent, ...rest } = line;
          return rest;
        }
        return line;
      });

      // Prepare the receipt object receiptToBeSubmitted
      // console.log("what currency are you");
      // console.log(sale.payments);
      let receipts: receiptStructure = {
        receiptLines: receiptLines,
        receiptTaxes: receiptTaxes,
        receiptHash: receiptHash,
        receiptSale: sale,
        currentZimraReceiptCounter: currentZimraReceiptCounter,
        currentZimraGlobalNumber: currentZimraGlobalNumber,
        deviceIdInt: deviceIdInt,
        payment: sale.payments[0],
      };
      const receiptToBeSubmitted =
        await receiptToBeSubmittedStructure(receipts);
      // Prepare the receipt object receiptToBeSubmitted
      // Final receipt object
      const receiptToBeSubmitted2 = {
        receiptType:
          sale.receiptType === "FiscalInvoice" ? "FISCALINVOICE" : "CREDITNOTE",
        receiptCurrency: sale.payments[0]?.currency || "USD",
        receiptGlobalNo: Number(currentZimraGlobalNumber),
        receiptDate: receiptToBeSubmitted.receiptDate, //new Date().toISOString().slice(0, 19),
        receiptTotal: sale.totalInc,
        receiptTaxes: receiptTaxes, // Now properly formatted and concatenated
        previousReceiptHash: receiptHash,
      };

      // console.log(receiptToBeSubmitted2);
      // Add credit note specific data if this is a credit note
      if (sale.receiptType === "CreditNote") {
        const creditNoteResponse = await creditNote(sale, merchantId);
        // console.log("Credit note response:", creditNoteResponse);

        const { originalReceiptNumber, originalReceiptID, originalResults } =
          creditNoteResponse;
        if (originalResults.length === 0) {
          console.error(`Original receipt ${sale.refundFor} not found`);
          throw new Error(`Original receipt ${sale.refundFor} not found`);
        }
        receiptToBeSubmitted.creditDebitNote = {
          // receiptID: BigInt(originalReceiptID || 0),
          // EITHER option 1: Provide receiptID (as string or BigInt)
          receiptID: originalReceiptID ? BigInt(originalReceiptID) : BigInt(0),
        };
        // Process each receipt
        for (const sale of originalResults) {
          try {
            // Prepare receipt taxes (grouped by tax type)
            const receiptTaxes = sortedTaxes
              .map((tax) => {
                // console.log(tax);
                let taxCode = "";
                const itemsWithThisTax = sale.items.filter(
                  (item, index: number) => {
                    if (
                      tax.taxName.toLowerCase().includes("standard") &&
                      tax.taxName.toLowerCase().includes("rated") &&
                      item.taxDetails[0].taxName === "VAT"
                    ) {
                      taxCode = tax.taxCode;
                      return true;
                    }
                    if (
                      tax.taxName.toLowerCase().includes("exempt") &&
                      item.taxDetails[0].taxName === "EXEMPT"
                    ) {
                      taxCode = tax.taxCode;
                      return true;
                    }
                    if (
                      tax.taxName.toLowerCase().includes("zero") &&
                      item.taxDetails[0].taxName === "ZERO RATED"
                    ) {
                      taxCode = tax.taxCode;
                      return true;
                    }
                    if (
                      (tax.taxName.toLowerCase().includes("withhold") ||
                        tax.taxName.toLowerCase().includes("non")) &&
                      item.taxDetails[0].taxName === "WITHOLD VAT"
                    ) {
                      taxCode = tax.taxCode;
                      return true;
                    }
                    return false;
                  },
                );

                // Determine if prices are tax-inclusive (should probably come from system settings)
                const receiptLinesTaxInclusive = true; // This should be dynamic based on your system

                let salesAmountWithTax;
                if (receiptLinesTaxInclusive) {
                  // Case 1: Prices include tax - sum of line totals made negative
                  salesAmountWithTax = -itemsWithThisTax.reduce(
                    (sum: number, item: any) => sum + (item.totalInc || 0),
                    0,
                  );
                } else {
                  // Case 2: Prices do not include tax - sum of line totals multiplied by (1 + taxPercent) made negative
                  salesAmountWithTax = -itemsWithThisTax.reduce(
                    (sum: number, item: any) =>
                      sum +
                      (item.totalInc || 0) * (1 + (tax.taxPercent || 0) / 100),
                    0,
                  );
                }
                let taxAmount = -itemsWithThisTax.reduce(
                  (sum: number, item: any) => sum + (item.vatAmount || 0),
                  0,
                );
                //if they hapen to be a figure like 2.9999999, ZIMRA DOES NOT WORK GOOD WITH THEREFORE ROUND IT TO 2 DECIMAL PLACES
                taxAmount = parseFloat(taxAmount.toFixed(2));

                if (taxAmount >= 0) {
                  taxAmount = taxAmount * -1;
                }

                // Additional validation to ensure the calculation matches the rules
                if (receiptLinesTaxInclusive) {
                  const expectedAmount = -itemsWithThisTax.reduce(
                    (sum: number, item: any) => sum + (item.totalInc || 0),
                    0,
                  );
                  if (Math.abs(salesAmountWithTax - expectedAmount) > 0.01) {
                    console.error(`RCPT027 validation failed for tax ${tax.taxName}: 
                                  salesAmountWithTax (${salesAmountWithTax}) should equal sum of line totals (${expectedAmount})`);
                  }
                } else {
                  const expectedAmount = -itemsWithThisTax.reduce(
                    (sum: number, item: any) =>
                      sum +
                      (item.totalInc || 0) * (1 + (tax.taxPercent || 0) / 100),
                    0,
                  );
                  if (Math.abs(salesAmountWithTax - expectedAmount) > 0.01) {
                    console.error(`RCPT027 validation failed for tax ${tax.taxName}: 
                                  salesAmountWithTax (${salesAmountWithTax}) should equal sum of line totals multiplied by (1 + taxPercent) (${expectedAmount})`);
                  }
                }

                return {
                  taxCode: taxCode,
                  taxPercent: tax.taxPercent,
                  taxID: tax.taxID,
                  taxAmount: taxAmount,
                  salesAmountWithTax: Number(
                    parseFloat(salesAmountWithTax.toFixed(2)),
                  ),
                };
              })
              .filter((tax) => tax.salesAmountWithTax < 0); // Only include taxes with actual amounts
            // console.log(receiptTaxes);
            receiptToBeSubmitted.receiptTaxes = receiptTaxes;
            //update the receipttaxes on receiptsubmitted2
            receiptToBeSubmitted2.receiptTaxes = receiptTaxes;
            const receiptPayments = sale.payments.map(
              (payment: PaymentInfo) => ({
                // moneyTypeCode: payment.currency === "card" ? "Card" : "Cash",
                moneyTypeCode: payment.type,
                paymentAmount: parseFloat((payment.amount * -1).toFixed(2)),
              }),
            );
            receiptToBeSubmitted.receiptPayments = receiptPayments;
          } catch (error) {
            console.error("Error processing receipt:", error);
          }
        }

        if (originalReceiptNumber) {
          if (receiptToBeSubmitted.receiptNotes) {
            if (
              !receiptToBeSubmitted.receiptNotes.includes(originalReceiptNumber)
            ) {
              receiptToBeSubmitted.receiptNotes += ` | Ref: ${originalReceiptNumber}`;
            }
          } else {
            receiptToBeSubmitted.receiptNotes = `Credit note for receipt: ${originalReceiptNumber}`;
          }
        }

        if (SHOULD_LOG_VERBOSE) {
          console.log(
            `Credit note data prepared with reference to original receipt: ${originalReceiptNumber}`,
          );
        }
      } else {
        delete receiptToBeSubmitted.creditDebitNote;
      }

      //IF THERE ARE NO BUYER DETAILS
      if (sale.customerName === "Cash Sale") {
        delete receiptToBeSubmitted.buyerData;
      }

      const hash = await generateReceiptHash(
        receiptToBeSubmitted2,
        deviceId,
        credential2.privateKey,
      );

      const signature = hash.signature;
      receiptToBeSubmitted.receiptDeviceSignature = {
        hash: hash.hash,
        signature: signature,
      };
      //GENERATE THE RECEIPT QR DATA HERE. This is so because if any error is to happen during axios submmision, the receipt will have everything needed for the pending invoice to eventually be validated
      if (signature) {
        // 1. Convert base64 signature to Buffer (raw bytes)
        const signatureBuffer = Buffer.from(signature, "base64");
        // 2. Compute MD5 of the **raw bytes**, not the hex string
        const md5Hash = crypto
          .createHash("md5")
          .update(signatureBuffer)
          .digest("hex")
          .toUpperCase();
        // 3. Take first 16 characters for ZIMRA QR data
        zimraQrData = md5Hash.substring(0, 16);
      }

      // console.log(
      //   "===============receiptToBeSubmitted===PAYLOAD==========================",
      // );
      // console.log(receiptToBeSubmitted);
      // Submit the receipt to ZIMRA with a reasonable timeout {and handle the errors if any}
      //we will not do the zimraAxiosHandler if the device status is not ok
      // console.log(
      //   "ddddddddddddddddddddeviceStatusResponse",
      //   deviceStatusResponse,
      // );
      let zimraServer = deviceStatusResponse?.status;
      let response = null;
      if (Number(zimraServer) === 200) {
        response = await zimraAxiosHandler(
          receiptToBeSubmitted,
          deviceIdInt,
          httpsAgent,
        );
      }

      // if (response.status === 200 && response.data.receiptID) {
      if (response && response.status === 200) {
        //A SUCCEEDED RECEIPT WILL HAVE A RECEIPT ID
        results.successful.push({
          receipt: sale.receipt,
          currentZimraReceiptCounter: currentZimraReceiptCounter,
          currentZimraGlobalNumber: currentZimraGlobalNumber,
          zimraFiscalDayId: zimraFiscalDayId,
          zimraFiscalDayNo: zimraFiscalDayNo,
          receiptHash: hash.hash,
          zimraQrData: zimraQrData,
          response: response?.data,
        });
        //UPDATE THE COUNTERS REGARDLESS OF THE SUBMISSION STATUS
        await updateZimraCounters(
          merchantId,
          currentZimraReceiptCounter,
          currentZimraGlobalNumber,
          deviceId,
          hash.hash,
        );
      } else {
        if (response.response) {
          console.log("Full error details:", response.response.data.errors);
          // or
          console.log("Full response:", response.response.data);
        }
        let errorMessage = "ZIMRA Error";
        let errorCode = "One or more errors occurred";
        console.error(
          `RECEIPT NO. ${sale.receipt}  PENDING RE-SUBMISSION FOR DEVICE: ${deviceId}`,
        );

        results.failed.push({
          receipt: sale.receipt,
          error: {
            message: errorMessage,
            code: errorCode,
            details: "One or More Errors...",
          },
          // SHOULDNT WE SAVE THEM AS EMPTY COZ IT MEANS THE RECIEPTS HASNT PASSED TO ZIMRA
          currentZimraReceiptCounter: "",
          currentZimraGlobalNumber: "",
          zimraFiscalDayId: "",
          zimraFiscalDayNo: "",
          receiptHash: "",
          zimraQrData: "",
        });
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
          receiptHash: "",
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
          receiptCounter: "",
          submissionRoute: sale.submissionRoute,
          receiptStatus: "Pending",
        };
        //CHECK IF ITS NOT ALREADY SAVED IN THE FAILED RECEIPTS TABLE
        const checkReceipt = await tenantDB.db
          .select()
          .from(schema.failedReceipts)
          .where(sql`${schema.failedReceipts.receipt} = ${sale.receipt}`)
          .execute();
        if (checkReceipt.length === 0) {
          await tenantDB.db
            .insert(schema.failedReceipts)
            .values(validatedSale)
            .returning();
        } else {
          console.log("Receipt already saved in failed receipts table");
          //do nothing
        }
      }

      // return response
    } catch (error) {
      // Simplified error logging to reduce resource usage
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error processing receipt ${sale.receipt}: ${errorMsg}`);

      //IF ERRORS ARE NOT CATCHED ON THE AXIOS REQUEST, THEY WILL BE CATCHED HERE AND THESE ARE ALSO RECEIPTS TO BE RETRIED BECAUSE THEY WERE NOT SUBMITTED TO ZIMRA AND NOT EVEN AN AXIOS ATTEMPT WAS MADE???
      results.failed.push({
        receipt: sale.receipt,
        error: {
          message: "Unexpected processing error",
          code: "PROCESSING_ERROR",
          details: errorMsg,
        },
        currentZimraReceiptCounter: "",
        currentZimraGlobalNumber: "",
        zimraFiscalDayId: zimraFiscalDayId ?? "",
        zimraFiscalDayNo: "",
        zimraQrData: "",
      });
    }
  }
  // Return the overall results and Update the database to mark the receipt as submitted
  return {
    success: results.successful.length > 0,
    failed: results.failed.length > 0,
    data: results,
    zimraDeviceId: deviceId,
    submissionRoute: "ZIMRA_DIRECT", //WE HAVE TO UPDATE THIS SO THAT WE HAVE TO KNOW WHICH PROVIDER SUBMITTED THE RECEIPT
    fiscalDayStatus: fiscalDayStatus,
  };
}

//==============================================================================================================================
// Function to generate fiscal day report PDF
export async function generateFiscalDayReport(
  merchantId: string,
  deviceId: string,
  fiscalDayNo: string,
): Promise<{ fiscalDay: typeof schema.fiscalDays.$inferSelect } | null> {
  try {
    //GET INTO THE FISCAL DAY DABLE FOR THE SPECIFIED DEVICE ID
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      console.error(`Cannot get tenant database for merchant ${merchantId}`);
      return null;
    }
    const fiscalDay = await tenantDB.db
      .select()
      .from(schema.fiscalDays)
      .where(
        sql`${schema.fiscalDays.deviceId} = ${deviceId} AND ${schema.fiscalDays.fiscalDayNo} = ${fiscalDayNo}`,
      )
      .execute();
    if (fiscalDay.length === 0) {
      console.error(`No fiscal day found for device ${deviceId}`);
      return null;
    }

    return { fiscalDay: fiscalDay[0] };
  } catch (error) {
    console.error("Error generating fiscal day PDF:", error);
    return null;
  }
}
//==============================================================================================================================
//function for receipt structure
async function receiptToBeSubmittedStructure(receipts: receiptStructure) {
  // console.log(receipts.receipt);
  let upDatedDate;
  // we want to add 2 hrs on the new Date()
  upDatedDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
  upDatedDate = new Date(upDatedDate).toISOString().slice(0, 19);
  const receiptToBeSubmitted = {
    // deviceID: deviceIdInt,
    receiptType:
      receipts.receiptSale.receiptType === "FiscalInvoice"
        ? "FiscalInvoice"
        : "CreditNote",
    receiptCurrency: receipts.receiptSale.payments[0]?.currency || "USD",
    receiptCounter: Number(receipts.currentZimraReceiptCounter),
    receiptGlobalNo: Number(receipts.currentZimraGlobalNumber),
    invoiceNo: receipts.receiptSale.receipt,

    buyerData: {
      buyerRegisterName: receipts.receiptSale.customerName || "",
      buyerTradeName: receipts.receiptSale.customerName || "",
      vatNumber: receipts.receiptSale.customerVAT || "000000000",
      buyerTIN: receipts.receiptSale.customerTIN || "Cash Sales",
      buyerContacts: {
        phoneNo: receipts.receiptSale.customerContact || "",
        email: receipts.receiptSale.customerEmail || "",
      },
      buyerAddress: {
        province: receipts.receiptSale.customerCity || "",
        city: receipts.receiptSale.customerCity || "",
        street: receipts.receiptSale.customerAddress || "",
        houseNo: "Zimbabwe",
      },
    },
    receiptNotes: receipts.receiptSale.notes || "",
    username: "Sales",
    userNameSurname: "Rep",
    receiptDate: upDatedDate,
    creditDebitNote: {
      receiptID: BigInt(0),
    },
    receiptLinesTaxInclusive: true,
    receiptLines: receipts.receiptLines,
    receiptTaxes: receipts.receiptTaxes,
    receiptPayments: receipts.receiptSale.payments.map((payment) => ({
      // moneyTypeCode: payment.currency === "card" ? "Card" : "Cash", // Map your payment types to ZIMRA's
      moneyTypeCode: payment.type, // Map your payment types to ZIMRA's
      paymentAmount: Number(parseFloat(payment.amount.toFixed(2))),
    })),
    receiptTotal: receipts.receiptSale.totalInc, // Math.round(Number(sale.totalInc) * 100),
    receiptPrintForm: "Receipt48",
    receiptDeviceSignature: {
      hash: "", // Will be generated
      signature: "", // Will be generated
    },
  };
  return receiptToBeSubmitted;
}
//----------------------------------------------------------------------------------------------------------
export async function resubmitPendingInvoices(
  failedReceipts: any,
  httpsAgent: any,
  tenantDB: any,
) {
  console.log(
    "We have failed mmmmmmmmmmmmmm ",
    failedReceipts.length,
    " Receipts ",
  );
  //LOOP WITHING FAILED RECEIPTS AND RESUBMIT THEM
  for (const failedReceipt of failedReceipts) {
    //RECREATE THE receiptToBeSubmitted PAYLOAD
    const deviceIdInt2 = parseInt(failedReceipt.deviceId, 10);
    //DECODE THE receiptDate from this type 2025-06-19T17:46:06.000Z to this string type '2025-06-19T17:46:06'
    // const receiptDate = new Date().toISOString().slice(0, 19);
    const receiptDate = new Date(failedReceipt.receiptDate)
      .toISOString()
      .slice(0, 19);
    console.log(
      "The failed receipt to be submited exttracted with date",
      receiptDate,
    );
    const receiptToBeSubmitted = {
      receiptType: failedReceipt.receiptType,
      receiptCurrency: failedReceipt.receiptCurrency,
      receiptCounter: failedReceipt.receiptCounter,
      receiptGlobalNo: failedReceipt.receiptGlobalNo,
      invoiceNo: failedReceipt.invoiceNo,
      buyerData: failedReceipt.buyerData,
      receiptNotes: failedReceipt.receiptNotes,
      username: failedReceipt.username,
      userNameSurname: failedReceipt.userNameSurname,
      receiptDate: receiptDate,
      receiptLinesTaxInclusive: failedReceipt.receiptLinesTaxInclusive,
      receiptLines: failedReceipt.receiptLines,
      receiptTaxes: failedReceipt.receiptTaxes,
      receiptPayments: failedReceipt.receiptPayments,
      receiptTotal: failedReceipt.receiptTotal,
      receiptPrintForm: failedReceipt.receiptPrintForm,
      receiptDeviceSignature: failedReceipt.receiptDeviceSignature,
    };
    console.log(
      "Resubmitting Receipt ",
      failedReceipt.invoiceNo,
      " For Device",
      deviceIdInt2,
    );

    //RE-SUBMIT THE RECEIPT
    const response = await zimraAxiosHandler(
      receiptToBeSubmitted,
      deviceIdInt2,
      httpsAgent,
    );
    if (response.status === 200) {
      console.log(
        "Receipt ",
        failedReceipt.invoiceNo,
        " Re-Submitted successfully",
      );
      // console.log(response.data);
      //update the sale in the sales table with the receiptID,operationId,zimrafiscaldayid,zimraerror
      await tenantDB.db
        .update(schema.sales)
        .set({
          zimraReceiptId: response.data.receiptID,
          zimraOperationId: response.data.operationID,
          zimraFiscalDayId: null,
          zimraError: response.data.validationErrors,
          zimraSubmitted: true,
        })
        .where(
          sql`${schema.sales.receipt} = ${failedReceipt.invoiceNo} AND ${schema.sales.zimraDeviceId} = ${failedReceipt.deviceId}`,
        )
        .returning();

      //DELETE THE FAILED RECEIPT FROM THE DATABASE
      await tenantDB.db
        .delete(schema.failedReceipts)
        .where(
          sql`${schema.failedReceipts.invoiceNo} = ${failedReceipt.invoiceNo}`,
        )
        .execute();

      console.log(response.data.validationErrors);
    } else {
      console.log("Failed to ReSubmit ReceiptNo. ", failedReceipt.invoiceNo);
    }
  }
}
//============================================================================================================
//function to update  the next receipt number
async function updateZimraCounters(
  merchantId: string,
  currentZimraReceiptCounter: string,
  currentZimraGlobalNumber: string,
  deviceId: string,
  hash: string,
) {
  // Get the tenant database connection
  const tenantDb = await getTenantDB(merchantId);
  if (!tenantDb) {
    return;
  }

  if (!currentZimraReceiptCounter || !deviceId || !currentZimraGlobalNumber) {
    return;
  }

  // Update for the purpose of the next receipt, the ZIMRA credentials in the database
  await tenantDb.db
    .update(zimraCredentials)
    .set({
      //add +1 to the nextZimraReceiptCounter
      nextZimraReceiptCounter: (
        parseInt(currentZimraReceiptCounter, 10) + 1
      ).toString(),
      //add +1 to the nextZimraGlobalNo
      nextZimraGlobalNo: (
        parseInt(currentZimraGlobalNumber, 10) + 1
      ).toString(),
      receiptHash: hash,
      progress: "", //set progress to empty string so that the preceeding receipt can take the correct and free with no other details
    })
    .where(eq(zimraCredentials.deviceId, deviceId))
    .returning();
}
//FUNCTION TO CHECK DUPLICATE COUNTERS
async function checkDuplicateCounters(
  currentZimraGlobalNumber: number,
  currentZimraReceiptCounter: number,
  deviceId: string,
  merchantId: string,
) {
  const tenantDB = await getTenantDB(merchantId);
  if (!tenantDB) {
    return;
  }
  let duplicateCounter = true;
  //CHECK TO SEE IF THE GLOBAL NUMBER BEING USED HAS NOT BEEN USED BEFORE AND SAVED WITHIN SALES TABLE
  while (duplicateCounter === true) {
    const checkGlobalNumber = await tenantDB.db
      .select()
      .from(schema.sales)
      .where(
        sql`${schema.sales.zimraGlobalNo} = ${currentZimraGlobalNumber} AND ${schema.sales.zimraDeviceId} = ${deviceId}`,
      )
      .execute();
    if (checkGlobalNumber && checkGlobalNumber.length > 0) {
      //IF THE GLOBAL NUMBER HAS BEEN USED BEFORE, INCREMENT IT BY 1 AND USE IT
      currentZimraGlobalNumber = Number(currentZimraGlobalNumber) + 1;
      currentZimraReceiptCounter = Number(currentZimraReceiptCounter) + 1;
    } else {
      duplicateCounter = false;
    }
  }

  return {
    currentZimraGlobalNumber,
    currentZimraReceiptCounter,
  };
}

//--------------------------------------------------------------------------------------------------------------------------
//function for axios handler
export async function zimraAxiosHandler(
  receiptToBeSubmitted: any,
  deviceIdInt: number,
  httpsAgent: any,
) {
  try {
    let response;

    // console.log(receiptToBeSubmitted);
    if (receiptToBeSubmitted.receiptType === "FiscalInvoice") {
      // Wrap the receipt in submitReceiptRequest with Receipt (uppercase) as required by the API
      //BREATH A BIT
      response = await axios.post(
        `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/SubmitReceipt`,
        {
          //IF THE RECEIPT TYPE IS FISCAL INVOICE
          receipt: receiptToBeSubmitted,
        },
        {
          headers: {
            "Content-Type": "application/json",
            DeviceModelName: "Server",
            DeviceModelVersion: "v1",
          },
          httpsAgent,
          // timeout: 15000, // 15 second timeout
        },
      );
    } else if (receiptToBeSubmitted.receiptType === "CreditNote") {
      response = await axios.post(
        `${ZIMRA_API_URL}/Device/v1/${deviceIdInt}/SubmitReceipt`,
        {
          submitReceiptRequest: true,
          receipt: receiptToBeSubmitted,
        },
        {
          headers: {
            "Content-Type": "application/json",
            DeviceModelName: "Server",
            DeviceModelVersion: "v1",
          },
          httpsAgent,
          // timeout: 15000, // 15 second timeout
          transformRequest: [
            (data) =>
              JSON.stringify(data, (key, value) =>
                typeof value === "bigint" ? value.toString() : value,
              ),
          ],
        },
      );
    }
    //THEN PROGRESS COUNTERS FOR THE NEXT RECEIPT {only if the receipt was submitted successfully}}
    await new Promise((resolve) => setTimeout(resolve, 5000));
    // Track successful submissions
    return response;
  } catch (apiError: any) {
    // Efficiently categorize error types
    return apiError;
    // Log concise error summary
  }
}
//---------------------------------------------------------------------------------------------------------------------------
async function generateReceiptHash(
  receipt: any,
  deviceId: string,
  privateKey: string,
) {
  // Convert receipt total to cents
  const receiptTotalCents = Math.round(
    parseFloat(receipt.receiptTotal) * 100,
  ).toString();
  // Core receipt fields
  const hashInputParts: string[] = [
    deviceId.toString(),
    receipt.receiptType.toUpperCase(),
    receipt.receiptCurrency.toUpperCase(),
    receipt.receiptGlobalNo.toString(),
    receipt.receiptDate,
    receiptTotalCents,
  ];
  // Format tax lines

  const formattedTaxes = receipt.receiptTaxes
    .sort(
      (a: any, b: any) =>
        a.taxID - b.taxID || (a.taxCode || "").localeCompare(b.taxCode || ""),
    )
    .map((tax: any) => {
      const taxPercentStr =
        tax.taxPercent !== undefined && tax.taxPercent !== null
          ? Number(tax.taxPercent).toFixed(2)
          : "";

      return [
        tax.taxCode || "",
        taxPercentStr,
        Math.round(parseFloat(tax.taxAmount || 0) * 100).toString(),
        Math.round(parseFloat(tax.salesAmountWithTax || 0) * 100).toString(),
      ].join(""); // Note the double pipe separator
    });
  hashInputParts.push(formattedTaxes.join(""));
  hashInputParts.push(receipt.previousReceiptHash || "");
  // Combine all parts
  const concatenatedData = hashInputParts.join("");
  // console.log(
  //   "===================================================================",
  // );
  // console.log("Concatenated Data for Hashing:", concatenatedData);

  // Generate SHA-256 hash
  const hash = crypto
    .createHash("sha256")
    .update(concatenatedData)
    .digest("base64");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(concatenatedData);
  sign.end();

  //Generate the signature
  const signature = sign.sign(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    "base64",
  );
  return { hash: hash, signature: signature };
}

async function creditNote(sale: Sale, merchantId: string) {
  try {
    console.log(
      `Processing credit note for original receipt: ${sale.refundFor}`,
    );

    // Initialize variables for credit note processing
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      console.error(`Cannot get tenant database for merchant ${merchantId}`);
      throw new Error(
        `Cannot access tenant database for merchant ${merchantId}`,
      );
    }

    // Query the original receipt
    const originalQuery = "SELECT * FROM sales WHERE receipt = $1 LIMIT 1";
    const { rows: originalResults } = await tenantDB.pool.query(originalQuery, [
      sale.refundFor,
    ]);

    if (originalResults.length === 0) {
      console.error(`Original receipt ${sale.refundFor} not found`);
      throw new Error(`Original receipt ${sale.refundFor} not found`);
    }

    const originalReceipt = originalResults[0];
    // Extract ZIMRA data
    const originalReceiptGlobalNo = originalReceipt.zimra_global_no || "";
    const originalFiscalDayNo = originalReceipt.zimra_fiscal_day_no || "";
    const originalReceiptID = originalReceipt.zimra_receipt_id || "";

    if (
      !originalReceiptGlobalNo ||
      (!originalFiscalDayNo && !originalReceiptID)
    ) {
      throw new Error("Missing required ZIMRA reference data");
    }

    return {
      originalReceiptGlobalNo,
      originalFiscalDayNo,
      originalReceiptID,
      originalReceiptNumber: sale.refundFor,
      originalResults,
    };
  } catch (error) {
    console.error(`Error processing credit note:`, error);
    return {
      originalReceiptGlobalNo: "",
      originalFiscalDayNo: "",
      originalReceiptID: "",
      originalReceiptNumber: "",
      originalResults: [],
    };
  }
}
//=========================================================================================================================================

//=========================================================================================================================================
