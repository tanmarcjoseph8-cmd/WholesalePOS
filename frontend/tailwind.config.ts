import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        ocean: "#0E7490",
        mint: "#0F9F6E",
        amber: "#D97706",
        rose: "#E11D48"
      },
      boxShadow: {
        panel: "0 18px 50px rgba(16, 24, 40, 0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;
