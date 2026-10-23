import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Checkbox,
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
} from '@mui/material';
import { SoilSample } from '../types';
import { TEST_ITEMS, DISTURBED_APPLICABLE_TESTS } from '../constants';
import { setDisturbance, isPermQuickConflict, isQuickShearBothConflict, pinchScale } from '../utils';
import { conflictBg } from '../theme';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

/**
 * 冻结首列（土号）样式：横向滚动时始终贴左可见。
 * - 表头格用 STICKY_HEAD（zIndex 更高，盖住竖向吸顶的表头与其它行）
 * - 数据格用 STICKY_BODY（盖住横向滚动的内容，但不挡表头）
 * 必须显式背景色，否则滑动过去的内容会透显出来。
 */
const STICKY_BODY = {
  position: 'sticky' as const,
  left: 0,
  zIndex: 1,
  backgroundColor: 'background.paper',
  borderRight: '1px solid',
  borderColor: 'divider',
  boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)',
};
const STICKY_HEAD = {
  ...STICKY_BODY,
  zIndex: 3,
  backgroundColor: 'background.default',
};

/** 矩阵缩放范围：1 = 原始大小，4 = 放大 4 倍（双指缩放 / 按钮调节均夹紧在此区间） */
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface Props {
  open: boolean;
  /** 当前记录的全部土样（只读来源，保存前不修改） */
  samples: SoilSample[];
  /** 保存时回传改动后的土样列表 */
  onSave: (samples: SoilSample[]) => void;
  onClose: () => void;
  /** 全局自定义/额外试验项目名称列表 */
  customTestItems: string[];
  /** 自定义试验项目列表变化时的回调（由父组件持久化） */
  onCustomTestItemsChange: (items: string[]) => void;
}

/**
 * 批量勾选对话框：以「土号 × 扰动土/试验项目」矩阵形式，对全部土样一次性勾选
 * 扰动土 与 要求实验项目，并提供逐列「全选」快捷操作与两条联动规则。
 */
export default function BatchCheckDialog({
  open,
  samples,
  onSave,
  onClose,
  customTestItems,
  onCustomTestItemsChange,
}: Props) {
  // 工作副本（克隆），取消时丢弃，不影响外部 samples
  const [working, setWorking] = useState<SoilSample[]>([]);

  // 矩阵缩放状态（双指缩放 / 按钮调节）。scaleRef 用于在原生事件回调里读取最新值，避免闭包过期。
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const setZoom = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    scaleRef.current = clamped;
    setScale(clamped);
  };
  // 滚动容器与表格引用；pinchRef 保存双指手势开始时的基线信息。
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    lastCx: number;
    lastCy: number;
  } | null>(null);

  // 打开时从 props 重新初始化工作副本，并把缩放复位为 1（每次进入都从原始大小开始）
  useEffect(() => {
    if (open) {
      setWorking(
        samples.map((s) => ({ ...s, testItems: [...(s.testItems ?? [])] })),
      );
      setZoom(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * 在滚动容器上挂原生触摸/滚轮监听（passive:false 才能 preventDefault 屏蔽浏览器自身的双指缩放），
   * 实现：双指捏合 -> 缩放表格；双指中心拖动 -> 平移（滚动）表格；Ctrl/⌘ + 滚轮 -> 缩放（桌面/模拟器调试）。
   * 单指仍走浏览器原生滚动，不影响常规上下/左右滑动浏览。
   */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const touchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const touchMid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = touchDist(e.touches);
        const m = touchMid(e.touches);
        pinchRef.current = {
          startDist: d,
          startScale: scaleRef.current,
          lastCx: m.x,
          lastCy: m.y,
        };
      }
    };
    const onMove = (e: TouchEvent) => {
      const g = pinchRef.current;
      if (e.touches.length === 2 && g) {
        e.preventDefault();
        const d = touchDist(e.touches);
        const m = touchMid(e.touches);
        setZoom(pinchScale(g.startScale, g.startDist, d, MIN_SCALE, MAX_SCALE));
        // 双指中心位移 -> 平移表格（反向滚动）
        el.scrollLeft -= m.x - g.lastCx;
        el.scrollTop -= m.y - g.lastCy;
        g.lastCx = m.x;
        g.lastCy = m.y;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      // 桌面/模拟器：Ctrl 或 ⌘ + 滚轮缩放，方便没有触摸屏时验证
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom(scaleRef.current - e.deltaY * 0.01);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
    };
    // 仅依赖 open：打开时容器已挂载、ref 可用；关闭时清理监听。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 切换单行的扰动土：勾选->扰动(联动颗分)，取消->原状(联动摘除颗分) */
  const toggleDisturbance = (id: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return setDisturbance(next, checked ? '扰动' : '原状');
      }),
    );

  /** 扰动土「全选」表头：勾选->全部扰动(联动颗分)，取消->全部原状(联动摘除颗分) */
  const allDisturbed =
    working.length > 0 && working.every((s) => s.disturbance === '扰动');
  const toggleAllDisturbance = (checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const next: SoilSample = { ...s, disturbance: checked ? '扰动' : '原状' };
        return setDisturbance(next, checked ? '扰动' : '原状');
      }),
    );

  /** 切换单行某试验项目 */
  const toggleItem = (id: string, item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = s.testItems.includes(item);
        if (checked && !has)
          return { ...s, testItems: [...s.testItems, item] };
        if (!checked && has)
          return { ...s, testItems: s.testItems.filter((t) => t !== item) };
        return s;
      }),
    );

  /** 某试验项目「全选」表头状态：
   *  - 对扰动土也适用的项（物性/颗分）：全部土样都勾上才算全选；
   *  - 其余项（固结/渗透/快剪/三轴）：只看原状土，扰动土不参与判定（全选时会跳过扰动土）。 */
  const itemAllChecked = (item: string) => {
    const relevant = DISTURBED_APPLICABLE_TESTS.includes(item)
      ? working
      : working.filter((s) => s.disturbance !== '扰动');
    return relevant.length > 0 && relevant.every((s) => s.testItems.includes(item));
  };
  /** 某试验项目「全选」表头：勾选->对适用的土样全部添加（对扰动土不适用的项跳过扰动土），取消->全部移除 */
  const toggleAllItem = (item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const has = s.testItems.includes(item);
        // 勾选时：对扰动土不适用的试验项目（除 物性/颗分 外）跳过扰动土
        const applicableToDisturbed = DISTURBED_APPLICABLE_TESTS.includes(item);
        if (checked && !has) {
          if (!applicableToDisturbed && s.disturbance === '扰动') return s;
          return { ...s, testItems: [...s.testItems, item] };
        }
        if (!checked && has) return { ...s, testItems: s.testItems.filter((t) => t !== item) };
        return s;
      }),
    );

  /** 切换单行某自定义试验项目：写入/移除 sample.otherTestItems（不进 40 列主表） */
  const toggleOtherItem = (id: string, item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const has = (s.otherTestItems ?? []).includes(item);
        if (checked && !has)
          return { ...s, otherTestItems: [...(s.otherTestItems ?? []), item] };
        if (!checked && has)
          return {
            ...s,
            otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== item),
          };
        return s;
      }),
    );

  /** 某自定义试验项目「全选」表头：勾选->全部添加，取消->全部移除 */
  const otherItemAllChecked = (item: string) =>
    working.length > 0 && working.every((s) => (s.otherTestItems ?? []).includes(item));
  const toggleAllOtherItem = (item: string, checked: boolean) =>
    setWorking((prev) =>
      prev.map((s) => {
        const has = (s.otherTestItems ?? []).includes(item);
        if (checked && !has)
          return { ...s, otherTestItems: [...(s.otherTestItems ?? []), item] };
        if (!checked && has)
          return {
            ...s,
            otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== item),
          };
        return s;
      }),
    );

  /** 新增一个全局自定义试验项目（空值或已存在则忽略） */
  const addCustomItem = () => {
    const name = (window.prompt('输入自定义试验项目名称') ?? '').trim();
    if (!name) return;
    if (customTestItems.includes(name)) return;
    onCustomTestItemsChange([...customTestItems, name]);
  };

  /** 删除一个全局自定义试验项目：从全局列表移除，并同步取消当前记录中已勾选该项的土样 */
  const removeCustomItem = (name: string) => {
    if (
      !window.confirm(
        `删除自定义试验项目「${name}」？\n将从全局列表移除；当前记录中已勾选该项的土样会同步取消（其他记录不受影响）。`,
      )
    )
      return;
    onCustomTestItemsChange(customTestItems.filter((x) => x !== name));
    setWorking((prev) =>
      prev.map((s) => ({ ...s, otherTestItems: (s.otherTestItems ?? []).filter((t) => t !== name) })),
    );
  };

  const handleSave = () => {
    onSave(working);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>批量勾选（试验项目 / 扰动土）</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, lineHeight: 1.7 }}>
          逐列「全选」可快速应用到全部土样；勾选「扰动土」会自动联动「颗分」。
          对扰动土不适用的试验项目（固结/渗透/快剪/三轴）点「全选」时自动跳过扰动土（仅勾原状）。
          同时含「渗透+快剪」或「饱固快剪+自然快剪」的行将
          <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}> 标红 </Box>
          （可能的冲突组合）。
        </Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            自定义/额外试验项目为全局项，可在下方表格逐列勾选，或点此新增。
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddCircleOutlineIcon />}
            onClick={addCustomItem}
          >
            添加自定义试验项目
          </Button>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1,
            mt: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            双指捏合可缩放表格；双指拖动可平移。当前缩放 {(scale * 100).toFixed(0)}%
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton
              size="small"
              aria-label="缩小表格"
              disabled={scale <= MIN_SCALE + 1e-6}
              onClick={() => setZoom(scale - 0.5)}
            >
              <RemoveCircleOutlineIcon />
            </IconButton>
            <IconButton
              size="small"
              aria-label="放大表格"
              disabled={scale >= MAX_SCALE - 1e-6}
              onClick={() => setZoom(scale + 0.5)}
            >
              <AddCircleOutlineIcon />
            </IconButton>
            <Button
              size="small"
              variant="text"
              disabled={scale <= MIN_SCALE + 1e-6}
              onClick={() => setZoom(1)}
            >
              重置
            </Button>
          </Box>
        </Box>
        <TableContainer
          ref={containerRef}
          sx={{ maxHeight: 440, touchAction: 'pan-x pan-y' }}
        >
          <Table stickyHeader size="small" sx={{ zoom: scale, tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...STICKY_HEAD, minWidth: 90, fontWeight: 700 }}>
                  土号
                </TableCell>
                <TableCell align="center" sx={{ minWidth: 90 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0,
                    }}
                  >
                    <Typography variant="caption" fontWeight={700}>
                      扰动土
                    </Typography>
                    <Checkbox
                      size="small"
                      checked={allDisturbed}
                      onChange={(e) => toggleAllDisturbance(e.target.checked)}
                    />
                  </Box>
                </TableCell>
                {TEST_ITEMS.map((item) => (
                  <TableCell key={item} align="center" sx={{ minWidth: 78 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0,
                      }}
                    >
                      <Typography variant="caption" fontWeight={700}>
                        {item}
                      </Typography>
                      <Checkbox
                        size="small"
                        checked={itemAllChecked(item)}
                        onChange={(e) => toggleAllItem(item, e.target.checked)}
                      />
                    </Box>
                  </TableCell>
                ))}
                {customTestItems.map((item) => (
                  <TableCell
                    key={`other-${item}`}
                    align="center"
                    sx={{ minWidth: 90 }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.25,
                          maxWidth: 120,
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={700}
                          color="secondary.main"
                          noWrap
                          title={item}
                        >
                          {item}
                        </Typography>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => removeCustomItem(item)}
                          sx={{ p: 0.25 }}
                          aria-label={`删除自定义项 ${item}`}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Checkbox
                        size="small"
                        checked={otherItemAllChecked(item)}
                        onChange={(e) => toggleAllOtherItem(item, e.target.checked)}
                      />
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {working.map((s) => {
                const conflict = isPermQuickConflict(s) || isQuickShearBothConflict(s);
                return (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{ bgcolor: conflict ? conflictBg : undefined }}
                  >
                    <TableCell
                      sx={{
                        ...STICKY_BODY,
                        fontWeight: 600,
                        backgroundColor: conflict ? conflictBg : 'background.paper',
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <span>{s.soilNumber || '(未填)'}</span>
                        {conflict && (
                          <Chip
                            size="small"
                            color="error"
                            icon={<WarningAmberIcon style={{ fontSize: 14 }} />}
                            label="冲突"
                            sx={{
                              alignSelf: 'flex-start',
                              height: 20,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        size="small"
                        checked={s.disturbance === '扰动'}
                        onChange={(e) =>
                          toggleDisturbance(s.id, e.target.checked)
                        }
                      />
                    </TableCell>
                    {TEST_ITEMS.map((item) => (
                      <TableCell key={item} align="center">
                        <Checkbox
                          size="small"
                          checked={s.testItems.includes(item)}
                          onChange={(e) =>
                            toggleItem(s.id, item, e.target.checked)
                          }
                        />
                      </TableCell>
                    ))}
                    {customTestItems.map((item) => (
                      <TableCell key={`other-${item}`} align="center">
                        <Checkbox
                          size="small"
                          checked={(s.otherTestItems ?? []).includes(item)}
                          onChange={(e) =>
                            toggleOtherItem(s.id, item, e.target.checked)
                          }
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        {working.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            当前没有土样，请先在编辑界面添加土样。
          </Typography>
        )}
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
