/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./hooks/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Surface hierarchy (dark theme defaults, overridden at runtime by color scheme)
        background: "#07060e",
        "surface-ground": "#0d0b16",
        surface: "#13111f",
        "surface-elevated": "#1a1829",
        "surface-overlay": "#211f33",

        // Primary accent (default: purple)
        primary: {
          DEFAULT: "#8b5cf6",
          light: "#7c3aed",
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#8b5cf6",
          700: "#7c3aed",
          800: "#6b21a8",
          900: "#581c87",
          950: "#3b0764",
        },

        // Text hierarchy
        "text-primary": "#f0eef6",
        "text-secondary": "#9b95ad",
        "text-muted": "#7a7490",
        "text-faded": "#a59cba",
        "text-inverse": "#07060e",

        // Semantic feedback
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",

        // Border hierarchy
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.07)",
          muted: "rgba(255, 255, 255, 0.04)",
          emphasis: "rgba(255, 255, 255, 0.12)",
        },
      },
      fontFamily: {
        sans: ["Manrope", "System"],
      },
      borderRadius: {
        sm: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
