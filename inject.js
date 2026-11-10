// Выполняется в контексте страницы (world: MAIN). Подменяет fetch и XMLHttpRequest.
(() => {
  if (window.__responseMocker) return;
  Object.defineProperty(window, '__responseMocker', { value: true });

  let rules = [];
  let enabled = true;
  let ready = false;
  let markReady;
  const readyPromise = new Promise(r => (markReady = r));
  const setReady = () => { ready = true; markReady(); };
  setTimeout(setReady, 500); // запасной вариант, если мост не ответил

  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'rmock-bridge') return;
    rules = Array.isArray(d.rules) ? d.rules : [];
    enabled = d.enabled !== false;
    setReady();
  });
  window.postMessage({ source: 'rmock-page' }, '*'); // просим мост прислать правила

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  function urlMatches(rule, url) {
    const p = rule.pattern || '';
    if (!p) return false;
    switch (rule.matchType) {
      case 'equals': return url === p;
      case 'regex': try { return new RegExp(p).test(url); } catch { return false; }
      case 'wildcard': return new RegExp('^' + p.split('*').map(esc).join('.*') + '$').test(url);
      default: return url.includes(p);
    }
  }

  function findRule(method, url) {
    if (!enabled) return null;
    const m = String(method || 'GET').toUpperCase();
    return rules.find(r => r.enabled && (r.method === 'ANY' || r.method === m) && urlMatches(r, url)) || null;
  }

  function headersOf(rule) {
    const h = {};
    if (rule.contentType) h['Content-Type'] = rule.contentType;
    for (const line of String(rule.headers || '').split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return h;
  }

  const log = (method, url, rule) =>
    console.info('%c[Response Mocker]', 'color:#0b6e5f;font-weight:600', `${method} ${url} → ${rule.status} (${rule.name || 'без названия'})`);

  // ---------- fetch ----------
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    if (!ready) await readyPromise;
    let method, url;
    try {
      const req = input instanceof Request ? input : null;
      method = (init && init.method) || (req && req.method) || 'GET';
      url = new URL(req ? req.url : String(input), location.href).href;
    } catch {
      return nativeFetch.apply(this, arguments);
    }
    const rule = findRule(method, url);
    if (!rule) return nativeFetch.apply(this, arguments);
    if (rule.delay > 0) await sleep(rule.delay);
    log(method, url, rule);
    const noBody = [101, 204, 205, 304].includes(rule.status);
    const res = new Response(noBody ? null : String(rule.body ?? ''), {
      status: rule.status,
      statusText: rule.statusText || '',
      headers: headersOf(rule)
    });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };

  // ---------- XMLHttpRequest ----------
  const NativeXHR = window.XMLHttpRequest;
  class MockXHR extends NativeXHR {
    open(method, url, async = true, ...rest) {
      this._rmMethod = method;
      this._rmUrl = url;
      this._rmSync = async === false;
      return super.open(method, url, async, ...rest);
    }

    send(body) {
      let abs;
      try { abs = new URL(String(this._rmUrl), location.href).href; } catch { return super.send(body); }
      const go = () => {
        const rule = findRule(this._rmMethod, abs);
        if (!rule) return super.send(body);
        log(this._rmMethod, abs, rule);
        this._rmRun(rule, abs, this._rmSync);
      };
      if (!ready && !this._rmSync) readyPromise.then(go); else go();
    }

    _rmRun(rule, abs, sync) {
      const self = this;
      const text = String(rule.body ?? '');
      const hdr = headersOf(rule);
      const st = { readyState: 1, status: 0, statusText: '', done: false };
      const define = (name, get) => Object.defineProperty(self, name, { configurable: true, get });

      define('readyState', () => st.readyState);
      define('status', () => st.status);
      define('statusText', () => st.statusText);
      define('responseURL', () => (st.done ? abs : ''));
      define('responseText', () => (st.done ? text : ''));
      define('response', () => {
        const type = self.responseType;
        if (!st.done) return type === '' || type === 'text' ? '' : null;
        switch (type) {
          case 'json': try { return JSON.parse(text); } catch { return null; }
          case 'arraybuffer': return new TextEncoder().encode(text).buffer;
          case 'blob': return new Blob([text], { type: hdr['Content-Type'] || '' });
          default: return text;
        }
      });
      self.getResponseHeader = name => {
        const key = Object.keys(hdr).find(k => k.toLowerCase() === String(name).toLowerCase());
        return key ? hdr[key] : null;
      };
      self.getAllResponseHeaders = () =>
        Object.entries(hdr).map(([k, v]) => `${k.toLowerCase()}: ${v}\r\n`).join('');

      const fire = (type, progress) => self.dispatchEvent(progress
        ? new ProgressEvent(type, { lengthComputable: true, loaded: text.length, total: text.length })
        : new Event(type));
      const finish = () => {
        st.readyState = 2; st.status = rule.status; st.statusText = rule.statusText || '';
        fire('readystatechange');
        st.readyState = 3; fire('readystatechange');
        st.readyState = 4; st.done = true; fire('readystatechange');
        fire('load', true); fire('loadend', true);
      };
      fire('loadstart', true);
      if (sync) finish(); else setTimeout(finish, Math.max(0, rule.delay | 0));
    }
  }
  window.XMLHttpRequest = MockXHR;
})();
