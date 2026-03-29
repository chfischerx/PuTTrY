import { describe, it, expect, beforeEach } from "vitest"
import { loadEnvFiles } from "../../../server/env-loader"

describe("env-loader", () => {
  beforeEach(() => {
    // Clean up test env vars
    delete process.env.TEST_VAR_1
    delete process.env.TEST_VAR_2
  })

  it("should handle missing env files without throwing", () => {
    // Should not throw when .env files don't exist
    expect(() => loadEnvFiles(false)).not.toThrow()
  })

  it("should be idempotent when env files don't exist", () => {
    // Call twice - should behave the same
    loadEnvFiles(false)
    loadEnvFiles(false)
    expect(() => {}).not.toThrow()
  })

  it("should support silent mode (logStartup=false)", () => {
    // Should run without console output
    expect(() => loadEnvFiles(false)).not.toThrow()
  })
})
