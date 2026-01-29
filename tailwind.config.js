/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Fraunces', 'Georgia', 'serif'],
        'body': ['Nunito', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Theme-aware colors using CSS variables
        'brand-primary': 'var(--color-brand-primary)',
        'brand-primary-light': 'var(--color-brand-primary-light)',
        'brand-primary-dark': 'var(--color-brand-primary-dark)',
        'brand-secondary': 'var(--color-brand-secondary)',
        'brand-accent': 'var(--color-brand-accent)',
        'brand-green': 'var(--color-brand-green)',
        'brand-yellow': 'var(--color-brand-yellow)',
        'brand-red': 'var(--color-brand-red)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'bg-subtle': 'var(--color-bg-subtle)',
        'bg-card': 'var(--color-bg-card)',
        'border': 'var(--color-border)',
        // Legacy aliases for compatibility
        'brand-blue': 'var(--color-brand-primary)',
        'brand-blue-light': 'var(--color-brand-primary-light)',
      },
    },
  },
  plugins: [],
}
