import { defineConfig } from "vitest/config";

import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    css: true,
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["src/main.jsx", "src/setupTests.js", "src/**/*.test.*"],
    },
  },
});
