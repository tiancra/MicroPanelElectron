// 简化的测试脚本，直接检查和创建设置按钮
console.log('=== 测试插件安装按钮 ===');

// 立即检查按钮状态
function checkButtonStatus() {
  console.log('检查按钮状态...');
  const button = document.querySelector('.plugin-install-btn');
  console.log('按钮元素:', button);
  
  if (button) {
    console.log('按钮存在，检查样式...');
    const computedStyle = window.getComputedStyle(button);
    console.log('显示:', computedStyle.display);
    console.log('可见性:', computedStyle.visibility);
    console.log('不透明度:', computedStyle.opacity);
    console.log('z-index:', computedStyle.zIndex);
    console.log('位置:', {
      bottom: computedStyle.bottom,
      right: computedStyle.right
    });
    
    // 检查按钮是否在视口中
    const rect = button.getBoundingClientRect();
    console.log('按钮位置和大小:', rect);
    console.log('是否在视口中:', 
      rect.top < window.innerHeight && 
      rect.bottom > 0 && 
      rect.left < window.innerWidth && 
      rect.right > 0
    );
  } else {
    console.log('按钮不存在，立即创建...');
    createDirectButton();
  }
}

// 直接创建设置按钮
function createDirectButton() {
  console.log('直接创建设置按钮...');
  
  // 移除已存在的所有相关元素
  const existingButton = document.querySelector('.plugin-install-btn');
  const existingMenu = document.querySelector('.plugin-install-menu');
  const existingDialog = document.querySelector('.plugin-install-dialog');
  const existingBackdrop = document.querySelector('.plugin-install-dialog-backdrop');
  
  if (existingButton) existingButton.remove();
  if (existingMenu) existingMenu.remove();
  if (existingDialog) existingDialog.remove();
  if (existingBackdrop) existingBackdrop.remove();
  
  // 直接创建设置按钮
  const button = document.createElement('button');
  button.className = 'plugin-install-btn';
  button.innerHTML = '+';
  button.title = '安装插件';
  
  // 设置内联样式，确保按钮可见
  button.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: linear-gradient(45deg, #00dbde, #fc00ff);
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 219, 222, 0.6);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  `;
  
  // 直接添加到body
  document.body.appendChild(button);
  console.log('按钮已创建并添加到页面');
  
  // 添加点击事件
  button.addEventListener('click', () => {
    console.log('按钮被点击！');
    alert('插件安装按钮被点击！');
  });
  
  // 再次检查按钮状态
  setTimeout(() => {
    const newButton = document.querySelector('.plugin-install-btn');
    console.log('新创建的按钮:', newButton);
    if (newButton) {
      const rect = newButton.getBoundingClientRect();
      console.log('新按钮位置和大小:', rect);
      console.log('新按钮是否在视口中:', 
        rect.top < window.innerHeight && 
        rect.bottom > 0 && 
        rect.left < window.innerWidth && 
        rect.right > 0
      );
    }
  }, 500);
}

// 当DOM加载完成时执行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkButtonStatus);
} else {
  checkButtonStatus();
}

// 当页面完全加载时再次检查
window.addEventListener('load', () => {
  setTimeout(checkButtonStatus, 1000);
});

// 定期检查按钮状态
setInterval(checkButtonStatus, 5000);
