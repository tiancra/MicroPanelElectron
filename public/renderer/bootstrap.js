;(function () {
  function normalizeOrigin(origin) {
    if (!origin || typeof origin !== 'string') return '';
    let o = origin.trim();
    if (!o) return '';
    if (!/^https?:\/\//i.test(o)) o = `http://${o}`;
    try {
      const u = new URL(o);
      const port = u.port ? `:${u.port}` : '';
      return `${u.protocol}//${u.hostname}${port}`;
    } catch {
      return '';
    }
  }

  function readOriginFromQuery() {
    try {
      const u = new URL(window.location.href);
      const raw = u.searchParams.get('serverOrigin');
      return raw ? decodeURIComponent(raw) : '';
    } catch {
      return '';
    }
  }

  function readOriginFromStorage() {
    try {
      return localStorage.getItem('MICROPANEL_SERVER_ORIGIN') || '';
    } catch {
      return '';
    }
  }

  function persistOrigin(origin) {
    try {
      localStorage.setItem('MICROPANEL_SERVER_ORIGIN', origin);
    } catch {}
  }

  const origin = normalizeOrigin(readOriginFromQuery() || readOriginFromStorage());
  if (!origin) {
    if (!/config\.html(\?|#|$)/i.test(window.location.href)) {
      try {
        window.location.replace('config.html');
      } catch {
        window.location.href = 'config.html';
      }
    }
    return;
  }

  persistOrigin(origin);
  window.__MICROPANEL_SERVER_ORIGIN__ = origin;

  (function hydrateTokenFromFile() {
    if (!window.microPanel || !window.microPanel.getAuthState) return;
    let existing = '';
    try {
      existing = localStorage.getItem('TOKEN') || '';
    } catch {}
    if (existing) return;
    Promise.resolve()
      .then(() => window.microPanel.getAuthState())
      .then((state) => {
        const token = state && typeof state === 'object' && typeof state.token === 'string' ? state.token : '';
        if (!token) return;
        try {
          localStorage.setItem('TOKEN', token);
        } catch {}
      })
      .catch(() => {});
  })();

  (function enforceStandaloneLogin() {
    function isLoginHash() {
      const h = window.location.hash || '';
      return h === '#/login' || h.startsWith('#/login?') || h.startsWith('#/login/');
    }

    function redirectToStandaloneLogin() {
      if (!isLoginHash()) return;
      const url = `/login.html?serverOrigin=${encodeURIComponent(origin)}`;
      try {
        window.location.replace(url);
      } catch {
        window.location.href = url;
      }
    }

    redirectToStandaloneLogin();
    window.addEventListener('hashchange', redirectToStandaloneLogin);
  })();

  (function interceptLogoutToLoginWindow() {
    if (!document || !window.microPanel) return;
    if (!/index\.html(\?|#|$)/i.test(window.location.href)) return;

    function normText(t) {
      return String(t || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    async function disableAutoLoginAndToken() {
      try {
        localStorage.removeItem('TOKEN');
        localStorage.setItem('MP_AUTOLOGIN', '0');
      } catch {}
      if (window.microPanel && window.microPanel.getAuthState && window.microPanel.setAuthState) {
        try {
          const prev = await window.microPanel.getAuthState();
          await window.microPanel.setAuthState({
            ...(prev && typeof prev === 'object' ? prev : {}),
            autoLogin: false,
            token: '',
          });
        } catch {}
      }
    }

    document.addEventListener(
      'click',
      (e) => {
        const target = e && e.target && e.target.nodeType === 1 ? e.target : null;
        if (!target || !target.closest) return;
        const item = target.closest('.el-dropdown-menu__item');
        if (!(item instanceof HTMLElement)) return;
        const text = normText(item.textContent);
        if (text !== '退出登录') return;
        try {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        } catch {}
        disableAutoLoginAndToken().finally(() => {
          const o = window.__MICROPANEL_SERVER_ORIGIN__ || '';
          try {
            if (window.microPanel && window.microPanel.gotoLogin) window.microPanel.gotoLogin(o, { closeSender: true });
          } catch {}
        });
      },
      true,
    );
  })();

  (function injectWindowControls() {
    if (!document || document.getElementById('mp-window-controls')) return;

    const style = document.createElement('style');
    style.textContent = `
      html, body { height: 100%; }
      body { overflow: hidden; overscroll-behavior: none; }
      .tabbar { -webkit-app-region: drag; }
      .tabbar a, .tabbar button, .tabbar input, .tabbar textarea, .tabbar select { -webkit-app-region: no-drag; }
      .tabbar_left, .tabbar_left * { -webkit-app-region: no-drag !important; pointer-events: auto !important; }
      .tabbar_right, .tabbar_right * { -webkit-app-region: no-drag !important; pointer-events: auto !important; }
      .tabbar_right .el-dropdown, .tabbar_right .el-dropdown * { -webkit-app-region: no-drag !important; pointer-events: auto !important; }
      .tabbar_right .el-dropdown-link { -webkit-app-region: no-drag !important; pointer-events: auto !important; }
      .tabbar_right .el-dropdown-link i.el-icon.el-icon--right,
      .tabbar_right .el-dropdown-link .el-icon.el-icon--right { display: none !important; }
      .mp-user-text {
        height: 28px;
        max-width: 220px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.12);
        color: inherit;
        outline: none;
        -webkit-app-region: no-drag !important;
      }
      html.dark .mp-user-text {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
      }
      .mp-admin-autologin-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
      }
      .mp-switch {
        position: relative;
        width: 44px;
        height: 24px;
        flex: 0 0 44px;
      }
      .mp-switch input {
        opacity: 0;
        width: 0;
        height: 0;
        position: absolute;
      }
      .mp-switch-track {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.22);
      }
      html.dark .mp-switch-track {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .mp-switch-track::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 3px;
        width: 18px;
        height: 18px;
        transform: translateY(-50%);
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .mp-switch input:checked + .mp-switch-track {
        background: rgba(64, 158, 255, 0.32);
        border-color: rgba(64, 158, 255, 0.5);
      }
      .mp-switch input:checked + .mp-switch-track::after {
        left: 23px;
      }
      .mp-admin-autologin-hint {
        font-size: 12px;
        opacity: 0.75;
        padding-top: 6px;
      }
      .layout_container { height: 100vh; overflow: hidden; }
      .layout_main { overflow: auto !important; -webkit-app-region: no-drag; overscroll-behavior: contain; }
      .layout_main .com { overflow: auto !important; overscroll-behavior: contain; }
      .el-scrollbar__wrap, .el-table__body-wrapper, .el-drawer__body, .el-dialog__body { overscroll-behavior: contain; }
      .layout_container, .layout_container *, .layout_container *::before, .layout_container *::after { transition: none !important; animation: none !important; }
      .layout_container *:hover { transform: none !important; }
      .el-card { transition: none !important; }
      .el-card:hover { transform: none !important; }
      .el-card__body { transition: none !important; transform: none !important; }
      .el-card:hover .el-card__body { transition: none !important; transform: none !important; }
      #mp-window-controls { display: flex; align-items: center; gap: 12px; margin-left: 18px; margin-right: 14px; }
      #mp-window-controls .tl-btn {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.35);
        padding: 0;
        cursor: pointer;
        position: relative;
      }
      #mp-window-controls .tl-btn.close { background: #ff5f57; border-color: rgba(0, 0, 0, 0.35); }
      #mp-window-controls .tl-btn.minimize { background: #febc2e; border-color: rgba(0, 0, 0, 0.28); }
      #mp-window-controls .tl-btn.maximize { background: #28c840; border-color: rgba(0, 0, 0, 0.28); }
      #mp-window-controls:hover .tl-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        display: block;
        background: rgba(0, 0, 0, 0.18);
        -webkit-mask-size: 8px 8px;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: center;
      }
      #mp-window-controls:hover .tl-btn.close::before {
        -webkit-mask-image: linear-gradient(#000, #000);
        clip-path: polygon(20% 28%, 28% 20%, 50% 42%, 72% 20%, 80% 28%, 58% 50%, 80% 72%, 72% 80%, 50% 58%, 28% 80%, 20% 72%, 42% 50%);
      }
      #mp-window-controls:hover .tl-btn.minimize::before {
        -webkit-mask-image: linear-gradient(#000, #000);
        clip-path: polygon(20% 46%, 80% 46%, 80% 54%, 20% 54%);
      }
      #mp-window-controls:hover .tl-btn.maximize::before {
        -webkit-mask-image: linear-gradient(#000, #000);
        clip-path: polygon(30% 30%, 70% 30%, 70% 70%, 30% 70%);
      }
    `;
    document.head.appendChild(style);

    (function fixSettingDropdownTrigger() {
      function removeArrow() {
        try {
          document
            .querySelectorAll('.tabbar_right .el-dropdown-link i.el-icon.el-icon--right, .tabbar_right .el-dropdown-link .el-icon.el-icon--right')
            .forEach((el) => el.remove());
        } catch {}
      }

      function replaceDropdownWithText() {
        const right = document.querySelector('.tabbar_right');
        if (!right) return;
        if (document.getElementById('mp-user-text')) return;
        const dropdown = right.querySelector('.el-dropdown');
        if (!dropdown) return;
        const link = dropdown.querySelector('.el-dropdown-link');
        const name = ((link && link.textContent) || '').trim().replace(/\s+/g, ' ');
        const input = document.createElement('input');
        input.id = 'mp-user-text';
        input.className = 'mp-user-text';
        input.type = 'text';
        input.readOnly = true;
        input.value = name || '用户';
        try {
          input.setAttribute('aria-label', 'user');
        } catch {}
        try {
          dropdown.replaceWith(input);
        } catch {
          try {
            right.appendChild(input);
            dropdown.remove();
          } catch {}
        }
      }

      function forceNoDrag() {
        const nodes = document.querySelectorAll('.tabbar, .tabbar_left, .tabbar_right, .tabbar_right .el-dropdown-link');
        nodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          try {
            n.style.webkitAppRegion = 'no-drag';
          } catch {}
        });
      }

      function syncAriaByPopper() {
        const trigger = document.querySelector('.tabbar_right .el-dropdown-link');
        if (!(trigger instanceof HTMLElement)) return;
        const open = !!document.querySelector('.el-dropdown__popper, .el-popper.is-light, .el-popper.is-dark');
        try {
          trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        } catch {}
      }

      removeArrow();
      replaceDropdownWithText();
      forceNoDrag();
      syncAriaByPopper();

      if (window.MutationObserver) {
        const ob = new MutationObserver(() => {
          removeArrow();
          replaceDropdownWithText();
          forceNoDrag();
          syncAriaByPopper();
        });
        try {
          ob.observe(document.body, { childList: true, subtree: true });
        } catch {}
      }
    })();

    function mount() {
      const right = document.querySelector('.tabbar_right');
      if (!right) return false;
      if (document.getElementById('mp-window-controls')) return true;

      const wrap = document.createElement('div');
      wrap.id = 'mp-window-controls';
      wrap.innerHTML = `
        <button class="tl-btn minimize" id="mp-min" aria-label="minimize"></button>
        <button class="tl-btn maximize" id="mp-max" aria-label="maximize"></button>
        <button class="tl-btn close" id="mp-close" aria-label="close"></button>
      `;
      right.appendChild(wrap);

      const minBtn = document.getElementById('mp-min');
      const maxBtn = document.getElementById('mp-max');
      const closeBtn = document.getElementById('mp-close');

      if (minBtn) minBtn.addEventListener('click', () => window.microPanel && window.microPanel.minimize && window.microPanel.minimize());
      if (maxBtn) maxBtn.addEventListener('click', () => window.microPanel && window.microPanel.maximize && window.microPanel.maximize());
      if (closeBtn) closeBtn.addEventListener('click', () => window.microPanel && window.microPanel.close && window.microPanel.close());

      const tabbar = document.querySelector('.tabbar');
      if (tabbar) tabbar.addEventListener('dblclick', () => window.microPanel && window.microPanel.maximize && window.microPanel.maximize());
      return true;
    }

    if (!mount()) {
      const timer = window.setInterval(() => {
        if (mount()) window.clearInterval(timer);
      }, 200);
      window.setTimeout(() => window.clearInterval(timer), 15000);
    }

    (function keepMounted() {
      if (!window.MutationObserver) return;
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          if (!document.getElementById('mp-window-controls')) mount();
        });
      });
      try {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      } catch {}
    })();
  })();

  (function injectSidebarSubColumn() {
    if (!document || document.getElementById('mp-submenu-column')) return;

    const style = document.createElement('style');
    style.id = 'mp-submenu-style';
    style.textContent = `
      :root { --mp-sidebar-w: 64px; --mp-submenu-w: 176px; }
      .layout_slider {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        bottom: 0 !important;
        width: var(--mp-sidebar-w) !important;
        z-index: 20 !important;
      }
      .layout_slider.hidden { width: 0 !important; }
      .layout_slider .logo p { display: none !important; }
      .layout_slider .el-scrollbar.scrollbar { height: calc(100vh - 60px) !important; }
      .layout_slider .el-menu { width: 100% !important; }
      .layout_slider .el-menu-item,
      .layout_slider .el-sub-menu__title {
        padding-left: 0 !important;
        padding-right: 0 !important;
        justify-content: center !important;
        position: relative !important;
      }
      .layout_slider .el-menu-item > span,
      .layout_slider .el-sub-menu__title > span { display: none !important; }
      .layout_slider .el-sub-menu__icon-arrow { display: none !important; }
      .layout_slider .el-sub-menu > .el-menu { display: none !important; }
      .layout_slider .el-sub-menu__title::after {
        content: '›';
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        opacity: 0.8;
      }

      #mp-submenu-column {
        position: fixed;
        top: 0;
        left: var(--mp-sidebar-w);
        width: var(--mp-submenu-w);
        height: 100vh;
        z-index: 25;
        display: block !important;
        padding: 10px 10px 12px;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(6px);
        border-right: 1px solid rgba(255, 255, 255, 0.3);
        -webkit-app-region: no-drag;
        pointer-events: auto;
        overflow: auto;
      }
      html.dark #mp-submenu-column {
        background: rgba(26, 26, 26, 0.5);
        border-right: 1px solid rgba(255, 255, 255, 0.12);
      }
      .layout_slider.hidden ~ #mp-submenu-column { display: block !important; left: 0 !important; }

      #mp-submenu-column .mp-submenu-title {
        font-size: 12px;
        font-weight: 700;
        opacity: 0.85;
        padding: 8px 8px 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #mp-submenu-column .mp-submenu-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        padding: 10px 10px;
        margin: 0 0 8px 0;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background: rgba(255, 255, 255, 0.12);
        color: inherit;
        cursor: pointer;
        text-align: left;
        -webkit-app-region: no-drag;
      }
      #mp-submenu-column .mp-submenu-icon {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 18px;
        opacity: 0.9;
      }
      #mp-submenu-column .mp-submenu-label {
        flex: 1 1 auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      html.dark #mp-submenu-column .mp-submenu-btn {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
      }
      #mp-submenu-column .mp-submenu-btn.active {
        border-color: rgba(64, 158, 255, 0.5);
        background: rgba(64, 158, 255, 0.18);
      }

      .layout_tabbar {
        left: calc(var(--mp-sidebar-w) + var(--mp-submenu-w)) !important;
        right: 0 !important;
        width: auto !important;
      }
      .layout_main {
        left: calc(var(--mp-sidebar-w) + var(--mp-submenu-w)) !important;
        right: 0 !important;
        width: auto !important;
      }
      .layout_tabbar.hidden, .layout_main.hidden {
        left: 0 !important;
        right: 0 !important;
        width: 100vw !important;
      }
    `;
    document.head.appendChild(style);

    let __mp_last_submenu_key = '';
    let __mp_observer_started = false;
    let __mp_submenu_pinned = false;

    function setTitles() {
      const root = document.querySelector('.layout_slider .el-menu');
      if (!root) return;
      const titleEls = root.querySelectorAll('.el-menu-item, .el-sub-menu__title');
      titleEls.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (el.getAttribute('title')) return;
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text) el.setAttribute('title', text);
      });
    }

    function getSubMenuKey(sub) {
      if (!sub || !(sub instanceof HTMLElement)) return '';
      const idx = getMenuItemIndex(sub);
      if (idx) return `sub:${idx}`;
      const titleText = (sub.querySelector('.el-sub-menu__title')?.textContent || '').trim().replace(/\s+/g, ' ');
      return titleText ? `sub:${titleText}` : 'sub:';
    }

    function getRootMenu() {
      return document.querySelector('.layout_slider .el-menu');
    }

    function getFirstTopLevelEntry() {
      const root = getRootMenu();
      if (!root) return null;
      const children = Array.from(root.children || []);
      for (const el of children) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.classList.contains('el-sub-menu') || el.classList.contains('el-menu-item')) return el;
      }
      return null;
    }

    function isHomeRoute() {
      const h = window.location.hash || '';
      if (!h || h === '#/' || h === '#') return true;
      return h.startsWith('#/home') || h.startsWith('#/index') || h.startsWith('#/dashboard');
    }

    function getTopLevelSubmenu(el) {
      const sub = el && el.closest ? el.closest('.el-sub-menu') : null;
      if (!sub) return null;
      const parent = sub.parentElement;
      const root = getRootMenu();
      if (!parent || !root || parent !== root) return null;
      return sub;
    }

    function getTopLevelMenuItem(el) {
      const item = el && el.closest ? el.closest('.el-menu-item') : null;
      if (!item) return null;
      const parent = item.parentElement;
      const root = getRootMenu();
      if (!parent || !root || parent !== root) return null;
      return item;
    }

    function ensureColumn() {
      let col = document.getElementById('mp-submenu-column');
      if (col) return col;
      const container = document.querySelector('.layout_container');
      if (!container) return null;
      col = document.createElement('div');
      col.id = 'mp-submenu-column';
      col.innerHTML = `<div class="mp-submenu-title" id="mp-submenu-title">子项</div><div id="mp-submenu-items"><div style="opacity:.7;padding:8px 8px;">点击左侧主项显示子项</div></div>`;
      container.appendChild(col);
      return col;
    }

    function collectChildren(subMenu) {
      const items = [];
      if (!subMenu) return items;
      const all = subMenu.querySelectorAll('.el-menu-item');
      all.forEach((it) => {
        if (!(it instanceof HTMLElement)) return;
        items.push(it);
      });
      return items;
    }

    function getMenuItemIndex(el) {
      if (!el || !(el instanceof HTMLElement)) return '';
      return (
        el.getAttribute('index') ||
        el.getAttribute('data-index') ||
        (el.dataset ? el.dataset.index : '') ||
        ''
      );
    }

    function getMenuItemNav(el) {
      if (!el || !(el instanceof HTMLElement)) return '';
      const idx = getMenuItemIndex(el);
      if (idx) return idx;
      try {
        const a = el.querySelector('a[href]');
        const href = a ? a.getAttribute('href') : '';
        return href ? String(href) : '';
      } catch {
        return '';
      }
    }

    function escapeAttrValue(v) {
      const s = String(v || '');
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function findMenuItemByIndex(idx) {
      const v = String(idx || '');
      if (!v) return null;
      const e = escapeAttrValue(v);
      return (
        document.querySelector(`.layout_slider .el-menu-item[index="${e}"]`) ||
        document.querySelector(`.layout_slider .el-menu-item[data-index="${e}"]`)
      );
    }

    function navigateTo(nav) {
      const v = String(nav || '').trim();
      if (!v) return false;
      try {
        if (v.startsWith('#')) {
          window.location.hash = v;
          return true;
        }
        if (v.startsWith('/')) {
          window.location.hash = `#${v}`;
          return true;
        }
        if (v.includes('#/')) {
          window.location.hash = v.slice(v.indexOf('#/'));
          return true;
        }
      } catch {}
      return false;
    }

    function clickLikeUser(el) {
      if (!el) return;
      try {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      } catch {}
      try {
        el.click();
      } catch {}
    }

    function updateColumnActiveByNav(nav) {
      const v = String(nav || '');
      const buttons = document.querySelectorAll('#mp-submenu-column .mp-submenu-btn');
      buttons.forEach((b) => {
        if (!(b instanceof HTMLElement)) return;
        const match = v && b.dataset && b.dataset.mpNav === v;
        if (match) b.classList.add('active');
        else b.classList.remove('active');
      });
    }

    function showColumnFor(subMenu) {
      const col = ensureColumn();
      if (!col) return;
      const itemsWrap = document.getElementById('mp-submenu-items');
      const titleEl = document.getElementById('mp-submenu-title');
      if (!itemsWrap || !titleEl) return;

      const children = collectChildren(subMenu);
      if (!children.length) {
        const titleText = (subMenu.querySelector('.el-sub-menu__title')?.textContent || '').trim().replace(/\s+/g, ' ');
        titleEl.textContent = titleText || '';
        itemsWrap.innerHTML = `<div style="opacity:.7;padding:8px 8px;">无子项</div>`;
        return;
      }

      const titleText = (subMenu.querySelector('.el-sub-menu__title')?.textContent || '').trim().replace(/\s+/g, ' ');
      titleEl.textContent = titleText || '';
      itemsWrap.innerHTML = '';

      children.forEach((menuItem) => {
        const label = (menuItem.textContent || '').trim().replace(/\s+/g, ' ');
        const nav = getMenuItemNav(menuItem);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mp-submenu-btn' + (menuItem.classList.contains('is-active') ? ' active' : '');
        if (nav) btn.dataset.mpNav = nav;
        const iconWrap = document.createElement('span');
        iconWrap.className = 'mp-submenu-icon';
        try {
          const icon = menuItem.querySelector('.el-icon, i, svg');
          if (icon) iconWrap.appendChild(icon.cloneNode(true));
        } catch {}
        const labelWrap = document.createElement('span');
        labelWrap.className = 'mp-submenu-label';
        labelWrap.textContent = label || '未命名';
        btn.appendChild(iconWrap);
        btn.appendChild(labelWrap);
        btn.addEventListener('click', () => {
          const live = nav ? findMenuItemByIndex(nav) : null;
          if (live) clickLikeUser(live);
          else if (!navigateTo(nav)) clickLikeUser(menuItem);
          window.setTimeout(() => {
            try {
              const active = document.querySelector('.layout_slider .el-menu-item.is-active');
              const activeNav = active ? getMenuItemNav(active) : '';
              updateColumnActiveByNav(activeNav);
            } catch {}
          }, 0);
        });
        itemsWrap.appendChild(btn);
      });
    }

    function showSingleForMenuItem(menuItem) {
      const col = ensureColumn();
      if (!col) return;
      const itemsWrap = document.getElementById('mp-submenu-items');
      const titleEl = document.getElementById('mp-submenu-title');
      if (!itemsWrap || !titleEl) return;

      const title = (menuItem.getAttribute('title') || menuItem.textContent || '').trim().replace(/\s+/g, ' ');
      titleEl.textContent = title || '';
      itemsWrap.innerHTML = '';

      const nav = getMenuItemNav(menuItem);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mp-submenu-btn' + (menuItem.classList.contains('is-active') ? ' active' : '');
      if (nav) btn.dataset.mpNav = nav;
      const iconWrap = document.createElement('span');
      iconWrap.className = 'mp-submenu-icon';
      try {
        const icon = menuItem.querySelector('.el-icon, i, svg');
        if (icon) iconWrap.appendChild(icon.cloneNode(true));
      } catch {}
      const labelWrap = document.createElement('span');
      labelWrap.className = 'mp-submenu-label';
      labelWrap.textContent = title || '首页';
      btn.appendChild(iconWrap);
      btn.appendChild(labelWrap);
      btn.addEventListener('click', () => {
        const live = nav ? findMenuItemByIndex(nav) : null;
        if (live) clickLikeUser(live);
        else if (!navigateTo(nav)) clickLikeUser(menuItem);
        window.setTimeout(() => {
          try {
            const active = document.querySelector('.layout_slider .el-menu-item.is-active');
            const activeNav = active ? getMenuItemNav(active) : '';
            updateColumnActiveByNav(activeNav);
          } catch {}
        }, 0);
      });
      itemsWrap.appendChild(btn);
    }

    function syncFromActive() {
      if (!__mp_submenu_pinned) return;
      const active = document.querySelector('.layout_slider .el-menu-item.is-active');
      if (!active) {
        const first = getFirstTopLevelEntry();
        if (first && first.classList.contains('el-sub-menu')) {
          const nextKey = getSubMenuKey(first);
          if (nextKey && nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showColumnFor(first);
          }
        } else if (first && first.classList.contains('el-menu-item')) {
          const nav = getMenuItemNav(first);
          const nextKey = nav ? `item:${nav}` : `item:${(first.textContent || '').trim().replace(/\s+/g, ' ')}`;
          if (nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showSingleForMenuItem(first);
          }
        }
        return;
      }
      const activeNav = getMenuItemNav(active);
      if (activeNav) updateColumnActiveByNav(activeNav);
      const sub = getTopLevelSubmenu(active);
      if (sub) {
        const nextKey = getSubMenuKey(sub);
        if (!nextKey || nextKey === __mp_last_submenu_key) return;
        __mp_last_submenu_key = nextKey;
        showColumnFor(sub);
        return;
      }
      else {
        const topItem = getTopLevelMenuItem(active);
        if (topItem) {
          const nav = getMenuItemNav(topItem);
          const nextKey = nav ? `item:${nav}` : `item:${(topItem.textContent || '').trim().replace(/\s+/g, ' ')}`;
          if (nextKey === __mp_last_submenu_key) return;
          __mp_last_submenu_key = nextKey;
          showSingleForMenuItem(topItem);
        }
      }
    }

    function hookClicks() {
      const slider = document.querySelector('.layout_slider');
      if (!slider) return false;
      if (slider.__mp_hooked) return true;
      slider.__mp_hooked = true;

      slider.addEventListener(
        'click',
        (e) => {
          const target = e.target;
          const sub = getTopLevelSubmenu(target);
          if (sub) {
            const title = target && target.closest ? target.closest('.el-sub-menu__title') : null;
            if (title) {
              e.preventDefault();
              e.stopPropagation();
              __mp_submenu_pinned = true;
              const children = collectChildren(sub);
              if (children.length) {
                try {
                  children[0].click();
                } catch {}
                showColumnFor(sub);
              } else {
                showColumnFor(sub);
              }
              return;
            }
          }

          const topItem = getTopLevelMenuItem(target);
          if (topItem) {
            __mp_submenu_pinned = true;
            showSingleForMenuItem(topItem);
          }
        },
        true,
      );

      return true;
    }

    function mountAll() {
      setTitles();
      hookClicks();
      ensureColumn();
      if (!__mp_submenu_pinned && isHomeRoute()) {
        __mp_submenu_pinned = true;
        const first = getFirstTopLevelEntry();
        if (first && first.classList.contains('el-sub-menu')) {
          const nextKey = getSubMenuKey(first);
          if (nextKey && nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showColumnFor(first);
          }
        } else if (first && first.classList.contains('el-menu-item')) {
          const nav = getMenuItemNav(first);
          const nextKey = nav ? `item:${nav}` : `item:${(first.textContent || '').trim().replace(/\s+/g, ' ')}`;
          if (nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showSingleForMenuItem(first);
          }
        }
        syncFromActive();
      }
      return !!document.querySelector('.layout_slider .el-menu');
    }

    if (!mountAll()) {
      const timer = window.setInterval(() => {
        if (mountAll()) window.clearInterval(timer);
      }, 250);
      window.setTimeout(() => window.clearInterval(timer), 20000);
    }

    if (window.MutationObserver) {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          setTitles();
          syncFromActive();
        });
      });
      try {
        const slider = document.querySelector('.layout_slider');
        if (slider && !__mp_observer_started) {
          __mp_observer_started = true;
          observer.observe(slider, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        }
      } catch {}
    }

    window.addEventListener('hashchange', () => {
      if (isHomeRoute()) {
        __mp_submenu_pinned = true;
        const first = getFirstTopLevelEntry();
        if (first && first.classList.contains('el-sub-menu')) {
          const nextKey = getSubMenuKey(first);
          if (nextKey && nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showColumnFor(first);
          }
        } else if (first && first.classList.contains('el-menu-item')) {
          const nav = getMenuItemNav(first);
          const nextKey = nav ? `item:${nav}` : `item:${(first.textContent || '').trim().replace(/\s+/g, ' ')}`;
          if (nextKey !== __mp_last_submenu_key) {
            __mp_last_submenu_key = nextKey;
            showSingleForMenuItem(first);
          }
        }
      }
      syncFromActive();
    });
  })();

  (function injectAdminAutoLoginToggle() {
    if (!document) return;
    if (!window.microPanel || !window.microPanel.getAuthState || !window.microPanel.setAuthState) return;

    function normText(t) {
      return String(t || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function findModal() {
      return (
        document.querySelector('.el-overlay .el-modal-dialog') ||
        document.querySelector('.el-overlay .el-overlay-dialog .el-dialog') ||
        document.querySelector('.el-overlay .el-dialog')
      );
    }

    function findFormItemBySubTitle(modal, title) {
      const items = modal.querySelectorAll('.el-form-item');
      for (const it of items) {
        const sub = it.querySelector('.sub-title');
        const text = normText(sub ? sub.textContent : it.textContent);
        if (text.includes(title)) return it;
      }
      return null;
    }

    function getInputValueByTitle(modal, title) {
      const it = findFormItemBySubTitle(modal, title);
      if (!it) return '';
      const input = it.querySelector('input.el-input__inner');
      return input ? String(input.value || '') : '';
    }

    function ensureInjected(modal) {
      if (!(modal instanceof HTMLElement)) return;
      if (modal.querySelector('#mp-admin-autologin')) return;
      const anchor = findFormItemBySubTitle(modal, '对此管理员隐藏');
      if (!anchor || !anchor.parentElement) return;

      const row = document.createElement('div');
      row.className = 'el-form-item';
      row.id = 'mp-admin-autologin';
      row.innerHTML = `
        <div class="el-form-item__content">
          <div class="sub-title">在Micro Panel中自动登录该账户</div>
          <div class="mp-admin-autologin-row">
            <div style="flex: 1 1 auto; opacity: .85; font-size: 12px;">控制登录页“自动登录该账户”</div>
            <label class="mp-switch">
              <input type="checkbox" id="mp-admin-autologin-switch" />
              <span class="mp-switch-track"></span>
            </label>
          </div>
          <div class="mp-admin-autologin-hint" id="mp-admin-autologin-hint"></div>
        </div>
      `;

      anchor.insertAdjacentElement('afterend', row);

      const sw = row.querySelector('#mp-admin-autologin-switch');
      const hint = row.querySelector('#mp-admin-autologin-hint');
      if (!(sw instanceof HTMLInputElement)) return;

      let inputTimer = 0;
      async function writeFromInputs(enable) {
        const username = normText(getInputValueByTitle(modal, '登录账号'));
        const password = String(getInputValueByTitle(modal, '登录密码') || '');

        if (enable) {
          if (!username || !password) {
            sw.checked = false;
            if (hint) hint.textContent = '请先填写登录账号与登录密码';
            return;
          }
          if (hint) hint.textContent = '';
          await window.microPanel.setAuthState({
            remember: true,
            autoLogin: true,
            username,
            password,
            token: '',
          });
          return;
        }

        const prev = await window.microPanel.getAuthState().catch(() => ({}));
        await window.microPanel.setAuthState({
          ...(prev && typeof prev === 'object' ? prev : {}),
          autoLogin: false,
        });
        if (hint) hint.textContent = '';
      }

      sw.addEventListener('change', () => {
        writeFromInputs(!!sw.checked);
      });

      function hookInput(title) {
        const it = findFormItemBySubTitle(modal, title);
        if (!it) return;
        const input = it.querySelector('input.el-input__inner');
        if (!(input instanceof HTMLInputElement)) return;
        if (input.__mp_hooked) return;
        input.__mp_hooked = true;
        input.addEventListener('input', () => {
          if (!sw.checked) return;
          if (inputTimer) window.clearTimeout(inputTimer);
          inputTimer = window.setTimeout(() => {
            writeFromInputs(true);
          }, 250);
        });
      }

      hookInput('登录账号');
      hookInput('登录密码');

      window.microPanel
        .getAuthState()
        .then((state) => {
          const auto = !!(state && typeof state === 'object' && state.autoLogin);
          sw.checked = auto;
        })
        .catch(() => {});
    }

    function scan() {
      const modal = findModal();
      if (modal) ensureInjected(modal);
    }

    scan();
    if (window.MutationObserver) {
      let scheduled = false;
      const ob = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          scan();
        });
      });
      try {
        ob.observe(document.documentElement, { childList: true, subtree: true });
      } catch {}
    }
  })();

  (function fixWheelScroll() {
    function isScrollable(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      if (el.scrollHeight <= el.clientHeight + 1) return false;
      const s = window.getComputedStyle(el);
      const oy = s.overflowY;
      const isByStyle = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
      const isKnown = el.classList && (el.classList.contains('el-card__body') || el.classList.contains('el-scrollbar__wrap'));
      return isByStyle || isKnown;
    }

    function canScroll(el, deltaY) {
      if (!el) return false;
      if (deltaY < 0) return el.scrollTop > 0;
      if (deltaY > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      return false;
    }

    function findScrollableInDirection(start, stopEl, deltaY) {
      let el = start;
      while (el && el !== stopEl && el !== document.body && el !== document.documentElement) {
        if (isScrollable(el) && canScroll(el, deltaY)) return el;
        el = el.parentElement;
      }
      if (stopEl && isScrollable(stopEl) && canScroll(stopEl, deltaY)) return stopEl;
      return null;
    }

    function onWheel(e) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey) return;
      const main = document.querySelector('.layout_main');
      if (!main) return;
      const target = e.target && e.target.nodeType === 1 ? e.target : null;
      if (!target || !main.contains(target)) return;
      const scroller = findScrollableInDirection(target, main, e.deltaY);
      if (scroller) return;
      if (!isScrollable(main) || !canScroll(main, e.deltaY)) return;
      main.scrollTop += e.deltaY;
      e.preventDefault();
    }

    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  })();

  const NativeURL = window.URL;
  function PatchedURL(input, base) {
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed === 'null' || /^file:/i.test(trimmed)) {
        input = origin;
        base = undefined;
      }
    }
    return base !== undefined ? new NativeURL(input, base) : new NativeURL(input);
  }
  PatchedURL.prototype = NativeURL.prototype;
  Object.setPrototypeOf(PatchedURL, NativeURL);
  if (typeof NativeURL.createObjectURL === 'function') PatchedURL.createObjectURL = NativeURL.createObjectURL.bind(NativeURL);
  if (typeof NativeURL.revokeObjectURL === 'function') PatchedURL.revokeObjectURL = NativeURL.revokeObjectURL.bind(NativeURL);
  if (typeof NativeURL.canParse === 'function') PatchedURL.canParse = NativeURL.canParse.bind(NativeURL);
  window.URL = PatchedURL;

  function shouldRewrite(url) {
    return false;
  }

  function rewriteUrl(url) {
    if (!url || typeof url !== 'string') return url;
    let u = url.trim();

    if (/^file:\/\/\/api\b/i.test(u)) u = u.replace(/^file:\/\/\//i, '');
    if (/^file:\/\/\/micro\b/i.test(u)) u = u.replace(/^file:\/\/\//i, '');
    if (/^file:\/\/\/ws\b/i.test(u)) u = u.replace(/^file:\/\/\//i, '');

    if (shouldRewrite(u)) return origin + u;
    return url;
  }

  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR && NativeXHR.prototype && typeof NativeXHR.prototype.open === 'function') {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;
    NativeXHR.prototype.open = function (method, url, async, user, password) {
      const nextUrl = rewriteUrl(url);
      try {
        this.__mp_url = typeof nextUrl === 'string' ? nextUrl : '';
      } catch {}
      return nativeOpen.call(this, method, nextUrl, async, user, password);
    };
    NativeXHR.prototype.send = function (body) {
      try {
        const u = typeof this.__mp_url === 'string' ? this.__mp_url : '';
        if (u.includes('/api/server/address')) {
          const remote = new URL(origin);
          const payload = JSON.stringify({
            hostname: remote.hostname,
            port: remote.port || '',
            protocol: remote.protocol.replace(':', ''),
            origin: remote.origin
          });
          body = payload;
          try {
            if (typeof this.setRequestHeader === 'function') {
              this.setRequestHeader('Content-Type', 'application/json');
            }
          } catch {}
        }
      } catch {}
      return nativeSend.call(this, body);
    };
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          const nextUrl = rewriteUrl(input);
          if (typeof nextUrl === 'string' && nextUrl.includes('/api/server/address')) {
            const remote = new URL(origin);
            const payload = JSON.stringify({
              hostname: remote.hostname,
              port: remote.port || '',
              protocol: remote.protocol.replace(':', ''),
              origin: remote.origin
            });
            const nextInit = init ? { ...init } : {};
            nextInit.method = nextInit.method || 'POST';
            nextInit.body = payload;
            nextInit.headers = { ...(nextInit.headers || {}), 'Content-Type': 'application/json' };
            return nativeFetch.call(this, nextUrl, nextInit);
          }
          return nativeFetch.call(this, nextUrl, init);
        }
        if (input && typeof input === 'object' && typeof input.url === 'string') {
          const nextUrl = rewriteUrl(input.url);
          if (nextUrl !== input.url) {
            const req = new Request(nextUrl, input);
            return nativeFetch.call(this, req, init);
          }
        }
      } catch {}
      return nativeFetch.call(this, input, init);
    };
  }

  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function') {
    function PatchedWebSocket(url, protocols) {
      let next = url;
      try {
        if (typeof url === 'string') {
          const wsUrl = new NativeURL(url, window.location.href);
          const local = new NativeURL(window.location.origin);
          const remote = new NativeURL(origin);
          if (wsUrl.hostname === local.hostname) {
            wsUrl.protocol = remote.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl.hostname = remote.hostname;
            wsUrl.port = remote.port;
            next = wsUrl.toString();
          }
        }
      } catch {}
      return protocols !== undefined ? new NativeWebSocket(next, protocols) : new NativeWebSocket(next);
    }
    PatchedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
    window.WebSocket = PatchedWebSocket;
  }
})();
