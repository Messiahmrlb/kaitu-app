import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack } from '@mui/material';
import { RecordMode } from '../types';

interface Props {
  open: boolean;
  /** 选择格式后回调 */
  onSelect: (mode: RecordMode) => void;
  onClose: () => void;
}

/**
 * 新建记录时强制先选择鉴别格式（A 普通目力鉴别 / B 三角坐标定名）。
 * 该选择决定「目力鉴别土类」的可选项与导出文档中显示的土名。
 */
export default function ModeSelectDialog({ open, onSelect, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>选择鉴别格式</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="contained" onClick={() => onSelect('A')}>
            普通目力鉴别
            <br />
            <span style={{ fontSize: 12, fontWeight: 400 }}>
              中砂 / 细砂 / 粉砂 / 粉土 / 粉质黏土 / 黏土
            </span>
          </Button>
          <Button variant="contained" color="secondary" onClick={() => onSelect('B')}>
            三角坐标定名
            <br />
            <span style={{ fontSize: 12, fontWeight: 400 }}>
              粉砂 / 轻粉质壤土 / 中粉质壤土 / 重粉质壤土 / 粉粘土 / 粘土
            </span>
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
      </DialogActions>
    </Dialog>
  );
}
