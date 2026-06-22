/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080F1F", // Very deep navy blue
        surface: "#111C35", // Lighter blue for cards
        surfaceBorder: "#1E2D4A",
        accentBlue: "#00E5FF", // Vibrant cyan
        success: "#00FF87", // Neon green
        warning: "#FFD600", // Bright yellow
        danger: "#FF2A55",
        textMain: "#E2E8F0",
        textMuted: "#94A3B8"
      },
      backgroundImage: {
        'glow-gradient': 'radial-gradient(circle at 50% -20%, #111C35 0%, #080F1F 80%)',
      }
    },
  },
  plugins: [],
}