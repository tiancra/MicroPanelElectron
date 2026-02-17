const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require('electron');
const { argv } = require('process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');
const childProcess = require('child_process');

// 日志颜色定义
const LOG_COLORS = {
  INFO: '\x1b[36m',  // 青色
  MARK: '\x1b[32m',  // 绿色
  ERROR: '\x1b[31m', // 红色
  DEBUG: '\x1b[35m', // 紫色
  TRACE: '\x1b[33m', // 黄色
  RESET: '\x1b[0m'   // 重置
};

// 日志工具函数
function logInfo(...args) {
  console.log(`${LOG_COLORS.INFO}[INFO]${LOG_COLORS.RESET}`, ...args);
}

function logMark(...args) {
  console.log(`${LOG_COLORS.MARK}[MARK]${LOG_COLORS.RESET}`, ...args);
}

function logError(...args) {
  console.error(`${LOG_COLORS.ERROR}[ERROR]${LOG_COLORS.RESET}`, ...args);
}

function logDebug(...args) {
  console.log(`${LOG_COLORS.DEBUG}[DEBUG]${LOG_COLORS.RESET}`, ...args);
}

function logTrace(...args) {
  console.log(`${LOG_COLORS.TRACE}[TRACE]${LOG_COLORS.RESET}`, ...args);
}

logInfo('命令行参数:', argv);

// 检查是否以debug模式启动
const isDebugMode = argv.includes('--debugmode');

logInfo('Debug mode status:', isDebugMode);

// 立即显示调试模式信息
if (isDebugMode) {
  logMark('=== Micro Panel Debug Mode ===');
  logInfo('Application is starting, developer tools are enabled');
  logInfo('Shortcuts: F12 or Ctrl+Shift+I to open developer tools');
  logInfo('Detailed logs will be displayed in this command line window');
  logMark('========================');
  logDebug('I love Microsoft');
  
  // 启用更详细的日志输出
  logDebug('Debug mode logging enabled:');
  logDebug('- Window creation events');
  logDebug('- Navigation events');
  logDebug('- IPC communication');
  logDebug('- Application lifecycle events');
  logMark('========================');
}

// 添加应用程序错误处理
app.on('error', (error) => {
  logError('应用程序错误:', error);
});

// 添加进程错误处理
process.on('error', (error) => {
  logError('进程错误:', error);
});

// 添加未捕获异常处理
process.on('uncaughtException', (error) => {
  logError('未捕获异常:', error);
});

// 添加未处理的Promise拒绝处理
process.on('unhandledRejection', (reason, promise) => {
  logError('未处理的Promise拒绝:', reason);
});

let mainWindow = null;
let authWindow = null;
let staticServer = null;
let staticBaseUrl = '';

function getConfigFilePath() {
  return path.join(app.getPath('userData'), 'server-config.json');
}

function getAuthFilePath() {
  return path.join(app.getPath('userData'), 'auth.json');
}

function readServerOrigin() {
  try {
    const filePath = getConfigFilePath();
    if (!fs.existsSync(filePath)) return '';
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    return typeof json?.origin === 'string' ? json.origin : '';
  } catch {
    return '';
  }
}

function writeServerOrigin(origin) {
  const filePath = getConfigFilePath();
  const payload = JSON.stringify({ origin }, null, 2);
  
  try {
    // 确保目录存在
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, payload, 'utf8');
  } catch (error) {
      logError('Failed to write server origin file:', error.message);
    }
}

function readAuth() {
  try {
    const filePath = getAuthFilePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    return json && typeof json === 'object' ? json : {};
  } catch {
    return {};
  }
}

function writeAuth(payload) {
  const filePath = getAuthFilePath();
  const safe = payload && typeof payload === 'object' ? payload : {};
  
  try {
    // 确保目录存在
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
  } catch (error) {
    logError('Failed to write auth file:', error.message);
  }
}

function proxyToServer(req, res, targetOrigin) {
  let targetUrl;
  try {
    targetUrl = new URL(req.url || '/', targetOrigin);
  } catch {
    res.statusCode = 502;
    res.end('Bad Gateway');
    return;
  }

  const isHttps = targetUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  delete headers.origin;

  const options = {
    method: req.method,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    headers,
  };

  // Log outgoing request in debug mode
  if (isDebugMode) {
    logDebug(`Outgoing request: ${req.method} ${targetUrl.href}`);
    logDebug(`Request headers:`, headers);
  }

  const upstream = client.request(options, (upstreamRes) => {
    const statusCode = upstreamRes.statusCode || 502;
    
    // Log incoming response in debug mode
    if (isDebugMode) {
      logDebug(`Incoming response: ${statusCode} ${targetUrl.href}`);
      logDebug(`Response headers:`, upstreamRes.headers);
    }
    
    res.writeHead(statusCode, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) res.statusCode = 502;
    res.end('Bad Gateway');
  });

  const pathname = targetUrl.pathname || '';
  if (pathname === '/api/server/address') {
    try {
      const remote = new URL(targetOrigin);
      const payload = JSON.stringify({
        hostname: remote.hostname,
        port: remote.port || '',
        protocol: remote.protocol.replace(':', ''),
        origin: remote.origin,
      });
      upstream.setHeader('Content-Type', 'application/json');
      upstream.setHeader('Content-Length', Buffer.byteLength(payload));
      upstream.write(payload);
      upstream.end();
      return;
    } catch {}
  }

  req.pipe(upstream);
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isDebugMode) {
      logDebug('Main window already exists, returning existing instance');
    }
    return mainWindow;
  }
  
  if (isDebugMode) {
    logDebug('Creating main window...');
  }
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'Micro Panel',
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });
  
  if (isDebugMode) {
    logDebug('Main window created with ID:', mainWindow.id);
    
    // 监听窗口事件
    mainWindow.on('show', () => {
      logTrace('Main window shown');
    });
    
    mainWindow.on('hide', () => {
      logTrace('Main window hidden');
    });
    
    mainWindow.on('focus', () => {
      logTrace('Main window focused');
    });
    
    mainWindow.on('blur', () => {
      logTrace('Main window blurred');
    });
    
    mainWindow.on('resize', () => {
      const bounds = mainWindow.getBounds();
      logTrace('Main window resized:', bounds.width, 'x', bounds.height);
    });
    
    mainWindow.on('move', () => {
      const position = mainWindow.getPosition();
      logTrace('Main window moved:', position[0], position[1]);
    });
    
    mainWindow.on('close', () => {
      logTrace('Main window closing');
    });
  }
  
  mainWindow.on('closed', () => {
    if (isDebugMode) {
      logTrace('Main window closed');
    }
    mainWindow = null;
  });
  
  return mainWindow;
}

function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    if (isDebugMode) {
      logDebug('Auth window already exists, returning existing instance');
    }
    return authWindow;
  }
  
  if (isDebugMode) {
    logDebug('Creating auth window...');
  }
  
  authWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 520,
    minHeight: 720,
    maxWidth: 520,
    maxHeight: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Micro Panel',
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });
  
  if (isDebugMode) {
    logDebug('Auth window created with ID:', authWindow.id);
    
    // 监听窗口事件
    authWindow.on('show', () => {
      logTrace('Auth window shown');
    });
    
    authWindow.on('hide', () => {
      logTrace('Auth window hidden');
    });
    
    authWindow.on('focus', () => {
      logTrace('Auth window focused');
    });
    
    authWindow.on('blur', () => {
      logTrace('Auth window blurred');
    });
    
    authWindow.on('close', () => {
      logTrace('Auth window closing');
    });
  }
  
  authWindow.on('closed', () => {
    if (isDebugMode) {
      logTrace('Auth window closed');
    }
    authWindow = null;
  });
  
  return authWindow;
}

function showAuth(target, origin = '') {
  if (isDebugMode) {
    logDebug('Showing auth window for target:', target, 'with origin:', origin);
  }
  
  const win = createAuthWindow();
  const pathName = target === 'config' ? '/config.html' : '/login.html';
  const u = new URL(staticBaseUrl + pathName);
  if (target === 'login' && origin) {
    u.searchParams.set('serverOrigin', origin);
    if (isDebugMode) {
      logDebug('Added serverOrigin parameter:', origin);
    }
  }
  
  const url = u.toString();
  if (isDebugMode) {
    logDebug('Loading URL in auth window:', url);
  }
  
  win.loadURL(url);
  
  if (isDebugMode) {
    // 监听页面加载事件
    win.webContents.once('did-start-loading', () => {
      logTrace('Auth window started loading:', url);
    });
    
    win.webContents.once('did-finish-load', () => {
      logTrace('Auth window finished loading:', url);
    });
    
    win.webContents.once('dom-ready', () => {
      logTrace('Auth window DOM ready:', url);
    });
    
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logError('Auth window failed to load:', validatedURL, 'Error:', errorCode, errorDescription);
    });
  }
  
  const show = () => {
    if (win && !win.isDestroyed()) {
      if (isDebugMode) {
        logTrace('Showing auth window');
      }
      win.show();
    }
  };
  
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', show);
  } else {
    show();
  }
  
  // 在调试模式下，向渲染进程注入调试模式标识
  if (isDebugMode) {
    win.webContents.once('did-finish-load', () => {
      if (isDebugMode) {
        logTrace('Injecting debug mode flag into auth window');
      }
      win.webContents.executeJavaScript(`window.__MICROPANEL_DEBUG_MODE__ = true;`);
    });
  }
}

function showApp(origin = '') {
  if (isDebugMode) {
    logDebug('Showing main app window with origin:', origin);
  }
  
  const win = createMainWindow();
  const u = new URL(staticBaseUrl + '/index.html');
  if (origin) {
    u.searchParams.set('serverOrigin', origin);
    if (isDebugMode) {
      logDebug('Added serverOrigin parameter:', origin);
    }
  }
  u.hash = '/';
  
  const url = u.toString();
  if (isDebugMode) {
    logDebug('Loading URL in main app window:', url);
  }
  
  win.loadURL(url);
  
  if (isDebugMode) {
    // 监听页面加载事件
    win.webContents.once('did-start-loading', () => {
      logTrace('Main app window started loading:', url);
    });
    
    win.webContents.once('did-finish-load', () => {
      logTrace('Main app window finished loading:', url);
    });
    
    win.webContents.once('dom-ready', () => {
      logTrace('Main app window DOM ready:', url);
    });
    
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logError('Main app window failed to load:', validatedURL, 'Error:', errorCode, errorDescription);
    });
    
    // 监听导航事件
    win.webContents.on('will-navigate', (event, navigationUrl) => {
      logTrace('Main app window will navigate to:', navigationUrl);
    });
    
    win.webContents.on('did-navigate', (event, navigationUrl, httpResponseCode, httpStatusText) => {
      logTrace('Main app window navigated to:', navigationUrl, 'Status:', httpResponseCode, httpStatusText);
    });
    
    win.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      logTrace('Main app window navigated in page:', url, 'Is main frame:', isMainFrame);
    });
  }
  
  const show = () => {
    if (win && !win.isDestroyed()) {
      if (isDebugMode) {
        logTrace('Showing main app window');
      }
      win.show();
    }
  };
  
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', show);
  } else {
    show();
  }
  
  // 在调试模式下，向渲染进程注入调试模式标识
  if (isDebugMode) {
    win.webContents.once('did-finish-load', () => {
      if (isDebugMode) {
        logTrace('Injecting debug mode flag into main app window');
      }
      win.webContents.executeJavaScript(`window.__MICROPANEL_DEBUG_MODE__ = true;`);
    });
  }
}

app.whenReady().then(async () => {
    // 在debug模式下，显示启动信息
    if (isDebugMode) {
      logMark('=== Micro Panel Debug Mode ===');
      logInfo('Application has started, developer tools are enabled');
      logInfo('Shortcuts: F12 or Ctrl+Shift+I to open developer tools');
      logMark('========================');
    }

    const publicDir = path.join(__dirname, 'public');
    staticServer = http.createServer((req, res) => {
      const rawUrl = req.url || '/';
      const urlObj = new URL(rawUrl, 'http://127.0.0.1');
      let pathname = decodeURIComponent(urlObj.pathname || '/');
      if (pathname === '/') pathname = '/index.html';
      
      // Log static file requests in debug mode
      if (isDebugMode) {
        logDebug(`Static file request: ${req.method} ${rawUrl}`);
      }

      if (pathname.startsWith('/api/') || pathname === '/api' || pathname.startsWith('/micro/') || pathname.startsWith('/ws/') || pathname.startsWith('/socket/')) {
        const targetOrigin = readServerOrigin();
        if (!targetOrigin) {
          res.statusCode = 502;
          res.end('Server not configured');
          return;
        }
        proxyToServer(req, res, targetOrigin);
        return;
      }

      const safePathname = pathname.replace(/^\/+/, '');
      const filePath = path.resolve(publicDir, safePathname);
      if (!filePath.startsWith(publicDir)) {
        // Log 403 response in debug mode
        if (isDebugMode) {
          logDebug(`Static file response: 403 ${rawUrl}`);
        }
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
          // Log 404 response in debug mode
          if (isDebugMode) {
            logDebug(`Static file response: 404 ${rawUrl}`);
          }
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime =
          ext === '.html' ? 'text/html; charset=utf-8'
            : ext === '.js' ? 'application/javascript; charset=utf-8'
              : ext === '.css' ? 'text/css; charset=utf-8'
                : ext === '.json' ? 'application/json; charset=utf-8'
                  : ext === '.svg' ? 'image/svg+xml'
                    : ext === '.png' ? 'image/png'
                      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                        : ext === '.gif' ? 'image/gif'
                          : ext === '.ico' ? 'image/x-icon'
                            : ext === '.woff' ? 'font/woff'
                              : ext === '.woff2' ? 'font/woff2'
                                : ext === '.ttf' ? 'font/ttf'
                                  : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        
        // 直接发送文件，不进行注入
        // Log static file response in debug mode
        if (isDebugMode) {
          logDebug(`Static file response: 200 ${rawUrl} (${mime})`);
        }
        fs.createReadStream(filePath).pipe(res);
      });
    });

    await new Promise((resolve) => {
      staticServer.listen(0, '127.0.0.1', resolve);
    });
    const { port } = staticServer.address();
    staticBaseUrl = `http://127.0.0.1:${port}`;
    
    // 在debug模式下，显示服务启动信息
    if (isDebugMode) {
      logInfo(`Static server started: ${staticBaseUrl}`);
      logInfo('Real-time logs will be displayed in this command line window');
      logMark('========================');
    }

    // 屏蔽非debug模式下的Ctrl+Shift+I快捷键
    if (!isDebugMode) {
      // 注册一个空的快捷键处理函数来屏蔽Ctrl+Shift+I
      globalShortcut.register('CommandOrControl+Shift+I', () => {
        // 什么都不做，只是为了屏蔽默认行为
      });
    }
    
    // 禁用F11全屏快捷键
    globalShortcut.register('F11', () => {
      // 什么都不做，只是为了屏蔽默认行为
    });

    // I love Microsoft

    // 只有在debug模式下才注册打开开发人员工具的快捷键
    if (isDebugMode) {
      globalShortcut.register('F12', () => {
        const win = BrowserWindow.getFocusedWindow() || mainWindow || authWindow;
        if (!win || win.isDestroyed()) return;
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools();
        } else {
          win.webContents.openDevTools({ mode: 'detach' });
        }
      });

      globalShortcut.register('CommandOrControl+Shift+I', () => {
        const win = BrowserWindow.getFocusedWindow() || mainWindow || authWindow;
        if (!win || win.isDestroyed()) return;
        if (win.webContents.isDevToolsOpened()) {
          win.webContents.closeDevTools();
        } else {
          win.webContents.openDevTools({ mode: 'detach' });
        }
      });
    }

    ipcMain.on('window-minimize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) win.minimize();
    });

    ipcMain.on('window-maximize', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        if (win.maximizable) win.maximize();
      }
    });

    // 监听窗口全屏变化事件
    ipcMain.on('window-fullscreen-changed', (event, isFullscreen) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return;
      // 这里可以通过IPC发送消息给渲染进程，通知其显示或隐藏窗口控制按钮
      event.sender.send('update-window-controls', !isFullscreen);
    });

    ipcMain.on('window-close', (event) => {
      // 关闭所有窗口，退出应用程序
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      });
      
      // 确保应用程序完全退出
      app.quit();
      // I love Microsoft
    });
    
    // 处理重启到调试模式的请求
    ipcMain.on('restart-to-debug-mode', (event) => {
      logMark('Restarting to debug mode...');
      
      // 关闭所有窗口
      BrowserWindow.getAllWindows().forEach((win) => {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      });
      
      // 重新启动应用，添加--debugmode参数
      const { execPath } = process;
      const args = ['.', '--debugmode'];
      
      logInfo(`Restarting with command: ${execPath} ${args.join(' ')}`);
      
      // 启动新进程
      const { spawn } = require('child_process');
      spawn(execPath, args, {
        detached: true,
        stdio: 'inherit'
      });
      
      // 退出当前进程
      app.quit();
      // I love Microsoft
    });

    // 只有在debug模式下才允许打开开发人员工具
    if (isDebugMode) {
      ipcMain.on('devtools-inspect', (event, payload) => {
        const wc = event.sender;
        if (!wc || wc.isDestroyed()) return;
        const win = BrowserWindow.fromWebContents(wc);
        if (!win || win.isDestroyed()) return;
        const x = typeof payload?.x === 'number' ? payload.x : 0;
        const y = typeof payload?.y === 'number' ? payload.y : 0;
        try {
          if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
        } catch {}
        setTimeout(() => {
          try {
            wc.inspectElement(x, y);
            if (wc.devToolsWebContents) wc.devToolsWebContents.focus();
          } catch {}
        }, 50);
      });
    }

    ipcMain.handle('server-get', () => {
      return { origin: readServerOrigin() };
    });

    ipcMain.handle('server-set', (_event, payload) => {
      const origin = typeof payload?.origin === 'string' ? payload.origin : '';
      if (origin) writeServerOrigin(origin);
      return { ok: true };
    });

    ipcMain.handle('auth-get', () => {
      return readAuth();
    });

    ipcMain.handle('auth-set', (_event, payload) => {
      writeAuth(payload);
      return { ok: true };
    });
    
    // 处理控件事件日志
    ipcMain.on('control-event', (event, payload) => {
      if (isDebugMode && payload) {
        const { eventType, controlName, details = {} } = payload;
        logTrace(`Control event: ${eventType} - ${controlName}`, details);
      }
    });
    
    // 处理打开系统浏览器的请求
    ipcMain.on('open-in-browser', (event, url) => {
      if (typeof url === 'string' && url) {
        try {
          shell.openExternal(url);
          if (isDebugMode) {
            logInfo(`Opened in browser: ${url}`);
          }
        } catch (error) {
          logError(`Failed to open in browser: ${error.message}`);
        }
      }
    });
    
    // 处理路由变化事件
    ipcMain.on('route-change', (event, payload) => {
      if (isDebugMode && payload && typeof payload.route === 'string') {
        logInfo(`Route changed: ${payload.route}`);
      }
    });
    
    // 获取真实设备信息
    ipcMain.handle('get-device-info', () => {
      try {
        // 获取CPU信息
        let cpuInfo = '未知';
        try {
          const platform = os.platform();
          if (platform === 'win32') {
            const cpuOutput = childProcess.execSync('wmic cpu get name', { encoding: 'utf8' });
            cpuInfo = cpuOutput.replace('Name', '').trim();
          } else if (platform === 'linux') {
            // 对于Linux和Android系统
            try {
              const cpuOutput = childProcess.execSync('cat /proc/cpuinfo | grep "model name" | head -1', { encoding: 'utf8' });
              cpuInfo = cpuOutput.replace('model name	:', '').trim();
            } catch (e) {
              try {
                const cpuOutput = childProcess.execSync('cat /proc/cpuinfo | grep "Processor" | head -1', { encoding: 'utf8' });
                cpuInfo = cpuOutput.replace('Processor	:', '').trim();
              } catch (ee) {
                logError('Failed to get CPU info on Linux/Android:', ee.message);
              }
            }
          } else {
            // 其他平台
            cpuInfo = os.cpus()[0]?.model || '未知';
          }
        } catch (error) {
          logError('Failed to get CPU info:', error.message);
          // 使用os模块的cpus方法作为备选
          try {
            cpuInfo = os.cpus()[0]?.model || '未知';
          } catch (e) {
            logError('Failed to get CPU info from os.cpus():', e.message);
          }
        }
        
        // 获取内存信息
        const totalMemory = os.totalmem();
        const memoryInfo = `${(totalMemory / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        
        // 获取系统信息
        const platform = os.platform();
        const release = os.release();
        let systemInfo = `${platform} ${release}`;
        if (platform === 'win32') {
          try {
            const osOutput = childProcess.execSync('wmic os get caption', { encoding: 'utf8' });
            let osName = osOutput.replace('Caption', '').trim();
            // 保留原始版本名称，不翻译
            systemInfo = osName;
          } catch (error) {
            logError('Failed to get Windows version:', error.message);
          }
        } else if (platform === 'linux') {
          // 对于Linux和Android系统
          try {
            // 检查是否是Android
            if (fs.existsSync('/system/build.prop')) {
              // 是Android系统
              try {
                const androidVersionOutput = childProcess.execSync('grep ro.build.version.release /system/build.prop', { encoding: 'utf8' });
                const androidVersion = androidVersionOutput.replace('ro.build.version.release=', '').trim();
                const androidCodenameOutput = childProcess.execSync('grep ro.build.version.codename /system/build.prop', { encoding: 'utf8' });
                const androidCodename = androidCodenameOutput.replace('ro.build.version.codename=', '').trim();
                const androidModelOutput = childProcess.execSync('grep ro.product.model /system/build.prop', { encoding: 'utf8' });
                const androidModel = androidModelOutput.replace('ro.product.model=', '').trim();
                systemInfo = `Android ${androidVersion} (${androidCodename}) - ${androidModel}`;
              } catch (e) {
                // 如果无法获取详细信息，使用基本信息
                systemInfo = `Android ${release}`;
              }
            } else {
              // 是Linux系统
              try {
                const distroOutput = childProcess.execSync('cat /etc/os-release | grep PRETTY_NAME', { encoding: 'utf8' });
                const distroName = distroOutput.replace('PRETTY_NAME=', '').replace(/"/g, '').trim();
                systemInfo = distroName;
              } catch (e) {
                systemInfo = `Linux ${release}`;
              }
            }
          } catch (error) {
            logError('Failed to get Linux/Android version:', error.message);
            systemInfo = `Linux ${release}`;
          }
        }
        
        // 获取内核版本
        const kernelVersion = os.release();
        
        // 获取MicroPanel版本
        let microPanelVersion = '1.0.0';
        try {
          const packageJsonPath = path.join(__dirname, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            microPanelVersion = packageJson.version || '1.0.0';
          }
        } catch (error) {
          logError('Failed to get MicroPanel version:', error.message);
        }
        
        return {
          cpu: cpuInfo,
          memory: memoryInfo,
          system: systemInfo,
          kernel: kernelVersion,
          version: microPanelVersion
        };
      } catch (error) {
        logError('Failed to get device info:', error);
        return {
          cpu: '未知',
          memory: '未知',
          system: '未知',
          kernel: '未知',
          version: '1.0.0'
        };
      }
    });

    ipcMain.on('navigate', (_event, payload) => {
      const target = payload?.target;
      const origin = typeof payload?.origin === 'string' ? payload.origin : '';
      const closeSender = !!payload?.closeSender;
      const senderWin = BrowserWindow.fromWebContents(_event.sender);
      if (origin) {
        try {
          writeServerOrigin(origin);
        } catch {}
      }
      if (target === 'login') {
        showAuth('login', origin || readServerOrigin());
        if (senderWin && !senderWin.isDestroyed() && senderWin !== authWindow) {
          closeSender ? senderWin.close() : senderWin.hide();
        }
      } else if (target === 'config') {
        showAuth('config');
        if (senderWin && !senderWin.isDestroyed() && senderWin !== authWindow) {
          closeSender ? senderWin.close() : senderWin.hide();
        }
      } else if (target === 'app') {
        showApp(origin || readServerOrigin());
        if (senderWin && !senderWin.isDestroyed() && senderWin !== mainWindow) {
          senderWin.hide();
        }
      }
    });

    const origin = readServerOrigin();
    if (origin) showAuth('login', origin);
    else showAuth('config');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const origin = readServerOrigin();
        if (origin) showAuth('login', origin);
        else showAuth('config');
      }
    });
  });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try {
    if (staticServer) staticServer.close();
  } catch {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
