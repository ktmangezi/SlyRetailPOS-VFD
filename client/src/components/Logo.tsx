import { SiCashapp } from "react-icons/si";

export function Logo() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 mb-4">
      <div className="relative">
        <img 
          src="/attached_assets/IMG-20250224-WA0000.jpg"
          alt="SlyRetail POS"
          className="h-12 dark:opacity-90 dark:brightness-90 dark:contrast-110"
        />
        {/* Dark mode overlay to blend with background */}
        <div className="absolute inset-0 bg-gray-800/20 dark:bg-gray-200/10 rounded-sm opacity-0 dark:opacity-100 transition-opacity"></div>
      </div>
      <h1 className="text-2xl sm:text-4xl font-bold text-center bg-gradient-to-r from-blue-600 to-teal-600 dark:from-blue-400 dark:to-teal-400 bg-clip-text text-transparent">
        Virtual Fiscal Device
      </h1>
    </div>
  );
}