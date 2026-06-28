import { useState, useEffect, useCallback, useRef } from 'react';
import * as AppGo from '../../wailsjs/go/main/App.js';
import FileEditor from './FileEditor.jsx';
import { buildRemotePath, canCopyRemotePath } from './fileManagerPaths.js';
import { useTranslation } from '../i18n.js';

// 格式化文件大小
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// 格式化日期
function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// 文件图标
function fileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    js: '🟨', jsx: '🟨', ts: '🔷', tsx: '🔷', vue: '💚',
    py: '🐍', rb: '💎', go: '🐹', rs: '🦀', java: '☕',
    c: '🔵', cpp: '🔵', h: '🔵', cs: '🟣',
    html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
    json: '⚙️', yaml: '⚙️', yml: '⚙️', toml: '⚙️', ini: '⚙️', env: '⚙️',
    md: '📝', txt: '📄', log: '📋',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', svg: '🖼', webp: '🖼',
    zip: '🗜', tar: '🗜', gz: '🗜', rar: '🗜', '7z': '🗜',
    sh: '🔧', bash: '🔧', zsh: '🔧',
    pdf: '📕', sql: '🗃', xml: '📰', php: '🐘',
    mp4: '🎬', mkv: '🎬', avi: '🎬',
    mp3: '🎵', wav: '🎵',
  };
  return map[ext] || '📄';
}

// 判断是否可以编辑（文本文件）
function isEditable(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const editable = [
    'txt', 'md', 'log', 'json', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'config', 'cfg',
    'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs',
    'php', 'html', 'css', 'scss', 'less', 'xml', 'sql', 'sh', 'bash', 'zsh', 'vue', 'svelte',
    'bat', 'ps1', 'psm1', 'properties', 'lock', 'pub', 'cmake', 'gradle', 'toml',
    'nginx', 'gitignore', 'dockerfile', 'makefile', 'editorconfig', 'prettierrc', 'eslintrc',
    'csv', 'tsv', 'rst', 'tex', 'lua', 'pl', 'r', 'swift', 'kt', 'scala', 'dart',
  ];
  if (editable.includes(ext)) return true;
  // No extension (like Dockerfile, Makefile)
  if (!name.includes('.')) return true;
  return false;
}

// 判断是否为压缩包
function isArchive(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ['zip', 'tar', 'gz', 'bz2', 'tgz', 'rar', '7z'].includes(ext) || name.toLowerCase().endsWith('.tar.gz');
}

// Context menu component
function ContextMenu({ pos, item, onClose, onCopyPath, onDownload, onEdit, onRename, onDelete, onMkdir, onCompress, onUncompress, onOpenLocal, t }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: Math.min(pos.x, window.innerWidth - 180), top: Math.min(pos.y, window.innerHeight - 200) }}
    >
      {item && !item.isDirectory && isEditable(item.name) && (
        <div className="context-menu-item" onClick={onEdit}>
          <span>✏️</span> {t('编辑')}
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onDownload}>
          <span>⬇️</span> {t('下载到本地')}
        </div>
      )}
      {item && !item.isDirectory && (
        <div className="context-menu-item" onClick={onOpenLocal}>
          <span>🖥</span> {t('本地编辑器打开')}
        </div>
      )}
      {item && canCopyRemotePath(item) && (
        <div className="context-menu-item" onClick={onCopyPath}>
          <span>📋</span> {t('复制路径')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onCompress}>
          <span>📦</span> {t('压缩 (tar.gz)')}
        </div>
      )}
      {item && !item.isDirectory && isArchive(item.name) && (
        <div className="context-menu-item" onClick={onUncompress}>
          <span>🗜</span> {t('解压')}
        </div>
      )}
      {item && (
        <div className="context-menu-item" onClick={onRename}>
          <span>✏</span> {t('重命名')}
        </div>
      )}
      <div className="context-menu-divider" />
      {!item && (
        <div className="context-menu-item" onClick={onMkdir}>
          <span>📁</span> {t('新建文件夹')}
        </div>
      )}
      {item && (
        <div className="context-menu-item danger" onClick={onDelete}>
          <span>🗑</span> {t('删除')}
        </div>
      )}
    </div>
  );
}

export default function FileManager({ sessionId, addToast }) {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState('/');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { pos, item }
  const [renamingItem, setRenamingItem] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [editFile, setEditFile] = useState(null);      // { path, name, content }
  const [editMode, setEditMode] = useState(localStorage.getItem('editMode') || 'modal');
  const [transferInfo, setTransferInfo] = useState(null);
  const [sortBy, setSortBy] = useState(localStorage.getItem('fmSortBy') || 'name');
  const [sortDir, setSortDir] = useState(localStorage.getItem('fmSortDir') || 'asc');

  const loadDir = useCallback(async (path) => {
    setLoading(true);
    try {
      const data = await AppGo.ListDir(sessionId, path);
      // Wails 传回的数据： name, isDirectory, size, modifyTime, rights
      const sorted = (data || []).sort((a, b) => {
        // 文件夹始终在文件前面
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        // 同类型内按 sortBy 排序
        let cmp = 0;
        if (sortBy === 'name') {
          cmp = (a.name || '').localeCompare(b.name || '');
        } else if (sortBy === 'size') {
          cmp = (a.size || 0) - (b.size || 0);
        } else if (sortBy === 'time') {
          cmp = (a.modifyTime || '').localeCompare(b.modifyTime || '');
        }
        return sortDir === 'desc' ? -cmp : cmp;
      });
      setItems(sorted);
      setCurrentPath(path);
    } catch (err) {
      addToast(`读取目录失败: ${err}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, addToast, sortBy, sortDir]);

  // ── 初始化自动同步最新终端目录 ───────────────────────────
  useEffect(() => {
    const initPath = async () => {
      try {
        const cwd = await AppGo.GetTerminalCwd(sessionId);
        if (cwd) {
          loadDir(cwd);
          return;
        }
      } catch (_) {}
      loadDir('/');
    };
    initPath();
  }, [sessionId, loadDir]);

  // ── 监听终端内的目录切换事件 ─────────────────────────────
  useEffect(() => {
    // 向全局标志位注册订阅，告知 Terminal 组件"文件管理器已挂载，需要 CWD 探测"
    if (!window.__cwdListeners) window.__cwdListeners = {};
    window.__cwdListeners[sessionId] = true;

    const handleTerminalCwd = (e) => {
      if (e.detail && e.detail.sessionId === sessionId) {
        const newPath = e.detail.cwd;
        if (newPath && newPath !== currentPath) {
          loadDir(newPath);
        }
      }
    };
    window.addEventListener('ssh-terminal-cwd-changed', handleTerminalCwd);
    return () => {
      // 注销订阅，文件管理器不可见时不再触发 CWD 探测
      if (window.__cwdListeners) delete window.__cwdListeners[sessionId];
      window.removeEventListener('ssh-terminal-cwd-changed', handleTerminalCwd);
    };
  }, [sessionId, currentPath, loadDir]);

  useEffect(() => {
    const handleProgress = (e) => {
      setTransferInfo(prev => {
        if (!prev) return prev;
        return { ...prev, progress: e.detail };
      });
    };
    const eventName = `transfer-progress-${sessionId}`;
    window.addEventListener(eventName, handleProgress);
    return () => window.removeEventListener(eventName, handleProgress);
  }, [sessionId]);

  // Breadcrumb parts
  const pathParts = currentPath === '/'
    ? [{ label: '🏠', path: '/' }]
    : currentPath.split('/').filter(Boolean).reduce((acc, part, i, arr) => {
        const path = '/' + arr.slice(0, i + 1).join('/');
        acc.push({ label: part, path });
        return acc;
      }, [{ label: '🏠', path: '/' }]);

  // Navigate into folder
  const navigate = (item) => {
    if (!item.isDirectory) return;
    const newPath = currentPath === '/'
      ? `/${item.name}`
      : `${currentPath}/${item.name}`;
    loadDir(newPath);
  };

  const handleSort = (col) => {
    const next = sortBy === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    setSortBy(col); setSortDir(next);
    localStorage.setItem('fmSortBy', col); localStorage.setItem('fmSortDir', next);
  };

  const sortArrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  // Upload file via Wails native file dialog
  const handleUpload = async () => {
    try {
      setTransferInfo({ name: '正在选择文件...', progress: 0, direction: 'upload' });
      await AppGo.UploadFile(sessionId, currentPath);
      addToast(`上传成功`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      if (err) addToast(`上传失败: ${err}`, 'error');
    } finally {
      setTransferInfo(null);
    }
  };

  // Download file via Wails native file dialog
  const handleDownload = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    
    try {
      setTransferInfo({ name: item.name, progress: 0, direction: 'download' });
      await AppGo.DownloadFile(sessionId, remotePath);
      addToast(`下载成功: ${item.name}`, 'success');
    } catch (err) {
      if (err) addToast(`下载失败: ${err}`, 'error');
    } finally {
      setTransferInfo(null);
    }
  };

  // Open file editor
  const handleEdit = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    try {
      const content = await AppGo.ReadFile(sessionId, remotePath);
      setEditFile({ path: remotePath, name: item.name, content });
    } catch (err) {
      addToast(`无法打开文件: ${err}`, 'error');
    }
  };

  // Open file with local system editor
  const handleOpenLocal = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    try {
      await AppGo.EditWithLocalEditor(sessionId, remotePath);
      addToast(`已在本地编辑器打开 ${item.name}，修改保存后自动同步`, 'success', 3000);
    } catch (err) {
      addToast(`打开失败: ${err}`, 'error');
    }
    closeContextMenu();
  };

  // Save file from editor
  const handleSaveFile = async (path, content) => {
    try {
      await AppGo.WriteFile(sessionId, path, content);
      addToast('文件保存成功', 'success');
      setEditFile(null);
    } catch (err) {
      addToast(`保存失败: ${err}`, 'error');
    }
  };

  // Delete
  const handleDelete = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    if (!(await window.aetherDialog?.confirm(`确定删除「${item.name}」？此操作不可撤销`))) return;
    try {
      await AppGo.DeleteItem(sessionId, remotePath, item.isDirectory);
      addToast(`已删除: ${item.name}`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`删除失败: ${err}`, 'error');
    }
  };

  // Create directory
  const handleMkdir = async () => {
    const name = await window.aetherDialog?.prompt('新文件夹名称:');
    if (!name) return;
    const remotePath = buildRemotePath(currentPath, name);
    try {
      await AppGo.Mkdir(sessionId, remotePath);
      addToast(`文件夹创建成功: ${name}`, 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`创建失败: ${err}`, 'error');
    }
  };

  // Compress
  const handleCompress = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    try {
      setLoading(true);
      addToast(`正在压缩 ${item.name}...`, 'info');
      await AppGo.CompressItem(sessionId, remotePath);
      addToast('压缩成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`压缩失败: ${err}`, 'error');
      setLoading(false);
    }
  };

  // Uncompress
  const handleUncompress = async (item) => {
    const remotePath = buildRemotePath(currentPath, item.name);
    try {
      setLoading(true);
      addToast(`正在解压 ${item.name}...`, 'info');
      await AppGo.UncompressItem(sessionId, remotePath);
      addToast('解压成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`解压失败: ${err}`, 'error');
      setLoading(false);
    }
  };

  // Rename
  const startRename = (item) => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const confirmRename = async () => {
    if (!renamingItem || !renameValue.trim() || renameValue === renamingItem.name) {
      setRenamingItem(null);
      return;
    }
    const oldPath = buildRemotePath(currentPath, renamingItem.name);
    const newPath = buildRemotePath(currentPath, renameValue);
    try {
      await AppGo.RenameItem(sessionId, oldPath, newPath);
      addToast('重命名成功', 'success');
      await loadDir(currentPath);
    } catch (err) {
      addToast(`重命名失败: ${err}`, 'error');
    } finally {
      setRenamingItem(null);
    }
  };

  const handleCopyPath = async (item) => {
    try {
      await navigator.clipboard.writeText(buildRemotePath(currentPath, item.name));
      addToast(t('路径已复制到剪贴板'), 'success');
    } catch (err) {
      addToast(`复制路径失败: ${err}`, 'error');
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  // Drag-and-drop upload
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = async (e) => {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result;
            resolve(dataUrl.split(',')[1]); // 去掉 "data:mime;base64," 前缀
          };
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        setTransferInfo({ name: f.name, progress: 0, direction: 'upload' });
        await AppGo.WriteFileBytes(sessionId, buildRemotePath(currentPath, f.name), base64);
        addToast(`${f.name} 上传成功`, 'success');
      } catch (err) {
        addToast(`${f.name} 失败: ${err}`, 'error', 4000);
      }
    }
    setTransferInfo(null);
    loadDir(currentPath);
  };

  return (
    <div
      className="file-manager"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ pos: { x: e.clientX, y: e.clientY }, item: null });
      }}
    >
      {/* Toolbar */}
      <div className="file-toolbar">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          {pathParts.map((part, i) => (
            <span key={part.path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <span
                className={`breadcrumb-item ${i === pathParts.length - 1 ? 'current' : ''}`}
                onClick={() => i < pathParts.length - 1 && loadDir(part.path)}
              >
                {part.label}
              </span>
            </span>
          ))}
        </div>

        <button className="btn btn-secondary btn-sm" onClick={handleMkdir}>📁 {t('新建文件夹')}</button>
        <button className="btn btn-secondary btn-sm" onClick={handleUpload}>
          ⬆ {t('上传文件')}
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          title="刷新"
          onClick={() => loadDir(currentPath)}
        >
          ↻
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, marginLeft: 4 }}
          title={editMode === 'modal' ? '切换为分屏编辑' : '切换为弹窗编辑'}
          onClick={() => {
            const next = editMode === 'modal' ? 'split' : 'modal';
            setEditMode(next);
            localStorage.setItem('editMode', next);
          }}
        >
          {editMode === 'modal' ? '🪟 弹窗' : '📐 分屏'}
        </button>
      </div>

      {/* Content: file list or split editor */}
      {editFile && editMode === 'split' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <button
            onClick={() => setEditFile(null)}
            style={{ alignSelf: 'flex-start', margin: '8px 12px 4px', padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-4)', fontSize: 12, cursor: 'pointer' }}
          >← 返回</button>
          <FileEditor file={editFile} onSave={handleSaveFile} onClose={() => setEditFile(null)} mode="split" />
        </div>
      ) : (
      <>
      {/* File List */}
      <div className="file-list">
        <div className="file-list-header">
          <span onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>{t('名称')}{sortArrow('name')}</span>
          <span onClick={() => handleSort('size')} style={{ cursor: 'pointer' }}>{t('大小')}{sortArrow('size')}</span>
          <span onClick={() => handleSort('time')} style={{ cursor: 'pointer' }}>{t('修改时间')}{sortArrow('time')}</span>
          <span></span>
        </div>

        {/* Back button */}
        {currentPath !== '/' && (
          <div
            className="file-item"
            onClick={() => {
              const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
              loadDir(parent);
            }}
          >
            <div className="file-name-cell">
              <span className="file-icon">↩</span>
              <span className="file-name is-dir">..</span>
            </div>
            <span />
            <span />
            <span />
          </div>
        )}

        {loading && (
          <div className="empty-state">
            <div className="spin" style={{ fontSize: 24 }}>⟳</div>
            <div className="empty-state-text">{t('加载中...')}</div>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-text">{t('目录为空')}</div>
          </div>
        )}

        {!loading && items.map((item) => {
          const isRenaming = renamingItem?.name === item.name;

          return (
            <div
              key={item.name}
              className="file-item"
              onDoubleClick={() => item.isDirectory ? navigate(item) : isEditable(item.name) && handleEdit(item)}
              onClick={() => item.isDirectory && navigate(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ pos: { x: e.clientX, y: e.clientY }, item });
              }}
            >
              <div className="file-name-cell">
                <span className="file-icon">{fileIcon(item.name, item.isDirectory)}</span>
                {isRenaming ? (
                  <input
                    className="rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename();
                      if (e.key === 'Escape') setRenamingItem(null);
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className={`file-name ${item.isDirectory ? 'is-dir' : ''}`}>
                    {item.name}
                  </span>
                )}
              </div>

              <span className="file-size">{item.isDirectory ? '-' : fmtSize(item.size)}</span>
              <span className="file-date">{fmtDate(item.modifyTime)}</span>

              <div className="file-actions">
                {!item.isDirectory && isEditable(item.name) && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title="编辑"
                    onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                  >✏️</button>
                )}
                {!item.isDirectory && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title="下载到本地"
                    onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                  >⬇️</button>
                )}
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="重命名"
                  onClick={(e) => { e.stopPropagation(); startRename(item); }}
                >✏</button>
                <button
                  className="btn btn-ghost btn-sm btn-icon"
                  title="删除"
                  style={{ color: 'var(--red)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                >🗑</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          pos={contextMenu.pos}
          item={contextMenu.item}
          t={t}
          onClose={closeContextMenu}
          onCopyPath={() => { handleCopyPath(contextMenu.item); closeContextMenu(); }}
          onDownload={() => { handleDownload(contextMenu.item); closeContextMenu(); }}
          onOpenLocal={() => { handleOpenLocal(contextMenu.item); }}
          onEdit={() => { handleEdit(contextMenu.item); closeContextMenu(); }}
          onRename={() => { startRename(contextMenu.item); closeContextMenu(); }}
          onDelete={() => { handleDelete(contextMenu.item); closeContextMenu(); }}
          onMkdir={() => { handleMkdir(); closeContextMenu(); }}
          onCompress={() => { handleCompress(contextMenu.item); closeContextMenu(); }}
          onUncompress={() => { handleUncompress(contextMenu.item); closeContextMenu(); }}
        />
      )}

      {/* Transfer Progress Toast */}
      {transferInfo && (
        <div className="transfer-toast">
          <div className="transfer-toast-title">
            {transferInfo.direction === 'upload' ? `⬆ ${t('上传中') || '上传中'}` : `⬇ ${t('下载中') || '下载中'}`}: {transferInfo.name}
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${transferInfo.progress}%` }}
            />
          </div>
        </div>
      )}
      </>)}

      {/* File Editor Modal (only in modal mode) */}
      {editFile && editMode === 'modal' && (
        <FileEditor
          file={editFile}
          onSave={handleSaveFile}
          onClose={() => setEditFile(null)}
          mode={editMode}
        />
      )}
    </div>
  );
}
