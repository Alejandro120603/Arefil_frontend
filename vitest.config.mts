import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fromRoot("./src"),
      "client-only": fromRoot("./src/test/empty-module.ts"),
      "server-only": fromRoot("./src/test/empty-module.ts"),
    },
  },
  test: {
    environment: "node",
    restoreMocks: true,
  },
});
