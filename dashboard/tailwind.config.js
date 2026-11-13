/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0A0A0B', 800: '#1C1C1F', 700: '#2A2A2E', 600: '#3F3F45' },
        bone: { DEFAULT: '#F5F4F0', 100: '#FAF9F7', 200: '#EDEBE6', 300: '#E2DFD8', 400: '#CFCBC2' },
        stone: { 450: '#8A877F' },
        ice: { 50: '#F0FAFE', 100: '#DDF3FC', 200: '#BDE7F8', 300: '#8FD6F5', 400: '#5DC1EC', 500: '#2BA6DA', 600: '#1683B3', 700: '#136890' },
        signal: '#D93A2B',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Archivo Variable"', 'Archivo', '"Inter Variable"', 'sans-serif'],
      },
      letterSpacing: { tightest: '-0.045em' },
      boxShadow: {
        soft: '0 1px 2px rgba(10,10,11,.04), 0 8px 24px -12px rgba(10,10,11,.12)',
        lift: '0 2px 4px rgba(10,10,11,.04), 0 20px 40px -16px rgba(10,10,11,.22)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-up': 'fade-up .6s cubic-bezier(.2,.7,.2,1) both',
        'slide-in': 'slide-in .35s cubic-bezier(.2,.8,.2,1) both',
        'slide-up': 'slide-up .35s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in .25s ease both',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
}
