// 回归测试：upsertRecord / isRecordDirty
// 「返回/关闭自动保存」依赖：同 id 覆盖不重复、新记录追加、无改动不重复写入。
// 运行：node qa_harness/test_autosave_upsert.cjs
const path = require('path');
const { upsertRecord, isRecordDirty } = require(path.join(__dirname, '_emit', 'utils.cjs'));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}${detail ? '  => ' + detail : ''}`); }
  else { fail++; console.error(`FAIL  ${name}${detail ? '  => ' + detail : ''}`); }
}

const rec = (id, updatedAt, name) => ({ id, updatedAt, name });

// 1) 新记录追加到末尾
const a = [rec('r1', 100)];
const b = upsertRecord(a, rec('r2', 200, '新孔'));
check('新记录追加：长度=2', b.length === 2, b.length);
check('新记录追加：顺序保留', b[0].id === 'r1' && b[1].id === 'r2', b.map(r => r.id).join(','));
check('原数组未被修改', a.length === 1, a.length);

// 2) 同 id 覆盖，不产生重复
const c = upsertRecord([rec('r1', 100, '旧')], rec('r1', 300, '新'));
check('同 id 覆盖：长度不变=1', c.length === 1, c.length);
check('同 id 覆盖：内容已更新', c[0].name === '新' && c[0].updatedAt === 300, `${c[0].name}/${c[0].updatedAt}`);

// 3) 多记录中覆盖中间一条，顺序不变
const list = [rec('a', 1), rec('b', 2), rec('c', 3)];
const d = upsertRecord(list, rec('b', 9, 'B2'));
check('中间覆盖：顺序不变', d.map(r => r.id).join(',') === 'a,b,c', d.map(r => r.id).join(','));
check('中间覆盖：仅目标更新', d[1].name === 'B2' && d[0].name === undefined && d[2].name === undefined);

// 4) isRecordDirty：列表中不存在 => 有改动（新记录）
check('新记录 视为有改动', isRecordDirty([rec('r1', 100)], rec('r2', 100)) === true);

// 5) updatedAt 相同 => 无改动
check('updatedAt 相同 无改动', isRecordDirty([rec('r1', 100)], rec('r1', 100)) === false);

// 6) updatedAt 不同 => 有改动
check('updatedAt 不同 有改动', isRecordDirty([rec('r1', 100)], rec('r1', 101)) === true);

console.log(`\nupsertRecord / isRecordDirty 测试：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
