import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          amber: "#F97316",
          "amber-light": "#FED7AA",
          slate: "#1E293B",
          "slate-mid": "#475569",
          "slate-light": "#94A3B8",
          surface: "#F8FAFC",
          white: "#FFFFFF",
          border: "#E2E8F0",
          danger: "#DC2626",
          success: "#16A34A",
          warning: "#EA580C",
          info: "#2563EB",
          ink: "#0F172A",
          canvas: "#FFF7ED"
        }
      },
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        mono: ["DM Mono", "monospace"]
      },
      borderRadius: {
        card: "12px"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

