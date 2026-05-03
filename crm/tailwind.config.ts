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
