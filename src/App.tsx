import { useState } from 'react';
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
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import TableChartIcon from '@mui/icons-material/TableChart';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import InboxIcon from '@mui/icons-material/Inbox';
import Checkbox from '@mui/material/Checkbox';
import { SoilRecord, SoilSample, RecordMode } from './types';
import { MODE_LABELS, siltySandSymbol } from './constants';
import { loadRecords, saveRecords } from './storage';
import { newRecord, newSample, newSamplesBatch, sortRecordsByHole } from './utils';
import { exportRecord } from './xlsxExport';
import { parseDeliveryFile } from './importDelivery';
import EngineeringInfoForm from './components/EngineeringInfoForm';
import SampleDialog from './components/SampleDialog';
import ModeSelectDialog from './components/ModeSelectDialog';
import BatchCheckDialog from './components/BatchCheckDialog';
import ImportDeliveryDialog from './components/ImportDeliveryDialog';

type View = 'list' | 'editor';

export default function App() {
  const [records, setRecords] = useState<SoilRecord[]>([]);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<SoilRecord | null>(null);

  // 新建记录时的格式选择对话框
  const [modeDialogOpen, setModeDialogOpen] = useState(false);

  // 导入送样单对话框
  const [importOpen, setImportOpen] = useState(false);

  // 土样编辑对话框
  const [sampleDialogOpen, setSampleDialogOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<SoilSample | null>(null);
  const [sampleIndex, setSampleIndex] = useState<number>(-1); // -1 表示新增

  // 批量勾选对话框（试验项目 / 扰动土）
  const [batchCheckOpen, setBatchCheckOpen] = useState(false);

  // 提示与删除确认
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' }>({
    msg: '',
    sev: 'info',
  });
  const [deleteRecord, setDeleteRecord] = useState<SoilRecord | null>(null);

  // 批量添加土样：数量输入与处理
  const [batchCount, setBatchCount] = useState<number>(8);

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

  // ---------- 新建 / 打开 ----------
  const handleModeSelect = (mode: RecordMode) => {
    setModeDialogOpen(false);
    setEditing(newRecord(mode));
    setView('editor');
  };

  const openExisting = (rec: SoilRecord) => {
    setEditing({ ...rec });
    setView('editor');
  };

  const updateEditing = (patch: Partial<SoilRecord>) =>
    setEditing((prev) => (prev ? { ...prev, ...patch, updatedAt: Date.now() } : prev));

  const saveEditing = async () => {
    if (!editing) return;
    const exists = records.some((r) => r.id === editing.id);
    const next = exists
      ? records.map((r) => (r.id === editing.id ? editing : r))
      : [...records, editing];
    await persist(next);
    setSnack({ msg: '记录已保存', sev: 'success' });
    setView('list');
    setEditing(null);
  };

  // ---------- 土样增删改 ----------
  const openNewSample = () => {
    if (!editing) return;
    setEditingSample(newSample(editing.samples.length + 1));
    setSampleIndex(-1);
    setSampleDialogOpen(true);
  };

  const openEditSample = (idx: number) => {
    if (!editing) return;
    setEditingSample({ ...editing.samples[idx] });
    setSampleIndex(idx);
    setSampleDialogOpen(true);
  };

  const saveSample = (s: SoilSample) => {
    if (!editing) return;
    const samples = [...editing.samples];
    if (sampleIndex < 0) samples.push(s);
    else samples[sampleIndex] = s;
    updateEditing({ samples });
    setSampleDialogOpen(false);
  };

  const deleteSample = (idx: number) => {
    if (!editing) return;
    updateEditing({ samples: editing.samples.filter((_, i) => i !== idx) });
  };

  /** 批量添加 N 条土样，土号按孔号前缀自动编号（见 utils.newSamplesBatch） */
  const addBatchSamples = () => {
    if (!editing) return;
    const count = Math.max(1, Math.floor(batchCount || 1));
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
              <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
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
                        borderRadius: 3,
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
                            />
                            {disturb > 0 && (
                              <Chip
                                size="small"
                                label={`扰动 ${disturb}`}
                                color="error"
                                variant="outlined"
                              />
                            )}
                          </Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ mt: 0.5, fontSize: 13 }}
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
                                <ArrowUpwardIcon fontSize="small" />
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
                                <ArrowDownwardIcon fontSize="small" />
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
              aria-label="back"
              onClick={() => {
                setView('list');
                setEditing(null);
              }}
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
            onChange={(v) => updateEditing({ engineering: v })}
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
              border: '1px dashed #bdbdbd',
              borderRadius: 2,
              bgcolor: '#fafafa',
            }}
          >
            <TextField
              label="批量数量"
              type="number"
              size="small"
              value={batchCount}
              onChange={(e) => setBatchCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              inputProps={{ min: 1, style: { width: 64 } }}
            />
            <Button variant="contained" onClick={addBatchSamples}>
              添加 {batchCount} 个
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

          {editing.samples.map((s, idx) => (
            <Box
              key={s.id}
              sx={{
                border: '1px solid #e0e0e0',
                borderLeft: s.disturbance === '扰动' ? '4px solid #d32f2f' : '1px solid #e0e0e0',
                bgcolor: s.disturbance === '扰动' ? '#fff5f5' : 'transparent',
                borderRadius: 2,
                p: 1.5,
                mb: 1.5,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography
                    fontWeight={600}
                    sx={s.disturbance === '扰动' ? { color: 'error.main' } : undefined}
                  >
                    土号 {s.soilNumber || '(未填)'}
                  </Typography>
                  {s.disturbance === '扰动' && (
                    <Chip size="small" label="扰动" color="error" sx={{ ml: 1, height: 20 }} />
                  )}
                </Box>
                <Box>
                  <IconButton size="small" onClick={() => openEditSample(idx)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => deleteSample(idx)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ fontSize: 13, color: 'text.secondary', mt: 0.5 }}>
                土类：{s.soilType.join('、') || '—'} ｜ 实验：{s.testItems.join('、') || '—'}
                {s.otherTestItems.length > 0 && (
                  <Typography component="span" color="warning.main">
                    {' ｜ 其他：' + s.otherTestItems.join('、')}
                  </Typography>
                )}
              </Box>

              {/* 最后两列：IL / Ip 常显，点击进入编辑 */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Box
                  onClick={() => openEditSample(idx)}
                  sx={{
                    flex: 1,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    p: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: '#f5f5f5',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    IL 液性指数
                  </Typography>
                  <Typography fontWeight={600}>{s.il || '—'}</Typography>
                </Box>
                <Box
                  onClick={() => openEditSample(idx)}
                  sx={{
                    flex: 1,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    p: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: '#f5f5f5',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    Ip 塑性指数
                  </Typography>
                  <Typography fontWeight={600}>{s.ip || '—'}</Typography>
                </Box>
              </Box>

              {/* 扰动土 / 粉砂判定：常显，点击进入编辑 */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Box
                  onClick={() => openEditSample(idx)}
                  sx={{
                    flex: 1,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    p: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: '#f5f5f5',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    扰动土
                  </Typography>
                  <Typography fontWeight={600}>{s.disturbance || '—'}</Typography>
                </Box>
                <Box
                  onClick={() => openEditSample(idx)}
                  sx={{
                    flex: 1,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    p: 1,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: '#f5f5f5',
                  }}
                >
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
          ))}

          {editing.samples.length === 0 && (
            <Box sx={{ color: 'text.secondary', fontSize: 14 }}>
              暂无土样，点击“添加土样”开始录入。
            </Box>
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
          onSave={saveSample}
          onClose={() => setSampleDialogOpen(false)}
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
