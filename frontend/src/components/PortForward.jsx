import { useState, useEffect, useCallback } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';

export default function PortForward({ sessionId, addToast }) {
  const [forwards, setForwards] = useState([]);
  const [adding, setAdding] = useState(false);
  const [localPort, setLocalPort] = useState('');
  const [remoteHost, setRemoteHost] = useState('localhost');
  const [remotePort, setRemotePort] = useState('');

  const refresh = useCallback(async () => {
    try {
      const list = await AppGo.ListPortForwards(sessionId);
      setForwards(list || []);
    } catch (_) {}
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    const lp = parseInt(localPort, 10) || 0;
    const rp = parseInt(remotePort, 10);
    if (!rp || rp < 1 || rp > 65535) return addToast('请输入有效的远程端口', 'error');
    if (!remoteHost.trim()) return addToast('请输入远程主机', 'error');
    try {
      const actualPort = await AppGo.StartPortForward(sessionId, lp, remoteHost.trim(), rp);
      addToast(`端口转发已启动: 127.0.0.1:${actualPort} → ${remoteHost}:${rp}`, 'success', 3000);
      setAdding(false);
      setLocalPort(''); setRemoteHost('localhost'); setRemotePort('');
      refresh();
    } catch (err) {
      addToast(`转发失败: ${err}`, 'error');
    }
  };

  const handleStop = async (port) => {
    try {
      await AppGo.StopPortForward(sessionId, port);
      addToast('已停止转发', 'info');
      refresh();
    } catch (err) {
      addToast(`停止失败: ${err}`, 'error');
    }
  };

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', background: 'var(--bg-1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>🔌 端口转发</h3>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ 添加</button>}
      </div>

      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input-compact" placeholder="本地端口 (0=自动)" value={localPort} onChange={e => setLocalPort(e.target.value)} style={{ flex: 1 }} />
            <span style={{ color: 'var(--text-4)', fontSize: 14 }}>→</span>
            <input className="input-compact" placeholder="远程主机" value={remoteHost} onChange={e => setRemoteHost(e.target.value)} style={{ flex: 1 }} />
            <span style={{ color: 'var(--text-4)' }}>:</span>
            <input className="input-compact" placeholder="远程端口" value={remotePort} onChange={e => setRemotePort(e.target.value)} style={{ width: 90, flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(false)}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>启动</button>
          </div>
        </div>
      )}

      {forwards.length === 0 && !adding && (
        <div className="empty-state" style={{ marginTop: '4vh' }}>
          <div style={{ fontSize: 32, opacity: 0.3 }}>🔌</div>
          <p style={{ marginTop: 8, color: 'var(--text-2)', fontSize: 14 }}>暂无转发</p>
          <span style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>例如：本地 13306 → 远程数据库 3306</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {forwards.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-0)', borderRadius: 6, border: '1px solid var(--border-light)' }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-1)', fontWeight: 600 }}>127.0.0.1:{f.localPort}</span>
            <span style={{ color: 'var(--text-4)' }}>→</span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', flex: 1 }}>{f.remoteHost}:{f.remotePort}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => handleStop(f.localPort)} style={{ fontSize: 11, color: 'var(--red)' }}>停止</button>
          </div>
        ))}
      </div>
    </div>
  );
}
