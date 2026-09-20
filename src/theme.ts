/**
 * 开土记录 App —— 统一设计系统（Design Tokens）
 *
 * 风格定位：工程现场 / 岩土勘察。
 * - 主色 primary：青绿（teal）#0F766E，取自土壤—水位—工程的沉稳感，专业且具辨识度。
 * - 辅色 secondary：大地琥珀 #D97706，用于次级强调（如「三角坐标定名」标记）。
 * - 语义色 error：用于「扰动土」等警示场景。
 * - 统一圆角（shape.borderRadius=12）、按钮去大写、组件默认质感（扁平 AppBar、描边卡片、柔和阴影）。
 *
 * 通过 MuiXxx 的 defaultProps / styleOverrides 让全站组件自动套用，无需逐个改业务代码。
 */
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0F766E',
      light: '#14B8A6',
      dark: '#115E59',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#D97706',
      light: '#F59E0B',
      dark: '#B45309',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#DC2626',
      light: '#EF4444',
      dark: '#B91C1C',
    },
    success: {
      main: '#16A34A',
    },
    background: {
      default: '#F1F5F4',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1F2A28',
      secondary: '#5B6B67',
    },
    divider: '#E3E8E6',
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Microsoft YaHei', 'Hiragino Sans GB', sans-serif`,
    h6: { fontWeight: 700, letterSpacing: 0.3 },
    subtitle1: { fontWeight: 700 },
    subtitle2: { fontWeight: 700 },
    button: { fontWeight: 600, textTransform: 'none' as const },
    caption: { letterSpacing: 0.2 },
  },
  components: {
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'primary' },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, fontWeight: 600 },
        containedPrimary: {
          '&:hover': { boxShadow: '0 6px 16px rgba(15,118,110,0.28)' },
        },
        containedSecondary: {
          '&:hover': { boxShadow: '0 6px 16px rgba(217,119,6,0.28)' },
        },
        containedError: {
          '&:hover': { boxShadow: '0 6px 16px rgba(220,38,38,0.28)' },
        },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 14 } },
    },
    MuiPaper: {
      styleOverrides: { rounded: { borderRadius: 14 } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600, borderRadius: 8 } },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 8px 20px rgba(15,118,110,0.35)',
          '&:hover': { boxShadow: '0 10px 24px rgba(15,118,110,0.45)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { borderRadius: 8, textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
  },
});

export default theme;
