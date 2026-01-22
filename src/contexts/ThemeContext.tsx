"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "forest" | "santa";
type ColorMode = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isHolidaySeason: boolean;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  isDark: boolean; // Computed actual dark state
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
  const [colorMode, setColorMode] = useState<ColorMode>("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  // Compute actual dark state
  const isDark = colorMode === "dark" || (colorMode === "system" && systemPrefersDark);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Set initial value
    setSystemPrefersDark(mediaQuery.matches);

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply theme and dark mode classes to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove("theme-forest", "theme-santa", "dark");

    // Add current theme class
    root.classList.add(`theme-${theme}`);

    // Add dark class if needed
    if (isDark) {
      root.classList.add("dark");
    }

    // Store preferences in localStorage
    localStorage.setItem("skypark-theme", theme);
    localStorage.setItem("skypark-color-mode", colorMode);
  }, [theme, isDark, colorMode]);

  // Check for stored preferences on mount
  useEffect(() => {
    const storedTheme = localStorage.getItem("skypark-theme") as Theme | null;
    const storedColorMode = localStorage.getItem("skypark-color-mode") as ColorMode | null;

    // Restore color mode preference
    if (storedColorMode && ["light", "dark", "system"].includes(storedColorMode)) {
      setColorMode(storedColorMode);
    }

    // Only use stored theme preference if it's a valid override
    if (storedTheme && (storedTheme === "forest" || storedTheme === "santa")) {
      // Uncomment to enable theme override:
      // setTheme(storedTheme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isHolidaySeason, colorMode, setColorMode, isDark }}>
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
