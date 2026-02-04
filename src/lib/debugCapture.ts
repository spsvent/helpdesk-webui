"use client";

interface ConsoleError {
  timestamp: string;
  type: "error" | "warn" | "unhandled-rejection" | "network";
  message: string;
  stack?: string;
  url?: string;
}

interface UserAction {
  timestamp: string;
  action: string;
  details?: string;
}

interface DebugBundle {
  capturedAt: string;
  pageUrl: string;
  userAgent: string;
  screenSize: string;
  ticketContext?: string;
  errors: ConsoleError[];
  recentActions: UserAction[];
  sessionDuration: string;
}

class DebugCaptureService {
  private errors: ConsoleError[] = [];
  private actions: UserAction[] = [];
  private sessionStart: Date;
  private maxErrors = 50;
  private maxActions = 30;
  private initialized = false;
  private originalConsoleError: typeof console.error | null = null;
  private originalConsoleWarn: typeof console.warn | null = null;

  constructor() {
    this.sessionStart = new Date();
  }

  initialize() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    // Intercept console.error
    this.originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      this.captureError("error", args);
      this.originalConsoleError?.apply(console, args);
    };

    // Intercept console.warn
    this.originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      this.captureError("warn", args);
      this.originalConsoleWarn?.apply(console, args);
    };

    // Capture unhandled errors
    window.onerror = (message, source, lineno, colno, error) => {
      this.errors.push({
        timestamp: new Date().toISOString(),
        type: "error",
        message: String(message),
        stack: error?.stack,
        url: source ? `${source}:${lineno}:${colno}` : undefined,
      });
      this.trimErrors();
      return false; // Don't prevent default handling
    };

    // Capture unhandled promise rejections
    window.onunhandledrejection = (event) => {
      const reason = event.reason;
      this.errors.push({
        timestamp: new Date().toISOString(),
        type: "unhandled-rejection",
        message: reason?.message || String(reason),
        stack: reason?.stack,
      });
      this.trimErrors();
    };

    // Intercept fetch for network errors
    const originalFetch = window.fetch;
    const getUrlFromInput = (input: RequestInfo | URL): string => {
      if (typeof input === "string") return input;
      if (input instanceof URL) return input.href;
      if (input instanceof Request) return input.url;
      return "unknown";
    };
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch.apply(window, args);
        if (!response.ok && response.status >= 400) {
          const url = getUrlFromInput(args[0]);
          this.errors.push({
            timestamp: new Date().toISOString(),
            type: "network",
            message: `HTTP ${response.status}: ${response.statusText}`,
            url: url.substring(0, 200), // Truncate long URLs
          });
          this.trimErrors();
        }
        return response;
      } catch (error) {
        const url = getUrlFromInput(args[0]);
        this.errors.push({
          timestamp: new Date().toISOString(),
          type: "network",
          message: error instanceof Error ? error.message : String(error),
          url: url.substring(0, 200),
        });
        this.trimErrors();
        throw error;
      }
    };

    // Track navigation
    if (typeof window !== "undefined") {
      const trackNavigation = () => {
        this.logAction("Navigation", window.location.pathname);
      };
      window.addEventListener("popstate", trackNavigation);

      // Track initial page
      this.logAction("Session started", window.location.pathname);
    }
  }

  private captureError(type: "error" | "warn", args: unknown[]) {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) {
          return `${arg.message}\n${arg.stack || ""}`;
        }
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    // Skip React hydration warnings and other noise
    if (
      message.includes("Hydration") ||
      message.includes("Warning: ") ||
      message.includes("DevTools")
    ) {
      return;
    }

    this.errors.push({
      timestamp: new Date().toISOString(),
      type,
      message: message.substring(0, 2000), // Truncate very long messages
    });
    this.trimErrors();
  }

  private trimErrors() {
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  private trimActions() {
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(-this.maxActions);
    }
  }

  logAction(action: string, details?: string) {
    this.actions.push({
      timestamp: new Date().toISOString(),
      action,
      details,
    });
    this.trimActions();
  }

  getErrorCount(): number {
    return this.errors.filter((e) => e.type === "error" || e.type === "unhandled-rejection").length;
  }

  getDebugBundle(ticketContext?: string): DebugBundle {
    const now = new Date();
    const durationMs = now.getTime() - this.sessionStart.getTime();
    const durationMins = Math.floor(durationMs / 60000);
    const durationSecs = Math.floor((durationMs % 60000) / 1000);

    return {
      capturedAt: now.toISOString(),
      pageUrl: typeof window !== "undefined" ? window.location.href : "unknown",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      screenSize:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "unknown",
      ticketContext,
      errors: [...this.errors],
      recentActions: [...this.actions],
      sessionDuration: `${durationMins}m ${durationSecs}s`,
    };
  }

  formatBundleAsText(bundle: DebugBundle): string {
    const lines: string[] = [
      "=== Debug Report ===",
      "",
      `Captured: ${new Date(bundle.capturedAt).toLocaleString()}`,
      `Page: ${bundle.pageUrl}`,
      `Session Duration: ${bundle.sessionDuration}`,
      `Screen Size: ${bundle.screenSize}`,
      `Browser: ${bundle.userAgent}`,
    ];

    if (bundle.ticketContext) {
      lines.push(`Ticket Context: ${bundle.ticketContext}`);
    }

    lines.push("");
    lines.push("=== Console Errors ===");
    if (bundle.errors.length === 0) {
      lines.push("No errors captured.");
    } else {
      bundle.errors.forEach((error, i) => {
        const time = new Date(error.timestamp).toLocaleTimeString();
        lines.push(`[${i + 1}] ${time} [${error.type.toUpperCase()}]`);
        lines.push(`    ${error.message}`);
        if (error.url) {
          lines.push(`    URL: ${error.url}`);
        }
        if (error.stack) {
          lines.push(`    Stack: ${error.stack.split("\n").slice(0, 3).join("\n    ")}`);
        }
        lines.push("");
      });
    }

    lines.push("=== Recent Actions ===");
    if (bundle.recentActions.length === 0) {
      lines.push("No actions recorded.");
    } else {
      bundle.recentActions.forEach((action) => {
        const time = new Date(action.timestamp).toLocaleTimeString();
        lines.push(`[${time}] ${action.action}${action.details ? `: ${action.details}` : ""}`);
      });
    }

    return lines.join("\n");
  }

  clearErrors() {
    this.errors = [];
  }

  clearActions() {
    this.actions = [];
  }
}

// Singleton instance
export const debugCapture = new DebugCaptureService();

// Helper to format debug bundle for ticket description
export function formatDebugForTicket(ticketContext?: string): string {
  const bundle = debugCapture.getDebugBundle(ticketContext);
  return debugCapture.formatBundleAsText(bundle);
}
