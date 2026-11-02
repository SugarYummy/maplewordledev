// ---- Achievements (the trophy next to Archive): accounts only. Worked out from what the games already save (results, guesses,
// streaks, the meso log), so everything played before counts too. Which ones are unlocked (and when) is saved in
// mapleWordle:achv, so it goes to the account like every other save; a new one pops up a small "Achievement unlocked"
// note (the first look ever unlocks what was earned before quietly). Logged out, the window just says to make an account.
// The window: your stats on top, then each group of achievements; secret ones show as ??? until found.
(() => {
  const ACHV_KEY = 'mapleWordle:achv';   // { <id>: <day unlocked>, _bestStreak }
  const DAY_MS = 86400000, today = () => Math.floor(Date.now() / DAY_MS);
  const GAMES = { boss: ['story', 'normal', 'hard', 'extreme'], bgm: ['bgmnormal', 'bgm'], class: ['class'], anim: ['anim'] };
  const ALL_MODES = Object.values(GAMES).flat();
  const gameOf = (mode) => Object.keys(GAMES).find((g) => GAMES[g].includes(mode));
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const json = (k, d) => { try { return JSON.parse(read(k)) ?? d; } catch { return d; } };
  const loggedIn = () => typeof acct === 'function' && !!acct();
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  // The lists the collections count against (every boss / class there is), loaded once when needed.
  let lists = null;
  const loadLists = () => (lists ??= Promise.all(['data/bgm.json', 'data/bosses.json', 'data/classes.json', 'data/animation.json']
    .map((u) => fetch(u).then((r) => r.json()).catch(() => null)))
    .then(([bgm, bosses, classes, anim]) => {
      const t = today();
      const bossOf = {};   // a Boss Wordle answer -> its boss (Zakum (Chaos) -> Zakum)
      for (const pool of Object.values(bosses?.pools || {})) for (const e of pool) bossOf[e.name] = e.boss || e.name;
      return {
        tracksOf: Object.fromEntries((bgm?.bosses || []).map((b) => [b.name, [...new Set(b.areas.map((a) => a.track))]])),
        bgm: (bgm?.bosses || []).filter((b) => !b.since || Date.parse(b.since) / DAY_MS <= t).map((b) => b.name),
        bossOf, bosses: [...new Set(Object.values(bossOf))],
        classes: (classes?.solo || []).map((c) => c.name),
        anim: [...new Set((anim?.puzzles || []).map((p) => p.class))],
      };
    }));

  // Everything the achievements look at, from this browser's (= the account's) saves.
  function stats(L) {
    const s = { played: 0, wins: 0, firstTry: 0, diamond: 0, rainbow: 0, days: new Set(), games: new Set(), streak: 0, mesos: 0,
      won: { bgm: new Set(), boss: new Set(), class: new Set(), anim: new Set() }, limbo: false,
      tracks: new Set(json('mapleWordle:bgmTracks', [])), buys: 0 };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i), m = /^mapleWordle:result:([a-z]+):(\d+)$/.exec(key);
      if (!m || !ALL_MODES.includes(m[1])) continue;
      const r = read(key) || '', mode = m[1], d = +m[2], game = gameOf(mode);
      if (!/^(Won|Lost)/.test(r)) continue;
      s.played++;
      s.days.add(d);
      const w = /^Won (?:in )?(\d+)/.exec(r);
      if (!w) continue;
      s.wins++;
      s.games.add(game);
      if (+w[1] === 1) s.firstTry++;
      if (r.endsWith('💎')) s.diamond++;
      if (r.endsWith('🌈')) s.rainbow++;
      if (read(`mapleWordle:style:${mode}:${d}`) === 'limborb') s.limbo = true;
      // The answer of a won day is its last guess.
      const saved = json(`mapleWordle:${mode}:${d}`, []);
      const g = Array.isArray(saved) ? saved : saved.g || [];
      const last = g[g.length - 1];
      if (last) s.won[game].add(game === 'boss' ? (L?.bossOf[last] || last) : last);
    }
    for (const m of ALL_MODES) s.streak = Math.max(s.streak, json(`mapleWordle:streak:${m}`, {}).count || 0);
    s.streak = Math.max(s.streak, json(ACHV_KEY, {})._bestStreak || 0);   // the best one seen, kept (a streak can end)
    // Shop buys: every shop item you own (fx.js)
    try { s.buys = Object.keys(SHOP).filter(shopOwned).length; } catch {}
    s.mesos = json('mapleWordle:mesoLog', []).reduce((t, e) => t + Math.max(0, e.amount || 0), 0);
    return s;
  }
  const count = (set, list) => list ? list.filter((x) => set.has(x)).length : set.size;

  // Each: { id, name, how, prog(stats, lists) -> [have, need], icon, reward?, secret? }. Icons: official MapleStory item
  // art (images/achv/<item id>.png from maplestory.io), names from Maple medals / items.
  const A = (id, name, how, prog, icon, extra) => ({ id, name, how, prog, icon: /^\d+$/.test(icon) ? `images/achv/${icon}.png` : icon, ...extra });
  const upTo = (n, need) => [Math.min(n, need), need];
  // Special Kills: win every BGM of the boss (waiting room, each phase, loot room) in BGM Clip (either mode). Hidden
  // (??? with N/M) until done.
  const kill = (boss, img) => A(`kill:${boss}`, `${boss} Slayer`, `Win every ${boss} BGM in BGM Clip.`,
    (s, L) => { const t = L?.tracksOf[boss] || []; return [t.filter((x) => s.tracks.has(x)).length, t.length || 1]; },
    `images/bosses/${img}.png`, { reward: `${boss}'s kill effect as a win effect (coming soon)`, hidden: true });
  const SECTIONS = [
    ['Special Kills', [kill('Kai', 'kai'), kill('Bellona', 'bellona'), kill('Malefic Star', 'malefic-star')]],
    ['Collections', [
      A('col:bgm', 'MMF Meister', 'Win BGM Clip with every boss.', (s, L) => [count(s.won.bgm, L?.bgm), L?.bgm.length || 1], '1142989'),
      A('col:boss', 'Legendary Hunter', 'Win Boss Wordle with every boss.', (s, L) => [count(s.won.boss, L?.bosses), L?.bosses.length || 1], '1142005'),
      A('col:class', 'Master Collector', 'Win Class Wordle with every class.', (s, L) => [count(s.won.class, L?.classes), L?.classes.length || 1], '1142325'),
      A('col:anim', 'Amazing Collector', 'Win Attack Animation with every class.', (s, L) => [count(s.won.anim, L?.anim), L?.anim.length || 1], '1142324'),
    ]],
    ['Milestones', [
      A('win1', 'Special Training Beginner', 'Win a game.', (s) => upTo(s.wins, 1), '1142242'),
      A('wins10', 'Special Training Intermediate', 'Win 10 games.', (s) => upTo(s.wins, 10), '1142243'),
      A('wins50', 'Special Training Graduate', 'Win 50 games.', (s) => upTo(s.wins, 50), '1142244'),
      A('wins100', 'Special Training Superior', 'Win 100 games.', (s) => upTo(s.wins, 100), '1142245'),
      A('wins500', 'Special Training Master', 'Win 500 games.', (s) => upTo(s.wins, 500), '1142246'),
      A('mayrin', 'The Unblessed Cathedral', 'Win on your first guess.', (s) => upTo(s.firstTry, 1), 'images/bosses/mayrin.png'),
      A('first10', "I'm a Lucky Guy", 'Win on your first guess 10 times.', (s) => upTo(s.firstTry, 10), '1142249'),
      A('first50', 'Lucky Star', 'Win on your first guess 50 times.', (s) => upTo(s.firstTry, 50), '1142573'),
      A('first100', "Cassandra's Crystal Ball", 'Win on your first guess 100 times.', (s) => upTo(s.firstTry, 100), '4001305'),
      A('diamond', 'Born to Be Diamond', 'Get a diamond in BGM Clip.', (s) => upTo(s.diamond, 1), '1142914'),
      A('rainbow', 'Rainbow Badge', 'Get a rainbow in BGM Clip.', (s) => upTo(s.rainbow, 1), '1182007'),
      A('allgames', 'Honorable Explorer', 'Win every game once.', (s) => [s.games.size, 4], '1142184'),
    ]],
    ['Dedication', [
      A('days7', 'Beginner Explorer', 'Play on 7 days.', (s) => upTo(s.days.size, 7), '1142127'),
      A('days30', 'Diligent Explorer', 'Play on 30 days.', (s) => upTo(s.days.size, 30), '1142000'),
      A('days100', 'Perfect Attendance', 'Play on 100 days.', (s) => upTo(s.days.size, 100), '1142295'),
      A('streak3', 'Bounty Rookie', 'Reach a 3 day streak.', (s) => upTo(s.streak, 3), '1142747'),
      A('streak7', 'Bounty Hunter', 'Reach a 7 day streak.', (s) => upTo(s.streak, 7), '1142748'),
      A('streak30', 'Bounty Veteran', 'Reach a 30 day streak.', (s) => upTo(s.streak, 30), '1142749'),
      A('streak100', 'Bounty Legend', 'Reach a 100 day streak.', (s) => upTo(s.streak, 100), '1142751'),
    ]],
    ['Mesos & Shop', [
      A('meso1k', 'Gold Meso', 'Earn 1,000 mesos.', (s) => upTo(s.mesos, 1000), 'images/fx/meso-gold.png'),
      A('meso10k', 'Meso Bundle', 'Earn 10,000 mesos.', (s) => upTo(s.mesos, 10000), 'images/fx/meso-bundle.png'),
      A('meso50k', 'Honorary Meso Ranger', 'Earn 50,000 mesos.', (s) => upTo(s.mesos, 50000), '1142076'),
      A('buy1', 'Shopping Bag', 'Buy an item in the shop.', (s) => upTo(s.buys, 1), '4009370'),
      A('buy5', "Gigatoad's Coin Wallet", 'Buy 5 items in the shop.', (s) => upTo(s.buys, 5), '4000346'),
      A('buy10', 'Richie Rich', 'Buy 10 items in the shop.', (s) => upTo(s.buys, 10), '1142161'),
    ]],
    ['Secret', [
      A('limbo', 'Subconscious', 'Something stirred in the abyss.', (s) => [s.limbo ? 1 : 0, 1], 'images/fx/limbo-bundle.webp', { secret: true }),
    ]],
  ];
  const ALL = SECTIONS.flatMap(([, list]) => list);

  // Newly unlocked ones get saved (with the day) and announced. Only signed in.
  async function check(announce = true) {
    if (!loggedIn()) return;
    const L = await loadLists();
    const first = read(ACHV_KEY) == null;   // first look ever: what was earned before unlocks quietly
    const s = stats(L), got = json(ACHV_KEY, {}), fresh = [];
    for (const a of ALL) {
      const [have, need] = a.prog(s, L);
      if (have >= need && got[a.id] == null) { got[a.id] = today(); fresh.push(a.name); }
    }
    const changed = fresh.length || s.streak > (got._bestStreak || 0);
    got._bestStreak = Math.max(s.streak, got._bestStreak || 0);
    if (changed || first) { try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {} }
    if (announce && !first) fresh.forEach((n, i) => setTimeout(() => toast(n), 2500 + i * 2600));
  }
  function toast(name) {
    const t = Object.assign(document.createElement('div'), { className: 'achvtoast' });
    t.innerHTML = '<img src="images/achv/4000038.png" alt=""><div><b>Achievement unlocked</b><span></span></div>';
    t.querySelector('span').textContent = name;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }
  // A game result saved (a game just ended) or mesos earned: look again.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (typeof k === 'string' && (k.startsWith('mapleWordle:result:') || k === 'mapleWordle:mesoLog' || k === 'mapleWordle:bgmTracks')) { clearTimeout(check.t); check.t = setTimeout(check, 300); }
  };

  async function open() {
    const body = popup('achv', 'Achievements');
    if (!loggedIn()) {
      body.innerHTML = '<p class="achvlocked">Achievements need an account.<br>Make one (or log in) in Settings.</p>';
      return;
    }
    body.innerHTML = '<p class="achvcount">Loading…</p>';
    await check(false);
    const L = await loadLists(), s = stats(L), got = json(ACHV_KEY, {});
    const done = ALL.filter((a) => got[a.id] != null).length;
    const tiles = [['Days played', s.days.size], ['Games played', s.played], ['Wins', s.wins],
      ['Win rate', s.played ? Math.round((s.wins / s.played) * 100) + '%' : '-'], ['First-guess wins', s.firstTry],
      ['Best streak', s.streak], ['Mesos earned', fmt(s.mesos)], ['Achievements', `${done} / ${ALL.length}`]];
    body.innerHTML = '<div class="achvstats">' + tiles.map(([k, v]) => `<div><small>${k}</small><b>${typeof v === 'number' ? fmt(v) : v}</b></div>`).join('') + '</div>';
    for (const [title, list] of SECTIONS) {
      const n = list.filter((a) => got[a.id] != null).length;
      body.insertAdjacentHTML('beforeend', `<h3 class="achvhead">${title} <small>${n} / ${list.length}</small></h3>`);
      const box = body.appendChild(Object.assign(document.createElement('div'), { className: 'achvlist' }));
      for (const a of list) {
        const [have, need] = a.prog(s, L), on = got[a.id] != null, hide = (a.secret || a.hidden) && !on;
        // Hidden: purple ??? row with the Secret Spell Scroll; a hidden kill still shows how far you are (N / M)
        const row = box.appendChild(Object.assign(document.createElement('div'), { className: 'achv' + (on ? ' on' : '') + (hide ? ' secret' : '') }));
        row.innerHTML = `<div class="achvicon"><img src="${hide ? 'images/achv/4031348.png' : a.icon}" alt=""></div><div class="achvtext"><b></b><small></small>` +
          (need > 1 && (!hide || a.hidden) ? `<div class="achvbar"><i style="width:${(have / need) * 100}%"></i></div><small class="achvnum">${fmt(have)} / ${fmt(need)}</small>` : '') +
          (a.reward && !hide ? '<small class="achvreward"></small>' : '') + '</div>' +
          (on ? `<span class="achvdate">${new Date(got[a.id] * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })}</span>` : '');
        row.querySelector('b').textContent = hide ? '???' : a.name;
        row.querySelector('small').textContent = hide ? (a.hidden ? 'Hidden. Keep playing BGM Clip…' : 'A secret. Keep playing…') : a.how;
        if (a.reward && !hide) row.querySelector('.achvreward').textContent = 'Reward: ' + a.reward;
      }
    }
  }

  const btn = Object.assign(document.createElement('button'), { id: 'achvBtn', className: 'panel', title: 'Achievements', innerHTML: '<img src="images/achv/4000038.png" alt="">' });
  btn.setAttribute('aria-label', 'Achievements');
  btn.addEventListener('click', open);
  document.body.appendChild(btn);
  const place = () => { const a = document.getElementById('archiveBtn'); if (a) btn.style.left = a.getBoundingClientRect().right + 8 + 'px'; };
  place();
  addEventListener('resize', place);
  if (document.fonts) document.fonts.ready.then(place);
  check();
})();
