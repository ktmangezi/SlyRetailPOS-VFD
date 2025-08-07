# Database Utility Tools

This document describes a set of utility tools for managing and viewing tenant database content. These tools are designed to help you work with the SlyRetail multi-tenant database system.

## Overview

The SlyRetail platform uses a multi-tenant database architecture where each merchant has their own separate PostgreSQL database with a unique name matching their merchant ID. These tools help you:

1. View database table structure and data
2. Clean up and standardize tables 
3. Make quick updates to data

## Tools

### 1. View Tenant Tables Structure

**File:** `view-tenant-tables.cjs`

**Purpose:** Shows all tables in a tenant database along with their column structures.

**Usage:**
```
node view-tenant-tables.cjs [loyverse_token]
```

**Example:**
```
node view-tenant-tables.cjs d21e1aad44114979a13563ff1aa9cce9
```

### 2. View All Tables with Data

**File:** `view-all-tables-data.cjs`

**Purpose:** Shows all tables in a tenant database along with sample data from each table.

**Usage:**
```
node view-all-tables-data.cjs [loyverse_token] [max_rows]
```

**Example:**
```
node view-all-tables-data.cjs d21e1aad44114979a13563ff1aa9cce9 5
```

### 3. View Specific Table Data

**File:** `view-table-data.cjs`

**Purpose:** Shows data from a specific table in a clear, formatted way.

**Usage:**
```
node view-table-data.cjs [loyverse_token] [table_name] [max_rows]
```

**Example:**
```
node view-table-data.cjs d21e1aad44114979a13563ff1aa9cce9 zimra_credentials 10
```

### 4. Update Table Data

**File:** `update-table-data.cjs`

**Purpose:** Updates a specific field in a database record.

**Usage:**
```
node update-table-data.cjs [loyverse_token] [table_name] [id] [column_name] [new_value]
```

**Example:**
```
node update-table-data.cjs d21e1aad44114979a13563ff1aa9cce9 zimra_credentials 1 device_id "TEST-DEVICE-12345"
```

To set a value to NULL, use "NULL" as the new_value:
```
node update-table-data.cjs d21e1aad44114979a13563ff1aa9cce9 zimra_credentials 1 device_id "NULL"
```

### 5. Standardize ZIMRA Tables

**File:** `standardize-zimra-tables.cjs`

**Purpose:** Migrates data from multiple ZIMRA tables into a single standardized table with consistent naming.

**Usage:**
```
node standardize-zimra-tables.cjs [loyverse_token]
```

**Example:**
```
node standardize-zimra-tables.cjs d21e1aad44114979a13563ff1aa9cce9
```

### 6. Clean Up ZIMRA Tables

**File:** `cleanup-zimra-tables.cjs`

**Purpose:** Removes redundant ZIMRA tables after standardization.

**Usage:**
```
node cleanup-zimra-tables.cjs [loyverse_token]
```

**Example:**
```
node cleanup-zimra-tables.cjs d21e1aad44114979a13563ff1aa9cce9
```

## Best Practices

1. **Always use snake_case for table and column names** in PostgreSQL (e.g., `zimra_credentials` instead of `zimraCredentials`).

2. **Back up data before running update or migration scripts** to avoid accidental data loss.

3. **Use standardized table access** through the application's storage layer (in `server/storage.ts`) rather than direct SQL when possible.

4. **Check table structure first** with the viewing tools before making updates.

5. **Ensure database schema changes** are reflected in the application code (`shared/schema.ts`).
