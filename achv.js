// ---- Achievements (the trophy under Settings): accounts only. Worked out from what the games already save (results, guesses,
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
  const dayText = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
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
      tracks: new Set(json('mapleWordle:bgmTracks', [])), buys: 0,
      limboMash: read('mapleWordle:limboMash') === '1' };
    const byMode = {};   // each mode's days played: [day, won]
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i), m = /^mapleWordle:result:([a-z]+):(\d+)$/.exec(key);
      if (!m || !ALL_MODES.includes(m[1])) continue;
      const r = read(key) || '', mode = m[1], d = +m[2], game = gameOf(mode);
      if (!/^(Won|Lost)/.test(r)) continue;
      (byMode[mode] ??= []).push([d, /^Won/.test(r)]);
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
    // ...and the best streak in everything saved (the Archive too, day by day), like the games count it: Story counts
    // days in a row; the other modes count wins in a row (a loss ends it)
    for (const [mode, list] of Object.entries(byMode)) {
      let run = 0, prev = null;
      for (const [d, won] of list.sort((a, b) => a[0] - b[0])) {
        run = mode === 'story' ? (prev === d - 1 ? run + 1 : 1) : won ? run + 1 : 0;
        prev = d;
        s.streak = Math.max(s.streak, run);
      }
    }
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
  // Icons: the skill's icon (Kai, Malefic Star); Mayrin and Bellona use their boss picture until GMS has theirs.
  // Hidden: win every BGM of the boss (waiting room, each phase, loot room) in BGM Clip Extreme. Locked: its short name,
  // ??? and N / M; unlocked: its full name (the boss's finishing attack) and what you did.
  const kill = (boss, name, full, img, fx) => A(`kill:${boss}`, name, `Played all versions of ${boss}'s BGM in Extreme mode.`,
    (s, L) => { const t = L?.tracksOf[boss] || []; return [t.filter((x) => s.tracks.has(x)).length, t.length || 1]; },
    `images/bosses/${img}.png`, { full, fx, reward: 'Guess in 1 win effect' });
  const SECTIONS = [
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
      A('first1', "I'm a Lucky Guy", 'Win on your first guess.', (s) => upTo(s.firstTry, 1), '1142249'),
      A('first10', 'Lucky Star', 'Win on your first guess 10 times.', (s) => upTo(s.firstTry, 10), '1142573'),
      A('first50', "Cassandra's Crystal Ball", 'Win on your first guess 50 times.', (s) => upTo(s.firstTry, 50), '4001305'),
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
    ['Hidden', [
      kill('Malefic Star', "Siren's Song", "Siren's Song", '../achv/siren-song', 'sirenSong'),
      kill('Kai', 'Iaido Alpha', 'Kai-ryu Sword: Iaido Alpha', '../achv/iaido-alpha', 'iaidoAlpha'),
      kill('Mayrin', 'Guide of Destiny', 'Guide of Destiny', 'mayrin', 'mayrinKill'),
      kill('Bellona', "Fanatic's Execution", "Fanatic's Execution", 'bellona', 'bellonaKill'),
      A('kill:Jupiter', 'Seething Balance', "Played all versions of Jupiter's BGM in Extreme mode.",
        (s, L) => { const t = L?.tracksOf.Jupiter || []; return [t.filter((x) => s.tracks.has(x)).length, t.length || 1]; },
        'images/achv/seething-balance.png?v=2', { appear: 'seethingBalance', reward: 'Seething Balance appearance effect' }),
      A('limbo', 'Subconscious', 'Something stirred in the abyss.', (s) => [s.limboMash ? 1 : 0, 1], 'images/fx/limbo-bundle.webp',
        { full: "Limbo's Subconscious", mesos: 1000, reward: '1,000 mesos' }),
    ], true],
  ];
  const ALL = SECTIONS.flatMap(([, list]) => list);
  // Tiers, like MapleStory's achievements: each gives its achievement points (AP) when done. (Ranking up by AP: later.)
  const TIERS = { common: ['Common', 10], rare: ['Rare', 20], epic: ['Epic', 30], unique: ['Unique', 40], legendary: ['Legendary', 100] };
  const TIER_OF = {"col:bgm": "legendary", "col:boss": "legendary", "col:class": "unique", "col:anim": "unique", "win1": "common", "wins10": "common", "wins50": "rare", "wins100": "epic", "wins500": "unique", "first1": "common", "first10": "rare", "first50": "epic", "diamond": "rare", "rainbow": "rare", "allgames": "rare", "days7": "common", "days30": "rare", "days100": "epic", "streak3": "common", "streak7": "rare", "streak30": "epic", "streak100": "unique", "meso1k": "common", "meso10k": "rare", "meso50k": "epic", "buy1": "common", "buy5": "rare", "buy10": "epic", "kill:Jupiter": "epic", "limbo": "epic"};
  for (const a of ALL) a.tier = TIER_OF[a.id] || (a.id.startsWith('kill:') ? 'epic' : 'common');
  const apOf = (got) => ALL.reduce((t, a) => t + (got[a.id] != null ? TIERS[a.tier][1] : 0), 0);

  // Newly unlocked ones get saved (with the day) and announced. Only signed in.
  async function check(announce = true) {
    if (!loggedIn()) return;
    const L = await loadLists();
    const first = read(ACHV_KEY) == null;   // first look ever: what was earned before unlocks quietly
    const s = stats(L), got = json(ACHV_KEY, {}), unlocked = [];
    for (const a of ALL) {
      const [have, need] = a.prog(s, L);
      if (have >= need && got[a.id] == null) { got[a.id] = today(); unlocked.push(a); }
    }
    const changed = unlocked.length || s.streak > (got._bestStreak || 0);
    got._bestStreak = Math.max(s.streak, got._bestStreak || 0);
    if (changed || first) { try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {} }
    if (announce && !first) unlocked.forEach((a) => banner(a, 2500));
    noteClaims();
  }
  // Achievement complete: MapleStory's own banner (its back and front played together, the front over it), the name in
  // its bar and the points under the trophy, with its sound. Several: one after another (each waits for the last).
  // Every tier uses the Common banner until the others' are added (images/achv/fx/<tier>-back/-front).
  const BANNER_MS = 4200;
  // Each tier's banner files (images/achv/fx/<tier>-back, -front, num-<tier>/0-9.png) and where its front sits over the
  // back (x, y, w, h), the back's height and how far its art sits lower than Common's (all from the files themselves).
  // A tier without its own yet uses Common's.
  const BANNER_ART = { common: [336, 31, 693, 194, 231, 0], rare: [314, -11, 737, 244, 231, 0], epic: [314, 27, 737, 244, 269, 38],
    unique: [283, 76, 799, 271, 425, 113], legendary: [283, 76, 799, 271, 425, 113] };
  let bannerFree = 0;
  function banner(a, wait = 0) {
    const at = Math.max(Date.now() + wait, bannerFree);
    bannerFree = at + BANNER_MS;
    setTimeout(() => {
      const safari = typeof SAFARI !== 'undefined' && SAFARI, art = BANNER_ART[a.tier] ? a.tier : 'common', [fx, fy, fw, fh, bh, dy] = BANNER_ART[art];
      const el = Object.assign(document.createElement('div'), { className: `achvbanner t-${a.tier}` });
      const media = (part) => safari ? `<img class="${part}" src="images/achv/fx/${art}-${part}.webp" alt="" ${pos[part]}>`
        : `<video class="${part}" src="images/achv/fx/${art}-${part}.webm" muted autoplay playsinline disablepictureinpicture ${pos[part]}></video>`;
      const pos = { front: `style="left:${fx}px;top:${fy - dy}px;width:${fw}px;height:${fh}px"`, back: `style="top:${-dy}px;height:${bh}px"` };
      el.innerHTML = `<div class="achvbannerin">${media('back')}<b class="achvap" aria-hidden="true">${[...String(TIERS[a.tier][1])].map((n) => `<img src="images/achv/fx/num-${art}/${n}.png" alt="">`).join('')}</b><span class="achvname"></span>${media('front')}</div>`;
      el.querySelector('.achvname').textContent = a.full || a.name;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-label', `Achievement complete: ${a.full || a.name}`);
      const front = el.querySelector('.front');
      if (safari) setTimeout(() => front.remove(), 340); else front.addEventListener('ended', () => front.remove());
      document.body.appendChild(el);
      if (typeof resultSound === 'function') resultSound(true, 0, 'achvComplete');
      setTimeout(() => el.classList.add('out'), BANNER_MS - 500);
      setTimeout(() => el.remove(), BANNER_MS);
    }, at - Date.now());
  }
  function toast(name, head = 'Achievement unlocked') {
    const t = Object.assign(document.createElement('div'), { className: 'achvtoast' });
    t.innerHTML = '<img src="images/achv/4000038.png" alt=""><div><b></b><span></span></div>';
    t.querySelector('b').textContent = head;
    t.querySelector('span').textContent = name;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }
  // A game result saved (a game just ended) or mesos earned: look again.
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (typeof k === 'string' && (k.startsWith('mapleWordle:result:') || k === 'mapleWordle:mesoLog' || k === 'mapleWordle:bgmTracks' || k === 'mapleWordle:limboMash')) { clearTimeout(check.t); check.t = setTimeout(check, 300); }
  };

  // NEW on the trophy button: a reward to claim that you haven't been shown yet. It's shown once (gone after a reload
  // even if you don't claim it; mapleWordle:achvSeen remembers), and goes when you claim it.
  const SEEN_KEY = 'mapleWordle:achvSeen', fresh = new Set();
  const claimable = (got) => ALL.filter((a) => a.reward && got[a.id] != null && got._claimed?.[a.id] == null).map((a) => a.id);
  function newTag() {
    btn.querySelector('.newtag')?.remove();
    const got = json(ACHV_KEY, {});
    if (loggedIn() && claimable(got).some((id) => fresh.has(id))) btn.appendChild(Object.assign(document.createElement('span'), { className: 'newtag', textContent: 'NEW' }));
  }
  function noteClaims() {
    if (!loggedIn()) return;
    const seen = json(SEEN_KEY, []), add = claimable(json(ACHV_KEY, {})).filter((id) => !seen.includes(id));
    if (add.length) {
      add.forEach((id) => fresh.add(id));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...add])); } catch {}
    }
    newTag();
  }
  // Claim a finished Hidden achievement's reward: its win effect (fx.js HECATE, in Customize > Win Effect, NEW until
  // reload) or its mesos.
  function claim(a, btn) {
    const got = json(ACHV_KEY, {});
    if (got[a.id] == null || got._claimed?.[a.id] != null) return;
    got._claimed = { ...got._claimed, [a.id]: today() };
    try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {}
    if (a.mesos && typeof mesoLog === 'function') {
      const log = mesoLog();
      if (!log.some((e) => e.key === `achv:${a.id}`)) {
        log.push({ key: `achv:${a.id}`, mode: 'achv', day: today(), what: a.full || a.name, amount: a.mesos });
        lsSet(MESO_LOG_KEY, JSON.stringify(log));
        const fly = typeof mesoFly === 'function' && mesoFly(12, btn);   // the mesos fly from the Claim button into the counter
        setTimeout(() => drawMeso(a.mesos), fly ? 900 : 0);
      }
    }
    if (typeof resultSound === 'function') resultSound(true, 0, 'purchase');   // (for now: the shop's purchase sound)
    btn?.replaceWith(Object.assign(document.createElement('span'), { className: 'achvdate', textContent: 'Claimed' }));
    fresh.delete(a.id);
    newTag();
    if (a.mesos) toast(a.full || a.name, `+${fmt(a.mesos)} mesos`);
    if (a.appear) {   // an appearance effect: Settings > Account Settings > MapleStory Character
      if (typeof acctAvatarCall === 'function') acctAvatarCall();
      itemPopup({ name: a.full || a.name, img: 'images/fx/seething-balance.webp?v=2' }, 'Successfully Claimed!', false, ['Settings', 'yes'], ['Close', 'plain'])
        .then((go) => { if (go) { document.getElementById('achv').hidden = true; document.getElementById('settingsBtn')?.click(); } });
    }
    if (a.fx && typeof drawThemeButton === 'function') {
      customFresh.add(a.fx); customTab = 'win'; drawThemeButton();
      // Like a shop purchase: its picture, and Customize takes you there
      itemPopup({ name: a.full || a.name, img: `images/fx/hecate/${a.fx}.webp?v=6` }, 'Successfully Claimed!', false, ['Customize', 'yes'], ['Close', 'plain'])
        .then((go) => { if (go) { document.getElementById('achv').hidden = true; document.getElementById('themeBtn')?.click(); } });
    }
  }
  async function open() {
    const body = popup('achv', 'Achievements');
    if (!loggedIn()) {
      body.innerHTML = '<p class="achvlocked">Achievements need an account.<br>Log in or create an account in settings.</p>';
      return;
    }
    body.innerHTML = '<p class="achvcount">Loading…</p>';
    await check(false);
    const L = await loadLists(), s = stats(L), got = json(ACHV_KEY, {});
    const done = ALL.filter((a) => got[a.id] != null).length;
    const tiles = [['Days played', s.days.size], ['Games played', s.played], ['Wins', s.wins],
      ['Win rate', s.played ? Math.round((s.wins / s.played) * 100) + '%' : '-'], ['First-guess wins', s.firstTry],
      ['Best streak', s.streak], ['Mesos earned', fmt(s.mesos)], ['Achievements', `${done} / ${ALL.length}`], ['Achievement Points', fmt(apOf(got))]];
    body.innerHTML = '<div class="achvstats">' + tiles.map(([k, v]) => `<div><small>${k}</small><b>${typeof v === 'number' ? fmt(v) : v}</b></div>`).join('') + '</div>';
    for (const [title, list, hidden] of SECTIONS) {
      const n = list.filter((a) => got[a.id] != null).length;
      body.insertAdjacentHTML('beforeend', `<h3 class="achvhead">${title} <small>${n} / ${list.length}</small></h3>`);
      const box = body.appendChild(Object.assign(document.createElement('div'), { className: 'achvlist' }));
      for (const a of list) {
        const [have, need] = a.prog(s, L), on = got[a.id] != null, hide = hidden && !on;
        // Hidden: always purple. Locked: the Secret Spell Scroll, its short name, a faint ??? and how far you are (N / M)
        const row = box.appendChild(Object.assign(document.createElement('div'), { className: 'achv' + (on ? ' on' : '') + (hidden ? ' secret' : '') }));
        row.innerHTML = `<div class="achvicon"><img src="${hide ? 'images/achv/4031348.png' : a.icon}" alt=""></div><div class="achvtext"><b></b><small></small>` +
          ((need > 1 || hide) && !(hidden && on) ? `<div class="achvbar"><i style="width:${(have / need) * 100}%"></i></div><small class="achvnum">${fmt(have)} / ${fmt(need)}</small>` : '') +
          (a.reward && !hide ? '<small class="achvreward"></small>' : '') + '</div>' +
          (on && a.reward && hidden ? (got._claimed?.[a.id] ? '<span class="achvdate">Claimed</span>' : '<button class="achvclaim">Claim</button>') :
          on ? `<span class="achvdate">${dayText(got[a.id])}</span>` : '');
        row.querySelector('b').textContent = on ? a.full || a.name : a.name;
        row.querySelector('b').insertAdjacentHTML('afterend', `<span class="achvtier t-${a.tier}">${TIERS[a.tier][0]} · ${TIERS[a.tier][1]} AP</span>`);
        row.querySelector('small').textContent = hide ? '???' : a.how;
        if (hide) row.querySelector('small').classList.add('achvq');
        if (a.reward && !hide) {   // the reward itself coloured: a win effect by its full name in purple, mesos in meso gold
          const r = row.querySelector('.achvreward');
          r.textContent = 'Reward: ';
          r.appendChild(Object.assign(document.createElement('span'), a.mesos ? { className: 'rwmeso', textContent: `${fmt(a.mesos)} mesos` }
            : a.fx ? { className: 'rwfx', textContent: a.full || a.name }
            : a.appear ? { className: 'rwfx', textContent: `${a.full || a.name} (appearance effect)` } : { textContent: a.reward }));
        }
        const cb = row.querySelector('.achvclaim');
        if (cb) { cb.addEventListener('click', () => claim(a, cb)); if (typeof hoverSound === 'function') hoverSound(cb); }   // (the shop's hover sound, for now)
      }
    }
  }

  const btn = Object.assign(document.createElement('button'), { id: 'achvBtn', className: 'panel', title: 'Achievements', innerHTML: '<img src="images/achv/4000038.png" alt="">' });
  btn.setAttribute('aria-label', 'Achievements');
  btn.addEventListener('click', open);
  document.body.appendChild(btn);
  // (the test site's console: /unlock achievement)
  window.achvDev = (pick) => {
    const got = json(ACHV_KEY, {}), locked = ALL.filter((a) => got[a.id] == null);
    if (pick === '*') {   // every one at once (one note, not dozens)
      for (const a of locked) got[a.id] = today();
      try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {}
      banner({ name: `All ${ALL.length} achievements`, tier: 'legendary' });
      noteClaims();
      return locked.length;
    }
    const a = pick ? ALL.find((x) => (x.full || x.name).toLowerCase().includes(pick)) : locked[0] ?? ALL[Math.floor(Math.random() * ALL.length)];
    if (!a) return null;
    if (got[a.id] == null) { got[a.id] = today(); try { localStorage.setItem(ACHV_KEY, JSON.stringify(got)); } catch {} }
    banner(a);
    noteClaims();
    return a.full || a.name;
  };
  check();
})();
