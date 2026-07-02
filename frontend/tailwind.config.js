/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#EEF1F7",
          100: "#D7DEEB",
          300: "#8C9BC0",
          500: "#3D4F7C",
          700: "#243561",
          900: "#1B2A4A",
        },
        paper: {
          DEFAULT: "#FAF7F0",
          dim: "#F0EBDF",
        },
        brass: {
          DEFAULT: "#B08D57",
          dark: "#8E6F41",
          light: "#D4B483",
        },
        sage: {
          DEFAULT: "#7A8B6F",
          dark: "#5E6E54",
          light: "#E4EADC",
        },
        terracotta: {
          DEFAULT: "#C1543C",
          dark: "#9C4530",
          light: "#F4DCD4",
        },
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
