import { TextField } from '@mui/material';
import { EngineeringInfo } from '../types';

interface Props {
  value: EngineeringInfo;
  onChange: (next: EngineeringInfo) => void;
}

/** 工程信息表单：工程编号 / 孔号 / 孔口标高 / 开土日期（日期选择器） */
export default function EngineeringInfoForm({ value, onChange }: Props) {
  const set = (key: keyof EngineeringInfo, v: string) =>
    onChange({ ...value, [key]: v });

  return (
    <>
      <TextField
        label="工程编号"
        fullWidth
        margin="normal"
        value={value.projectCode}
        onChange={(e) => set('projectCode', e.target.value)}
      />
      <TextField
        label="孔号"
        fullWidth
        margin="normal"
        value={value.holeCode}
        onChange={(e) => set('holeCode', e.target.value)}
      />
      <TextField
        label="孔口标高(m)"
        fullWidth
        margin="normal"
        value={value.holeElevation}
        onChange={(e) => set('holeElevation', e.target.value)}
      />
      <TextField
        label="开土日期"
        type="date"
        fullWidth
        margin="normal"
        InputLabelProps={{ shrink: true }}
        value={value.openDate}
        onChange={(e) => set('openDate', e.target.value)}
      />
    </>
  );
}
