/** Design tokens come from CSS variables (src/index.css) so light/dark themes switch without rebuilding classes. */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { bg: v('bg'), card: v('card'), fg: v('fg'), muted: v('muted'), mutedfg: v('mutedfg'), line: v('line'), navy: v('navy'), navyfg: v('navyfg'), brand: v('brand'), brandfg: v('brandfg'), danger: v('danger'), warn: v('warn'), ok: v('ok'), info: v('info') },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.05), 0 1px 3px rgb(0 0 0 / 0.06)' },
    },
  },
  plugins: [],
};
