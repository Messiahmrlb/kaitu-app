import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItem,
  ListItemButton,
  TextField,
  Typography,
} from '@mui/material';
import type { SoilRecord } from '../types';
import { RADIUS } from '../theme';
import { todayStr } from '../utils';

interface Props {
  open: boolean;
  mode: 'pdf' | 'xlsx';
  records: SoilRecord[];
  onClose: () => void;
  /** 导出回传：selected 为勾选记录；openDateOverride 仅 PDF 模式使用（可选日期覆盖） */
  onExport: (selected: SoilRecord[], openDateOverride: string) => void | Promise<void>;
}

/** 孔号展示名：空孔号统一用「未命名孔」 */
function holeLabel(record: SoilRecord): string {
  return (record.engineering?.holeCode ?? '').trim() || '未命名孔';
}

/**
 * 勾选式导出对话框。
 *
 * - 每次打开默认全选，关闭后清空选择；
 * - 支持全选 / 半选 / 全不选，列表整行可点；
 * - PDF 多孔合并为一个文件，xlsx 每孔一个文件，说明文案随 mode 切换。
 */
export default function ExportSelectDialog({ open, mode, records, onClose, onExport }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  /** PDF 模式可选：统一本次导出的开土日期（留空按各记录自身日期） */
  const [dateOverride, setDateOverride] = useState('');

  // 打开时默认全选、日期默认当天；关闭时重置，避免下次打开残留上次的勾选
  useEffect(() => {
    if (open) {
      setSelectedIds(records.map((r) => r.id));
      setExporting(false);
      setDateOverride(todayStr());
    } else {
      setSelectedIds([]);
      setExporting(false);
      setDateOverride('');
    }
    // 仅在开关状态变化时重置；records 变化不应打断用户正在进行的勾选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const selected = records.filter((r) => selectedSet.has(r.id));
  const selectedCount = selected.length;
  const totalCount = records.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const indeterminate = selectedCount > 0 && selectedCount < totalCount;

  const toggleOne = (id: string): void => {
    if (exporting) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = (): void => {
    if (exporting || totalCount === 0) return;
    setSelectedIds(allSelected ? [] : records.map((r) => r.id));
  };

  const handleClose = (): void => {
    if (exporting) return;
    setSelectedIds([]);
    onClose();
  };

  const handleExport = async (): Promise<void> => {
    if (exporting || selectedCount === 0) return;
    setExporting(true);
    try {
      await onExport(selected, mode === 'pdf' ? dateOverride.trim() : '');
    } finally {
      setExporting(false);
    }
  };

  const title = mode === 'pdf' ? '导出 PDF' : '导出电子表格';
  const hint =
    mode === 'pdf'
      ? '多个孔会合并为一个 PDF；单个孔命名为「日期_孔号.pdf」'
      : '每个孔生成一个独立文件，请允许多个文件下载';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="export-select-title"
    >
      <DialogTitle id="export-select-title">{title}</DialogTitle>
      <DialogContent dividers>
        {totalCount === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              还没有可导出的记录
            </Typography>
          </Box>
        ) : (
          <>
            {/* 全选行：整行可点，Checkbox 三态展示 */}
            <ListItemButton
              dense
              onClick={toggleAll}
              disabled={exporting}
              sx={{ borderRadius: RADIUS.tile, px: 0.5, mb: 0.5 }}
              aria-label={allSelected ? '取消全选' : '全选'}
            >
              <Checkbox
                edge="start"
                checked={allSelected}
                indeterminate={indeterminate}
                tabIndex={-1}
                disableRipple
                inputProps={{ 'aria-label': '全选所有孔' }}
                onClick={(e) => e.stopPropagation()}
                onChange={toggleAll}
                sx={{ py: 0.5 }}
              />
              <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 600 }}>
                已选 {selectedCount} / 共 {totalCount} 个孔
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {allSelected ? '取消全选' : '全选'}
              </Typography>
            </ListItemButton>

            <Divider />

            <List dense disablePadding sx={{ maxHeight: 320, overflowY: 'auto', mt: 0.5 }}>
              {records.map((record) => {
                const checked = selectedSet.has(record.id);
                const date = (record.engineering?.openDate ?? '').trim();
                return (
                  <ListItem key={record.id} disablePadding>
                    <ListItemButton
                      dense
                      onClick={() => toggleOne(record.id)}
                      disabled={exporting}
                      sx={{ borderRadius: RADIUS.tile, px: 0.5, gap: 0.5 }}
                    >
                      <Checkbox
                        edge="start"
                        checked={checked}
                        tabIndex={-1}
                        disableRipple
                        inputProps={{ 'aria-label': `选择孔号 ${holeLabel(record)}` }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOne(record.id)}
                        sx={{ py: 0.5 }}
                      />
                      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                          {holeLabel(record)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {date || '未填写开土日期'}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        土样 {record.samples?.length ?? 0} 条
                      </Typography>
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </>
        )}

        {mode === 'pdf' && totalCount > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography
              variant="caption"
              display="block"
              sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.75 }}
            >
              导出选项
            </Typography>
            <Box
              sx={{
                px: 1.25,
                pt: 1,
                pb: 0.5,
                borderRadius: RADIUS.tile,
                bgcolor: 'background.default',
                border: (t) => `1px solid ${t.palette.divider}`,
              }}
            >
              <TextField
                label="统一开土日期（可选）"
                type="date"
                size="small"
                fullWidth
                value={dateOverride}
                onChange={(e) => setDateOverride(e.target.value)}
                disabled={exporting}
                InputLabelProps={{ shrink: true }}
                helperText="留空按各记录自身日期；填写后本次导出的页内与文件名日期都用它"
              />
            </Box>
          </Box>
        )}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          {hint}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={exporting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleExport()}
          disabled={selectedCount === 0 || exporting}
        >
          {exporting ? '导出中…' : `导出 ${selectedCount} 个孔`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
