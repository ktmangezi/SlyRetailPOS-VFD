
import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function updateColumnAllTenants(
  tableName: string,
  columnName: string,
  value: any,
  whereClause?: string,
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

      const baseUrl = process.env.DATABASE_URL.split("/").slice(0, -1).join("/");
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
          console.log(`Table '${tableName}' does not exist in tenant ${tenantId}`);
          continue;
        }

        // Check if column exists
        const columnCheck = await tenantPool.query(
          `
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = $1 
            AND column_name = $2
          );
        `,
          [tableName, columnName],
        );

        if (!columnCheck.rows[0].exists) {
          console.log(
            `Column '${columnName}' does not exist in table '${tableName}' for tenant ${tenantId}`,
          );
          continue;
        }

        // Update the column
        const updateQuery = `
          UPDATE "${tableName}" 
          SET "${columnName}" = $1
          ${whereClause ? `WHERE ${whereClause}` : ""}
          RETURNING *;
        `;

        const result = await tenantPool.query(updateQuery, [value]);

        console.log(
          `Updated ${result.rowCount} rows in table '${tableName}' for tenant ${tenantId}`,
        );
        if (result.rows.length > 0) {
          console.log("Sample updated row:", result.rows[0]);
        }
      } catch (error) {
        console.error(`Error updating column in tenant ${tenantId}:`, error);
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
const columnName = process.argv[3];
const value = process.argv[4];
const whereClause = process.argv[5];

if (!tableName || !columnName || !value) {
  console.error("Please provide all required arguments:");
  console.error(
    "Usage: tsx CRUD/update-column-all-tenants.ts <table-name> <column-name> <value> [where-clause]",
  );
  console.error("Examples:");
  console.error(
    'tsx CRUD/update-column-all-tenants.ts sales status "completed"',
  );
  console.error(
    'tsx CRUD/update-column-all-tenants.ts users active true "id = 5"',
  );
  process.exit(1);
}

updateColumnAllTenants(tableName, columnName, value, whereClause).catch(
  console.error,
);
