// 页面 ↔ 原生壳 桥接工具（macOS: WKWebView / Windows: WebView2）
'use strict';
window.DWUtil = {
  // 原生壳以 base64(JSON) 传参，避免转义问题
  parse(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  },
  // 设置页保存设置 → 原生壳持久化并同步到特效页
  save(obj) {
    const s = JSON.stringify(obj);
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dwBridge) {
      window.webkit.messageHandlers.dwBridge.postMessage(s);
    } else if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(s);
    }
  }
};
