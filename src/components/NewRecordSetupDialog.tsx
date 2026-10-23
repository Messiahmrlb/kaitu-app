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
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import { RecordMode } from '../types';

interface Props {
  open: boolean;
  /** 已选择的鉴别格式 A/B，用于提示文案 */
  mode: RecordMode;
  /** 确认：孔号 + 原状土样数量 + R 扰动土数量（均已夹紧为 >=0 的整数） */
  onConfirm: (holeCode: string, count: number, rCount: number) => void;
  onClose: () => void;
}

/**
 * 新建记录的第二步：选完鉴别格式后弹出，先填「孔号」与「土样数量」，
 * 确认后由父组件直接生成一份已按孔号编好号的记录，省去再手动批量添加。
 * 勾选「扰动土用 R 表示」后可再填 R 扰动土数量，生成 孔号-R1 … 孔号-Rn（标记为扰动并联动颗分）。
 */
export default function NewRecordSetupDialog({ open, mode, onConfirm, onClose }: Props) {
  const [holeCode, setHoleCode] = useState('');
  const [count, setCount] = useState('1');
  const [useR, setUseR] = useState(false);
  const [rCount, setRCount] = useState('0');

  // 每次打开重置输入，避免沿用上一次的孔号/数量/R 设置
  useEffect(() => {
    if (open) {
      setHoleCode('');
      setCount('1');
      setUseR(false);
      setRCount('0');
    }
  }, [open]);

  const handleConfirm = () => {
    const n = Math.max(0, Math.floor(Number(count)) || 0);
    const r = useR ? Math.max(0, Math.floor(Number(rCount)) || 0) : 0;
    onConfirm(holeCode.trim(), n, r);
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
          label={useR ? '原状土样数量' : '土样数量'}
          type="number"
          fullWidth
          margin="normal"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          inputProps={{ min: 0 }}
          helperText={useR ? '将生成 孔号-1 … 孔号-N' : '将生成 孔号-1 … 孔号-N；孔号为空则 -1 … -N'}
        />
        <Box sx={{ mt: 1 }}>
          <FormControlLabel
            control={<Checkbox checked={useR} onChange={(e) => setUseR(e.target.checked)} />}
            label="扰动土用 R 表示（如 ZK1-R1）"
          />
        </Box>
        {useR && (
          <TextField
            label="R 扰动土数量"
            type="number"
            fullWidth
            margin="normal"
            value={rCount}
            onChange={(e) => setRCount(e.target.value)}
            inputProps={{ min: 0 }}
            helperText="将生成 孔号-R1 … 孔号-Rn，标记为扰动并联动颗分"
          />
        )}
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
