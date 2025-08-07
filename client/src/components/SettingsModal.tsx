import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Link2,
  Plus,
  RefreshCw,
  Settings,
  Info as InfoIcon,
  Link,
  X,
  Trash2,
  Pencil,
  CheckCircle,
  Clock,
  ShieldAlert,
  Cog,
  Info,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getZimraCredentials,
  saveZimraCredentials,
  generateSerialNumber,
} from "@/lib/utils";
import { zimraClient } from "@/lib/zimra";
import type {
  DeviceOperatingMode,
  FiscalDayStatus,
  FiscalDayReportStatus,
} from "@shared/zimra";
import type { FiscalizationProvider } from "@shared/schema";

interface Currency {
  name: string;
  isoCode: string;
  rate: number;
}

interface ReceiptSize {
  value: string;
}

interface ReceiptSettings {
  currencies: Currency[];
  invoicePrefix: string;
  receiptSize: string;
  autoDownload: {
    enabled: boolean;
    format: "pdf" | "csv" | "fiscalHarmonyInvoice" | "revmaxInvoice";
  };
  // notifications section removed as per client request
}

// Updated getStoredSettings with notifications removed
const getStoredSettings = (): ReceiptSettings => {
  const stored = localStorage.getItem("receiptSettings");
  if (stored) {
    const parsedSettings = JSON.parse(stored);

    // Remove any notification references from existing settings
    if (parsedSettings.notifications) {
      delete parsedSettings.notifications;
    }

    // Migrate old currency format to new format with isoCode
    if (parsedSettings.currencies) {
      parsedSettings.currencies = parsedSettings.currencies.map(
        (currency: any) => {
          if (!currency.isoCode) {
            // If currency doesn't have isoCode, use name as isoCode and update name to be descriptive
            return {
              name:
                currency.name === "USD"
                  ? "US Dollar"
                  : currency.name === "EUR"
                    ? "Euro"
                    : currency.name,
              isoCode: currency.name,
              rate: currency.rate,
            };
          }
          return currency;
        },
      );
    }

    return parsedSettings;
  }

  // Default settings with notifications removed
  return {
    currencies: [{ name: "US Dollar", isoCode: "USD", rate: 1.0 }],
    invoicePrefix: "INV",
    receiptSize: "80mm",
    autoDownload: {
      enabled: false,
      format: "pdf",
    },
  };
};

interface NewCurrencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (currency: Currency) => void;
  isLoading?: boolean;
}

function NewCurrencyDialog({
  open,
  onOpenChange,
  onSave,
  isLoading = false,
}: NewCurrencyDialogProps) {
  const [name, setName] = useState("");
  const [isoCode, setIsoCode] = useState("");
  const [rate, setRate] = useState("1.0");

  const handleSave = () => {
    if (!name.trim() || !isoCode.trim() || !rate || parseFloat(rate) <= 0) {
      return;
    }
    onSave({
      name: name.trim(),
      isoCode: isoCode.trim().toUpperCase(),
      rate: parseFloat(rate),
    });
    setName("");
    setIsoCode("");
    setRate("1.0");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add New Currency</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the currency details below. The rate should be relative to
            your base currency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g. US Dollar, Euro"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isoCode" className="text-right">
              ISO Code
            </Label>
            <Input
              id="isoCode"
              value={isoCode}
              onChange={(e) => setIsoCode(e.target.value)}
              className="col-span-3"
              placeholder="e.g. USD, EUR"
              maxLength={3}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rate" className="text-right">
              Rate
            </Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="col-span-3"
              placeholder="Exchange rate"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Adding Currency...
              </>
            ) : (
              "Add Currency"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface UpdateCurrencyRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: Currency;
  onUpdate: (name: string, newRate: number) => void;
}

function UpdateCurrencyRateDialog({
  open,
  onOpenChange,
  currency,
  onUpdate,
}: UpdateCurrencyRateDialogProps) {
  const [rate, setRate] = useState(currency.rate.toString());

  const handleUpdate = () => {
    const newRate = parseFloat(rate);
    if (!rate || newRate <= 0) {
      return;
    }
    onUpdate(currency.name, newRate);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Update {currency.name} Exchange Rate
          </AlertDialogTitle>
          <AlertDialogDescription>
            Enter the new exchange rate for {currency.name}. This rate should be
            relative to your base currency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rate" className="text-right">
              Exchange Rate
            </Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="col-span-3"
              placeholder="Exchange rate"
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleUpdate}>
            Update Rate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ZimraDevice {
  id: number;
  deviceId: string;
  serialNumber: string;
  companyName: string;
  tradeName?: string;
  status: "registered" | "pending" | "expired";
  certificateValidTill?: string;
  registrationDate?: string;
  lastChecked?: Date;
  isOnline?: boolean;
}

interface ZimraSettings {
  activationKey: string;
  deviceId: string;
  operationID: string;
  serialNumber: string;
  isRegistered: boolean;
  version: string;
  // User input fields
  companyName: string;
  tradeName: string;
  tin: string;
  vatNumber: string;
  // Additional fields from registration response
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
  deviceOperatingMode: DeviceOperatingMode;
  certificateValidTill: string;
  qrUrl: string;
}

interface ManageCurrenciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencies: Currency[];
  selectedCurrency?: Currency | null;
  onAddCurrency: () => void;
  onEditCurrency: (currency: Currency) => void;
  onRemoveCurrency: (currencyName: string) => void;
  onUpdateCurrency: (oldCurrency: Currency, newCurrency: Currency) => void;
}

function ManageCurrenciesDialog({
  open,
  onOpenChange,
  currencies,
  selectedCurrency,
  onAddCurrency,
  onEditCurrency,
  onRemoveCurrency,
  onUpdateCurrency,
}: ManageCurrenciesDialogProps) {
  const [editingCell, setEditingCell] = useState<{
    currencyName: string;
    currencyIsoCode: string;
    field: "name" | "isoCode" | "rate";
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleCellEdit = (
    currency: Currency,
    field: "name" | "isoCode" | "rate",
  ) => {
    console.log("Cell edit clicked:", field, currency);
    setEditingCell({
      currencyName: currency.name,
      currencyIsoCode: currency.isoCode,
      field,
    });
    setEditValue(field === "rate" ? currency.rate.toString() : currency[field]);
  };

  const handleSaveEdit = () => {
    if (!editingCell) return;

    const currency = currencies.find(
      (c) =>
        c.name === editingCell.currencyName &&
        c.isoCode === editingCell.currencyIsoCode,
    );
    if (!currency) return;

    const updatedCurrency = { ...currency };

    if (editingCell.field === "name") {
      updatedCurrency.name = editValue.trim();
    } else if (editingCell.field === "isoCode") {
      updatedCurrency.isoCode = editValue.trim().toUpperCase();
    } else if (editingCell.field === "rate") {
      updatedCurrency.rate = parseFloat(editValue) || currency.rate;
    }

    onUpdateCurrency(currency, updatedCurrency);
    setEditingCell(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const isEditing = (
    currency: Currency,
    field: "name" | "isoCode" | "rate",
  ) => {
    return (
      editingCell?.currencyName === currency.name &&
      editingCell?.currencyIsoCode === currency.isoCode &&
      editingCell?.field === field
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Manage Currencies</DialogTitle>
          <DialogDescription>
            View and manage all your currencies with their ISO codes and
            exchange rates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>IsoCode</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead className="w-24 text-center">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies
                  .filter(
                    (currency) => selectedCurrency?.name === currency.name,
                  )
                  .map((currency) => (
                    <TableRow
                      key={currency.isoCode}
                      className={
                        selectedCurrency?.name === currency.name
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800"
                      }
                    >
                      <TableCell className="font-medium">
                        {isEditing(currency, "name") ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="h-8 text-sm"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => handleCellEdit(currency, "name")}
                            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-150 min-h-[32px] flex items-center"
                            title="Click to edit currency name"
                          >
                            {currency.name}
                            {selectedCurrency?.name === currency.name && (
                              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-medium">
                                (Selected)
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing(currency, "isoCode") ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="h-8 text-sm w-20"
                            maxLength={3}
                          />
                        ) : (
                          <span
                            onClick={() => handleCellEdit(currency, "isoCode")}
                            className={`inline-flex items-center px-3 py-2 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 ${
                              selectedCurrency?.name === currency.name
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                            }`}
                            title="Click to edit ISO code"
                          >
                            {currency.isoCode}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing(currency, "rate") ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleSaveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            type="number"
                            step="0.01"
                            className="h-8 text-sm w-24"
                          />
                        ) : (
                          <div
                            onClick={() => {
                              console.log(
                                "Rate cell clicked for:",
                                currency.name,
                              );
                              handleCellEdit(currency, "rate");
                            }}
                            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded transition-colors duration-150 min-h-[32px] flex items-center"
                            title="Click to edit exchange rate"
                          >
                            {Number(currency.rate).toFixed(2)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {selectedCurrency?.name === currency.name && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveCurrency(currency.name)}
                            className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 mx-auto"
                            title="Delete currency"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConnectAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (provider: string, appId: string, appSecret: string) => void;
}

function ConnectAppDialog({
  open,
  onOpenChange,
  onConnect,
}: ConnectAppDialogProps) {
  const [provider, setProvider] =
    useState<FiscalizationProvider>("FiscalHarmony");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingCredentials, setExistingCredentials] = useState<{
    hasAppId: boolean;
    hasAppSecret: boolean;
  } | null>(null);
  const { toast } = useToast();

  // Check for existing credentials when provider changes
  const checkExistingCredentials = async (
    selectedProvider: FiscalizationProvider,
  ) => {
    if (selectedProvider === "FiscalHarmony") {
      try {
        setIsLoading(true);
        const result = await import("@/lib/fiscalHarmony").then((module) =>
          module.checkFiscalHarmonyCredentials(),
        );

        if (result.success && result.hasCredentials && result.data) {
          setExistingCredentials({
            hasAppId: result.data.hasAppId,
            hasAppSecret: result.data.hasAppSecret,
          });

          toast({
            title: "Existing Credentials Found",
            description:
              "You already have credentials for this provider. Submitting new ones will replace the existing ones.",
            variant: "default",
          });
        } else {
          setExistingCredentials(null);
        }
      } catch (error) {
        console.error("Error checking credentials:", error);
        setExistingCredentials(null);
        toast({
          title: "Error Checking Credentials",
          description:
            "Could not verify existing credentials. You may proceed to enter new ones.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      // For other providers, implement similar checks as needed
      setExistingCredentials(null);
    }
  };

  // Check credentials when component mounts or when provider changes
  useEffect(() => {
    if (open) {
      checkExistingCredentials(provider);
    }
  }, [provider, open]);

  const handleConnect = () => {
    if (!appId.trim() || !appSecret.trim()) {
      return;
    }
    onConnect(provider, appId.trim(), appSecret.trim());
    setAppId("");
    setAppSecret("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Connect Fiscalization Provider</AlertDialogTitle>
          <AlertDialogDescription>
            Select your fiscalization service provider and enter your
            credentials.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="provider" className="text-right">
              Provider
            </Label>
            <div className="col-span-3 flex items-center gap-2">
              <div className="flex-grow">
                <Select
                  value={provider}
                  onValueChange={(value: FiscalizationProvider) =>
                    setProvider(value)
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FiscalHarmony">
                      Fiscal Harmony
                    </SelectItem>
                    <SelectItem value="AxisSolution">Axis Solution</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isLoading && (
                <div className="animate-spin text-primary">
                  <RefreshCw className="h-4 w-4" />
                </div>
              )}
            </div>
          </div>

          {existingCredentials ? (
            <div className="bg-muted p-3 rounded-md text-sm mb-2">
              <p className="font-medium flex items-center gap-1">
                <Info className="h-4 w-4" /> Existing credentials found
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Submitting new credentials will replace the existing ones.
              </p>
            </div>
          ) : (
            provider === "FiscalHarmony" &&
            !isLoading && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm mb-2">
                <p className="font-medium flex items-center gap-1 text-amber-700">
                  <Info className="h-4 w-4" /> Fiscal Harmony is not connected
                </p>
                <p className="text-amber-600 text-xs mt-1">
                  Please provide your Fiscal Harmony App ID and App Secret to
                  connect.
                </p>
              </div>
            )
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="appId" className="text-right">
              App ID {existingCredentials?.hasAppId && "(exists)"}
            </Label>
            <Input
              id="appId"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              className="col-span-3"
              placeholder={
                existingCredentials?.hasAppId
                  ? "Already saved (enter to update)"
                  : "Enter your App ID"
              }
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="appSecret" className="text-right">
              App Secret {existingCredentials?.hasAppSecret && "(exists)"}
            </Label>
            <Input
              id="appSecret"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              className="col-span-3"
              placeholder={
                existingCredentials?.hasAppSecret
                  ? "Already saved (enter to update)"
                  : "Enter your App Secret"
              }
              disabled={isLoading}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConnect} disabled={isLoading}>
            {isLoading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : existingCredentials ? (
              "Update Credentials"
            ) : (
              "Connect Provider"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SettingsModal() {
  const [settings, setSettings] =
    useState<ReceiptSettings>(getStoredSettings());
  const [initialSettings, setInitialSettings] =
    useState<ReceiptSettings>(getStoredSettings());
  const [open, setOpen] = useState(false);
  const [showNewCurrencyDialog, setShowNewCurrencyDialog] = useState(false);
  // Email dialog state removed
  // WhatsApp dialog state removed
  const [selectedCurrencyForUpdate, setSelectedCurrencyForUpdate] =
    useState<Currency | null>(null);
  const { toast } = useToast(); // Define toast at the top level of the component
  const { theme, setTheme, actualTheme } = useTheme();
  const [zimraSettings, setZimraSettings] = useState<ZimraSettings>(() => ({
    ...(getZimraCredentials() || {
      activationKey: "",
      deviceId: "",
      operationID: "",
      serialNumber: generateSerialNumber(),
      isRegistered: false,
      version: "v1",
      // Initialize new fields
      companyName: "",
      tradeName: "",
      tin: "",
      vatNumber: "",
      deviceSerialNo: "",
      deviceBranchName: "",
      deviceBranchAddress: {
        province: "",
        street: "",
        houseNo: "",
        city: "",
      },
      deviceBranchContacts: {
        phoneNo: "",
        email: "",
      },
      deviceOperatingMode: "",
      certificateValidTill: "",
      qrUrl: "",
    }),
  }));
  const [isRegistering, setIsRegistering] = useState(false);
  const [fiscalDayStatus, setFiscalDayStatus] =
    useState<FiscalDayStatus>("Closed");
  const [fiscalDayReportStatus, setFiscalDayReportStatus] =
    useState<FiscalDayReportStatus>("Pending");

  // State for ZIMRA devices list
  const [zimraDevices, setZimraDevices] = useState<ZimraDevice[]>([]);

  // Function to fetch ZIMRA credentials from the API
  const fetchZimraCredentialsFromAPI = async (deviceId?: string) => {
    try {
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        console.error("No token found in localStorage");
        return;
      }

      // First, fetch all ZIMRA credentials to populate the device list

      // Use the correct endpoint for getting all ZIMRA credentials
      const allCredsResponse = await fetch("/api/zimraCredentials/all", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (allCredsResponse.ok) {
        const allCredsData = await allCredsResponse.json();

        // Handle both array response and object response with credentials array
        const credentialsArray = Array.isArray(allCredsData) 
          ? allCredsData 
          : allCredsData.credentials || [];

        if (credentialsArray.length > 0) {
          // Transform API data to our device list format
          const devicesList: ZimraDevice[] = credentialsArray.map((cred: any, index: number) => {
            // Determine device status based on certificateValidTill if available
            let status: "registered" | "pending" | "expired" = "registered";

            if (cred.certificateValidTill) {
              const validUntil = new Date(cred.certificateValidTill);
              const now = new Date();
              status = validUntil < now ? "expired" : "registered";
            }

            return {
              id: index + 1,
              deviceId: cred.deviceId,
              serialNumber:
                cred.deviceSerialNo ||
                cred.serialNumber ||
                `ZIMRA-SERIAL-${cred.deviceId}`,
              companyName:
                cred.taxPayerName || cred.companyName || "Unknown Company",
              tradeName: cred.tradeName || cred.deviceBranchName || "",
              status: status,
              certificateValidTill: cred.certificateValidTill,
              registrationDate:
                cred.registrationDate ||
                cred.createdAt ||
                new Date().toISOString().split("T")[0],
            };
          });

          setZimraDevices(devicesList);
        } else {
          // No credentials found - set empty array
          setZimraDevices([]);
        }
      } else if (allCredsResponse.status === 404) {
        // Handle 404 - no credentials found, this is normal
        setZimraDevices([]);
      } else if (allCredsResponse.status === 401) {
        // Handle 401 - token invalid, silently set empty array
        setZimraDevices([]);
        console.log("ZIMRA credentials fetch: Authentication token invalid");
      } else {
        // Handle other errors
        console.error("Failed to fetch ZIMRA credentials:", allCredsResponse.status);
        setZimraDevices([]);
      }

      // Then, if a specific deviceId is provided, fetch its details
      if (deviceId) {
        // Use the correct endpoint for getting a specific ZIMRA credential
        const url = `/api/zimraCredentials?deviceId=${encodeURIComponent(deviceId)}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            return; // Not an error, just no data yet
          }
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        if (data) {
          // Update the ZIMRA settings with data from the database
          setZimraSettings((prevState) => ({
            ...prevState,
            // Map fields from API response to our state
            deviceId: data.deviceId || prevState.deviceId,
            tin: data.taxPayerTIN || prevState.tin,
            vatNumber: data.vatNumber || prevState.vatNumber,
            companyName: data.taxPayerName || prevState.companyName,
            tradeName:
              data.tradeName || prevState.tradeName || prevState.companyName,
            serialNumber:
              data.deviceSerialNo ||
              data.serialNumber ||
              prevState.serialNumber,
            certificateValidTill:
              data.certificateValidTill || prevState.certificateValidTill,
            isRegistered: true, // If we have creds in the DB, we're registered
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching ZIMRA credentials:", error);
      toast({
        title: "Error Loading ZIMRA Settings",
        description: "Failed to load your ZIMRA credentials from the database",
        variant: "destructive",
      });
    }
  };
  const [submissionAttempts, setSubmissionAttempts] = useState(0);
  const [isLoadingFiscalDay, setIsLoadingFiscalDay] = useState(false);
  const [manualClosureReason, setManualClosureReason] = useState("");
  const [showManualClosureDialog, setShowManualClosureDialog] = useState(false);
  const [showRegistrationConfirm, setShowRegistrationConfirm] = useState(false);

  // State for tracking ZIMRA device statuses
  const [deviceStatuses, setDeviceStatuses] = useState<
    Array<{
      deviceId: string;
      isOnline: boolean;
      lastPingTimestamp: Date;
      reportingFrequency: number;
      operationID: string;
      error?: string;
    }>
  >([]);
  const [lastStatusCheck, setLastStatusCheck] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showCompanyDetailsModal, setShowCompanyDetailsModal] = useState(false);
  const [storeName, setStoreName] = useState(""); // This is unused now, but keeping for completeness in case of future requirements.
  const [showUpdateRateDialog, setShowUpdateRateDialog] = useState(false);
  const [showConnectAppDialog, setShowConnectAppDialog] = useState(false);
  const [showManageCurrenciesDialog, setShowManageCurrenciesDialog] =
    useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [isAddingCurrency, setIsAddingCurrency] = useState(false);
  const [connectedProviders, setConnectedProviders] = useState<
    FiscalizationProvider[]
  >([]);

  // Handle dialog opening and closing
  const handleOpenChange = (open: boolean) => {
    if (open) {
      // When opening the dialog, store the initial settings
      const currentSettings = getStoredSettings();
      setSettings(currentSettings);
      setInitialSettings(currentSettings);
    } else {
      // When closing the dialog without saving, restore initial settings
      setSettings(initialSettings);
      // Close currency dropdown when modal closes
      setCurrencyDropdownOpen(false);
    }
    setOpen(open);
  };

  // Check for connected providers and fetch ZIMRA devices on component mount only if there are devices registered

  useEffect(() => {
    const initializeSettings = async () => {
      try {
        // Check for fiscalization providers
        const providerResponse = await fetch(
          "/api/fiscalization/credentials/check",
        );
        if (providerResponse.ok) {
          const providerData = await providerResponse.json();
          if (
            providerData.success &&
            providerData.providers &&
            providerData.providers.length > 0
          ) {
            setConnectedProviders(
              providerData.providers as FiscalizationProvider[],
            );
          }
        }

        // Fetch ZIMRA devices list - with proper authentication handling
        const token = localStorage.getItem("loyverseToken");
        if (token) {
          try {
            const deviceResponse = await fetch("/api/zimraCredentials/all", {
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });

            if (deviceResponse.ok) {
              const deviceData = await deviceResponse.json();
              console.log("All ZIMRA credentials fetched:", deviceData);

              if (Array.isArray(deviceData) && deviceData.length > 0) {
                // Transform API data to our device list format
                const devicesList: ZimraDevice[] = deviceData.map(
                  (cred, index) => {
                    // Determine device status based on certificateValidTill if available
                    let status: "registered" | "pending" | "expired" =
                      "registered";

                    if (cred.certificateValidTill) {
                      const validUntil = new Date(cred.certificateValidTill);
                      const now = new Date();
                      status = validUntil < now ? "expired" : "registered";
                    }

                    return {
                      id: index + 1,
                      deviceId: cred.deviceId || `unknown-${index}`,
                      serialNumber:
                        cred.deviceSerialNo ||
                        cred.serialNumber ||
                        `ZIMRA-SERIAL-${cred.deviceId || index}`,
                      companyName: cred.taxPayerName || "Unknown Company",
                      tradeName: cred.tradeName || cred.deviceBranchName || "",
                      status: status,
                      certificateValidTill: cred.certificateValidTill,
                      registrationDate:
                        cred.createdAt?.split("T")[0] ||
                        new Date().toISOString().split("T")[0],
                    };
                  },
                );

                setZimraDevices(devicesList);
              } else {
                // Empty array or no devices - initialize with empty list
                setZimraDevices([]);
              }
            } else if (deviceResponse.status === 401) {
              console.warn(
                "Authentication failed for ZIMRA devices - token may be invalid",
              );
              // Initialize with empty list but don't throw error
              setZimraDevices([]);
            } else if (deviceResponse.status === 404) {
              console.log(
                "No ZIMRA credentials found - this is normal for new users",
              );
              setZimraDevices([]);
            } else {
              console.error(
                "Error fetching ZIMRA devices:",
                deviceResponse.status,
                deviceResponse.statusText,
              );
              setZimraDevices([]);
            }
          } catch (error) {
            console.error("Network error fetching ZIMRA devices:", error);
            // Initialize with empty list to prevent crashes
            setZimraDevices([]);
          }
        } else {
          console.log(
            "No authentication token found - skipping ZIMRA device fetch",
          );
          setZimraDevices([]);
        }
      } catch (error) {
        console.error("Error initializing settings:", error);
      }
    };

    initializeSettings();
  }, []);

  // Update ZIMRA devices list when registration status changes
  useEffect(() => {
    // If device is registered, add it to the devices list if not already there
    if (zimraSettings.isRegistered && zimraSettings.deviceId) {
      setZimraDevices((prevDevices) => {
        // Check if this device is already in the list
        const deviceExists = prevDevices.some(
          (device) => device.deviceId === zimraSettings.deviceId,
        );

        if (!deviceExists) {
          // Add the newly registered device to the list
          return [
            ...prevDevices,
            {
              id: prevDevices.length + 1,
              deviceId: zimraSettings.deviceId,
              serialNumber:
                zimraSettings.deviceSerialNo || zimraSettings.serialNumber,
              companyName: zimraSettings.companyName || "Unknown",
              tradeName:
                zimraSettings.tradeName || zimraSettings.deviceBranchName || "",
              status: "registered",
              certificateValidTill: zimraSettings.certificateValidTill,
              registrationDate: new Date().toISOString().split("T")[0], // Today's date
            },
          ];
        }

        // Otherwise, return the existing list
        return prevDevices;
      });
    }
  }, [zimraSettings.isRegistered, zimraSettings.deviceId]);

  const checkAllDevicesStatus = async () => {
    // if (zimraDevices.length === 0) return;
    if (isCheckingStatus) return;
    // alert(zimraDevices.length);
    try {
      setIsCheckingStatus(true);
      const token = localStorage.getItem("loyverseToken");

      if (!token) {
        console.error("No token found in localStorage");
        return;
      }

      const response = await fetch(`/api/zimra/ping-all`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Add authorization if needed
          // "Authorization": `Bearer ${token}`
        },
        credentials: "include", // Important for session cookies
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ping All Devices Failed: ${response.status} - ${errorText}`,
        );
      }

      const responseData = await response.json();

      if (responseData.success) {
        // Update state with the new statuses
        setZimraDevices((prevDevices) =>
          prevDevices.map((device) => {
            const deviceStatus = responseData.deviceStatuses.find(
              (s: { deviceId: string }) => s.deviceId === device.deviceId,
            );

            return {
              ...device,
              status: deviceStatus?.isOnline ? "registered" : "expired",
              lastChecked: responseData.timestamp,
              isOnline: deviceStatus?.isOnline || false,
            };
          }),
        );

        const timestamp = new Date(responseData.timestamp);

        // Add 2 hours (7200000 milliseconds = 2 hours)
        timestamp.setTime(timestamp.getTime() + 2 * 60 * 60 * 1000);

        // Format as YYYY-MM-DD HH:MM:SS
        const formattedTimestamp = timestamp
          .toISOString()
          .replace("T", " ")
          .replace(/\.\d{3}Z$/, "");

        // Example: "2025-05-03 12:22:05" (if original was "2025-05-03T10:22:05.243Z")
        setLastStatusCheck(formattedTimestamp);

        // If you need to track overall online status
        const allOnline = responseData.deviceStatuses.every(
          (device: { isOnline: boolean }) => device.isOnline,
        );
        setDeviceStatuses(allOnline);
      }
    } catch (error) {
      console.error("Error checking device status:", error);
      // Optionally set error state
      return {
        hasError: true,
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    } finally {
      setIsCheckingStatus(false);
    }
  };



  // Set up automatic status check every 5 minutes
  useEffect(() => {
    // Check status immediately when the ZIMRA tab is selected
    const zimraTab = document.querySelector('[value="zimra"]');
    //check if the zimradevices array has length = to 1 and greter then check if the deviceid is present with a avalue
    if (zimraDevices.length >= 1 && zimraDevices[0].deviceId) {
      // console.log(zimraDevices);
      const handleTabClick = () => {
        checkAllDevicesStatus();
      };

      if (zimraTab) {
        zimraTab.addEventListener("click", handleTabClick);
      }

      // Check device status immediately on mount
      checkAllDevicesStatus();

      // Set up interval for checking every 5 minutes (300000 ms)
      const intervalId = setInterval(
        () => {
          checkAllDevicesStatus();
        },
        5 * 60 * 1000,
      );

      // Clean up event listener and interval on unmount
      return () => {
        if (zimraTab) {
          zimraTab.removeEventListener("click", handleTabClick);
        }
        clearInterval(intervalId);
      };
    }
  }, [zimraDevices.length]); // Only re-run when the devices list changes

  // Function to fetch currencies from database
  const fetchCurrenciesFromAPI = async () => {
    try {
      const token = localStorage.getItem("loyverseToken");
      if (!token) return;

      const response = await fetch("/api/currencies", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const currencies = data.data.map((curr: any) => ({
            name: curr.name,
            isoCode: curr.isoCode,
            rate: parseFloat(curr.rate),
          }));

          setSettings((prev) => ({
            ...prev,
            currencies,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching currencies:", error);
    }
  };

  // Fetch currencies on component mount and when dialog opens
  useEffect(() => {
    fetchCurrenciesFromAPI();
  }, []);

  useEffect(() => {
    if (open) {
      fetchCurrenciesFromAPI();
    }
  }, [open]);

  const handleAddCurrency = async (newCurrency: Currency) => {
    setIsAddingCurrency(true);
    try {
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please log in again",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch("/api/currencies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCurrency.name,
          isoCode: newCurrency.isoCode,
          rate: newCurrency.rate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add currency");
      }

      toast({
        title: "Currency Added",
        description: `${newCurrency.name} (${newCurrency.isoCode}) has been added successfully`,
      });

      // Close the dialog
      setShowNewCurrencyDialog(false);

      // Refresh currencies by fetching from database
      await fetchCurrenciesFromAPI();
    } catch (error) {
      toast({
        title: "Error Adding Currency",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsAddingCurrency(false);
    }
  };

  const handleRemoveCurrency = async (currencyName: string) => {
    try {
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please log in again",
          variant: "destructive",
        });
        return;
      }

      // Find the currency to get its isoCode
      const currency = settings.currencies.find((c) => c.name === currencyName);
      if (!currency) {
        toast({
          title: "Currency Not Found",
          description: "The currency to delete was not found",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/currencies/${currency.isoCode}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete currency");
      }

      toast({
        title: "Currency Deleted",
        description: `${currencyName} has been deleted successfully`,
      });

      // Refresh currencies by fetching from database
      await fetchCurrenciesFromAPI();
    } catch (error) {
      toast({
        title: "Error Deleting Currency",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleUpdateCurrency = async (
    oldCurrency: Currency,
    newCurrency: Currency,
  ) => {
    try {
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        toast({
          title: "Authentication Required",
          description: "Please log in again",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/currencies/${oldCurrency.isoCode}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newCurrency.name,
          rate: newCurrency.rate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update currency");
      }

      toast({
        title: "Currency Updated",
        description: `${newCurrency.name} has been updated successfully`,
      });

      // Refresh currencies by fetching from database
      await fetchCurrenciesFromAPI();
    } catch (error) {
      toast({
        title: "Error Updating Currency",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleCurrencyChange = (
    index: number,
    field: keyof Currency,
    value: string,
  ) => {
    const newCurrencies = [...settings.currencies];
    newCurrencies[index] = {
      ...newCurrencies[index],
      [field]: field === "rate" ? parseFloat(value) || 0 : value,
    };
    setSettings({
      ...settings,
      currencies: newCurrencies,
    });
  };

  const handleZimraSettingsChange = (
    field: keyof ZimraSettings,
    value: string,
  ) => {
    setZimraSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateSerialNumber = (serialNumber: string): boolean => {
    // Just make sure the serial number is not empty
    const isValid = serialNumber.trim().length > 0;
    if (!isValid) {
      toast({
        title: "Empty Serial Number",
        description: "Serial number cannot be empty",
        variant: "destructive",
      });
    }
    return isValid;
  };

  const handleRegisterDevice = async () => {
    setIsRegistering(true);
    try {
      // Prepare registration data with the required format
      const deviceData = {
        deviceId: zimraSettings.deviceId,
        activationKey: zimraSettings.activationKey,
        serialNumber: zimraSettings.serialNumber,
        version: zimraSettings.version,
        taxPayerName: zimraSettings.companyName,
        taxPayerTIN: zimraSettings.tin,
        vatNumber: zimraSettings.vatNumber,
        tradeName: zimraSettings.tradeName,
      };

      // Call the modified registerDevice function with the correct parameters
      const response = await zimraClient.registerDevice(
        deviceData.deviceId,
        deviceData.activationKey,
        deviceData.serialNumber,
        deviceData.version,
        deviceData.taxPayerTIN,
        deviceData.vatNumber,
      );
      // After successful registration, Let The user Know
      if (response) {
        // Type-safe checking for different response structures
        const responseObj = response as any;
        
        // Check if this is a successful response with new structure
        if (responseObj.success === true) {
          // Handle successful registration with new response structure
          setZimraSettings((prev) => ({
            ...prev,
            isRegistered: true,
            // Save returned fields from the response safely
            ...(responseObj.operationID && { operationID: responseObj.operationID }),
          }));

          // Save to localStorage as well for persistence
          saveZimraCredentials({
            ...zimraSettings,
            isRegistered: true,
            ...(responseObj.operationID && { operationID: responseObj.operationID }),
          });

          toast({
            title: "Registration Successful",
            description: responseObj.message || "Device configuration saved successfully",
          });
        }
        // Handle legacy success response format
        else if (
          typeof response === "object" &&
          response !== null &&
          "message" in response &&
          !("error" in responseObj)
        ) {
          const message = responseObj.message;

          if (message === "Device Config Saved Successfully") {
            setZimraSettings((prev) => ({
              ...prev,
              isRegistered: true,
            }));

            // Save to localStorage as well
            saveZimraCredentials({
              ...zimraSettings,
              isRegistered: true,
            });

            toast({
              title: "Registration Successful",
              description: message,
            });
          } else {
            toast({
              title: "Registration Failed",
              description: message || "Failed to register device with ZIMRA",
              variant: "destructive",
            });
            return;
          }
        }
        // Handle error responses from server
        else if ("error" in responseObj && responseObj.error) {
          toast({
            title: responseObj.error.message || "Registration Failed",
            description: responseObj.error.details || "Failed to register device with ZIMRA",
            variant: "destructive",
          });
          return;
        } else {
          // Unknown response format - check if it's the legacy operationID response
          if ("operationID" in responseObj) {
            setZimraSettings((prev) => ({
              ...prev,
              isRegistered: true,
              operationID: responseObj.operationID,
            }));

            saveZimraCredentials({
              ...zimraSettings,
              isRegistered: true,
              operationID: responseObj.operationID,
            });

            toast({
              title: "Registration Successful",
              description: "Device configuration saved successfully",
            });
          } else {
            toast({
              title: "Registration Status Unknown",
              description:
                "Device registration completed, but status is unclear. Please check your ZIMRA dashboard.",
            });
          }
        }
      } else {
        // After registration Failed, Notify the user
        toast({
          title: "Registration Failed",
          description: "Failed to register device with ZIMRA",
          variant: "destructive",
        });
        return;
      }
    } catch (error) {
      console.error("Device registration error:", error);

      // Handle structured error responses from our API
      let errorTitle = "Registration Failed";
      let errorMessage = "Failed to register device with ZIMRA";

      // Try to extract structured error information
      if (error instanceof Error) {
        // Check if it's an axios error with response data
        const axiosError = error as any;
        if (axiosError.response?.data?.error) {
          const apiError = axiosError.response.data.error;
          errorTitle = apiError.message || errorTitle;
          errorMessage = apiError.details || errorMessage;

          // Handle specific error codes with guidance
          if (apiError.code === "DEV03") {
            errorMessage =
              "The company name format is invalid. Please provide a valid company name that follows ZIMRA's requirements. Company names should be properly formatted legal business names.";
          }
        } else {
          // If it's a regular Error object
          errorMessage = error.message;
        }
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
      setShowRegistrationConfirm(false);
    }
  };

  //========================================================================================
  const handleRegenerateSerialNumber = () => {
    if (zimraSettings.isRegistered) {
      toast({
        title: "Cannot Change Serial Number",
        description: "Device is already registered with ZIMRA",
        variant: "destructive",
      });
      return;
    }

    const newSerialNumber = generateSerialNumber();
    setZimraSettings((prev) => ({
      ...prev,
      serialNumber: newSerialNumber,
    }));

    toast({
      title: "Success",
      description: "Generated new serial number",
    });
  };

  const handleSerialNumberChange = (value: string) => {
    // Allow any input value without restrictions, just trimming whitespace
    // This allows users to enter any serial number they prefer
    handleZimraSettingsChange("serialNumber", value.trim());
  };

  const handleSaveReceipt = async () => {
    // Validate currency settings
    for (const currency of settings.currencies) {
      if (!currency.name.trim()) {
        toast({
          title: "Invalid Currency",
          description: "Currency name cannot be empty",
          variant: "destructive",
        });
        return;
      }

      if (!currency.rate || currency.rate <= 0) {
        toast({
          title: "Invalid Rate",
          description: "Currency rate must be greater than 0",
          variant: "destructive",
        });
        return;
      }
    }

    if (!settings.invoicePrefix.trim()) {
      toast({
        title: "Invalid Prefix",
        description: "Invoice prefix cannot be empty",
        variant: "destructive",
      });
      return;
    }

    // Notification validation and server saving removed

    // Save settings to localStorage
    localStorage.setItem("receiptSettings", JSON.stringify(settings));

    toast({
      title: "Success",
      description: "Settings saved successfully",
    });
    setOpen(false);
  };

  const handleOpenFiscalDay = async () => {
    try {
      setIsLoadingFiscalDay(true);
      const response = await zimraClient.openFiscalDay();
      setFiscalDayStatus(response.status);
      toast({
        title: "Success",
        description: "Fiscal day opened successfully",
      });
    } catch (error) {
      console.error("Open fiscal day error:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to open fiscal day",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiscalDay(false);
    }
  };
  // const handleGenerateReport = async () => {
  //   try {
  //     setIsLoadingFiscalDay(true);
  //     const response = await generateZReportPDF(response);
  //     setFiscalDayReportStatus(response.reportStatus || "Success");
  //     toast({
  //       title: "Success",
  //       description: "Fiscal day report generated successfully",
  //     });
  //   } catch (error) {
  //     console.error("Generate report error:", error);
  //     toast({
  //       title: "Error",
  //       description:
  //         error instanceof Error ? error.message : "Failed to generate report",
  //       variant: "destructive",
  //     });
  //   }
  // };

  const handleCloseFiscalDay = async (
    deviceId?: string,
    manual: boolean = false,
  ) => {
    try {
      // alert(manual);
      setIsLoadingFiscalDay(true);
      manual = true;
      // The client-side zimraClient.closeFiscalDay function expects deviceId and manual parameters
      const response = await zimraClient.closeFiscalDay(deviceId, manual);
      console.log(response);
      setFiscalDayStatus(response.status);
      setFiscalDayReportStatus(response.reportStatus || "Success");
      setShowManualClosureDialog(false);
      toast({
        title: "Success",
        description: `Fiscal day closed ${manual ? "manually" : "successfully"}`,
      });
      //now auto generate the zimra report
      // handleGenerateReport(response);
    } catch (error) {
      console.error("Close fiscal day error:", error);
      setFiscalDayReportStatus("Error");
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to close fiscal day",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiscalDay(false);
    }
  };

  const handleResubmitReport = async () => {
    try {
      setIsLoadingFiscalDay(true);
      const response = await zimraClient.resubmitFiscalDayReport();
      setFiscalDayReportStatus(response.reportStatus || "Resubmitted");
      setSubmissionAttempts((prev) => prev + 1);
      toast({
        title: "Success",
        description: "Fiscal day report resubmitted successfully",
      });
    } catch (error) {
      console.error("Resubmit report error:", error);
      setFiscalDayReportStatus("Error");
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to resubmit report",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiscalDay(false);
    }
  };
  //WHEN THE SAVE DEVICE BUTTON IS CLICKED
  const handleInitiateRegistration = () => {
    // Validate required fields

    if (
      !zimraSettings.activationKey.trim() ||
      !zimraSettings.deviceId.trim() ||
      !validateSerialNumber(zimraSettings.serialNumber) ||
      !zimraSettings.tin.trim() ||
      !zimraSettings.vatNumber.trim()
    ) {
      toast({
        title: "Missing Information",
        description: "Please Enter All Required Fields",
        variant: "destructive",
      });
      return;
    }
    setShowRegistrationConfirm(true);
    handleRegisterDevice(); //then get the response from the register device function
  };

  // Function to edit a device
  const handleEditDevice = (deviceId: string) => {
    // Find the device in our list
    const deviceToEdit = zimraDevices.find(
      (device) => device.deviceId === deviceId,
    );
    if (deviceToEdit) {
      // Update the ZIMRA settings with this device's data
      setZimraSettings((prev) => ({
        ...prev,
        deviceId: deviceToEdit.deviceId,
        serialNumber: deviceToEdit.serialNumber,
        companyName: deviceToEdit.companyName,
        certificateValidTill:
          deviceToEdit.certificateValidTill || prev.certificateValidTill,
        isRegistered: deviceToEdit.status === "registered",
      }));

      // Open the device configuration modal
      setShowCompanyDetailsModal(true);
    }
  };

  // Function to delete a device
  const handleDeleteDevice = (deviceId: string) => {
    // Remove the device from our list
    setZimraDevices((prevDevices) =>
      prevDevices.filter((device) => device.deviceId !== deviceId),
    );

    toast({
      title: "Device Removed",
      description: `Device ${deviceId} has been removed from the list.`,
    });
  };

  const handleUpdateRate = (name: string, newRate: number) => {
    setSettings((prev) => ({
      ...prev,
      currencies: prev.currencies.map((c) =>
        c.name === name ? { ...c, rate: newRate } : c,
      ),
    }));
    toast({
      title: "Success",
      description: `Updated exchange rate for ${name}`,
    });
  };

  const handleCurrencyClick = (currency: Currency) => {
    setSelectedCurrencyForUpdate(currency);
    setShowUpdateRateDialog(true);
  };

  const handleConnectApp = async (
    provider: string,
    appId: string,
    appSecret: string,
  ) => {
    try {
      // First store in database
      const response = await fetch("/api/fiscalization/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          appId,
          appSecret,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to store credentials");
      }

      // Then store in localStorage for quick access
      const credentials = {
        provider,
        appId,
        appSecret,
        active: true,
      };
      localStorage.setItem(
        `fiscalization_${provider}`,
        JSON.stringify(credentials),
      );

      setConnectedProviders((prev) => [
        ...prev,
        provider as FiscalizationProvider,
      ]);

      toast({
        title: "Success",
        description: `Successfully connected to ${provider}`,
      });
    } catch (error) {
      console.error("Provider connection error:", error);
      toast({
        title: "Connection Failed",
        description:
          error instanceof Error
            ? error.message
            : `Failed to connect to ${provider}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="border-blue-200 text-blue-700 hover:bg-blue-50 w-full"
          onClick={() => handleOpenChange(true)}
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs
          defaultValue="general"
          className="w-full"
          onValueChange={(value) => {
            if (value === "zimra") {
              // Get the token from localStorage
              const token = localStorage.getItem("loyverseToken");

              if (token) {
                // Fetch all ZIMRA credentials from the API when ZIMRA tab is clicked
                // This will populate the devices list with real data from the tenant DB
                fetchZimraCredentialsFromAPI();

                // Fetch merchant data from the API when ZIMRA tab is clicked
                fetch("/api/merchant/info", {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                })
                  .then((response) => {
                    return response.json();
                  })
                  .then((data) => {
                    if (data.success) {
                      // Only update if fields are empty or if the user hasn't registered the device yet
                      if (!zimraSettings.isRegistered) {
                        setZimraSettings((prev) => {
                          const newSettings = {
                            ...prev,
                            companyName: prev.companyName || "",
                            tradeName:
                              prev.tradeName || data.data.merchantName || "",
                            tin: prev.tin || data.data.tin || "",
                            vatNumber: prev.vatNumber || data.data.vat || "",
                          };
                          return newSettings;
                        });
                      }
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "Error fetching merchant information:",
                      error,
                    );
                  });
              } else {
                console.error("No token found in localStorage");
              }
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-3 sticky top-0 bg-background z-10">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="receipt">Receipt Settings</TabsTrigger>
            <TabsTrigger value="zimra">ZIMRA Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="theme" className="text-right">
                  Theme
                </Label>
                <div className="col-span-3">
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger id="theme">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-2">
                    Currently using {actualTheme} mode
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="receipt">
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receiptSize" className="text-right">
                  Receipt Size
                </Label>
                <Select
                  value={settings.receiptSize}
                  onValueChange={(value: string) =>
                    setSettings({
                      ...settings,
                      receiptSize: value,
                    })
                  }
                >
                  <SelectTrigger id="receiptSize" className="col-span-3">
                    <SelectValue placeholder="Choose size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 Paper</SelectItem>
                    <SelectItem value="80mm">80mm Thermal</SelectItem>
                    <SelectItem value="50mm">50mm Thermal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* New auto-download settings */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="autoDownload" className="text-right">
                  Auto Fiscalise
                </Label>
                <div className="col-span-3 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="autoDownload"
                      checked={settings.autoDownload.enabled}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          autoDownload: {
                            ...settings.autoDownload,
                            enabled: checked,
                          },
                        })
                      }
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-gray-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Enable automatic Fiscalisation of new entries</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {settings.autoDownload.enabled && (
                    <>
                      <Select
                        value={settings.autoDownload.format}
                        onValueChange={(
                          value:
                            | "pdf"
                            | "csv"
                            | "fiscalHarmonyInvoice"
                            | "revmaxInvoice",
                        ) =>
                          setSettings({
                            ...settings,
                            autoDownload: {
                              ...settings.autoDownload,
                              format: value,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem key="pdf-format" value="pdf">
                            PDF Format
                          </SelectItem>
                          <SelectItem key="csv-format" value="csv">
                            CSV Format
                          </SelectItem>
                          <SelectItem
                            key="fiscal-harmony"
                            value="fiscalHarmonyInvoice"
                          >
                            Fiscal Harmony Invoice
                          </SelectItem>
                          <SelectItem key="revmax" value="revmaxInvoice">
                            RevMax Invoice
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {settings.autoDownload.format ===
                        "fiscalHarmonyInvoice" &&
                        !connectedProviders.includes("FiscalHarmony") && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm mt-2">
                            <p className="font-medium flex items-center gap-1 text-amber-700">
                              <Info className="h-4 w-4" /> Fiscal Harmony is not
                              connected
                            </p>
                            <p className="text-amber-600 text-xs mt-1">
                              Please connect Fiscal Harmony in the Provider
                              Settings below.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 text-xs bg-white border-amber-300 text-amber-700 hover:bg-amber-100"
                              onClick={() => setShowConnectAppDialog(true)}
                            >
                              <Link2 className="h-3 w-3 mr-1" /> Connect
                              Provider
                            </Button>
                          </div>
                        )}

                      {settings.autoDownload.format === "revmaxInvoice" &&
                        !connectedProviders.includes("AxisSolution") && (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm mt-2">
                            <p className="font-medium flex items-center gap-1 text-amber-700">
                              <Info className="h-4 w-4" /> Axis Solution is not
                              connected
                            </p>
                            <p className="text-amber-600 text-xs mt-1">
                              Please connect Axis Solution in the Provider
                              Settings below.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 text-xs bg-white border-amber-300 text-amber-700 hover:bg-amber-100"
                              onClick={() => setShowConnectAppDialog(true)}
                            >
                              <Link2 className="h-3 w-3 mr-1" /> Connect
                              Provider
                            </Button>
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>

              {/* Notifications settings removed as per client request */}

              {/* Email Notifications Dialog removed as per client request */}

              {/* WhatsApp Dialog removed */}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="currencies" className="text-right">
                  Currencies
                </Label>
                <div className="col-span-3 relative">
                  <div
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                    onClick={() => setCurrencyDropdownOpen(!currencyDropdownOpen)}
                  >
                    <span className="text-muted-foreground">Manage Currencies</span>
                    <ChevronRight className={`h-4 w-4 transition-transform ${currencyDropdownOpen ? 'rotate-90' : ''}`} />
                  </div>
                  
                  {currencyDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                      {/* Add New Currency Option */}
                      <div
                        className="flex items-center px-4 py-3 hover:bg-accent cursor-pointer text-blue-600 font-medium border-b"
                        onClick={() => {
                          setShowNewCurrencyDialog(true);
                          setCurrencyDropdownOpen(false);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add New Currency
                      </div>
                      
                      {/* Currency List */}
                      {settings.currencies.map((currency) => (
                        <div
                          key={currency.name}
                          className="flex items-center justify-between px-4 py-3 hover:bg-accent cursor-pointer border-b last:border-b-0"
                          onClick={() => {
                            setSelectedCurrencyForUpdate(currency);
                            setShowManageCurrenciesDialog(true);
                            setCurrencyDropdownOpen(false);
                          }}
                        >
                          <div className="flex items-center">
                            <span className="font-medium text-base">{currency.name}</span>
                            <span className="ml-3 text-sm text-muted-foreground">({currency.isoCode})</span>
                          </div>
                          <span className="text-sm text-muted-foreground">Rate: {currency.rate}</span>
                        </div>
                      ))}
                      
                      {settings.currencies.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                          No currencies configured
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="prefix" className="text-right">
                  Invoice Prefix
                </Label>
                <Input
                  id="prefix"
                  value={settings.invoicePrefix}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      invoicePrefix: e.target.value,
                    })
                  }
                  className="col-span-3"
                  placeholder="e.g. INV"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveReceipt}
                  className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700"
                >
                  Save Receipt Settings
                </Button>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="zimra">
            <div className="grid gap-4 py-4">
              {true ? ( // Always show device list interface
                <>
                  {/* Device List */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <div className="flex items-center">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mr-3">
                          ZIMRA Devices
                        </h3>
                        {lastStatusCheck && (
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>Last status check: {lastStatusCheck}</span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={checkAllDevicesStatus}
                                    className="ml-2 h-6 w-6 p-0"
                                    disabled={isCheckingStatus}
                                  >
                                    <RefreshCw
                                      className={`h-3 w-3 ${isCheckingStatus ? "animate-spin" : ""}`}
                                    />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Check all devices status now</p>
                                  <p className="text-xs text-gray-500">
                                    Auto-refreshes every 5 minutes
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={() => {
                          // Reset form for a new device
                          setZimraSettings((prev) => ({
                            ...prev,
                            deviceId: "",
                            serialNumber: generateSerialNumber(),
                            companyName: prev.companyName || "",
                            tradeName: prev.tradeName || "",
                            tin: prev.tin || "",
                            vatNumber: prev.vatNumber || "",
                            isRegistered: false,
                          }));
                          setShowCompanyDetailsModal(true);
                        }}
                        size="sm"
                        className="bg-blue-500 hover:bg-blue-600"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add Device
                      </Button>
                    </div>

                    {zimraDevices.length > 0 ? (
                      <div className="px-4 py-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Device ID</TableHead>
                              <TableHead>Branch</TableHead>
                              <TableHead>Certificate</TableHead>
                              <TableHead>Online Status</TableHead>
                              <TableHead className="text-right">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {zimraDevices.map((device) => (
                              <TableRow key={device.id}>
                                <TableCell className="font-medium">
                                  {device.deviceId}
                                </TableCell>
                                <TableCell>
                                  {device.tradeName || device.companyName}
                                </TableCell>
                                <TableCell>
                                  {device.status === "pending" ? (
                                    <span className="inline-flex items-center rounded-full bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 ring-1 ring-inset ring-yellow-600/20 dark:ring-yellow-500/30">
                                      <Clock className="mr-1 h-3 w-3" />
                                      Pending
                                    </span>
                                  ) : (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              fetchZimraCredentialsFromAPI(
                                                device.deviceId,
                                              )
                                            }
                                            className={`h-8 w-8 p-0 ${
                                              device.status === "registered"
                                                ? "text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 border-green-200 dark:border-green-600 bg-green-50 dark:bg-green-900/30"
                                                : "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-600 bg-red-50 dark:bg-red-900/30"
                                            }`}
                                          >
                                            <span className="sr-only">
                                              Refresh Certificate
                                            </span>
                                            <RefreshCw className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            {device.status === "registered"
                                              ? "Certificate valid - Click to refresh"
                                              : "Certificate expired - Click to refresh"}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center">
                                          <span
                                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset mr-2 ${
                                              device.isOnline
                                                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30"
                                                : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 ring-gray-600/20 dark:ring-gray-500/30"
                                            }`}
                                          >
                                            <span
                                              className={`h-2 w-2 rounded-full mr-1 ${
                                                device.isOnline
                                                  ? "bg-green-600"
                                                  : "bg-gray-600"
                                              }`}
                                            ></span>
                                            {device.isOnline
                                              ? "Online"
                                              : "Offline"}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              checkAllDevicesStatus()
                                            }
                                            className="h-6 w-6 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                                          >
                                            <RefreshCw className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {device.lastChecked ? (
                                          <p>
                                            Last checked:{" "}
                                            {(() => {
                                              const date = new Date(
                                                device.lastChecked,
                                              );
                                              date.setTime(
                                                date.getTime() +
                                                  2 * 60 * 60 * 1000,
                                              ); // Add 2 hours
                                              return date
                                                .toISOString()
                                                .replace("T", " ")
                                                .replace(/\.\d{3}Z$/, "");
                                            })()}
                                          </p>
                                        ) : (
                                          <p>Status not yet checked</p>
                                        )}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                                <TableCell className="text-right">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleEditDevice(device.deviceId)
                                          }
                                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                                        >
                                          <span className="sr-only">
                                            View Device Details
                                          </span>
                                          <Info className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>View Device Details</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleCloseFiscalDay(
                                              device.deviceId,
                                            )
                                          }
                                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                        >
                                          <span className="sr-only">
                                            Close Day
                                          </span>
                                          <ShieldAlert className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Close Fiscal Day</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 px-4 text-center text-gray-500">
                        <Cog className="h-12 w-12 text-gray-300 mb-2" />
                        <h4 className="text-sm font-medium mb-1">
                          No devices configured yet
                        </h4>
                        <p className="text-xs text-gray-400 mb-4">
                          Add a device to start using ZIMRA fiscalization
                        </p>
                      </div>
                    )}
                  </div>

                  {/* No Configure Device Button - as requested */}
                </>
              ) : (
                <>
                  {/* Empty State */}
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
                    <div className="mb-4">
                      <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30">
                        <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                      Device Not Configured
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                      You need to configure your ZIMRA device before you can
                      start using it for fiscal receipts.
                    </p>
                    <Button
                      onClick={() => setShowCompanyDetailsModal(true)}
                      className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700"
                    >
                      Configure Device
                    </Button>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setShowConnectAppDialog(true)}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Connect App
                </Button>
              </div>
            </div>
          </TabsContent>
          {showManualClosureDialog && (
            <AlertDialog onOpenChange={setShowManualClosureDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Manual Fiscal DayClosure</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will manually close the fiscal day. This action should
                    only be used when automatic closure fails repeatedly. Please
                    provide a reason for manual closure:
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid gap-4 py-4">
                  <Textarea
                    value={manualClosureReason}
                    onChange={(e) => setManualClosureReason(e.target.value)}
                    placeholder="Enter reason for manual closure..."
                    className="min-h-[100px]"
                  />
                </div>{" "}
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => setShowManualClosureDialog(false)}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      // Pass deviceId and manual flag=true
                      const currentDeviceId = zimraSettings.deviceId;
                      handleCloseFiscalDay(currentDeviceId, true);
                    }}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={!manualClosureReason.trim()}
                  >
                    Close Fiscal Day Manually
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </Tabs>
        <NewCurrencyDialog
          open={showNewCurrencyDialog}
          onOpenChange={setShowNewCurrencyDialog}
          onSave={handleAddCurrency}
          isLoading={isAddingCurrency}
        />
        {selectedCurrencyForUpdate && (
          <UpdateCurrencyRateDialog
            open={showUpdateRateDialog}
            onOpenChange={setShowUpdateRateDialog}
            currency={selectedCurrencyForUpdate}
            onUpdate={handleUpdateRate}
          />
        )}
        <ConnectAppDialog
          open={showConnectAppDialog}
          onOpenChange={setShowConnectAppDialog}
          onConnect={handleConnectApp}
        />
        <ManageCurrenciesDialog
          open={showManageCurrenciesDialog}
          onOpenChange={setShowManageCurrenciesDialog}
          currencies={settings.currencies}
          selectedCurrency={selectedCurrencyForUpdate}
          onAddCurrency={() => {
            setShowManageCurrenciesDialog(false);
            setShowNewCurrencyDialog(true);
          }}
          onEditCurrency={(currency) => {
            setShowManageCurrenciesDialog(false);
            setSelectedCurrencyForUpdate(currency);
            setShowUpdateRateDialog(true);
          }}
          onRemoveCurrency={handleRemoveCurrency}
          onUpdateCurrency={handleUpdateCurrency}
        />

        {/* Device Configuration Modal */}
        <AlertDialog
          open={showCompanyDetailsModal}
          onOpenChange={setShowCompanyDetailsModal}
        >
          <AlertDialogContent className="max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col">
            <AlertDialogHeader>
              <AlertDialogTitle>ZIMRA Device Configuration</AlertDialogTitle>
              <AlertDialogDescription>
                {zimraSettings.isRegistered
                  ? "View detailed device information."
                  : "Enter company details and device information for ZIMRA registration."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto flex-grow max-h-[60vh] pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-companyName" className="sm:text-right">
                  Company Name
                </Label>
                <Input
                  id="modal-companyName"
                  value={zimraSettings.companyName}
                  onChange={(e) =>
                    handleZimraSettingsChange("companyName", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter registered company name"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-tradeName" className="sm:text-right">
                  Trade Name
                </Label>
                <Input
                  id="modal-tradeName"
                  value={zimraSettings.tradeName}
                  onChange={(e) =>
                    handleZimraSettingsChange("tradeName", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter trading name"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-tin" className="sm:text-right">
                  TIN Number
                </Label>
                <Input
                  id="modal-tin"
                  value={zimraSettings.tin}
                  onChange={(e) =>
                    handleZimraSettingsChange("tin", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter TIN number"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-vatNumber" className="sm:text-right">
                  VAT Number
                </Label>
                <Input
                  id="modal-vatNumber"
                  value={zimraSettings.vatNumber}
                  onChange={(e) =>
                    handleZimraSettingsChange("vatNumber", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter VAT number"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>

              <div className="border-t border-gray-200 my-2 pt-2">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Device Configuration
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-deviceId" className="sm:text-right">
                  Device ID
                </Label>
                <Input
                  id="modal-deviceId"
                  value={zimraSettings.deviceId}
                  onChange={(e) =>
                    handleZimraSettingsChange("deviceId", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter your fiscal device ID"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-activationKey" className="sm:text-right">
                  Activation Key
                </Label>
                <Input
                  id="modal-activationKey"
                  value={zimraSettings.activationKey}
                  onChange={(e) =>
                    handleZimraSettingsChange("activationKey", e.target.value)
                  }
                  className={`col-span-1 sm:col-span-3 ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                  placeholder="Enter ZIMRA activation key"
                  readOnly={zimraSettings.isRegistered}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-serialNumber" className="sm:text-right">
                  Serial Number
                </Label>
                <div className="col-span-1 sm:col-span-3 flex gap-2">
                  <Input
                    id="modal-serialNumber"
                    value={zimraSettings.serialNumber}
                    onChange={(e) => handleSerialNumberChange(e.target.value)}
                    className={`flex-1 font-mono ${zimraSettings.isRegistered ? "bg-gray-50" : ""}`}
                    placeholder="CFF95CC4E748C27953E0"
                    readOnly={zimraSettings.isRegistered}
                  />
                  {!zimraSettings.isRegistered && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRegenerateSerialNumber}
                      className="border-blue-200 shrink-0"
                      title="Generate new serial number"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
                <Label htmlFor="modal-version" className="sm:text-right">
                  Version
                </Label>
                <Input
                  id="modal-version"
                  value="v1"
                  className="col-span-1 sm:col-span-3"
                  disabled
                />
              </div>
            </div>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
              <AlertDialogCancel
                onClick={() => setShowCompanyDetailsModal(false)}
                className="mt-0"
              >
                {zimraSettings.isRegistered ? "Close" : "Cancel"}
              </AlertDialogCancel>
              <div className="flex-1"></div>
              {!zimraSettings.isRegistered && (
                <>
                  <AlertDialogAction
                    onClick={() => {
                      setShowCompanyDetailsModal(false);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Save Details Only
                  </AlertDialogAction>
                  <AlertDialogAction
                    onClick={() => {
                      setShowCompanyDetailsModal(false);

                      // Check required fields
                      if (
                        !zimraSettings.activationKey.trim() ||
                        !zimraSettings.deviceId.trim() ||
                        !validateSerialNumber(zimraSettings.serialNumber) ||
                        !zimraSettings.tin.trim() ||
                        !zimraSettings.vatNumber.trim()
                      ) {
                        toast({
                          title: "Missing Information",
                          description:
                            "Please fill all required fields before registering.",
                          variant: "destructive",
                        });
                        return;
                      }

                      // Proceed with registration
                      handleInitiateRegistration();
                    }}
                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700"
                  >
                    Register Device
                  </AlertDialogAction>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
