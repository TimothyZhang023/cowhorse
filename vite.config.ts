import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 12620,
    proxy: {
      "/health": {
        target: "http://127.0.0.1:12621",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:12621",
        changeOrigin: true,
      },
      "/v1": {
        target: "http://127.0.0.1:12621",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
