import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/main.ts", "src/cache-api/main-cache.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
})
