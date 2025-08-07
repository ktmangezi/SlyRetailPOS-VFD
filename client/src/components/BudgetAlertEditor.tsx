import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Time rule interfaces
interface HourlyTimeRule {
  frequency: string; // 'every' for every hour on the hour
}

interface DailyTimeRule {
  time: string;
}

interface WeeklyTimeRule {
  day: string;
  time: string;
}

interface MonthlyTimeRule {
  day: string; // 'last' or a specific day number
  time: string;
}

interface TimeRules {
  hourly: HourlyTimeRule;
  daily: DailyTimeRule;
  weekly: WeeklyTimeRule;
  monthly: MonthlyTimeRule;
}

// Budget alert settings interface
interface BudgetAlertSettings {
  enabled: boolean;
  targetPeriod: string;
  calculationBasis: string;
  targetMin: number;
  targetMax: number;
  timeRules: TimeRules;
}

// Props interface
interface BudgetAlertEditorProps {
  settings: BudgetAlertSettings;
  onSettingsChange: (settings: BudgetAlertSettings) => void;
}

export function BudgetAlertEditor({ settings, onSettingsChange }: BudgetAlertEditorProps) {
  // Function to handle changes to settings
  const updateSettings = (updates: Partial<BudgetAlertSettings>) => {
    onSettingsChange({
      ...settings,
      ...updates
    });
  };
  
  // Function to update specific time rules
  const updateTimeRule = (ruleType: 'hourly' | 'daily' | 'weekly' | 'monthly', key: string, value: string) => {
    const updatedTimeRules = {
      ...settings.timeRules,
      [ruleType]: {
        ...settings.timeRules[ruleType],
        [key]: value
      }
    };
    
    updateSettings({ timeRules: updatedTimeRules });
  };

  return (
    <div className="rounded-lg p-5 space-y-4 bg-blue-50">
      <h3 className="text-lg font-medium">Sales Targets</h3>
      <p className="text-sm text-gray-600">Configure sales targets for performance notifications</p>
      
      {/* First row: Period dropdown and Sales Target label */}
      <div className="flex items-center gap-4 mt-4">
        <div className="w-36">
          <Select
            value={settings.targetPeriod}
            onValueChange={(value) => updateSettings({ targetPeriod: value })}
          >
            <SelectTrigger className="w-full bg-white rounded-full h-10">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Hourly">Hourly</SelectItem>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="font-medium text-lg">Sales Target</span>
      </div>
      
      {/* Second row: Calculation dropdown, Min and Max inputs in one horizontal row */}
      <div className="flex items-center gap-4 mt-4">
        {/* Calculation basis dropdown on the left */}
        <div>
          <Label htmlFor="calculation" className="block pb-2 text-base font-medium">
            Calculation
          </Label>
          <Select
            value={settings.calculationBasis}
            onValueChange={(value) => updateSettings({ calculationBasis: value })}
          >
            <SelectTrigger id="calculation" className="w-36 bg-white rounded-full h-10">
              <SelectValue placeholder="By Tax" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="By Tax">By Tax</SelectItem>
              <SelectItem value="By SalesExc">By Sales Excluding Tax</SelectItem>
              <SelectItem value="By SalesInc">By Sales Including Tax</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Min input */}
        <div>
          <Label htmlFor="target-min" className="block pb-2 text-base font-medium">
            Min
          </Label>
          <Input
            id="target-min"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.01"
            value={settings.targetMin}
            onChange={(e) => updateSettings({ targetMin: parseFloat(e.target.value) || 0.01 })}
            className="bg-white rounded-full h-10 w-24"
          />
        </div>
        
        {/* Max input */}
        <div>
          <Label htmlFor="target-max" className="block pb-2 text-base font-medium">
            Max
          </Label>
          <Input
            id="target-max"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.5"
            value={settings.targetMax}
            onChange={(e) => updateSettings({ targetMax: parseFloat(e.target.value) || 0.5 })}
            className="bg-white rounded-full h-10 w-24"
          />
        </div>
      </div>
      
      {/* Notification Time Settings Section */}
      <div className="mt-6 border-t pt-4">
        <h3 className="text-lg font-medium mb-2">Notification Schedule</h3>
        <p className="text-sm text-gray-600 mb-4">Set when notifications will be sent</p>
        
        {/* Hourly notification setting */}
        <div className="mb-4">
          <Label htmlFor="hourly-frequency" className="block pb-2 font-medium">
            Hourly frequency
          </Label>
          <Select
            value={settings.timeRules.hourly.frequency}
            onValueChange={(value) => updateTimeRule('hourly', 'frequency', value)}
          >
            <SelectTrigger id="hourly-frequency" className="bg-white rounded-lg h-10 w-48">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="every">Every hour (on the hour)</SelectItem>
              <SelectItem value="half">Every half hour</SelectItem>
              <SelectItem value="quarter">Every quarter hour</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">Notifications will be sent at the start of each hour</p>
        </div>
        
        {/* Daily notification time */}
        <div className="mb-4">
          <Label htmlFor="daily-time" className="block pb-2 font-medium">
            Daily at
          </Label>
          <Input
            id="daily-time"
            type="time"
            value={settings.timeRules.daily.time}
            onChange={(e) => updateTimeRule('daily', 'time', e.target.value)}
            className="bg-white rounded-lg h-10 w-32"
          />
        </div>
        
        {/* Weekly notification setting */}
        <div className="flex gap-4 mb-4">
          <div>
            <Label htmlFor="weekly-day" className="block pb-2 font-medium">
              Weekly on
            </Label>
            <Select
              value={settings.timeRules.weekly.day}
              onValueChange={(value) => updateTimeRule('weekly', 'day', value)}
            >
              <SelectTrigger id="weekly-day" className="bg-white rounded-lg h-10 w-32">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Sunday">Sunday</SelectItem>
                <SelectItem value="Monday">Monday</SelectItem>
                <SelectItem value="Tuesday">Tuesday</SelectItem>
                <SelectItem value="Wednesday">Wednesday</SelectItem>
                <SelectItem value="Thursday">Thursday</SelectItem>
                <SelectItem value="Friday">Friday</SelectItem>
                <SelectItem value="Saturday">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="weekly-time" className="block pb-2 font-medium">
              at
            </Label>
            <Input
              id="weekly-time"
              type="time"
              value={settings.timeRules.weekly.time}
              onChange={(e) => updateTimeRule('weekly', 'time', e.target.value)}
              className="bg-white rounded-lg h-10 w-32"
            />
          </div>
        </div>
        
        {/* Monthly notification setting */}
        <div className="flex gap-4">
          <div>
            <Label htmlFor="monthly-day" className="block pb-2 font-medium">
              Monthly on
            </Label>
            <Select
              value={settings.timeRules.monthly.day}
              onValueChange={(value) => updateTimeRule('monthly', 'day', value)}
            >
              <SelectTrigger id="monthly-day" className="bg-white rounded-lg h-10 w-32">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last">Last day</SelectItem>
                <SelectItem value="1">1st</SelectItem>
                <SelectItem value="15">15th</SelectItem>
                <SelectItem value="28">28th</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="monthly-time" className="block pb-2 font-medium">
              at
            </Label>
            <Input
              id="monthly-time"
              type="time"
              value={settings.timeRules.monthly.time}
              onChange={(e) => updateTimeRule('monthly', 'time', e.target.value)}
              className="bg-white rounded-lg h-10 w-32"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Demo component to show how to use BudgetAlertEditor
export function BudgetAlertEditorDemo() {
  const [settings, setSettings] = useState<BudgetAlertSettings>({
    enabled: true,
    targetPeriod: "Hourly",
    calculationBasis: "By Tax",
    targetMin: 0.01,
    targetMax: 0.5,
    timeRules: {
      hourly: { frequency: "every" },
      daily: { time: "20:00" },
      weekly: { day: "Sunday", time: "20:00" },
      monthly: { day: "last", time: "20:00" }
    }
  });

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-lg font-bold mb-4">Budget Alert Settings</h2>
      <BudgetAlertEditor
        settings={settings}
        onSettingsChange={setSettings}
      />
      <div className="mt-4 p-3 bg-gray-100 rounded">
        <h3 className="text-sm font-medium mb-2">Current Settings:</h3>
        <pre className="text-xs overflow-auto">{JSON.stringify(settings, null, 2)}</pre>
      </div>
    </div>
  );
}