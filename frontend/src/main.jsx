import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// Load initial theme and accent color
const savedTheme = localStorage.getItem('themeMode') || 'dark';
const savedAccent = localStorage.getItem('themeAccent') || '#64748b';

if (savedTheme === 'light') {
  document.body.classList.add('theme-light');
} else {
  document.body.classList.remove('theme-light');
}

// Ensure the green accent color is overridden
document.documentElement.style.setProperty('--green', savedAccent);

// 禁用浏览器默认右键菜单（完全拦截，以便使用统一的自定义玻璃菜单）
document.addEventListener('contextmenu', (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
