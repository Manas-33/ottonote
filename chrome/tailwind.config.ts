import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        paper: {
          50: "#fafaf7",
          100: "#f4f3ee",
          150: "#ecebe4",
          200: "#e3e2d9",
          300: "#c8c6b9",
          400: "#9c9a8d",
          500: "#6e6d62",
          600: "#4a4943",
          700: "#33332e",
          800: "#22221f",
          900: "#141413",
          950: "#0b0b0a",
        },
        flame: {
          50: "#fff4ed",
          100: "#ffe5d4",
          200: "#ffc6a8",
          300: "#ff9d70",
          400: "#ff7136",
          500: "#ff5310",
          600: "#f03c00",
          700: "#c72d02",
          800: "#9e260b",
          900: "#80230d",
        },
      },
      keyframes: {
        recPulse: {
          "0%,100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.45" },
        },
        recRing: {
          "0%": { transform: "scale(0.85)", opacity: "0.6" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        dotBlink: {
          "0%,80%,100%": { opacity: "0.22" },
          "40%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "rec-pulse": "recPulse 1.4s ease-in-out infinite",
        "rec-ring": "recRing 1.8s ease-out infinite",
        "dot-blink": "dotBlink 1.4s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "fade-up": "fadeUp 220ms ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
