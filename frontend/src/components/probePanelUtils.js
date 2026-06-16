/**
 * 复制 IP 到剪贴板并弹 toast（浏览器直接使用）
 * @param {string} ip
 * @param {(msg:string, type:string, dur:number)=>void} addToast
 */
export function copyIp(ip, addToast) {
  navigator.clipboard.writeText(ip);
  addToast(`IP 已复制: ${ip}`, 'success', 2000);
}

/**
 * 纯函数版 copyIp — 接受 clipboard 对象，便于测试注入
 * @param {string} ip
 * @param {{ writeText: (s:string)=>void }} clipboard
 * @param {(msg:string, type:string, dur:number)=>void} addToast
 */
export function copyIpWith(ip, clipboard, addToast) {
  clipboard.writeText(ip);
  addToast(`IP 已复制: ${ip}`, 'success', 2000);
}
