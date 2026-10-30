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

/**
 * 圆角 token（显式 px 字符串）。
 *
 * ⚠️ 为什么不用数字：`sx={{ borderRadius: 2 }}` 里的 2 不是 2px，而是
 * 「theme.shape.borderRadius(12) × 2 = 24px」。同一份代码里写 2 / 3 / 8 会得到
 * 24 / 36 / 96px 三种完全不同的效果（历史上信息格就因此变成了药丸形）。
 * 因此业务代码统一引用这里的 px 字符串，含义只有一种。
 */
export const RADIUS = {
  /** 卡片：记录卡片 / 土样卡片 / 模式选项卡 */
  card: '16px',
  /** 卡片内的信息格、内嵌区块（比卡片更小一档） */
  tile: '8px',
} as const;

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
    // 信息色：默认归属品牌主色青绿（而非 MUI 默认蓝），让 info 类提示框也落在
    // 青绿 + 琥珀 + 红 + 绿 的同一套色族里，不出现离群的蓝色。（目前用于导入合并提示、
    // CMA 二次确认里的「仅本机保存」说明等 severity="info" 提示框。）
    info: {
      main: '#0F766E',
      light: '#14B8A6',
      dark: '#115E59',
      contrastText: '#FFFFFF',
    },
    // 警示色：与辅色 secondary（琥珀 #D97706）同源，统一「注意/警示」语义。
    // 不定义时 MUI 的 severity="warning" 会用默认橙 #ED6C02，与我们禁用的默认橙冲突。
    warning: {
      main: '#D97706',
      light: '#F59E0B',
      dark: '#B45309',
      contrastText: '#FFFFFF',
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
      styleOverrides: { root: { borderRadius: RADIUS.card } },
    },
    MuiPaper: {
      styleOverrides: { rounded: { borderRadius: 14 } },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        // 字号对齐 caption 尺度（12px）。MUI 默认 13px 不在本文件的字阶内，
        // 会在卡片与录入框里形成两套「看起来差不多但不同」的字号。
        label: { fontSize: 12, letterSpacing: 0.2 },
      },
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
      styleOverrides: {
        root: { borderRadius: 10 },
        // 默认（未聚焦）描边加清晰：MUI 默认 rgba(0,0,0,0.23) 在浅灰底几乎看不见，
        // 统一加深到 0.35，保证输入框在静止状态下也清晰可辨（移动端尤其明显）。
        // 悬停/聚焦仍有更高优先级的选择器覆盖为更深的灰 / primary，不受影响。
        notchedOutline: { borderColor: 'rgba(0, 0, 0, 0.35)' },
      },
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
