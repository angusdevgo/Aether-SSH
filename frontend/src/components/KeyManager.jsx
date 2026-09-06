import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, Upload } from 'lucide-react';
import * as AppGo from '../../wailsjs/go/main/App.js';

// SSH 密钥管理（凭据页）：生成 / 导入 / 删除密钥，私钥由后端 AES-256-GCM 加密落盘
export default function KeyManager({ addToast }) {
  const [keys, setKeys] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [busy, setBusy] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      const list = await AppGo.ListSSHKeys();
      setKeys(list || []);
      setSelectedId(prev => (list && list.find(k => k.id === prev) ? prev : (list && list[0]?.id) || null));
    } catch (e) {
      if (addToast) addToast(`加载密钥列表失败: ${e}`, 'error');
    }
  }, [addToast]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async () => {
    if (busy) return;
    let name = newKeyName.trim();
    if (!name) {
      name = await window.aetherDialog?.prompt('请输入密钥名称', 'my-key', '生成新密钥');
      if (!name || !name.trim()) return;
      name = name.trim();
    }
    setBusy(true);
    try {
      const created = await AppGo.GenerateSSHKey(name);
      setNewKeyName('');
      await loadKeys();
      if (created) setSelectedId(created.id);
      if (addToast) addToast(`密钥 ${name} 已生成并加密保存`, 'success');
    } catch (e) {
      if (addToast) addToast(`生成密钥失败: ${e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    try {
      const pem = await AppGo.ReadPrivateKeyFile();
      if (!pem) return;
      const name = await window.aetherDialog?.prompt('请输入密钥名称', 'imported-key', '导入密钥');
      if (!name || !name.trim()) return;
      setBusy(true);
      // 加密私钥支持密码短语：先按无密码短语尝试，失败则询问
      try {
        const created = await AppGo.ImportSSHKey(name.trim(), pem, '');
        await loadKeys();
        if (created) setSelectedId(created.id);
        if (addToast) addToast(`密钥 ${name.trim()} 已导入并加密保存`, 'success');
      } catch (_) {
        const pass = await window.aetherDialog?.prompt('该私钥需要密码短语，请输入', '', '私钥密码短语');
        if (!pass) return;
        const created = await AppGo.ImportSSHKey(name.trim(), pem, pass);
        await loadKeys();
        if (created) setSelectedId(created.id);
        if (addToast) addToast(`密钥 ${name.trim()} 已导入并加密保存`, 'success');
      }
    } catch (e) {
      if (addToast) addToast(`导入密钥失败: ${e}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (k) => {
    const ok = await window.aetherDialog?.confirm(`确定删除密钥「${k.name}」吗？此操作不可恢复。`, '删除密钥');
    if (!ok) return;
    try {
      await AppGo.DeleteSSHKey(k.id);
      await loadKeys();
      if (addToast) addToast(`密钥 ${k.name} 已删除`, 'success');
    } catch (e) {
      if (addToast) addToast(`删除失败: ${e}`, 'error');
    }
  };

  const handleCopy = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      if (addToast) addToast(`${label}已复制到剪贴板`, 'success');
    } catch (e) {
      if (addToast) addToast(`复制失败: ${e}`, 'error');
    }
  };

  const selected = keys.find(k => k.id === selectedId) || null;

  return (
    <div style={{ display: 'flex', gap: 24, flex: 1, overflow: 'hidden' }}>
      {/* 左栏：密钥列表 */}
      <div style={{ width: 300, borderRadius: 'var(--m3-radius-lg)', background: 'var(--m3-surface-container)', border: '1px solid var(--m3-outline-variant)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {keys.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-4)', textAlign: 'center', padding: '16px 0' }}>
            密钥库为空，生成或导入一把 SSH 密钥开始使用
          </div>
        )}
        {keys.map(k => (
          <div key={k.id}
            onClick={() => setSelectedId(k.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 'var(--m3-radius-md)',
              background: k.id === selectedId ? 'var(--m3-primary-container)' : 'var(--m3-surface-container-high)',
              border: k.id === selectedId ? '1px solid var(--m3-primary)' : '1px solid var(--m3-outline-variant)',
              cursor: 'pointer',
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--m3-radius-sm)', background: 'rgba(15,118,110,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Key size={18} style={{ color: 'var(--m3-on-primary-container)' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{k.algorithm}</div>
            </div>
            <button
              title="删除密钥"
              onClick={(e) => { e.stopPropagation(); handleDelete(k); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', padding: 4, display: 'flex' }}
            ><Trash2 size={14} /></button>
          </div>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input-compact"
              placeholder="新密钥名称，如 deploy-key"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" disabled={busy} onClick={handleGenerate}
              style={{ borderRadius: 'var(--m3-radius-md)', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Plus size={14} /> 生成
            </button>
          </div>
          <button className="btn btn-secondary" disabled={busy} onClick={handleImport}
            style={{ borderRadius: 'var(--m3-radius-md)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Upload size={14} /> 导入私钥文件
          </button>
        </div>
      </div>

      {/* 右栏：密钥详情 */}
      <div className="m3-card" style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>密钥详情</div>
        {!selected ? (
          <div style={{ fontSize: 13, color: 'var(--text-4)' }}>从左侧选择一把密钥查看详情</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: '名称', value: selected.name, copyable: true },
              { label: '算法', value: selected.algorithm, copyable: false },
              { label: '指纹 (SHA256)', value: selected.fingerprint, copyable: true },
              { label: '创建时间', value: selected.createdAt, copyable: false },
            ].map((item, idx) => (
              <div key={idx} className="form-group-compact">
                <label style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.label}</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input-compact" readOnly value={item.value} style={{ fontFamily: 'var(--font-mono)', flex: 1 }} />
                  {item.copyable && (
                    <button className="btn btn-ghost btn-icon" title="复制" onClick={() => handleCopy(item.label, item.value)} style={{ display: 'flex', alignItems: 'center' }}>
                      <Copy size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div className="form-group-compact">
              <label style={{ fontSize: 12, color: 'var(--text-3)' }}>公钥 (authorized_keys 单行格式)</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <div style={{
                  flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
                  background: 'var(--m3-surface-container-low)', border: '1px solid var(--m3-outline-variant)',
                  borderRadius: 'var(--m3-radius-sm)', padding: '8px 10px', color: 'var(--text-2)',
                  wordBreak: 'break-all', maxHeight: 90, overflowY: 'auto',
                }}>{selected.publicKey || '（无）'}</div>
                <button className="btn btn-ghost btn-icon" title="复制公钥" onClick={() => handleCopy('公钥', selected.publicKey)} style={{ display: 'flex', alignItems: 'center' }}>
                  <Copy size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
