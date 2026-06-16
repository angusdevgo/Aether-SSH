import { useState, useEffect } from 'react';
import { loadCommands, saveCommands, createCommand } from './quickCommands.js';

export default function QuickCommands({ sessionId, addToast, onClose }) {
  const [commands, setCommands] = useState([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [cmd, setCmd] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { setCommands(loadCommands()); }, []);

  const persist = (next) => { setCommands(next); saveCommands(next); };

  const handleSend = (command) => {
    window.dispatchEvent(new CustomEvent('ssh-quick-command', {
      detail: { sessionId, command: command + '\r' }
    }));
    addToast('已发送到终端', 'info', 1500);
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
    <div style={{ padding: '16px 20px', height: '100%', overflowY: 'auto', background: 'var(--bg-1)' }}>
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
              onClick={() => handleSend(c.command)}
              style={{ padding: '4px 12px', fontSize: 12, flexShrink: 0 }}
            >▶ 发送</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(c)} style={{ fontSize: 12, flexShrink: 0, padding: '4px 8px', color: 'var(--text-4)' }}>✏️</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)} style={{ fontSize: 12, flexShrink: 0, padding: '4px 8px', color: '#ef4444' }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}
