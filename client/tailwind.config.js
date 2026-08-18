/** @type {import('tailwindcss').Config} */
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  darkMode: ["class"],
  content: [
    path.join(__dirname, "./index.html"),
    path.join(__dirname, "./src/**/*.{js,jsx,ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F9FB",
        foreground: "#1E293B",
        primary: {
          DEFAULT: "#1E3A5F",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#3B82F6",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#EEF3F8",
          foreground: "#1E3A5F",
        },
        success: "#15803D",
        warning: "#B45309",
        danger: "#B91C1C",
        card: "#FFFFFF",
        muted: {
          DEFAULT: "#F1F5F9",
          foreground: "#64748B",
        },
        border: "#E4E9EF",
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [],
};