/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        metro: {
          dark: '#0a0a0c',
          card: '#141418',
          hover: '#1e1e24',
          accent: '#e11d48',
          text: '#f4f4f5',
          subtext: '#a1a1aa'
        }
      },
      fontFamily: {
        cormorant: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        serif: ['"Cormorant Garamond"', '"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'Manrope', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        handwritten: ['Caveat', 'Kalam', 'cursive'],
        kinetic: ['Oswald', 'Syne', 'Impact', 'sans-serif'],
        display: ['Syne', '"Playfair Display"', 'sans-serif'],
        spacious: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        lyrics: ['Inter', 'Manrope', 'sans-serif'],
        sticker: ['Outfit', 'sans-serif']
      }
    },
  },
  plugins: [],
}
