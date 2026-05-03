import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path for the built app. Default `/` works for any-origin deploy and
// for `vite preview`. For GitHub Pages project sites set VITE_BASE=/AiCell/
// at build time (the included Pages workflow does this automatically).
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
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
