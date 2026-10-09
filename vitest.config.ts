import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // PGlite boots slowly on a loaded machine.
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
});
