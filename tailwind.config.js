/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Jira-inspired color palette
        'brand-blue': '#0052CC',
        'brand-blue-light': '#4C9AFF',
        'brand-green': '#36B37E',
        'brand-yellow': '#FFAB00',
        'brand-red': '#FF5630',
        'text-primary': '#172B4D',
        'text-secondary': '#5E6C84',
        'bg-subtle': '#F4F5F7',
        'border': '#DFE1E6',
      },
    },
  },
  plugins: [],
}
