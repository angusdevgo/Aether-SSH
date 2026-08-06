import { useState, useEffect } from 'react';

export default function GlobalDialog() {
  const [dialogs, setDialogs] = useState([]);

  useEffect(() => {
    // 注册全局 API
    window.aetherDialog = {
      alert: (message, title = '提示') => {
        return new Promise((resolve) => {
          setDialogs(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'alert',
            title,
            message,
            onClose: () => resolve()
          }]);
        });
      },
      confirm: (message, title = '操作确认') => {
        return new Promise((resolve) => {
          setDialogs(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'confirm',
            title,
            message,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
          }]);
        });
      },
      prompt: (message, defaultValue = '', title = '输入信息') => {
        return new Promise((resolve) => {
          setDialogs(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'prompt',
            title,
            message,
            defaultValue,
            onConfirm: (val) => resolve(val),
            onCancel: () => resolve(null)
          }]);
        });
      }
    };
    return () => {
      delete window.aetherDialog;
    };
  }, []);

  if (dialogs.length === 0) return null;

  const current = dialogs[0]; // 每次只显示队首的弹窗

  const handleClose = () => {
    if (current.onClose) current.onClose();
    if (current.onCancel && current.type !== 'alert') current.onCancel();
    setDialogs(prev => prev.slice(1));
  };

  const handleConfirm = (val) => {
    if (current.onConfirm) current.onConfirm(val);
    setDialogs(prev => prev.slice(1));
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <DialogContent current={current} onClose={handleClose} onConfirm={handleConfirm} />
    </div>
  );
}

function DialogContent({ current, onClose, onConfirm }) {
  const [inputValue, setInputValue] = useState(current.defaultValue || '');

  return (
    <div className="modal modal-sm" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>
        {current.title}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28, lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
        {current.message}
      </div>
      
      {current.type === 'prompt' && (
        <input
          autoFocus
          className="input"
          style={{ marginBottom: 28, textAlign: 'center' }}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(inputValue);
            if (e.key === 'Escape') onClose();
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        {current.type !== 'alert' && (
          <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1, padding: '10px 0', justifyContent: 'center' }}>取消</button>
        )}
        <button 
          className="btn btn-primary"
          onClick={() => {
            if (current.type === 'prompt') onConfirm(inputValue);
            else if (current.type === 'confirm') onConfirm(true);
            else onClose();
          }}
          style={current.type === 'alert' ? { minWidth: 120, justifyContent: 'center' } : { flex: 1, padding: '10px 0', justifyContent: 'center' }}
        >
          {current.type === 'alert' ? '我知道了' : '确定'}
        </button>
      </div>
    </div>
  );
}
