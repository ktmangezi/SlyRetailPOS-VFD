import { useState, useEffect, useRef, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Logo } from "@/components/Logo";
import { BudgetAlertChecker } from "@/components/BudgetAlertChecker";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Switch } from "@/components/ui/switch";
import { CutoffTimeModal } from "@/components/CutoffTimeModal";
import { isAfterCutoffTime, getTimeCheckDetails } from "@/lib/timeUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  validateToken,
  fetchSales,
  syncLoyverseSales,
  updateZimraStatus,
  refreshLoyverseSales,
} from "@/lib/loyverse";
import {
  setToken,
  getToken,
  setStoreId,
  getStoreId,
  clearToken,
  clearStoreId,
} from "@/lib/store";
import { printReceipt } from "@/lib/printing";
import {
  downloadReceipt,
  downloadCSV,
  downloadTaxSchedule,
  // generateZReportPDF,
} from "@/lib/pdf";
import {
  Printer,
  Download,
  FileDown,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Calendar as CalendarIcon,
  X,
  Check,
  Radio,
  Send,
  CreditCard,
  Info,
  FileText,
} from "lucide-react";
import { ZReportsModal } from "@/components/ZReportsModal";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import type { Sale, LoyverseStore } from "@shared/schema";
import { SettingsModal } from "@/components/SettingsModal";
import { SearchBox } from "@/components/SearchBox";
import { DebitNoteModal, DebitNoteFormData } from "@/components/DebitNoteModal";
import { TokenSlideshow } from "@/components/TokenSlideshow";
import { ContactFooter } from "@/components/ContactFooter";

type Stage = "token" | "store" | "receipts";

export default function Home() {
  const { toast } = useToast();
  // Add this state
  const [isManualNavigation, setIsManualNavigation] = useState(false);
  const [showTaxSchedule, setShowTaxSchedule] = useState(false);
  const [removeOtherBlocks, setRemoveOtherBlocks] = useState(false);
  const [showIntegrationGuide, setShowIntegrationGuide] = useState(false);
  const [isPaginationLoading, setIsPaginationLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Update the useEffect for page reload validation
  useEffect(() => {
    const validateStoredToken = async () => {
      const storedToken = getToken();
      const storedStoreId = getStoreId();
      // console.log("Stored values:", storedToken, storedStoreId);

      if (storedToken) {
        try {
          // First refresh sales data from Loyverse API when the page loads
          // This is important to keep the database up-to-date on browser refresh
          //first validate the token before using it to refresh the sales data

          const response = await validateToken(storedToken);
          // console.log("Token validation response:", response);
          setStores(response.stores);

          if (
            storedStoreId &&
            response.stores.some(
              (store) =>
                store.id === storedStoreId || storedStoreId === "All Stores",
            )
          ) {
            setSelectedStoreId(storedStoreId);
            setStage("receipts");
          } else {
            clearStoreId();
            setStage("store");
          }
          try {
            console.log("Refreshing sales data on page load...");
            let mmmm = await refreshLoyverseSales(
              storedToken,
              storedStoreId,
              currentPage,
              itemsPerPage,
              lastProcessedSaleId,
            );
            // console.log("Sales data refreshed successfully", mmmm);
          } catch (refreshError) {
            console.error("Error refreshing sales data:", refreshError);
            // Continue with token validation even if refresh fails
          }
        } catch (error) {
          console.error("Token validation failed:", error);
          clearToken();
          clearStoreId();
          setStage("token");
          setApiTokenState(""); // Reset API token state
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please log in again.",
            variant: "destructive",
          });
        }
      } else {
        clearToken();
        clearStoreId();
        setStage("token");
        setApiTokenState("");
      }
    };

    validateStoredToken();
  }, []);

  const [stage, setStage] = useState<Stage>(() => {
    const token = getToken();
    const storeId = getStoreId();
    if (token && storeId) return "receipts";
    if (token) return "store";
    return "token";
  });
  const [apiToken, setApiTokenState] = useState(() => getToken() || "");
  const [stores, setStores] = useState<LoyverseStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(
    () => getStoreId() || "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  let [currentPage, setCurrentPage] = useState(1);
  let [itemsPerPage, setItemsPerPage] = useState(5);
  const [isSelectingRange, setIsSelectingRange] = useState(false);
  const [calculatedTotalPages, setCalculatedTotalPages] = useState(1);
  const [isUserInitiatedNavigation, setIsUserInitiatedNavigation] =
    useState(false);
  // Date range filter state
  let [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  let [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const [isDateFilterActive, setIsDateFilterActive] = useState(false);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [salesData, setSalesData] = useState<Sale[]>([]); // Raw API data
  const [hasUserModifiedDates, setHasUserModifiedDates] = useState(false);
  // Currency filter state
  const [selectedCurrency, setSelectedCurrency] = useState<string>("all");
  // const [lastProcessedSaleId, setLastProcessedSaleId] = useState<number>(() => {
  //   const saved = localStorage.getItem("lastProcessedSaleId");
  //   return saved ? parseInt(saved) : 0;
  // });
  const [lastProcessedSaleId, setLastProcessedSaleId] = useState<number | null>(
    () => {
      const saved = localStorage.getItem("lastProcessedSaleId");
      const parsed = parseInt(saved ?? "", 10);
      return isNaN(parsed) ? null : parsed;
    },
  );

  // Track period total tax by currency (for filtered results)
  const [periodTaxByCurrency, setPeriodTaxByCurrency] = useState<
    Record<string, number>
  >({});

  // State for tracking cutoff time (after 8pm/20:00)
  const [isAfterCutoff, setIsAfterCutoff] = useState(() => isAfterCutoffTime());
  const [showCutoffModal, setShowCutoffModal] = useState(false);

  // State for debit note modal
  const [showDebitNoteModal, setShowDebitNoteModal] = useState(false);
  const [selectedSaleForDebitNote, setSelectedSaleForDebitNote] = useState<
    Sale | undefined
  >(undefined);

  // State for Z-Reports modal
  const [showZReportsModal, setShowZReportsModal] = useState(false);

  // State for tracking selected sales for bulk actions
  const [selectedSales, setSelectedSales] = useState<Sale[]>([]);

  // const { toast } = useToast();
  const queryClient = useQueryClient();

  // Refs for background processing
  const workerRef = useRef<Worker | null>(null);
  const lastSyncTimeRef = useRef<number>(Date.now());

  // Helper function to get settings with safe defaults
  const getSettings = () => {
    try {
      const defaultSettings = {
        autoDownload: { enabled: false, format: "pdf" },
        receiptSize: "80mm",
        notifications: {
          enabled: false,
          methods: { email: false },
          budgetAlerts: { enabled: false },
        },
      };
      const savedSettings = localStorage.getItem("receiptSettings");
      return savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    } catch (error) {
      console.error("Error parsing settings:", error);
      return {
        autoDownload: { enabled: false, format: "pdf" },
        receiptSize: "80mm",
        notifications: {
          enabled: false,
          methods: { email: false },
          budgetAlerts: { enabled: false },
        },
      };
    }
  };

  // Handle selecting/deselecting all sales
  const handleSelectAll = () => {
    if (selectedSales.length === salesData.length) {
      // If all are selected, deselect all
      setSelectedSales([]);
    } else {
      // Otherwise, select all
      setSelectedSales([...salesData]);
    }
  };

  // Handle selecting/deselecting a single sale
  const handleSelectSale = (sale: Sale) => {
    if (selectedSales.some((selectedSale) => selectedSale.id === sale.id)) {
      // If already selected, remove it
      setSelectedSales(
        selectedSales.filter((selectedSale) => selectedSale.id !== sale.id),
      );
    } else {
      // Otherwise, add it
      setSelectedSales([...selectedSales, sale]);
    }
  };

  // Handle downloading all selected sales
  const handleDownloadSelected = async () => {
    if (selectedSales.length === 0) {
      toast({
        title: "No Sales Selected",
        description: "Please select at least one sale to download",
        variant: "destructive",
      });
      return;
    }

    const settings = getSettings();
    const format = settings.autoDownload?.format || "pdf";
    const formatLower = format.toLowerCase();

    let successCount = 0;
    let failureCount = 0;

    // Show toast for starting download
    toast({
      title: "Download Started",
      description: `Downloading ${selectedSales.length} sales as ${format.toUpperCase()}`,
    });

    // Process each selected sale
    for (const sale of selectedSales) {
      try {
        let success = false;

        if (formatLower === "pdf") {
          success = await downloadReceipt(sale, settings.receiptSize || "80mm");
        } else if (formatLower === "csv") {
          success = await downloadCSV(sale);
        }

        if (success) {
          successCount++;
        } else {
          failureCount++;
        }

        // Add a small delay between downloads to prevent browser issues
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        console.error(`Error downloading sale ${sale.receipt}:`, error);
        failureCount++;
      }
    }

    // Show completion toast
    toast({
      title: "Download Complete",
      description: `Successfully downloaded ${successCount} sales. ${failureCount > 0 ? `Failed: ${failureCount}` : ""}`,
      variant: failureCount > 0 ? "destructive" : "default",
    });
  };
  //THIS FUNCTION HANDLES ALL THE AUTOMATIC FISCALISATION AND DOWNLOADS
  const handleAutoDownload = async (newSale: Sale) => {
    // console.log("Processing auto-download for sale:", newSale);
    const settings = getSettings();
    if (!settings.autoDownload?.enabled) {
      console.log("Auto-download is disabled");
      return;
    }

    try {
      // Get format without converting to lowercase to preserve camelCase
      const format = settings.autoDownload?.format || "pdf";
      // console.log(`Auto-downloading sale in ${format} format`);
      //THIS IS USED BY THE EXCEL SYSTEMS TO FISCALISE THE SALES
      let success = false;

      // Check format in a case-insensitive way for better compatibility
      const formatLower = format.toLowerCase();
      if (formatLower === "pdf") {
        success = await downloadReceipt(
          newSale,
          settings.receiptSize || "80mm",
        );
      } else if (formatLower === "csv") {
        // console.log("Attempting to download as CSV");
        success = await downloadCSV(newSale);
      }
      //ON CONDITION THAT THE INVOICE IS GOING TO FISCAL HARMONY
      if (!success) {
        throw new Error(`Failed to auto-download ${format.toUpperCase()}`);
      }
      toast({
        title: "Auto Download Success",
        description: `Receipt ${newSale.receipt} downloaded as ${format.toUpperCase()}`,
      });
    } catch (err) {
      console.error("Auto-download error:", err);
      toast({
        title: "Auto Download Failed",
        description: `Failed to download receipt ${newSale.receipt}`,
        variant: "destructive",
      });
    }
  };

  const handleConnectToken = async () => {
    if (!apiToken) {
      toast({
        title: "",
        description: "Your Session Has Expired",
        variant: "destructive",
      });
      // Reset stage to token on error
      clearToken();
      clearStoreId();
      setStage("token");
      setApiTokenState(""); // Reset API token state
      return;
    }

    try {
      const response = await validateToken(apiToken);
      // console.log("Token validation response:", response);
      if (!response || !Array.isArray(response.stores)) {
        throw new Error("Invalid response format from server");
      }
      setToken(apiToken);
      setStores(response.stores);

      // Always go to store selection after token validation
      clearStoreId(); // Clear any previously stored store ID
      setSelectedStoreId(""); // Reset store selection
      setStage("store");

      toast({
        title: "Success",
        description: "Connected to Loyverse successfully",
      });
    } catch (error) {
      console.error("Token validation error:", error);
      toast({
        title: "Connection Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect to Loyverse. Please check your token and try again.",
        variant: "destructive",
      });
      // Reset stage to token on error
      clearToken();
      clearStoreId();
      setStage("token");
      setApiTokenState(""); // Reset API token state
    }
  };
  //----------------------------------------------------------------------------------------------------------
  // 1. First, move the utility function outside the component (or at least outside queryFn)
  const adjustDateRange = (dateFrom?: Date, dateTo?: Date) => {
    // Create new Date objects to avoid mutating original dates
    let adjustedFrom = dateFrom ? new Date(dateFrom) : undefined;
    let adjustedTo = dateTo ? new Date(dateTo) : undefined;

    if (adjustedFrom) {
      adjustedFrom.setHours(0, 0, 0, 0); // Start of day
    }

    if (adjustedTo) {
      adjustedTo.setHours(23, 59, 59, 999); // End of day
    }

    return {
      dateFrom: adjustedFrom?.toISOString(),
      dateTo: adjustedTo?.toISOString(),
      originalRange: {
        from: dateFrom?.toISOString(),
        to: dateTo?.toISOString(),
      },
      adjustedRange: {
        from: adjustedFrom?.toISOString(),
        to: adjustedTo?.toISOString(),
      },
    };
  };

  // Full sales data query - used when user actively views a sale
  const {
    data: salesResponse,
    isLoading: isSalesLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<{
    sales: Sale[];
    pagination: {
      totalRecords: number;
      totalPages: number;
      currentPage: number;
      pageSize: number;
    };
    taxSummary: {
      periodTaxByCurrency: Record<string, number>;
    };
  }>({
    // Include all pagination and filter parameters in the key to ensure proper cache management
    queryKey: [
      "sales",
      selectedStoreId,
      currentPage,
      itemsPerPage,
      searchQuery || "none",
      selectedCurrency,
      // isDateFilterActive ? dateFrom?.toISOString() : "none",
      // isDateFilterActive ? dateTo?.toISOString() : "none",
      !isSelectingRange && isDateFilterActive ? dateFrom : "none",
      !isSelectingRange && isDateFilterActive ? dateTo : "none",
    ],
    queryFn: async () => {
      const adjusted = adjustDateRange(dateFrom, dateTo);

      const { dateFrom: fromISO, dateTo: toISO } = adjusted;

      if (!apiToken) throw new Error("API Token is required");
      if (!selectedStoreId) throw new Error("Store ID is required");

      try {
        // Always include all necessary parameters for server-side pagination
        const params = new URLSearchParams({
          store_id: selectedStoreId,
          page: currentPage.toString(),
          page_size: itemsPerPage.toString(), // Use user-selected page size
        });
        // localStorage.setItem("lastProcessedSaleId", 0);

        // Add additional filter parameters when needed
        if (searchQuery) {
          params.append("search", searchQuery);
        }

        if (selectedCurrency !== "all") {
          params.append("currency", selectedCurrency);
        }

        if (isDateFilterActive && dateFrom) {
          // alert("mmmm" + dateFrom.toISOString().split("T")[0]);
          params.append("date_from", fromISO);
        }

        if (isDateFilterActive && dateTo) {
          // alert("yyyyy" + dateTo;
          params.append("date_to", toISO);
        }
        // if (lastProcessedSaleId) {
        //   params.append("since_id", lastProcessedSaleId.toString());
        // }
        if (
          typeof lastProcessedSaleId === "number" &&
          lastProcessedSaleId > 0
        ) {
          params.append("since_id", lastProcessedSaleId.toString());
        }
        // This ensures pagination works consistently across all pages
        const response = await fetch(`/slyretail/sales?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          credentials: "include", // Include session cookies
        });
        if (!response.ok) {
          throw new Error(
            "Failed to fetch sales data. Status: " + response.status,
          );
        }

        const data = await response.json();

        // Validate and sanitize the response data to prevent object rendering errors
        if (!data || typeof data !== "object") {
          throw new Error("Invalid response format");
        }

        // Sanitize sales data to prevent React object rendering errors
        if (Array.isArray(data.sales)) {
          data.sales = data.sales.map((sale: any) => {
            // Sanitize payments array
            if (Array.isArray(sale.payments)) {
              sale.payments = sale.payments.map((payment: any) => ({
                ...payment,
                currency:
                  typeof payment.currency === "string"
                    ? payment.currency
                    : payment.currency?.name ||
                      payment.currency?.isoCode ||
                      "USD",
                amount:
                  typeof payment.amount === "number"
                    ? payment.amount
                    : Number(payment.amount) || 0,
              }));
            }

            // Ensure all other fields are safe for rendering
            return {
              ...sale,
              totalInc:
                typeof sale.totalInc === "number"
                  ? sale.totalInc
                  : Number(sale.totalInc) || 0,
              vatAmount:
                typeof sale.vatAmount === "number"
                  ? sale.vatAmount
                  : Number(sale.vatAmount) || 0,
              customerName:
                typeof sale.customerName === "string"
                  ? sale.customerName
                  : String(sale.customerName || ""),
              receipt:
                typeof sale.receipt === "string"
                  ? sale.receipt
                  : String(sale.receipt || ""),
              receiptType:
                typeof sale.receiptType === "string"
                  ? sale.receiptType
                  : String(sale.receiptType || ""),
            };
          });
        }

        // Ensure taxSummary is properly structured and won't cause rendering errors
        if (data.taxSummary) {
          try {
            // Remove any problematic nested objects that could cause React rendering errors
            if (
              data.taxSummary.periodTaxByCurrency &&
              typeof data.taxSummary.periodTaxByCurrency === "object"
            ) {
              const cleanedTaxSummary: Record<string, any> = {};
              Object.entries(data.taxSummary.periodTaxByCurrency).forEach(
                ([key, value]) => {
                  if (typeof value === "number" || typeof value === "string") {
                    cleanedTaxSummary[key] = value;
                  } else if (typeof value === "object" && value !== null) {
                    // Convert object values to strings to prevent rendering errors
                    cleanedTaxSummary[key] = String(value);
                  }
                },
              );
              data.taxSummary.periodTaxByCurrency = cleanedTaxSummary;
            }
          } catch (error) {
            console.error("Error cleaning tax summary:", error);
            // Remove problematic taxSummary entirely if it can't be cleaned
            delete data.taxSummary;
          }
        }

        // Check if data is already in the expected format with pagination info
        if (data.pagination && Array.isArray(data.sales)) {
          // Check for new sales records that need to be downloaded
          const settings = localStorage.getItem("receiptSettings");
          const parsedSettings = settings ? JSON.parse(settings) : null;
          const autoDownloadEnabled =
            parsedSettings?.autoDownload?.enabled || false;
          const downloadFormat = parsedSettings?.autoDownload?.format || "pdf";

          if (autoDownloadEnabled && data.sales.length > 0) {
            // Find the newest sale in the current batch
            const sortedSales = [...data.sales].sort((a, b) => {
              return (
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
              );
            });

            const newestSale = sortedSales[0];
            // Check if this sale is newer than the last processed one
            if (!lastProcessedSaleId || newestSale.id > lastProcessedSaleId) {
              try {
                //now download the file base on the format prefered
                await handleAutoDownload(newestSale);

                // Update the last processed sale ID
                setLastProcessedSaleId(newestSale.id);
                localStorage.setItem(
                  "lastProcessedSaleId",
                  newestSale.id.toString(),
                );

                toast({
                  title: "Auto-Download Complete",
                  description: `Latest sales receipt (${newestSale.receipt}) downloaded in ${downloadFormat} format.`,
                  variant: "default",
                });
              } catch (error) {
                console.error("Failed to auto-download sale record:", error);
                toast({
                  title: "Auto-Download Failed",
                  description:
                    "There was an error downloading the latest sales record.",
                  variant: "destructive",
                });
              }
            } else {
              console.log(
                `No new sales to download (Last processed ID: ${lastProcessedSaleId})`,
              );
            }
          }

          // Always update total pages state based on server response
          if (data.pagination.totalPages !== calculatedTotalPages) {
            setCalculatedTotalPages(data.pagination.totalPages);
          }

          return data;
        }

        // Fallback for older API format that just returns an array
        // Format response to match expected structure
        return {
          sales: Array.isArray(data) ? data : [],
          pagination: {
            totalRecords: Array.isArray(data) ? data.length : 0,
            totalPages: 1,
            currentPage: currentPage,
            pageSize: itemsPerPage,
          },
        };
      } catch (err) {
        console.error("Error fetching sales:", err);
        throw err;
      }
    },

    enabled: stage === "receipts" && !!selectedStoreId && !isSelectingRange, // Critical: pauses query during selection, //&&
    // !isSlimLoading &&
    // !!slimSalesData,
    retry: 1,
    refetchInterval: (query) => {
      // Check if initial data has been fetched
      if (!query.state.data) {
        return false; // Don't refetch until initial data is loaded
      }
      // Check if it's after cutoff time (8pm/22:00)
      const currentCutoffStatus = isAfterCutoffTime();

      // Log the time check details for debugging
      // console.log("Time check during refetch:", getTimeCheckDetails());

      // If it's after cutoff time, update state if needed
      if (currentCutoffStatus && !isAfterCutoff) {
        console.log(
          "Cutoff time reached (20:00), stopping refetch and logging out",
        );
        setIsAfterCutoff(true);
        setShowCutoffModal(true);

        // Log out the user
        clearToken();
        clearStoreId();

        // Return false to stop the refetch
        return false;
      }

      // If we're already logged out due to cutoff time, stop refetching
      if (isAfterCutoff) {
        return false;
      }

      // Otherwise continue with normal polling interval after data has been fully fetched
      //run the 20 sec after data has been fully fetched
      // console.log("Refetching sales data...");

      return 20000; // 20 seconds
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
  //---------------------------------------------------------------------------------------------------------------------------------

  // Scroll position reference to maintain position across page changes
  const scrollPosRef = useRef(0);

  // Store scroll position before navigation
  const storeScrollPosition = () => {
    scrollPosRef.current = window.scrollY;
    // console.log(`Stored scroll position: ${scrollPosRef.current}`);
  };

  // Restore scroll position after data loads
  const restoreScrollPosition = () => {
    if (scrollPosRef.current > 0) {
      // console.log(`Restoring scroll to: ${scrollPosRef.current}`);

      // Use a more robust method with multiple attempts to ensure scroll position is restored
      const maxAttempts = 3;
      let attempts = 0;

      const attemptRestore = () => {
        window.scrollTo({
          top: scrollPosRef.current,
          behavior: "auto",
        });
        attempts++;
        // If we're not at the right position and have attempts left, try again
        if (
          Math.abs(window.scrollY - scrollPosRef.current) > 10 &&
          attempts < maxAttempts
        ) {
          setTimeout(attemptRestore, 50 * attempts); // Increasing delay with each attempt
        }
      };
      // Start the first attempt after a short delay to let DOM update
      setTimeout(attemptRestore, 50);
    }
  };
  //-------------------------------------------------------------------------------------------------------------------------------------------

  // 1. Store API response in state
  useEffect(() => {
    if (salesResponse) {
      setSalesData(salesResponse.sales);
      if (currentPage === 0) setCurrentPage(1);
      let receipts = salesResponse.sales;
      // Only initialize if we don't have active filters
      if (!isDateFilterActive) {
        // alert("am not active");
        const now = new Date();
        setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1));
        setDateTo(now);
        setIsDateFilterActive(true);
      }

      // Clear pagination loading state when data loads
      if (isPaginationLoading) {
        setIsPaginationLoading(false);
        setLoadingProgress(0);
      }
    }
  }, [salesResponse, isPaginationLoading]);

  // Animate progress bar during pagination loading
  useEffect(() => {
    if (isPaginationLoading) {
      setLoadingProgress(0);
      const interval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 90) {
            return prev; // Stop at 90% until data actually loads
          }
          return prev + Math.random() * 10 + 5; // Random increment between 5-15%
        });
      }, 200);

      return () => clearInterval(interval);
    }
  }, [isPaginationLoading]);

  // Query to fetch currencies from database
  const { data: currenciesResponse, isLoading: isCurrenciesLoading } =
    useQuery<{
      success: boolean;
      data: Array<{
        name: string;
        isoCode: string;
        rate: string;
      }>;
    }>({
      queryKey: ["/api/currencies"],
      enabled: stage === "receipts" && !!selectedStoreId,
      retry: 1,
    });

  // Extract the sales from the response
  // const sales = displayData?.sales || [];
  const sales = salesResponse?.sales || [];
  const currencies = currenciesResponse?.data || [];
  const taxSummary = salesResponse?.taxSummary.periodTaxByCurrency || 0.0;
  const totalZeroRated =
    salesResponse?.taxSummary.periodTotalZeroRatedByCurrency || 0.0;
  const totalSalesIncVat =
    salesResponse?.taxSummary.periodtotalSalesIncVatByCurrency || 0.0;

  useEffect(() => {
    if (selectedCurrency !== "all" && sales.length > 0) {
      toast({
        title: "Currency Filter Applied",
        description: (
          <div className="grid gap-1">
            <div>
              Total VAT(inc) Sales:{" "}
              {`${selectedCurrency} ${totalSalesIncVat.toFixed(2)}`}
            </div>
            <div>
              Total ZERO Rated Sales:{" "}
              {`${selectedCurrency} ${totalZeroRated.toFixed(2)}`}
            </div>
          </div>
        ),
      });
    }
  }, [selectedCurrency, totalZeroRated, totalSalesIncVat]);

  //now sort the sales by receipt number
  sales.sort((a: Sale, b: Sale) =>
    b.receipt.localeCompare(a.receipt, undefined, { numeric: true }),
  );

  // useEffect(() => {
  //   if (error) {
  //     console.error("Sales query error:", error);
  //     toast({
  //       title: "Error",
  //       description:
  //         error instanceof Error ? error.message : "Failed to load sales data",
  //       variant: "destructive",
  //     });
  //   }
  // }, [error, toast]);

  // Add more robust error handling for sales processing
  useEffect(() => {
    if (!sales || !Array.isArray(sales)) return;

    try {
      const currentLastId = lastProcessedSaleId;
      // console.log("Current last processed ID:", currentLastId);

      // Get new sales (those with IDs higher than the last processed ID)
      const newSales = sales.filter((sale) => {
        const isNew = currentLastId === null || sale.id > currentLastId;
        if (isNew) {
          console.log("Found new sale:", sale.receipt);
        }
        return isNew;
      });

      if (newSales.length > 0) {
        // Update the last processed sale ID and save it to localStorage
        const maxId = Math.max(...newSales.map((sale) => sale.id));
        setLastProcessedSaleId(maxId);
        localStorage.setItem("lastProcessedSaleId", maxId.toString());

        // Get current settings
        const settings = getSettings();

        // If auto-download is enabled, process each new sale
        if (settings.autoDownload?.enabled) {
          // Determine the most appropriate processing method based on page visibility
          const isPageVisible = !document.hidden;

          if (isPageVisible) {
            // If page is visible, process normally
            newSales.forEach(handleAutoDownload);
          } else {
            console.log("Processing sales in background using WebWorker");
            // If page is not visible and we have a worker, use it
            if (workerRef.current) {
              newSales.forEach((sale) => {
                // Send the sale to the worker for background processing
                workerRef.current?.postMessage({
                  type: "PROCESS_SALE",
                  sale,
                  settings,
                });

                // Immediately execute handleAutoDownload without any delay
                // This ensures downloads happen instantly even when the page is minimized
                console.log(
                  `Immediately processing sale in background: ${sale.receipt}`,
                );
                handleAutoDownload(sale)
                  .then(() =>
                    console.log(`Background processed sale: ${sale.receipt}`),
                  )
                  .catch((err) =>
                    console.error(
                      `Background processing error: ${err.message}`,
                    ),
                  );
              });
            } else {
              console.log("No Web Worker available, processing in main thread");
              // Fallback to main thread if worker not available
              newSales.forEach(handleAutoDownload);
            }
          }
        } else {
          console.log("Auto-download is disabled, skipping processing");
        }
      }
    } catch (err) {
      console.error("Error processing sales:", err);
      toast({
        title: "Error",
        description: "Failed to process new sales",
        variant: "destructive",
      });
    }
  }, [sales, lastProcessedSaleId]);

  //-----------------------------------------------------------------------------------------------------------------------------------------
  // Apply client-side filtering to the server-paginated sales data
  const filteredSales =
    sales?.filter((sale) => {
      // Apply search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        sale.receipt.toLowerCase().includes(searchLower) ||
        sale.storeName.toLowerCase().includes(searchLower) ||
        sale.total.toString().includes(searchLower) ||
        new Date(sale.timestamp)
          .toLocaleString()
          .toLowerCase()
          .includes(searchLower);

      // Apply currency filter if a specific currency is selected
      const matchesCurrency =
        selectedCurrency === "all" ||
        sale.payments.some((payment) => payment.currency === selectedCurrency);

      // Apply date filter if active
      if (isDateFilterActive) {
        // Create a date object from the sale timestamp
        const saleDate = new Date(sale.timestamp);

        // Handle date comparison correctly
        // If no dateFrom, or if saleDate is after or equal to the start date
        const fromDateCheck =
          !dateFrom || saleDate.getTime() >= dateFrom.getTime();

        // If no dateTo, or if saleDate is before or equal to the end date (+23:59:59)
        // This ensures we include all sales on the end date up to midnight
        const toDateCheck =
          !dateTo ||
          saleDate.getTime() <= new Date(dateTo).setHours(23, 59, 59, 999);

        return matchesSearch && matchesCurrency && fromDateCheck && toDateCheck;
      }

      return matchesSearch && matchesCurrency;
    }) || [];
  //------------------------------------------------------------------------------------------------------------------------

  //---------------------------------------------------------------------------------------------------------------------------------
  const handleStoreSelect = (storeId: string) => {
    setSelectedStoreId(storeId);
    setStoreId(storeId);
    setStage("receipts");
  };

  const handlePrintReceipt = async (sale: Sale) => {
    try {
      const success = await printReceipt({ sale });
      if (!success) {
        throw new Error("Failed to print receipt");
      }

      toast({
        title: "Success",
        description: "Receipt sent to printer",
      });
    } catch (err) {
      console.error("Print error:", err);
      toast({
        title: "Error",
        description: "Failed to print receipt. Please try again.",
        variant: "destructive",
      });
    }
  };
  //------------------------------------------------------------------------------------------------
  const handleDownloadPDF = async (sale: Sale) => {
    try {
      const settings = getSettings();
      const success = await downloadReceipt(sale, settings.receiptSize);
      if (!success) {
        throw new Error("Failed to download PDF");
      }
      toast({
        title: "Success",
        description: "Receipt PDF downloaded",
      });
    } catch (err) {
      console.error("Download error:", err);
      toast({
        title: "Error",
        description: "Failed to download PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handler to open the debit note modal
  const handleOpenDebitNoteModal = () => {
    setShowDebitNoteModal(true);
  };

  // Handler to create a debit note
  const handleCreateDebitNote = async (formData: DebitNoteFormData) => {
    try {
      if (!apiToken) {
        throw new Error("API token is required");
      }

      // Prepare the debit note data
      const debitNoteData = {
        supplierName: formData.supplierName,
        supplierVAT: formData.supplierVAT,
        supplierTIN: formData.supplierTIN,
        reason: formData.reason,
        items: formData.items.map((item) => ({
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      };

      // Send the debit note data to the server
      const response = await fetch("/api/debit-notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify(debitNoteData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create debit note");
      }

      // Close the modal
      setShowDebitNoteModal(false);

      // Show success message
      toast({
        title: "Success",
        description: "Debit note created successfully",
      });

      // Refresh the data
      refetch();
    } catch (error) {
      console.error("Error creating debit note:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create debit note",
        variant: "destructive",
      });
    }
  };
  //function that willl check if its same date
  function isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
  // Enhanced pagination UI component relying on server pagination data
  const renderPagination = () => {
    // Determine the total pages to display - ensure it's never less than 1
    const displayTotalPages = Math.max(1, calculatedTotalPages);

    // Ensure current page is within valid range
    const displayCurrentPage = Math.min(
      displayTotalPages,
      Math.max(1, currentPage),
    );
    const handlePageChange = async (newPage: number) => {
      // Store scroll position
      storeScrollPosition();
      setIsUserInitiatedNavigation(true);
      setIsManualNavigation(true);
      setIsPaginationLoading(true);
      setCurrentPage(newPage);

      // The loading state will be cleared when the sales query completes
      // This happens automatically via the useEffect that watches salesResponse
    };

    // Get total records for informational display
    const totalRecords =
      salesResponse?.pagination?.totalRecords || filteredSales.length;

    // Display source of pagination data for debugging
    const usingFilters =
      isDateFilterActive || selectedCurrency !== "all" || !!searchQuery;
    const paginationSource = usingFilters
      ? "client-side filtering"
      : "server data";

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
        {/* Progress bar - shown when pagination is loading */}
        {isPaginationLoading && (
          <div className="w-full mb-2">
            <div className="flex items-center gap-2 text-sm text-blue-600 mb-1">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              Loading next page...
            </div>
            <Progress value={loadingProgress} className="h-2" />
          </div>
        )}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value) => {
              if (!isPaginationLoading) {
                // Store current scroll position to maintain it across navigation
                storeScrollPosition();

                // Set flag to indicate this is user-initiated navigation
                setIsUserInitiatedNavigation(true);
                setIsPaginationLoading(true);

                // Update the page size
                const newPageSize = parseInt(value);
                setItemsPerPage(newPageSize);
                localStorage.setItem("itemsPerPage", newPageSize.toString());
                // Reset to page 1 when changing page size
                setCurrentPage(1);
              }
            }}
            disabled={isPaginationLoading}
          >
            <SelectTrigger className="w-32 border-blue-200 text-sm">
              <SelectValue placeholder="Items per page" />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 25].map((num) => (
                <SelectItem key={`per-page-${num}`} value={num.toString()}>
                  {num} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-gray-600 whitespace-nowrap font-medium">
            Page {displayCurrentPage} of {displayTotalPages}
            {usingFilters && (
              <span className="ml-1 text-blue-500">(filtered)</span>
            )}
          </span>
          <span className="text-xs text-gray-500 hidden sm:inline-block ml-2">
            {totalRecords} record{totalRecords !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-2 w-full sm:w-auto justify-center sm:justify-end">
          <Button
            variant="outline"
            onClick={async () => {
              // Fixes double-click issue: use displayCurrentPage to avoid stale state
              // This ensures we always use the latest page number
              if (displayCurrentPage > 1 && !isPaginationLoading) {
                // Store current scroll position to maintain it across navigation
                storeScrollPosition();

                handlePageChange(Math.max(1, displayCurrentPage - 1));
              }

              // Move to previous page - use displayCurrentPage for immediate response
              const newPage = displayCurrentPage - 1;

              // Using immediate value prevents stale state issues
              console.log(`Moving to previous page: ${newPage}`);

              try {
                // This code block appears to be unused/incomplete - removing the undefined params usage
                console.log("Previous page navigation completed");
              } catch (error) {
                console.error("Previous page navigation error:", error);
                toast({
                  title: "Navigation Error",
                  description: "Failed to load the previous page.",
                  variant: "destructive",
                });
              }
            }}
            disabled={displayCurrentPage === 1 || isPaginationLoading}
            className="border-blue-200"
            size="sm"
          >
            {isPaginationLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!isPaginationLoading) {
                handlePageChange(
                  Math.min(displayTotalPages, displayCurrentPage + 1),
                );
              }
            }}
            disabled={
              displayCurrentPage === displayTotalPages || isPaginationLoading
            }
            className="border-blue-200"
            size="sm"
          >
            {isPaginationLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  };

  //get the
  const renderStage = () => {
    switch (stage) {
      case "token":
        return (
          <>
            {/* Integration Guidelines (Collapsible) */}
            {showIntegrationGuide && (
              <Card className="mb-6 shadow-lg border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-orange-800 flex-1">
                          🔗 How to Integrate Loyverse with SlyRetail VFD
                        </h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowIntegrationGuide(false)}
                          className="text-orange-600 hover:text-orange-800"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-orange-700 font-medium">
                        SlyRetail acts as your intermediator between Loyverse
                        POS and ZIMRA
                      </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div className="bg-white p-4 rounded-lg border border-orange-200">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            1
                          </div>
                          <h3 className="font-semibold text-blue-800">
                            Setup Loyverse Store
                          </h3>
                        </div>
                        <p className="text-gray-700 mb-2">
                          In your Loyverse account, go to{" "}
                          <strong>Stores</strong> and edit your store{" "}
                          <strong>Description</strong> field using this exact
                          format:
                        </p>
                        <div className="bg-gray-100 p-3 rounded border border-gray-300">
                          <p className="text-xs text-gray-600 mb-1 font-medium">
                            Example format (use your actual details):
                          </p>
                          <div className="text-xs font-mono text-gray-800 bg-white p-2 rounded border">
                            Email: slymutare275@gmail.com, TIN:2002222221,
                            VAT:220234498, Province:Manicaland
                          </div>
                        </div>
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                          <p className="text-xs text-red-800 font-medium flex items-center gap-2">
                            <span className="text-red-600">⚠️</span>
                            Critical: Use this exact format with commas and
                            spaces as shown. The system will not connect without
                            this precise description format.
                          </p>
                        </div>
                        <p className="text-gray-600 text-xs mt-2">
                          Also complete your store address, city, and region
                          details.
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            2
                          </div>
                          <h3 className="font-semibold text-blue-800">
                            Get Loyverse API Token
                          </h3>
                        </div>
                        <TokenSlideshow />
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-orange-200">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            3
                          </div>
                          <h3 className="font-semibold text-blue-800">
                            Connect to SlyRetail
                          </h3>
                        </div>
                        <p className="text-gray-700 mb-2">
                          Paste your Loyverse API token below and click Connect.
                        </p>
                        <p className="text-xs text-gray-600 mb-3">
                          SlyRetail will automatically sync your sales and
                          fiscalize receipts with ZIMRA.
                        </p>
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-xs text-blue-800 font-medium mb-2 flex items-center gap-2">
                            <span className="text-blue-600">ℹ️</span>
                            Important: Connector Assistance Required
                          </p>
                          <p className="text-xs text-blue-700">
                            After connecting, our technical connectors will
                            complete the final setup process. Please contact us
                            to finish the integration.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Token Input Card with Info Icon */}
            <Card className="mb-4 sm:mb-8 shadow-lg border-blue-100">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setShowIntegrationGuide(!showIntegrationGuide)
                    }
                    className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-2"
                    title="View integration instructions"
                  >
                    <Info className="w-5 h-5" />
                  </Button>
                  <span className="text-sm text-gray-600">
                    Need help? Click the info icon for setup instructions
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Input
                    placeholder="Enter Loyverse API Token"
                    value={apiToken}
                    onChange={(e) => setApiTokenState(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleConnectToken}
                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 w-full sm:w-auto"
                  >
                    Connect
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        );

      case "store":
        return (
          <Card className="mb-4 sm:mb-8 shadow-lg border-blue-100">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <div className="text-center font-medium text-blue-700">
                  Select a Store
                </div>
                <Select
                  value={selectedStoreId}
                  onValueChange={handleStoreSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose store" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Stores">All Stores</SelectItem>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        );

      case "receipts":
        return (
          <>
            {stores.find((store) => store.id === selectedStoreId) && (
              <Card className="mb-4 sm:mb-8 shadow-lg border-blue-100 bg-gradient-to-r from-blue-50 to-teal-50">
                <CardContent className="p-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-center text-blue-700">
                    {stores.find((store) => store.id === selectedStoreId)?.name}
                  </h2>
                </CardContent>
              </Card>
            )}

            <div className="flex flex-col gap-4 mb-4 sm:mb-8 justify-between items-start">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 w-full">
                <div className="col-span-1">
                  <SettingsModal />
                </div>

                {/* Date filter */}
                <div className="w-full sm:w-auto sm:flex-grow min-w-[180px] max-w-full sm:max-w-[280px]">
                  <Popover
                    open={datePopoverOpen}
                    onOpenChange={setDatePopoverOpen}
                  >
                    <div className="flex gap-2 items-center">
                      <PopoverTrigger asChild className="flex-grow">
                        <Button
                          variant={isDateFilterActive ? "default" : "outline"}
                          className={`w-full justify-start text-left font-normal ${
                            isDateFilterActive
                              ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-md"
                              : "border-blue-200"
                          }`}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="truncate text-sm">
                            {dateFrom && dateTo ? (
                              <>
                                {format(dateFrom, "MMM d, yyyy")} -{" "}
                                {format(dateTo, "MMM d, yyyy")}
                              </>
                            ) : (
                              "Filter by date"
                            )}
                          </span>
                        </Button>
                      </PopoverTrigger>

                      {/* Select All checkbox placed in the red box area */}
                    </div>
                    <PopoverContent
                      className="w-auto p-0 border border-gray-200 shadow-md"
                      align="start"
                    >
                      <div className="p-4 border-b bg-blue-50">
                        <div className="flex items-center justify-between">
                          <button
                            className="text-blue-600 hover:text-blue-800 focus:outline-none"
                            onClick={() => {
                              const prevMonth = new Date(currentMonth);
                              prevMonth.setMonth(prevMonth.getMonth() - 1);
                              setCurrentMonth(prevMonth);
                            }}
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          <h3 className="text-xl sm:text-2xl font-bold text-blue-800">
                            {format(currentMonth, "MMMM yyyy")}
                          </h3>
                          <button
                            className="text-blue-600 hover:text-blue-800 focus:outline-none"
                            onClick={() => {
                              const nextMonth = new Date(currentMonth);
                              nextMonth.setMonth(nextMonth.getMonth() + 1);
                              setCurrentMonth(nextMonth);
                            }}
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      <div className="p-2 border-b flex">
                        <div className="mr-2">
                          <Calendar
                            mode="range"
                            selected={{
                              from: dateFrom,
                              to: dateTo,
                            }}
                            onSelect={(range) => {
                              // setIsSelectingRange(true); // Pauses queries
                              // setDateFrom(range?.from);
                              // setDateTo(range?.to);

                              // // Auto-commit if both dates selected
                              // if (range?.from && range?.to) {
                              //   setIsSelectingRange(false);
                              //   setIsDateFilterActive(true);
                              // }
                              if (!range?.from && !range?.to) {
                                // Don't clear if clicking outside dates
                                return;
                              }

                              // Handle single day selection (double-click case)
                              if (
                                range.from &&
                                range.to &&
                                isSameDay(range.from, range.to)
                              ) {
                                setDateFrom(range.from);
                                setDateTo(range.from); // Same as from date for single day
                                setIsDateFilterActive(true);
                                setDatePopoverOpen(false); // Close the popover
                                return;
                              }

                              // Normal range selection
                              setDateFrom(range?.from);
                              setDateTo(range?.to);
                            }}
                            month={currentMonth}
                            onMonthChange={setCurrentMonth}
                            defaultMonth={new Date()}
                            initialFocus
                            className="mx-auto"
                            classNames={{
                              day_selected:
                                "bg-primary text-primary-foreground",
                              day_today:
                                "bg-accent/40 text-gray-900 font-normal",
                              day_range_middle: "bg-accent/30 text-gray-900",
                              day_range_end:
                                "bg-primary text-primary-foreground",
                              day_range_start:
                                "bg-primary text-primary-foreground",
                              caption: "text-sm font-medium my-0.5",
                              cell: "text-sm p-0 relative",
                              day: "h-6 w-6 p-0 font-normal aria-selected:opacity-100 text-xs",
                              head_cell:
                                "text-[10px] font-normal text-gray-500 tracking-tighter px-1",
                              head_row: "flex justify-between",
                              table: "w-full border-collapse",
                              nav_button:
                                "h-5 w-5 bg-transparent p-0 opacity-70 hover:opacity-100",
                              row: "flex mt-1",
                              month: "space-y-2",
                            }}
                            weekStartsOn={0} // Start from Sunday (0)
                            formatters={{
                              formatWeekdayName: (day) => {
                                const names = [
                                  "Su",
                                  "Mo",
                                  "Tu",
                                  "We",
                                  "Th",
                                  "Fr",
                                  "Sa",
                                ];
                                return names[day.getDay()];
                              },
                            }}
                          />
                        </div>
                        <div className="ml-1 w-36">
                          <div className="space-y-1">
                            <button
                              className="w-full py-1 px-2 text-left hover:bg-blue-50 rounded-full transition-colors text-xs border border-gray-200 hover:border-blue-200 focus:outline-none"
                              onClick={() => {
                                const today = new Date();
                                // Set time to start of day (midnight) for proper comparison
                                const todayStart = new Date(today);
                                todayStart.setHours(0, 0, 0, 0);
                                setDateFrom(todayStart);
                                // Set end time to end of day
                                const todayEnd = new Date(today);
                                todayEnd.setHours(23, 59, 59, 999);
                                setDateTo(todayEnd);
                                setIsDateFilterActive(true); // Automatically apply filter
                                setDatePopoverOpen(false); // Close the date picker
                              }}
                            >
                              Today
                            </button>
                            <button
                              className="w-full py-1 px-2 text-left hover:bg-blue-50 rounded-full transition-colors text-xs border border-gray-200 hover:border-blue-200 focus:outline-none"
                              onClick={() => {
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                // Set time to start of day
                                const yesterdayStart = new Date(yesterday);
                                yesterdayStart.setHours(0, 0, 0, 0);
                                setDateFrom(yesterdayStart);
                                // Set end time to end of day
                                const yesterdayEnd = new Date(yesterday);
                                yesterdayEnd.setHours(23, 59, 59, 999);
                                setDateTo(yesterdayEnd);
                                setIsDateFilterActive(true); // Automatically apply filter
                                setDatePopoverOpen(false); // Close the date picker
                              }}
                            >
                              Yesterday
                            </button>
                            <button
                              className="w-full py-1 px-2 text-left hover:bg-blue-50 rounded-full transition-colors text-xs border border-gray-200 hover:border-blue-200 focus:outline-none"
                              onClick={() => {
                                const today = new Date();
                                const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

                                // Start of week (Sunday)
                                const startOfWeek = new Date(today);
                                startOfWeek.setDate(
                                  today.getDate() - dayOfWeek,
                                );
                                startOfWeek.setHours(0, 0, 0, 0);
                                setDateFrom(startOfWeek);

                                // End of today
                                const endOfToday = new Date(today);
                                endOfToday.setHours(23, 59, 59, 999);
                                setDateTo(endOfToday);

                                setIsDateFilterActive(true); // Automatically apply filter
                                setDatePopoverOpen(false); // Close the date picker
                              }}
                            >
                              This week
                            </button>
                            <button
                              className="w-full py-1 px-2 text-left hover:bg-blue-50 rounded-full transition-colors text-xs border border-gray-200 hover:border-blue-200 focus:outline-none"
                              onClick={() => {
                                const today = new Date();

                                // Start of month with time set to midnight
                                const startOfMonth = new Date(
                                  today.getFullYear(),
                                  today.getMonth(),
                                  1,
                                );
                                startOfMonth.setHours(0, 0, 0, 0);
                                setDateFrom(startOfMonth);

                                // End of today
                                const endOfToday = new Date(today);
                                endOfToday.setHours(23, 59, 59, 999);
                                setDateTo(endOfToday);

                                setIsDateFilterActive(true); // Automatically apply filter
                                setDatePopoverOpen(false); // Close the date picker
                              }}
                            >
                              This month
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="px-2 py-2 border-t">
                        <div className="flex items-center justify-between text-xs mb-3">
                          <div>
                            <span className="font-medium">Start:</span>{" "}
                            {dateFrom
                              ? format(dateFrom, "MM/dd/yyyy")
                              : "Not set"}
                          </div>
                          <div>
                            <span className="font-medium">End:</span>{" "}
                            {dateTo ? format(dateTo, "MM/dd/yyyy") : "Not set"}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            className="rounded-full px-5 py-1 h-8 flex items-center border-gray-200 text-sm w-1/2"
                            onClick={() => {
                              setIsDateFilterActive(false);
                              // setDateFrom(undefined);
                              // setDateTo(undefined);
                              setDatePopoverOpen(false); // Close the date picker
                            }}
                          >
                            <X className="h-3.5 w-3.5 mr-1.5" />
                            Clear
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full px-5 py-1 h-8 flex items-center border-gray-200 text-sm w-1/2"
                            onClick={() => {
                              if (dateFrom) {
                                setDateFrom(dateFrom);
                                setDateTo(dateTo || dateFrom);
                                setIsDateFilterActive(true);
                                setIsSelectingRange(false);
                                setDatePopoverOpen(false); // Close the date picker
                              } else {
                                toast({
                                  title: "Select date range",
                                  description:
                                    "Please select at least a start date to filter",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <Check className="h-3.5 w-3.5 mr-1.5" />
                            Apply
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Currency filter */}
                <div className="w-full sm:w-auto">
                  <Select
                    value={selectedCurrency}
                    onValueChange={(value) => setSelectedCurrency(value)}
                  >
                    <SelectTrigger
                      className={`w-full min-w-[180px] border-blue-200 text-sm ${
                        selectedCurrency !== "all"
                          ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white"
                          : ""
                      }`}
                    >
                      {selectedCurrency !== "all" ? (
                        <div className="flex items-center justify-between w-full">
                          <span>{selectedCurrency}</span>
                          <span className="ml-2 text-xs font-medium text-white">
                            Tax: {taxSummary.toString()}
                          </span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Filter by currency" />
                      )}
                    </SelectTrigger>
                    <SelectContent className="min-w-[240px]">
                      <SelectItem value="all">All Currencies</SelectItem>
                      {sales &&
                        (() => {
                          // Get all unique currencies dynamically from the sales data
                          const currencies: string[] = [];
                          currencies.push("USD"); //this should come from database
                          currencies.push("ZWG");
                          return currencies.map((currency) => (
                            <SelectItem
                              key={currency}
                              value={currency}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center justify-between w-full pr-4">
                                <span>{currency}</span>
                              </div>
                            </SelectItem>
                          ));
                        })()}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start sm:items-center w-full md:w-auto">
                <div className="w-full sm:w-auto">
                  <SearchBox
                    onSearch={(query) => setSearchQuery(query)}
                    className="w-full"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="border-blue-200 text-blue-700 hover:bg-blue-50 w-full"
                    onClick={() => {
                      setShowTaxSchedule(!showTaxSchedule);
                      setRemoveOtherBlocks(!removeOtherBlocks);
                    }}
                  >
                    {showTaxSchedule ? (
                      <>
                        <X className="w-4 h-4 mr-2" />
                        Hide Tax Schedule
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Preview Tax Schedule
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="border-green-200 text-green-700 hover:bg-green-50 w-full"
                    onClick={() => {
                      // Open modal with an empty sale to show selection UI
                      setSelectedSaleForDebitNote(undefined);
                      setShowDebitNoteModal(true);
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Create Debit Note
                  </Button>
                  <Button
                    variant="outline"
                    className="border-purple-200 text-purple-700 hover:bg-purple-50 w-full"
                    onClick={() => setShowZReportsModal(true)}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Z-Reports
                  </Button>
                  <Button
                    onClick={() => {
                      clearToken();
                      clearStoreId();
                      setStage("token");
                      setApiTokenState("");
                    }}
                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 w-full sm:w-auto"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </div>

            {/* Tax Schedule Table View - Conditional */}
            {showTaxSchedule ? (
              <Card className="mb-6 shadow-lg border-blue-100 dark:border-blue-800">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                      Tax Schedule Summary
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-purple-200 text-purple-700 hover:bg-purple-50"
                      onClick={async () => {
                        try {
                          const success = await downloadTaxSchedule(
                            salesData,
                            isDateFilterActive ? dateFrom : undefined,
                            isDateFilterActive ? dateTo : undefined,
                          );
                          if (success) {
                            toast({
                              title: "Tax Schedule Downloaded",
                              description:
                                "Tax schedule report has been downloaded successfully",
                            });
                          } else {
                            throw new Error("Download failed");
                          }
                        } catch (error) {
                          console.error("Tax schedule download error:", error);
                          toast({
                            title: "Download Failed",
                            description: "Failed to download tax schedule",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download CSV
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-blue-700 dark:text-blue-400">
                            Date
                          </th>
                          <th className="text-left p-2 font-medium text-blue-700 dark:text-blue-400">
                            Invoice Number
                          </th>
                          <th className="text-left p-2 font-medium text-blue-700 dark:text-blue-400">
                            Customer
                          </th>
                          <th className="text-right p-2 font-medium text-blue-700 dark:text-blue-400">
                            Tax Amount
                          </th>
                          <th className="text-right p-2 font-medium text-blue-700 dark:text-blue-400">
                            Invoice Total Inclusive
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesData.map((sale, index) => (
                          <tr
                            key={sale.id}
                            className={`border-b border-border hover:bg-muted/50 ${
                              index % 2 === 0 ? "bg-background" : "bg-muted/30"
                            }`}
                          >
                            <td className="p-2 text-foreground">
                              {new Date(sale.timestamp).toLocaleDateString()}
                            </td>
                            <td className="p-2 text-blue-600 font-medium">
                              {sale.receipt}
                            </td>
                            <td className="p-2 text-foreground">
                              {sale.customerName || "Cash Sale"}
                            </td>
                            <td className="p-2 text-right text-foreground">
                              ${Number(sale.vatAmount).toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-medium text-foreground">
                              ${Number(sale.totalInc).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-blue-300 bg-blue-50 dark:bg-blue-900/20">
                          <td
                            colSpan={3}
                            className="p-2 font-semibold text-blue-700 dark:text-blue-400"
                          >
                            Total ({salesData.length} invoices)
                          </td>
                          <td className="p-2 text-right font-semibold text-blue-700 dark:text-blue-400">
                            $
                            {salesData
                              .reduce(
                                (sum, sale) => sum + Number(sale.vatAmount),
                                0,
                              )
                              .toFixed(2)}
                          </td>
                          <td className="p-2 text-right font-semibold text-blue-700 dark:text-blue-400">
                            $
                            {salesData
                              .reduce(
                                (sum, sale) => sum + Number(sale.totalInc),
                                0,
                              )
                              .toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              !removeOtherBlocks && (
                <>
                  {isSalesLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton
                          key={`loading-skeleton-${i}`}
                          className="h-32"
                        />
                      ))}
                    </div>
                  ) : error ? (
                    <Card className="bg-red-50 border-red-200">
                      <CardContent className="p-4 text-red-700">
                        Failed to load sales data. Please try again.
                      </CardContent>
                    </Card>
                  ) : salesData.length === 0 ? (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-6 text-center">
                        <div className="text-blue-700 font-medium">
                          No receipts found
                        </div>
                        <p className="text-sm text-blue-600 mt-2">
                          {searchQuery &&
                            `No receipts match the search term "${searchQuery}"`}
                          {!searchQuery &&
                            isDateFilterActive &&
                            selectedCurrency !== "all" &&
                            "Try a different date range or currency filter"}
                          {!searchQuery &&
                            isDateFilterActive &&
                            selectedCurrency === "all" &&
                            "Try selecting a different date range"}
                          {!searchQuery &&
                            !isDateFilterActive &&
                            selectedCurrency !== "all" &&
                            "Try selecting a different currency"}
                          {!searchQuery &&
                            !isDateFilterActive &&
                            selectedCurrency === "all" &&
                            "No receipts are available"}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {/* Select All before first invoice */}
                      <div className="flex items-center justify-between mb-2 p-3 bg-card border border-blue-200 dark:border-blue-800 rounded-md shadow-sm">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={
                              selectedSales.length > 0 &&
                              selectedSales.length === salesData.length
                            }
                            onChange={handleSelectAll}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            id="selectAllCheckbox"
                          />
                          <label
                            htmlFor="selectAllCheckbox"
                            className="cursor-pointer text-blue-700 font-medium"
                          >
                            Select All
                          </label>
                        </div>

                        {selectedSales.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadSelected}
                            className="border-gray-200 bg-green-50 text-green-700 hover:bg-green-100"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download {selectedSales.length} selected
                          </Button>
                        )}
                      </div>

                      {salesData.map((sale) => (
                        <Card
                          key={sale.id}
                          className={`shadow-md hover:shadow-lg border-blue-100 ${
                            selectedSales.some((s) => s.id === sale.id)
                              ? "bg-blue-50"
                              : ""
                          }`}
                        >
                          <CardContent className="p-4 sm:p-6">
                            {/* Mobile and Desktop Header Layout */}
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={selectedSales.some(
                                    (s) => s.id === sale.id,
                                  )}
                                  onChange={() => handleSelectSale(sale)}
                                  className="h-4 w-4"
                                />
                                <h3 className="text-blue-700 font-medium text-lg">
                                  {sale.receiptType} #{sale.receipt}
                                </h3>
                              </div>
                              <div className="flex gap-2">
                                {/* Download dropdown for both desktop and mobile */}
                                <div className="hidden sm:block">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        className="border-gray-200"
                                      >
                                        <Download className="w-4 h-4 mr-2" />
                                        Download
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      <DropdownMenuItem
                                        onClick={() => handleDownloadPDF(sale)}
                                      >
                                        <FileDown className="w-4 h-4 mr-2" />
                                        PDF
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => downloadCSV(sale)}
                                      >
                                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                                        CSV
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                <div className="sm:hidden">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-gray-200 px-3"
                                      >
                                        <Download className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      <DropdownMenuItem
                                        onClick={() => handleDownloadPDF(sale)}
                                      >
                                        <FileDown className="w-4 h-4 mr-2" />
                                        PDF
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => downloadCSV(sale)}
                                      >
                                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                                        CSV
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {/* Print button - responsive */}
                                <div className="hidden sm:block">
                                  <Button
                                    onClick={() => handlePrintReceipt(sale)}
                                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700"
                                  >
                                    <Printer className="w-4 h-4 mr-2" />
                                    Print
                                  </Button>
                                </div>
                                <div className="sm:hidden">
                                  <Button
                                    size="sm"
                                    onClick={() => handlePrintReceipt(sale)}
                                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 px-3"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Receipt details - Simple vertical layout for all screens */}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <p className="text-gray-600">
                                  Date:{" "}
                                  {new Date(sale.timestamp)
                                    .toISOString()
                                    .replace("T", " ")
                                    .slice(0, 19)}
                                </p>
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-gray-600">
                                  Total: ${Number(sale.totalInc).toFixed(2)}
                                </p>
                                <div className="flex items-center">
                                  <Switch
                                    title="Fiscalisation Status"
                                    checked={!!sale.zimraSubmitted} // Always show checked if submitted, regardless of errors
                                    onCheckedChange={async (checked) => {
                                      try {
                                        if (checked === true) {
                                          toast({
                                            title: "Updating...",
                                            description:
                                              "Updating ZIMRA submission status",
                                          });

                                          const result =
                                            await updateZimraStatus(
                                              sale.zimraFiscalDayNo,
                                              sale.zimraDeviceId,
                                            );

                                          if (result.success) {
                                            toast({
                                              title: "Saved",
                                              description: `Receipts saved successfully`,
                                            });
                                            refetch();
                                          } else {
                                            toast({
                                              title: "Error",
                                              description:
                                                "Failed to update ZIMRA status",
                                              variant: "destructive",
                                            });
                                          }
                                        }
                                      } catch (error) {
                                        console.error(
                                          "Error updating ZIMRA status:",
                                          error,
                                        );
                                        toast({
                                          title: "Error",
                                          description:
                                            "Failed to update ZIMRA status",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className={(() => {
                                      try {
                                        let errorData;
                                        // Parse the error data for color determination
                                        try {
                                          errorData = sale.zimraError;
                                          if (
                                            sale.zimraError?.trim() !== "{}"
                                          ) {
                                            if (!sale.zimraError) {
                                              console.log("am empty");
                                              errorData = {
                                                validationErrorColor: null,
                                              };
                                            } else {
                                              // Step 1: Remove outer braces and extra quotes
                                              const fixedJson = sale.zimraError
                                                .slice(1, -1) // Removes outer `{` and `}`
                                                .replace(/\\"/g, '"') // Replaces `\"` with `"`
                                                .trim();

                                              const fixedJson2 = fixedJson
                                                .slice(1, -1) // Removes outer `{` and `}`
                                                .trim();
                                              console.log(fixedJson2);

                                              // Step 1: Split by '","' (the exact separator between objects)
                                              if (
                                                fixedJson2.includes('}","{')
                                              ) {
                                                const jsonParts =
                                                  fixedJson2.split('}","{');
                                                console.log(jsonParts);
                                                // Fix and parse both JSON objects
                                                const fixedJsonObjects =
                                                  jsonParts
                                                    .map((jsonStr, index) => {
                                                      let fixedJson = jsonStr;
                                                      // Add missing closing brace to first item
                                                      // console.log(index);

                                                      if (
                                                        index === 0 &&
                                                        !fixedJson.endsWith("}")
                                                      ) {
                                                        fixedJson += "}";
                                                      }
                                                      // Add missing opening brace to second item
                                                      if (
                                                        index &&
                                                        !fixedJson.startsWith(
                                                          "{",
                                                        )
                                                      ) {
                                                        fixedJson =
                                                          "{" + fixedJson;
                                                      }
                                                      if (
                                                        index &&
                                                        !fixedJson.endsWith("}")
                                                      ) {
                                                        fixedJson += "}";
                                                      }
                                                      // Add missing opening brace to second item
                                                      if (
                                                        index &&
                                                        !fixedJson.startsWith(
                                                          "{",
                                                        )
                                                      ) {
                                                        fixedJson =
                                                          "{" + fixedJson;
                                                      }

                                                      try {
                                                        return JSON.parse(
                                                          fixedJson,
                                                        );
                                                      } catch (error) {
                                                        console.error(
                                                          `Error parsing JSON ${index + 1}:`,
                                                          error,
                                                        );
                                                        return null;
                                                      }
                                                    })
                                                    .filter(
                                                      (obj) => obj !== null,
                                                    );

                                                console.log(fixedJsonObjects);
                                                //array to get the colors
                                                const colors = [];
                                                //loop in the arrayto check fo the validationErrorColor
                                                for (
                                                  let i = 0;
                                                  i < fixedJsonObjects.length;
                                                  i++
                                                ) {
                                                  colors.push(
                                                    fixedJsonObjects[i]
                                                      .validationErrorColor,
                                                  );
                                                }
                                                console.log(colors);
                                                //now check if it include red
                                                if (colors.includes("Red")) {
                                                  errorData = {
                                                    validationErrorColor: "Red",
                                                  };
                                                } else if (
                                                  colors.includes("Yellow") &&
                                                  colors.includes("Gray")
                                                ) {
                                                  errorData = {
                                                    validationErrorColor:
                                                      "Gray",
                                                  };
                                                }
                                              } else {
                                                // Step 2: Parse the cleaned JSON
                                                const parsedData =
                                                  JSON.parse(fixedJson2);

                                                console.log(
                                                  parsedData.validationErrorColor,
                                                );
                                                errorData = parsedData;
                                              }
                                            }
                                          } else if (
                                            sale.zimraError?.trim() === "{}"
                                          ) {
                                            return "data-[state=unchecked]:bg-blue-600 data-[state=checked]:bg-blue-600";
                                          }
                                        } catch (e) {
                                          errorData = {
                                            validationErrorColor: null,
                                          };
                                          console.log(e);
                                        }

                                        const validationColor =
                                          errorData?.validationErrorColor?.toLowerCase();
                                        // Return color based on validation error if it exists
                                        if (validationColor) {
                                          switch (validationColor) {
                                            case "yellow":
                                              return "data-[state=unchecked]:bg-yellow-400 data-[state=checked]:bg-yellow-400";
                                            case "red":
                                              return "data-[state=unchecked]:bg-red-500 data-[state=checked]:bg-red-500";
                                            case "gray":
                                              return "data-[state=unchecked]:bg-gray-400 data-[state=checked]:bg-gray-400";
                                          }
                                        } else {
                                          //set it to grey
                                          return "data-[state=unchecked]:bg-gray-400 data-[state=checked]:bg-gray-400";
                                        }
                                      } catch (e) {
                                        console.error(
                                          "Error processing ZIMRA error:",
                                          e,
                                        );
                                        return sale.zimraSubmitted
                                          ? "data-[state=checked]:bg-green-500"
                                          : "data-[state=unchecked]:bg-red-500";
                                      }
                                    })()}
                                  />
                                </div>
                              </div>
                              <p className="text-muted-foreground">
                                Currency:{" "}
                                {typeof sale.payments[0]?.currency === "string"
                                  ? sale.payments[0].currency
                                  : (sale.payments[0]?.currency as any)?.name ||
                                    (sale.payments[0]?.currency as any)
                                      ?.isoCode ||
                                    "USD"}
                              </p>
                              <p className="text-muted-foreground">
                                Customer: {sale.customerName || "Cash Sale"}
                              </p>
                            </div>

                            {/* Tax information aligned to the right */}
                            <div className="mt-3 text-right">
                              {sale.payments.map((payment, idx) => {
                                // Calculate individual receipt tax
                                const receiptTax =
                                  sale.payments.length === 1
                                    ? Number(sale.vatAmount)
                                    : Number(sale.vatAmount) *
                                      (Number(payment.amount) /
                                        Number(sale.totalInc));

                                // Safely convert currency to string
                                const currency =
                                  typeof payment.currency === "string"
                                    ? payment.currency
                                    : (payment.currency as any)?.name ||
                                      (payment.currency as any)?.isoCode ||
                                      "USD";

                                return (
                                  <p
                                    key={`tax-${idx}`}
                                    className="text-muted-foreground text-sm"
                                  >
                                    {currency} Tax: {receiptTax.toFixed(2)}
                                  </p>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
            {renderPagination()}
          </>
        );
    }
  };

  // Extract budget alerts and notification settings for BudgetAlertChecker
  const settings = getSettings();
  const notificationsEnabled = settings.notifications?.enabled || false;
  const emailEnabled = settings.notifications?.methods?.email || false;
  const budgetAlerts = settings.notifications?.budgetAlerts;
  const emailAddress = settings.notifications?.emailAddress;

  // Wrap render in try-catch to prevent React object rendering errors
  const renderContent = () => {
    try {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-background">
          {/* Cutoff Time Modal - shown when it's after 8pm */}
          <CutoffTimeModal
            isOpen={showCutoffModal}
            onClose={() => setShowCutoffModal(false)}
            onSubmit={(token) => {
              setApiTokenState(token);
              setIsAfterCutoff(false);
              handleConnectToken();
              setShowCutoffModal(false);
            }}
          />

          {/* Debit Note Modal */}
          <DebitNoteModal
            isOpen={showDebitNoteModal}
            onClose={() => {
              setShowDebitNoteModal(false);
            }}
            onSubmit={handleCreateDebitNote}
            apiToken={apiToken}
          />

          <div className="container mx-auto py-4 sm:py-8 px-4">
            <div className="max-w-4xl mx-auto">
              <Logo />
              {renderStage()}
              <div className="mt-8 text-center text-muted-foreground">
                SlyRetail POS
              </div>

              {/* Budget Alert Checker Component */}
              {stage === "receipts" && sales && Array.isArray(sales) && (
                <BudgetAlertChecker
                  budgetAlerts={budgetAlerts}
                  sales={sales}
                  enabled={
                    notificationsEnabled &&
                    emailEnabled &&
                    !!budgetAlerts?.enabled
                  }
                />
              )}
            </div>
          </div>

          {/* Contact Footer - Fixed position bottom right */}
          <ContactFooter />

          {/* Z-Reports Modal */}
          <ZReportsModal
            open={showZReportsModal}
            onOpenChange={setShowZReportsModal}
          />
        </div>
      );
    } catch (error) {
      console.error("React rendering error:", error);
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-background">
          <div className="container mx-auto py-4 sm:py-8 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-red-600 mb-4">
                  Application Error
                </h1>
                <p className="text-gray-600 mb-4">
                  Please refresh the page to continue.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  return <ErrorBoundary>{renderContent()}</ErrorBoundary>;
}
