import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
} from '@mui/material';
import { RecordMode } from '../types';

interface Props {
  open: boolean;
  /** 已选择的鉴别格式 A/B，用于提示文案 */
  mode: RecordMode;
  /** 确认：孔号 + 土样数量（已夹紧为 >=1 的整数） */
  onConfirm: (holeCode: string, count: number) => void;
  onClose: () => void;
}

/**
 * 新建记录的第二步：选完鉴别格式后弹出，先填「孔号」与「土样数量」，
 * 确认后由父组件直接生成一份已按孔号编好号的记录，省去再手动批量添加。
 */
export default function NewRecordSetupDialog({ open, mode, onConfirm, onClose }: Props) {
  const [holeCode, setHoleCode] = useState('');
  const [count, setCount] = useState('1');

  // 每次打开重置输入，避免沿用上一次的孔号/数量
  useEffect(() => {
    if (open) {
      setHoleCode('');
      setCount('1');
    }
  }, [open]);

  const handleConfirm = () => {
    const n = Math.max(1, Math.floor(Number(count)) || 1);
    onConfirm(holeCode.trim(), n);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>新建开土记录</DialogTitle>
      <DialogContent>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          {mode === 'A' ? '普通目力鉴别' : '三角坐标定名'}：填写孔号与土样数量，确认后自动生成编好号的土样。
        </Typography>
        <TextField
          label="孔号"
          fullWidth
          margin="normal"
          autoFocus
          value={holeCode}
          onChange={(e) => setHoleCode(e.target.value)}
          placeholder="如 ZK1（可留空）"
        />
        <TextField
          label="土样数量"
          type="number"
          fullWidth
          margin="normal"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          inputProps={{ min: 1 }}
          helperText="将生成 孔号-1 … 孔号-N；孔号为空则 -1 … -N"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleConfirm}>
          生成记录
        </Button>
      </DialogActions>
    </Dialog>
  );
}
