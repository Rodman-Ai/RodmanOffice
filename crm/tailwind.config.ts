import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        leo: {
          50: "#f5f7ff",
          100: "#e8edff",
          200: "#c8d2ff",
          300: "#9aaaff",
          400: "#6b7dff",
          500: "#4f5ff5",
          600: "#3a45d6",
          700: "#2e36a8",
          800: "#262d85",
          900: "#1f2566",
        },
        // Microsoft Dynamics 365-inspired chrome tokens. Navy sitemap, near-white
        // command bar with MS-blue accent — matches RodBooks for visual parity.
        dyn: {
          sitemap: "#1F2937",
          "sitemap-fg": "#FFFFFF",
          "sitemap-group": "rgba(255,255,255,0.55)",
          "sitemap-hover": "rgba(255,255,255,0.08)",
          "sitemap-active": "rgba(255,255,255,0.14)",
          bar: "#FAFAFA",
          line: "#EDEBE9",
          fg: "#201F1E",
          hover: "#F3F2F1",
          accent: "#0078D4",
          crumb: "#605E5C",
          "grid-header": "#F3F2F1",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Inter",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
