import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function viewTenantTables(tenantId: string) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const baseUrl = process.env.DATABASE_URL.split("/").slice(0, -1).join("/");
  const tenantConnectionString = `${baseUrl}/${tenantId}`;
  const tenantPool = new Pool({ connectionString: tenantConnectionString });

  try {
    // Query to get all tables in the tenant database
    const tablesResult = await tenantPool.query(`
      SELECT 
        table_name,
        (
          SELECT json_agg(json_build_object(
            'column_name', column_name,
            'data_type', data_type,
            'is_nullable', is_nullable
          ))
          FROM information_schema.columns
          WHERE table_name = t.table_name
        ) as columns
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("\nTenant Database Tables:");
    console.log("======================");

    tablesResult.rows.forEach((table) => {
      console.log(`\nTable: ${table.table_name}`);
      console.log("Columns:");
      table.columns.forEach((column: any) => {
        console.log(
          `  - ${column.column_name} (${column.data_type})${column.is_nullable === "YES" ? " NULL" : " NOT NULL"}`,
        );
      });
    });
  } catch (error) {
    console.error("Error viewing tenant tables:", error);
  } finally {
    await tenantPool.end();
  }
}

// Get tenant ID from command line argument
const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Please provide a tenant ID as a command line argument");
  process.exit(1);
}
// tsx CRUD/view-tenant-tables.ts b5b2f43c-a4b5-46b7-b5c7-358ecb9aae4e
// Run the function
viewTenantTables(tenantId).catch(console.error);
