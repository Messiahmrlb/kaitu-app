import { useEffect, useRef, useState } from 'react';
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
  Chip,
  Divider,
  FormControl,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
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
import { setDisturbance, disturbedTestConflicts } from '../utils';
import AddIcon from '@mui/icons-material/Add';

interface Props {
  open: boolean;
  /** 当前记录的模式，决定目力鉴别土类选项 */
  mode: RecordMode;
  /** 待编辑的土样；新建时为 null */
  initial: SoilSample | null;
  onSave: (sample: SoilSample) => void;
  onClose: () => void;
  /** 全局自定义/额外试验项目名称列表 */
  customTestItems: string[];
  /** 新增一个自定义试验项目名称（name 可能含空白，组件内部会 trim 去重） */
  onAddCustomTestItem: (name: string) => void;
  /** 删除一个全局自定义试验项目名称 */
  onRemoveCustomTestItem?: (name: string) => void;
  /** 打开时自动滚动并聚焦到该字段（用于从卡片 IL/Ip 格点击直接进入录入，避免手机上滑误触试验项目） */
  autoFocusField?: 'il' | 'ip';
  /** 对话框标题：默认「土样录入」，插入场景传「插入土样」 */
  title?: string;
}

/** 单条土样录入对话框：覆盖全部字段，含仅 App 内显示的 IL / Ip */
export default function SampleDialog({
  open,
  mode,
  initial,
  onSave,
  onClose,
  customTestItems,
  onAddCustomTestItem,
  onRemoveCustomTestItem,
  autoFocusField,
  title = '土样录入',
}: Props) {
  const [sample, setSample] = useState<SoilSample>(initial ?? ({} as SoilSample));

  // 底部 IL/Ip 输入框的 DOM 引用，用于点击卡片后自动滚动 + 聚焦
  const ilRef = useRef<HTMLInputElement>(null);
  const ipRef = useRef<HTMLInputElement>(null);

  // 打开时同步初始数据；若指定 autoFocusField，则在渲染后滚到该字段并聚焦
  useEffect(() => {
    if (open) {
      setSample(initial ?? ({} as SoilSample));
      if (autoFocusField) {
        const id = window.setTimeout(() => {
          const el = autoFocusField === 'il' ? ilRef.current : ipRef.current;
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus({ preventScroll: true });
          }
        }, 80);
        return () => window.clearTimeout(id);
      }
    }
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

  // 扰动土试验项目冲突：扰动土仅适用 物性/颗分，勾选 固结/渗透/剪切/三轴 等即提示
  const disturbedConflicts = disturbedTestConflicts(sample);

  const set = (key: keyof SoilSample, v: string | string[]) =>
    setSample((prev) => ({ ...prev, [key]: v }));

  const handleSave = () => onSave(sample);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
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

          {/* 额外 / 自定义试验项目：勾选写入 sample.otherTestItems，不进 40 列主表，导出到「额外试验项目」工作表 */}
          <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 2, mt: 1 }}>
            <ChipMultiSelect
              label="额外/自定义试验项目（多选）"
              options={customTestItems}
              value={sample.otherTestItems ?? []}
              onChange={(v) => set('otherTestItems', v)}
            />
            {customTestItems.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {customTestItems.map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={item}
                    color="secondary"
                    variant="outlined"
                    onDelete={() => {
                      if (
                        !window.confirm(
                          `删除自定义试验项目「${item}」？\n将从全局列表移除；当前土样中已勾选该项会同步取消。`,
                        )
                      )
                        return;
                      onRemoveCustomTestItem?.(item);
                      set('otherTestItems', (sample.otherTestItems ?? []).filter((t) => t !== item));
                    }}
                  />
                ))}
              </Box>
            )}
            {customTestItems.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                暂无自定义项，可在下方添加。
              </Typography>
            )}
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              sx={{ mt: 1 }}
              onClick={() =>
                onAddCustomTestItem(window.prompt('输入自定义试验项目名称') ?? '')
              }
            >
              添加自定义试验项目
            </Button>
          </Box>

          {/* 仅 App 内显示/保存，不写入导出表格 */}
          <Box sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 2, mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              以下两项（液性指数 IL / 塑性指数 Ip）仅 App 内显示与本地保存，导出 xlsx 时不写入表格。
            </Typography>
            <TextField
              label="塑性指数 Ip"
              type="number"
              fullWidth
              margin="normal"
              inputRef={ipRef}
              value={sample.ip ?? ''}
              onChange={(e) => set('ip', e.target.value)}
              error={ipOutOf}
              helperText={ipOutOf ? '超出规定值（4.0–25.0）' : '规定范围 4.0–25.0'}
            />
            <TextField
              label="液性指数 IL"
              type="number"
              fullWidth
              margin="normal"
              inputRef={ilRef}
              value={sample.il ?? ''}
              onChange={(e) => set('il', e.target.value)}
              error={ilOutOf}
              helperText={ilOutOf ? '超出规定值（0.10–1.50）' : '规定范围 0.10–1.50'}
            />
          </Box>

          {/* 扰动土 / 粉砂判定：二选一单选（绑定本地 sample 状态） */}
          <Box
            sx={{
              borderTop: '1px dashed',
              borderColor: 'divider',
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
                onChange={(_e, v: string | null) =>
                  v && setSample((prev) => setDisturbance(prev, v as '原状' | '扰动'))
                }
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

          {/* 扰动土试验项目冲突提示：扰动土不应做 固结/渗透/剪切/三轴，勾选其一即提示 */}
          {sample.disturbance === '扰动' && disturbedConflicts.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              扰动土不应做以下试验项目：{disturbedConflicts.join('、')}。扰动土仅适用「物性」「颗分」，请取消上述勾选。
            </Alert>
          )}
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
