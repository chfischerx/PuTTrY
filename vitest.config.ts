import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from "vitest/config"

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(dir, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    projects: [
      {
        name: "server",
        test: {
          environment: "node",
          include: ["src/__tests__/server/**/*.test.ts"],
          globals: true,
          setupFiles: ["src/__tests__/server/setup.ts"],
        },
      },
      {
        name: "browser",
        test: {
          environment: "jsdom",
          include: ["src/__tests__/browser/**/*.test.{ts,tsx}"],
          globals: true,
          setupFiles: ["src/__tests__/browser/setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
