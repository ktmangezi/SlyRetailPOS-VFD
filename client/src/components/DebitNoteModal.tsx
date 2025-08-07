import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileX, CreditCard, ChevronRight, ChevronLeft, Plus, Minus, Package, Building, ListChecks, Loader2, X, Search, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Sale } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

// Type for Loyverse item
interface LoyverseItem {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  hsCode?: string;
  price: number;
  image_url?: string;
  category_id?: string;
}

// Type for a debit note item with quantity
interface DebitNoteItem {
  itemId: string;
  name: string;
  quantity: number;
  price: number;
  hsCode?: string;
  sku?: string;
}

interface DebitNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: DebitNoteFormData) => void;
  apiToken: string;
}

export interface DebitNoteFormData {
  supplierName: string;
  supplierVAT: string;
  supplierTIN: string;
  reason: string;
  items: DebitNoteItem[];
}

// Steps in the debit note creation process
type Step = "supplier" | "items" | "review";

export function DebitNoteModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  apiToken 
}: DebitNoteModalProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<Step>("supplier");
  const [items, setItems] = useState<LoyverseItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState<DebitNoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const [formData, setFormData] = useState<DebitNoteFormData>({
    supplierName: "",
    supplierVAT: "",
    supplierTIN: "",
    reason: "",
    items: [],
  });

  // Fetch Loyverse items when user moves to the items step or opens the search dropdown
  useEffect(() => {
    if ((currentStep === "items" || isSearchOpen) && items.length === 0 && !isLoadingItems) {
      fetchLoyverseItems();
    }
  }, [currentStep, isSearchOpen]);

  // Function to fetch items from Loyverse API
  const fetchLoyverseItems = async () => {
    if (!apiToken) {
      toast({
        title: "Error",
        description: "API token is required to fetch items",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoadingItems(true);
      // Use the server-side proxy to fetch items from Loyverse
      const response = await fetch("/api/loyverse/items", {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.items) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error("Error fetching Loyverse items:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch items from Loyverse",
        variant: "destructive",
      });
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handle item selection
  const toggleItemSelection = (item: LoyverseItem) => {
    const index = selectedItems.findIndex(i => i.itemId === item.id);
    
    if (index >= 0) {
      // Item is already selected, remove it
      setSelectedItems(selectedItems.filter(i => i.itemId !== item.id));
    } else {
      // Item is not selected, add it with quantity 1
      // Make sure price is a number
      const price = typeof item.price === 'number' ? item.price : 0;
      
      setSelectedItems([
        ...selectedItems,
        {
          itemId: item.id,
          name: item.name,
          quantity: 1,
          price: price,
          hsCode: item.hsCode,
          sku: item.sku
        }
      ]);
    }
  };

  // Handle quantity change for selected items
  const updateItemQuantity = (itemId: string, quantity: number) => {
    if (quantity < 1) return; // Don't allow quantities less than 1
    
    setSelectedItems(
      selectedItems.map(item => 
        item.itemId === itemId 
          ? { ...item, quantity } 
          : item
      )
    );
  };

  // Move to next step in the process
  const nextStep = () => {
    if (currentStep === "supplier") {
      // Validate supplier form
      if (!formData.supplierName) {
        toast({
          title: "Error",
          description: "Supplier name is required",
          variant: "destructive",
        });
        return;
      }
      if (!formData.reason) {
        toast({
          title: "Error",
          description: "Reason for debit note is required",
          variant: "destructive",
        });
        return;
      }
      setCurrentStep("items");
    } else if (currentStep === "items") {
      // Validate items selection
      if (selectedItems.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one item",
          variant: "destructive",
        });
        return;
      }
      // Update form data with selected items
      setFormData({
        ...formData,
        items: [...selectedItems],
      });
      setCurrentStep("review");
    }
  };

  // Go back to previous step
  const prevStep = () => {
    if (currentStep === "items") {
      setCurrentStep("supplier");
    } else if (currentStep === "review") {
      setCurrentStep("items");
    }
  };

  // Final submission
  const handleSubmit = () => {
    // Submit the form data with all selected items
    onSubmit({
      ...formData,
      items: selectedItems,
    });
    
    // Reset form and close modal
    setFormData({
      supplierName: "",
      supplierVAT: "",
      supplierTIN: "",
      reason: "",
      items: [],
    });
    setSelectedItems([]);
    setCurrentStep("supplier");
  };

  // Calculate total amount of the debit note
  const calculateTotal = () => {
    return selectedItems.reduce((total, item) => {
      const price = typeof item.price === 'number' ? item.price : 0;
      return total + (price * item.quantity);
    }, 0);
  };

  // Reset when modal closes
  const handleClose = () => {
    setFormData({
      supplierName: "",
      supplierVAT: "",
      supplierTIN: "",
      reason: "",
      items: [],
    });
    setSelectedItems([]);
    setCurrentStep("supplier");
    onClose();
  };

  // Function to handle search submission
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoadingItems(true);
    setIsSearchOpen(true);
    
    try {
      // Use the server-side proxy to fetch items from Loyverse with the search query
      const response = await fetch(`/api/loyverse/items?query=${encodeURIComponent(searchQuery)}`, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.items) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error("Error searching Loyverse items:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to search items from Loyverse",
        variant: "destructive",
      });
    } finally {
      setIsLoadingItems(false);
    }
  };
  
  // Handle Enter key press in search input
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
    >
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[65vw] xl:max-w-[60vw] 2xl:max-w-[55vw]">
        <DialogHeader className="space-y-2">
          <div className="mx-auto bg-muted p-2 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
            <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg sm:text-xl">Create Debit Note</DialogTitle>
          <DialogDescription className="text-center text-sm">
            {currentStep === "supplier" && "Enter supplier details and reason for the debit note."}
            {currentStep === "items" && "Select items to include in the debit note."}
            {currentStep === "review" && "Review your debit note before submission."}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex justify-center mb-4 sm:mb-6">
          <div className="flex items-center space-x-4 sm:space-x-6">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1 ${currentStep === "supplier" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-600"}`}>
                <Building className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            
            <div className="w-8 sm:w-12 h-1 bg-gray-200 self-start mt-4 sm:mt-5">
              {(currentStep === "items" || currentStep === "review") && <div className="h-full bg-blue-600"></div>}
            </div>
            
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1 ${currentStep === "items" ? "bg-blue-600 text-white" : currentStep === "review" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
                <Package className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            
            <div className="w-8 sm:w-12 h-1 bg-gray-200 self-start mt-4 sm:mt-5">
              {currentStep === "review" && <div className="h-full bg-blue-600"></div>}
            </div>
            
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mb-1 ${currentStep === "review" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                <ListChecks className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Details Form */}
        {currentStep === "supplier" && (
          <div className="py-2 sm:py-4 mx-auto w-full max-w-[90%] lg:max-w-[80%] xl:max-w-[70%]">
            <div className="mb-4">
              <Label htmlFor="supplierName" className="block text-sm font-medium mb-1">
                Supplier Name
              </Label>
              <Input
                id="supplierName"
                name="supplierName"
                value={formData.supplierName}
                onChange={handleInputChange}
                className="w-full text-sm"
                placeholder="Enter supplier name"
                required
              />
            </div>
            
            <div className="mb-4">
              <Label htmlFor="supplierVAT" className="block text-sm font-medium mb-1">
                Supplier VAT
              </Label>
              <Input
                id="supplierVAT"
                name="supplierVAT"
                value={formData.supplierVAT}
                onChange={handleInputChange}
                className="w-full text-sm"
                placeholder="Enter supplier VAT number"
              />
            </div>
            
            <div className="mb-4">
              <Label htmlFor="supplierTIN" className="block text-sm font-medium mb-1">
                Supplier TIN
              </Label>
              <Input
                id="supplierTIN"
                name="supplierTIN"
                value={formData.supplierTIN}
                onChange={handleInputChange}
                className="w-full text-sm"
                placeholder="Enter supplier TIN number"
              />
            </div>
            
            <div className="mb-4">
              <Label htmlFor="reason" className="block text-sm font-medium mb-1">
                Reason
              </Label>
              <Textarea
                id="reason"
                name="reason"
                value={formData.reason}
                onChange={handleInputChange}
                className="w-full text-sm min-h-[80px]"
                placeholder="Enter reason for debit note"
                required
              />
            </div>

            <DialogFooter className="mt-2 sm:mt-4 flex-col xs:flex-row gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                className="w-full xs:w-auto text-sm"
                size="sm"
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={nextStep}
                className="w-full xs:w-auto text-sm"
                size="sm"
              >
                Next
                <ChevronRight className="ml-1 h-3 w-3 sm:ml-2 sm:h-4 sm:w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Item Selection */}
        {currentStep === "items" && (
          <div className="py-2 sm:py-4">
            {isLoadingItems ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-10">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-primary mb-2 sm:mb-4" />
                <p className="text-xs sm:text-sm text-gray-500">Loading items from Loyverse...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-10">
                <p className="text-xs sm:text-sm text-gray-500">No items found. Please check your Loyverse account.</p>
              </div>
            ) : (
              <>
                {/* Search field at the top */}
                <div className="mb-3 sm:mb-5">
                  <Label className="text-sm sm:text-base font-medium mb-1 block">Search and Add Items</Label>
                  <div className="relative">
                    <Input
                      placeholder="Search for items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pr-10"
                      onKeyPress={handleKeyPress}
                    />
                    <button 
                      className="absolute inset-y-0 right-2 flex items-center cursor-pointer"
                      onClick={handleSearch}
                      type="button"
                    >
                      <Search className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                  
                  {/* Search results dropdown */}
                  {isSearchOpen && searchQuery.length > 0 && (
                    <div className="mt-1 w-full border border-gray-200 rounded-md bg-white shadow-md max-h-60 overflow-y-auto z-50 relative">
                      {isLoadingItems ? (
                        <div className="py-6 text-center">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Loading items...</p>
                        </div>
                      ) : items.length === 0 ? (
                        <div className="py-6 text-center">
                          <p className="text-sm text-gray-500">No items found</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                              onClick={() => {
                                toggleItemSelection(item);
                                setSearchQuery("");
                                setIsSearchOpen(false);
                              }}
                            >
                              <div className="flex-shrink-0 w-5">
                                {selectedItems.some(i => i.itemId === item.id) && (
                                  <Check className="h-4 w-4" />
                                )}
                              </div>
                              <div className="grid grid-cols-12 flex-1 items-center gap-2">
                                <div className="col-span-2 text-xs text-gray-500">
                                  {item.hsCode || '-'}
                                </div>
                                <div className="col-span-2 text-xs text-gray-500">
                                  {item.sku || '-'}
                                </div>
                                <div className="col-span-5 text-sm font-medium">
                                  {item.name || "Unnamed Item"}
                                </div>
                                <div className="col-span-3 text-xs text-right">
                                  ${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Selected Items Section */}
                <div className="mb-3 sm:mb-5">
                  <Label className="text-sm sm:text-base font-medium mb-1 inline-block">Selected Items ({selectedItems.length})</Label>
                  {selectedItems.length > 0 ? (
                    <ScrollArea className="h-32 sm:h-36 border rounded-md mt-1">
                      {/* Table header */}
                      <div className="bg-gray-50 p-2 md:p-3 border-b text-xs md:text-sm font-medium sticky top-0">
                        <div className="grid grid-cols-12 items-center">
                          <div className="col-span-2">HS Code</div>
                          <div className="col-span-2">SKU</div>
                          <div className="col-span-3">Item Name</div>
                          <div className="col-span-2 text-right">Price</div>
                          <div className="col-span-3 text-right">Quantity</div>
                        </div>
                      </div>
                      <div className="p-1 sm:p-2">
                        {selectedItems.map((item) => (
                          <div key={item.itemId} className="grid grid-cols-12 items-center p-2 sm:p-3 mb-2 border rounded-md">
                            <div className="col-span-2 text-xs md:text-sm text-gray-500">
                              {item.hsCode || '-'}
                            </div>
                            <div className="col-span-2 text-xs md:text-sm text-gray-500">
                              {item.sku || '-'}
                            </div>
                            <div className="col-span-3 text-xs md:text-sm font-medium">
                              {item.name}
                            </div>
                            <div className="col-span-2 text-xs md:text-sm text-right">
                              ${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}
                            </div>
                            <div className="col-span-3 flex items-center justify-end space-x-1 sm:space-x-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                                onClick={() => updateItemQuantity(item.itemId, item.quantity - 1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-5 sm:w-6 text-center text-sm font-medium">{item.quantity}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                                onClick={() => updateItemQuantity(item.itemId, item.quantity + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                                onClick={() => setSelectedItems(selectedItems.filter(i => i.itemId !== item.itemId))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-20 sm:h-24 border rounded-md p-3 flex items-center justify-center bg-gray-50">
                      <p className="text-sm text-gray-500">No items selected yet</p>
                    </div>
                  )}
                </div>
                
                {/* Click outside handler to close dropdown */}
                {isSearchOpen && searchQuery.length > 0 && (
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setIsSearchOpen(false)}
                    style={{ background: 'transparent' }}
                  />
                )}
              </>
            )}

            <DialogFooter className="mt-4 sm:mt-6 flex-col xs:flex-row gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={prevStep}
                className="w-full xs:w-auto text-sm sm:text-base px-4 py-2"
              >
                <ChevronLeft className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
                Back
              </Button>
              <Button 
                type="button" 
                onClick={nextStep}
                disabled={selectedItems.length === 0 || isLoadingItems}
                className="w-full xs:w-auto text-sm sm:text-base px-4 py-2"
              >
                Review
                <ChevronRight className="ml-1 h-3 w-3 sm:ml-2 sm:h-4 sm:w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Review and Submit */}
        {currentStep === "review" && (
          <div className="py-2 sm:py-4">
            <Card>
              <CardContent className="p-2 sm:p-4">
                <h3 className="font-semibold text-base sm:text-lg mb-2 sm:mb-4">Debit Note Summary</h3>
                
                <div className="grid grid-cols-1 xs:grid-cols-3 gap-1 sm:gap-2 mb-2 sm:mb-4">
                  <div className="mb-1 xs:mb-0">
                    <p className="text-xs sm:text-sm text-gray-500">Supplier</p>
                    <p className="font-medium text-xs sm:text-sm">{formData.supplierName}</p>
                  </div>
                  <div className="mb-1 xs:mb-0">
                    <p className="text-xs sm:text-sm text-gray-500">VAT Number</p>
                    <p className="font-medium text-xs sm:text-sm">{formData.supplierVAT || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">TIN Number</p>
                    <p className="font-medium text-xs sm:text-sm">{formData.supplierTIN || "N/A"}</p>
                  </div>
                </div>
                
                <div className="mb-2 sm:mb-4">
                  <p className="text-xs sm:text-sm text-gray-500">Reason</p>
                  <p className="text-xs sm:text-sm">{formData.reason}</p>
                </div>
                
                <div>
                  <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Items ({selectedItems.length})</p>
                  <div className="border rounded-md text-xs sm:text-sm">
                    <div className="grid grid-cols-12 bg-gray-50 p-1 sm:p-2 border-b text-xs font-medium">
                      <div className="col-span-6">Item</div>
                      <div className="col-span-2 text-right">Price</div>
                      <div className="col-span-2 text-right">Qty</div>
                      <div className="col-span-2 text-right">Total</div>
                    </div>
                    <ScrollArea className="max-h-32 sm:max-h-40">
                      {selectedItems.map((item) => (
                        <div key={item.itemId} className="grid grid-cols-12 p-1 sm:p-2 border-b text-xs sm:text-sm">
                          <div className="col-span-6 truncate">{item.name}</div>
                          <div className="col-span-2 text-right">${typeof item.price === 'number' ? item.price.toFixed(2) : '0.00'}</div>
                          <div className="col-span-2 text-right">{item.quantity}</div>
                          <div className="col-span-2 text-right">${typeof item.price === 'number' ? (item.price * item.quantity).toFixed(2) : '0.00'}</div>
                        </div>
                      ))}
                    </ScrollArea>
                    <div className="grid grid-cols-12 p-1 sm:p-2 font-medium text-xs sm:text-sm">
                      <div className="col-span-10 text-right">Total:</div>
                      <div className="col-span-2 text-right">${calculateTotal().toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <DialogFooter className="mt-4 sm:mt-6 flex-col xs:flex-row gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={prevStep}
                className="w-full xs:w-auto text-sm sm:text-base px-4 py-2"
              >
                <ChevronLeft className="mr-1 h-3 w-3 sm:mr-2 sm:h-4 sm:w-4" />
                Back
              </Button>
              <Button 
                type="button"
                onClick={handleSubmit}
                className="w-full xs:w-auto text-sm sm:text-base px-4 py-2"
              >
                Create Debit Note
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}