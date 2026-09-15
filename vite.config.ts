import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vite 配置：默认开发服务器监听 0.0.0.0 便于手机同一局域网预览
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 自动注册 Service Worker 并在新版本发布后自动更新（无需手动刷新）
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: '开土记录',
        short_name: '开土记录',
        description: '土工试验土样开土记录采集与导出',
        lang: 'zh-CN',
        orientation: 'portrait',
        theme_color: '#5d4037',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // 离线缓存构建产物；exceljs 单 chunk ~938KB，上限放宽到 3MB 以防后续变大
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      // 开发模式不启用 SW，避免干扰 npm run dev 调试；仅 build 后生效
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    port: 5174,
    // 允许任意 Host 头：经内网穿透（如 cloudflared / *.trycloudflare.com）访问时
    // Vite 5.4+ 默认会校验 Host 头，未列入白名单的域名会返回 "Blocked request"。
    // 隧道子域每次随机，故设为 true 放行全部；仅影响开发服务器，不写进生产构建。
    allowedHosts: true,
  },
  // exceljs 体积大且在浏览器端仅在导出时使用，预打包以稳定依赖图
  optimizeDeps: {
    include: ['exceljs'],
  },
  build: {
    outDir: 'dist',
  },
});
