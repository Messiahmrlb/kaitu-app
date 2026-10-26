import { useState, useEffect, useRef } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  Card,
  Stack,
  IconButton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Alert,
  Chip,
  Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

/** 编辑页土样卡片内「信息格」统一样式：divider 边框 + 浅底 + 圆角 8（替代原写死 #f5f5f5 灰底） */
const infoTileSx: SxProps<Theme> = {
  flex: 1,
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 8,
  p: 1,
  textAlign: 'center',
  cursor: 'pointer',
  bgcolor: 'background.default',
  transition: 'background .15s',
  '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
};

/** 土样卡片上的「试验项目冲突」提示条统一样式：整条可点，点击进入录入修改 */
const sampleConflictAlertSx: SxProps<Theme> = {
  mt: 1,
  cursor: 'pointer',
  py: 0.5,
  '& .MuiAlert-icon': { py: 0.5 },
  '& .MuiAlert-message': { py: 0.25, width: '100%' },
};
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import InboxIcon from '@mui/icons-material/Inbox';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import Checkbox from '@mui/material/Checkbox';
import { SoilRecord, SoilSample, RecordMode, EngineeringInfo } from './types';
import { MODE_LABELS, siltySandSymbol } from './constants';
import { loadRecords, saveRecords } from './storage';
import { App as CapacitorApp } from '@capacitor/app';
import {
  newRecord,
  newSample,
  newSamplesBatch,
  buildRecordSamples,
  sortRecordsByHole,
  renumberSamplesByHole,
  nextSeq,
  insertSampleAt,
  renumberDigitsOnly,
  disturbedTestConflicts,
  isPermQuickConflict,
  isQuickShearBothConflict,
  upsertRecord,
  isRecordDirty,
} from './utils';
import { exportRecord } from './xlsxExport';
import { exportRecordPdf } from './pdfExport';
import { parseDeliveryFile } from './importDelivery';
import EngineeringInfoForm from './components/EngineeringInfoForm';
import SampleDialog from './components/SampleDialog';
import type { SampleFocusField } from './components/SampleDialog';
import ModeSelectDialog from './components/ModeSelectDialog';
import BatchCheckDialog from './components/BatchCheckDialog';
import ImportDeliveryDialog from './components/ImportDeliveryDialog';
import NewRecordSetupDialog from './components/NewRecordSetupDialog';

type View = 'list' | 'editor';

export default function App() {
  const [records, setRecords] = useState<SoilRecord[]>([]);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<SoilRecord | null>(null);

  // 新建记录时的格式选择对话框
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  // 新建记录：选完格式后，再弹「孔号 + 数量」设置框
  const [setupOpen, setSetupOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<RecordMode | null>(null);

  // 导入送样单对话框
  const [importOpen, setImportOpen] = useState(false);

  // 土样编辑对话框
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<SoilSample | null>(null);
  const [sampleIndex, setSampleIndex] = useState<number>(-1); // -1 表示新增
  const [sampleFocusField, setSampleFocusField] = useState<SampleFocusField | undefined>(undefined);
  // 插入土样的位置（null=非插入；>=0=在该索引前插入，保存时按孔号重排编号）
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  // 批量勾选对话框（试验项目 / 扰动土）
  const [batchCheckOpen, setBatchCheckOpen] = useState(false);

  // 提示与删除确认
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' }>({
    msg: '',
    sev: 'info',
  });
  const [deleteRecord, setDeleteRecord] = useState<SoilRecord | null>(null);

  // 批量添加土样：数量输入与处理（允许留空，点击添加时再兜底为 1）
  const [batchCount, setBatchCount] = useState<string>('8');

  // 记录级排序方向（首页列表视图）
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // 批量选择 / 删除模式
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // 批量删除确认：'selected'=删除选中，'all'=清空全部
  const [batchConfirm, setBatchConfirm] = useState<'selected' | 'all' | null>(null);

  /** 持久化记录列表 */
  const persist = async (next: SoilRecord[]) => {
    setRecords(next);
    await saveRecords(next);
  };

  // 启动时从本地存储恢复全部记录（Web=localStorage，安卓原生=SharedPreferences），
  // 避免「保存后刷新网页记录又消失」。仅挂载时执行一次。
  useEffect(() => {
    loadRecords().then(setRecords).catch(() => {});
  }, []);

  // 保持最新编辑态/记录列表引用，供「页面隐藏或关闭」时的兜底自动保存使用
  const editingRef = useRef<SoilRecord | null>(null);
  const recordsRef = useRef<SoilRecord[]>([]);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  /**
   * 页面隐藏 / 关闭（切后台、关标签页、退出应用）时兜底保存当前编辑记录，
   * 防止未点「保存」即关闭导致数据丢失。有改动才写，避免无谓写入。
   */
  useEffect(() => {
    const flush = () => {
      const rec = editingRef.current;
      if (!rec) return;
      const list = recordsRef.current;
      // 无改动则跳过（新记录列表中没有，视为有改动）
      if (!isRecordDirty(list, rec)) return;
      const next = upsertRecord(list, rec);
      recordsRef.current = next;
      setRecords(next);
      // Web 端底层为 localStorage（同步写入）；原生端异步写入尽力而为
      void saveRecords(next);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // ---------- 新建 / 打开 ----------
  const handleModeSelect = (mode: RecordMode) => {
    setModeDialogOpen(false);
    setPendingMode(mode);
    setSetupOpen(true);
  };

  /** 新建记录第二步确认：用孔号 + 数量直接生成一份已编好号的记录 */
  const handleSetupConfirm = (holeCode: string, count: number, rCount: number) => {
    const mode = pendingMode ?? 'A';
    const rec = newRecord(mode);
    const hole = holeCode.trim();
    rec.engineering.holeCode = hole;
    if (hole) rec.name = `开土记录 ${hole}`;
    rec.samples = buildRecordSamples(hole, count, rCount);
    setSetupOpen(false);
    setPendingMode(null);
    setEditing(rec);
    setView('editor');
  };

  const openExisting = (rec: SoilRecord) => {
    setEditing({ ...rec });
    setView('editor');
  };

  const updateEditing = (patch: Partial<SoilRecord>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch, updatedAt: Date.now() } : prev));

  /**
   * 工程信息变更：孔号（holeCode）变化时，实时把现有土样的土号前缀同步为新孔号。
   * 其余字段照常更新；若尚未录入任何土样则不触发重编号。
   */
  const handleEngineeringChange = (v: EngineeringInfo) => {
    const oldHole = editing?.engineering.holeCode ?? '';
    const newHole = (v.holeCode ?? '').trim();
    const patch: Partial<SoilRecord> = { engineering: v };
    if (newHole !== oldHole && (editing?.samples?.length ?? 0) > 0) {
      patch.samples = renumberSamplesByHole(editing!.samples, oldHole, newHole);
    }
    updateEditing(patch);
  };

  /** 把当前编辑记录写回记录列表并落盘（不改变视图） */
  const commitEditing = async (rec: SoilRecord): Promise<SoilRecord[]> => {
    const next = upsertRecord(records, rec);
    await persist(next);
    return next;
  };

  const saveEditing = async () => {
    if (!editing) return;
    await commitEditing(editing);
    setSnack({ msg: '记录已保存', sev: 'success' });
    setView('list');
    setEditing(null);
  };

  /**
   * 返回列表：先自动保存再离开，避免误触返回丢失数据。
   * 全新的空记录（无孔号、无土样）不落盘，避免产生无用空记录。
   */
  const autoSaveAndBack = async () => {
    if (editing) {
      const stored = records.find((r) => r.id === editing.id);
      const pristineNew =
        !stored &&
        (editing.samples?.length ?? 0) === 0 &&
        !(editing.engineering?.holeCode ?? '').trim();
      if (!pristineNew && isRecordDirty(records, editing)) {
        await commitEditing(editing);
        setSnack({ msg: '已自动保存', sev: 'success' });
      }
    }
    setView('list');
    setEditing(null);
  };

  // 安卓硬件返回键：优先关闭已打开的对话框；编辑页先自动保存再返回；列表页退出应用。
  // 用 ref 保存「最新一版」处理器，避免监听器闭包拿到过期的 editing/records。
  const hardwareBackRef = useRef<() => void>(() => {});
  useEffect(() => {
    hardwareBackRef.current = () => {
      if (deleteRecord) {
        setDeleteRecord(null);
        return;
      }
      if (batchConfirm) {
        setBatchConfirm(null);
        return;
      }
      if (sampleDialogOpen) {
        setSampleDialogOpen(false);
        setInsertIndex(null);
        return;
      }
      if (batchCheckOpen) {
        setBatchCheckOpen(false);
        return;
      }
      if (importOpen) {
        setImportOpen(false);
        return;
      }
      if (setupOpen) {
        setSetupOpen(false);
        setPendingMode(null);
        return;
      }
      if (modeDialogOpen) {
        setModeDialogOpen(false);
        return;
      }
      if (view === 'editor') {
        void autoSaveAndBack();
        return;
      }
      void CapacitorApp.exitApp();
    };
  });

  useEffect(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void CapacitorApp.addListener('backButton', () => hardwareBackRef.current()).then((h) => {
      remove = () => h.remove();
      // 组件已卸载才拿到句柄时立即移除，避免监听器泄漏
      if (disposed) void remove();
    });
    return () => {
      disposed = true;
      if (remove) void remove();
    };
  }, []);

  // ---------- 土样增删改 ----------
  const openNewSample = () => {
    if (!editing) return;
    // 默认编号取「当前最大数字编号 +1」（忽略 ZK1-R1 这类字母号），并带上孔号前缀，
    // 避免插入 R 号后追加时按样本总数+1 跳号（如 5 个数字+1 个 R 后误给 -7）。
    const hole = (editing.engineering.holeCode ?? '').trim();
    const seq = nextSeq(editing.samples);
    const defNumber = hole ? `${hole}-${seq}` : `-${seq}`;
    setEditingSample(newSample(seq, defNumber));
    setSampleIndex(-1);
    setInsertIndex(null);
    setSampleFocusField(undefined);
    setSampleDialogOpen(true);
  };

  const openEditSample = (idx: number, focus?: SampleFocusField) => {
    if (!editing) return;
    setEditingSample({ ...editing.samples[idx] });
    setSampleIndex(idx);
    setInsertIndex(null);
    setSampleFocusField(focus);
    setSampleDialogOpen(true);
  };

  /** 在 idx 之前插入一条新土样：打开空白录入框，保存时仅插入、不重排（保留 ZK1-R1 等手工编号） */
  const openInsertSample = (idx: number) => {
    if (!editing) return;
    const hole = (editing.engineering.holeCode ?? '').trim();
    const defNumber = hole ? `${hole}-${idx + 1}` : `-${idx + 1}`;
    setEditingSample(newSample(idx + 1, defNumber));
    setSampleIndex(-1);
    setInsertIndex(idx);
    setSampleFocusField(undefined);
    setSampleDialogOpen(true);
  };

  const saveSample = (s: SoilSample) => {
    if (!editing) return;
    if (insertIndex !== null) {
      // 插入模式：在 insertIndex 处插入，然后仅重排纯数字编号（1,2,3…），
      // 保留 ZK1-R1 这类含 R 的手工编号不动。
      const hole = (editing.engineering.holeCode ?? '').trim();
      const inserted = insertSampleAt(editing.samples, insertIndex, s);
      updateEditing({ samples: renumberDigitsOnly(inserted, hole) });
      setInsertIndex(null);
    } else if (sampleIndex < 0) {
      updateEditing({ samples: [...editing.samples, s] });
    } else {
      const samples = [...editing.samples];
      samples[sampleIndex] = s;
      updateEditing({ samples });
    }
    setSampleDialogOpen(false);
  };

  const deleteSample = (idx: number) => {
    if (!editing) return;
    updateEditing({ samples: editing.samples.filter((_, i) => i !== idx) });
  };

  /** 批量添加 N 条土样，土号按孔号前缀自动编号（见 utils.newSamplesBatch） */
  const addBatchSamples = () => {
    if (!editing) return;
    const count = Math.max(1, Math.floor(Number(batchCount)) || 1);
    const added = newSamplesBatch(count, editing.engineering.holeCode, editing.samples);
    updateEditing({ samples: [...editing.samples, ...added] });
    setSnack({ msg: `已批量添加 ${added.length} 条土样`, sev: 'success' });
  };

  // ---------- 删除记录 ----------
  const handleDeleteRecord = async () => {
    if (!deleteRecord) return;
    await persist(records.filter((r) => r.id !== deleteRecord.id));
    setDeleteRecord(null);
    setSnack({ msg: '记录已删除', sev: 'info' });
  };

  // ---------- 导出 ----------
  const handleExport = async (rec: SoilRecord) => {
    try {
      const res = await exportRecord(rec);
      setSnack({ msg: res.message, sev: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setSnack({ msg: '导出失败：' + (e?.message ?? String(e)), sev: 'error' });
    }
  };

  /** 导出 PDF（A3 横向逐格模板） */
  const handleExportPdf = async (rec: SoilRecord) => {
    try {
      const res = await exportRecordPdf(rec);
      setSnack({ msg: res.message, sev: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setSnack({ msg: 'PDF 导出失败：' + (e?.message ?? String(e)), sev: 'error' });
    }
  };

  // ---------- 批量选择 / 删除 ----------
  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const deleteSelected = async () => {
    await persist(records.filter((r) => !selected.includes(r.id)));
    setSnack({ msg: `已删除选中的 ${selected.length} 份记录`, sev: 'info' });
    setSelected([]);
    setSelectMode(false);
  };

  const clearAll = async () => {
    await persist([]);
    setSnack({ msg: '已清空全部记录', sev: 'info' });
    setSelected([]);
    setSelectMode(false);
  };

  /** 手动上下挪动记录顺序（idx 为当前位置，delta 为 -1/1） */
  const moveRecord = (idx: number, delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= records.length) return;
    const next = [...records];
    const [it] = next.splice(idx, 1);
    next.splice(j, 0, it);
    persist(next);
  };

  // ---------- 列表视图 ----------
  const renderList = () => {
    const selectedSet = new Set(selected);
    const disturbCount = (rec: SoilRecord) =>
      rec.samples.filter((s) => s.disturbance === '扰动').length;
    return (
      <Box>
        <AppBar position="sticky" color="primary">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              开土记录录入
            </Typography>
            {!selectMode && (
              <Button
                color="inherit"
                onClick={() => {
                  setSelectMode(true);
                  setSelected([]);
                }}
                sx={{ mr: 1 }}
              >
                批量删除
              </Button>
            )}
            <Button
              color="inherit"
              startIcon={<UploadFileIcon />}
              onClick={() => setImportOpen(true)}
              sx={{ mr: 1 }}
            >
              导入送样单
            </Button>
          </Toolbar>
        </AppBar>

        {/* 选择模式工具条 */}
        {selectMode && (
          <Box
            sx={{
              position: 'sticky',
              top: 56,
              zIndex: 2,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
              borderBottom: (t) => `1px solid ${alpha(t.palette.primary.main, 0.22)}`,
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography variant="body2" sx={{ flexGrow: 1 }}>
              已选 {selected.length} 项
            </Typography>
            <Button size="small" onClick={() => setSelected(records.map((r) => r.id))}>
              全选
            </Button>
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={selected.length === 0}
              onClick={() => setBatchConfirm('selected')}
            >
              删除选中
            </Button>
            <Button size="small" color="warning" onClick={() => setBatchConfirm('all')}>
              清空全部
            </Button>
            <Button size="small" onClick={() => { setSelectMode(false); setSelected([]); }}>
              取消
            </Button>
          </Box>
        )}

        <Container maxWidth="sm" sx={{ py: 2 }}>
          {records.length === 0 ? (
            <Box
              sx={{
                textAlign: 'center',
                color: 'text.secondary',
                mt: 8,
                px: 3,
              }}
            >
              <InboxIcon sx={{ fontSize: 64, color: 'action.disabled', mb: 1 }} />
              <Typography variant="subtitle1" color="text.secondary">
                还没有开土记录
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                点击右下角的“+”按钮，新建一份开土记录。
              </Typography>
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    const d = sortDir === 'asc' ? 'desc' : 'asc';
                    setSortDir(d);
                    persist(sortRecordsByHole(records, d));
                    setSnack({
                      msg: '已按孔号' + (d === 'asc' ? '升序' : '降序') + '排序',
                      sev: 'success',
                    });
                  }}
                >
                  按孔号排序 {sortDir === 'asc' ? '▲' : '▼'}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  导入的记录顺序乱可在此一键排好；也可用每条右侧 ↑/↓ 手动挪
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                {records.map((rec, idx) => {
                  const disturb = disturbCount(rec);
                  const intact = rec.samples.length - disturb;
                  const isSel = selectedSet.has(rec.id);
                  return (
                    <Card
                      key={rec.id}
                      variant="outlined"
                      onClick={
                        selectMode ? () => toggleSelect(rec.id) : () => openExisting(rec)
                      }
                      sx={{
                        borderRadius: 2,
                        cursor: 'pointer',
                        position: 'relative',
                        overflow: 'hidden',
                        borderColor: isSel ? 'primary.main' : 'divider',
                        borderLeft: (t) =>
                          `4px solid ${
                            disturb > 0 ? t.palette.error.main : t.palette.primary.main
                          }`,
                        bgcolor: isSel
                          ? (t) => alpha(t.palette.primary.main, 0.06)
                          : 'background.paper',
                        transition: 'box-shadow .2s ease, transform .2s ease',
                        '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          p: 1.5,
                          gap: 1,
                        }}
                      >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography
                              fontWeight={700}
                              noWrap
                              sx={{
                                flexShrink: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {rec.name}
                            </Typography>
                            <Chip
                              size="small"
                              label={MODE_LABELS[rec.mode]}
                              color={rec.mode === 'A' ? 'primary' : 'secondary'}
                              sx={{ flexShrink: 0 }}
                            />
                            {disturb > 0 && (
                              <Chip
                                size="small"
                                label={`扰动 ${disturb}`}
                                color="error"
                                variant="outlined"
                                sx={{ flexShrink: 0 }}
                              />
                            )}
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            {`工程编号：${rec.engineering.projectCode || '—'} ｜ 孔号：${
                              rec.engineering.holeCode || '—'
                            } ｜ 土样 ${rec.samples.length} 条 ｜ 原状 ${intact} · 扰动 ${disturb}`}
                            {selectMode ? '（点按选择）' : ''}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            flexShrink: 0,
                          }}
                        >
                          {selectMode ? (
                            <Checkbox
                              edge="end"
                              checked={isSel}
                              onChange={() => toggleSelect(rec.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <IconButton
                                size="small"
                                aria-label="上移"
                                disabled={idx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveRecord(idx, -1);
                                }}
                              >
                                <KeyboardArrowUpIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="下移"
                                disabled={idx === records.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveRecord(idx, 1);
                                }}
                              >
                                <KeyboardArrowDownIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="导出xlsx"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExport(rec);
                                }}
                              >
                                <TableChartIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                aria-label="导出pdf"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportPdf(rec);
                                }}
                              >
                                <PictureAsPdfIcon fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                aria-label="删除"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteRecord(rec);
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </>
                          )}
                        </Box>
                      </Box>
                    </Card>
                  );
                })}
              </Stack>
            </>
          )}
        </Container>
        <Fab
          color="primary"
          aria-label="add"
          sx={{
            position: 'fixed',
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            right: 24,
          }}
          onClick={() => setModeDialogOpen(true)}
        >
          <AddIcon />
        </Fab>
      </Box>
    );
  };

  // ---------- 编辑视图 ----------
  const renderEditor = () => {
    if (!editing) return null;
    return (
      <Box sx={{ pb: 10, minHeight: '100vh' }}>
        <AppBar position="sticky">
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              aria-label="返回（自动保存）"
              onClick={() => void autoSaveAndBack()}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              编辑记录
            </Typography>
            <Button
              color="inherit"
              startIcon={<TableChartIcon />}
              onClick={() => handleExport(editing)}
            >
              导出xlsx
            </Button>
            <Button
              color="inherit"
              startIcon={<PictureAsPdfIcon />}
              onClick={() => handleExportPdf(editing)}
            >
              导出PDF
            </Button>
          </Toolbar>
        </AppBar>

        <Container maxWidth="sm" sx={{ py: 2 }}>
          <TextField
            label="记录名称（便于区分）"
            fullWidth
            margin="normal"
            value={editing.name}
            onChange={(e) => updateEditing({ name: e.target.value })}
          />

          <EngineeringInfoForm
            value={editing.engineering}
            onChange={handleEngineeringChange}
          />

          <Divider sx={{ my: 2 }} />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="subtitle1">土样列表（{editing.samples.length}）</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openNewSample}>
              添加土样
            </Button>
          </Box>

          {/* 批量添加土样：按孔号自动编号 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              mb: 1.5,
              p: 1.5,
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.default',
            }}
          >
            <TextField
              label="批量数量"
              type="number"
              size="small"
              value={batchCount}
              onChange={(e) => setBatchCount(e.target.value)}
              inputProps={{ min: 1, style: { width: 64 } }}
            />
            <Button variant="contained" onClick={addBatchSamples}>
              添加 {Math.max(1, Math.floor(Number(batchCount)) || 1)} 个
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, ml: 1 }}>
              土号按孔号自动生成（如 孔号 ZK1 → ZK1-1…；孔号为空 → -1…）
            </Typography>
          </Box>

          {/* 批量勾选：试验项目 / 扰动土 矩阵对话框 */}
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => setBatchCheckOpen(true)}
              disabled={editing.samples.length === 0}
            >
              批量勾选（试验/扰动）
            </Button>
          </Box>

          {editing.samples.map((s, idx) => {
            const isDisturb = s.disturbance === '扰动';
            // 扰动土 + 固结/渗透/剪切/三轴 等不兼容试验项：在卡片上显著提示
            const conflictedTests = disturbedTestConflicts(s);
            // 剪切 / 渗透互斥冲突：①渗透与快剪同时勾选 ②饱固快剪与自然快剪同时勾选
            const shearPermConflicts: string[] = [];
            if (isPermQuickConflict(s)) shearPermConflicts.push('渗透与快剪同时勾选');
            if (isQuickShearBothConflict(s)) shearPermConflicts.push('饱固快剪与自然快剪同时勾选');
            return (
              <Card
                key={s.id}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  mb: 1.5,
                  position: 'relative',
                  overflow: 'hidden',
                  borderColor: 'divider',
                  borderLeft: (t) =>
                    `4px solid ${isDisturb ? t.palette.error.main : t.palette.primary.main}`,
                  transition: 'box-shadow .2s ease, transform .2s ease',
                  '&:hover': { boxShadow: 3, transform: 'translateY(-1px)' },
                }}
              >
                <Box sx={{ p: 1.5, pl: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography
                        fontWeight={700}
                        sx={isDisturb ? { color: 'error.main' } : undefined}
                      >
                        土号 {s.soilNumber || '(未填)'}
                      </Typography>
                      <Chip
                        size="small"
                        label={isDisturb ? '扰动' : '原状'}
                        color={isDisturb ? 'error' : 'primary'}
                        variant="outlined"
                        sx={{ height: 20 }}
                      />
                      {(!s.siltySand || s.siltySand === 'none') &&
                        (s.il ?? '').trim() === '' &&
                        (s.ip ?? '').trim() === '' && (
                          <Chip
                            size="small"
                            label="未描述"
                            color="default"
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        )}
                    </Box>
                    <Box>
                      <IconButton
                        size="small"
                        aria-label="在此前插入土样"
                        onClick={() => openInsertSample(idx)}
                      >
                        <PlaylistAddIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label="编辑" onClick={() => openEditSample(idx)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label="删除"
                        onClick={() => deleteSample(idx)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* 扰动土试验项目冲突：卡片上显著提示，点击可直接进入修改 */}
                  {conflictedTests.length > 0 && (
                    <Alert
                      severity="warning"
                      onClick={() => openEditSample(idx)}
                      sx={sampleConflictAlertSx}
                    >
                      <Typography variant="body2" fontWeight={700}>
                        试验项目冲突：扰动土不应做 {conflictedTests.join('、')}
                      </Typography>
                      <Typography variant="caption" display="block">
                        扰动土仅适用「物性」「颗分」，点此修改
                      </Typography>
                    </Alert>
                  )}

                  {/* 剪切 / 渗透判定冲突：与批量勾选对话框的标红规则一致，同样在卡片上提示 */}
                  {shearPermConflicts.length > 0 && (
                    <Alert
                      severity="warning"
                      onClick={() => openEditSample(idx)}
                      sx={sampleConflictAlertSx}
                    >
                      <Typography variant="body2" fontWeight={700}>
                        试验项目冲突：{shearPermConflicts.join('；')}
                      </Typography>
                      <Typography variant="caption" display="block">
                        渗透与快剪、两种快剪一般不同时做，点此修改
                      </Typography>
                    </Alert>
                  )}

                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    土类：{s.soilType.join('、') || '—'} ｜ 实验：{s.testItems.join('、') || '—'}
                    {s.otherTestItems.length > 0 && (
                      <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                        {' ｜ 其他：' + s.otherTestItems.join('、')}
                      </Box>
                    )}
                  </Typography>

                  {/* IL / Ip 信息格：点击直接进入录入并定位到对应输入框，避免手机上滑误触试验项目 */}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Box onClick={() => openEditSample(idx, 'il')} sx={infoTileSx}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        IL 液性指数
                      </Typography>
                      <Typography fontWeight={600}>{s.il || '—'}</Typography>
                    </Box>
                    <Box onClick={() => openEditSample(idx, 'ip')} sx={infoTileSx}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Ip 塑性指数
                      </Typography>
                      <Typography fontWeight={600}>{s.ip || '—'}</Typography>
                    </Box>
                  </Box>

                  {/* 扰动土 / 粉砂判定 信息格：与 IL/Ip 一致，点击直接进入录入并定位到对应选项组 */}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Box onClick={() => openEditSample(idx, 'disturbance')} sx={infoTileSx}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        扰动土
                      </Typography>
                      <Typography
                        fontWeight={600}
                        sx={isDisturb ? { color: 'error.main' } : undefined}
                      >
                        {s.disturbance || '—'}
                      </Typography>
                    </Box>
                    <Box onClick={() => openEditSample(idx, 'siltySand')} sx={infoTileSx}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        粉砂判定
                      </Typography>
                      <Typography fontWeight={600}>
                        {s.siltySand && s.siltySand !== 'none'
                          ? siltySandSymbol(s.siltySand)
                          : '—'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Card>
            );
          })}

          {editing.samples.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              暂无土样，点击“添加土样”开始录入。
            </Typography>
          )}
        </Container>

        {/* 底部保存栏 */}
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            px: 1.5,
            py: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Container maxWidth="sm">
            <Button variant="contained" fullWidth size="large" onClick={saveEditing}>
              保存记录
            </Button>
          </Container>
        </Box>

        <SampleDialog
          open={sampleDialogOpen}
          mode={editing.mode}
          initial={editingSample}
          autoFocusField={sampleFocusField}
          title={insertIndex !== null ? '插入土样' : '土样录入'}
          onSave={saveSample}
          onClose={() => {
            setSampleDialogOpen(false);
            setInsertIndex(null);
          }}
          customTestItems={editing.customTestItems ?? []}
          onAddCustomTestItem={(name) => {
            const t = name.trim();
            const cur = editing.customTestItems ?? [];
            if (t && !cur.includes(t)) updateEditing({ customTestItems: [...cur, t] });
          }}
          onRemoveCustomTestItem={(name) =>
            updateEditing({ customTestItems: (editing.customTestItems ?? []).filter((x) => x !== name) })
          }
        />

        <BatchCheckDialog
          open={batchCheckOpen}
          samples={editing.samples}
          onSave={(updated) => updateEditing({ samples: updated })}
          onClose={() => setBatchCheckOpen(false)}
          customTestItems={editing.customTestItems ?? []}
          onCustomTestItemsChange={(items) => updateEditing({ customTestItems: items })}
        />
      </Box>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {view === 'list' ? renderList() : renderEditor()}

      <ModeSelectDialog
        open={modeDialogOpen}
        onSelect={handleModeSelect}
        onClose={() => setModeDialogOpen(false)}
      />

      <NewRecordSetupDialog
        open={setupOpen}
        mode={pendingMode ?? 'A'}
        onConfirm={handleSetupConfirm}
        onClose={() => {
          setSetupOpen(false);
          setPendingMode(null);
        }}
      />

      <ImportDeliveryDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={async (recs) => {
          await persist([...records, ...recs]);
          setImportOpen(false);
          setSnack({ msg: `已导入 ${recs.length} 份记录`, sev: 'success' });
        }}
      />

      <Dialog open={!!deleteRecord} onClose={() => setDeleteRecord(null)}>
        <DialogTitle>删除记录</DialogTitle>
        <DialogContent>确定删除「{deleteRecord?.name}」吗？此操作不可撤销。</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRecord(null)}>取消</Button>
          <Button color="error" onClick={handleDeleteRecord}>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!batchConfirm} onClose={() => setBatchConfirm(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          {batchConfirm === 'all'
            ? '确定清空全部记录吗？此操作不可撤销。'
            : `确定删除选中的 ${selected.length} 份记录吗？此操作不可撤销。`}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchConfirm(null)}>取消</Button>
          <Button
            color="error"
            onClick={async () => {
              if (batchConfirm === 'all') await clearAll();
              else await deleteSelected();
              setBatchConfirm(null);
            }}
          >
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack.msg}
        autoHideDuration={3000}
        onClose={() => setSnack({ msg: '', sev: 'info' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled">
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
