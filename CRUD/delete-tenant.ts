
import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function deleteTenantDatabase(tenantId: string) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // First check if the database exists
    const dbCheck = await adminPool.query(`
      SELECT datname FROM pg_database 
      WHERE datname = $1
    `, [tenantId]);

    if (dbCheck.rows.length === 0) {
      console.error(`Database '${tenantId}' does not exist`);
      return false;
    }

    // Force disconnect all clients from the database
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1;
    `, [tenantId]);

    // Drop the database
    await adminPool.query(`DROP DATABASE "${tenantId}"`);
    console.log(`Successfully deleted tenant database: ${tenantId}`);
    return true;

  } catch (error) {
    console.error("Error deleting tenant database:", error);
    return false;
  } finally {
    await adminPool.end();
  }
}

// Get tenant ID from command line argument
const tenantId = process.argv[2];

if (!tenantId) {
  console.error("Please provide a tenant ID as a command line argument");
  console.error("Usage: tsx CRUD/delete-tenant.ts <tenant-id>");
  process.exit(1);
}

// Run the function
deleteTenantDatabase(tenantId)
  .catch(console.error);
