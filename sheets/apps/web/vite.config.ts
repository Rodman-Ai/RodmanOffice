import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path for the built app. Default `/` works for any-origin deploy and
// for `vite preview`. In RodmanOffice Pages builds, the workflow sets
// VITE_BASE=/RodmanOffice/sheets/ at build time.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/hyperformula")) return "hyperformula";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "charts";
          if (id.includes("/packages/calc/")) return "calc";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
