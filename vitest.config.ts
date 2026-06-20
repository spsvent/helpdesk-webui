import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mirror the tsconfig "@/*" -> "./src/*" path alias so lib modules that
    // import via "@/..." (e.g. filterUtils.ts) are resolvable under vitest.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
