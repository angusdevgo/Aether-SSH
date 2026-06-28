import { useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { search } from '@codemirror/search';

// 根据文件扩展名返回对应的 CodeMirror 语言
function getLanguage(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = {
    js: javascript(), jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }), tsx: javascript({ jsx: true, typescript: true }),
    py: python(),
    html: html(), htm: html(),
    css: css(), scss: css(), less: css(),
    json: json(),
    xml: xml(), svg: xml(),
    sql: sql(),
    sh: StreamLanguage.define(shell), bash: StreamLanguage.define(shell), zsh: StreamLanguage.define(shell),
    yml: StreamLanguage.define(shell), yaml: StreamLanguage.define(shell), toml: StreamLanguage.define(shell),
    ini: StreamLanguage.define(shell), conf: StreamLanguage.define(shell), cfg: StreamLanguage.define(shell),
    env: StreamLanguage.define(shell), properties: StreamLanguage.define(shell),
  };
  return map[ext] || null;
}

export default function FileEditor({ file, onSave, onClose, mode = 'modal' }) {
  const [content, setContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);

  const handleChange = useCallback((value) => {
    setContent(value);
    setModified(value !== file.content);
  }, [file.content]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(file.path, content);
    setSaving(false);
    setModified(false);
  };

  const handleClose = async () => {
    if (modified && !(await window.aetherDialog?.confirm('文件有未保存的修改，确定关闭？'))) return;
    onClose();
  };

  const lang = getLanguage(file.name);
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  const isSplit = mode === 'split';

  const editorBody = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}>{/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isSplit ? '6px 12px' : '24px 24px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✏️</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{file.name}</span>
          {modified && (
            <span style={{ fontSize: 11, background: 'var(--yellow-dim)', color: 'var(--yellow)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>未保存</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', padding: '2px 8px', borderRadius: 4 }}>{ext || 'text'}</span>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !modified}>{saving ? '保存中...' : '💾 保存'}</button>
          {!isSplit && <button className="btn btn-secondary btn-sm" onClick={handleClose}>关闭</button>}
        </div>
      </div>

      {/* File path */}
      <div style={{ padding: '4px 24px 8px', fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', borderBottom: '1px solid var(--border)' }}>{file.path}</div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <CodeMirror
          value={content}
          height="100%"
          minHeight="200px"
          theme={oneDark}
          extensions={lang ? [lang, search()] : [search()]}
          onChange={handleChange}
          style={{ fontSize: 14, height: '100%' }}
          basicSetup={{ lineNumbers: true, highlightActiveLineGutter: true, highlightSpecialChars: true, history: true, foldGutter: true, drawSelection: true, dropCursor: true, allowMultipleSelections: true, indentOnInput: true, syntaxHighlighting: true, bracketMatching: true, closeBrackets: true, autocompletion: true, rectangularSelection: true, crosshairCursor: false, highlightActiveLine: true, highlightSelectionMatches: true, closeBracketsKeymap: true, defaultKeymap: true, searchKeymap: true, historyKeymap: true, foldKeymap: true, completionKeymap: true, lintKeymap: true }}
        />
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 24px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
        <span>{content.split('\n').length} 行 · {new Blob([content]).size} 字节</span>
        <span>UTF-8 · {lang ? ext.toUpperCase() : 'Text'}</span>
      </div>
    </div>
  );

  if (isSplit) return editorBody;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="modal modal-xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {editorBody}
      </div>
    </div>
  );
}
