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
            amber: "#F59E0B",
            "amber-light": "#2A1F09",
            slate: "#F0F6FC",
            "slate-mid": "#CBD5E1",
            "slate-light": "#94A3B8",
            surface: "#0D1318",
            white: "#0D1318",
            border: "#1E2D3D",
            danger: "#EF4444",
            success: "#22C55E",
            warning: "#F59E0B",
            info: "#38BDF8",
            ink: "#080C10",
            canvas: "#080C10"
          }
        },
        fontFamily: {
          sans: ["IBM Plex Sans", "sans-serif"],
          mono: ["IBM Plex Mono", "monospace"]
        },
        borderRadius: {
          card: "12px"
        },
        boxShadow: {
          soft: "0 18px 48px rgba(0, 0, 0, 0.35)"
        }
      }
    },
  plugins: []
};

export default config;

