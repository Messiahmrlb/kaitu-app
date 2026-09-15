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
} from '@mui/material';
import { SoilSample } from '../types';
import { TEST_ITEMS } from '../constants';
import { coupleDisturbance, isPermQuickConflict } from '../utils';

/** 渗透/快剪冲突行高亮底色（MUI error.light） */
const CONFLICT_BG = '#ffebee';

interface Props {
  open: boolean;
  /** 当前记录的全部土样（只读来源，保存前不修改） */
  samples: SoilSample[];
  /** 保存时回传改动后的土样列表 */
  onSave: (samples: SoilSample[]) => void;
  onClose: () => void;
}

/**
 * 批量勾选对话框：以「土号 × 扰动土/试验项目」矩阵形式，对全部土样一次性勾选
 * 扰动土 与 要求实验项目，并提供逐列「全选」快捷操作与两条联动规则。
 */
export default function BatchCheckDialog({ open, samples, onSave, onClose }: Props) {
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

  /** 切换单行的扰动土：勾选->扰动(联动颗分)，取消->原状(不动 testItems) */
  const toggleDisturbance = (id: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return checked ? coupleDisturbance(next) : next;
      }),
    );

  /** 扰动土「全选」表头：勾选->全部扰动(联动颗分)，取消->全部原状(不动 testItems) */
  const allDisturbed =
    working.length > 0 && working.every((s) => s.disturbance === '扰动');
  const toggleAllDisturbance = (checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return checked ? coupleDisturbance(next) : next;
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
          同时含「渗透」与「快剪」的行将以红色标示（可能的冲突组合）。
        </Typography>
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 90, fontWeight: 700 }}>土号</TableCell>
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
              </TableRow>
            </TableHead>
            <TableBody>
              {working.map((s) => {
                const conflict = isPermQuickConflict(s);
                return (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ bgcolor: conflict ? CONFLICT_BG : undefined }}
                  >
                    <TableCell sx={{ fontWeight: 600 }}>
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
