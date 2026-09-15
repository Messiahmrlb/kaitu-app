import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：默认开发服务器监听 0.0.0.0 便于手机同一局域网预览
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
  },
  // exceljs 体积大且在浏览器端仅在导出时使用，预打包以稳定依赖图
  optimizeDeps: {
    include: ['exceljs'],
  },
  build: {
    outDir: 'dist',
  },
});
