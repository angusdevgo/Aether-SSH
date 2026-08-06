// 主题 / 风格预设 的统一应用入口
// ------------------------------------------------------------
// 三套状态：
//   1. themeMode          暗色 / 浅色（body.theme-light）
//   2. themePreset        风格预设（<html>.theme-preset-xxx，改写 --green 等主色 token）
//   3. useCustomAccent    自定义强调色（内联 --green）
// 预设与自定义强调色都会改写 --green，故二者互斥：后应用的覆盖前者。
// 应用预设时清除 --green 内联覆盖；应用自定义强调色时清除预设类。

export const THEME_PRESETS = [
  { id: 'default', name: '霓虹绿', nameEn: 'Emerald', color: '#10b981' },
  { id: 'ocean',   name: '深邃蓝', nameEn: 'Ocean',   color: '#3b82f6' },
  { id: 'violet',  name: '幻彩紫', nameEn: 'Violet',  color: '#8b5cf6' },
  { id: 'amber',   name: '暖琥珀', nameEn: 'Amber',   color: '#f59e0b' },
  { id: 'rose',    name: '玫瑰红', nameEn: 'Rose',    color: '#f43f5e' },
  { id: 'cyan',    name: '青碧',   nameEn: 'Cyan',    color: '#06b6d4' },
];

const PRESET_CLASS_RE = /(?:^|\s)theme-preset-[^\s]+/g;

function clearPresetClass() {
  document.documentElement.className = document.documentElement.className.replace(PRESET_CLASS_RE, '').trim();
}

/** 应用风格预设（写 <html> 类，并清除自定义强调色对 --green 的内联覆盖） */
export function applyThemePreset(presetId) {
  clearPresetClass();
  document.documentElement.style.removeProperty('--green');
  if (presetId && presetId !== 'default') {
    document.documentElement.classList.add('theme-preset-' + presetId);
  }
}

/** 应用自定义强调色（内联 --green，并清除预设类使其生效） */
export function applyCustomAccent(color) {
  clearPresetClass();
  if (color) {
    document.documentElement.style.setProperty('--green', color);
  } else {
    document.documentElement.style.removeProperty('--green');
  }
}

/** 启动 / 重渲染时根据 localStorage 还原全部主题状态 */
export function applyStoredTheme() {
  const savedTheme = localStorage.getItem('themeMode') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
  }

  const useCustomAccent = localStorage.getItem('useCustomAccent') === 'true';
  const themeAccent = localStorage.getItem('themeAccent');
  if (useCustomAccent && themeAccent) {
    applyCustomAccent(themeAccent);
  } else {
    applyThemePreset(localStorage.getItem('themePreset') || 'default');
  }
}
