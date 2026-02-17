const { app, BrowserWindow } = require('electron');

console.log('应用程序正在启动...');

app.whenReady().then(() => {
  console.log('应用程序已准备就绪');
  
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  win.loadFile('public/index.html');
  
  win.on('closed', () => {
    console.log('窗口已关闭');
  });
  
  console.log('窗口已创建');
});

app.on('window-all-closed', () => {
  console.log('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  console.log('应用程序已退出');
});

app.on('error', (error) => {
  console.error('应用程序错误:', error);
});
