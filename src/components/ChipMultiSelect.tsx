import { Box, Chip, Typography } from '@mui/material';

interface Props {
  /** 分组标题 */
  label: string;
  /** 可选项 */
  options: string[];
  /** 已选值 */
  value: string[];
  /** 选中变化回调 */
  onChange: (next: string[]) => void;
}

/**
 * 多选 Chip 组：触屏友好的勾选控件。
 * 点击切换选中态，选中为实心主色，未选中为描边。
 */
export default function ChipMultiSelect({ label, options, value, onChange }: Props) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {options.map((opt) => {
          const selected = value.includes(opt);
          return (
            <Chip
              key={opt}
              label={opt}
              onClick={() => toggle(opt)}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
            />
          );
        })}
      </Box>
    </Box>
  );
}
