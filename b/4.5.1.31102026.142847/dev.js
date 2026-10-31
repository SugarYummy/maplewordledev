// Test build only (ima.moe/maplewordledev): tools/dev/build.sh puts this first in every page's <head>. Not on the real site.
// - Progress lives in this tab only (sessionStorage): reloads keep it, closing the tab wipes it, and it never touches
//   the real game's saves on ima.moe.
// - Accounts: a pretend account server inside the page. Nobody can create an account; only the dev accounts
//   YukiTest and YukiTest1-9 (UID Dev and Dev1-9) log in. Nothing reaches the real account database.
//   The key phrase and the dev accounts' password are only kept as SHA-256 hashes (this file is public).
// - A black lock screen first ("Enter key phrase:"); once it's right, a cookie (a year, this site's test path only) skips it.
//   (MapleStory Character searches still ask the real Worker, which only reads Nexon's rankings.)
// - Everyone's results: shown, but test games aren't sent.
// - Bottom left (instead of the alpha version): the build's version (alphaTest vX.Y.Z.DDMMYYYY.HHMMSS, Pacific time when it
//   was uploaded). Click it: every test build (builds.json), newest first; pick one to play that build. Old builds live in
//   b/<build>/ (their code only; the site-proxy Worker fills in images and sounds from the newest build).
// - Settings > Console: /meso 5000 (free mesos), /egg limbo (Limbo's mashup on today's BGM Clip Extreme), /egg off, /help.
(() => {
  const BUILD = 'alphaTest v4.5.1.31102026.142847', STAMP = BUILD.split(' v')[1];
  const ROOT = location.pathname.match(/^(.*?\/maplewordledev\/)/)?.[1] ?? '/';
  Object.defineProperty(window, 'localStorage', { value: window.sessionStorage, configurable: true });
  const ss = window.sessionStorage;
  const KEY_HASH = 'd6b62645532c4df47f8d5630a3833d77353883d1b3fdcf9f338ad17478fceb3e', PASS_HASH = 'f02da703180d0c0f21d0103da1a5578808131515b7bdbad3c7f9331d5214f5e5';
  const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mwdev|' + t)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  // The lock screen: everything else stays hidden until the key phrase is right (then not again in this tab).
  if (!document.cookie.split('; ').includes('mwdevkey=' + KEY_HASH)) {
    const lock = document.createElement('style');
    lock.id = 'devLockCss';
    lock.textContent = 'html.devlock body > :not(#devGate) { display: none !important; } html.devlock body { background: #000 !important; overflow: hidden; }' +
      ' #devGate { position: fixed; inset: 0; z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;' +
      ' background: #000; color: #fff; font: 22px system-ui, sans-serif; }' +
      ' #devGate input { width: 260px; padding: 10px 14px; font: 18px system-ui, sans-serif; color: #fff; background: #111; border: 1px solid #555; border-radius: 8px; text-align: center; }' +
      ' #devGate input:focus { outline: 2px solid #888; } #devGate p { margin: 0; min-height: 1.3em; font-size: 14px; color: #f66; }';
    document.documentElement.classList.add('devlock');
    document.head ? document.head.appendChild(lock) : document.documentElement.appendChild(lock);
    const gate = () => {
      const g = document.createElement('form');
      g.id = 'devGate';
      g.innerHTML = '<label for="devKey">Enter key phrase:</label><input id="devKey" type="password" autocomplete="off" spellcheck="false" autocapitalize="off"><p></p>';
      g.addEventListener('submit', async (e) => {
        e.preventDefault();
        const h = await sha(g.querySelector('input').value);
        if (h !== KEY_HASH) { g.querySelector('p').textContent = 'Wrong key phrase.'; g.querySelector('input').select(); return; }
        document.cookie = `mwdevkey=${h}; path=/maplewordledev; max-age=31536000; SameSite=Lax; Secure`;
        document.documentElement.classList.remove('devlock');
        g.remove();
        lock.remove();
      });
      document.body.appendChild(g);
      g.querySelector('input').focus();
    };
    document.body ? gate() : addEventListener('DOMContentLoaded', gate);
  }
  const ACCOUNT = 'https://maplewordle-account.hanayuki.workers.dev/', STATS = 'https://maplewordle-stats.hanayuki.workers.dev/';
  const SERVER = 'mwdev:server';
  const load = () => {
    try { const s = JSON.parse(ss.getItem(SERVER)); if (s) return s; } catch {}
    const users = {};
    for (let i = 0; i <= 9; i++) {
      const name = 'YukiTest' + (i || '');
      users['dev' + i] = { id: 'Dev' + (i || ''), name, pass: PASS_HASH, rev: 0, data: {} };
    }
    return { users, sessions: {} };
  };
  const save = (s) => Storage.prototype.setItem.call(ss, SERVER, JSON.stringify(s));
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  const NAME = /^[A-Za-z0-9]{1,10}$/;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(STATS)) return realFetch(url);   // read only: test games aren't counted
    if (!url.startsWith(ACCOUNT)) return realFetch(input, init);
    const path = new URL(url).pathname.replace(/^\//, '');
    if (path === 'maple') return realFetch(input, init);   // character search: read-only, from Nexon
    const s = load();
    const body = init.body ? JSON.parse(init.body) : {};
    const byName = (n) => Object.values(s.users).find((u) => u.name.toLowerCase() === String(n).toLowerCase());
    if (path === 'signup') return reply({ error: 'devonly' }, 403);
    if (path === 'login') {
      const u = byName(body.name);
      if (!u) return reply({ error: 'nouser' }, 404);
      if (u.pass !== await sha(body.pass)) return reply({ error: 'wrong' }, 401);
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
      s.sessions[token] = u.id;
      save(s);
      return reply({ token, id: u.id, name: u.name, rev: u.rev, data: u.data });
    }
    const token = (init.headers?.Authorization || '').replace('Bearer ', '');
    const u = Object.values(s.users).find((x) => x.id === s.sessions[token]);
    if (!u) return reply({ error: 'signed out' }, 401);
    if (path === 'logout') { delete s.sessions[token]; save(s); return reply({ ok: true }); }
    if (path === 'rename') {
      if (!NAME.test(body.name || '')) return reply({ error: 'name' }, 400);
      const other = byName(body.name);
      if (other && other !== u) return reply({ error: 'taken' }, 409);
      u.name = body.name; save(s);
      return reply({ name: u.name });
    }
    if (path === 'password') { u.pass = await sha(body.pass); save(s); return reply({ ok: true }); }
    if (path.startsWith('sync') && !init.body) {
      const rev = Number(new URL(url).searchParams.get('rev'));
      return reply(rev === u.rev ? { id: u.id, name: u.name, rev: u.rev } : { id: u.id, name: u.name, rev: u.rev, data: u.data });
    }
    if (path === 'sync') {
      if (body.base !== u.rev) return reply({ rev: u.rev, data: u.data }, 409);
      const data = body.replace ? { ...body.replace } : { ...u.data };
      if (!body.replace) {
        for (const [k, v] of Object.entries(body.set || {})) data[k] = v;
        for (const k of body.del || []) delete data[k];
      }
      u.data = data; u.rev++; save(s);
      return reply({ rev: u.rev });
    }
    return reply({ error: 'not found' }, 404);
  };
  window.devEgg = ss.getItem('mwdev:egg');   // read by bgm.js (bonusFor)
  const DEV_HELP = '/meso 5000 — add mesos (minus works too)\n/egg limbo — Limbo\'s mashup as today\'s BGM Clip Extreme bonus\n/egg off — back to the real bonus\n/help — this list';
  function devRun(line) {
    const [cmd, a] = line.trim().split(/\s+/);
    if (cmd === '/help') return DEV_HELP;
    if (cmd === '/meso') {
      const n = Math.round(Number(String(a).replace(/,/g, '')));
      if (!Number.isFinite(n) || !n) return 'Try: /meso 5000';
      const log = JSON.parse(localStorage.getItem('mapleWordle:mesoLog') || '[]');
      log.push({ key: 'dev:' + Date.now(), mode: 'dev', day: Math.floor(Date.now() / 86400000), what: 'Dev console', amount: n });
      localStorage.setItem('mapleWordle:mesoLog', JSON.stringify(log));
      try { drawMeso(n); } catch {}
      return `${n > 0 ? 'Added' : 'Took away'} ${Math.abs(n).toLocaleString()} mesos.`;
    }
    if (cmd === '/egg') {
      if (a === 'limbo') ss.setItem('mwdev:egg', 'limbo');
      else if (a === 'off') ss.removeItem('mwdev:egg');
      else return 'Try: /egg limbo or /egg off';
      const page = /\/bgm(\.html)?$/.test(location.pathname);
      if (page) setTimeout(() => location.reload(), 900);
      return a === 'limbo' ? `Limbo's mashup is now today's BGM Clip Extreme bonus.${page ? ' Reloading…' : ' Open BGM Clip (Extreme).'}`
        : `Back to the real bonus.${page ? ' Reloading…' : ''}`;
    }
    return 'Unknown command. Type /help';
  }
  // Settings gets a Console row (added each time Settings opens).
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('#settingsBtn')) return;
    setTimeout(() => {
      const body = document.querySelector('#settings .popupbody');
      if (!body || body.querySelector('#devConsole')) return;
      const row = document.createElement('div');
      row.className = 'setrow';
      row.id = 'devConsole';
      row.innerHTML = '<span class="setlabel">Console <small>(test)</small></span><form><input placeholder="/help" autocomplete="off" spellcheck="false" autocapitalize="off"><button>Enter</button></form><pre></pre>';
      const input = row.querySelector('input'), out = row.querySelector('pre');
      row.querySelector('form').addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!input.value.trim()) return;
        out.textContent = devRun(input.value);
        input.value = '';
      });
      body.appendChild(row);
    });
  });
  // The build list (click the version box).
  async function devBuilds(tag) {
    let menu = document.getElementById('devBuilds');
    if (menu) return menu.remove();
    menu = document.createElement('div');
    menu.id = 'devBuilds';
    menu.textContent = 'Loading…';
    document.body.appendChild(menu);
    let list = [];
    try { list = await (await fetch(ROOT + 'builds.json', { cache: 'no-cache' })).json(); } catch {}
    if (!list.length) { menu.textContent = 'No builds found.'; return; }
    const page = location.pathname.split('/').pop();
    menu.innerHTML = list.map((b, i) => `<a href="${i ? `${ROOT}b/${b}/` : ROOT}${page}" class="${b === STAMP ? 'on' : ''}">alphaTest v${b}${i ? '' : ' (newest)'}</a>`).join('');
  }
  addEventListener('click', (e) => { if (!e.target.closest?.('#devBuilds, #devTag')) document.getElementById('devBuilds')?.remove(); });
  addEventListener('DOMContentLoaded', () => {
    try { ACCT_ERRORS.devonly = "Test version: you can't make accounts here."; } catch {}
    document.getElementById('version')?.remove();
    const tag = document.createElement('button');
    tag.id = 'devTag';
    tag.title = 'All test builds';
    tag.addEventListener('click', () => devBuilds(tag));
    tag.innerHTML = `<b>Test version</b> Dev build. Not indicative of the final game.<br>${BUILD}`;
    document.body.appendChild(tag);
    const css = document.createElement('style');
    // Where the alpha version button was (bottom left).
    css.textContent = `
      #devTag { position: fixed; left: 10px; bottom: 8px; z-index: 3; white-space: nowrap; padding: 5px 10px; border: none; border-radius: 8px; text-align: left;
        font: 11.5px/1.35 system-ui, sans-serif; color: #fff; background: rgba(200, 40, 40, 0.88); cursor: pointer; }
      #devTag:hover { background: rgba(220, 50, 50, 0.95); }
      #devBuilds { position: fixed; left: 10px; bottom: 48px; z-index: 7; width: 260px; max-height: 50vh; overflow-y: auto; padding: 4px; border-radius: 8px;
        font: 12px/1.3 system-ui, sans-serif; color: #fff; background: rgba(25, 25, 25, 0.95); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
      #devBuilds a { display: block; text-align: left; padding: 6px 8px; border-radius: 5px; color: #fff; text-decoration: none; }
      #devBuilds a:hover { background: rgba(255, 255, 255, 0.12); }
      #devBuilds a.on { background: rgba(200, 40, 40, 0.88); font-weight: 700; }
      #devConsole form { display: flex; gap: 6px; flex: 1; }
      #devConsole input { flex: 1; min-width: 0; font: 13px ui-monospace, Consolas, monospace; padding: 4px 8px; border: 1px solid #999; border-radius: 6px; }
      #devConsole pre { flex-basis: 100%; margin: 0; white-space: pre-wrap; font: 12px/1.4 ui-monospace, Consolas, monospace; color: #444; }
      #devConsole pre:empty { display: none; }
      @media (max-width: 700px) { #devTag { bottom: 64px; } #devBuilds { bottom: 104px; } }`;
    document.head.appendChild(css);
  });
})();
