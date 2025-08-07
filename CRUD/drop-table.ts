
import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function dropTable(tenantId: string, tableName: string) {
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

    // Drop the table
    await tenantPool.query(`DROP TABLE IF EXISTS "${tableName}";`);
    console.log(`Successfully dropped table '${tableName}' from tenant ${tenantId}`);

  } catch (error) {
    console.error("Error dropping table:", error);
  } finally {
    await tenantPool.end();
  }
}

// Get command line arguments
const tenantId = process.argv[2];
const tableName = process.argv[3];

if (!tenantId || !tableName) {
  console.error("Please provide all required arguments:");
  console.error("Usage: tsx CRUD/drop-table.ts <tenant-id> <table-name>");
  console.error("Example:");
  console.error("  tsx CRUD/drop-table.ts tenant123 test_table");
  process.exit(1);
}

// Run the function
dropTable(tenantId, tableName)
  .catch(console.error);
