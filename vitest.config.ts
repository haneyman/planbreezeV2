import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
  test: {
    include: ["convex/**/*.test.ts", "app/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
