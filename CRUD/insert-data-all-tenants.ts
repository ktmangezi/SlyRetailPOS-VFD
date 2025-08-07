import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function insertDataAllTenants(
  tableName: string,
  data: Record<string, any>,
) {
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
        // Check if table exists
        const tableCheck = await tenantPool.query(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `,
          [tableName],
        );

        if (!tableCheck.rows[0].exists) {
          console.log(
            `Table '${tableName}' does not exist in tenant ${tenantId}`,
          );
          continue;
        }

        // Create the insert query dynamically
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

        const insertQuery = `
          INSERT INTO "${tableName}" (${columns.join(", ")})
          VALUES (${placeholders})
          RETURNING *;
        `;

        const result = await tenantPool.query(insertQuery, values);
        console.log(
          `Successfully inserted data into table '${tableName}' in tenant ${tenantId}`,
          result.rows[0],
        );
      } catch (error) {
        console.error(`Error inserting data in tenant ${tenantId}:`, error);
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
const jsonData = process.argv[3];

if (!tableName || !jsonData) {
  console.error("Please provide all required arguments:");
  console.error(
    "Usage: tsx CRUD/insert-data-all-tenants.ts <table-name> '<json-data>'",
  );
  console.error("Example:");
  console.error(
    `tsx CRUD/insert-data-all-tenants.ts currencies '{"name": "USD", "rate": 1.0}'`,
  );
  process.exit(1);
}
//tsx CRUD/insert-data-all-tenants.ts zimra_credentials '{"zimra_fiscal_day_no": "1"}'
try {
  const data = JSON.parse(jsonData);
  insertDataAllTenants(tableName, data).catch(console.error);
} catch (error) {
  console.error("Error parsing JSON data:", error);
  process.exit(1);
}
