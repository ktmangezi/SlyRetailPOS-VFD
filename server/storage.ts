import * as schema from "@shared/schema";
import { and, sql, eq } from "drizzle-orm";
import { Pool } from "pg";
import { getTenantDB } from "./tenant-db";

// This is the storage interface for the application
export interface IStorage {
  getZimraCredentials: (merchantId: string, deviceId?: string) => Promise<any>;
}

// Implementation using tenant database
export class DatabaseStorage implements IStorage {
  async getZimraCredentials(merchantId: string, deviceId?: string): Promise<any> {
    const tenantDB = await getTenantDB(merchantId);
    if (!tenantDB) {
      throw new Error("Failed to connect to tenant database");
    }
    
    // If deviceId is provided, look in zimraCredentials table
    if (deviceId) {
      const credentials = await tenantDB.db
        .select()
        .from(schema.zimraCredentials)
        .where(eq(schema.zimraCredentials.deviceId, deviceId))
        .execute();
        
      return credentials.length > 0 ? credentials[0] : null;
    } else {
      // Otherwise, look in fiscalizationCredentials table
      const credentials = await tenantDB.db
        .select()
        .from(schema.fiscalizationCredentials)
        .where(eq(schema.fiscalizationCredentials.merchantId, merchantId))
        .execute();
        
      return credentials.length > 0 ? credentials[0] : null;
    }
  }
}

// Export a global storage instance
export const storage = new DatabaseStorage();