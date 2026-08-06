import { useState, useCallback } from 'react';
import * as AppGo from '../wailsjs/go/main/App.js';

/**
 * useSessions — 管理 SSH 会话的完整生命周期
 * 从 App.jsx 中提取，减少主文件 ~130 行
 *
 * @param {function} addToast - toast 通知函数
 * @param {function} [onConnected] - (sessionId, osInfo) 连接成功后回调
 */
export function useSessions(addToast, onConnected) {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [connectingServer, setConnectingServer] = useState(null);

  const connectServer = useCallback(async (server) => {
    const sessionId = `session_${Date.now()}`;
    setSessions(prev => [...prev, { id: sessionId, serverId: server.id, serverName: server.name || server.host, host: server.host, status: 'connecting' }]);
    setActiveSessionId(sessionId);
    setConnectingServer({ server, sessionId, startTime: Date.now() });

    try {
      await AppGo.ConnectSSH(sessionId, server.id);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'connected' } : s));
      setConnectingServer(null);

      try {
        const info = await AppGo.SystemInfo(sessionId);
        if (info) {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, osInfo: info } : s));
          onConnected?.(sessionId, info);
        }
      } catch (_) {}
    } catch (err) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status: 'error' } : s));
      setConnectingServer(null);
      addToast(`连接失败: ${err}`, 'error', 5000);
    }
  }, [addToast, onConnected]);

  const reconnectSession = useCallback(async (session) => {
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'connecting' } : s));
    setConnectingServer({ server: { id: session.serverId, host: session.host, name: session.serverName, port: 22 }, sessionId: session.id, startTime: Date.now() });
    try {
      await AppGo.ConnectSSH(session.id, session.serverId);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'connected' } : s));
      setConnectingServer(null);
      addToast('重新连接成功', 'success');
      try {
        const info = await AppGo.SystemInfo(session.id);
        if (info) {
          setSessions(prev => prev.map(s => s.id === session.id ? { ...s, osInfo: info } : s));
          onConnected?.(session.id, info);
        }
      } catch (_) {}
    } catch (err) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, status: 'error' } : s));
      setConnectingServer(null);
      addToast(`重连失败: ${err}`, 'error', 4000);
    }
  }, [addToast, onConnected]);

  const closeSession = useCallback(async (sessionId, e) => {
    e?.stopPropagation?.();
    try { await AppGo.DisconnectSSH(sessionId); } catch (_) {}
    setSessions(prev => {
      // 先在被关标签的原始位置定位索引，以便把焦点交给「相邻」标签（与浏览器/终端一致）
      const idx = prev.findIndex(s => s.id === sessionId);
      const remaining = prev.filter(s => s.id !== sessionId);
      setActiveSessionId(activeId => {
        if (activeId !== sessionId) return activeId;
        if (remaining.length === 0) return null;
        // 优先跳到被关标签左边的标签；若关的是第一个，则跳到右边那个
        const neighborIdx = Math.max(0, idx - 1);
        return remaining[Math.min(neighborIdx, remaining.length - 1)].id;
      });
      return remaining;
    });
  }, []);

  return {
    sessions, setSessions,
    activeSessionId, setActiveSessionId,
    connectingServer, setConnectingServer,
    connectServer, reconnectSession, closeSession,
  };
}
