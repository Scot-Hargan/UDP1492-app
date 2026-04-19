import { fileURLToPath } from "node:url";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const wranglerConfigPath = fileURLToPath(new URL("./wrangler.test.toml", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: wranglerConfigPath
      }
    })
  ],
  test: {
    include: ["backend/test/**/*.spec.mjs"]
  }
});
