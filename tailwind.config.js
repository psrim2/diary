/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          light: '#fbf9f5',
          cream: '#f5efe6',
          kraft: '#dfd2bc',
          grid: '#eae4d9',
          dark: '#2c2c2c'
        },
        ink: {
          black: '#1f2022',
          blue: '#1e3a5f',
          sepia: '#4a3728',
          red: '#9e2a2b'
        }
      },
      fontFamily: {
        hand: ['Nanum Pen Script', 'Caveat', 'cursive'],
        serif: ['Nanum Myeongjo', 'Georgia', 'serif'],
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
