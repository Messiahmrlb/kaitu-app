import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Box,
  Typography,
  Divider,
  FormControl,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { SoilSample, RecordMode } from '../types';
import {
  INCLUSIONS,
  SOIL_STATES,
  TEST_ITEMS,
  soilTypeOptions,
  DISTURBANCE,
  SILTY_SAND,
} from '../constants';
import ChipMultiSelect from './ChipMultiSelect';

interface Props {
  open: boolean;
  /** 当前记录的模式，决定目力鉴别土类选项 */
  mode: RecordMode;
  /** 待编辑的土样；新建时为 null */
  initial: SoilSample | null;
  onSave: (sample: SoilSample) => void;
  onClose: () => void;
}

/** 单条土样录入对话框：覆盖全部字段，含仅 App 内显示的 IL / Ip */
export default function SampleDialog({ open, mode, initial, onSave, onClose }: Props) {
  const [sample, setSample] = useState<SoilSample>(initial ?? ({} as SoilSample));

  // 打开时同步初始数据
  useEffect(() => {
    if (open) setSample(initial ?? ({} as SoilSample));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const soilType = soilTypeOptions(mode);

  // 液性指数 IL / 塑性指数 Ip 取值范围校验（超出规定值则提示）
  const ilNum = parseFloat(sample.il ?? '');
  const ilOutOf =
    (sample.il ?? '').trim() !== '' && !Number.isNaN(ilNum) && (ilNum < 0.1 || ilNum > 1.5);
  const ipNum = parseFloat(sample.ip ?? '');
  const ipOutOf =
    (sample.ip ?? '').trim() !== '' && !Number.isNaN(ipNum) && (ipNum < 4.0 || ipNum > 25.0);

  const set = (key: keyof SoilSample, v: string | string[]) =>
    setSample((prev) => ({ ...prev, [key]: v }));

  const handleSave = () => onSave(sample);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>土样录入</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={0}>
          <TextField
            label="土号"
            fullWidth
            margin="normal"
            value={sample.soilNumber ?? ''}
            onChange={(e) => set('soilNumber', e.target.value)}
          />
          <TextField
            label="野外记录"
            fullWidth
            margin="normal"
            multiline
            minRows={2}
            value={sample.fieldRecord ?? ''}
            onChange={(e) => set('fieldRecord', e.target.value)}
          />
          <TextField
            label="取样深度"
            fullWidth
            margin="normal"
            value={sample.sampleDepth ?? ''}
            onChange={(e) => set('sampleDepth', e.target.value)}
          />
          <TextField
            label="取样标高"
            fullWidth
            margin="normal"
            value={sample.sampleElevation ?? ''}
            onChange={(e) => set('sampleElevation', e.target.value)}
          />
          <TextField
            label="颜色"
            fullWidth
            margin="normal"
            value={sample.color ?? ''}
            onChange={(e) => set('color', e.target.value)}
          />
          <TextField
            label="气味"
            fullWidth
            margin="normal"
            value={sample.smell ?? ''}
            onChange={(e) => set('smell', e.target.value)}
          />

          <ChipMultiSelect
            label="目力鉴别土类（多选，按所选格式）"
            options={soilType}
            value={sample.soilType ?? []}
            onChange={(v) => set('soilType', v)}
          />
          <ChipMultiSelect
            label="夹杂物（多选）"
            options={INCLUSIONS}
            value={sample.inclusions ?? []}
            onChange={(v) => set('inclusions', v)}
          />
          <ChipMultiSelect
            label="土样情况（多选）"
            options={SOIL_STATES}
            value={sample.soilState ?? []}
            onChange={(v) => set('soilState', v)}
          />
          <TextField
            label="土样情况-备注"
            fullWidth
            margin="normal"
            value={sample.soilStateNote ?? ''}
            onChange={(e) => set('soilStateNote', e.target.value)}
          />
          <ChipMultiSelect
            label="要求实验项目（多选）"
            options={TEST_ITEMS}
            value={sample.testItems ?? []}
            onChange={(v) => set('testItems', v)}
          />

          {/* 仅 App 内显示/保存，不写入导出表格 */}
          <Box sx={{ borderTop: '1px dashed #ccc', pt: 2, mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              以下两项（液性指数 IL / 塑性指数 Ip）仅 App 内显示与本地保存，导出 xlsx 时不写入表格。
            </Typography>
            <TextField
              label="液性指数 IL"
              type="number"
              fullWidth
              margin="normal"
              value={sample.il ?? ''}
              onChange={(e) => set('il', e.target.value)}
              error={ilOutOf}
              helperText={ilOutOf ? '超出规定值（0.10–1.50）' : '规定范围 0.10–1.50'}
            />
            <TextField
              label="塑性指数 Ip"
              type="number"
              fullWidth
              margin="normal"
              value={sample.ip ?? ''}
              onChange={(e) => set('ip', e.target.value)}
              error={ipOutOf}
              helperText={ipOutOf ? '超出规定值（4.0–25.0）' : '规定范围 4.0–25.0'}
            />
          </Box>

          {/* 扰动土 / 粉砂判定：二选一单选（绑定本地 sample 状态） */}
          <Box
            sx={{
              borderTop: '1px dashed #ccc',
              pt: 2,
              mt: 1,
              display: 'flex',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            <FormControl component="fieldset">
              <Typography variant="caption" color="text.secondary">
                扰动土（原状/扰动）
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={sample.disturbance ?? '原状'}
                onChange={(_e, v: string | null) => v && set('disturbance', v)}
              >
                {DISTURBANCE.map((d) => (
                  <ToggleButton key={d} value={d}>
                    {d}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>

            <FormControl component="fieldset">
              <Typography variant="caption" color="text.secondary">
                粉砂判定（三角形/空心圆/空）
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={sample.siltySand ?? 'none'}
                onChange={(_e, v: string | null) => v && set('siltySand', v)}
              >
                {SILTY_SAND.map((o) => (
                  <ToggleButton key={o.value} value={o.value}>
                    {o.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </FormControl>
          </Box>
        </Stack>
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
