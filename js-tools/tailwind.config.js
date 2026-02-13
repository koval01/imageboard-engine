const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../templates/**/*.{html,js}"],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['arial', 'helvetica', 'sans-serif', ...fontFamily.sans],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        'xxs': '0.65rem',
      },
      colors: {
        skin: {
          base: 'var(--color-bg-base)',
          surface: 'var(--color-bg-surface)',
          header: 'var(--color-bg-header)',
          input: 'var(--color-bg-input)',

          text: 'var(--color-text-base)',
          muted: 'var(--color-text-muted)',

          link: 'var(--color-text-link)',
          'link-hover': 'var(--color-text-link-hover)',

          subject: 'var(--color-text-subject)',
          name: 'var(--color-text-name)',
          trip: 'var(--color-text-trip)',

          green: 'var(--color-text-green)',
          red: 'var(--color-text-red)',

          border: 'var(--color-border)',
          'reply-bg': 'var(--color-bg-reply)',
          'reply-border': 'var(--color-border-reply)',
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
    themes: [],
    logs: false,
  }
}
