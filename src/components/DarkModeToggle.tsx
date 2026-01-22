"use client";

import { useTheme } from "@/contexts/ThemeContext";

export default function DarkModeToggle() {
  const { colorMode, setColorMode, isDark } = useTheme();

  const cycleMode = () => {
    // Cycle through: system -> light -> dark -> system
    if (colorMode === "system") {
      setColorMode("light");
    } else if (colorMode === "light") {
      setColorMode("dark");
    } else {
      setColorMode("system");
    }
  };

  return (
    <button
      onClick={cycleMode}
      className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      title={`Color mode: ${colorMode}${colorMode === "system" ? ` (${isDark ? "dark" : "light"})` : ""}`}
    >
      {colorMode === "system" ? (
        // Computer/system icon
        <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ) : colorMode === "light" ? (
        // Sun icon
        <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        // Moon icon
        <svg className="w-5 h-5 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
