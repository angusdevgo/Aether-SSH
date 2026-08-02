import { useState, useEffect } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import { setLanguage as setGlobalLanguage } from '../i18n.js';
import logoImg from '../assets/logo.png';
import { APP_VERSION } from '../config.js';

const I18N = {
  'zh-CN': {
    title: '设置',
    tabs: { network: '网络', appearance: '外观', shortcuts: '快捷键', sync: '同步与云', app: '关于' },
    about: {
      version: '版本',
      reportTitle: '反馈问题',
      reportDesc: '生成预填的 GitHub issue',
      communityTitle: '社区',
      communityDesc: '参与 GitHub Discussions 讨论',
      githubTitle: 'GitHub',
      githubDesc: '源代码',
      changelogTitle: '更新内容',
      changelogDesc: '查看发布说明',
    },
    network: {
      pingProtocolTitle: '延迟检测协议',
      pingProtocolDesc: '选择如何测量服务器网络延迟，不同协议适用于不同的网络环境。',
      sshLabel: 'SSH Banner RTT',
      sshDesc: '通过读取 SSH 握手包测速，穿透 TUN 代理测出真实网络延迟，推荐',
      sshTag: '推荐',
      tcpLabel: 'TCP Dial',
      tcpDesc: '通过 TCP 连接建立测速，适用于局域网/私有网络或未开代理的环境',
      tip: '如果您使用 TUN 模式代理（Clash/V2Ray），推荐使用 SSH Banner RTT 模式，可以穿透代理测出真实延迟。',
      refreshTitle: '监控刷新频率',
      refreshDesc: '设置探针数据和延迟测试的自动刷新间隔。越高的频率越实时，但资源占用越大。',
      probeRefresh: '探针刷新间隔',
      pingRefresh: '延迟检测间隔',
      fixed30s: '2 秒（固定）',
    },
    appearance: {
      langTitle: '语言',
      langLabel: '语言',
      langDesc: '选择界面语言',
      fontLabel: '界面字体',
      fontDesc: '选择软件界面使用的字体',
      termFontLabel: '终端字体大小',
      termFontDesc: '调节终端的字符显示大小',
      themeTitle: '界面主题',
      themeLabel: '主题',
      themeDesc: '选择浅色、深色或跟随系统设置',
      themeLight: '☀️ 浅色',
      themeSys: '💻 系统',
      themeDark: '🌙 深色',
      accentTitle: '强调色',
      accentLabel: '使用自定义强调色',
      accentDesc: '覆盖主题自带的强调色',
      termBgTitle: '终端背景',
      termBgLabel: '自定义终端壁纸',
      termBgDesc: '设置终端底部的自定义背景图片',
      termBgOpacityLabel: '壁纸可见度',
      termBgUpload: '上传图片',
      termBgReset: '恢复默认',
    }
  },
  'en-US': {
    title: 'Settings',
    tabs: { network: 'Network', appearance: 'Appearance', shortcuts: 'Shortcuts', sync: 'Sync & Cloud', app: 'About' },
    about: {
      version: 'Version',
      reportTitle: 'Report an Issue',
      reportDesc: 'Generate a pre-filled GitHub issue',
      communityTitle: 'Community',
      communityDesc: 'Join GitHub Discussions',
      githubTitle: 'GitHub',
      githubDesc: 'Source code',
      changelogTitle: 'Changelog',
      changelogDesc: 'View release notes',
    },
    network: {
      pingProtocolTitle: 'Ping Protocol',
      pingProtocolDesc: 'Choose how to measure server latency. Different protocols suit different networks.',
      sshLabel: 'SSH Banner RTT',
      sshDesc: 'Test via SSH handshake. Can penetrate TUN proxies to show real latency. Recommended.',
      sshTag: 'Recommended',
      tcpLabel: 'TCP Dial',
      tcpDesc: 'Test via TCP connection. Best for LAN or non-proxied environments.',
      tip: 'If using a TUN proxy (Clash/V2Ray), SSH Banner RTT is recommended to bypass the proxy and measure true latency.',
      refreshTitle: 'Refresh Frequency',
      refreshDesc: 'Set auto-refresh intervals for probe data and latency testing. Higher means more real-time, but uses more resources.',
      probeRefresh: 'Probe Refresh Interval',
      pingRefresh: 'Ping Interval',
      fixed30s: '2 seconds (fixed)',
    },
    appearance: {
      langTitle: 'Language',
      langLabel: 'Language',
      langDesc: 'Choose interface language',
      fontLabel: 'Interface Font',
      fontDesc: 'Choose the font used in the interface',
      termFontLabel: 'Terminal Font Size',
      termFontDesc: 'Adjust terminal font size',
      themeTitle: 'Interface Theme',
      themeLabel: 'Theme',
      themeDesc: 'Choose Light, Dark or System',
      themeLight: '☀️ Light',
      themeSys: '💻 System',
      themeDark: '🌙 Dark',
      accentTitle: 'Accent Color',
      accentLabel: 'Use Custom Accent',
      accentDesc: 'Override default accent color',
      termBgTitle: 'Terminal Background',
      termBgLabel: 'Custom Wallpaper',
      termBgDesc: 'Set custom background image for terminals',
      termBgOpacityLabel: 'Wallpaper Visibility',
      termBgUpload: 'Upload Image',
      termBgReset: 'Reset Default',
    }
  }
};

const TABS = [
  { id: 'network', icon: '🌐' },
  { id: 'appearance', icon: '🎨' },
  { id: 'shortcuts', icon: '⌨️' },
  { id: 'sync', icon: '☁️' },
  { id: 'app', icon: 'ℹ️' },
];

const defaultWebdavForm = {
  url: 'https://dav.jianguoyun.com/dav/',
  username: '',
  password: '',
  remotePath: '/Aether/',
};

export default function SettingsModal({ onClose, addToast, onRestored }) {
  const CURRENT_VERSION = APP_VERSION;
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(-1);

  useEffect(() => {
    const handleProgress = (e) => {
      if (typeof e.detail === 'number') {
        setDownloadProgress(e.detail);
      }
    };
    window.addEventListener('app-update-progress', handleProgress);
    return () => window.removeEventListener('app-update-progress', handleProgress);
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('https://api.github.com/repos/angusdevgo/Aether-SSH/releases/latest');
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      if (data && data.tag_name) {
        // Clean the v prefix thoroughly using regex
        let latest = data.tag_name.replace(/^v+/i, '');
        
        let isPortable = false;
        if (window?.go?.main?.App?.IsPortableVersion) {
            isPortable = await window.go.main.App.IsPortableVersion();
        }
        
        // Find exe asset
        let downloadAssetUrl = '';
        let downloadFilename = '';
        let downloadDigest = ''; // GitHub asset SHA-256（格式 sha256:hex），用于下载完整性校验
        if (data.assets && data.assets.length > 0) {
           let targetAsset = null;
           if (isPortable) {
              targetAsset = data.assets.find(a => a.name.toLowerCase().includes('portable') && a.name.endsWith('.exe'));
           } else {
              targetAsset = data.assets.find(a => (a.name.toLowerCase().includes('setup') || a.name.toLowerCase().includes('installer')) && a.name.endsWith('.exe'));
           }
           
           if (!targetAsset) {
              targetAsset = data.assets.find(a => a.name.endsWith('.exe'));
           }

           if (targetAsset) {
               downloadAssetUrl = targetAsset.browser_download_url;
               downloadFilename = targetAsset.name;
               // 提取 hex 摘要（兼容带 sha256: 前缀的格式）
               downloadDigest = (targetAsset.digest || '').replace(/^sha256:/i, '');
           }
        }

        // Semantic versioning comparison (e.g. 1.0.2 > 1.0.10 should be false)
        const isNewer = (latestVer, currentVer) => {
          if (latestVer === currentVer) return false;
          const lParts = latestVer.split('.').map(Number);
          const cParts = currentVer.split('.').map(Number);
          for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
            const l = lParts[i] || 0;
            const c = cParts[i] || 0;
            if (l > c) return true;
            if (l < c) return false;
          }
          return false;
        };

        if (isNewer(latest, CURRENT_VERSION)) {
          setUpdateInfo({
            hasUpdate: true,
            latestVersion: 'v' + latest,
            url: downloadAssetUrl || data.html_url,
            filename: downloadFilename,
            digest: downloadDigest
          });
          addToast(language === 'zh-CN' ? '发现新版本: v' + latest : 'New version found: v' + latest, 'success');
        } else {
          addToast(language === 'zh-CN' ? '当前已是最新版本' : 'You are up to date', 'info');
        }
      }
    } catch (err) {
      addToast((language === 'zh-CN' ? '检查更新失败: ' : 'Check failed: ') + err.message, 'error');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!updateInfo || !updateInfo.url) return;
    if (downloadProgress >= 0) return; // downloading
    
    if (!updateInfo.url.endsWith('.exe')) {
       // Fallback to browser if no direct link
       window.runtime?.BrowserOpenURL(updateInfo.url);
       return;
    }

    setDownloadProgress(0);
    try {
      if (!updateInfo.digest) {
        // 资产无 SHA-256 摘要：拒绝自动更新，引导手动下载
        window.runtime?.BrowserOpenURL(updateInfo.url);
        setDownloadProgress(-1);
        return;
      }
      await AppGo.UpdateApp(updateInfo.url, updateInfo.filename || 'update.exe', updateInfo.digest);
      // Backend automatically exits process on success
    } catch (err) {
      addToast((language === 'zh-CN' ? '更新失败: ' : 'Update failed: ') + err, 'error');
      setDownloadProgress(-1);
    }
  };

  const [activeTab, setActiveTab] = useState('network');

  // WebDAV state
  const [webdavForm, setWebdavForm] = useState(defaultWebdavForm);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [backupsList, setBackupsList] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | 'ok' | 'fail'
  const [lastBackup, setLastBackup] = useState(null);

  // Network/Ping state
  const [pingProtocol, setPingProtocol] = useState(localStorage.getItem('pingProtocol') || 'ssh');
  const [probeInterval, setProbeInterval] = useState(parseInt(localStorage.getItem('probeInterval') || '5', 10));
  const [pingInterval, setPingInterval] = useState(parseInt(localStorage.getItem('pingInterval') || '2', 10));

  // Appearance state
  const [themeMode, setThemeMode] = useState(localStorage.getItem('themeMode') || 'dark');
  const [themeAccent, setThemeAccent] = useState(localStorage.getItem('themeAccent') || '#64748b');
  const [useCustomAccent, setUseCustomAccent] = useState(localStorage.getItem('useCustomAccent') === 'true');
  const [language, setLanguage] = useState(localStorage.getItem('appLanguage') || 'zh-CN');
  const [appFont, setAppFont] = useState(localStorage.getItem('appFont') || 'system-ui');
  const [terminalFontSize, setTerminalFontSize] = useState(parseInt(localStorage.getItem('terminalFontSize') || '13', 10));
  const [termBgImage, setTermBgImage] = useState(localStorage.getItem('termBgImage') || '');
  const [termBgOpacity, setTermBgOpacity] = useState(parseFloat(localStorage.getItem('termBgOpacity') || '0.15'));
  const [terminalColorTheme, setTerminalColorTheme] = useState(localStorage.getItem('terminalColorTheme') || 'aether');
  const [terminalLocalEcho, setTerminalLocalEcho] = useState(localStorage.getItem('terminalLocalEcho') !== 'false');

  const t = I18N[language] || I18N['zh-CN'];

  // Shortcuts state
  const defaultShortcuts = {
    copy: 'Ctrl+C',
    paste: 'Ctrl+V',
    clear: 'Ctrl+L',
    newTab: 'Ctrl+T',
    sigint: 'Ctrl+C',
    eof: 'Ctrl+D',
    suspend: 'Ctrl+Z',
    clearLine: 'Ctrl+U',
  };
  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem('appShortcuts');
      return saved ? { ...defaultShortcuts, ...JSON.parse(saved) } : defaultShortcuts;
    } catch {
      return defaultShortcuts;
    }
  });
  const [listeningKey, setListeningKey] = useState(null); // 'copy' | 'paste' | 'clear' | 'newTab' | null

  // 监听并捕捉组合快捷键
  useEffect(() => {
    if (!listeningKey) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      const keys = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.shiftKey) keys.push('Shift');
      if (e.altKey) keys.push('Alt');
      
      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      keys.push(keyName);
      const combined = keys.join('+');

      setShortcuts((prev) => {
        const updated = { ...prev, [listeningKey]: combined };
        localStorage.setItem('appShortcuts', JSON.stringify(combined === 'Esc' ? '' : JSON.stringify(updated)));
        // 直接存盘
        localStorage.setItem('appShortcuts', JSON.stringify(updated));
        return updated;
      });

      addToast(`终端快捷键已修改为 ${combined}`, 'success');
      setListeningKey(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningKey, addToast]);

  const handleThemeChange = (mode) => {
    setThemeMode(mode);
    localStorage.setItem('themeMode', mode);
    if (mode === 'light') document.body.classList.add('theme-light');
    else document.body.classList.remove('theme-light');
  };

  const handleColorChange = (color) => {
    setThemeAccent(color);
    localStorage.setItem('themeAccent', color);
    if (useCustomAccent) {
      document.documentElement.style.setProperty('--green', color);
    }
  };

  const handleToggleLocalEcho = () => {
    const nextVal = !terminalLocalEcho;
    setTerminalLocalEcho(nextVal);
    // 注意：写入 'true'/'false' 字符串，Terminal.jsx 通过 getItem('terminalLocalEcho') !== 'false' 判断
    localStorage.setItem('terminalLocalEcho', nextVal ? 'true' : 'false');
    addToast(nextVal ? '已开启本地回显（输入即时显示，高延迟服务器推荐）' : '已关闭本地回显（等待服务器回显）', 'success');
  };

  const handleToggleAccent = () => {
    const nextVal = !useCustomAccent;
    setUseCustomAccent(nextVal);
    localStorage.setItem('useCustomAccent', String(nextVal));
    if (nextVal) {
      document.documentElement.style.setProperty('--green', themeAccent);
    } else {
      document.documentElement.style.setProperty('--green', '#64748b');
    }
    addToast(nextVal ? '已启用自定义强调色' : '已恢复默认强调色', 'success');
  };

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    setGlobalLanguage(lang);
    addToast(lang === 'zh-CN' ? '语言已切换至 简体中文' : 'Language switched to English', 'success');
  };

  const handleFontChange = (e) => {
    const font = e.target.value;
    setAppFont(font);
    localStorage.setItem('appFont', font);
    
    let fontVal = 'var(--font-ui)';
    if (font === 'Open Sans') fontVal = "'Open Sans', sans-serif";
    else if (font === 'Inter') fontVal = "'Inter', sans-serif";
    else if (font === 'JetBrains Mono') fontVal = "'JetBrains Mono', monospace";
    document.body.style.fontFamily = fontVal;
    
    addToast('界面字体已应用', 'success');
  };

  const handleTerminalFontChange = (e) => {
    const size = parseInt(e.target.value, 10);
    setTerminalFontSize(size);
    localStorage.setItem('terminalFontSize', size);
    window.dispatchEvent(new CustomEvent('terminal-font-size-changed', { detail: size }));
  };

  const handleTermBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      setTermBgImage(base64);
      localStorage.setItem('termBgImage', base64);
      window.dispatchEvent(new CustomEvent('terminal-bg-changed'));
      addToast(language === 'zh-CN' ? '终端壁纸已更新' : 'Wallpaper updated', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleTermBgReset = () => {
    setTermBgImage('');
    localStorage.removeItem('termBgImage');
    window.dispatchEvent(new CustomEvent('terminal-bg-changed'));
    addToast(language === 'zh-CN' ? '已恢复默认壁纸' : 'Reset to default', 'success');
  };

  const handleTermBgOpacityChange = (e) => {
    const val = parseFloat(e.target.value);
    setTermBgOpacity(val);
    localStorage.setItem('termBgOpacity', String(val));
    window.dispatchEvent(new CustomEvent('terminal-bg-changed'));
  };


  useEffect(() => {
    AppGo.GetWebdavConfig()
      .then((data) => {
        if (data) {
          setWebdavForm((f) => ({
            ...f,
            url: data.url || f.url,
            username: data.username || '',
            password: data.password || '',
            remotePath: data.remotePath || f.remotePath,
          }));
          if (data.username) {
            setIsConfigured(true);
          }
        }
      })
      .catch(() => {});
  }, []);

  const setWebdav = (key) => (e) => setWebdavForm((f) => ({ ...f, [key]: e.target.value }));

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await AppGo.TestWebdavConnection(webdavForm.url, webdavForm.username, webdavForm.password);
      setTestResult('ok');
      addToast('WebDAV 连接测试成功 ✓', 'success');
    } catch (err) {
      setTestResult('fail');
      addToast(`WebDAV 连接失败: ${err}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await AppGo.SaveWebdavConfig(webdavForm);
      addToast('WebDAV 配置已保存', 'success');
      if (webdavForm.username) {
        setIsConfigured(true);
        setIsEditing(false);
      }
    } catch (err) {
      addToast(err, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      await AppGo.SaveWebdavConfig(webdavForm);
      const data = await AppGo.BackupToWebdav();
      setLastBackup(data.time);
      addToast(`备份成功！已备份 ${data.count} 个服务器配置`, 'success');
    } catch (err) {
      addToast(`备份失败: ${err}`, 'error');
    } finally {
      setBacking(false);
    }
  };

  const handleRestore = async () => {
    setLoadingBackups(true);
    try {
      const list = await AppGo.ListWebdavBackups();
      if (!list || list.length === 0) {
        addToast('云端未找到任何备份文件', 'error');
        return;
      }
      list.sort((a, b) => new Date(b.time) - new Date(a.time));
      setBackupsList(list);
      setSelectedBackup(list[0].name);
      setConfirmRestore(true);
    } catch (err) {
      addToast(`获取备份列表失败: ${err}`, 'error');
    } finally {
      setLoadingBackups(false);
    }
  };

  const doRestore = async () => {
    if (!selectedBackup) return;
    setConfirmRestore(false);
    setRestoring(true);
    try {
      await AppGo.RestoreFromWebdavFile(selectedBackup);
      addToast('恢复成功', 'success');
      onRestored?.();
    } catch (err) {
      addToast(`恢复失败: ${err}`, 'error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', height: '80vh' }}>
        
        {/* Settings Header */}
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>{t.title}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'var(--text-3)' }}>✕</button>
        </div>

        {/* Settings Body Layout */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Settings Sidebar */}
          <div className="settings-sidebar" style={{ width: 220, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TABS.map(tab => (
              <div 
                key={tab.id}
                className={`sidebar-menu-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
              >
                <span>{tab.icon}</span> {t.tabs[tab.id]}
              </div>
            ))}
          </div>

          {/* Settings Content */}
          <div className="settings-content" style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
            
            {activeTab === 'app' && (
              <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 24px', gap: 32, maxWidth: 640 }}>
                {/* 顶部布局：图标与标题 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                  <img 
                    src={logoImg} 
                    alt="Aether" 
                    style={{ 
                      width: 96, 
                      height: 96, 
                      borderRadius: 24, 
                      boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-light)'
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ 
                      fontSize: 32, 
                      fontWeight: 800, 
                      color: 'var(--text-1)',
                      letterSpacing: '-0.5px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 8
                    }}>
                      Aether
                      <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-4)', letterSpacing: '0' }}>by Angus</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                        {CURRENT_VERSION}
                      </span>
                      {updateInfo?.hasUpdate && (
                        <span 
                          onClick={handleApplyUpdate}
                          style={{ 
                            background: downloadProgress >= 0 ? '#1e3a8a' : '#065f46', 
                            color: downloadProgress >= 0 ? '#93c5fd' : '#34d399', 
                            borderRadius: 12, 
                            padding: '2px 8px', 
                            fontSize: 12, 
                            fontWeight: 600,
                            cursor: downloadProgress >= 0 ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            boxShadow: downloadProgress >= 0 ? '0 2px 8px rgba(30,58,138,0.3)' : '0 2px 8px rgba(6,95,70,0.3)',
                            position: 'relative',
                            overflow: 'hidden',
                            minWidth: 80,
                            justifyContent: 'center'
                          }}
                        >
                          {downloadProgress >= 0 && (
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'rgba(59, 130, 246, 0.4)', width: `${downloadProgress}%`, transition: 'width 0.2s ease-out' }}></div>
                          )}
                          <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {downloadProgress >= 0 ? (
                               <>
                                 <svg className="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                                 {downloadProgress}%
                               </>
                            ) : (
                               <>
                                 <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                 {updateInfo.latestVersion} {language === 'zh-CN' ? '立即更新' : 'Update Now'}
                               </>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 0 }}>
                  <button 
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    style={{ 
                      background: 'var(--bg-2)', 
                      color: 'var(--text-3)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 8, 
                      padding: '6px 16px', 
                      fontSize: 13, 
                      fontWeight: 500,
                      cursor: checkingUpdate ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                      opacity: checkingUpdate ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => { if(!checkingUpdate) { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
                    onMouseLeave={(e) => { if(!checkingUpdate) { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.color = 'var(--text-3)'; } }}
                  >
                    <svg className={checkingUpdate ? 'spin' : ''} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
                    {checkingUpdate 
                       ? (language === 'zh-CN' ? '检查中...' : 'Checking...') 
                       : (language === 'zh-CN' ? '检查更新' : 'Check Updates')}
                  </button>
                </div>

                {/* 列表项 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  <div 
                    onClick={() => window.runtime?.BrowserOpenURL('https://github.com/angusdevgo/Aether-SSH/issues/new')}
                    className="about-list-item"
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--bg-2)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-2)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M9 15L15 15"></path><path d="M12 12L12 18"></path></svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t.about.reportTitle}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{t.about.reportDesc}</span>
                    </div>
                  </div>

                  <div 
                    onClick={() => window.runtime?.BrowserOpenURL('https://github.com/angusdevgo/Aether-SSH/discussions')}
                    className="about-list-item"
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--bg-2)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-2)' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t.about.communityTitle}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{t.about.communityDesc}</span>
                    </div>
                  </div>

                  <div 
                    onClick={() => window.runtime?.BrowserOpenURL('https://github.com/angusdevgo/Aether-SSH')}
                    className="about-list-item"
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--bg-2)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-2)' }}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t.about.githubTitle}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{t.about.githubDesc}</span>
                    </div>
                  </div>

                  <div 
                    onClick={() => window.runtime?.BrowserOpenURL('https://github.com/angusdevgo/Aether-SSH/releases')}
                    className="about-list-item"
                    style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s', background: 'var(--bg-2)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-2)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{t.about.changelogTitle}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{t.about.changelogDesc}</span>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'network' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {/* 延迟检测协议 */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{t.network.pingProtocolTitle}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{t.network.pingProtocolDesc}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { id: 'ssh', label: t.network.sshLabel, desc: t.network.sshDesc, tag: t.network.sshTag },
                      { id: 'tcp', label: t.network.tcpLabel, desc: t.network.tcpDesc },
                    ].map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => { setPingProtocol(opt.id); localStorage.setItem('pingProtocol', opt.id); }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px',
                          background: pingProtocol === opt.id ? 'var(--green-dim)' : 'var(--bg-2)',
                          border: `1px solid ${pingProtocol === opt.id ? 'var(--green-glow)' : 'var(--border)'}`,
                          borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                          border: `2px solid ${pingProtocol === opt.id ? 'var(--green)' : 'var(--border)'}`,
                          background: pingProtocol === opt.id ? 'var(--green)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {pingProtocol === opt.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{opt.label}</span>
                            {opt.tag && <span style={{ fontSize: 10, background: 'var(--green-dim)', border: '1px solid var(--green-glow)', color: 'var(--green)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{opt.tag}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 3 }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-4)', lineHeight: 1.7, border: '1px solid var(--border-light)' }}>
                    💡 <strong style={{ color: 'var(--text-3)' }}>提示：</strong>{t.network.tip}
                  </div>
                </div>

                {/* 监控刷新频率 */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>{t.network.refreshTitle}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{t.network.refreshDesc}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.network.probeRefresh}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {[3, 5, 10, 30].map(s => (
                          <button
                            key={s}
                            onClick={() => { setProbeInterval(s); localStorage.setItem('probeInterval', String(s)); }}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              borderColor: probeInterval === s ? 'var(--green)' : 'var(--border)',
                              background: probeInterval === s ? 'var(--green-dim)' : 'var(--bg-3)',
                              color: probeInterval === s ? 'var(--green)' : 'var(--text-3)',
                              transition: 'all 0.15s',
                            }}
                          >{s}s</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.network.pingRefresh}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {[2, 5, 10, 30].map(s => (
                          <button
                            key={s}
                            onClick={() => {
                              setPingInterval(s);
                              localStorage.setItem('pingInterval', String(s));
                              window.dispatchEvent(new Event('pingIntervalChanged'));
                            }}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              borderColor: pingInterval === s ? 'var(--green)' : 'var(--border)',
                              background: pingInterval === s ? 'var(--green-dim)' : 'var(--bg-3)',
                              color: pingInterval === s ? 'var(--green)' : 'var(--text-3)',
                              transition: 'all 0.15s',
                            }}
                          >{s}s</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'appearance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>{t.appearance.langTitle}</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.langLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.langDesc}</div>
                      </div>
                      <select className="select" style={{ width: 200 }} value={language} onChange={handleLanguageChange}>
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </div>
                    <div className="divider" style={{ margin: '12px 0', borderTop: '1px solid var(--border)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.fontLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.fontDesc}</div>
                      </div>
                      <select className="select" style={{ width: 200 }} value={appFont} onChange={handleFontChange}>
                        <option value="system-ui">系统默认</option>
                        <option value="Open Sans">Open Sans</option>
                        <option value="Inter">Inter</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                      </select>
                    </div>
                    <div className="divider" style={{ margin: '12px 0', borderTop: '1px solid var(--border)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.termFontLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.termFontDesc}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input 
                          type="range" 
                          min="10" 
                          max="28" 
                          step="1" 
                          value={terminalFontSize} 
                          onChange={handleTerminalFontChange} 
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, width: 32, textAlign: 'right', color: 'var(--text-1)' }}>{terminalFontSize}px</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 本地回显 ── */}
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>本地回显</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>预测性本地回显</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11, marginTop: 2 }}>输入时立即本地显示，不等服务器回显。高延迟服务器建议开启；若出现字符重复/抖动可关闭</div>
                      </div>
                      <div
                        onClick={handleToggleLocalEcho}
                        style={{
                          width: 40, height: 24,
                          background: terminalLocalEcho ? 'var(--green)' : 'var(--bg-4)',
                          borderRadius: 12, position: 'relative', cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <div style={{
                          position: 'absolute',
                          left: terminalLocalEcho ? 18 : 2,
                          top: 1, width: 20, height: 20,
                          background: '#fff', borderRadius: '50%',
                          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 终端颜色主题 ── */}
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>终端颜色主题</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-4)', fontSize: 11, marginBottom: 12 }}>选择终端的配色风格，即时生效</div>
                    <div className="theme-palette-grid">
                      {[
                        { key: 'aether',      name: 'Aether Default', swatches: ['var(--green)', '#58a6ff', '#bc8cff', '#ff7b72'] },
                        { key: 'tokyo-night', name: 'Tokyo Night',    swatches: ['#7aa2f7', '#bb9af7', '#73daca', '#f7768e'] },
                        { key: 'catppuccin',  name: 'Catppuccin',     swatches: ['#cba6f7', '#89b4fa', '#a6e3a1', '#f38ba8'] },
                        { key: 'dracula',     name: 'Dracula',        swatches: ['#ff79c6', '#bd93f9', '#50fa7b', '#ff5555'] },
                      ].map(({ key, name, swatches }) => (
                        <div
                          key={key}
                          className={`theme-palette-card${terminalColorTheme === key ? ' active' : ''}`}
                          onClick={() => {
                            setTerminalColorTheme(key);
                            localStorage.setItem('terminalColorTheme', key);
                            window.dispatchEvent(new CustomEvent('terminal-theme-changed', { detail: key }));
                          }}
                        >
                          <div className="theme-palette-swatches">
                            {swatches.map((c, i) => (
                              <div key={i} className="theme-palette-swatch" style={{ background: c }} />
                            ))}
                          </div>
                          <div className="theme-palette-name">{name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>{t.appearance.themeTitle}</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.themeLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.themeDesc}</div>
                      </div>
                      <div style={{ display: 'flex', background: 'var(--bg-1)', borderRadius: 'var(--radius-xl)', padding: 4, border: '1px solid var(--border)' }}>
                        <button className={`btn btn-sm ${themeMode === 'light' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('light')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'light' ? 'var(--bg-3)' : 'transparent' }}>{t.appearance.themeLight}</button>
                        <button className={`btn btn-sm ${themeMode === 'system' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('system')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'system' ? 'var(--bg-3)' : 'transparent' }}>{t.appearance.themeSys}</button>
                        <button className={`btn btn-sm ${themeMode === 'dark' ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleThemeChange('dark')} style={{ borderRadius: 'var(--radius-xl)', background: themeMode === 'dark' ? 'var(--bg-3)' : 'transparent' }}>{t.appearance.themeDark}</button>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>{t.appearance.accentTitle}</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.accentLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.accentDesc}</div>
                      </div>
                      <div 
                        onClick={handleToggleAccent}
                        style={{ 
                          width: 40, height: 24, 
                          background: useCustomAccent ? 'var(--green)' : 'var(--bg-4)', 
                          borderRadius: 12, position: 'relative', cursor: 'pointer',
                          transition: 'background 0.2s ease',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <div style={{ 
                          position: 'absolute', 
                          left: useCustomAccent ? 18 : 2, 
                          top: 1, width: 20, height: 20, 
                          background: '#fff', borderRadius: '50%',
                          transition: 'left 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.4)'
                        }}></div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['#3b82f6','#8b5cf6','#d946ef','#f43f5e','#f97316','#eab308','#84cc16','#10b981','#06b6d4','#64748b'].map((color, i) => (
                        <div key={i} onClick={() => handleColorChange(color)} style={{ 
                          width: 24, height: 24, borderRadius: '50%', background: color, cursor: 'pointer',
                          border: themeAccent === color ? '2px solid #fff' : 'none',
                          boxShadow: themeAccent === color ? `0 0 0 2px ${color}` : 'none'
                        }} />
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>{t.appearance.termBgTitle}</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.termBgLabel}</div>
                        <div style={{ color: 'var(--text-4)', fontSize: 11 }}>{t.appearance.termBgDesc}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {termBgImage && (
                          <button className="btn btn-ghost btn-sm" onClick={handleTermBgReset} style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {t.appearance.termBgReset}
                          </button>
                        )}
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: 12, borderRadius: 'var(--radius-sm)' }}>
                          {t.appearance.termBgUpload}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTermBgUpload} />
                        </label>
                      </div>
                    </div>
                    <div className="divider" style={{ margin: '12px 0', borderTop: '1px solid var(--border)' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: 'var(--text-1)', fontSize: 13 }}>{t.appearance.termBgOpacityLabel}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <input 
                          type="range" 
                          min="0.0" 
                          max="1.0" 
                          step="0.05" 
                          value={termBgOpacity} 
                          onChange={handleTermBgOpacityChange} 
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 13, width: 32, textAlign: 'right', color: 'var(--text-1)' }}>{Math.round(termBgOpacity * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: 14, color: 'var(--text-1)', marginBottom: 12, fontWeight: 600 }}>终端快捷键</h3>
                  <div className="form-group" style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>从终端复制</span>
                      <button 
                        onClick={() => setListeningKey('copy')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'copy' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'copy' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'copy' ? '请按下快捷键...' : shortcuts.copy}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>粘贴到终端</span>
                      <button 
                        onClick={() => setListeningKey('paste')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'paste' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'paste' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'paste' ? '请按下快捷键...' : shortcuts.paste}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>清空终端缓冲区</span>
                      <button 
                        onClick={() => setListeningKey('clear')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'clear' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'clear' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'clear' ? '请按下快捷键...' : shortcuts.clear}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>新建本地标签页</span>
                      <button 
                        onClick={() => setListeningKey('newTab')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'newTab' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'newTab' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'newTab' ? '请按下快捷键...' : shortcuts.newTab}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>打断当前指令 (SIGINT)</span>
                      <button 
                        onClick={() => setListeningKey('sigint')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'sigint' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'sigint' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'sigint' ? '请按下快捷键...' : shortcuts.sigint}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>结束终端会话 (EOF)</span>
                      <button 
                        onClick={() => setListeningKey('eof')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'eof' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'eof' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'eof' ? '请按下快捷键...' : shortcuts.eof}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>后台挂起进程 (SIGTSTP)</span>
                      <button 
                        onClick={() => setListeningKey('suspend')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'suspend' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'suspend' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'suspend' ? '请按下快捷键...' : shortcuts.suspend}
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                      <span style={{ color: 'var(--text-2)', fontSize: 13 }}>清空当前输入行</span>
                      <button 
                        onClick={() => setListeningKey('clearLine')} 
                        style={{ 
                          fontFamily: 'var(--font-mono)', fontSize: 12, 
                          color: listeningKey === 'clearLine' ? 'var(--green)' : 'var(--text-4)', 
                          background: 'var(--bg-1)', padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                          border: listeningKey === 'clearLine' ? '1px solid var(--green)' : '1px solid var(--border)',
                          transition: 'var(--transition)'
                        }}
                      >
                        {listeningKey === 'clearLine' ? '请按下快捷键...' : shortcuts.clearLine}
                      </button>
                    </div>

                  </div>
                  <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-4)' }}>注：部分快捷键行为受终端内的 Shell 设置影响。</p>
                </div>
              </div>
            )}

            {activeTab === 'sync' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
                <div style={{ background: 'var(--bg-2)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☁️</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>WebDAV 配置</div>
                      <div style={{ fontSize: 12, color: 'var(--text-4)' }}>配置 WebDAV 端点用于加密同步服务器列表</div>
                    </div>
                  </div>

                  {isConfigured && !isEditing ? (
                    <div style={{ 
                      position: 'relative',
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, var(--bg-1) 100%)', 
                      border: '1px solid rgba(16, 185, 129, 0.2)', 
                      borderRadius: 'var(--radius-lg)', 
                      padding: '24px',
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 20,
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', 
                        background: 'var(--green)',
                        boxShadow: '0 0 12px var(--green)'
                      }} />
                      
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ 
                            width: 10, height: 10, 
                            borderRadius: '50%', 
                            background: 'var(--green)',
                            boxShadow: '0 0 10px var(--green)'
                          }}></div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '0.3px' }}>已成功绑定 WebDAV 服务</div>
                        </div>
                        <button 
                          onClick={() => setIsEditing(true)}
                          style={{ 
                            padding: '6px 14px', 
                            borderRadius: 'var(--radius-sm)', 
                            fontSize: 13,
                            fontWeight: 500,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-2)',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          修改配置
                        </button>
                      </div>

                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '16px',
                        marginTop: '4px'
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>绑定账号</span>
                          <span style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{webdavForm.username}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>备份目录</span>
                          <span style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{webdavForm.remotePath}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>服务器地址</span>
                          <span style={{ fontSize: 14, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webdavForm.url}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="form-group">
                        <label className="form-label">端点地址 (URL)</label>
                        <input className="input" value={webdavForm.url} onChange={setWebdav('url')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">用户名</label>
                        <input className="input" value={webdavForm.username} onChange={setWebdav('username')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">密码 / 授权码</label>
                        <input className="input" type="password" value={webdavForm.password} onChange={setWebdav('password')} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">远程保存目录</label>
                        <input className="input" value={webdavForm.remotePath} onChange={setWebdav('remotePath')} />
                      </div>

                      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                        <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
                          {testing ? '测试中...' : '🔌 测试连接'} {testResult === 'ok' && '✓'} {testResult === 'fail' && '✗'}
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                          {loading ? '保存中...' : '💾 保存配置'}
                        </button>
                        {isEditing && (
                          <button className="btn btn-ghost" onClick={() => setIsEditing(false)} style={{ marginLeft: 'auto' }}>
                            取消
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-2)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>云端同步</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>同步所有配置，全程 AES-256 高强加密</div>
                  
                  {isConfigured && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--green-dim)', border: '1px solid var(--green-glow)', borderRadius: 8, marginBottom: 20, color: 'var(--green)', fontSize: 13 }}>
                      <span>✨</span> <span><strong>已开启自动云端备份：</strong>当您添加、编辑、删除服务器或修改配置时，后台将静默保存至云端。</span>
                    </div>
                  )}

                  {lastBackup && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 12 }}>上次同步: {lastBackup}</div>}
                  
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-primary" onClick={handleBackup} disabled={backing}>
                      ☁️ 上传到云端
                    </button>
                    <button className="btn btn-secondary" onClick={handleRestore} disabled={restoring}>
                      🔄 从云端恢复
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
      {/* 确认恢复弹窗（含列表选择） */}
      {confirmRestore && (
        <div className="modal-overlay" style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ width: 450, padding: 24, animation: 'scaleIn 0.2s ease-out' }}>
            <div style={{ fontSize: 18, color: 'var(--text-1)', marginBottom: 16, fontWeight: 'bold' }}>选择要恢复的云端备份</div>
            <div style={{ color: 'var(--text-2)', marginBottom: 16, fontSize: 14 }}>
              此操作将覆盖当前所有的本地服务器配置，且无法撤销。请选择要恢复的备份时间：
            </div>
            
            <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 20, background: 'var(--bg-0)', borderRadius: 'var(--radius-md)', padding: 8 }}>
              {backupsList.map(bk => (
                <div 
                  key={bk.name}
                  onClick={() => setSelectedBackup(bk.name)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: selectedBackup === bk.name ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                    border: `1px solid ${selectedBackup === bk.name ? 'var(--primary)' : 'transparent'}`,
                    marginBottom: 4,
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ color: selectedBackup === bk.name ? 'var(--primary)' : 'var(--text-1)' }}>
                    {bk.time}
                  </div>
                  <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {(bk.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ padding: '0 20px' }} onClick={() => setConfirmRestore(false)}>取消</button>
              <button className="btn" style={{ backgroundColor: 'var(--red)', color: '#fff', border: 'none', padding: '0 20px' }} onClick={doRestore} disabled={!selectedBackup}>
                确定恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
