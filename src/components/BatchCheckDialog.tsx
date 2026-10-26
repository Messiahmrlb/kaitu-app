import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TextField,
  Checkbox,
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
} from '@mui/material';
import { SoilSample } from '../types';
import { TEST_ITEMS, DISTURBED_APPLICABLE_TESTS } from '../constants';
import { setDisturbance, isPermQuickConflict, isQuickShearBothConflict } from '../utils';
import { conflictBg } from '../theme';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

/**
 * 冻结首列（土号）样式：横向滚动时始终贴左可见。
 * - 表头格用 STICKY_HEAD（zIndex 更高，盖住竖向吸顶的表头与其它行）
 * - 数据格用 STICKY_BODY（盖住横向滚动的内容，但不挡表头）
 * 必须显式背景色，否则滑动过去的内容会透显出来。
 */
const STICKY_BODY = {
  position: 'sticky' as const,
  left: 0,
  zIndex: 1,
  backgroundColor: 'background.paper',
  borderRight: '1px solid',
  borderColor: 'divider',
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)',
};
const STICKY_HEAD = {
  ...STICKY_BODY,
  zIndex: 3,
  backgroundColor: 'background.default',
};

/** 矩阵缩放范围：MIN_SCALE = 缩小下限（一屏内看更多列），1 = 原始大小，MAX_SCALE = 放大上限（字更大好点按）。
 *  按钮调节夹紧在此区间；手机屏小，主要用 <1 的缩放把整张矩阵塞进一屏。 */
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
/** 每次点击 －/＋ 的步进 */
const SCALE_STEP = 0.25;

interface Props {
  open: boolean;
  /** 当前记录的全部土样（只读来源，保存前不修改） */
  samples: SoilSample[];
  /** 保存时回传改动后的土样列表 */
  onSave: (samples: SoilSample[]) => void;
  onClose: () => void;
  /** 全局自定义/额外试验项目名称列表 */
  customTestItems: string[];
  /** 自定义试验项目列表变化时的回调（由父组件持久化） */
  onCustomTestItemsChange: (items: string[]) => void;
}

/**
 * 批量勾选对话框：以「土号 × 扰动土/试验项目」矩阵形式，对全部土样一次性勾选
 * 扰动土 与 要求实验项目，并提供逐列「全选」快捷操作与两条联动规则。
 */
export default function BatchCheckDialog({
  open,
  samples,
  onSave,
  onClose,
  customTestItems,
  onCustomTestItemsChange,
}: Props) {
  // 工作副本（克隆），取消时丢弃，不影响外部 samples
  const [working, setWorking] = useState<SoilSample[]>([]);

  // 矩阵缩放状态（按钮调节）。setZoom 夹紧在 [MIN_SCALE, MAX_SCALE] 区间。
  const [scale, setScale] = useState(1);
  const setZoom = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    setScale(clamped);
  };

  // 自定义试验项目：内联新增 / 内联删除确认（替代原生 prompt/confirm，移动端更顺手）
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // 打开时从 props 重新初始化工作副本，并把缩放复位为 1（每次进入都从原始大小开始）
  useEffect(() => {
    if (open) {
      setWorking(
        samples.map((s) => ({ ...s, testItems: [...(s.testItems ?? [])] })),
      );
      setZoom(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 切换单行的扰动土：勾选->扰动(联动颗分)，取消->原状(联动摘除颗分) */
  const toggleDisturbance = (id: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return setDisturbance(next, checked ? '扰动' : '原状');
      }),
    );

  /** 扰动土「全选」表头：勾选->全部扰动(联动颗分)，取消->全部原状(联动摘除颗分) */
  const allDisturbed =
    working.length > 0 && working.every((s) => s.disturbance === '扰动');
  const toggleAllDisturbance = (checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return setDisturbance(next, checked ? '扰动' : '原状');
      }),
    );

  /** 切换单行某试验项目 */
  const toggleItem = (id: string, item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = s.testItems.includes(item);
        if (checked && !has)
          return { ...s, testItems: [...s.testItems, item] };
        if (!checked && has)
          return { ...s, testItems: s.testItems.filter((t) => t !== item) };
        return s;
      }),
    );

  /** 某试验项目「全选」表头状态：
   *  - 对扰动土也适用的项（物性/颗分）：全部土样都勾上才算全选；
   *  - 其余项（固结/渗透/快剪/三轴）：只看原状土，扰动土不参与判定（全选时会跳过扰动土）。 */
  const itemAllChecked = (item: string) => {
    const relevant = DISTURBED_APPLICABLE_TESTS.includes(item)
      ? working
      : working.filter((s) => s.disturbance !== '扰动');
    return relevant.length > 0 && relevant.every((s) => s.testItems.includes(item));
  };
  /** 某试验项目「全选」表头：勾选->对适用的土样全部添加（对扰动土不适用的项跳过扰动土），取消->全部移除 */
  const toggleAllItem = (item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const has = s.testItems.includes(item);
        // 勾选时：对扰动土不适用的试验项目（除 物性/颗分 外）跳过扰动土
        const applicableToDisturbed = DISTURBED_APPLICABLE_TESTS.includes(item);
        if (checked && !has) {
          if (!applicableToDisturbed && s.disturbance === '扰动') return s;
          return { ...s, testItems: [...s.testItems, item] };
        }
        if (!checked && has) return { ...s, testItems: s.testItems.filter((t) => t !== item) };
        return s;
      }),
    );

  /** 切换单行某自定义试验项目：写入/移除 sample.otherTestItems（不进 40 列主表） */
  const toggleOtherItem = (id: string, item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = (s.otherTestItems ?? []).includes(item);
        if (checked && !has)
          return { ...s, otherTestItems: [...(s.otherTestItems ?? []), item] };
        if (!checked && has)
          return {
            ...s,
            otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== item),
          };
        return s;
      }),
    );

  /** 某自定义试验项目「全选」表头：勾选->全部添加，取消->全部移除 */
  const otherItemAllChecked = (item: string) =>
    working.length > 0 && working.every((s) => (s.otherTestItems ?? []).includes(item));
  const toggleAllOtherItem = (item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const has = (s.otherTestItems ?? []).includes(item);
        if (checked && !has)
          return { ...s, otherTestItems: [...(s.otherTestItems ?? []), item] };
        if (!checked && has)
          return {
            ...s,
            otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== item),
          };
        return s;
      }),
    );

  /** 内联提交新增自定义试验项目（空值或已存在则忽略） */
  const submitNewItem = () => {
    const name = newItemName.trim();
    setNewItemName('');
    setAdding(false);
    if (!name) return;
    if (customTestItems.includes(name)) return;
    onCustomTestItemsChange([...customTestItems, name]);
  };

  /** 内联确认删除自定义试验项目：从全局列表移除，并同步取消当前记录中已勾选该项的土样 */
  const doRemoveItem = (name: string) => {
    onCustomTestItemsChange(customTestItems.filter((x) => x !== name));
    setWorking((prev) =>
      prev.map((s) => ({ ...s, otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== name) })),
    );
    setConfirmDelete(null);
  };

  const handleSave = () => {
    onSave(working);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>批量勾选（试验项目 / 扰动土）</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1.7 }}>
          逐列「全选」可快速应用到全部土样；勾选「扰动土」会自动联动「颗分」。
          对扰动土不适用的试验项目（固结/渗透/快剪/三轴）点「全选」时自动跳过扰动土（仅勾原状）。
          同时含「渗透+快剪」或「饱固快剪+自然快剪」的行将
          <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}> 标红 </Box>
          （可能的冲突组合）。
        </Typography>
        {/* 说明文字独占一行：与下方按钮/表单上下排布，避免窄屏被挤成竖排 */}
        <Box sx={{ display: 'block', mb: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 1, lineHeight: 1.7 }}
          >
            自定义/额外试验项目为全局项，可在下方表格逐列勾选，或内联新增。
          </Typography>
          {adding ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
              <TextField
                autoFocus
                size="small"
                label="自定义试验项目名称"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewItem();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setNewItemName('');
                  }
                }}
                sx={{ flex: '1 1 180px', minWidth: 0 }}
              />
              <Button size="small" variant="contained" onClick={submitNewItem}>
                添加
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setAdding(false);
                  setNewItemName('');
                }}
              >
                取消
              </Button>
            </Box>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAdding(true)}
            >
              添加自定义试验项目
            </Button>
          )}
        </Box>
        {/* 缩放说明同样独占一行：窄屏下不与缩放按钮抢宽度（避免说明被压成竖排） */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 1,
            mb: 1,
            mt: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            点击 － 缩小可在一屏内看到更多列；＋ 放大让字/复选框更大好点按。当前缩放 {(scale * 100).toFixed(0)}%
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              aria-label="缩小表格（一屏看更多）"
              disabled={scale <= MIN_SCALE + 1e-6}
              onClick={() => setZoom(scale - SCALE_STEP)}
            >
              <ZoomOutIcon />
            </IconButton>
            <IconButton
              size="small"
              aria-label="放大表格"
              disabled={scale >= MAX_SCALE - 1e-6}
              onClick={() => setZoom(scale + SCALE_STEP)}
            >
              <ZoomInIcon />
            </IconButton>
            <Button
              size="small"
              variant="text"
              disabled={Math.abs(scale - 1) < 1e-6}
              onClick={() => setZoom(1)}
            >
              重置
            </Button>
          </Box>
        </Box>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader size="small" sx={{ zoom: scale, tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...STICKY_HEAD, minWidth: 90 }}>
                  <Typography variant="caption" fontWeight={700}>
                    土号
                  </Typography>
                </TableCell>
                <TableCell align="center" sx={{ minWidth: 90 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0,
                    }}
                  >
                    <Typography variant="caption" fontWeight={700}>
                      扰动土
                    </Typography>
                    <Checkbox
                      size="small"
                      checked={allDisturbed}
                      onChange={(e) => toggleAllDisturbance(e.target.checked)}
                    />
                  </Box>
                </TableCell>
                {TEST_ITEMS.map((item) => (
                  <TableCell key={item} align="center" sx={{ minWidth: 78 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0,
                      }}
                    >
                      <Typography variant="caption" fontWeight={700}>
                        {item}
                      </Typography>
                      <Checkbox
                        size="small"
                        checked={itemAllChecked(item)}
                        onChange={(e) => toggleAllItem(item, e.target.checked)}
                      />
                    </Box>
                  </TableCell>
                ))}
                {customTestItems.map((item) => (
                  <TableCell
                    key={`other-${item}`}
                    align="center"
                    sx={{ minWidth: 90 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.25,
                          maxWidth: 160,
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="secondary.main"
                          noWrap
                          title={item}
                        >
                          {item}
                        </Typography>
                        {confirmDelete === item ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                            <Typography
                              variant="caption"
                              color="error.main"
                              sx={{ fontSize: 11, whiteSpace: 'nowrap' }}
                            >
                              删除?
                            </Typography>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => doRemoveItem(item)}
                              sx={{ p: 0.25 }}
                              aria-label={`确认删除 ${item}`}
                            >
                              <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setConfirmDelete(null)}
                              sx={{ p: 0.25 }}
                              aria-label="取消删除"
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          <IconButton
                            size="small"
                            color="secondary"
                            onClick={() => setConfirmDelete(item)}
                            sx={{ p: 0.25 }}
                            aria-label={`删除自定义项 ${item}`}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                      <Checkbox
                        size="small"
                        checked={otherItemAllChecked(item)}
                        onChange={(e) => toggleAllOtherItem(item, e.target.checked)}
                      />
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {working.map((s) => {
                const conflict = isPermQuickConflict(s) || isQuickShearBothConflict(s);
                return (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ bgcolor: conflict ? conflictBg : undefined }}
                  >
                    <TableCell
                      sx={{
                        ...STICKY_BODY,
                        fontWeight: 600,
                        backgroundColor: conflict ? conflictBg : 'background.paper',
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <span>{s.soilNumber || '(未填)'}</span>
                        {conflict && (
                          <Chip
                            size="small"
                            color="error"
                            icon={<WarningAmberIcon style={{ fontSize: 14 }} />}
                            label="冲突"
                            sx={{ alignSelf: 'flex-start' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        size="small"
                        checked={s.disturbance === '扰动'}
                        onChange={(e) =>
                          toggleDisturbance(s.id, e.target.checked)
                        }
                      />
                    </TableCell>
                    {TEST_ITEMS.map((item) => (
                      <TableCell key={item} align="center">
                        <Checkbox
                          size="small"
                          checked={s.testItems.includes(item)}
                          onChange={(e) =>
                            toggleItem(s.id, item, e.target.checked)
                          }
                        />
                      </TableCell>
                    ))}
                    {customTestItems.map((item) => (
                      <TableCell key={`other-${item}`} align="center">
                        <Checkbox
                          size="small"
                          checked={(s.otherTestItems ?? []).includes(item)}
                          onChange={(e) =>
                            toggleOtherItem(s.id, item, e.target.checked)
                          }
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {working.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            当前没有土样，请先在编辑界面添加土样。
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSave}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
