import { Pool, neonConfig } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

async function modifyTable(
  tenantId: string,
  tableName: string,
  operation: string,
  columnDetails: string,
) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set");
  }

  const baseUrl = process.env.DATABASE_URL.split("/").slice(0, -1).join("/");
  const tenantConnectionString = `${baseUrl}/${tenantId}`;
  const tenantPool = new Pool({ connectionString: tenantConnectionString });

  try {
    // First verify if table exists
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
      console.error(`Table '${tableName}' does not exist in tenant database`);
      return;
    }

    // Execute the modification
    let sql = "";
    switch (operation.toLowerCase()) {
      case "add":
        sql = `ALTER TABLE "${tableName}" ADD COLUMN ${columnDetails};`;
        break;
      case "drop":
        sql = `ALTER TABLE "${tableName}" DROP COLUMN ${columnDetails};`;
        break;
      case "alter":
        sql = `ALTER TABLE "${tableName}" ALTER COLUMN ${columnDetails};`;
        break;
      case "rename":
        sql = `ALTER TABLE "${tableName}" RENAME COLUMN ${columnDetails};`;
        break;
      default:
        throw new Error("Invalid operation. Use: add, drop, alter, or rename");
    }

    await tenantPool.query(sql);
    console.log(`Successfully modified table '${tableName}'`);

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
    console.error("Error modifying table:", error);
  } finally {
    await tenantPool.end();
  }
}

// Get command line arguments
const tenantId = process.argv[2];
const tableName = process.argv[3];
const operation = process.argv[4];
const columnDetails = process.argv[5];

if (!tenantId || !tableName || !operation || !columnDetails) {
  console.error("Please provide all required arguments:");
  console.error(
    "Usage: tsx CRUD/modify-table.ts <tenant-id> <table-name> <operation> <column-details>",
  );
  console.error("Operations: add, drop, alter, rename");
  console.error("Examples:");
  console.error(
    '  Add column:    tsx CRUD/modify-table.ts tenant123 users add "email TEXT NOT NULL"',
  );
  console.error(
    "  Drop column:   tsx CRUD/modify-table.ts tenant123 users drop email",
  );
  console.error(
    '  Alter column:  tsx CRUD/modify-table.ts tenant123 users alter "email SET NOT NULL"',
  );
  console.error(
    '  Rename column: tsx CRUD/modify-table.ts ce9cc4bb-8102-48ec-bde9-cd8de0bf0331 fiscal_days rename "device_serialNumber TO device_serial_number"',
  );
  process.exit(1);
}

// Run the function
modifyTable(tenantId, tableName, operation, columnDetails).catch(console.error);
