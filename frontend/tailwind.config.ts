import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Derived from the Al-Baha University logo.
        navy: { DEFAULT: "#13294B", 700: "#1B3A6B", 50: "#EEF2F8" },
        royal: { DEFAULT: "#1F5AA6", 600: "#2A6CC2", 50: "#EAF1FB" },
        sky: { DEFAULT: "#3FA9DF", 50: "#E9F6FC" },
        leaf: { DEFAULT: "#4C9A2A", 50: "#EDF6E8" },
        ink: { DEFAULT: "#1E2633", soft: "#5B6678", faint: "#8A94A6" },
        line: "#E3E8EF",
        canvas: "#F6F8FB",
      },
      fontFamily: { sans: ["var(--font-arabic)", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(19,41,75,.06), 0 4px 16px rgba(19,41,75,.05)" },
    },
  },
  plugins: [],
} satisfies Config;
