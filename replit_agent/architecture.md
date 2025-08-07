# Architecture Overview - SlyRetail

## 1. Overview

SlyRetail is a point-of-sale (POS) application designed to help merchants manage sales receipts, with specific features for fiscalization and notifications. The system integrates with the Loyverse POS system and provides additional functionality for tax reporting, email notifications, and sales target monitoring. The architecture follows a modern web application structure with a clear separation between frontend and backend components.

The system is built as a multi-tenant application, where each merchant has their own isolated database while sharing the same application instance. This architecture supports scaling to multiple merchants while maintaining data isolation.

## 2. System Architecture

### 2.1 High-Level Architecture

SlyRetail follows a client-server architecture with:

- **Frontend**: React-based single-page application (SPA)
- **Backend**: Node.js API server using Express
- **Database**: PostgreSQL with multi-tenant isolation
- **External Integrations**: 
  - Loyverse POS API
  - ZIMRA (Zimbabwe Revenue Authority) fiscal services
  - Email service via SMTP
  - FiscalHarmony API

### 2.2 Multi-Tenant Database Architecture

A key architectural decision is the use of tenant-specific databases:

- Each merchant has a dedicated PostgreSQL database with a name matching their merchant ID
- A set of utility tools helps manage and view tenant database content
- Database connection pooling is used to efficiently manage connections
- The Drizzle ORM is used for database interactions

## 3. Key Components

### 3.1 Frontend

- **Technology Stack**: React, TypeScript, Vite
- **UI Framework**: Custom components built with Radix UI primitives and styled with Tailwind CSS
- **State Management**: React Query for server state, component-local state for UI
- **Key Features**:
  - Sales receipt management
  - Fiscal device integration
  - Email notification configuration
  - Sales target monitoring
  - PDF receipt generation and printing

The frontend is organized into:
- `/client/src/components`: UI components
- `/client/src/hooks`: Custom React hooks
- `/client/src/lib`: Utility functions
- `/client/src/pages`: Page components

### 3.2 Backend

- **Technology Stack**: Node.js, TypeScript, Express
- **API Routes**: RESTful endpoints for client interactions
- **Key Services**:
  - ZIMRA fiscalization integration
  - Email notification system
  - Multi-tenant database management
  - Sales data processing
  - PDF generation

The backend is organized into:
- `/server`: Main server code
- `/server/lib`: Backend libraries and utilities
- `/server/routes.ts`: API route definitions
- `/shared`: Code shared between frontend and backend

### 3.3 Database

- **Schema Management**: Drizzle ORM with schema definitions in `/shared/schema.ts`
- **Migration**: Drizzle Kit for schema migrations
- **Key Tables**:
  - `merchant_credentials`: Stores merchant authentication information
  - `zimra_credentials`: ZIMRA fiscalization device credentials
  - `notification_settings`: Email and other notification preferences
  - `currencies`: Currency conversion rates
  - `sales`: Sales receipt data

### 3.4 External Integrations

- **Loyverse POS**: Integration with third-party POS system
- **ZIMRA Fiscal Services**: Zimbabwe tax authority integration for fiscal reporting
- **Email Service**: SMTP-based email notifications
- **FiscalHarmony**: Optional integration for fiscalization services

## 4. Data Flow

### 4.1 Sales Process Flow

1. **Sale Creation**:
   - Sales data originates from Loyverse POS
   - Data is synchronized to SlyRetail via API
   - Sales data is stored in the merchant-specific database

2. **Fiscalization Flow**:
   - Sales are submitted to ZIMRA for fiscal reporting
   - Fiscal receipt numbers and QR codes are generated
   - Status is updated in the database

3. **Notification Flow**:
   - When a new sale is processed, system checks merchant notification preferences
   - If notifications are enabled, emails are sent with receipt details
   - Sales target monitoring compares sales against targets and sends appropriate alerts

### 4.2 Authentication Flow

1. Merchants authenticate using their Loyverse token
2. The system validates the token against the Loyverse API
3. Upon successful validation, the system identifies the corresponding tenant database
4. Subsequent requests are routed to the appropriate tenant database

## 5. External Dependencies

### 5.1 Core Dependencies

- **@neondatabase/serverless**: Database connectivity
- **drizzle-orm**: ORM for database operations
- **express**: Web server framework
- **react**: Frontend library
- **vite**: Build tool and development server
- **tailwindcss**: Utility-first CSS framework
- **@radix-ui**: Accessible UI component primitives
- **@tanstack/react-query**: Data fetching and caching
- **nodemailer**: Email functionality
- **pdf-lib**: PDF generation

### 5.2 External Services

- **Loyverse API**: Core POS data source
- **ZIMRA API**: Zimbabwe Revenue Authority fiscal services
- **SMTP Service**: Email delivery (configured for Namecheap's PrivateEmail)
- **FiscalHarmony API**: Optional fiscalization service

## 6. Deployment Strategy

### 6.1 Deployment Configuration

The application is configured for deployment to various environments:

- **Development**: Local development with Vite dev server
- **Production**: Node.js server with built frontend assets
- **Replit**: Cloud deployment with specific configuration

The deployment process includes:

1. Building the frontend with Vite
2. Bundling the server code with esbuild
3. Serving the static assets from the Express server

### 6.2 Environment Configuration

Environment variables are used for configuration:

- Database connection settings
- SMTP email configuration
- API keys and secrets
- Environment-specific settings

### 6.3 Multi-Environment Support

The application supports different deployment environments through:

- Environment-specific configurations
- Feature flags for enabling/disabling functionality
- Conditional code execution based on environment

## 7. Security Considerations

### 7.1 Authentication

- Token-based authentication with Loyverse credentials
- Session management for user sessions
- Secure credential storage in the database

### 7.2 Data Protection

- Tenant isolation through separate databases
- Encrypted communications with external services
- Sensitive data (like SMTP credentials) managed through environment variables

### 7.3 API Security

- CORS restrictions to prevent unauthorized access
- Input validation for all API endpoints
- Rate limiting to prevent abuse

## 8. Monitoring and Logging

- Server-side logging for monitoring application health
- Client-side error tracking with runtime error overlay in development
- Structured error handling for better debugging

## 9. Future Architecture Considerations

- **Scalability**: The multi-tenant architecture supports horizontal scaling
- **Performance**: Database connection pooling and query optimization
- **Resilience**: Error handling and retries for external service integrations
- **Extensibility**: Modular design allowing for new integrations and features