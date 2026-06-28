// Helm — Tailwind config extend block
// Paste into tailwind.config.js under theme.extend to add all design tokens as Tailwind utilities.
// Usage: bg-ds-primary, text-ds-muted, shadow-ds-glass, etc.

/** @type {import('tailwindcss').Config['theme']['extend']} */
export const helmTokens = {
  colors: {
    ds: {
      primary:        '#229971',
      'primary-dark': '#00665e',
      'primary-deep': '#004d3f',
      accent:         '#cedc00',
      danger:         '#f87171',
      // status
      active:         '#34d399',
      paused:         '#fbbf24',
      archived:       '#64748b',
      // semantic
      issues:         '#fb923c',
      prs:            '#a78bfa',
      lang:           '#93c5fd',
      chip:           '#6ee7b7',
      // text
      text:           '#f1f5f9',
      muted:          '#64748b',
      dim:            '#334155',
      // bg
      bg:             '#030712',
      'bg-2':         '#0f1117',
    },
  },
  backgroundImage: {
    'ds-gradient':     'linear-gradient(135deg, #229971, #cedc00)',
    'ds-gradient-rev': 'linear-gradient(135deg, #cedc00, #229971)',
    'ds-gradient-btn': 'linear-gradient(135deg, #00665e, #004d3f)',
    'ds-gradient-surf':'linear-gradient(180deg, rgba(34,153,113,0.08), transparent)',
  },
  boxShadow: {
    'ds-sm':    '0 2px 8px rgba(0,0,0,0.3)',
    'ds':       '0 8px 32px rgba(0,0,0,0.5)',
    'ds-lg':    '0 20px 60px rgba(0,0,0,0.7)',
    'ds-glass': '0 8px 32px rgba(34,153,113,0.15)',
  },
  borderRadius: {
    'ds-sm': '6px',
    'ds':    '10px',
    'ds-md': '12px',
    'ds-lg': '14px',
    'ds-xl': '18px',
  },
  fontFamily: {
    heading: ['Space Grotesk', 'sans-serif'],
    body:    ['Inter', 'sans-serif'],
    mono:    ['JetBrains Mono', 'monospace'],
  },
  transitionDuration: {
    'ds-fast':   '200',
    'ds-normal': '300',
    'ds-slow':   '500',
  },
  // Keyframes for entrance animation (add to animate: too)
  keyframes: {
    'ds-fade-in-up': {
      from: { opacity: '0', transform: 'translateY(12px)' },
      to:   { opacity: '1', transform: 'translateY(0)' },
    },
    'ds-shimmer': {
      '0%':   { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition:  '200% 0' },
    },
  },
  animation: {
    'ds-enter':   'ds-fade-in-up 0.4s ease both',
    'ds-shimmer': 'ds-shimmer 1.4s infinite',
  },
};

// ── Full config example ──────────────────────────────────────────────────────
//
// import { helmTokens } from './docs/mockups/tailwind-tokens.js'
//
// export default {
//   content: ['./index.html', './src/**/*.{js,jsx}'],
//   theme: {
//     extend: helmTokens,
//   },
//   plugins: [],
// }
