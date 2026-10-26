import { useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { SoilRecord } from '../types';
import { parseDeliveryFile, ImportedRecord } from '../importDelivery';
import { isChunkLoadError } from '../pwaRecovery';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 确认导入：传入解析出的全部记录 */
  onImport: (records: SoilRecord[]) => void;
}

/**
 * 导入送样单对话框。
 *
 * 流程：选择 .xlsx/.xlsm 文件 → 读取为 ArrayBuffer → parseDeliveryFile 解析 →
 * 预览识别到的孔号与土样数 → 确认后回调 onImport，由上层持久化。
 */
export default function ImportDeliveryDialog({ open, onClose, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportedRecord[]>([]);
  const [resultWarnings, setResultWarnings] = useState<string[]>([]);

  const reset = () => {
    setError('');
    setPreview([]);
    setResultWarnings([]);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError('');
    setPreview([]);
    setResultWarnings([]);
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseDeliveryFile(buffer);
      setResultWarnings(result.warnings);
      if (result.records.length === 0) {
        const msg = result.warnings.length
          ? result.warnings.join('；')
          : '未在文件中识别到送样单工作表，请确认文件是否为土工试验送样单。';
        setError(msg);
      } else {
        setPreview(result.records);
      }
    } catch (e: any) {
      setError(
        isChunkLoadError(e)
          ? '解析组件加载失败（页面是旧版本，脚本已被新版本替换）。正在自动刷新，请稍候重新导入。'
          : '解析失败：' + (e?.message ?? String(e)),
      );
    } finally {
      setLoading(false);
    }
  };

  // 解析告警聚合（文件级 resultWarnings + 各送样单块 warnings），醒目展示
  const allWarnings = [...resultWarnings, ...preview.flatMap((r) => r.warnings)];

  const handleImport = () => {
    onImport(preview.map((r) => r.record));
    reset();
    onClose();
  };

  const totalSamples = preview.reduce((a, r) => a + r.sampleCount, 0);

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>导入送样单</DialogTitle>
      <DialogContent>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            选择送样单文件
          </Button>
          {loading && <CircularProgress size={20} />}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {allWarnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              解析提示（{allWarnings.length} 条）
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {allWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </Box>
          </Alert>
        )}

        {preview.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              识别到 {preview.length} 份送样单，共 {totalSamples} 条土样：
            </Typography>
            <List dense disablePadding>
              {preview.map((r, i) => (
                <Box key={r.sheetName}>
                  {i > 0 && <Divider component="li" />}
                  <ListItem divider={i < preview.length - 1} alignItems="flex-start">
                    <ListItemText
                      primary={`孔号 ${r.holeCode || '（空）'} ｜ ${r.sampleCount} 条土样 ｜ ${r.record.name}`}
                      secondary={`来源工作表：${r.sheetName}`}
                    />
                  </ListItem>
                </Box>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={loading || preview.length === 0}
        >
          确认导入
        </Button>
      </DialogActions>
    </Dialog>
  );
}
