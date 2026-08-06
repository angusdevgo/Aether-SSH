import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';
import { applyStoredTheme } from './theme.js';

// 启动时还原主题：暗/浅色 + 风格预设 或 自定义强调色
applyStoredTheme();

// 禁用浏览器默认右键菜单（完全拦截，以便使用统一的自定义玻璃菜单）
document.addEventListener('contextmenu', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
