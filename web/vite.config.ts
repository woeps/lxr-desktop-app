import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";

export default defineConfig({
  plugins: [solid()],
  base: "./",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  test: { environment: "jsdom", passWithNoTests: true },
});
