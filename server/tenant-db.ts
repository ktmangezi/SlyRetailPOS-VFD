import "dotenv/config"; // Loads .env
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import { sql } from "drizzle-orm";

// Ensure WebSocket support for Neon serverless
neonConfig.webSocketConstructor = ws;
//let dbConnections= {}
let dbConnections: Record<
  string,
  { pool: Pool; db: ReturnType<typeof drizzle> }
> = {};

// Function to clear existing database connections ece7d04e-0e8c-4c94-ba1a-442dcfb2d9b8
function clearDbConnections() {
  console.log(dbConnections);

  for (const key in dbConnections) {
    const { pool } = dbConnections[key];
    pool.end().catch((err) => console.error("Error closing pool: ", err));
    delete dbConnections[key];
  }
}
export async function getTokenByMerchantID(
  merchantId: string,
): Promise<string | null> {
  //call the gettenantDB function to get the database connection for the merchant
  await getTenantDB(merchantId);
  //loop within all existing databases, checking where the token is matching
  for (const [dbName, { pool, db }] of Object.entries(dbConnections)) {
    const credentials = await db
      .select()
      .from(schema.merchantCredentials)
      .where(sql`${schema.merchantCredentials.merchantId} = ${merchantId}`)
      .execute();
    if (credentials.length > 0) {
      return credentials[0].loyverseToken;
    }
  }
  return null;
}

export async function getMerchantIDBYToken(
  token: string,
): Promise<string | null> {
  //loop within all existing databases, checking where the token is matching
  for (const [dbName, { pool, db }] of Object.entries(dbConnections)) {
    const credentials = await db
      .select({
        merchantId: schema.merchantCredentials.merchantId,
        loyverseToken: schema.merchantCredentials.loyverseToken,
      })
      .from(schema.merchantCredentials)
      .where(sql`${schema.merchantCredentials.loyverseToken} = ${token}`)
      .execute();
    if (credentials.length > 0) {
      return dbName;
    }
  }
  return null;
}

export async function getTenantDB(
  merchantId: string,
): Promise<{ pool: Pool; db: ReturnType<typeof drizzle> } | null> {
  // Check if we already have a connection for this merchant
  if (dbConnections[merchantId]) {
    return dbConnections[merchantId];
  } else {
    // console.log(process.env.DATABASE_URL);
    // clearDbConnections();

    const baseUrl = process.env.DATABASE_URL?.split("/").slice(0, -1).join("/");
    if (!baseUrl) {
      throw new Error("DATABASE_URL base is not properly configured");
    }

    try {
      const tenantConnectionString = `${baseUrl}/${merchantId}`;
      // console.log(`Connecting to tenant database: ${merchantId}`);

      // Create a new pool and database connection for this tenant
      const tenantPool = new Pool({ connectionString: tenantConnectionString });
      const tenantDB = drizzle(tenantPool, { schema });

      // Test the connection and ensure tables exist
      try {
        // await tenantPool.query(ALTER_SALES_TABLE);
        const salesResult = await tenantDB.execute(
          sql`SELECT COUNT(*) FROM sales`,
        );

        if (salesResult) {
          dbConnections[merchantId] = { pool: tenantPool, db: tenantDB };
          console.log("User with database", merchantId, "connected");
          return dbConnections[merchantId];
        }
      } catch (error) {
        console.error("Error checking/creating tables:");
        return null;
      }

      return null;
    } catch (error) {
      console.error("Failed to connect to tenant database:", error);
      return null;
    }
  }
}

export async function createTenantDatabase(
  merchantId: string,
  token: string,
  merchantData?: {
    business_name?: string;
    tin?: string;
    vat?: string;
  },
): Promise<boolean> {
  try {
    const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });

    try {
      // Create the new database with the merchantId as the name
      await adminPool.query(`CREATE DATABASE "${merchantId}"`);

      const baseUrl = process.env.DATABASE_URL?.split("/")
        .slice(0, -1)
        .join("/");
      if (!baseUrl) {
        throw new Error("DATABASE_URL base is not properly configured");
      }

      const tenantConnectionString = `${baseUrl}/${merchantId}`;
      const tenantPool = new Pool({
        connectionString: tenantConnectionString,
      });

      // Initialize schema tables
      // Create merchant_credentials table
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS merchant_credentials (
          id SERIAL PRIMARY KEY,
          merchant_id TEXT NOT NULL UNIQUE,
          loyverse_token TEXT NOT NULL,
          merchant_name TEXT,
          tin TEXT,
          vat TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          last_login TIMESTAMP
        )
      `);

      // Create the sales table
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id SERIAL PRIMARY KEY,
          receipt TEXT NOT NULL UNIQUE,
          receipt_type TEXT NOT NULL,
          refund_for TEXT,
          cancelled_at TEXT,
          note TEXT,
          total NUMERIC NOT NULL,
          total_inc NUMERIC NOT NULL,
          vat_amount NUMERIC NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          items JSONB NOT NULL,
          store_name TEXT NOT NULL,
          store_id TEXT NOT NULL,
          store_address TEXT NOT NULL,
          store_tin_number TEXT NOT NULL,
          store_vat_number TEXT NOT NULL,
          store_city TEXT NOT NULL,
          store_province TEXT NOT NULL,
          store_email_number TEXT NOT NULL,
          store_contact_number TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_address TEXT,
          customer_city TEXT,
          customer_email TEXT,
          customer_contact TEXT,
          customer_tin TEXT,
          customer_vat TEXT,
          footer_text TEXT,
          payments JSONB NOT NULL,
          receipt_hash TEXT,
          zimra_submitted BOOLEAN DEFAULT FALSE,
          zimra_submission_date TIMESTAMP,
          zimra_receipt_id TEXT,
          zimra_device_id TEXT,
          zimra_receipt_qr_data TEXT,
          zimra_error TEXT,
          zimra_qr_url TEXT,
          zimra_fiscal_day_no TEXT,
          zimra_operation_id TEXT,
          zimra_fiscal_day_id TEXT,
          zimra_global_no TEXT,
          receipt_counter TEXT,
          submission_route TEXT
        )
      `);

      // Create the failed receipts table
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS failed_receipts (
          id SERIAL PRIMARY KEY,
          receipt TEXT NOT NULL UNIQUE,
          receipt_type TEXT NOT NULL,
          refund_for TEXT,
          cancelled_at TEXT,
          note TEXT,
          total NUMERIC NOT NULL,
          total_inc NUMERIC NOT NULL,
          vat_amount NUMERIC NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          items JSONB NOT NULL,
          store_name TEXT NOT NULL,
          store_id TEXT NOT NULL,
          store_address TEXT NOT NULL,
          store_tin_number TEXT NOT NULL,
          store_vat_number TEXT NOT NULL,
          store_city TEXT NOT NULL,
          store_province TEXT NOT NULL,
          store_email_number TEXT NOT NULL,
          store_contact_number TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          customer_address TEXT,
          customer_city TEXT,
          customer_email TEXT,
          customer_contact TEXT,
          customer_tin TEXT,
          customer_vat TEXT,
          footer_text TEXT,
          payments JSONB NOT NULL,
          receipt_hash TEXT,
          zimra_submitted BOOLEAN DEFAULT FALSE,
          zimra_submission_date TIMESTAMP,
          zimra_receipt_id TEXT,
          zimra_device_id TEXT,
          zimra_receipt_qr_data TEXT,
          zimra_error TEXT,
          zimra_qr_url TEXT,
          zimra_fiscal_day_no TEXT,
          zimra_operation_id TEXT,
          zimra_fiscal_day_id TEXT,
          zimra_global_no TEXT,
          receipt_counter TEXT,
          submission_route TEXT
        )
      `);

      // Create currencies table
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS currencies (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          iso_code TEXT,
          rate NUMERIC NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS webhook_queue (
          id SERIAL PRIMARY KEY,
          payload JSON NOT NULL,
          merchant_id VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          processed_at TIMESTAMP NULL,
          error_message TEXT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_queue_status ON webhook_queue(status);
        CREATE INDEX IF NOT EXISTS idx_webhook_queue_merchant ON webhook_queue(merchant_id);
      `);
      //create the zimra_credentials table
      await tenantPool.query(`
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
      `); // TO INCLUDE SUBMISSION ROUTE

      // Create fiscalization_credentials table {TOBE REMOVED}
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS fiscalization_credentials (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          merchant_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          app_secret TEXT NOT NULL,
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // Create fiscal_days table
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS fiscal_days (
          id SERIAL PRIMARY KEY,
          opened_at TIMESTAMP NOT NULL,
          closed_at TIMESTAMP,
          device_id TEXT NOT NULL,
          device_serial_number TEXT,
          fiscal_day_no TEXT NOT NULL,
          fiscal_counters JSONB NOT NULL,
          operator_id TEXT NOT NULL,
          day_end_time TIMESTAMP NOT NULL,
          total_transactions NUMERIC DEFAULT 0,
          total_amount NUMERIC DEFAULT 0,
          total_vat NUMERIC DEFAULT 0,
          status TEXT NOT NULL,
          report_status TEXT NOT NULL,
          error_details TEXT,
          submission_attempts NUMERIC DEFAULT 0,
          manual_closure BOOLEAN DEFAULT FALSE,
          manual_closure_reason TEXT,
          last_submission_date TIMESTAMP
        )
      `);

      // Create notification_settings table with all required fields {TO BE REMOVED}
      await tenantPool.query(`
        CREATE TABLE IF NOT EXISTS notification_settings (
          id SERIAL PRIMARY KEY,
          merchant_id TEXT NOT NULL UNIQUE,
          notification_status CHAR(1) NOT NULL DEFAULT 'N',
          email_notification CHAR(1) NOT NULL DEFAULT 'N',
          whatsapp_notification CHAR(1) NOT NULL DEFAULT 'N',
          notification_email TEXT,
          whatsapp_number TEXT,
          country_code TEXT DEFAULT '+263',
          budget_alerts_enabled CHAR(1) NOT NULL DEFAULT 'N',
          hourly_target NUMERIC DEFAULT 0,
          daily_target NUMERIC DEFAULT 0,
          target_period TEXT DEFAULT 'Hourly',
          calculation_basis TEXT DEFAULT 'By Tax',
          target_min NUMERIC DEFAULT 0.01,
          target_max NUMERIC DEFAULT 0.5,
          hourly_notification_frequency TEXT DEFAULT 'every',
          daily_notification_time TEXT DEFAULT '20:00',
          weekly_notification_day TEXT DEFAULT 'Sunday',
          weekly_notification_time TEXT DEFAULT '20:00',
          monthly_notification_day TEXT DEFAULT 'last',
          monthly_notification_time TEXT DEFAULT '20:00',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      await tenantPool.end();
      await adminPool.end();

      const db = await getTenantDB(merchantId);
      if (!db) {
        throw new Error("Failed to connect to newly created database");
      }

      // Store merchant credentials using Drizzle
      await db.db.insert(schema.merchantCredentials).values({
        merchantId: merchantId,
        loyverseToken: token,
        merchantName: merchantData?.business_name || null,
        tin: merchantData?.tin || null,
        vat: merchantData?.vat || null,
      });

      return true;
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        const db = await getTenantDB(merchantId);
        if (!db) {
          throw new Error("Failed to connect to already existing database");
        }
        return true;
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("Failed to create tenant database:", error);
    return false;
  }
}
