# SlyRetail Email Notification System

## Overview

The SlyRetail Email Notification System allows merchants to receive automatic email notifications when new sales receipts are generated. The system uses the SlyRetail.com domain for sending emails and includes customizable notification preferences that are stored in the database.

## Features

- **Conditional Notifications**: Emails are sent only if the merchant has enabled notifications in their settings.
- **Professional Domain**: All emails are sent from the SlyRetail.com domain using Namecheap's PrivateEmail service.
- **Receipt Formatting**: Emails include properly formatted HTML receipts with store branding.
- **Multiple Notification Methods**: Support for both email and WhatsApp notifications (WhatsApp implementation is a placeholder for future integration).
- **Persistent Settings**: All notification preferences are stored in the database to ensure they persist across sessions.

## Technical Implementation

### Database Schema

Notification settings are stored in the `notification_settings` table with the following schema:

```sql
CREATE TABLE notification_settings (
  id SERIAL PRIMARY KEY,
  merchant_id TEXT NOT NULL UNIQUE,
  notification_status CHAR(1) NOT NULL DEFAULT 'N',
  email_notification CHAR(1) NOT NULL DEFAULT 'N',
  whatsapp_notification CHAR(1) NOT NULL DEFAULT 'N',
  notification_email TEXT,
  whatsapp_number TEXT,
  country_code TEXT DEFAULT '+263',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Email Configuration

The system uses a SMTP configuration with the following settings:

- SMTP Host: mail.privateemail.com (Namecheap's PrivateEmail service)
- SMTP Port: 587
- SMTP Security: TLS
- From Email: noreply@slyretail.com
- From Name: SlyRetail Receipts

### Notification Flow

1. When a new sale is processed, the system checks the merchant's notification preferences in the database.
2. If notifications are enabled (`notification_status = 'Y'`), the system proceeds with sending notifications.
3. If email notifications are enabled (`email_notification = 'Y'`), an email is sent to the configured email address.
4. If WhatsApp notifications are enabled (`whatsapp_notification = 'Y'`), a WhatsApp message would be sent (future implementation).

## API Endpoints

### GET /api/settings/notifications

Retrieves the current notification settings for a merchant.

**Headers**:
- `Authorization`: Bearer token for authentication

**Response**:
```json
{
  "success": true,
  "settings": {
    "enabled": true,
    "methods": {
      "email": true,
      "whatsapp": false
    },
    "emailAddress": "merchant@example.com",
    "whatsappNumber": "7123456789",
    "countryCode": "+263"
  }
}
```

### POST /api/settings/notifications

Updates notification settings for a merchant.

**Headers**:
- `Authorization`: Bearer token for authentication

**Request Body**:
```json
{
  "enabled": true,
  "methods": {
    "email": true,
    "whatsapp": false
  },
  "emailAddress": "merchant@example.com",
  "whatsappNumber": "7123456789",
  "countryCode": "+263"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Notification settings updated",
  "settings": {
    "enabled": true,
    "methods": {
      "email": true,
      "whatsapp": false
    },
    "emailAddress": "merchant@example.com",
    "whatsappNumber": "7123456789",
    "countryCode": "+263"
  }
}
```

## Multi-Tenant Architecture

The SlyRetail platform uses a multi-tenant database architecture where each merchant has their own separate database. This means that database migrations must be applied to all tenant databases, not just the main database.

### Multi-Tenant Migrations

When making changes to the database schema (like adding the notification_settings table), the changes must be applied to all tenant databases. The `tenant-db-fix.cjs` script is provided for this purpose:

```
node tenant-db-fix.cjs
```

This script:
1. Connects to the main database to get a list of all tenant databases
2. Connects to each tenant database
3. Checks if the notification_settings table already exists
4. Creates the table if it doesn't exist
5. Reports on the migration status

Always run this script after making changes to the database schema to ensure all tenant databases are updated.

### Automated Table Creation for New Tenants

For any new tenant databases created through the `createTenantDatabase` function in `server/tenant-db.ts`, the notification_settings table will be automatically created during the database initialization process. This ensures that all new merchants will have the notification infrastructure in place from the start.

If you need to specifically add the notification_settings table to all tenant databases (for example, after adding it to the schema), you can use the dedicated migration script:

```
node migrate-notification-settings.cjs
```

## Testing

Several test scripts are provided to test different aspects of the notification system:

- `test-notification-settings.cjs`: Tests the notification settings API
- `test-email-notification.cjs`: Tests sending email notifications
- `test-email-simple.js`: Simple email test using the configured SMTP settings
- `test-smtp-connection.js`: Tests the SMTP connection to verify email capabilities
- `test-notification-in-tenant.cjs`: Tests notification settings in a specific tenant database

To run these tests:

```
node test-notification-settings.cjs
node test-email-notification.cjs
node test-email-simple.js
node test-smtp-connection.js
node test-notification-in-tenant.cjs
```

### Testing Tenant-Specific Notification Settings

The `test-notification-in-tenant.cjs` script allows you to interact with notification settings for a specific tenant database. This is useful for testing and verifying that notifications are properly configured for individual merchants:

1. Run the script: `node test-notification-in-tenant.cjs`
2. Enter the merchant ID when prompted
3. The script will connect to that tenant's database and:
   - Check if the notification_settings table exists
   - Display current notification settings if they exist
   - Allow you to update existing settings or create new ones if none exist

This provides a convenient way to set up test notification configurations for specific merchants without modifying the entire system.

## Environment Variables

The following environment variables must be configured for the email notification system to work:

```
SMTP_USER=noreply@slyretail.com
SMTP_PASS=your-smtp-password
SMTP_HOST=mail.privateemail.com
SMTP_PORT=587
FROM_EMAIL=noreply@slyretail.com
FROM_NAME=SlyRetail Receipts
```

Note: For security best practices, always use the same email address for both SMTP_USER and FROM_EMAIL.