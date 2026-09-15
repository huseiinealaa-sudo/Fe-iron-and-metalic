/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Laboratory shell — a dark bench so the specimen reads as metal.
        shell: { 950: '#07090c', 900: '#0d1117', 850: '#131a22', 800: '#1a232e', 700: '#26323f', 600: '#3a4856' },
        steel: { 300: '#c9d4de', 400: '#9fb0be', 500: '#7c8fa0', 600: '#5b6c7c' },
        // Stress ramp — reused by the shader colour map and the chart.
        stress: { cold: '#2f6fd0', ok: '#2fa36b', warn: '#d8a52a', hot: '#e0642a', fail: '#d02f2f' },
        accent: '#f0b429',
      },
      fontFamily: {
        ar: ['"Noto Sans Arabic"', '"Segoe UI"', 'Tahoma', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
    },
  },
  plugins: [],
}
