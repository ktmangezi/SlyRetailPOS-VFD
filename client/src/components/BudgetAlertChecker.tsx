import { useEffect, useState, useRef } from 'react';
import { toast } from '@/hooks/use-toast';

interface BudgetAlertSettings {
  enabled: boolean;
  targetPeriod?: string; // Hourly, Daily, Weekly, Monthly
  calculationBasis?: string; // By Tax, By SalesExc, By SalesInc
  targetMin?: number;
  targetMax?: number;
  hourlyTarget?: number; // Legacy field
  dailyTarget?: number; // Legacy field
}

interface Sale {
  id: number;
  receipt: string;
  total: string;
  totalInc: string;
  vatAmount: string;
  timestamp: Date;
  // Other fields omitted for brevity
}

// Define hourly checkpoints (00:00, 01:00, etc.)
const HOURLY_CHECKPOINTS = Array.from({ length: 24 }, (_, i) => 
  `${i.toString().padStart(2, '0')}:00:00`
);

// Function to format time as HH:MM:SS
const formatTimeString = (date: Date): string => {
  return date.toTimeString().split(' ')[0];
};

// Calculate sales total based on calculation basis
const calculateTotal = (sales: Sale[], basis: string): number => {
  return sales.reduce((sum, sale) => {
    switch (basis) {
      case 'By Tax':
        return sum + parseFloat(sale.vatAmount);
      case 'By SalesExc':
        return sum + parseFloat(sale.total);
      case 'By SalesInc':
        return sum + parseFloat(sale.totalInc);
      default:
        return sum + parseFloat(sale.total);
    }
  }, 0);
};

// Check if a time is within the last hour
const isWithinLastHour = (timestamp: Date, currentTime: Date): boolean => {
  const oneHourAgo = new Date(currentTime);
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  return timestamp >= oneHourAgo && timestamp <= currentTime;
};

interface BudgetAlertCheckerProps {
  budgetAlerts: BudgetAlertSettings | undefined;
  sales: Sale[];
  enabled: boolean;
  // emailAddress removed as per client request
}

export function BudgetAlertChecker({ 
  budgetAlerts, 
  sales, 
  enabled
}: BudgetAlertCheckerProps) {
  const [lastProcessedHour, setLastProcessedHour] = useState<string | null>(null);
  const [isClientSideProcessing, setIsClientSideProcessing] = useState(true);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Store last check time in localStorage
  const storeLastCheckTime = (time: string) => {
    localStorage.setItem('lastBudgetAlertCheck', time);
  };
  
  // Get last check time from localStorage
  const getLastCheckTime = (): string | null => {
    return localStorage.getItem('lastBudgetAlertCheck');
  };

  // Email notification functionality removed
  const sendNotification = async (alertType: string, details: string) => {
    // Log alert info to console only
    console.log(`BUDGET ALERT - Alert triggered at ${new Date().toISOString()}: ${alertType} - ${details}`);
    return true;
  };

  // Process hourly alerts
  const processHourlyAlert = (now: Date) => {
    if (!budgetAlerts?.enabled || !enabled) return;
    
    const currentTimeString = formatTimeString(now);
    const currentHour = currentTimeString.slice(0, 2);
    const currentHourCheckpoint = `${currentHour}:00:00`;
    
    // Don't process if we've already processed this hour
    if (lastProcessedHour === currentHourCheckpoint) return;
    
    // Check if we've just crossed an hourly checkpoint
    const timeComponents = currentTimeString.split(':');
    const minutes = parseInt(timeComponents[1], 10);
    const seconds = parseInt(timeComponents[2], 10);
    
    // Only trigger at the start of the hour (within first 5 minutes)
    if (minutes > 5) return;
    
    // Get sales from the last hour
    const hourlyFilteredSales = sales.filter(sale => 
      isWithinLastHour(new Date(sale.timestamp), now)
    );
    
    if (hourlyFilteredSales.length === 0) return;
    
    // Calculate the total based on calculation basis
    const calculationBasis = budgetAlerts.calculationBasis || 'By Tax';
    const totalAmount = calculateTotal(hourlyFilteredSales, calculationBasis);
    
    // Check if total is outside the min/max range
    const minTarget = budgetAlerts.targetMin !== undefined ? budgetAlerts.targetMin : 
                     (budgetAlerts.hourlyTarget !== undefined ? budgetAlerts.hourlyTarget * 0.8 : 0.01);
    const maxTarget = budgetAlerts.targetMax !== undefined ? budgetAlerts.targetMax : 
                     (budgetAlerts.hourlyTarget !== undefined ? budgetAlerts.hourlyTarget * 1.2 : 100);
    
    let alertMessage = '';
    
    if (totalAmount < minTarget) {
      alertMessage = `Hourly sales ${calculationBasis} (${totalAmount.toFixed(2)}) below minimum target of ${minTarget.toFixed(2)}`;
    } else if (totalAmount > maxTarget) {
      alertMessage = `Hourly sales ${calculationBasis} (${totalAmount.toFixed(2)}) above maximum target of ${maxTarget.toFixed(2)}`;
    }
    
    if (alertMessage) {
      // Show toast notification
      toast({
        title: 'Budget Alert',
        description: alertMessage
      });
      
      // Log alert to console
      sendNotification('Hourly Budget Alert', alertMessage);
    }
    
    // Mark this hour as processed
    setLastProcessedHour(currentHourCheckpoint);
    storeLastCheckTime(currentTimeString);
  };

  // Main check function that runs periodically
  const checkTimeTriggers = () => {
    const now = new Date();
    
    // Check for hourly alerts if period is Hourly or not specified
    if (!budgetAlerts?.targetPeriod || budgetAlerts.targetPeriod === 'Hourly') {
      processHourlyAlert(now);
    }
    
    // Daily, Weekly, and Monthly processing would be added here
    // (These are less time-sensitive and can be handled by the server)
  };

  // Setup timer and visibility change listener
  useEffect(() => {
    // Initialize from localStorage
    const lastCheck = getLastCheckTime();
    if (lastCheck) {
      const lastCheckHour = lastCheck.slice(0, 2) + ':00:00';
      setLastProcessedHour(lastCheckHour);
    }
    
    // Check immediately on mount
    checkTimeTriggers();
    
    // Set up interval check every minute
    checkIntervalRef.current = setInterval(checkTimeTriggers, 60000);
    
    // Handle visibility change to ensure checks run when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTimeTriggers();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Cleanup
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [budgetAlerts, sales, enabled]);

  // Don't render anything - this is a background component
  return null;
}