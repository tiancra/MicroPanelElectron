const { contextBridge, ipcRenderer } = require('electron');

// 日志工具函数
function logControlEvent(eventType, controlName, details = {}) {
  ipcRenderer.send('control-event', {
    eventType,
    controlName,
    details,
    timestamp: new Date().toISOString()
  });
}

// 删除指定图标
function removeTargetIcon() {
  try {
    // 查找所有包含SVG的el-icon元素
    const icons = document.querySelectorAll('.el-icon');
    icons.forEach(icon => {
      const svg = icon.querySelector('svg');
      if (svg) {
        const path = svg.querySelector('path');
        if (path) {
          // 检查SVG路径是否匹配目标图标
          const pathData = path.getAttribute('d');
          if (pathData === 'M128 192h768v128H128zm0 256h512v128H128zm0 256h768v128H128zm576-352 192 160-192 128z') {
            console.log('Found target icon, removing...');
            icon.remove();
          }
        }
      }
    });
  } catch (error) {
    console.error('Error removing icon:', error);
  }
}

// 当DOM加载完成后删除图标
window.addEventListener('DOMContentLoaded', () => {
  removeTargetIcon();
  
  // 使用MutationObserver监控DOM变化，确保图标出现时能及时删除
  if (window.MutationObserver) {
    const observer = new MutationObserver(() => {
      removeTargetIcon();
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch (error) {
      console.error('Error setting up MutationObserver:', error);
    }
  }
});

window.addEventListener(
  'contextmenu',
  (e) => {
    if (!e) return;
    const enable = (e.shiftKey && e.ctrlKey) || (e.shiftKey && e.metaKey);
    if (!enable) return;
    try {
      e.preventDefault();
      e.stopPropagation();
    } catch {}
    ipcRenderer.send('devtools-inspect', { x: Math.round(e.clientX || 0), y: Math.round(e.clientY || 0) });
  },
  true,
);

// 监听全屏变化事件
window.addEventListener('fullscreenchange', () => {
  const isFullscreen = document.fullscreenElement !== null;
  ipcRenderer.send('window-fullscreen-changed', isFullscreen);
});

// 获取当前路由
function getCurrentRoute() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#')) {
    return hash.slice(1);
  }
  return '/';
}

// 发送路由变化事件
function sendRouteChangeEvent() {
  const route = getCurrentRoute();
  ipcRenderer.send('route-change', { route });
}

// 监听路由变化
window.addEventListener('hashchange', sendRouteChangeEvent);

// 当DOM加载完成后发送初始路由
window.addEventListener('DOMContentLoaded', sendRouteChangeEvent);

contextBridge.exposeInMainWorld('microPanel', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  getServerOrigin: async () => {
    const res = await ipcRenderer.invoke('server-get');
    return res?.origin || '';
  },
  setServerOrigin: async (origin) => {
    await ipcRenderer.invoke('server-set', { origin });
  },

  getAuthState: async () => {
    const res = await ipcRenderer.invoke('auth-get');
    return res && typeof res === 'object' ? res : {};
  },
  setAuthState: async (payload) => {
    await ipcRenderer.invoke('auth-set', payload && typeof payload === 'object' ? payload : {});
  },

  gotoLogin: (origin, options) => ipcRenderer.send('navigate', { target: 'login', origin, ...(options && typeof options === 'object' ? options : {}) }),
  gotoConfig: (options) => ipcRenderer.send('navigate', { target: 'config', ...(options && typeof options === 'object' ? options : {}) }),
  gotoApp: (origin, options) => ipcRenderer.send('navigate', { target: 'app', origin, ...(options && typeof options === 'object' ? options : {}) }),

  // 监听窗口控制按钮显示/隐藏事件
  onUpdateWindowControls: (callback) => {
    ipcRenderer.on('update-window-controls', (event, show) => {
      callback(show);
    });
  },
  
  // 重启到调试模式
  restartToDebugMode: () => ipcRenderer.send('restart-to-debug-mode'),
  
  // 控件事件日志
  logControlEvent: (eventType, controlName, details = {}) => ipcRenderer.send('control-event', {
    eventType,
    controlName,
    details,
    timestamp: new Date().toISOString()
  }),
  
  // 打开系统浏览器
  openInBrowser: (url) => ipcRenderer.send('open-in-browser', url),
  
  // 发送路由变化事件
  sendRouteChange: (route) => ipcRenderer.send('route-change', { route }),
  
  // 打开开发者工具
  openDevTools: (position) => ipcRenderer.send('devtools-inspect', position),
  
  // 发送全屏变化事件
  sendFullscreenChange: (isFullscreen) => ipcRenderer.send('window-fullscreen-changed', isFullscreen),
  
  // 获取设备信息
  getDeviceInfo: async () => {
    const res = await ipcRenderer.invoke('get-device-info');
    return res && typeof res === 'object' ? res : {
      cpu: '未知',
      memory: '未知',
      system: '未知',
      kernel: '未知',
      version: '1.0.0'
    };
  }
});
