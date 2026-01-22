"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "forest" | "santa";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isHolidaySeason: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * Determines if we're in the holiday season (Nov 1 - Jan 7)
 */
function checkHolidaySeason(): boolean {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0 = January)
  const day = now.getDate();

  // November (10) or December (11)
  if (month === 10 || month === 11) {
    return true;
  }

  // January 1-7
  if (month === 0 && day <= 7) {
    return true;
  }

  return false;
}

/**
 * Get the appropriate theme based on current date
 */
function getSeasonalTheme(): Theme {
  return checkHolidaySeason() ? "santa" : "forest";
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const isHolidaySeason = checkHolidaySeason();
  const [theme, setTheme] = useState<Theme>(getSeasonalTheme());

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove("theme-forest", "theme-santa");

    // Add current theme class
    root.classList.add(`theme-${theme}`);

    // Store preference in localStorage (optional override)
    localStorage.setItem("skypark-theme", theme);
  }, [theme]);

  // Check for stored preference on mount
  useEffect(() => {
    const stored = localStorage.getItem("skypark-theme") as Theme | null;

    // Only use stored preference if it's a valid override
    // (e.g., user manually switched during off-season testing)
    if (stored && (stored === "forest" || stored === "santa")) {
      // For production, you might want to ignore stored preference
      // and always use seasonal theme. Uncomment below to enable override:
      // setTheme(stored);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isHolidaySeason }}>
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
