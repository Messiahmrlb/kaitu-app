import { CapacitorConfig } from '@capacitor/cli';

// Capacitor 配置：构建产物输出到 dist，由 cap sync 同步进安卓工程
const config: CapacitorConfig = {
  appId: 'com.kaitu.app',
  appName: '开土记录录入',
  webDir: 'dist',
};

export default config;
