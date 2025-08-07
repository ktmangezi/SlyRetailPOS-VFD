import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";
import { sales } from "../shared/schema";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function createTableAllTenants() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Get all tenant databases
    const tenantsResult = await adminPool.query(`
      SELECT datname AS database_name 
      FROM pg_database 
      WHERE datistemplate = false 
        AND datname != 'postgres'
        AND datname != 'slyretail'
        AND datname != 'neondb'
        AND datname NOT LIKE 'template%'
      ORDER BY datname;
    `);

    console.log(`Found ${tenantsResult.rows.length} tenant databases`);

    // Process each tenant
    for (const tenant of tenantsResult.rows) {
      const tenantId = tenant.database_name;
      console.log(`\nProcessing tenant: ${tenantId}`);

      const baseUrl = process.env.DATABASE_URL.split("/")
        .slice(0, -1)
        .join("/");
      const tenantConnectionString = `${baseUrl}/${tenantId}`;
      const tenantPool = new Pool({ connectionString: tenantConnectionString });

      try {
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
        console.log(
          `Successfully created webhook_queue table in tenant ${tenantId}`,
        );
      } catch (error) {
        console.error(`Error creating table in tenant ${tenantId}:`, error);
      } finally {
        await tenantPool.end();
      }
    }
  } catch (error) {
    console.error("Error processing tenant databases:", error);
  } finally {
    await adminPool.end();
  }
}
//example
//tsx CRUD/create-table-all-tenants.ts
// Run the function
createTableAllTenants().catch(console.error);
