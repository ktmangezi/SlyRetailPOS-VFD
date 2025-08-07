import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme");
    return (stored as Theme) || "system";
  });

  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = window.document.documentElement;
    
    const updateActualTheme = () => {
      let newActualTheme: "light" | "dark";
      
      if (theme === "system") {
        newActualTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else {
        newActualTheme = theme;
      }
      
      setActualTheme(newActualTheme);
      
      // Remove previous theme classes
      root.classList.remove("light", "dark");
      
      // Add current theme class
      root.classList.add(newActualTheme);
    };

    updateActualTheme();

    // Listen for system theme changes when using system theme
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", updateActualTheme);
      
      return () => mediaQuery.removeEventListener("change", updateActualTheme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}