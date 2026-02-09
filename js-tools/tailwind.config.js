const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../templates/**/*.{html,js}"],
  darkMode: ['class', '[data-theme="dark"]'], // Enable class-based dark mode
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Arial', 'Helvetica', 'sans-serif', ...fontFamily.sans],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        skin: {
          base: 'var(--color-bg-base)',
          surface: 'var(--color-bg-surface)',
          header: 'var(--color-bg-header)',
          input: 'var(--color-bg-input)',

          text: 'var(--color-text-base)',
          muted: 'var(--color-text-muted)',
          accent: 'var(--color-text-accent)',
          link: 'var(--color-text-link)',
          green: 'var(--color-text-green)', // For greentext
          red: 'var(--color-text-red)',     // For sage/admin

          border: 'var(--color-border)',
          primary: 'var(--color-primary)',
          'primary-hover': 'var(--color-primary-hover)',
        }
      },
      boxShadow: {
        'post': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("daisyui")
  ],
  daisyui: {
    themes: [], // Disable daisyUI default themes to use our custom CSS variables
    logs: false,
  }
}