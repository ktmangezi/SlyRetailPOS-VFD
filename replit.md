# SlyRetail - POS Fiscalization System

## Overview

SlyRetail is a comprehensive point-of-sale (POS) fiscalization system designed for retail merchants, with specialized support for Zimbabwe's ZIMRA (Zimbabwe Revenue Authority) fiscal requirements. The application integrates with Loyverse POS systems to provide receipt management, fiscal device integration, email notifications, and sales target monitoring capabilities.

The system is built as a multi-tenant application where each merchant operates with their own isolated database while sharing the same application infrastructure, enabling efficient scaling across multiple merchants.

## System Architecture

### Frontend Architecture
- **Technology Stack**: React with TypeScript, built using Vite
- **UI Framework**: Custom components using Radix UI primitives styled with Tailwind CSS
- **State Management**: React Query for server state management, local component state for UI
- **Key Features**: Sales receipt management, fiscal device integration, PDF generation, email notifications

### Backend Architecture
- **Technology Stack**: Node.js with Express server
- **Database**: PostgreSQL with multi-tenant isolation (each merchant has dedicated database)
- **ORM**: Drizzle ORM for type-safe database operations
- **External Integrations**: Loyverse POS API, ZIMRA fiscal services, SMTP email, FiscalHarmony API

### Multi-Tenant Database Design
Each merchant operates with a completely isolated PostgreSQL database:
- Database naming convention: matches merchant ID
- Connection pooling for efficient resource management
- Tenant-specific schema with shared structure
- Database utility tools for management and viewing

## Key Components

### Sales Management
- Receipt processing and storage
- VAT calculation and tax handling
- Multiple payment type support
- Sales target monitoring with configurable alerts
- CSV export and reporting capabilities

### Fiscal Integration
- **ZIMRA Integration**: Full Zimbabwe Revenue Authority compliance
- **FiscalHarmony**: Alternative fiscal service provider
- Device registration and status monitoring
- Receipt fiscalization and QR code generation
- Fiscal day management (open/close operations)

### Notification System
- **Email Notifications**: SMTP-based using SlyRetail.com domain
- **Sales Target Alerts**: Configurable hourly/daily targets with email notifications
- **WhatsApp Integration**: Placeholder for future implementation
- Persistent notification preferences stored per merchant

### PDF and Printing
- Multiple receipt formats (A4, 80mm, 50mm thermal)
- QR code integration for fiscal compliance
- Professional receipt templates with merchant branding
- Direct printing capabilities

## Data Flow

1. **Sales Processing**: Loyverse POS → Webhook → SlyRetail → Database Storage
2. **Fiscalization**: Sale Data → ZIMRA/FiscalHarmony API → Fiscal Receipt Generation
3. **Notifications**: Sale Event → Settings Check → Email/SMS Dispatch
4. **Reporting**: Database Query → Processing → PDF/CSV Generation

## External Dependencies

### Required Services
- **PostgreSQL Database**: Multi-tenant data storage
- **Loyverse API**: POS system integration (token-based authentication)
- **ZIMRA API**: Zimbabwe fiscal compliance (test: fdmsapitest.zimra.co.zw, prod: fdmsapi.zimra.co.zw)
- **SMTP Service**: Email notifications via mail.privateemail.com
- **Neon Database**: Cloud PostgreSQL hosting

### Optional Services
- **FiscalHarmony API**: Alternative fiscal provider
- **WhatsApp API**: Future messaging integration

## Deployment Strategy

### Development Environment
- Replit-based development with live reload
- Local PostgreSQL for development database
- Environment-specific configuration via .env files

### Production Deployment
- **Platform**: Google Cloud Run (configured in .replit)
- **Build Process**: Vite build for frontend, esbuild for backend
- **Database**: Neon PostgreSQL with connection pooling
- **Environment Variables**: Production ZIMRA URLs, SMTP credentials

### Configuration Management
- Environment-specific API endpoints (test vs production ZIMRA)
- Secure credential storage for API keys and database connections
- Tenant database auto-provisioning on first access

## Recent Changes

- August 3, 2025: Fixed dark mode compatibility in Manage Currencies dialog
  - Updated table row backgrounds to use proper dark mode colors (bg-blue-50 dark:bg-blue-900/20)
  - Fixed hover states for clickable currency cells (hover:bg-gray-100 dark:hover:bg-gray-700)
  - Enhanced ISO code badges with dark mode support (bg-gray-100 dark:bg-gray-700)
  - Updated text colors for "Selected" label and delete button (text-blue-600 dark:text-blue-400)
  - Added proper dark mode hover effects for delete button (hover:bg-red-50 dark:hover:bg-red-900/20)
  - All interactive elements now properly adapt between light and dark themes

- August 3, 2025: Added loading state to new currency creation process
  - Implemented loading spinner with "Adding Currency..." text during creation
  - Disabled form controls during loading to prevent multiple submissions
  - Added automatic dialog closure after successful currency creation
  - Enhanced error handling with proper toast notifications

- August 3, 2025: Fixed currencies dropdown visibility issue in Settings modal
  - Replaced standard Select component with custom dropdown implementation
  - Created always-visible dropdown that stays within modal boundaries
  - Added proper scrolling for multiple currencies without cutoff
  - Implemented animated chevron icon that rotates on open/close
  - Added hover effects and proper spacing for better user experience
  - Dropdown shows all currencies with names, ISO codes, and exchange rates
  - Closes automatically when selecting options or closing modal

- July 30, 2025: Converted Z-Reports page to modal interface
  - Created ZReportsModal component for better user experience
  - Modal displays fiscal days table with Day Number, Device ID, Day Opened, Day Closed, Status, Actions
  - Removed Transactions and Total Amount columns as requested
  - Fixed PDF generation error by converting string values to numbers with parseFloat()
  - Modal can be opened from main page Z-Reports button and closed to return
  - Maintained all functionality including PDF download and auto-refresh

- July 30, 2025: Implemented comprehensive dark/light theme system
  - Added ThemeProvider context with light, dark, and system modes
  - Created General settings tab with theme toggle controls
  - Updated CSS with proper dark mode color variables
  - Fixed main background and card colors for dark mode compatibility
  - Theme preferences save automatically to localStorage
  - System mode follows device's system preferences

- June 30, 2025: Added comprehensive integration guidelines to Virtual Fiscal Device interface
  - Created streamlined 3-step integration guide (Setup Loyverse Store → Get API Token → Connect to SlyRetail)
  - Built interactive slideshow for token generation with Loyverse screenshots
  - Updated with correct Loyverse token steps (Integration Icon → Access Token → Disable expiration)
  - Made guidelines collapsible behind information icon for cleaner interface
  - Removed data flow and benefits sections for more focused approach

## Changelog

- June 20, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.