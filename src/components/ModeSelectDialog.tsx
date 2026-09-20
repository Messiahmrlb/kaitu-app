import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Paper,
  Box,
  Typography,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import ChangeHistoryIcon from '@mui/icons-material/ChangeHistory';
import { alpha } from '@mui/material/styles';
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
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <Paper
            variant="outlined"
            onClick={() => onSelect('A')}
            sx={{
              p: 2,
              cursor: 'pointer',
              borderRadius: 3,
              borderColor: 'divider',
              transition: 'border-color .2s ease, background-color .2s ease',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CategoryIcon color="primary" />
              <Box>
                <Typography fontWeight={700}>普通目力鉴别</Typography>
                <Typography variant="caption" color="text.secondary">
                  中砂 / 细砂 / 粉砂 / 粉土 / 粉质黏土 / 黏土
                </Typography>
              </Box>
            </Stack>
          </Paper>
          <Paper
            variant="outlined"
            onClick={() => onSelect('B')}
            sx={{
              p: 2,
              cursor: 'pointer',
              borderRadius: 3,
              borderColor: 'divider',
              transition: 'border-color .2s ease, background-color .2s ease',
              '&:hover': {
                borderColor: 'secondary.main',
                bgcolor: (t) => alpha(t.palette.secondary.main, 0.04),
              },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <ChangeHistoryIcon color="secondary" />
              <Box>
                <Typography fontWeight={700}>三角坐标定名</Typography>
                <Typography variant="caption" color="text.secondary">
                  粉砂 / 轻粉质壤土 / 中粉质壤土 / 重粉质壤土 / 粉粘土 / 粘土
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
      </DialogActions>
    </Dialog>
  );
}
