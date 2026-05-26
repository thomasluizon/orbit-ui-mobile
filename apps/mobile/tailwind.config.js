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
        // ── v2 (redesign/v2) — OKLCH-derived semantic tokens.
        // These are placeholders matching the dark-mode purple default; runtime
        // values come from `createTokensV2(scheme, mode)` and are applied via
        // inline styles or NativeWind className arbitrary-value syntax.
        bg: "#0a0a14",
        "bg-elev": "#15151f",
        "bg-sunk": "#070710",
        hairline: "rgba(244, 243, 250, 0.08)",
        "hairline-strong": "rgba(244, 243, 250, 0.16)",
        "fg-1": "#f4f3fa",
        "fg-2": "#b6b3c4",
        "fg-3": "#8b88a0",
        "fg-4": "#5e5b73",
        "fg-on-primary": "#fcfcfc",
        "primary-pressed": "#a78bfa",
        "status-done": "#8b5cf6",
        "status-empty": "#5e5b73",
        "status-skip": "#8b88a0",
        "status-overdue": "#d49b6a",
        "status-bad": "#c97570",
        "status-frozen": "#9bb4cf",

        // ── Legacy (kept until Phase 7 cleanup audit removes the last consumer).
        background: "#07060e",
        "surface-ground": "#0d0b16",
        surface: "#13111f",
        "surface-elevated": "#1a1829",
        "surface-overlay": "#211f33",
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
        "text-primary": "#f0eef6",
        "text-secondary": "#9b95ad",
        "text-muted": "#7a7490",
        "text-faded": "#a59cba",
        "text-inverse": "#07060e",
        success: "#34d399",
        warning: "#fbbf24",
        danger: "#f87171",
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.07)",
          muted: "rgba(255, 255, 255, 0.04)",
          emphasis: "rgba(255, 255, 255, 0.12)",
        },
      },
      fontFamily: {
        sans: ["Geist", "System"],
        mono: ["GeistMono", "Menlo", "monospace"],
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
