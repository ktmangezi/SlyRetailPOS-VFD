import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a random 20-character serial number for ZIMRA
 * Format: Alphanumeric, 20 characters (e.g., 07A83A5A8E3B4AF7A293)
 */
export function generateSerialNumber(): string {
  const chars = '0123456789ABCDEF';
  return Array.from(
    { length: 20 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

/**
 * Gets stored ZIMRA credentials from localStorage
 */
export function getZimraCredentials() {
  const stored = localStorage.getItem('zimra_credentials')
  if (!stored) return null
  return JSON.parse(stored)
}

/**
 * Saves ZIMRA credentials to localStorage
 */
export function saveZimraCredentials(credentials: {
  activationKey: string;
  deviceId: string;
  operationID: string;
  serialNumber: string;
  companyName?: string;
  tradeName?: string;
  tin?: string;
  vatNumber: string;
  taxPayerName?: string;  // Optional for backward compatibility
  taxPayerTIN?: string;   // Optional for backward compatibility
  deviceSerialNo: string;
  deviceBranchName: string;
  deviceBranchAddress: {
    province: string;
    street: string;
    houseNo: string;
    city: string;
  };
  deviceBranchContacts: {
    phoneNo: string;
    email: string;
  };
  deviceOperatingMode: string;
  certificateValidTill: string;
  qrUrl: string;
  isRegistered?: boolean;
  version?: string;
}) {
  // Map taxPayerName and taxPayerTIN to companyName and tin if not provided
  const finalCredentials = {
    ...credentials,
    companyName: credentials.companyName || credentials.taxPayerName || "",
    tin: credentials.tin || credentials.taxPayerTIN || "",
    isRegistered: credentials.isRegistered !== undefined ? credentials.isRegistered : true,
    version: credentials.version || "v1.01"
  };
  
  localStorage.setItem('zimra_credentials', JSON.stringify(finalCredentials))
}