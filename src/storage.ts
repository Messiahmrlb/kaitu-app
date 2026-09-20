import { Preferences } from '@capacitor/preferences';
import { SoilRecord } from './types';

/**
 * 本地存储层
 *
 * 使用 Capacitor Preferences：在 Web 端底层为 localStorage，在安卓原生端为
 * SharedPreferences，接口一致，因此无需编写平台分支即可同时支持预览与 APK。
 *
 * 多份记录统一存于单个 key（JSON 数组），便于整体读写与列表展示。
 */

const STORAGE_KEY = 'kaitu_records_v1';

/** 读取全部记录，无数据或损坏时返回空数组 */
export async function loadRecords(): Promise<SoilRecord[]> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    // 兼容旧数据：早期版本的自定义项是全局存储，记录上无 customTestItems 字段。
    // 用各土样 otherTestItems 的并集回填，保证旧记录里已勾的自定义项仍可管理（按记录独立）。
    return (parsed as SoilRecord[]).map((r) => ({
      ...r,
      customTestItems: Array.isArray(r.customTestItems)
        ? r.customTestItems
        : Array.from(new Set((r.samples ?? []).flatMap((s) => s.otherTestItems ?? []))),
    }));
  } catch {
    return [];
  }
}

/** 覆盖保存全部记录 */
export async function saveRecords(records: SoilRecord[]): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(records) });
}
