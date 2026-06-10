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
        // Static defaults matching the purple-dark scheme; runtime values come
        // from `createTokensV2(scheme, mode)` and are applied via inline styles.
        bg: "#020618",
        "bg-elev": "rgba(248, 250, 252, 0.06)",
        "bg-elev-2": "rgba(248, 250, 252, 0.10)",
        "bg-sunk": "rgba(0, 0, 0, 0.28)",
        hairline: "rgba(248, 250, 252, 0.10)",
        "hairline-strong": "rgba(248, 250, 252, 0.18)",
        "fg-1": "#f8fafc",
        "fg-2": "#cad5e2",
        "fg-3": "#90a1b9",
        "fg-4": "#62748e",
        "fg-on-primary": "#ffffff",
        primary: "#7f46f7",
        "primary-pressed": "#631df2",
        "status-done": "#7f46f7",
        "status-empty": "rgba(248, 250, 252, 0.22)",
        "status-skip": "#90a1b9",
        "status-overdue": "#fe9a00",
        "status-bad": "#fb2c36",
        "status-frozen": "#00d3f3",
      },
      fontFamily: {
        sans: ["Rubik", "System"],
        display: ["Inter", "System"],
        mono: ["Roboto", "System"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        sheet: "26px",
      },
    },
  },
  plugins: [],
};
