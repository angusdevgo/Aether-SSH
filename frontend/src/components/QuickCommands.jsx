import { useState, useEffect } from 'react';
import { loadCommands, saveCommands, createCommand } from './quickCommands.js';
import * as AppGo from '../../wailsjs/go/main/App.js';

// 快捷命令面板，两种使用方式：
// 1. 会话内（传入 sessionId）：直接写入当前终端 stdin
// 2. 脚本页（传入 servers/sessions）：选择目标——活动会话直写终端，
//    未连接的服务器则一次性 SSH 执行并回显输出
export default function QuickCommands({ sessionId, addToast, onClose, servers, sessions }) {
  const [commands, setCommands] = useState([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [cmd, setCmd] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [target, setTarget] = useState(''); // "session:<id>" | "server:<id>"
  const [running, setRunning] = useState(false);
  const [lastOutput, setLastOutput] = useState(null); // { label, command, output }

  useEffect(() => { setCommands(loadCommands()); }, []);

  // 脚本页模式：构建目标选项（活动会话优先，未连接服务器走一次性执行）
  const connectedSessions = !sessionId ? (sessions || []).filter(s => s.status === 'connected') : [];
  const connectedServerIds = new Set(connectedSessions.map(s => s.serverId));
  const targetOptions = sessionId ? [] : [
    ...connectedSessions.map(s => ({ key: `session:${s.id}`, type: 'session', id: s.id, label: `${s.serverName}（活动会话）` })),
    ...(servers || []).filter(sv => !connectedServerIds.has(sv.id))
      .map(sv => ({ key: `server:${sv.id}`, type: 'server', id: sv.id, label: `${sv.name || sv.host}（一次性执行）` })),
  ];

  // 默认选中第一个活动会话，否则第一台服务器
  useEffect(() => {
    if (sessionId || targetOptions.length === 0) return;
    if (target && targetOptions.some(o => o.key === target)) return;
    setTarget(targetOptions[0].key);
  }, [sessionId, target, targetOptions]);

  const persist = (next) => { setCommands(next); saveCommands(next); };

  const handleSend = async (command) => {
    if (sessionId) {
      window.dispatchEvent(new CustomEvent('ssh-quick-command', {
        detail: { sessionId, command: command + '\r' }
      }));
      addToast('已发送到终端', 'info', 1500);
      return;
    }

    if (!target) {
      addToast('暂无可选目标：请先连接服务器或保存服务器配置', 'warning', 2500);
      return;
    }
    const [type, id] = target.split(':');
    const opt = targetOptions.find(o => o.key === target);

    if (type === 'session') {
      window.dispatchEvent(new CustomEvent('ssh-quick-command', {
        detail: { sessionId: id, command: command + '\r' }
      }));
      addToast('已发送到终端', 'info', 1500);
      return;
    }

    // 一次性执行（未连接的服务器）
    setRunning(true);
    setLastOutput(null);
    try {
      const out = await AppGo.ExecOnConnection(id, command);
      setLastOutput({ label: opt?.label || id, command, output: out || '（命令执行完成，无输出）' });
    } catch (e) {
      setLastOutput({ label: opt?.label || id, command, output: `执行失败: ${e}` });
    } finally {
      setRunning(false);
    }
  };

  const handleAdd = () => {
    if (!label.trim() || !cmd.trim()) return;
    const item = editingId
      ? { id: editingId, label: label.trim(), command: cmd.trim() }
      : createCommand(label.trim(), cmd.trim());
    persist(editingId
      ? commands.map(c => c.id === editingId ? item : c)
      : [...commands, item]
    );
    setLabel(''); setCmd(''); setAdding(false); setEditingId(null);
  };

  const handleEdit = (c) => {
    setLabel(c.label); setCmd(c.command);
    setEditingId(c.id); setAdding(true);
  };

  const handleDelete = (id) => {
    persist(commands.filter(c => c.id !== id));
  };

  return (
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚡ 快捷命令
        </h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {!adding && (
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ 添加</button>
          )}
          {onClose && (
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ color: 'var(--text-4)' }}>✕</button>
          )}
        </div>
      </div>

      {/* 脚本页模式：目标选择器 */}
      {!sessionId && targetOptions.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>发送目标:</span>
          <select
            className="select-compact"
            value={target}
            onChange={e => setTarget(e.target.value)}
            style={{ flex: 1, maxWidth: 320 }}
          >
            {targetOptions.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Add / Edit form */}
      {adding && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <input
            placeholder="名称（如：重启 Nginx）"
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-0)', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
            autoFocus
          />
          <textarea
            placeholder="命令（如：systemctl restart nginx）"
            value={cmd}
            onChange={e => setCmd(e.target.value)}
            rows={2}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-0)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setEditingId(null); setLabel(''); setCmd(''); }}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>{editingId ? '保存' : '添加'}</button>
          </div>
        </div>
      )}

      {/* Command list */}
      {commands.length === 0 && !adding && (
        <div className="empty-state" style={{ marginTop: '5vh' }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>⚡</div>
          <p style={{ marginTop: 12, color: 'var(--text-2)', fontSize: 14 }}>还没有快捷命令</p>
          <span style={{ fontSize: 13, color: 'var(--text-4)', marginTop: 4 }}>点击「+ 添加」保存常用命令</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {commands.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-0)', borderRadius: 8, border: '1px solid var(--border-light)' }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.command}</div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={running}
              onClick={() => handleSend(c.command)}
              style={{ padding: '4px 12px', fontSize: 12, flexShrink: 0 }}
            >{running ? '⏳ 执行中' : '▶ 发送'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(c)} style={{ fontSize: 12, flexShrink: 0, padding: '4px 8px', color: 'var(--text-4)' }}>✏️</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)} style={{ fontSize: 12, flexShrink: 0, padding: '4px 8px', color: '#ef4444' }}>🗑</button>
          </div>
        ))}
      </div>

      {/* 一次性执行输出回显 */}
      {lastOutput && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-0)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{lastOutput.label} · <span style={{ fontFamily: 'var(--font-mono)' }}>$ {lastOutput.command}</span></span>
            <button className="btn btn-ghost btn-sm" onClick={() => setLastOutput(null)} style={{ color: 'var(--text-4)', padding: '2px 6px' }}>✕</button>
          </div>
          <pre style={{
            margin: 0, padding: '10px 12px', maxHeight: 260, overflowY: 'auto',
            background: 'var(--bg-2)', borderRadius: 6, fontSize: 12, lineHeight: 1.6,
            fontFamily: 'var(--font-mono)', color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{lastOutput.output}</pre>
        </div>
      )}
    </div>
  );
}
