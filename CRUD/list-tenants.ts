
import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function listTenantDatabases() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Query to get all databases excluding system databases
    const result = await adminPool.query(`
      SELECT datname AS database_name 
      FROM pg_database 
      WHERE datistemplate = false 
        AND datname != 'postgres'
        AND datname != 'slyretail'
        AND datname != 'neondb'
        AND datname NOT LIKE 'template%'
      ORDER BY datname;
    `);

    console.log("\nTenant Databases:");
    console.log("================");
    
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.database_name}`);
    });
    
    console.log(`\nTotal tenant databases: ${result.rows.length}`);

  } catch (error) {
    console.error("Error listing tenant databases:", error);
  } finally {
    await adminPool.end();
  }
}

// Run the function
listTenantDatabases()
  .catch(console.error);
