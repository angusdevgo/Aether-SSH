import { useState, useEffect } from 'react';

const dict = {
  "zh-CN": {
    "闪电直连": "闪电直连",
    "服务器别名（选填）": "服务器别名（选填）",
    "例如：我的测试服": "例如：我的测试服",
    "主机地址 *": "主机地址 *",
    "用户名": "用户名",
    "认证方式": "认证方式",
    "密码认证": "密码认证",
    "私钥认证": "私钥认证",
    "密码": "密码",
    "请输入密码": "请输入密码",
    "私钥内容": "私钥内容",
    "浏览": "浏览",
    "私钥密码短语 (可选)": "私钥密码短语 (可选)",
    "立即闪连": "🚀 立即闪连",
    "系统状态": "系统状态",
    "服务器总数": "服务器总数",
    "在线节点": "在线节点",
    "离线节点": "离线节点",
    "快捷操作": "快捷操作",
    "密钥": "密钥",
    "日志": "日志",
    "主机": "主机",
    "添加": "添加",
    "终端": "终端",
    "文件管理": "文件管理",
    "历史指令": "历史指令",
    "返回主页": "返回主页",
    
    "暂无服务器": "暂无服务器",
    "点击右上角「添加」开始": "点击右上角「添加」开始",
    "连接": "连接",
    "编辑配置": "编辑配置",
    "删除": "删除",
    
    "会话输入历史": "会话输入历史",
    "清空列表": "清空列表",
    "您还没有手工输入任何命令": "您还没有手工输入任何命令",
    "在此连接的终端中手工输入并回车执行的指令将自动留存，方便您在此浏览与重复运行。": "在此连接的终端中手工输入并回车执行的指令将自动留存，方便您在此浏览与重复运行。",
    "复制": "复制",
    "复制路径": "复制路径",
    "路径已复制到剪贴板": "路径已复制到剪贴板",
    "再次运行": "再次运行",

    "名称": "名称",
    "大小": "大小",
    "修改时间": "修改时间",
    "新建文件夹": "新建文件夹",
    "上传文件": "上传文件",
    "刷新": "刷新",
    "加载中...": "加载中...",
    "目录为空": "目录为空",
    "编辑": "编辑",
    "下载到本地": "下载到本地",
    "压缩 (tar.gz)": "压缩 (tar.gz)",
    "解压": "解压",
    "重命名": "重命名",

    "请填写主机地址": "请填写主机地址",
    "请填写用户名": "请填写用户名",
    "保存中...": "保存中...",
    "保存配置": "💾 保存配置",
    "取消": "取消",

    "连接失败": "连接失败",
    "上传成功": "上传成功",
    "下载成功": "下载成功",
    "确定删除服务器": "确定删除服务器",
    "一切都很安静": "一切都很安静",
    "去连接个服务器吧，已经想念你了 🌿": "去连接个服务器吧，已经想念你了 🌿",
    "会话": "会话",
    "已连接": "已连接",
    "退出 Aether": "退出 Aether",
  },
  "en-US": {
    "闪电直连": "Quick Connect",
    "服务器别名（选填）": "Server Alias (Optional)",
    "例如：我的测试服": "e.g. Test Server",
    "主机地址 *": "Host Address *",
    "用户名": "Username",
    "认证方式": "Auth Method",
    "密码认证": "Password Auth",
    "私钥认证": "Private Key Auth",
    "密码": "Password",
    "请输入密码": "Enter your password",
    "私钥内容": "Private Key Content",
    "浏览": "Browse",
    "私钥密码短语 (可选)": "Passphrase (Optional)",
    "立即闪连": "🚀 Connect Now",
    "系统状态": "System Status",
    "服务器总数": "Total Servers",
    "在线节点": "Online Nodes",
    "离线节点": "Offline Nodes",
    "快捷操作": "Quick Actions",
    "密钥": "Keys",
    "日志": "Logs",
    "主机": "Hosts",
    "添加": "Add",
    "终端": "Terminal",
    "文件管理": "Files",
    "历史指令": "History",
    "返回主页": "Home",
    
    "暂无服务器": "No Servers Yet",
    "点击右上角「添加」开始": "Click '+ Add' to start",
    "连接": "Connect",
    "编辑配置": "Edit Config",
    "删除": "Delete",
    
    "会话输入历史": "Command History",
    "清空列表": "Clear List",
    "您还没有手工输入任何命令": "No commands entered manually yet",
    "在此连接的终端中手工输入并回车执行的指令将自动留存，方便您在此浏览与重复运行。": "Commands manually executed in this terminal will be saved automatically, allowing you to browse and run them again.",
    "复制": "Copy",
    "复制路径": "Copy Path",
    "路径已复制到剪贴板": "Path copied to clipboard",
    "再次运行": "Run Again",

    "名称": "Name",
    "大小": "Size",
    "修改时间": "Modified Time",
    "新建文件夹": "New Folder",
    "上传文件": "Upload File",
    "刷新": "Refresh",
    "加载中...": "Loading...",
    "目录为空": "Directory is empty",
    "编辑": "Edit",
    "下载到本地": "Download",
    "压缩 (tar.gz)": "Compress (tar.gz)",
    "解压": "Extract",
    "重命名": "Rename",

    "请填写主机地址": "Please enter host address",
    "请填写用户名": "Please enter username",
    "保存中...": "Saving...",
    "保存配置": "💾 Save Config",
    "取消": "Cancel",

    "连接失败": "Connection Failed",
    "上传成功": "Upload Success",
    "下载成功": "Download Success",
    "确定删除服务器": "Are you sure to delete",
    "一切都很安静": "It's all quiet here",
    "去连接个服务器吧，已经想念你了 🌿": "Connect to a server, we missed you 🌿",
    "会话": "SESSIONS",
    "已连接": "Connected",
    "退出 Aether": "Quit Aether",
  }
};

let currentLang = localStorage.getItem('appLanguage') || 'zh-CN';
const listeners = new Set();

export function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('appLanguage', lang);
  listeners.forEach(fn => fn(lang));
}

export function t(key) {
  const table = dict[currentLang] || dict['zh-CN'];
  return table[key] !== undefined ? table[key] : key;
}

export function useTranslation() {
  const [lang, setLang] = useState(currentLang);
  useEffect(() => {
    const handler = (l) => setLang(l);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);
  return { t, lang };
}
