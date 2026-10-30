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
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
} from '@mui/material';
import { SoilSample, RecordMode } from '../types';
import {
  INCLUSIONS,
  SOIL_STATES,
  TEST_ITEMS,
  SHEAR_TEST_KEYS,
  TestColumn,
  soilTypeOptions,
  DISTURBANCE,
  SILTY_SAND,
} from '../constants';
import ChipMultiSelect from './ChipMultiSelect';
import { setDisturbance, disturbedTestConflicts, isPermQuickConflict, isQuickShearBothConflict } from '../utils';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';

/** 从土样卡片信息格点击进入时，需要自动滚动/聚焦的目标字段 */
export type SampleFocusField = 'il' | 'ip' | 'disturbance' | 'siltySand';

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
  /** 打开时自动滚动并聚焦到该字段（从卡片信息格点击进入时用，避免手机上滑误触其他项） */
  autoFocusField?: SampleFocusField;
  /** 对话框标题：默认「土样录入」，插入场景传「插入土样」 */
  title?: string;
  /** 记录级试验列（固结/剪切两列显示名可覆盖，见 constants.recordTestColumns） */
  testColumns?: TestColumn[];
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
  testColumns,
}: Props) {
  const [sample, setSample] = useState<SoilSample>(initial ?? ({} as SoilSample));

  // 试验列：未传时按默认 8 项（向后兼容旧调用）；
  // 显示用 label、存储用 key（固结列显示「回弹压缩」等别名时二者不同）
  const testCols: TestColumn[] = testColumns ?? TEST_ITEMS.map((t) => ({ key: t, label: t }));
  const labelByKey = new Map(testCols.map((c) => [c.key, c.label]));
  const keyByLabel = new Map(testCols.map((c) => [c.label, c.key]));

  // 卡片信息格点击后要定位的 DOM 引用：IL/Ip 是输入框，扰动土/粉砂判定是整组
  const ilRef = useRef<HTMLInputElement>(null);
  const ipRef = useRef<HTMLInputElement>(null);
  const disturbanceRef = useRef<HTMLDivElement>(null);
  const siltySandRef = useRef<HTMLDivElement>(null);

  // 自定义试验项目：内联新增 / 内联删除确认（替代原生 prompt/confirm，保持与批量勾选对话框一致）
  const [newItemName, setNewItemName] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  /** 内联提交新增自定义试验项目（空值则忽略；onAddCustomTestItem 内部已 trim 去重） */
  const submitNewItem = () => {
    const name = newItemName.trim();
    setNewItemName('');
    setAdding(false);
    if (!name) return;
    onAddCustomTestItem(name);
  };

  // 打开时同步初始数据；若指定 autoFocusField，则在渲染后滚到该字段并聚焦
  useEffect(() => {
    if (open) {
      setSample(initial ?? ({} as SoilSample));
      if (autoFocusField) {
        const id = window.setTimeout(() => {
          const isInput = autoFocusField === 'il' || autoFocusField === 'ip';
          const el: HTMLElement | null = isInput
            ? autoFocusField === 'il'
              ? ilRef.current
              : ipRef.current
            : autoFocusField === 'disturbance'
              ? disturbanceRef.current
              : siltySandRef.current;
          if (!el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (isInput) {
            // 输入框聚焦可直接唤起数字键盘
            (el as HTMLInputElement).focus({ preventScroll: true });
          } else {
            // 按钮组：聚焦当前选中项（无选中则第一项），便于继续用键盘/点击调整
            const group = el.querySelector<HTMLElement>('[role="group"]');
            const btn =
              group?.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
              group?.querySelector<HTMLElement>('button');
            btn?.focus({ preventScroll: true });
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

  // 剪切 / 渗透判定冲突：与土样卡片、批量勾选对话框共用同一套判定规则
  const permQuickConflict = isPermQuickConflict(sample);
  const shearBothConflict = isQuickShearBothConflict(sample);
  // 提示里点出具体勾了哪几项，便于对照取消（渗透：垂直/水平；剪切：四种归一名任一）
  const selectedPermItems = (sample.testItems ?? []).filter(
    (t) => t === '垂直渗透' || t === '水平渗透',
  );
  const selectedShearItems = (sample.testItems ?? []).filter((t) =>
    SHEAR_TEST_KEYS.includes(t),
  );

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
            options={testCols.map((c) => c.label)}
            value={(sample.testItems ?? []).map((k) => labelByKey.get(k) ?? k)}
            onChange={(labels) =>
              set(
                'testItems',
                labels.map((l) => keyByLabel.get(l) ?? l),
              )
            }
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
                {customTestItems.map((item) =>
                  confirmDelete === item ? (
                    <Box
                      key={item}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.25,
                        px: 1,
                        py: 0.5,
                        border: '1px solid',
                        borderColor: 'error.main',
                        borderRadius: '8px',
                      }}
                    >
                      <Typography variant="caption" color="error.main">
                        删除?
                      </Typography>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          onRemoveCustomTestItem?.(item);
                          set('otherTestItems', (sample.otherTestItems ?? []).filter((t) => t !== item));
                          setConfirmDelete(null);
                        }}
                        sx={{ p: 0.25 }}
                        aria-label={`确认删除 ${item}`}
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => setConfirmDelete(null)}
                        sx={{ p: 0.25 }}
                        aria-label="取消删除"
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    <Chip
                      key={item}
                      size="small"
                      label={item}
                      color="secondary"
                      variant="outlined"
                      onDelete={() => setConfirmDelete(item)}
                    />
                  ),
                )}
              </Box>
            )}
            {customTestItems.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                暂无自定义项，可在下方添加。
              </Typography>
            )}
            {adding ? (
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <TextField
                  autoFocus
                  size="small"
                  label="自定义试验项目名称"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewItem();
                    if (e.key === 'Escape') {
                      setAdding(false);
                      setNewItemName('');
                    }
                  }}
                  sx={{ flex: '1 1 180px', minWidth: 0 }}
                />
                <Button size="small" variant="contained" onClick={submitNewItem}>
                  添加
                </Button>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setAdding(false);
                    setNewItemName('');
                  }}
                >
                  取消
                </Button>
              </Box>
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                sx={{ mt: 1 }}
                onClick={() => setAdding(true)}
              >
                添加自定义试验项目
              </Button>
            )}
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
            <Box ref={disturbanceRef}>
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
            </Box>

            <Box ref={siltySandRef}>
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
          </Box>

          {/* 扰动土试验项目冲突提示：扰动土不应做 固结/渗透/剪切/三轴，勾选其一即提示 */}
          {sample.disturbance === '扰动' && disturbedConflicts.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              扰动土不应做以下试验项目：{disturbedConflicts.join('、')}。扰动土仅适用「物性」「颗分」，请取消上述勾选。
            </Alert>
          )}

          {/* 剪切 / 渗透判定冲突提示：实时随勾选变化，规则与土样卡片一致 */}
          {permQuickConflict && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {`已同时勾选渗透（${selectedPermItems.join('、')}）与剪切（${selectedShearItems.join('、')}）：两者一般不同时做，请取消其中一项。`}
            </Alert>
          )}

          {shearBothConflict && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              已同时勾选「饱固快剪」与「自然快剪」：两种剪切一般不同时做，请取消其中一项。
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
