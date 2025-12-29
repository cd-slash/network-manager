import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: [".banjo-capella.ts.net"],
    proxy: {
      "/sync": {
        target: "http://localhost:8048",
        ws: true,
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8048",
        changeOrigin: true,
      },
    },
  },
});
