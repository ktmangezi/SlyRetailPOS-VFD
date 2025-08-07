import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  onSearch: (query: string) => void;
  className?: string;
}

export function SearchBox({ onSearch, className }: SearchBoxProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  
  // Check if device is mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSearch = () => {
    if (!isExpanded && !isMobile) {
      setIsExpanded(true);
      return;
    }
    onSearch(searchQuery);
  };

  const handleBlur = () => {
    if (!searchQuery && !isMobile) {
      setIsExpanded(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // For mobile, always show the input field
  // For desktop, show the animated expansion
  return (
    <div className={cn("flex items-center", className)}>
      {isMobile ? (
        // Always visible search input for mobile
        <div className="flex w-full">
          <Input
            type="text"
            placeholder="Search receipts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="h-9 rounded-r-none border-r-0"
          />
          <Button
            variant="outline"
            onClick={() => onSearch(searchQuery)}
            className="h-9 px-3 rounded-l-none border-l-0 bg-white"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        // Animated search for desktop
        <>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 220, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="mr-2"
              >
                <Input
                  type="text"
                  placeholder="Search receipts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={handleBlur}
                  onKeyPress={handleKeyPress}
                  className="h-9"
                  autoFocus
                />
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSearch}
            className="h-9 w-9 p-0 hover:bg-transparent hover:text-primary flex-shrink-0"
          >
            <Search className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}