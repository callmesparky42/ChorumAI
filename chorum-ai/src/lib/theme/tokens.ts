/**
 * Theme Tokens - Centralized Design System
 *
 * This file defines all design tokens for the application.
 * Structured for easy migration to Grafana/Thousand Eyes style
 * or any other theme direction.
 *
 * Usage:
 *   import { theme } from '@/lib/theme/tokens'
 *   className={theme.button.primary}
 */

// Base color palette - logo-derived accent colors
const palette = {
  // Neutrals (dark mode)
  neutral: {
    950: '[#0A0A0A]', // Deepest background
    900: '[#141414]', // Card backgrounds
    850: '[#1A1A1A]', // Mid-dark - for 3-panel layouts
    800: '[#1E1E1E]', // Borders, secondary backgrounds
    700: '[#2A2A2A]', // Lighter borders
    600: '[#525252]', // Muted text
    500: '[#737373]', // Secondary text
    400: '[#A3A3A3]', // Body text
    300: '[#D4D4D4]', // Emphasized text
    200: '[#E5E5E5]', // Near-white text
    100: '[#F5F5F5]', // Bright text
    50: '[#FAFAFA]', // White
  },

  // Primary brand color (from logo - sky blue)
  primary: {
    DEFAULT: '[#4FC3F7]',
    light: '[#81D4FA]',
    dark: '[#29B6F6]',
    muted: '[#4FC3F7]/20',
    text: '[#4FC3F7]',
  },

  // Semantic colors
  success: {
    DEFAULT: '[#4ADE80]',
    light: '[#86EFAC]',
    muted: '[#4ADE80]/20',
    text: '[#4ADE80]',
  },
  warning: {
    DEFAULT: '[#FBBF24]',
    light: '[#FCD34D]',
    muted: '[#FBBF24]/20',
    text: '[#FBBF24]',
  },
  error: {
    DEFAULT: '[#F87171]',
    light: '[#FCA5A5]',
    muted: '[#F87171]/20',
    text: '[#F87171]',
  },

  // Accent colors (from logo - gold/yellow)
  accent: {
    gold: {
      DEFAULT: '[#FFD700]',
      light: '[#FFEB3B]',
      muted: '[#FFD700]/20',
      text: '[#FFD700]',
    },
    cyan: {
      DEFAULT: '[#22D3EE]',
      light: '[#67E8F9]',
      muted: '[#22D3EE]/20',
      text: '[#22D3EE]',
    },
  },
} as const

// Semantic theme tokens - these map palette to usage
export const theme = {
  // Backgrounds
  bg: {
    base: `bg-${palette.neutral[950]}`,
    elevated: `bg-${palette.neutral[900]}`,
    muted: `bg-${palette.neutral[800]}`,
    hover: `hover:bg-${palette.neutral[800]}`,
    active: `bg-${palette.primary.muted}`,
    overlay: 'bg-black/60 backdrop-blur-sm',
  },

  // Text colors
  text: {
    primary: `text-${palette.neutral[100]}`,
    secondary: `text-${palette.neutral[400]}`,
    muted: `text-${palette.neutral[500]}`,
    accent: `text-${palette.primary.text}`,
    inverse: `text-${palette.neutral[950]}`,
  },

  // Borders
  border: {
    default: `border-${palette.neutral[800]}`,
    light: `border-${palette.neutral[700]}`,
    focus: `focus:border-${palette.primary.light}`,
    active: `border-${palette.primary.DEFAULT}`,
  },

  // Buttons
  button: {
    primary: `bg-${palette.primary.DEFAULT} hover:bg-${palette.primary.light} text-white font-medium rounded-lg transition-colors`,
    secondary: `bg-${palette.neutral[800]} hover:bg-${palette.neutral[700]} text-${palette.neutral[300]} rounded-lg transition-colors`,
    ghost: `hover:bg-${palette.neutral[800]} text-${palette.neutral[400]} hover:text-white rounded-lg transition-colors`,
    danger: `bg-${palette.error.muted} hover:bg-${palette.error.DEFAULT}/30 text-${palette.error.text} rounded-lg transition-colors`,
  },

  // Inputs
  input: {
    base: `bg-${palette.neutral[950]} border border-${palette.neutral[800]} rounded-lg px-3 py-2.5 text-white placeholder:text-${palette.neutral[500]} focus:outline-none focus:border-${palette.primary.light} transition-colors`,
    error: `border-${palette.error.DEFAULT} focus:border-${palette.error.DEFAULT}`,
  },

  // Cards
  card: {
    base: `bg-${palette.neutral[900]} border border-${palette.neutral[800]} rounded-xl`,
    elevated: `bg-${palette.neutral[900]} border border-${palette.neutral[700]} rounded-xl shadow-lg`,
    interactive: `bg-${palette.neutral[900]} border border-${palette.neutral[800]} rounded-xl hover:border-${palette.neutral[700]} transition-colors cursor-pointer`,
  },

  // Status indicators
  status: {
    success: `bg-${palette.success.muted} text-${palette.success.text}`,
    warning: `bg-${palette.warning.muted} text-${palette.warning.text}`,
    error: `bg-${palette.error.muted} text-${palette.error.text}`,
    info: `bg-${palette.primary.muted} text-${palette.primary.text}`,
  },

  // Layout panels (for 3-panel Grafana-style layouts)
  panel: {
    sidebar: `bg-${palette.neutral[950]}`, // Darkest
    main: `bg-${palette.neutral[900]}`, // Mid
    detail: `bg-${palette.neutral[800]}`, // Lightest
  },

  // Focus ring
  focus: 'focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-gray-950',

  // Animation classes
  transition: {
    fast: 'transition-all duration-150',
    default: 'transition-all duration-200',
    slow: 'transition-all duration-300',
  },
} as const

// Onboarding-specific tokens
export const onboarding = {
  // Step indicator colors
  step: {
    completed: `bg-${palette.success.DEFAULT} text-white`,
    current: `bg-${palette.primary.DEFAULT} text-white`,
    upcoming: `bg-${palette.neutral[800]} text-${palette.neutral[500]}`,
    connector: {
      completed: `bg-${palette.success.DEFAULT}`,
      upcoming: `bg-${palette.neutral[700]}`,
    },
  },

  // Provider cards
  provider: {
    card: `bg-${palette.neutral[900]} border-2 border-${palette.neutral[800]} rounded-xl p-4 cursor-pointer hover:border-${palette.primary.light} transition-all`,
    selected: `border-${palette.primary.DEFAULT} bg-${palette.primary.muted}`,
    icon: 'w-12 h-12 rounded-lg flex items-center justify-center',
  },

  // Validation states
  validation: {
    idle: `text-${palette.neutral[500]}`,
    checking: `text-${palette.primary.text}`,
    valid: `text-${palette.success.text}`,
    invalid: `text-${palette.error.text}`,
  },

  // Secret input styling
  secretInput: {
    container: `bg-${palette.neutral[950]} border border-${palette.neutral[800]} rounded-lg`,
    input: 'font-mono bg-transparent px-3 py-2.5 text-white placeholder:text-gray-500 focus:outline-none flex-1',
    button: `px-3 text-${palette.neutral[500]} hover:text-white transition-colors`,
  },
} as const

// Helper to combine theme classes with custom classes
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Type exports for IDE support
export type ThemeToken = typeof theme
export type OnboardingToken = typeof onboarding
