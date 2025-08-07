import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { generateFiscalDayReportPDF } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, FileText, RefreshCw } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FiscalCounter {
  fiscalCounterType: string;
  fiscalCounterTaxID: number | null;
  fiscalCounterValue: number;
  fiscalCounterCurrency: string;
  fiscalCounterTaxPercent: number | null;
  fiscalCounterMoneyType?: string;
}

interface FiscalDay {
  id: number;
  fiscalDayNo: string;
  deviceId: string;
  openedAt: string | null;
  closedAt: string | null;
  status: string;
  totalTransactions?: number;
  totalAmount?: number;
  fiscalCounters?: FiscalCounter[];
}

interface CurrencyTotals {
  totalZeroRated: number;
  totalExempt: number;
  totalStandardRated: number;
  totalZeroRatedTax: number;
  totalExemptTax: number;
  totalStandardRatedTax: number;
}

interface FiscalDayResponse {
  data: FiscalDay[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  totals: {
    USD: CurrencyTotals;
    ZWG: CurrencyTotals;
  };
}

interface ZReportsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ZReportsModal({ open, onOpenChange }: ZReportsModalProps) {
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'ZWG'>('USD');
  const { toast } = useToast();

  const {
    data: fiscalDayResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<FiscalDayResponse>({
    queryKey: ["/api/fiscal-days", currentPage, pageSize],
    queryFn: async () => {
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        throw new Error("Authentication token not found");
      }

      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: pageSize.toString(),
      });

      const response = await fetch(`/api/fiscal-days?${params}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fiscal days: ${response.status}`);
      }

      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: open, // Only fetch when modal is open
  });

  const fiscalDays = fiscalDayResponse?.data || [];
  const pagination = fiscalDayResponse?.pagination;

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Get totals from the backend response based on selected currency
  const totals = fiscalDayResponse?.totals?.[selectedCurrency] || {
    totalZeroRated: 0,
    totalExempt: 0,
    totalStandardRated: 0,
    totalZeroRatedTax: 0,
    totalExemptTax: 0,
    totalStandardRatedTax: 0
  };

  const handleViewPDF = async (deviceId: string, fiscalDayNo: string) => {
    try {
      setIsDownloading(fiscalDayNo);
      const token = localStorage.getItem("loyverseToken");
      if (!token) {
        toast({
          title: "Authentication Error",
          description: "Please log in again to view fiscal day reports",
          variant: "destructive",
        });
        return;
      }

      // Make API call to generate/fetch fiscal day PDF
      const response = await fetch(
        `/api/zimra/fiscal-day-report/${deviceId}/${fiscalDayNo}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch fiscal day report: ${response.status}`,
        );
      }
      //get the fiscal data from the response
      const fiscalData = await response.json();
      if (!fiscalData){
        throw new Error("Failed to fetch fiscal day report");
      }
      //now call the function that will create the structure of the pdf
      const pdfData = await generateFiscalDayReportPDF(fiscalData.fiscalDay);
      if (!pdfData) {
        throw new Error("Failed to generate fiscal day report");
      }
      // Create a blob from the PDF data
      const blob = new Blob([pdfData], { type: "application/pdf" });

      // Create a temporary URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Open in new tab
      window.open(url, "_blank");

      // Clean up the URL after a short delay
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);

      toast({
        title: "Z-Report Generated",
        description: `Fiscal day ${fiscalDayNo} report opened in new tab`,
      });
    } catch (error) {
      console.error("Error viewing fiscal day PDF:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to load fiscal day report",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "Not closed";
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            Open
          </Badge>
        );
      case "closed":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            Closed
          </Badge>
        );
      case "pending":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-50 text-yellow-700 border-yellow-200"
          >
            Pending
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-gray-50 text-gray-700 border-gray-200"
          >
            {status}
          </Badge>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Calendar className="mr-2 h-5 w-5" />
            Z-Reports (Fiscal Days)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {error ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-red-600 mb-2">
                    Error Loading Z-Reports
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {error instanceof Error
                      ? error.message
                      : "Unknown error occurred"}
                  </p>
                  <Button onClick={() => refetch()}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex justify-between items-center">
                  <CardTitle>Fiscal Day History</CardTitle>
                  <Button
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${isRefetching ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {isLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      Loading fiscal days...
                    </p>
                  </div>
                ) : fiscalDays && fiscalDays.length > 0 ? (
                  <>
                    {/* Currency Filter and Totals Summary */}
                    <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                      {/* Currency Filter */}
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-base font-semibold">Sales Totals</h3>
                        <Select
                          value={selectedCurrency}
                          onValueChange={(value: 'USD' | 'ZWG') => setSelectedCurrency(value)}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue placeholder="Currency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="ZWG">ZWG (Z$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Totals Grid - Compact */}
                      <div className="grid grid-cols-3 gap-3">
                        {/* Zero Rated Sales */}
                        <div className="text-center bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Zero Rated (0%)</p>
                          <p className="text-sm font-bold text-blue-600">
                            {selectedCurrency === 'USD' 
                              ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                  minimumFractionDigits: 2
                                }).format(totals.totalZeroRated)
                              : `Z$${new Intl.NumberFormat('en-US', {
                                  minimumFractionDigits: 2
                                }).format(totals.totalZeroRated)}`
                            }
                          </p>
                          <p className="text-xs text-muted-foreground">Tax: {selectedCurrency === 'USD' 
                            ? new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2
                              }).format(totals.totalZeroRatedTax)
                            : `Z$${new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2
                              }).format(totals.totalZeroRatedTax)}`
                          }</p>
                        </div>

                        {/* Exempt Sales */}
                        <div className="text-center bg-green-50 dark:bg-green-950/20 p-2 rounded">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Exempt Sales</p>
                          <p className="text-sm font-bold text-green-600">
                            {selectedCurrency === 'USD' 
                              ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                  minimumFractionDigits: 2
                                }).format(totals.totalExempt)
                              : `Z$${new Intl.NumberFormat('en-US', {
                                  minimumFractionDigits: 2
                                }).format(totals.totalExempt)}`
                            }
                          </p>
                          <p className="text-xs text-muted-foreground">Tax: {selectedCurrency === 'USD' 
                            ? new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2
                              }).format(totals.totalExemptTax)
                            : `Z$${new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2
                              }).format(totals.totalExemptTax)}`
                          }</p>
                        </div>

                        {/* Standard Rated Sales */}
                        <div className="text-center bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Standard (15%)</p>
                          <p className="text-sm font-bold text-orange-600">
                            {selectedCurrency === 'USD' 
                              ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                  minimumFractionDigits: 2
                                }).format(totals.totalStandardRated)
                              : `Z$${new Intl.NumberFormat('en-US', {
                                  minimumFractionDigits: 2
                                }).format(totals.totalStandardRated)}`
                            }
                          </p>
                          <p className="text-xs text-orange-700 font-semibold">VAT: {selectedCurrency === 'USD' 
                            ? new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                minimumFractionDigits: 2
                              }).format(totals.totalStandardRatedTax)
                            : `Z$${new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2
                              }).format(totals.totalStandardRatedTax)}`
                          }</p>
                        </div>
                      </div>
                    </div>

                    {/* Fiscal Days Table */}
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[150px]">
                              Day Number
                            </TableHead>
                            <TableHead>Device ID</TableHead>
                            <TableHead>Day Opened</TableHead>
                            <TableHead>Day Closed</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fiscalDays.map((fiscalDay) => (
                            <TableRow key={fiscalDay.id}>
                              <TableCell className="font-medium">
                                #{fiscalDay.fiscalDayNo}
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {fiscalDay.deviceId}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center text-sm">
                                  <Clock className="mr-1 h-3 w-3 text-gray-400" />
                                  {formatDateTime(fiscalDay.openedAt)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center text-sm">
                                  <Clock className="mr-1 h-3 w-3 text-gray-400" />
                                  {formatDateTime(fiscalDay.closedAt)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(fiscalDay.status)}
                              </TableCell>
                              <TableCell className="text-right">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleViewPDF(
                                            fiscalDay.deviceId,
                                            fiscalDay.fiscalDayNo,
                                          )
                                        }
                                        disabled={
                                          isDownloading === fiscalDay.fiscalDayNo
                                        }
                                        className="h-8 w-8 p-0"
                                      >
                                        {isDownloading ===
                                        fiscalDay.fiscalDayNo ? (
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <FileText className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View PDF Report</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                      No Fiscal Days Found
                    </h3>
                    <p className="mt-2 text-gray-600 dark:text-gray-400">
                      No fiscal day records found for your registered devices.
                    </p>
                  </div>
                )}
                
                {/* Pagination */}
                {pagination && (
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    totalRecords={pagination.totalRecords}
                    pageSize={pagination.pageSize}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    isLoading={isLoading || isRefetching}
                    pageSizeOptions={[10, 20, 50]}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
