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
    // —— 排版尺度（显式声明，全站统一，避免业务代码里散落 13/14px 内联字号）——
    // 页面/区块标题：h6（顶栏 20px）→ subtitle1（区块 16px）→ subtitle2（子标题 14px）
    h6: { fontSize: 20, fontWeight: 700, letterSpacing: 0.3 },
    subtitle1: { fontSize: 16, fontWeight: 700, lineHeight: 1.4 },
    subtitle2: { fontSize: 14, fontWeight: 700, lineHeight: 1.4 },
    // 正文：body1（16px）用于大段说明；body2（14px）用于卡片副文本/状态提示
    body1: { fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
    body2: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
    // 字段标签 / 次要说明：caption（12px，统一 text.secondary）
    caption: { fontSize: 12, fontWeight: 400, lineHeight: 1.5, letterSpacing: 0.2 },
    // 按钮：600 字重、不转大写（已在 MuiButton 里统一圆角/质感）
    button: { fontWeight: 600, textTransform: 'none' as const },
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
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: 'background-color .15s',
          // 白底卡片上的图标按钮（编辑/删除/排序）也给出清晰点按反馈；
          // 中性浅灰在浅色顶栏（返回键）上也自然，不引入新色。
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)' },
        },
      },
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

/**
 * 冲突行高亮底色（设计系统 token）。
 * 由 error.main(#DC2626) 在 paper 白底上 10% 叠加得到的浅红实色，
 * 既与 error 语义同源、又足够轻不会喧宾夺主；用实色（非透明）是为了
 * 在批量勾选对话框的「冻结首列」滑动时也能挡住下方内容。
 * 全站冲突高亮统一引用此处，避免在业务代码里散落 #ffebee 之类的硬编码。
 */
export const conflictBg = '#FDECEC';

export default theme;
