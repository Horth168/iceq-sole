/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // theme-aware tokens (see :root / .dark in index.css)
        ink: { DEFAULT: 'rgb(var(--ink) / <alpha-value>)', 800: 'rgb(var(--ink-800) / <alpha-value>)', 700: 'rgb(var(--ink-700) / <alpha-value>)', 600: 'rgb(var(--ink-600) / <alpha-value>)' },
        bone: { DEFAULT: 'rgb(var(--bone) / <alpha-value>)', 100: 'rgb(var(--bone-100) / <alpha-value>)', 200: 'rgb(var(--bone-200) / <alpha-value>)', 300: 'rgb(var(--bone-300) / <alpha-value>)', 400: 'rgb(var(--bone-400) / <alpha-value>)' },
        white: 'rgb(var(--surface) / <alpha-value>)',
        stone: { 450: 'rgb(var(--muted) / <alpha-value>)' },
        // fixed colours for text/buttons on top of photos and always-dark sections
        snow: '#FFFFFF',
        night: { DEFAULT: '#0A0A0B', 800: '#17171A', 700: '#232328' },
        ice: { 50: 'rgb(var(--ice-50) / <alpha-value>)', 100: 'rgb(var(--ice-100) / <alpha-value>)', 200: '#BDE7F8', 300: '#8FD6F5', 400: '#5DC1EC', 500: '#2BA6DA', 600: '#1683B3', 700: 'rgb(var(--ice-700) / <alpha-value>)' },
        signal: '#D93A2B',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '"Kantumruy Pro Variable"', 'system-ui', 'sans-serif'],
        display: ['"Archivo Variable"', 'Archivo', '"Kantumruy Pro Variable"', '"Inter Variable"', 'sans-serif'],
        khmer: ['"Kantumruy Pro Variable"', '"Inter Variable"', 'sans-serif'],
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
        'line-up': { from: { opacity: 0, transform: 'translateY(105%)' }, to: { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        'page-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
        'fade-up': 'fade-up .6s cubic-bezier(.2,.7,.2,1) both',
        'slide-in': 'slide-in .35s cubic-bezier(.2,.8,.2,1) both',
        'slide-up': 'slide-up .35s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in .25s ease both',
        marquee: 'marquee 40s linear infinite',
        'line-up': 'line-up .9s cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop .45s cubic-bezier(.3,1.6,.5,1)',
        'page-in': 'page-in .45s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
}
