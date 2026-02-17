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
    if (!url || typeof url !== 'string') return false;
    const u = url.trim();
    if (!u) return false;
    if (/^(https?:|wss?:|data:|blob:|file:)/i.test(u)) return false;
    if (u.startsWith('#')) return false;
    return u.startsWith('/api') || u.startsWith('/micro') || u.startsWith('/ws') || u.startsWith('/socket');
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
          if (wsUrl.hostname === local.hostname && wsUrl.port === local.port) {
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
