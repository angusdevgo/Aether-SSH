import { useState, useEffect } from 'react';
import { Eye, EyeOff, Server, Key, FolderOpen, X } from 'lucide-react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import { useTranslation } from '../i18n.js';

const defaultForm = {
  name: '',
  host: '',
  port: '22',
  username: 'root',
  authType: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
};

export default function AddServerModal({ server, onSave, onClose }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  useEffect(() => {
    if (server) {
      setForm({
        ...defaultForm,
        ...server,
        authType: server.authMethod ? (server.authMethod === 'privateKey' ? 'key' : 'password') : (server.authType || 'password'),
        password: server.password || '',
        passphrase: server.passphrase || '',
      });
    } else {
      setForm(defaultForm);
    }
  }, [server]);

  // 支持键盘 ESC 快捷关闭
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.host.trim()) return window.aetherDialog?.alert('请填写主机地址');
    if (!form.username.trim()) return window.aetherDialog?.alert('请填写用户名');

    setSaving(true);
    const data = { ...form };
    data.port = parseInt(data.port, 10) || 22; // ensure port is an integer
    data.authMethod = form.authType === 'key' ? 'privateKey' : 'password';
    if (server?.id) data.id = server.id;
    // If editing and password is empty, don't overwrite existing
    if (server?.id && !data.password) delete data.password;
    await onSave(data);
    setSaving(false);
  };

  const handleSelectPrivateKeyFile = async () => {
    try {
      const content = await AppGo.ReadPrivateKeyFile();
      if (content) {
        setForm(f => ({ ...f, privateKey: content }));
      }
    } catch (e) {
      // User cancelled or error
      if (e) window.aetherDialog?.alert(`读取私钥文件失败: ${e}`, '错误');
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-md" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-title">
            <Server size={18} style={{ color: 'var(--green, #10b981)' }} />
            <span>{server ? t('编辑配置') : t('添加')}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            title={t('关闭') || '关闭'}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* 基本信息 */}
            <div className="form-section">
              <div className="form-section-title">
                <Server size={14} style={{ color: 'var(--green, #10b981)' }} />
                <span>{t('基本信息') || '基本信息'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">{t('服务器别名（选填）')}</label>
                  <input
                    className="input"
                    placeholder={t('例如：我的测试服')}
                    value={form.name}
                    onChange={set('name')}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">
                      {t('主机地址 *')}
                    </label>
                    <input
                      className="input"
                      placeholder="192.168.1.1 或 example.com"
                      value={form.host}
                      onChange={set('host')}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="form-group form-col-port" style={{ width: 110 }}>
                    <label className="form-label">Port</label>
                    <input
                      className="input"
                      placeholder="22"
                      type="number"
                      min={1}
                      max={65535}
                      value={form.port}
                      onChange={set('port')}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    {t('用户名')} <span className="form-required">*</span>
                  </label>
                  <input
                    className="input"
                    placeholder="root"
                    value={form.username}
                    onChange={set('username')}
                    required
                  />
                </div>
              </div>
            </div>

            {/* 认证方式 */}
            <div className="form-section">
              <div className="form-section-title">
                <Key size={14} style={{ color: 'var(--blue, #3b82f6)' }} />
                <span>{t('认证方式')}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">{t('认证方式')}</label>
                  <select className="select" value={form.authType} onChange={set('authType')}>
                    <option value="password">{t('密码认证')}</option>
                    <option value="key">{t('私钥认证')}</option>
                  </select>
                </div>

                {form.authType === 'password' ? (
                  <div className="form-group">
                    <label className="form-label">
                      {t('密码')} <span className="form-required">*</span>
                    </label>
                    <div className="input-suffix-wrapper">
                      <input
                        className="input"
                        type={showPassword ? "text" : "password"}
                        placeholder={t('请输入密码')}
                        value={form.password}
                        onChange={set('password')}
                      />
                      <button
                        type="button"
                        className="input-suffix-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        title={showPassword ? t('隐藏密码') : t('显示密码')}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <label className="form-label" style={{ marginBottom: 0 }}>{t('私钥内容')}</label>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={handleSelectPrivateKeyFile}
                          style={{ gap: 4, height: 24, padding: '0 8px', fontSize: 11.5 }}
                        >
                          <FolderOpen size={12} /> {t('浏览')}
                        </button>
                      </div>
                      <textarea
                        className="input textarea-private-key"
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                        value={form.privateKey}
                        onChange={set('privateKey')}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">{t('私钥密码短语 (可选)')}</label>
                      <div className="input-suffix-wrapper">
                        <input
                          className="input"
                          type={showPassphrase ? "text" : "password"}
                          placeholder="Passphrase"
                          value={form.passphrase}
                          onChange={set('passphrase')}
                        />
                        <button
                          type="button"
                          className="input-suffix-btn"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                          tabIndex={-1}
                          title={showPassphrase ? t('隐藏密码') : t('显示密码')}
                        >
                          {showPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ minWidth: 84, height: 34, fontSize: 13 }}
            >
              {t('取消')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ minWidth: 104, height: 34, fontSize: 13, fontWeight: 600 }}
            >
              {saving ? t('保存中...') : server ? t('保存配置') : t('添加')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
