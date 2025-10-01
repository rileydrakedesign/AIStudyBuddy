// Material UI Theme Configuration
// Applies Class Chat AI design tokens to Material UI

import { createTheme } from '@mui/material/styles';
import { colors, typography, spacing, radius, shadows } from './tokens';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.primary.main,
      dark: colors.primary.dark,
      light: colors.primary.light,
    },
    secondary: {
      main: colors.neutral[600],
      dark: colors.neutral[700],
      light: colors.neutral[500],
    },
    error: {
      main: colors.semantic.error,
    },
    warning: {
      main: colors.semantic.warning,
    },
    info: {
      main: colors.semantic.info,
    },
    success: {
      main: colors.semantic.success,
    },
    background: {
      default: colors.neutral[900],
      paper: colors.neutral[800],
    },
    text: {
      primary: colors.neutral[300],
      secondary: colors.neutral[400],
      disabled: colors.neutral[500],
    },
    divider: colors.neutral[600],
  },

  typography: {
    fontFamily: typography.fontFamily.primary,
    h1: {
      fontSize: typography.fontSize.h1,
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
    },
    h2: {
      fontSize: typography.fontSize.h2,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.snug,
    },
    h3: {
      fontSize: typography.fontSize.h3,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.normal,
    },
    h4: {
      fontSize: typography.fontSize.h4,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.normal,
    },
    body1: {
      fontSize: typography.fontSize.body,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.loose,
    },
    body2: {
      fontSize: typography.fontSize.bodySmall,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.relaxed,
    },
    button: {
      fontSize: typography.fontSize.button,
      fontWeight: typography.fontWeight.semibold,
      textTransform: 'none',
      letterSpacing: '0.025em',
    },
    caption: {
      fontSize: typography.fontSize.caption,
      fontWeight: typography.fontWeight.medium,
      lineHeight: typography.lineHeight.normal,
    },
  },

  shape: {
    borderRadius: parseFloat(radius.md) * 16, // Convert rem to px
  },

  shadows: [
    'none',
    shadows.sm,
    shadows.sm,
    shadows.md,
    shadows.md,
    shadows.md,
    shadows.lg,
    shadows.lg,
    shadows.lg,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
    shadows.xl,
  ],

  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          padding: `${spacing.sm} ${spacing.lg}`,
          fontWeight: typography.fontWeight.semibold,
          transition: `all 200ms cubic-bezier(0.0, 0, 0.2, 1)`,
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: shadows.md,
          },
          '&:active': {
            transform: 'translateY(0)',
          },
        },
        contained: {
          boxShadow: shadows.sm,
        },
        outlined: {
          borderWidth: '1px',
          borderColor: colors.neutral[600],
          '&:hover': {
            borderColor: colors.neutral[500],
            backgroundColor: colors.neutral[800],
          },
        },
      },
    },

    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: colors.neutral[900],
            borderRadius: radius.md,
            transition: `all 200ms cubic-bezier(0.0, 0, 0.2, 1)`,
            '& fieldset': {
              borderColor: colors.neutral[600],
              borderWidth: '1px',
            },
            '&:hover fieldset': {
              borderColor: colors.neutral[500],
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.primary.main,
              borderWidth: '2px',
              boxShadow: shadows.glow,
            },
          },
          '& .MuiInputLabel-root': {
            color: colors.neutral[400],
            '&.Mui-focused': {
              color: colors.primary.main,
            },
          },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: colors.neutral[800],
          borderRadius: radius.lg,
          border: `1px solid ${colors.neutral[700]}`,
          boxShadow: shadows.md,
          transition: `all 250ms cubic-bezier(0.4, 0, 0.2, 1)`,
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.neutral[900],
          borderBottom: `1px solid ${colors.neutral[700]}`,
          boxShadow: shadows.md,
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(0, 77, 86, 0.07)',
          backdropFilter: 'blur(10px)',
          borderRight: `1px solid ${colors.neutral[700]}`,
          boxShadow: shadows.md,
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: radius.md,
          marginBottom: spacing.xs,
          transition: `all 150ms cubic-bezier(0.0, 0, 0.2, 1)`,
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
          '&.Mui-selected': {
            backgroundColor: colors.primary.bg,
            color: colors.primary.light,
            '&:hover': {
              backgroundColor: colors.primary.bg,
            },
          },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: `all 150ms cubic-bezier(0.0, 0, 0.2, 1)`,
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: radius.full,
          backgroundColor: colors.neutral[700],
        },
        bar: {
          borderRadius: radius.full,
        },
      },
    },
  },
});
