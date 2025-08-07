
import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function dropTableAllTenants(tableName: string) {
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

      const baseUrl = process.env.DATABASE_URL.split("/").slice(0, -1).join("/");
      const tenantConnectionString = `${baseUrl}/${tenantId}`;
      const tenantPool = new Pool({ connectionString: tenantConnectionString });

      try {
        // Check if table exists
        const tableCheck = await tenantPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [tableName]);

        if (!tableCheck.rows[0].exists) {
          console.log(`Table '${tableName}' does not exist in tenant ${tenantId}`);
          continue;
        }

        // Drop the table
        await tenantPool.query(`DROP TABLE IF EXISTS "${tableName}";`);
        console.log(`Successfully dropped table '${tableName}' from tenant ${tenantId}`);

      } catch (error) {
        console.error(`Error dropping table in tenant ${tenantId}:`, error);
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

// Get command line arguments
const tableName = process.argv[2];

if (!tableName) {
  console.error("Please provide the table name:");
  console.error("Usage: tsx CRUD/drop-table-all-tenants.ts <table-name>");
  console.error("Example: tsx CRUD/drop-table-all-tenants.ts failed_receipts");
  process.exit(1);
}

// Run the function
dropTableAllTenants(tableName)
  .catch(console.error);
