import { useState, useEffect, useCallback, useRef } from 'react';
import { EventsOn, WindowMinimise, WindowToggleMaximise, WindowHide, Quit } from '../wailsjs/runtime/runtime.js';
import * as AppGo from '../wailsjs/go/main/App.js';
import ServerList from './components/ServerList.jsx';
import AddServerModal from './components/AddServerModal.jsx';
import Terminal from './components/Terminal.jsx';
import ProbePanel from './components/ProbePanel.jsx';
import FileManager from './components/FileManager.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Toast from './components/Toast.jsx';
import CommandHistory from './components/CommandHistory.jsx';
import QuickCommands from './components/QuickCommands.jsx';
import PortForward from './components/PortForward.jsx';
import { useSessions } from './useSessions.js';
import GlobalDialog from './components/GlobalDialog.jsx';
import GlobalContextMenu from './components/GlobalContextMenu.jsx';
import { clampPanelWidth } from './components/probeFormatting.js';
import { useTranslation } from './i18n.js';
import { APP_VERSION } from './config.js';
import { applyStoredTheme } from './theme.js';
import { Settings, House, Key, Minus, Square, X, RefreshCw, Wifi, Monitor, Eye, EyeOff, LayoutGrid, List, Plus, Terminal as TerminalIcon, Folder, History, Zap, Plug, Layout } from 'lucide-react';

import logoImg from './assets/logo.png';

export default function App() {
  const { t } = useTranslation();
  const [servers, setServers] = useState([]);
  const [pings, setPings] = useState({});

  const [contentTab, setContentTab] = useState('terminal');
  const [showAddServer, setShowAddServer] = useState(false);
  const [editServer, setEditServer] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showTrayPanel, setShowTrayPanel] = useState(false);
  const [showProbe, setShowProbe] = useState(false); // 探针面板 toggle
  const [tabMenu, setTabMenu] = useState(null); // { sessionId, x, y }
  const [renamingTab, setRenamingTab] = useState(null); // sessionId being renamed
  const [renameValue, setRenameValue] = useState('');
  const [showQuickCommands, setShowQuickCommands] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [monitoringEnabled, setMonitoringEnabled] = useState({}); // { [sessionId]: boolean }
  const [serverListViewMode, setServerListViewMode] = useState(localStorage.getItem('serverListViewMode') || 'grid'); // 'grid' | 'table'
  const [fileManagerPosition, setFileManagerPosition] = useState(localStorage.getItem('fileManagerPosition') || 'tab'); // 'tab' | 'right' | 'bottom'
  
  // ── 新增自动检测更新状态 ──────────────────────────────
  const [startupUpdateInfo, setStartupUpdateInfo] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(-1);
  const [isUpdateModalVisible, setIsUpdateModalVisible] = useState(false);
  
  // ── 新增分屏拖拽大小控制状态与逻辑 ──────────────────────
  const [leftSplitWidth, setLeftSplitWidth] = useState(() => {
    return parseInt(localStorage.getItem('leftSplitWidth') || '320', 10);
  });
  const [bottomSplitHeight, setBottomSplitHeight] = useState(() => {
    return parseInt(localStorage.getItem('bottomSplitHeight') || '250', 10);
  });
  const [probePanelWidth, setProbePanelWidth] = useState(() => {
    return clampPanelWidth(localStorage.getItem('probePanelWidth') || '320');
  });

  const leftSplitWidthRef = useRef(leftSplitWidth);
  const bottomSplitHeightRef = useRef(bottomSplitHeight);
  const probePanelWidthRef = useRef(probePanelWidth);

  // 顶部会话标签的 DOM 引用，用于把活动标签滚动到可视区
  const tabItemRefs = useRef({});

  const updateLeftSplitWidth = (w) => {
    setLeftSplitWidth(w);
    leftSplitWidthRef.current = w;
  };
  const updateBottomSplitHeight = (h) => {
    setBottomSplitHeight(h);
    bottomSplitHeightRef.current = h;
  };
  const updateProbePanelWidth = (w) => {
    const next = clampPanelWidth(w);
    setProbePanelWidth(next);
    probePanelWidthRef.current = next;
  };

  const startDrag = (e, direction) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = leftSplitWidthRef.current;
    const startHeight = bottomSplitHeightRef.current;
    const startProbeWidth = probePanelWidthRef.current;

    const resizer = e.target;
    resizer.classList.add('dragging');

    document.body.style.cursor = direction === 'bottom' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent) => {
      if (direction === 'left') {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(180, Math.min(800, startWidth + deltaX));
        updateLeftSplitWidth(newWidth);
      } else if (direction === 'probe') {
        const deltaX = startX - moveEvent.clientX;
        updateProbePanelWidth(startProbeWidth + deltaX);
      } else {
        const deltaY = startY - moveEvent.clientY; // 往上拖高度变大
        const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
        updateBottomSplitHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (direction === 'left') {
        localStorage.setItem('leftSplitWidth', leftSplitWidthRef.current.toString());
      } else if (direction === 'probe') {
        localStorage.setItem('probePanelWidth', probePanelWidthRef.current.toString());
      } else {
        localStorage.setItem('bottomSplitHeight', bottomSplitHeightRef.current.toString());
      }

      // 通知所有终端自适应重绘
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  // ────────────────────────────────────────────────────────

  const pingTimerRef = useRef(null);
  // 不可达服务器冷却表：记录最近确认不可达的时间，冷却期内跳过重试，
  // 避免对宕机/防火墙拦截的服务器每 2 秒持续发起 TCP 连接尝试（污染本地网络栈、干扰其他连接）
  const pingFailCooldownRef = useRef({});

  // ── 新增主页仪表盘状态 ──────────────────────────────────
  const [recentServers, setRecentServers] = useState([]);
  const [isRefreshingPing, setIsRefreshingPing] = useState(false);
  const [pingInterval, setPingInterval] = useState(parseInt(localStorage.getItem('pingInterval') || '2', 10));

  useEffect(() => {
    const handler = () => {
      setPingInterval(parseInt(localStorage.getItem('pingInterval') || '2', 10));
    };
    window.addEventListener('pingIntervalChanged', handler);
    return () => window.removeEventListener('pingIntervalChanged', handler);
  }, []);

  // 闪电直连的表单状态
  const [quickName, setQuickName] = useState('');
  const [quickHost, setQuickHost] = useState('');
  const [quickPort, setQuickPort] = useState('22');
  const [quickUser, setQuickUser] = useState('root');
  const [quickAuth, setQuickAuth] = useState('password');
  const [quickPass, setQuickPass] = useState('');
  const [quickKey, setQuickKey] = useState('');
  const [quickPassphrase, setQuickPassphrase] = useState('');
  const [showQuickPass, setShowQuickPass] = useState(false);
  const [showQuickPassphrase, setShowQuickPassphrase] = useState(false);

  // ── 初始化全局主题（暗/浅色 + 风格预设 / 自定义强调色）──
  useEffect(() => {
    applyStoredTheme();
  }, []);

  // ── 自动检测更新机制 ────────────────────────────────────
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/angusdevgo/Aether-SSH/releases/latest');
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.tag_name) {
          let latest = data.tag_name.replace(/^v+/i, '');
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

          if (isNewer(latest, APP_VERSION)) {
            let isPortable = false;
            if (window?.go?.main?.App?.IsPortableVersion) {
                isPortable = await window.go.main.App.IsPortableVersion();
            }
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
            setStartupUpdateInfo({
              version: 'v' + latest,
              url: downloadAssetUrl || data.html_url,
              filename: downloadFilename || 'update.exe',
              digest: downloadDigest,
              body: data.body || '',
            });
            setIsUpdateModalVisible(true);
          }
        }
      } catch (err) {}
    };
    
    // 延迟 2.5 秒触发检测，避免阻塞应用首次极速渲染
    setTimeout(checkUpdate, 2500);
  }, []);

  useEffect(() => {
    const handleProgress = (e) => {
      if (typeof e.detail === 'number') {
        setDownloadProgress(e.detail);
      }
    };
    window.addEventListener('app-update-progress', handleProgress);
    return () => window.removeEventListener('app-update-progress', handleProgress);
  }, []);

  const handleApplyStartupUpdate = async () => {
    if (!startupUpdateInfo || !startupUpdateInfo.url) return;
    if (downloadProgress >= 0) return; // 正在下载中
    
    if (!startupUpdateInfo.url.endsWith('.exe')) {
       window.runtime?.BrowserOpenURL(startupUpdateInfo.url);
       setIsUpdateModalVisible(false);
       return;
    }

    setDownloadProgress(0);
    try {
      if (!startupUpdateInfo.digest) {
        // 资产无 SHA-256 摘要（GitHub 未生成或为旧资产）：拒绝自动更新，引导手动下载
        window.runtime?.BrowserOpenURL(startupUpdateInfo.url);
        setIsUpdateModalVisible(false);
        return;
      }
      await AppGo.UpdateApp(startupUpdateInfo.url, startupUpdateInfo.filename, startupUpdateInfo.digest);
    } catch (err) {
      setDownloadProgress(-1);
      addToast(`自动更新失败 — 请使用「手动下载」`, 'error', 4000);
    }
  };

  // ── 加载最近常用会话 ────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recent_servers');
      if (saved) {
        setRecentServers(JSON.parse(saved));
      }
    } catch (e) {}
  }, []);

  // ── 浏览选择快捷连接的私钥 ──────────────────────────────
  const handleQuickPrivateKeyFile = async () => {
    try {
      const content = await AppGo.ReadPrivateKeyFile();
      if (content) {
        setQuickKey(content);
      }
    } catch (e) {
      if (e) window.aetherDialog?.alert(`读取私钥文件失败: ${e}`, '错误');
    }
  };

  // ── 刷新延迟 ────────────────────────────────────────────
  const handleRefreshPing = async () => {
    setIsRefreshingPing(true);
    await pingAll();
    setTimeout(() => setIsRefreshingPing(false), 800);
  };

  // ── 闪电直连逻辑 ────────────────────────────────────────
  const handleQuickConnectDirect = async (e) => {
    if (e) e.preventDefault();
    if (!quickHost.trim()) return window.aetherDialog?.alert('请填写主机地址');

    const tempId = `temp_${Date.now()}`;
    const tempServer = {
      id: '',
      name: quickName.trim() || `闪连_${quickHost}`,
      host: quickHost.trim(),
      port: parseInt(quickPort, 10) || 22,
      username: quickUser.trim(),
      authMethod: quickAuth === 'key' ? 'privateKey' : 'password',
      password: quickPass,
      privateKey: quickKey,
      passphrase: quickPassphrase,
    };

    const sessionId = `session_${Date.now()}`;
    const newSession = {
      id: sessionId,
      serverId: tempId,
      serverName: tempServer.name,
      host: tempServer.host,
      status: 'connecting',
    };

    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(sessionId);
    setContentTab('terminal');
    // 显示连接进度卡片
    setConnectingServer({ server: tempServer, sessionId, startTime: Date.now() });

    try {
      const savedServer = await AppGo.SaveConnection(tempServer);
      await loadServers();
      triggerAutoBackup();

      await AppGo.ConnectSSH(sessionId, savedServer.id);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, serverId: savedServer.id, status: 'connected' } : s))
      );
      setConnectingServer(null);

      // 连接成功后自动查询 OS信息并更新 sessions
      try {
        const info = await AppGo.SystemInfo(sessionId);
        if (info) {
          setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, osInfo: info } : s));
          // 检测到探针执行成功，自动启用监控面板，不需用户再次确认
          setMonitoringEnabled((prev) => ({ ...prev, [sessionId]: true }));
          const detectedOs = info.os || info.platform || '';
          if (detectedOs) {
            setServers(prevServers => {
              const currentServer = prevServers.find(s => s.id === savedServer.id);
              if (currentServer && currentServer.os !== detectedOs) {
                const updatedServer = { ...currentServer, os: detectedOs };
                AppGo.SaveConnection(updatedServer).catch(console.error);
                return prevServers.map(s => s.id === updatedServer.id ? updatedServer : s);
              }
              return prevServers;
            });
          }
        }
      } catch (_) {}

      // 加入最近连接
      setRecentServers((prev) => {
        const filtered = prev.filter((s) => s.id !== savedServer.id);
        const updated = [savedServer, ...filtered].slice(0, 4);
        localStorage.setItem('recent_servers', JSON.stringify(updated));
        return updated;
      });

      // 清空表单
      setQuickName('');
      setQuickHost('');
      setQuickPass('');
      setQuickKey('');
      setQuickPassphrase('');
    } catch (err) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'error' } : s))
      );
      addToast(`连接失败: ${err}`, 'error', 5000);
    }
  };

  // ── Toast helpers ──────────────────────────────────────────
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  // ── Load servers ───────────────────────────────────────────
  const loadServers = useCallback(async () => {
    try {
      const data = await AppGo.GetConnections();
      setServers(data || []);
    } catch (e) {
      addToast('加载服务器配置失败', 'error');
    }
  }, [addToast]);

  // ── 会话管理 (useSessions hook 替代 inline 130 行) ──────
  const handleConnected = (sessionId, info) => {
    setMonitoringEnabled(prev => ({ ...prev, [sessionId]: true }));
    const detectedOs = info.os || info.platform || '';
    if (detectedOs) {
      setServers(prevServers => {
        const sid = sessions.find(s => s.id === sessionId)?.serverId;
        const currentServer = prevServers.find(s => s.id === sid);
        if (currentServer && currentServer.os !== detectedOs) {
          const updated = { ...currentServer, os: detectedOs };
          AppGo.SaveConnection(updated).catch(console.error);
          return prevServers.map(s => s.id === updated.id ? updated : s);
        }
        return prevServers;
      });
    }
  };
  const {
    sessions, setSessions, activeSessionId, setActiveSessionId,
    connectingServer, setConnectingServer,
    connectServer, reconnectSession, closeSession,
  } = useSessions(addToast, handleConnected);

  // ── 活动标签自动滚入视野（标签很多时不再"找不到当前标签"）──
  // 注意：必须放在 useSessions() 解构之后，否则 activeSessionId 尚未初始化（TDZ）。
  useEffect(() => {
    const el = activeSessionId && tabItemRefs.current[activeSessionId];
    if (el) {
      el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [activeSessionId, sessions.length]);

  // 包装 connectServer 以处理 contentTab 和 recentServers
  const connectServerWrapped = useCallback(async (server) => {
    setContentTab('terminal');
    connectServer(server);
    setRecentServers(prev => {
      const filtered = prev.filter(s => s.id !== server.id);
      const updated = [server, ...filtered].slice(0, 4);
      localStorage.setItem('recent_servers', JSON.stringify(updated));
      return updated;
    });
  }, [connectServer]);

  useEffect(() => { loadServers(); }, [loadServers]);

  // ── Ping all servers ───────────────────────────────────────
  const pingAll = useCallback(async () => {
    if (servers.length === 0) return;
    const results = await Promise.all(
      servers.map(async (s) => {
        try {
          // 冷却：15 秒内已确认不可达的服务器跳过重试
          const lastFail = pingFailCooldownRef.current[s.id];
          if (lastFail && Date.now() - lastFail < 15000) {
            return { id: s.id, online: false, latency: null };
          }
          const res = await AppGo.PingServer(s.host, s.port || 22);
          if (res && res.online) {
            delete pingFailCooldownRef.current[s.id];
          } else {
            pingFailCooldownRef.current[s.id] = Date.now();
          }
          return { id: s.id, ...res };
        } catch {
          pingFailCooldownRef.current[s.id] = Date.now();
          return { id: s.id, online: false, latency: null };
        }
      })
    );
    const map = {};
    results.forEach((r) => { map[r.id] = { online: r.online, latency: r.latency }; });
    setPings(map);
  }, [servers]);

  useEffect(() => {
    pingAll();
    // 修改为动态刷新延迟，降低后台消耗或提高实时性
    pingTimerRef.current = setInterval(pingAll, pingInterval * 1000);
    return () => clearInterval(pingTimerRef.current);
  }, [pingAll, pingInterval]);

  // ── 自动云端备份 ──────────────────────────────────────────
  const triggerAutoBackup = useCallback(async () => {
    try {
      const cfg = await AppGo.GetWebdavConfig();
      if (cfg && cfg.username) {
        await AppGo.BackupToWebdav();
      }
    } catch (e) {
      // 忽略失败，防止打扰用户
    }
  }, []);

  // ── 监听 SSH 意外断开事件 ────────────────────────────────────
  useEffect(() => {
    const unbind = EventsOn('ssh-disconnected', (sessionId) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'closed' } : s))
      );
      addToast('SSH 连接已意外断开', 'error', 4000);
    });
    return () => {
      if (unbind) unbind();
    };
  }, [addToast]);

  // ── 监听 SSH 主机密钥变更事件 ─────────────────────────────────
  useEffect(() => {
    const unbind = EventsOn('ssh-hostkey-changed', (hostname) => {
      addToast(`主机密钥已变更: ${hostname}，已自动信任新密钥`, 'warning', 5000);
    });
    return () => {
      if (unbind) unbind();
    };
  }, [addToast]);

  // ── 监听终端触发的重连请求 ──────────────────────────────────
  useEffect(() => {
    const handleReconnectTrigger = (e) => {
      const sessId = e.detail;
      const sess = sessions.find((s) => s.id === sessId);
      if (sess) {
        reconnectSession(sess);
      }
    };
    window.addEventListener('ssh-reconnect-trigger', handleReconnectTrigger);
    const handleQuickCommand = (e) => {
      const { sessionId: sid, command } = e.detail || {};
      if (sid) AppGo.WriteTerminal(sid, command);
    };
    window.addEventListener('ssh-quick-command', handleQuickCommand);
    return () => {
      window.removeEventListener('ssh-reconnect-trigger', handleReconnectTrigger);
      window.removeEventListener('ssh-quick-command', handleQuickCommand);
    };
  }, [sessions, reconnectSession]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // ── Quick Connect ──────────────────────────────────────────
  const handleQuickConnect = useCallback(() => {
    if (!searchQuery.trim()) return;

    // Check if it matches an existing server name or host
    const existing = servers.find(s => 
      s.name.toLowerCase() === searchQuery.toLowerCase() || 
      s.host === searchQuery
    );

    if (existing) {
      connectServerWrapped(existing);
      setSearchQuery('');
      return;
    }

    // Attempt to parse ssh string: [user@]host[:port]
    let user = 'root';
    let host = searchQuery.trim();
    let port = 22;

    if (host.includes('@')) {
      const parts = host.split('@');
      user = parts[0];
      host = parts[1];
    }
    
    if (host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      port = parseInt(parts[1], 10) || 22;
    }

    // Open Add Server Modal pre-filled
    setEditServer({
      name: host,
      host,
      port,
      username: user,
      authMode: 'password'
    });
    setShowAddServer(true);
    setSearchQuery('');

  }, [searchQuery, servers, connectServer]);

  // ── Server CRUD ────────────────────────────────────────────
  const handleSaveServer = useCallback(async (data) => {
    try {
      await AppGo.SaveConnection(data);
      await loadServers();
      addToast(data.id ? '服务器配置已更新' : '服务器添加成功', 'success');
      triggerAutoBackup();
    } catch (err) {
      addToast(err, 'error');
    }
    setShowAddServer(false);
    setEditServer(null);
  }, [loadServers, addToast, triggerAutoBackup]);

  const handleDeleteServer = useCallback(async (id) => {
    try {
      await AppGo.DeleteConnection(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      addToast('服务器已删除', 'success');
      triggerAutoBackup();
    } catch {
      addToast('删除失败', 'error');
    }
  }, [addToast, triggerAutoBackup]);

  const filteredServers = servers.filter(s => 
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (s.host || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.username || '').toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <div className="app-layout">
      {/* ── Topbar ───────────────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-content">
          <div className="topbar-logo no-drag" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={() => { setActiveSessionId(null); setShowSettings(false); }}>
            <img src={logoImg} alt="logo" />
            <div className="topbar-title" style={{ userSelect: 'none' }}>Aether</div>
          </div>
          
          {sessions.length > 0 && (
            <div className="tab-bar" style={{ flex: 1, padding: '0 16px', background: 'transparent', borderBottom: 'none', height: '100%', alignItems: 'center' }}>
              <button 
                className="btn btn-ghost btn-sm no-drag" 
                onClick={() => setActiveSessionId(null)} 
                style={{ marginRight: 8, height: '26px', display: 'flex', alignItems: 'center', gap: 4 }}
                title="返回主页"
              >
                <House size={14} />
              </button>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  ref={(el) => { if (el) tabItemRefs.current[s.id] = el; else delete tabItemRefs.current[s.id]; }}
                  className={`tab-item no-drag ${activeSessionId === s.id ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(s.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setTabMenu({ sessionId: s.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <span className="tab-status-dot" aria-hidden="true">
                    {s.status === 'connecting' ? '🟡' :
                     s.status === 'connected'  ? '🟢' :
                     s.status === 'error'      ? '🔴' :
                     s.status === 'closed'     ? '🔴' : '⚫'}
                  </span>
                  <span className="tab-label"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingTab(s.id);
                      setRenameValue(s.serverName);
                    }}
                  >
                    {renamingTab === s.id ? (
                      <input
                        className="rename-input no-drag"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => {
                          if (renameValue.trim()) {
                            setSessions(prev => prev.map(ss => ss.id === s.id ? { ...ss, serverName: renameValue.trim() } : ss));
                          }
                          setRenamingTab(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') { setRenamingTab(null); }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      s.serverName
                    )}
                  </span>
                  <span
                    className={`tab-reconnect no-drag ${(s.status === 'closed' || s.status === 'error') ? '' : 'is-hidden'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (s.status === 'closed' || s.status === 'error') reconnectSession(s);
                    }}
                    title="重新连接"
                  >
                    <RefreshCw size={12} />
                  </span>
                  <span
                    className="tab-close no-drag"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(s.id, e);
                    }}
                    title="关闭标签页"
                  >
                    <X size={12} />
                  </span>
                </div>
              ))}
            </div>
          )}
          {sessions.length === 0 && <div style={{ flex: 1 }}></div>}

          <div className="window-controls">
            <button className="btn btn-ghost btn-icon no-drag" onClick={() => setShowSettings(true)} title="设置" style={{ display: 'flex', alignItems: 'center' }}><Settings size={16} /></button>
            
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }}></div>
            
            <button className="btn btn-ghost btn-icon no-drag" onClick={WindowMinimise} title="最小化" style={{ display: 'flex', alignItems: 'center' }}><Minus size={14} /></button>
            <button className="btn btn-ghost btn-icon no-drag" onClick={WindowToggleMaximise} title="最大化" style={{ display: 'flex', alignItems: 'center' }}><Square size={14} /></button>
            <button
              className="btn btn-ghost btn-icon no-drag"
              title="最小化到托盘"
              onClick={() => {
                WindowHide();
                setShowTrayPanel(false);
              }}
            ><X size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── Main Area ─────────────────────────────────────── */}
      <main className="main-area">
        <div style={{ display: activeSessionId === null ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%' }}>
          <div className="dashboard-container">
            {/* 左半栏：快捷控制台 */}
            <div className="dashboard-left">
              {/* ⚡ 闪电直连卡片 */}
              <div className="glass-card quick-connect-box">
                <div className="card-header-icon-title">
                  <span className="card-header-icon">⚡</span>
                  <span className="card-header-title">{t('闪电直连')}</span>
                </div>
                <form onSubmit={handleQuickConnectDirect} className="quick-connect-form">
                  <div className="form-group-compact">
                    <label>{t('服务器别名（选填）')}</label>
                    <input className="input-compact" placeholder={t('例如：我的测试服')} value={quickName} onChange={e => setQuickName(e.target.value)} />
                  </div>
                  <div className="form-group-compact">
                    <label>{t('主机地址 *')}</label>
                    <div className="form-row-compact">
                      <input className="input-compact" style={{ flex: 3 }} placeholder="192.168.1.1" value={quickHost} onChange={e => setQuickHost(e.target.value)} required />
                      <input className="input-compact" style={{ flex: 1.2 }} placeholder="22" value={quickPort} onChange={e => setQuickPort(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group-compact">
                    <label>{t('用户名')}</label>
                    <input className="input-compact" placeholder="root" value={quickUser} onChange={e => setQuickUser(e.target.value)} />
                  </div>
                  <div className="form-group-compact">
                    <label>{t('认证方式')}</label>
                    <select className="select-compact" value={quickAuth} onChange={e => setQuickAuth(e.target.value)}>
                      <option value="password">{t('密码认证')}</option>
                      <option value="key">{t('私钥认证')}</option>
                    </select>
                  </div>
                  {quickAuth === 'password' ? (
                    <div className="form-group-compact" style={{ position: 'relative' }}>
                      <label>{t('密码')}</label>
                      <input className="input-compact" type={showQuickPass ? "text" : "password"} placeholder={t('请输入密码')} value={quickPass} onChange={e => setQuickPass(e.target.value)} style={{ paddingRight: 32 }} />
                      <button type="button" onClick={() => setShowQuickPass(!showQuickPass)} style={{ position: 'absolute', right: 6, bottom: 4, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                        {showQuickPass ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="form-group-compact">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ marginBottom: 0 }}>{t('私钥内容')}</label>
                          <button type="button" className="btn-text-action" onClick={handleQuickPrivateKeyFile}>📁 {t('浏览')}</button>
                        </div>
                        <textarea className="textarea-compact" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" value={quickKey} onChange={e => setQuickKey(e.target.value)} />
                      </div>
                      <div className="form-group-compact" style={{ position: 'relative' }}>
                        <label>{t('私钥密码短语 (可选)')}</label>
                        <input className="input-compact" type={showQuickPassphrase ? "text" : "password"} placeholder="Passphrase" value={quickPassphrase} onChange={e => setQuickPassphrase(e.target.value)} style={{ paddingRight: 32 }} />
                        <button type="button" onClick={() => setShowQuickPassphrase(!showQuickPassphrase)} style={{ position: 'absolute', right: 6, bottom: 4, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
                          {showQuickPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </>
                  )}
                  <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 12 }}>{t('立即闪连')}</button>
                 </form>
               </div>

              {/* 📊 状态概览 */}
              <div className="glass-card status-overview-box">
                <div className="card-header-icon-title">
                  <span className="card-header-icon">📊</span>
                  <span className="card-header-title">{t('系统状态')}</span>
                  <button className={`btn-icon-spin ${isRefreshingPing ? 'spinning' : ''}`} onClick={handleRefreshPing} title="Refresh" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>🔄</button>
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-val">{servers.length}</div>
                    <div className="stat-lbl">{t('服务器总数')}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val" style={{ color: 'var(--green)' }}>{Object.values(pings).filter(p => p.online).length}</div>
                    <div className="stat-lbl">{t('在线节点')}</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-val" style={{ color: 'var(--red)' }}>{Object.values(pings).filter(p => !p.online && p.pinged).length}</div>
                    <div className="stat-lbl">{t('离线节点')}</div>
                  </div>
                </div>
              </div>

            </div>

            {/* 右半栏：历史会话与主机目录 */}
            <div className="dashboard-right">
              {/* 🖥 全部主机目录 */}
              <div className="hosts-section-container">
                <div className="section-title-container">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="section-title-icon">🖥</span>
                    <span className="section-title">{t('主机')}</span>
                    <div className="view-mode-toggles" style={{ display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
                      <button
                        className={`btn-icon ${serverListViewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => { setServerListViewMode('grid'); localStorage.setItem('serverListViewMode', 'grid'); }}
                        title="卡片视图"
                        style={{ padding: '4px 8px', fontSize: 12, background: serverListViewMode === 'grid' ? 'var(--bg-4)' : 'transparent', color: serverListViewMode === 'grid' ? 'var(--text-1)' : 'var(--text-4)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <LayoutGrid size={14} />
                      </button>
                      <button
                        className={`btn-icon ${serverListViewMode === 'table' ? 'active' : ''}`}
                        onClick={() => { setServerListViewMode('table'); localStorage.setItem('serverListViewMode', 'table'); }}
                        title="列表视图"
                        style={{ padding: '4px 8px', fontSize: 12, background: serverListViewMode === 'table' ? 'var(--bg-4)' : 'transparent', color: serverListViewMode === 'table' ? 'var(--text-1)' : 'var(--text-4)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <List size={14} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    onClick={() => { setEditServer(null); setShowAddServer(true); }}
                  >
                    <Plus size={14} />
                    {t('添加')}
                  </button>
                </div>

                <div className="hosts-scroll-area">
                  <ServerList
                    servers={filteredServers}
                    pings={pings}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    viewMode={serverListViewMode}
                    onConnect={connectServerWrapped}
                    onEdit={(s) => { setEditServer(s); setShowAddServer(true); }}
                    onDelete={handleDeleteServer}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: activeSessionId !== null ? 'flex' : 'none', flexDirection: 'column', height: '100%', flex: 1 }}>
            {/* Content Type Tabs */}
            {activeSession && (
              <div className="content-tab-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 36, paddingRight: 16, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <button
                    className={`content-tab ${contentTab === 'terminal' ? 'active' : ''}`}
                    onClick={() => setContentTab('terminal')}
                  >
                    <TerminalIcon size={14} />
                    <span>{t('终端')}</span>
                  </button>
                  {fileManagerPosition === 'tab' && (
                    <button
                      className={`content-tab ${contentTab === 'files' ? 'active' : ''}`}
                      onClick={() => setContentTab('files')}
                      disabled={activeSession.status !== 'connected'}
                    >
                      <Folder size={14} />
                      <span>{t('文件管理')}</span>
                    </button>
                  )}
                  <button
                    className={`content-tab ${contentTab === 'history' ? 'active' : ''}`}
                    onClick={() => setContentTab('history')}
                    disabled={activeSession.status !== 'connected'}
                  >
                    <History size={14} />
                    <span>{t('历史指令')}</span>
                  </button>
                  <button
                    className={`content-tab ${contentTab === 'quick' ? 'active' : ''}`}
                    onClick={() => setContentTab('quick')}
                    disabled={activeSession.status !== 'connected'}
                  >
                    <Zap size={14} />
                    <span>{t('快捷命令')}</span>
                  </button>
                  <button
                    className={`content-tab ${contentTab === 'forward' ? 'active' : ''}`}
                    onClick={() => setContentTab('forward')}
                    disabled={activeSession.status !== 'connected'}
                  >
                    <Plug size={14} />
                    <span>{t('端口转发')}</span>
                  </button>
                </div>
                
                {activeSession.status === 'connected' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t('文件管理器布局')}:</span>
                    <select
                      className="select-compact"
                      value={fileManagerPosition}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFileManagerPosition(val);
                        localStorage.setItem('fileManagerPosition', val);
                        if (val !== 'tab' && contentTab === 'files') {
                          setContentTab('terminal'); // 如果切走，自动返回终端
                        }
                      }}
                    >
                      <option value="tab">标签页</option>
                      <option value="left">左侧分屏</option>
                      <option value="bottom">底部分屏</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Session Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
              {/* 左侧/上侧主体容器 */}
              <div style={{ flex: 1, display: 'flex', flexDirection: fileManagerPosition === 'bottom' ? 'column' : 'row', height: '100%', position: 'relative', overflow: 'hidden' }}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: activeSessionId === s.id ? 'flex' : 'none',
                      flexDirection: fileManagerPosition === 'bottom' ? 'column' : 'row',
                    }}
                  >
                    {/* 辅助视口 (分屏模式下的文件管理器，如果是左侧则排在前面) */}
                    {s.status === 'connected' && fileManagerPosition === 'left' && (
                      <>
                        <div style={{
                          width: leftSplitWidth + 'px',
                          borderRight: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 180,
                          flexShrink: 0,
                        }}>
                          <FileManager
                            sessionId={s.id}
                            addToast={addToast}
                          />
                        </div>
                        <div
                          className="split-resizer-v"
                          onMouseDown={(e) => startDrag(e, 'left')}
                          style={{
                            width: '4px',
                            cursor: 'col-resize',
                            background: 'rgba(255, 255, 255, 0.02)',
                            zIndex: 10,
                            position: 'relative',
                            marginLeft: '-2px',
                            marginRight: '-2px',
                            transition: 'background 0.2s',
                          }}
                        />
                      </>
                    )}

                    {/* 主要视口 (终端/标签页模式下的文件) */}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                      <div style={{ display: (contentTab === 'terminal' || s.status !== 'connected') ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
                        <Terminal
                          sessionId={s.id}
                          status={s.status}
                          isActive={activeSessionId === s.id && (contentTab === 'terminal' || fileManagerPosition !== 'tab')}
                          serverName={s.serverName}
                        />
                      </div>
                      {s.status === 'connected' && fileManagerPosition === 'tab' && (
                        <div style={{ display: contentTab === 'files' ? 'block' : 'none', height: '100%', flex: 1 }}>
                          <FileManager
                            sessionId={s.id}
                            addToast={addToast}
                          />
                        </div>
                      )}
                      {s.status === 'connected' && (
                        <div style={{ display: contentTab === 'history' ? 'block' : 'none', height: '100%', flex: 1 }}>
                          <CommandHistory
                            sessionId={s.id}
                            serverKey={s.serverId}
                            addToast={addToast}
                          />
                        </div>
                      )}
                      {s.status === 'connected' && (
                        <div style={{ display: contentTab === 'quick' ? 'block' : 'none', height: '100%', flex: 1 }}>
                          <QuickCommands
                            sessionId={s.id}
                            addToast={addToast}
                          />
                        </div>
                      )}
                      {s.status === 'connected' && (
                        <div style={{ display: contentTab === 'forward' ? 'block' : 'none', height: '100%', flex: 1 }}>
                          <PortForward
                            sessionId={s.id}
                            addToast={addToast}
                          />
                        </div>
                      )}
                    </div>

                    {/* 辅助视口 (分屏模式下的文件管理器，如果是底部则排在后面) */}
                    {s.status === 'connected' && fileManagerPosition === 'bottom' && (
                      <>
                        <div
                          className="split-resizer-h"
                          onMouseDown={(e) => startDrag(e, 'bottom')}
                          style={{
                            height: '4px',
                            cursor: 'row-resize',
                            background: 'rgba(255, 255, 255, 0.02)',
                            zIndex: 10,
                            position: 'relative',
                            marginTop: '-2px',
                            marginBottom: '-2px',
                            transition: 'background 0.2s',
                          }}
                        />
                        <div style={{
                          height: bottomSplitHeight + 'px',
                          borderTop: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          minHeight: 100,
                          flexShrink: 0,
                        }}>
                          <FileManager
                            sessionId={s.id}
                            addToast={addToast}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* 右侧：系统监控探针面板（强制常显）*/}
              {activeSession && activeSession.status === 'connected' && (
                <>
                  <div
                    className="split-resizer-v probe-resizer"
                    onMouseDown={(e) => startDrag(e, 'probe')}
                    title="调整监控边栏宽度"
                  />
                  <div
                    className="probe-panel-wrapper"
                    style={{
                      width: probePanelWidth,
                      minWidth: probePanelWidth,
                    }}
                  >
                    <ProbePanel
                      sessionId={activeSession.id}
                      addToast={addToast}
                      enabled={!!monitoringEnabled[activeSession.id]}
                      onEnable={() => setMonitoringEnabled(prev => ({ ...prev, [activeSession.id]: true }))}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
      </main>

      {/* ── Modals ────────────────────────────────────────── */}
      {showAddServer && (
        <AddServerModal
          server={editServer}
          onSave={handleSaveServer}
          onClose={() => { setShowAddServer(false); setEditServer(null); }}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          addToast={addToast}
          onRestored={loadServers}
        />
      )}

      {/* ── 密钥管理 Modal ─────────────────────────────────── */}
      {showKeys && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowKeys(false)}>
          <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', height: '70vh', background: 'var(--bg-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={16} /> SSH 密钥管理
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowKeys(false)} style={{ color: 'var(--text-3)' }}>✕</button>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* 左栏：密钥列表 */}
              <div style={{ width: 260, borderRight: '1px solid var(--border)', padding: '16px 12px', overflowY: 'auto', background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { name: 'id_rsa', path: '~/.ssh/id_rsa', type: 'RSA 4096' },
                  { name: 'id_ed25519', path: '~/.ssh/id_ed25519', type: 'ED25519' },
                ].map((key, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 10,
                    background: i === 0 ? 'rgba(16,185,129,0.1)' : 'var(--bg-2)',
                    border: i === 0 ? '1px solid var(--green-glow)' : '1px solid var(--border)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--green-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Key size={18} style={{ color: 'var(--green)' }} /></div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{key.path}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Type {key.type}</div>
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary" style={{ marginTop: 8, fontSize: 13 }}>
                  + 生成新密钥
                </button>
              </div>
              {/* 右栏：密钥详情 */}
              <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 24 }}>密钥详情</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { label: 'Label', value: '~/.ssh/id_ed25519' },
                    { label: '类型', value: 'ED25519' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 14, color: 'var(--text-1)', fontFamily: 'var(--font-mono)' }}>{value}</div>
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 8 }}>密钥导出</div>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => addToast('密钥功能需要在连接到服务器后使用', 'info', 3000)}
                    >
                      导出到主机
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ────────────────────────────────────────── */}
      <Toast toasts={toasts} />
      <GlobalDialog />

      {/* ── 连接进度卡片 Overlay（参考图一）──────────────── */}
      {connectingServer && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            width: 380, borderRadius: 16, overflow: 'hidden',
            background: 'rgba(22,27,34,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            padding: '20px 24px 22px',
          }}>
            {/* 标题行：图标 + 名称 + 按钮 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><Monitor size={22} style={{ color: '#fff' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f6fc', marginBottom: 3 }}>
                  {connectingServer.server.name || connectingServer.server.host}
                </div>
                <div style={{ fontSize: 12, color: '#3fb950', fontFamily: 'monospace' }}>
                  SSH {connectingServer.server.host}:{connectingServer.server.port || 22}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  style={{
                    padding: '5px 14px', fontSize: 12, borderRadius: 8, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8b949e',
                  }}
                  onClick={() => setConnectingServer(null)}
                >
                  取消
                </button>
              </div>
            </div>

            {/* 双进度条（参考图一）*/}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {/* 左进度点 */}
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', flexShrink: 0, boxShadow: '0 0 8px var(--green)' }} />
              {/* 进度条 */}
              <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg, var(--green), #86efac)',
                  animation: 'ssh-progress-indeterminate 1.4s ease-in-out infinite',
                }} />
              </div>
              {/* WiFi 图标 */}
              <div style={{ flexShrink: 0, fontSize: 14, color: 'var(--green)' }}>📡</div>
              {/* 第二段进度条 */}
              <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  background: 'linear-gradient(90deg, var(--green), #86efac)',
                  animation: 'ssh-progress-indeterminate 1.4s ease-in-out 0.4s infinite',
                }} />
              </div>
              {/* 右旋转图标 */}
              <div style={{ flexShrink: 0, animation: 'spin 1.2s linear infinite', fontSize: 14, color: '#6e7681' }}>⟳</div>
            </div>

            {/* 提示文字 */}
            <div style={{ fontSize: 12, color: '#6e7681', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ animation: 'spin 1.5s linear infinite', display: 'inline-block' }}>⟳</span>
              正在建立 SSH 连接，请稍候...
            </div>
          </div>
        </div>
      )}

      {/* ── 托盘弹窗面板（参考图二/图三）─────────────────── */}
      {showTrayPanel && (
        <div
          style={{
            position: 'fixed', bottom: 48, right: 16, zIndex: 8000,
            width: 280,
            borderRadius: 14,
            background: 'rgba(13,17,23,0.97)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={logoImg} alt="logo" style={{ width: 24, height: 24, borderRadius: 6 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f6fc' }}>Aether</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', fontSize: 14, padding: '2px 6px' }}
                title="展开窗口"
                onClick={() => { import('../wailsjs/runtime/runtime.js').then(r => r.WindowShow()); setShowTrayPanel(false); }}
              >⤢</button>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', fontSize: 14, padding: '2px 6px' }}
                onClick={() => setShowTrayPanel(false)}
              >✕</button>
            </div>
          </div>

          {/* 内容区 */}
          <div style={{ flex: 1, padding: '12px 0', minHeight: 120 }}>
            {sessions.filter(s => s.status === 'connected').length > 0 ? (
              <>
                <div style={{ fontSize: 11, color: '#6e7681', padding: '0 16px 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1 }}>会话</div>
                {sessions.filter(s => s.status === 'connected').map(s => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => {
                      import('../wailsjs/runtime/runtime.js').then(r => r.WindowShow());
                      setActiveSessionId(s.id);
                      setShowTrayPanel(false);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
                      <span style={{ fontSize: 14, color: '#f0f6fc', fontWeight: 500 }}>{s.serverName}</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#6e7681' }}>已连接</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', gap: 10 }}>
                <div style={{ fontSize: 40 }}>😤</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>一切都很安静</div>
                <div style={{ fontSize: 12, color: '#6e7681', textAlign: 'center', lineHeight: 1.6 }}>
                  去连接个服务器吧，已经想念你了 🌿
                </div>
              </div>
            )}
          </div>

          {/* 底部退出按钮 */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '10px 16px' }}>
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', background: 'none', border: 'none',
                cursor: 'pointer', color: '#6e7681', fontSize: 13,
                padding: '6px 0', transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f0f6fc'}
              onMouseLeave={e => e.currentTarget.style.color = '#6e7681'}
              onClick={Quit}
            >
              <span>⏻</span> 退出 Aether
            </button>
          </div>
        </div>
      )}

      {/* 🚀 右下角自动更新弹窗 */}
      {isUpdateModalVisible && startupUpdateInfo && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 380, background: 'rgba(22, 27, 34, 0.95)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          borderRadius: 16, padding: '20px 24px',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 28, lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(16,185,129,0.3))' }}>🚀</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f6fc', marginBottom: 4 }}>
                {t('发现新版本')}{' '}
                <span style={{ color: '#34d399', fontSize: 13, background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: 6 }}>{startupUpdateInfo.version}</span>
              </div>
              <div style={{ fontSize: 13, color: '#8b949e', lineHeight: 1.6 }}>
                {t('为了给您提供更极致的体验，建议您立即升级。')}
              </div>
            </div>
          </div>

          {/* 更新内容 */}
          {startupUpdateInfo.body && (
            <div style={{
              marginBottom: 14, padding: '10px 12px',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, fontSize: 12, color: '#8b949e', lineHeight: 1.5,
              maxHeight: 140, overflow: 'auto'
            }}>
              {(startupUpdateInfo.body || '').split('\n').filter(l => l.trim()).slice(0, 8).join('\n')}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            <button 
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 500, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8b949e', cursor: 'pointer' }}
              onClick={() => setIsUpdateModalVisible(false)}
              onMouseEnter={e => { e.currentTarget.style.color = '#f0f6fc'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              disabled={downloadProgress >= 0}
            >
              {t('稍等')}
            </button>
            <button 
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-3)', cursor: 'pointer' }}
              onClick={() => window.runtime?.BrowserOpenURL('https://github.com/angusdevgo/Aether-SSH/releases/latest')}
            >
              🌐 手动下载
            </button>
            <button 
              style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: 'var(--green)', border: 'none', color: '#fff', cursor: 'pointer', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleApplyStartupUpdate}
              disabled={downloadProgress >= 0}
            >
                  {downloadProgress >= 0 && (
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${downloadProgress}%`, background: 'rgba(0,0,0,0.2)', transition: 'width 0.2s ease-out' }} />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>
                    {downloadProgress >= 0 ? (
                      '⏳ 正在更新...'
                    ) : (
                      t('立即更新')
                    )}
                  </span>
                </button>
              </div>
          </div>
      )}
      {/* Tab context menu */}
      {tabMenu && (() => {
        const sess = sessions.find(s => s.id === tabMenu.sessionId);
        const server = sess ? servers.find(sv => sv.id === sess.serverId) : null;
        return (
          <div style={{ position: 'fixed', left: tabMenu.x, top: tabMenu.y, zIndex: 9999 }} onClick={() => setTabMenu(null)}>
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 0', minWidth: 140, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {server && sess?.status === 'connected' && (
                <div className="context-menu-item" onClick={() => { connectServerWrapped(server); setTabMenu(null); }}>
                  🔄 克隆会话
                </div>
              )}
              <div className="context-menu-item danger" onClick={() => {
                if (sess) closeSession(sess.id);
                setTabMenu(null);
              }}>
                ✕ 关闭会话
              </div>
            </div>
          </div>
        );
      })()}
      <GlobalContextMenu />
    </div>
  );
}
