import { defineConfig, type Plugin } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

// "@/..." resolves like the apps' tsconfig paths: the app's own src first, then packages/shared/src.
// Tests exercise server code from both apps (admin-only code lives in apps/admin/src).
const roots = ["apps/store/src", "apps/admin/src", "packages/shared/src"].map((r) => path.resolve(__dirname, r));
const exts = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

function appAlias(): Plugin {
  return {
    name: "app-alias",
    enforce: "pre",
    resolveId(source) {
      if (!source.startsWith("@/")) return null;
      for (const root of roots) {
        for (const ext of exts) {
          const file = path.join(root, source.slice(2)) + ext;
          if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [appAlias()],
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
