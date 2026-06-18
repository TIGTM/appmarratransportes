/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marra: {
          primary: '#005A9C',
          secondary: '#00AEEF',
          paper: '#F4F6F8',
          text: '#333333',
        },
      },
      boxShadow: {
        soft: '0 18px 45px rgba(0, 90, 156, 0.12)',
      },
    },
  },
  plugins: [],
};
