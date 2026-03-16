/**
 * Tests for serverApiConfig.ts - Server-side API base URL resolver
 *
 * These tests verify:
 * - Priority order: INTERNAL_API_BASE_URL > API_BASE_URL > NEXT_PUBLIC_API_BASE_URL
 * - Development fallback to http://127.0.0.1:8000
 * - Production fail-fast when no config is set
 */

describe("serverApiConfig", () => {
  // Helper to import module with custom env
  async function importWithEnv(envVars: Record<string, string | undefined>, nodeEnv: string) {
    // Clear all relevant env vars first
    delete process.env.INTERNAL_API_BASE_URL;
    delete process.env.API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    
    // Set new values
    Object.entries(envVars).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    process.env.NODE_ENV = nodeEnv;
    
    // Reset modules to get fresh import
    jest.resetModules();
    
    // Import the module
    const module = await import("../lib/serverApiConfig");
    return module;
  }

  describe("Priority order: INTERNAL_API_BASE_URL > API_BASE_URL > NEXT_PUBLIC_API_BASE_URL", () => {
    it("should prefer INTERNAL_API_BASE_URL over other variables", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: "http://internal.api:8000",
          API_BASE_URL: "http://api.example.com",
          NEXT_PUBLIC_API_BASE_URL: "http://public.example.com",
        },
        "production"
      );

      expect(getServerApiBaseUrl()).toBe("http://internal.api:8000");
    });

    it("should use API_BASE_URL when INTERNAL_API_BASE_URL is not set", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: undefined,
          API_BASE_URL: "http://api.example.com",
          NEXT_PUBLIC_API_BASE_URL: "http://public.example.com",
        },
        "production"
      );

      expect(getServerApiBaseUrl()).toBe("http://api.example.com");
    });

    it("should use NEXT_PUBLIC_API_BASE_URL when only it is set", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: undefined,
          API_BASE_URL: undefined,
          NEXT_PUBLIC_API_BASE_URL: "http://public.example.com",
        },
        "production"
      );

      expect(getServerApiBaseUrl()).toBe("http://public.example.com");
    });
  });

  describe("Development mode fallback", () => {
    it("should fallback to http://127.0.0.1:8000 in development mode when no env vars set", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: undefined,
          API_BASE_URL: undefined,
          NEXT_PUBLIC_API_BASE_URL: undefined,
        },
        "development"
      );

      expect(getServerApiBaseUrl()).toBe("http://127.0.0.1:8000");
    });

    it("should NOT fallback to localhost in production mode when no env vars set", async () => {
      // Note: The error is thrown at module import time (export const serverApiBase = getApiBaseUrl())
      // because there's no config set. This is the CORRECT behavior - fail-fast in production.
      try {
        const { getServerApiBaseUrl } = await importWithEnv(
          {
            INTERNAL_API_BASE_URL: undefined,
            API_BASE_URL: undefined,
            NEXT_PUBLIC_API_BASE_URL: undefined,
          },
          "production"
        );
        // If we get here, call the function (will also throw)
        getServerApiBaseUrl();
        fail("Should have thrown");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain("API base URL is not configured");
      }
    });

    it("should NOT fallback to localhost in test mode when no env vars set", async () => {
      try {
        const { getServerApiBaseUrl } = await importWithEnv(
          {
            INTERNAL_API_BASE_URL: undefined,
            API_BASE_URL: undefined,
            NEXT_PUBLIC_API_BASE_URL: undefined,
          },
          "test"
        );
        getServerApiBaseUrl();
        fail("Should have thrown");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toContain("API base URL is not configured");
      }
    });
  });

  describe("Production mode configuration requirements", () => {
    it("should throw error in production when no API base URL is configured", async () => {
      // Note: The error is thrown at module import time (export const serverApiBase = getApiBaseUrl())
      // This is the correct fail-fast behavior in production.
      try {
        const { getServerApiBaseUrl } = await importWithEnv(
          {
            INTERNAL_API_BASE_URL: undefined,
            API_BASE_URL: undefined,
            NEXT_PUBLIC_API_BASE_URL: undefined,
          },
          "production"
        );
        getServerApiBaseUrl();
        fail("Should have thrown");
      } catch (e: unknown) {
        expect(e).toBeInstanceOf(Error);
      }
    });

    it("should work in production when INTERNAL_API_BASE_URL is set", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: "http://internal.prod:8000",
        },
        "production"
      );

      expect(getServerApiBaseUrl()).toBe("http://internal.prod:8000");
    });

    it("should work in production when API_BASE_URL is set", async () => {
      const { getServerApiBaseUrl } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: undefined,
          API_BASE_URL: "http://api.prod:8000",
        },
        "production"
      );

      expect(getServerApiBaseUrl()).toBe("http://api.prod:8000");
    });
  });

  describe("Exported constant serverApiBase", () => {
    it("should export a string value for serverApiBase", async () => {
      const { serverApiBase } = await importWithEnv(
        {
          INTERNAL_API_BASE_URL: "http://test.api:8000",
        },
        "production"
      );

      expect(serverApiBase).toBe("http://test.api:8000");
    });
  });
});
