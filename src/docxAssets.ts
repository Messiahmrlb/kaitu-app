/**
 * Word 导出模板资源（Vite ?url 引用）。
 *
 * 独立成模块的原因：`?url` 是 Vite 专属约定，esbuild 打包测试跑不动它；
 * docxExport.ts 的纯函数保持零资源依赖，导出执行时才动态加载本模块，
 * 模板文件随构建产出 assets 并进入 PWA precache（vite.config globPatterns 含 docx）。
 */
import tplNormalUrl from './assets/tpl-normal.docx?url';
import tplTriangleUrl from './assets/tpl-triangle.docx?url';

/** 按记录模式取模板：A=普通定名（tpl-normal），B=三角坐标（tpl-triangle） */
export const DOCX_TEMPLATE_URLS: Record<'A' | 'B', string> = {
  A: tplNormalUrl,
  B: tplTriangleUrl,
};
