import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function addColumnAllTenants(
  tableName: string,
  columnName: string,
  columnDefinition: string,
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
        AND datname != 'slyretailvfd'
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

        // Check if column already exists
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

        if (columnCheck.rows[0].exists) {
          console.log(
            `Column '${columnName}' already exists in table '${tableName}' for tenant ${tenantId}`,
          );
          continue;
        }

        // Add the column
        const addColumnQuery = `
          ALTER TABLE "${tableName}" 
          ADD COLUMN "${columnName}" ${columnDefinition};
        `;

        await tenantPool.query(addColumnQuery);

        console.log(
          `Successfully added column '${columnName}' to table '${tableName}' in tenant ${tenantId}`,
        );

        // Show updated table structure
        const columns = await tenantPool.query(
          `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          AND table_schema = 'public'
          ORDER BY ordinal_position;
        `,
          [tableName],
        );

        console.log("\nUpdated table structure:");
        console.log("=======================");
        columns.rows.forEach((col: any) => {
          console.log(
            `${col.column_name} (${col.data_type}) ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`,
          );
        });
      } catch (error) {
        console.error(`Error adding column in tenant ${tenantId}:`, error);
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
const columnDefinition = process.argv[4];

if (!tableName || !columnName || !columnDefinition) {
  console.error("Please provide all required arguments:");
  console.error(
    "Usage: tsx CRUD/add-column-all-tenants.ts <table-name> <column-name> <column-definition>",
  );
  console.error("Examples:");
  console.error(
    'tsx CRUD/add-column-all-tenants.ts fiscal_days device_id "TEXT" ',
  );
  console.error(
    'tsx CRUD/add-column-all-tenants.ts users last_login "TIMESTAMP"',
  );
  process.exit(1);
}

addColumnAllTenants(tableName, columnName, columnDefinition).catch(
  console.error,
);
