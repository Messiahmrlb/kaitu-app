import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
} from '@mui/material';
import {
  CMA_DEFAULT,
  CMA_LIMITS,
  CmaHeaderSettings,
  describeCmaChanges,
  normalizeCmaHeader,
} from '../cmaHeader';
import { RADIUS } from '../theme';

interface Props {
  open: boolean;
  /** 当前生效的设置（用于对比与「无改动」判定） */
  value: CmaHeaderSettings;
  onClose: () => void;
  /** 确认后落盘；由父组件负责持久化并更新内存态 */
  onSave: (next: CmaHeaderSettings) => Promise<void> | void;
}

/**
 * 「CMA 设置」对话框：维护 PDF 页眉的版本行与文件编号。
 *
 * 交互要点（按用户要求）：
 * - 修改保存在本机，之后一直沿用，直到下次修改；
 * - 点「保存修改」后**必须再确认一次**，确认弹窗里列出「旧 → 新」明细；
 * - 内容无改动或存在空值时不允许进入确认步骤。
 */
export default function CmaSettingsDialog({ open, value, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CmaHeaderSettings>(value);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 每次打开都以当前生效值为准，避免残留上次未保存的编辑
  useEffect(() => {
    if (open) {
      setDraft(value);
      setConfirmOpen(false);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const versionEmpty = !draft.versionLine.trim();
  const codeEmpty = !draft.docCode.trim();
  const changes = useMemo(() => describeCmaChanges(value, draft), [value, draft]);
  const canSave = !versionEmpty && !codeEmpty && changes.length > 0;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onSave(normalizeCmaHeader(draft));
      setConfirmOpen(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>CMA 设置</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1.7 }}>
            PDF 首页页眉右侧的两排文字。修改后会保存在本机，并一直用于之后导出的 PDF，直到你下次修改。
          </Typography>

          <TextField
            label="版本行（页眉右上）"
            fullWidth
            margin="normal"
            value={draft.versionLine}
            onChange={(e) => setDraft({ ...draft, versionLine: e.target.value })}
            error={versionEmpty}
            helperText={
              versionEmpty
                ? '不能为空'
                : `建议不超过 ${CMA_LIMITS.versionLine} 字；过长会自动缩小字号以留在纸面内`
            }
            inputProps={{ maxLength: 80 }}
          />

          <TextField
            label="文件编号（页眉右侧）"
            fullWidth
            margin="normal"
            value={draft.docCode}
            onChange={(e) => setDraft({ ...draft, docCode: e.target.value })}
            error={codeEmpty}
            helperText={
              codeEmpty
                ? '不能为空'
                : `建议不超过 ${CMA_LIMITS.docCode} 字；过长会自动缩小字号以留在纸面内`
            }
            inputProps={{ maxLength: 40 }}
          />

          {/* 简易预览：右对齐，与 PDF 页眉位置关系一致 */}
          <Box
            sx={{
              mt: 2,
              p: 1.5,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: RADIUS.tile,
              bgcolor: 'background.default',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              预览
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'right', mt: 0.5, wordBreak: 'break-all' }}>
              {draft.versionLine.trim() || '（版本行）'}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 700, wordBreak: 'break-all' }}>
              {draft.docCode.trim() || '（文件编号）'}
            </Typography>
          </Box>

          <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => setDraft({ ...CMA_DEFAULT })}>
              恢复默认
            </Button>
            {changes.length === 0 && <Chip size="small" label="与当前设置一致" />}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => setConfirmOpen(true)}
          >
            保存修改
          </Button>
        </DialogActions>
      </Dialog>

      {/* 二次确认：列出「旧 → 新」，并说明长期生效 */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>确认修改页眉？</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            保存后，之后导出的所有 PDF 都会使用以下内容，并一直保持到你下次修改：
          </Typography>

          {changes.map((c) => (
            <Box key={c.key} sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                {c.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'text.disabled', textDecoration: 'line-through', wordBreak: 'break-all' }}
              >
                {c.from}
              </Typography>
              <Typography variant="body2" fontWeight={700} sx={{ wordBreak: 'break-all' }}>
                {c.to}
              </Typography>
            </Box>
          ))}

          <Alert severity="info" sx={{ mt: 1 }}>
            设置只保存在本机（这台手机或浏览器）；换设备后需要重新设置。
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={saving}>
            返回修改
          </Button>
          <Button variant="contained" onClick={handleConfirm} disabled={saving}>
            {saving ? '保存中…' : '确认修改'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
