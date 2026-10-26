import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import theme from './theme';
import { installChunkLoadRecovery } from './pwaRecovery';
import './index.css';

// 懒加载分块 404（旧版本页面指向已删除的构建产物）时自动清缓存并重载
installChunkLoadRecovery();

// 新 Service Worker 接管页面后重载一次，避免「旧的 index.js + 新的分块」错配。
// 只对「进页面时已被 SW 接管」的情况生效，首次安装不额外刷新。
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
