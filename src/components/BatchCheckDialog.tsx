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
  Checkbox,
  Box,
  Typography,
  Button,
  IconButton,
} from '@mui/material';
import { SoilSample } from '../types';
import { TEST_ITEMS } from '../constants';
import { setDisturbance, isPermQuickConflict, isQuickShearBothConflict } from '../utils';
import DeleteIcon from '@mui/icons-material/Delete';

/** 渗透/快剪冲突行高亮底色（MUI error.light） */
const CONFLICT_BG = '#ffebee';

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

  // 打开时从 props 重新初始化工作副本
  useEffect(() => {
    if (open) {
      setWorking(
        samples.map((s) => ({ ...s, testItems: [...(s.testItems ?? [])] })),
      );
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

  /** 某试验项目「全选」表头：勾选->全部添加，取消->全部移除 */
  const itemAllChecked = (item: string) =>
    working.length > 0 && working.every((s) => s.testItems.includes(item));
  const toggleAllItem = (item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const has = s.testItems.includes(item);
        if (checked && !has)
          return { ...s, testItems: [...s.testItems, item] };
        if (!checked && has)
          return { ...s, testItems: s.testItems.filter((t) => t !== item) };
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

  /** 新增一个全局自定义试验项目（空值或已存在则忽略） */
  const addCustomItem = () => {
    const name = (window.prompt('输入自定义试验项目名称') ?? '').trim();
    if (!name) return;
    if (customTestItems.includes(name)) return;
    onCustomTestItemsChange([...customTestItems, name]);
  };

  /** 删除一个全局自定义试验项目：从全局列表移除，并同步取消当前记录中已勾选该项的土样 */
  const removeCustomItem = (name: string) => {
    if (
      !window.confirm(
        `删除自定义试验项目「${name}」？\n将从全局列表移除；当前记录中已勾选该项的土样会同步取消（其他记录不受影响）。`,
      )
    )
      return;
    onCustomTestItemsChange(customTestItems.filter((x) => x !== name));
    setWorking((prev) =>
      prev.map((s) => ({ ...s, otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== name) })),
    );
  };

  const handleSave = () => {
    onSave(working);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>批量勾选（试验项目 / 扰动土）</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          逐列「全选」可快速应用到全部土样；勾选「扰动土」会自动勾选「颗分」。
          同时含「渗透」与「快剪」的行、或同时勾选「饱固快剪」与「自然快剪」的行，
          将以红色标示（可能的冲突组合）。
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            自定义/额外试验项目为全局项，可在下方表格逐列勾选，或点此新增。
          </Typography>
          <Button size="small" variant="outlined" onClick={addCustomItem}>
            ＋ 添加自定义试验项目
          </Button>
        </Box>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...STICKY_HEAD, minWidth: 90, fontWeight: 700 }}>
                  土号
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
                          maxWidth: 120,
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="warning.main"
                          noWrap
                          title={item}
                        >
                          {item}
                        </Typography>
                        <IconButton
                          size="small"
                          color="warning"
                          onClick={() => removeCustomItem(item)}
                          sx={{ p: 0.25 }}
                          aria-label={`删除自定义项 ${item}`}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
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
                    sx={{ bgcolor: conflict ? CONFLICT_BG : undefined }}
                  >
                    <TableCell
                      sx={{
                        ...STICKY_BODY,
                        fontWeight: 600,
                        backgroundColor: conflict ? CONFLICT_BG : 'background.paper',
                      }}
                    >
                      {s.soilNumber || '(未填)'}
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
