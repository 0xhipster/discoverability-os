/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0D10",
        panel: "#10151A",
        line: "#1F2A30",
        paper: "#E8E6E1",
        muted: "#7C8A8F",
        signal: "#5EEAD4",
        amber: "#F2B84B",
        flag: "#E8604C",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};
