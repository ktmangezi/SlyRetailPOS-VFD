# SlyRetail Sales Target Monitoring

This document explains the sales target monitoring feature that has been added to the SlyRetail notification system.

## Overview

Sales target monitoring allows merchants to set targets for hourly and daily sales. When a sale is processed, the system evaluates the sales performance against these targets and sends a detailed status notification instead of the receipt.

## How It Works

1. Merchants set hourly and daily sales targets in the Email Notification settings.
2. When a new sale is processed, the system compares the sale amount against the configured targets.
3. The system sends a detailed sales status notification that includes:
   - Whether the sale meets or falls below the target
   - The percentage of the target achieved
   - Detailed sales figures (total with tax, tax amount, total before tax)
   - Target information

## Notification Types

**Target Met Email**
- Subject line prefixed with "✅ TARGET MET"
- Green background for status message
- Detailed sales breakdown with tax information
- Target achievement percentage

**Below Target Email**
- Subject line prefixed with "⚠️ BELOW TARGET"
- Red background for status message
- Detailed sales breakdown with tax information
- Target achievement percentage

## Setup Instructions

1. From the main screen, click on the "Settings" icon.
2. Select the "Notifications" tab.
3. Click on "Email" to open email notification settings.
4. Enable "Email Notifications".
5. Enter the email address where you want to receive notifications.
6. Enable "Sales Target Alerts".
7. Enter your hourly and daily sales targets.
8. Click the green checkmark to save your settings.

## How Targets Are Evaluated

- **Hourly Target**: Each individual sale is compared to your hourly target. The percentage achievement is calculated and reported.
- **Daily Target**: For daily targets, the system compares the sale against your daily target and calculates the percentage achievement.

## Database Changes

This feature required the following changes to the database schema:

1. Added `budget_alerts_enabled` field (text, default 'N') to the notification_settings table
2. Added `hourly_target` field (numeric, default 0) to the notification_settings table
3. Added `daily_target` field (numeric, default 0) to the notification_settings table

## Migrating Existing Tenant Databases

A migration script (`migrate-budget-alerts.cjs`) has been created to add these new fields to all existing tenant databases. Run the script using:

```
node migrate-budget-alerts.cjs
```

This will automatically:
1. Connect to the main database
2. Query for all merchant IDs
3. Connect to each tenant database
4. Add the new fields if they don't already exist
5. Log the migration progress

## Testing

You can test the sales target notification system using the provided test script:

```
node test-budget-alerts.cjs
```

This script will:
1. Update notification settings for a specified merchant
2. Send a test sales target status email
3. Show detailed information about the test

## Future Enhancements

Future versions could include:
- Aggregated daily/weekly sales reports against targets
- Historical performance analysis
- Trend visualizations
- Multi-store consolidated reporting
- Real-time dashboard for target monitoring
- Mobile push notifications for target alerts