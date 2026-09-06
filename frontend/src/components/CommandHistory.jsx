import { useState, useEffect } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime.js';
import * as AppGo from '../../wailsjs/go/main/App.js';
import { useTranslation } from '../i18n.js';

export default function CommandHistory({ sessionId, addToast }) {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`cmd_history_${sessionId}`);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (_) {}

    const persistHistory = (entries) => {
      try {
        localStorage.setItem(`cmd_history_${sessionId}`, JSON.stringify(entries.slice(0, 100)));
      } catch (_) {}
    };

    const pushHistoryEntry = (detail) => {
      const { sessionId: evSessionId, command, time, source = 'input' } = detail || {};
      if (evSessionId !== sessionId) return;
      if (!command || !String(command).trim()) return;

      setHistory((prev) => {
        if (source === 'remote' && prev[0]?.source === 'input' && prev[0]?.command === command) {
          const updated = [{ ...prev[0], time, source }, ...prev.slice(1)];
          persistHistory(updated);
          return updated;
        }

        const newHistory = [{ id: Date.now() + Math.random(), command, time, source }, ...prev].slice(0, 100);
        persistHistory(newHistory);
        return newHistory;
      });
    };

    const handleNewCommand = (e) => {
      pushHistoryEntry(e.detail);
    };

    window.addEventListener('ssh-command-history', handleNewCommand);
    const unbindRemote = EventsOn('ssh-command-executed', (detail) => {
      pushHistoryEntry(detail);
    });

    return () => {
      window.removeEventListener('ssh-command-history', handleNewCommand);
      if (unbindRemote) unbindRemote();
    };
  }, [sessionId]);

  const handleCopy = (cmd) => {
    navigator.clipboard.writeText(cmd);
    if (addToast) addToast('命令已复制到剪贴板', 'success');
  };

  const handleExecute = (cmd) => {
    window.dispatchEvent(new CustomEvent('ssh-command-history', {
      detail: { sessionId, command: cmd, time: new Date().toISOString(), source: 'input' }
    }));
    AppGo.WriteTerminal(sessionId, cmd + '\r');
    if (addToast) addToast('已发送指令到终端', 'info', 2000);
  };

  const handleClear = async () => {
    if (await window.aetherDialog?.confirm(`${t('确定要清空历史指令吗？') || '确定要清空历史指令吗？'}`)) {
      setHistory([]);
      try { localStorage.removeItem(`cmd_history_${sessionId}`); } catch (_) {}
    }
  };

  return (
    <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto', background: 'var(--bg-1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📜</span> {t('会话输入历史')}
        </h3>
        {history.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={handleClear} style={{ color: 'var(--text-4)' }}>
            {t('清空列表')}
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '10vh' }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>⌨️</div>
          <p style={{ marginTop: 16, color: 'var(--text-2)', fontSize: 15, fontWeight: 500 }}>{t('您还没有执行过任何命令')}</p>
          <span style={{ fontSize: 13, color: 'var(--text-4)', maxWidth: 300, textAlign: 'center', lineHeight: 1.6, marginTop: 8 }}>
            {t('在此连接的终端中执行过的命令会自动留存，方便您在此浏览与重复运行。')}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.map((item) => (
            <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', background: 'var(--bg-0)', borderColor: 'var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--green)', wordBreak: 'break-all', fontWeight: 600 }}>
                  $ {item.command}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-4)', whiteSpace: 'nowrap', marginLeft: 12, opacity: 0.8 }}>
                  {new Date(item.time).toLocaleTimeString()}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleCopy(item.command)} style={{ fontSize: 12, padding: '4px 12px' }}>
                  📋 {t('复制')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleExecute(item.command)} style={{ fontSize: 12, padding: '4px 12px', background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(88,166,255,0.2)' }}>
                  🚀 {t('再次运行')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
