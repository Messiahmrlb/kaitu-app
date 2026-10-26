import { Preferences } from '@capacitor/preferences';
import { CMA_DEFAULT, CmaHeaderSettings, normalizeCmaHeader } from './cmaHeader';

/**
 * CMA 页眉设置的持久化。
 *
 * 与记录一样走 Capacitor Preferences：Web 端落在 localStorage
 * （键名会被加上 `CapacitorStorage.` 前缀），安卓端落在 SharedPreferences，
 * 因此「改一次就一直保持」在刷新页面、重开 App 后都成立。
 *
 * 注意：这是**全局设置**，不跟随单条记录。
 */
export const CMA_STORAGE_KEY = 'kaitu_cma_header_v1';

/** 读取页眉设置；无数据或损坏时回落出厂默认值 */
export async function loadCmaHeader(): Promise<CmaHeaderSettings> {
  try {
    const { value } = await Preferences.get({ key: CMA_STORAGE_KEY });
    if (!value) return { ...CMA_DEFAULT };
    return normalizeCmaHeader(JSON.parse(value));
  } catch {
    return { ...CMA_DEFAULT };
  }
}

/** 保存页眉设置（先规整再落盘），返回实际生效的值 */
export async function saveCmaHeader(s: CmaHeaderSettings): Promise<CmaHeaderSettings> {
  const clean = normalizeCmaHeader(s);
  await Preferences.set({ key: CMA_STORAGE_KEY, value: JSON.stringify(clean) });
  return clean;
}

/** 恢复出厂默认值 */
export async function resetCmaHeader(): Promise<CmaHeaderSettings> {
  return saveCmaHeader(CMA_DEFAULT);
}
