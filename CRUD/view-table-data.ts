import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function viewTableData(tenantId: string, tableName: string, limit: number = 10) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const baseUrl = process.env.DATABASE_URL.split("/").slice(0, -1).join("/");
  const tenantConnectionString = `${baseUrl}/${tenantId}`;
  const tenantPool = new Pool({ connectionString: tenantConnectionString });

  try {
    // First verify if table exists
    const tableCheck = await tenantPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);

    if (!tableCheck.rows[0].exists) {
      console.error(`Table '${tableName}' does not exist in tenant database`);
      return;
    }

    // Get the data with limit
    const result = await tenantPool.query(`
      SELECT * FROM "${tableName}"
      LIMIT $1
    `, [limit]);

    if (result.rows.length === 0) {
      console.log(`\nNo data found in table: ${tableName}`);
      return;
    }

    console.log(`\n=== Data from table: ${tableName} ===\n`);
    
    // Format and display as JSON
    console.log(JSON.stringify(result.rows, null, 2));
    
    console.log(`\nTotal rows: ${result.rows.length}\n`);

  } catch (error) {
    console.error("Error viewing table data:", error);
  } finally {
    await tenantPool.end();
  }
}

// Get command line arguments
const tenantId = process.argv[2];
const tableName = process.argv[3];
const limit = parseInt(process.argv[4] || '10', 10);

if (!tenantId || !tableName) {
  console.error("Please provide tenant ID and table name as command line arguments");
  console.error("Usage: tsx CRUD/view-table-data.ts <tenant-id> <table-name> [limit]");
  process.exit(1);
}
// tsx CRUD/view-table-data.ts 759be7b2-93bb-4e05-9b84-eb5c056d41e8 sales 1000
// CRUD/view-table-data.ts b5b2f43c-a4b5-46b7-b5c7-358ecb9aae4e 
// Run the function
viewTableData(tenantId, tableName, limit)
  .catch(console.error);