import {
  type Sale,
  type LoyverseReceipt,
  type LoyverseStore,
} from "@shared/schema";

export async function updateZimraStatus(
  zimraFiscalDayNo: string,
  zimraDeviceId: string,
): Promise<{ success: boolean; sale?: Sale }> {
  try {
    console.log(`Updating ZIMRA status for sale ${zimraFiscalDayNo}`);
    const token = localStorage.getItem("loyverseToken");
    const res = await fetch("/slyretail/sales/reSubmitReceipt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, zimraFiscalDayNo, zimraDeviceId }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("ZIMRA status update failed:", error);
      throw new Error(`Failed to update ZIMRA status: ${error}`);
    }

    const response = await res.json();
    console.log("ZIMRA status update response:", response);
    return {
      success: true,
      sale: response.sale,
    };
  } catch (error) {
    console.error("Error updating ZIMRA status:", error);
    return { success: false };
  }
}

export async function checkTenantDatabaseStatus(
  token: string,
): Promise<{ status: string; tables?: any }> {
  try {
    const res = await fetch("/api/tenant-db-status", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Tenant database status check failed:", error);
      throw new Error(`Failed to check tenant database: ${error}`);
    }

    return await res.json();
  } catch (error) {
    console.error("Error checking tenant database status:", error);
    throw error;
  }
}

import { getToken, clearToken } from "./store";

export async function validateToken(
  token: string,
): Promise<{ stores: LoyverseStore[]; database?: string }> {
  try {
    // First test the token format
    if (!token || typeof token !== "string" || token.length < 10) {
      console.error("Token validation failed: Invalid token format");
      throw new Error("Invalid token format");
    }

    console.log("Testing token with local API...");
    // Test token validity
    const testRes = await fetch("/api/test-token", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!testRes.ok) {
      const error = await testRes.text();
      console.error("Token test failed:", error);
      clearToken(); // Clear invalid token
      throw new Error(`Token validation failed: ${error}`);
    }

    console.log("Token passed local test, validating with Loyverse API...");
    // Validate with Loyverse API and initialize tenant database
    const res = await fetch("/api/validate-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Loyverse API validation failed:", error);
      clearToken(); // Clear invalid token
      throw new Error(`Failed to validate API token: ${error}`);
    }

    const data = await res.json();
    console.log("Token validated successfully");
    return data;
  } catch (error) {
    console.error("Token validation error:", error);
    clearToken(); // Clear token on any error
    throw error instanceof Error ? error : new Error("Token validation failed");
  }
}

export async function syncLoyverseSales(storeId: string): Promise<void> {
  const token = getToken();
  if (!token) {
    throw new Error("Please enter your Loyverse API token to continue");
  }

  await fetch(`/api/sales?store_id=${storeId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function refreshLoyverseSales(
  token: string,
  storedStoreId: string,
  currentPage: number,
  itemsPerPage: number,
  lastProcessedSaleId: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      store_id: storedStoreId,
      page: currentPage.toString(),
      page_size: itemsPerPage.toString(), // Use user-selected page size
      since_id: lastProcessedSaleId,
    });
    // console.log("Refreshing sales data from Loyverse API...");
    const response = await fetch(`/slyretail/sales?${params.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Refresh failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log("Refresh result:", data);
    return data.success || false;
  } catch (error) {
    console.error("Error refreshing sales from Loyverse:", error);
    return false;
  }
}

// Track highest sale ID for incremental updates
let highestSaleId = 0;

// Interface for paginated response
export interface PaginatedSalesResponse {
  data: Sale[];
  pagination: {
    total_records: number;
    total_pages: number;
    current_page: number;
    page_size: number;
    highest_id: number;
  };
}

export async function fetchSales(
  token: string,
  storeId?: string,
  page: number = 1,
  pageSize: number = 50,
  incrementalOnly: boolean = false,
): Promise<Sale[]> {
  console.log(
    "FETCH SALES - Request starting at:",
    new Date().toISOString(),
    "- Store:",
    storeId,
    "- Token:",
    token.substring(0, 8) + "...",
    incrementalOnly
      ? `- Incremental since ID: ${highestSaleId}`
      : `- Page: ${page}/${pageSize}`,
  );

  // Build query parameters
  const params = new URLSearchParams({
    store_id: storeId || "All Stores", // Default to "All Stores" if no storeId
    page: page.toString(),
    page_size: pageSize.toString(),
  });

  // For incremental updates, only fetch records with IDs higher than what we've seen
  if (incrementalOnly && highestSaleId > 0) {
    params.append("since_id", highestSaleId.toString());
  }

  try {
    console.log(
      `FETCH SALES - Making HTTP request to: /slyretail/sales?${params.toString()}`,
    );
    const res = await fetch(`/slyretail/sales?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.log(`FETCH SALES - Error response, status: ${res.status}`);
      if (res.status === 401) {
        clearToken();
        throw new Error(
          "Your API token has expired. Please enter a new token.",
        );
      }

      const error = await res.text();
      console.error(`FETCH SALES - Failed with error: ${error}`);
      throw new Error(`Failed to fetch sales data: ${error}`);
    }

    console.log(`FETCH SALES - Response OK, status: ${res.status}`);

    // Simplified approach - just get the array directly
    const responseData = await res.json();

    // If we get data back, find the highest ID for incremental fetching
    if (Array.isArray(responseData) && responseData.length > 0) {
      const maxId = Math.max(...responseData.map((item) => item.id || 0));
      if (maxId > highestSaleId) {
        highestSaleId = maxId;
        console.log(`FETCH SALES - Updated highest sale ID: ${highestSaleId}`);
      }
    }

    console.log(
      `FETCH SALES - Data received: ${Array.isArray(responseData) ? responseData.length : 0} records`,
    );

    return Array.isArray(responseData) ? responseData : [];
  } catch (error) {
    console.error("FETCH SALES - Exception caught:", error);
    if (error instanceof Error && error.message.includes("API token")) {
      clearToken();
    }
    throw error;
  }
}

export async function saveSalesData(sales: Sale[]): Promise<{
  successful: Array<{ id: number; receipt: string }>;
  failed: Array<{ receipt: string; error: string }>;
}> {
  const token = getToken();
  if (!token) {
    throw new Error("API token not found");
  }

  const res = await fetch("/api/sales", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sales),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to save sales data: ${errorText}`);
  }

  return await res.json();
}
