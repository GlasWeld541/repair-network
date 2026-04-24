import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effcfd',
          100: '#d4f6fa',
          200: '#aeeef6',
          300: '#74dfec',
          400: '#35c8db',
          500: '#0fb2c9',
          600: '#0b90a5',
          700: '#0d7384',
          800: '#115e6c',
          900: '#134f5a'
        },
        ink: '#17141a'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 178, 201, 0.10)'
      }
    }
  },
  plugins: [],
} satisfies Config;
