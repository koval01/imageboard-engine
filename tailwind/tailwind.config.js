const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["../templates/**/*.{html,js}"],
  theme: {
    extend: {
      fontFamily: {
        // 2ch uses standard system fonts for readability
        sans: ['Arial', 'Helvetica', 'sans-serif', ...fontFamily.sans],
      },
      colors: {
        // The classic Dvach/Makaba palette
        'dvach-bg': '#eeeeee',        // Main background
        'dvach-post-bg': '#dddddd',   // Reply background
        'dvach-orange': '#ff9933',    // Highlights/Logos
        'dvach-text': '#333333',      // Main text
        'dvach-red': '#aa0000',       // Sage/Admin
        'dvach-green': '#789922',     // >Greentext
        'dvach-link': '#ff6600',      // Links
        'dvach-dark': '#222222',      // Navbar bg
        'dvach-border': '#b7c5d9',    // Post borders
      },
      fontSize: {
        'tiny': '0.7rem',
      }
    },
  },
  plugins: [
    require("daisyui")
  ],
  daisyui: {
    // We largely want to override DaisyUI defaults for that "old school" look
    themes: ["light"]
  }
}