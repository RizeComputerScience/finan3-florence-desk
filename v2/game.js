/* The Banker of Florence, version 2: the table. Draws the game, moves the gold, writes the ledger, makes the receipt.
   Every number comes from config.js (simulate, runScript, kingOptions); this file only shows them.
   The receipt uses desk-engine.js in its no-UI mode (makePayload, verifyPayload, addTextChunk), unchanged from version 1. */
(function () {
  'use strict';
  const C = window.DESK, D = window.DeskEngine.make(C), h = window.DeskEngine.h;
  const T = C.TURNS, IDS = C.TURN_IDS, fl = C.fl, flo = C.flo, keyOf = C.keyOf;
  const KEY = C.storageKey;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || window.__FAST;
  const main = $('#main');
  const announce = (t) => { const a = $('#announce'); a.textContent = ''; setTimeout(() => { a.textContent = t; }, 30); };
  const SVGNS = 'http://www.w3.org/2000/svg';
  function E(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  // ---------------- sound: short synthesized cues, off by default ----------------
  const Sound = (() => {
    let on = store.get(KEY + ':sound') === true, ctx = null, last = 0;
    const btn = $('#sound');
    const paint = () => { btn.setAttribute('aria-pressed', String(on)); btn.querySelector('.label').textContent = on ? 'Sound on' : 'Sound off'; $('#soundWaves').style.opacity = on ? 1 : 0.2; };
    btn.addEventListener('click', () => { on = !on; store.set(KEY + ':sound', on); paint(); if (on) { ac(); play('coin'); } });
    paint();
    function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; }
    function noise(c, dur) { const b = c.createBuffer(1, Math.max(1, c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = c.createBufferSource(); s.buffer = b; return s; }
    function env(c, node, t0, a, d, peak) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); node.connect(g); g.connect(c.destination); return g; }
    function play(kind) {
      if (!on) return; const c = ac(); if (!c) return; const t = c.currentTime;
      if (kind === 'coin') { if (t - last < 0.045) return; last = t;
        [2900, 4150, 5400].forEach((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (0.97 + Math.random() * 0.06); env(c, o, t, 0.002, 0.18 - i * 0.04, 0.05 / (i + 1)); o.start(t); o.stop(t + 0.25); }); }
      if (kind === 'thud') { const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25); env(c, o, t, 0.005, 0.3, 0.35); o.start(t); o.stop(t + 0.35);
        const n = noise(c, 0.12), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; n.connect(f); env(c, f, t, 0.002, 0.1, 0.2); n.start(t); }
      if (kind === 'quill') { for (let i = 0; i < 3; i++) { const n = noise(c, 0.07), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200 + i * 500; f.Q.value = 3; n.connect(f); env(c, f, t + i * 0.09, 0.01, 0.06, 0.05); n.start(t + i * 0.09); } }
      if (kind === 'seal') { const n = noise(c, 0.2), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; n.connect(f); env(c, f, t, 0.001, 0.12, 0.25); n.start(t); }
      if (kind === 'bell') { [220, 523, 698, 1040].forEach((fq, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; env(c, o, t, 0.01, 2.2 - i * 0.4, 0.09 / (i + 1)); o.start(t); o.stop(t + 2.4); }); }
      if (kind === 'murmur') { const n = noise(c, 2.5), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.8; n.connect(f); env(c, f, t, 0.6, 1.8, 0.07); n.start(t); }
    }
    return { play, get on() { return on; } };
  })();

  // ---------------- motion ----------------
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  let animGen = 0;   // bumps when the screen changes, so running animations stop
  function tween(ms, fn, ez) {
    const gen = animGen;
    if (reduced() || ms <= 0) { fn(1); return Promise.resolve(); }
    if (hurry) ms *= 0.3;
    return new Promise((res) => { const t0 = performance.now(); const step = (now) => { if (gen !== animGen) return res(); const x = Math.min(1, (now - t0) / ms); fn((ez || ease)(x)); if (x < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
  }
  const wait = (ms) => (reduced() ? Promise.resolve() : new Promise((r) => { const gen = animGen; setTimeout(() => r(gen), ms); }));
  const lerp = (a, b, x) => a + (b - a) * x;

  // ---------------- images (all files in img/; licenses in ../FACTS.md and the credits dialog) ----------------
  const IMG = {
    folio: { src: 'img/counting-house-folio.jpg', alt: 'A fourteenth-century painting of a counting house in two scenes. Above, a banker in red sits behind a chest while men count gold coins on a table. Below, two bankers write in account books on a red cloth while a crowd waits.', cap: 'A counting house, from the Cocharelli treatise on the vices, Genoa, 14th century. British Library, Add MS 27695, f. 8.' },
    countryside: { src: 'img/lorenzetti-road.jpg', alt: 'Riders and pack mules leave a walled city along a country road, in a fresco.', cap: 'Ambrogio Lorenzetti, Effects of Good Government in the Countryside (detail), Siena, 1338 to 1339.' },
    city: { src: 'img/lorenzetti-shops.jpg', alt: 'Shops open onto a busy street in a walled Italian city, in a fresco.', cap: 'Ambrogio Lorenzetti, Effects of Good Government in the City (detail), Siena, 1338 to 1339.' },
    war: { src: 'img/lorenzetti-soldiers.jpg', alt: 'Armed soldiers in a ruined city, in a fresco.', cap: 'Ambrogio Lorenzetti, Effects of Bad Government in the City (detail), Siena, 1338 to 1339.' },
    church: { src: 'img/counting-house-top.jpg', alt: 'Christ looks down on a banker counting gold, with a Latin text from scripture behind him.', cap: 'A banker at his counting table under a text from scripture. Cocharelli treatise on the vices, Genoa, 14th century. British Library, Add MS 27695, f. 8.' },
    crowd: { src: 'img/counting-house-crowd.jpg', alt: 'A crowd presses toward two bankers writing in account books on a red cloth.', cap: 'Paying out at a counting house. Cocharelli treatise on the vices, Genoa, 14th century. British Library, Add MS 27695, f. 8.' },
    goodcity: { src: 'img/lorenzetti-dancers.jpg', alt: 'Townspeople dance in a street of busy shops, in a fresco.', cap: 'Ambrogio Lorenzetti, Effects of Good Government in the City (detail), Siena, 1338 to 1339.' },
    badcity: { src: 'img/lorenzetti-ruin.jpg', alt: 'A city in ruins, with damaged houses and empty streets, in a fresco.', cap: 'Ambrogio Lorenzetti, Effects of Bad Government in the City (detail), Siena, 1338 to 1339.' },
  };
  const TURN_IMG = { t1: 'countryside', t2: 'city', t3: 'war', t4: 'church', t5: 'crowd' };
  const FATE_IMG = { survived: 'goodcity', run: 'crowd', default: 'badcity' };
  const CREDITS = [
    ['A counting house (three details and the title plate)', 'Cocharelli treatise on the vices, Genoa, 14th century, British Library Add MS 27695, f. 8', 'CC0, released by the British Library', 'https://commons.wikimedia.org/wiki/File:Counting_house_scenes_-_Treatise_on_the_Vices_(late_14th_C),_f.8_-_BL_Add_MS_27695.jpg'],
    ['Effects of Good Government in the Countryside (detail)', 'Ambrogio Lorenzetti, Palazzo Pubblico, Siena, 1338 to 1339', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Ambrogio_Lorenzetti_-_Effects_of_Good_Government_in_the_countryside_-_Google_Art_Project.jpg'],
    ['Effects of Good Government in the City (three details, one behind the street)', 'Ambrogio Lorenzetti, Palazzo Pubblico, Siena, 1338 to 1339', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Ambrogio_Lorenzetti_-_Effects_of_Good_Government_in_the_city_-_Google_Art_Project.jpg'],
    ['Effects of Bad Government in the City (two details)', 'Ambrogio Lorenzetti, Palazzo Pubblico, Siena, 1338 to 1339', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Ambrogio_Lorenzetti_-_Bad_Government_and_the_Effects_of_Bad_Government_on_the_City_Life_-_WGA13499.jpg'],
    ['Coastlines, lakes and rivers on the chart in turn 1', 'Natural Earth, 1:50m physical data, drawn in the manner of Angelino Dulcert’s sea chart of 1339', 'Public domain', 'https://www.naturalearthdata.com/'],
    ['Gold florin of Florence, 1323 (the coins on the table)', 'Photograph by Sailko, Teylers Museum', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Firenze,_fiorino_d%27oro,_1323.jpg'],
  ];

  // ---------------- state ----------------
  // S.log[id] = { done, attempts, help, choice (with the desk's suffix), at }. A turn's choice is final once written.
  let S = { code: '', tasks: [], log: {}, memo: '', at: 'start', practice: 0 };
  const blankLog = () => { const l = {}; D.STEPS.forEach((s) => { l[s.id] = { done: false, attempts: 0, help: 0 }; }); return l; };
  function save() { if (S.practice) return; store.set(KEY + ':' + D.seedFor(S.code), { code: S.code, log: S.log, memo: S.memo, at: S.at }); store.set(KEY + ':last', S.code); }
  function startFor(code) {
    S.code = h.normCode(code); S.tasks = D.buildTasks(S.code); S.practice = 0;
    const saved = store.get(KEY + ':' + D.seedFor(S.code));
    S.log = saved && saved.log ? saved.log : blankLog(); D.STEPS.forEach((s) => { if (!S.log[s.id]) S.log[s.id] = { done: false, attempts: 0, help: 0 }; });
    S.memo = saved && saved.memo ? saved.memo : ''; S.at = saved && saved.at ? saved.at : 't1'; save();
  }
  const choices = () => { const o = {}; IDS.forEach((id) => { const l = S.log[id]; if (l && l.done && l.choice) o[id] = keyOf(l.choice); }); return o; };
  const firstOpen = () => { const s = D.STEPS.find((x) => !S.log[x.id].done); return s ? s.id : 'receipt'; };
  function commitChoice(id, key) {
    if (S.practice) { S.pchoices[id] = key; return; }   // a replay keeps its choices in memory only
    const t = S.tasks.find((x) => x.id === id), v = t.values[C.OPT[id].indexOf(key)], L = S.log[id];
    L.choice = v; L.attempts = Math.max(L.attempts || 0, 1); if (!L.done) { L.done = true; L.at = new Date().toISOString(); }
    save(); renderChapters();
  }
  function markDone(id) { const L = S.log[id]; if (!L.done) { L.done = true; L.at = new Date().toISOString(); save(); renderChapters(); } }

  // ---------------- chapters ----------------
  const CH = [...IDS.map((id, i) => ({ id, glyph: ['I', 'II', 'III', 'IV', 'V'][i], label: T[id].title })), { id: 'story', glyph: 'book', label: 'Your bank’s chronicle' }, { id: 'note', glyph: 'pen', label: 'Your note' }, { id: 'receipt', glyph: 'seal', label: 'Receipt' }];
  const GLYPH = { book: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4c3-1 6-1 8 1 2-2 5-2 8-1v12c-3-1-6-1-8 1-2-2-5-2-8-1z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5v12" stroke="currentColor" stroke-width="1.4"/></svg>',
    pen: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17l2-6L15 1l4 4L9 15z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 11l4 4" stroke="currentColor" stroke-width="1.4"/></svg>',
    seal: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 14l-2 5 3-1 2 2 1-4M14 14l2 5-3-1-2 2-1-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>' };
  function reachable(id) {
    if (S.practice) return id === S.at;
    if (id === 'receipt') return true;
    const i = D.STEPS.findIndex((s) => s.id === id); return S.log[id].done || D.STEPS.slice(0, i).every((s) => S.log[s.id].done);
  }
  function renderChapters() {
    const ol = $('#chapters'); ol.innerHTML = '';
    $('#codeNote').innerHTML = S.code ? ` To continue on another computer, use your desk code <span class="code">${h.fmtCode(S.code)}</span>.` : '';
    if (!S.code || S.at === 'start') return;
    CH.forEach((c) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const done = c.id === 'receipt' ? D.STEPS.every((s) => S.log[s.id].done) : (S.practice ? false : S.log[c.id].done);
      b.innerHTML = GLYPH[c.glyph] || c.glyph; if (done) b.classList.add('done'); if (S.at === c.id) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', c.label + (done ? ', done' : ''));
      b.title = c.label;
      if (!reachable(c.id)) b.disabled = true; else b.addEventListener('click', () => go(c.id));
      li.appendChild(b); ol.appendChild(li);
    });
  }

  // ---------------- navigation ----------------
  function go(id) {
    animGen++; hurry = false; S.at = id; save(); renderChapters(); window.scrollTo(0, 0);
    if (id === 'start') return showTitle();
    if (IDS.includes(id)) return showTurn(id);
    if (id === 'story') return showChronicle();
    if (id === 'note') return showNote();
    return showReceipt();
  }
  const focusHead = () => { const hd = $('#main h1, #main h2'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); } };

  // ---------------- title ----------------
  const initialSvg = (letter, id) => `<svg class="initial" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="gl${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7E3A3"/><stop offset=".45" stop-color="#C79A3A"/><stop offset=".7" stop-color="#F0D489"/><stop offset="1" stop-color="#8C6A22"/></linearGradient></defs>
    <rect x="3" y="3" width="94" height="94" fill="#22408C" stroke="url(#gl${id})" stroke-width="5"/>
    <path d="M10 10h80v80h-80z" fill="none" stroke="#F0D489" stroke-width=".8" stroke-dasharray="2 3" opacity=".7"/>
    <g fill="#EDE0C4" opacity=".9"><circle cx="15" cy="15" r="2.4"/><circle cx="85" cy="15" r="2.4"/><circle cx="15" cy="85" r="2.4"/><circle cx="85" cy="85" r="2.4"/></g>
    <path d="M20 50c8-14 22-16 30-6M80 50c-8 14-22 16-30 6" fill="none" stroke="#A8301C" stroke-width="2.2" opacity=".85"/>
    <text x="50" y="76" text-anchor="middle" font-family="Texturina, Georgia, serif" font-weight="700" font-size="70" fill="url(#gl${id})" stroke="#5b3a12" stroke-width=".8">${letter}</text></svg>`;
  function showTitle() {
    S.at = 'start';
    const last = store.get(KEY + ':last'), saved = last ? store.get(KEY + ':' + D.seedFor(last)) : null;
    const f = IMG.folio;
    main.innerHTML = `<section class="title">
      <figure class="plate"><div class="frame"><img src="${f.src}" alt="${esc(f.alt)}" width="900" height="1445"></div><figcaption>${esc(f.cap)}</figcaption></figure>
      <div class="leaf">
        <p class="rubric">Florence, 1338</p>
        <h1>The Banker of Florence</h1>
        <p class="hook">Europe’s two biggest banks failed in the 1340s. Can yours survive?</p>
        <p class="initial-p">${initialSvg('F', 't')}${C.story.dek.replace(/^Florence/, 'lorence')}</p>
        <div class="actions">
          ${saved ? `<button class="btn" type="button" id="goBtn">Continue your bank</button>` : `<button class="btn" type="button" id="goBtn">Open the bank</button>`}
        </div>
        <p class="small-note">${esc(C.story.stepsLine)} Finish, and you download a receipt for your course.</p>
        ${saved ? `<p style="margin-top:.8rem">Welcome back. Your desk code is <b class="code" style="color:var(--ultramarine)">${h.fmtCode(last)}</b>.</p>` : ''}
        <details class="resume"><summary>Started on another computer?</summary>
          <form id="codeForm" novalidate><label for="dc">Your desk code</label>
          <input type="text" id="dc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" aria-describedby="dcHelp">
          <p class="wc" id="dcHelp">Your desk code is at the bottom of every page and on your receipt.</p>
          <p class="err" id="startErr" role="alert"></p>
          <button class="btn quiet" type="submit">Continue with this code</button></form></details>
      </div></section>`;
    // the dek's first letter is drawn as a gilded initial; restore it for screen readers
    $('.initial-p').insertAdjacentHTML('afterbegin', '<span class="sr-only">F</span>');
    $('#goBtn').addEventListener('click', () => { startFor(saved ? last : h.newCode()); go(S.at && S.at !== 'start' ? S.at : firstOpen()); });
    $('#codeForm').addEventListener('submit', (e) => {
      e.preventDefault(); const v = $('#dc').value;
      if (!h.validCode(v)) { $('#startErr').textContent = 'A desk code is 8 letters and numbers, like ABCD-2345. Check it against your receipt.'; $('#dc').focus(); return; }
      startFor(v); go(S.at && S.at !== 'start' ? S.at : firstOpen());
    });
    renderChapters();
  }

  // ---------------- the turn screen: leaf + stage + ledger ----------------
  let STAGE = null, STAGE_SKY = null;   // { svg, W, H, mode, places, layer... }
  // This play's year of Florence: how hard the run hits, what rival benches charge, how the exchange moves. Seeded by the
  // desk code (a replay gets its own), so a reload tells the same story and two friends get different ones.
  const yearFor = () => C.yearFrom(h.mulberry32(h.fnv1a(S.code + '|florence-year' + (S.practice ? '|P' + S.practice : ''))));
  const gameChoices = () => { const c = S.practice ? Object.assign({}, S.pchoices) : choices(); c._year = yearFor(); const r = S.practice ? S.prate : (S.log.t4 && S.log.t4.rate); if (r != null) c.rate = r; return c; };
  function showTurn(id) {
    const k = IDS.indexOf(id), ch = gameChoices(), sim = C.simulate(ch);
    if (sim.done < k) {   // an earlier turn is still open
      const open = IDS[sim.done];
      main.innerHTML = `<section class="leaf gate"><p class="rubric">Not yet</p><h2>${esc(T[id].title)}</h2><p>Your ledger here depends on what you did before. Play <b>${esc(T[open].title)}</b> first.</p><div class="actions"><button class="btn" type="button" id="gateGo">Go to ${esc(T[open].title)}</button></div></section>`;
      $('#gateGo').addEventListener('click', () => go(open)); focusHead(); return;
    }
    const done = ch[id] != null, img = IMG[TURN_IMG[id]];
    main.innerHTML = `${S.practice ? '<p class="banner"><b>Replay.</b> Not graded. Your receipt is unchanged.</p>' : ''}<section class="turn">
      <article class="leaf" aria-labelledby="turnTitle">
        <p class="rubric">${esc(T[id].place)} · Turn ${k + 1} of 5</p>
        <h2 id="turnTitle">${esc(T[id].title)}</h2>
        <figure class="mini"><div class="frame"><img src="${img.src}" alt="${esc(img.alt)}" loading="lazy"></div><figcaption>${esc(img.cap)}</figcaption></figure>
        <div class="story">${T[id].body}</div>
        <p class="act" id="act">${esc(T[id].act)}</p>
        <div class="outcome" id="outcome" hidden aria-live="polite"></div>
      </article>
      <div class="stagecol">
        <div class="stage" id="stage"></div>
        <div class="commit" id="commit"><div class="gauge" id="gauge" hidden></div><span class="what" id="what"></span><span class="actions" style="margin:0" id="commitBtns"></span></div>
      </div>
      <details class="ledger" id="ledger"${window.innerWidth >= 861 ? ' open' : ''}></details></section>`;
    focusHead();
    $('#stage').addEventListener('click', () => { if (!$('#commitBtns button')) hurry = true; });
    const before = sim.states[k];
    writeLedger(before, null, k, k ? 'Before this turn' : 'Your family’s gold');
    TURN_FN[id]({ id, k, ch, sim, before, done });
  }
  function setWhat(html) { $('#what').innerHTML = html; }
  // the bet, drawn: the gold in the vault against what depositors could ask for (turns 2 and 3), or against the line (turn 5)
  function gauge(gold, claim, claimLabel) {
    const g = $('#gauge'); if (!g) return; if (gold == null) { g.hidden = true; return; }
    const max = Math.max(gold, claim, 1), short = claim - gold;
    g.hidden = false; g.classList.toggle('short', short > 0);
    g.innerHTML = `<div class="gr"><span class="gl">In your vault</span><span class="bar"><i class="gold" style="width:${(100 * gold / max).toFixed(1)}%"></i></span><b>${fl(gold)}</b></div>
      <div class="gr"><span class="gl">${esc(claimLabel)}</span><span class="bar"><i class="claim" style="width:${(100 * claim / max).toFixed(1)}%"></i></span><b>${fl(claim)}</b></div>`;
    g.setAttribute('aria-label', `In your vault ${fl(gold)} florins; ${claimLabel} ${fl(claim)} florins.`);
  }
  let hurry = false;
  function setButtons(list) {
    const box = $('#commitBtns'); box.innerHTML = '';
    list.forEach((b) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'btn ' + (b.cls || ''); el.textContent = b.text; if (b.id) el.id = b.id; if (b.disabled) el.disabled = true; el.addEventListener('click', b.on); box.appendChild(el); });
    return box;
  }
  function showOutcome(id, k, html) {
    const o = $('#outcome'); o.hidden = false; o.innerHTML = html; $('#act').hidden = true; gauge(null);
    const next = k < 4 ? IDS[k + 1] : 'story';
    setWhat(S.practice && next === 'story' ? 'That replay is over.' : '');
    setButtons([{ text: k < 4 ? `Next: ${T[next].title}` : (S.practice ? 'See how this bank fared' : 'Read your bank’s chronicle'), id: 'nextBtn', on: () => go(next) }]);
    announce(o.textContent);
  }

  // the ledger, written in a book hand; figures that changed are written again by the pen
  let ledgerPrev = null;
  function writeLedger(st, prev, k, caption) {
    const rows = C.ledgerRows(st, prev, Math.max(k, 0));
    const box = $('#ledger'); if (!box) return;
    const old = ledgerPrev || {};
    const wRow = rows.find((r) => r.key === 'W');
    box.innerHTML = `<summary><h3>Ledger <span>${esc(caption)}${wRow ? ` · worth ${fl(wRow.now)}` : ''}</span></h3></summary><table><caption class="sr-only">Your ledger, in florins: ${esc(caption)}</caption><tbody>${rows.map((r) => {
      const changed = old[r.key] !== r.now;
      return `<tr class="${r.key === 'W' ? 'worth' : ''}${r.struck ? ' struck' : ''}" data-k="${r.key}"><th scope="row">${r.label}</th><td class="now"><span class="pen${changed ? ' writing' : ''}">${fl(r.now)}</span></td><td class="chg ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}">${r.change ? `<span class="pen writing">${r.change > 0 ? '+' : ''}${fl(r.change)}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table><p class="foot">Worth is everything the bank owns (coins and loans) minus everything it owes.</p>${st.failed ? '<p class="closed">Your bank has closed.</p>' : ''}`;
    const nw = {}; rows.forEach((r) => { nw[r.key] = r.now; }); ledgerPrev = nw;
    if (prev) Sound.play('quill');
  }
  function strikeKing() { const tr = $('#ledger tr[data-k="K"]'); if (tr) tr.classList.add('struck'); }

  // ---------------- the table (SVG) ----------------
  const GEO = {
    wide: { W: 1000, H: 660, street: 100, cloth: [20, 112, 960, 532],
      vault: { box: [56, 150, 420, 280], x0: 98, y0: 214, cols: 10, dx: 37.5, dy: 46, label: [266, 452] },
      merch: { box: [528, 150, 420, 168], x0: 560, y0: 202, cols: 10, dx: 38, dy: 30, label: [738, 340] },
      king: { box: [528, 362, 420, 168], x0: 560, y0: 414, cols: 10, dx: 38, dy: 30, label: [738, 552] },
      front: [500, 66], drop: [500, 300] },
    tall: { W: 600, H: 840, street: 104, cloth: [12, 116, 576, 712],
      vault: { box: [34, 150, 532, 262], x0: 70, y0: 212, cols: 10, dx: 51, dy: 44, label: [300, 440] },
      merch: { box: [34, 466, 256, 196], x0: 60, y0: 514, cols: 8, dx: 29, dy: 30, label: [162, 690] },
      king: { box: [310, 466, 256, 196], x0: 336, y0: 514, cols: 8, dx: 29, dy: 30, label: [438, 690] },
      front: [300, 70], drop: [300, 400] },
  };
  function shiftGeo(G, dy) {
    const c = JSON.parse(JSON.stringify(G)); c.H += dy; c.street += dy; c.cloth[1] += dy;
    ['vault', 'merch', 'king'].forEach((k) => { c[k].box[1] += dy; c[k].y0 += dy; c[k].label[1] += dy; }); c.drop[1] += dy; return c;
  }
  function stageMode() { const el = $('#stage'); const w = el ? el.getBoundingClientRect().width : 1000; return w < 640 ? 'tall' : 'wide'; }
  function defs(svg) {
    const d = E('defs', {}, svg);
    d.innerHTML = `
      <linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#8C6A22"/><stop offset=".25" stop-color="#E9C66E"/><stop offset=".55" stop-color="#C79A3A"/><stop offset=".8" stop-color="#F0D489"/><stop offset="1" stop-color="#7A5A1A"/></linearGradient>
      <pattern id="ridges" patternUnits="userSpaceOnUse" width="6" height="2.6"><rect width="6" height="2.6" fill="none"/><line x1="0" y1="2.3" x2="6" y2="2.3" stroke="#6B4E14" stroke-width=".7" opacity=".7"/></pattern>
      <pattern id="face" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="img/florin.png" width="1" height="1" preserveAspectRatio="none"/></pattern>
      <pattern id="silver" patternContentUnits="objectBoundingBox" width="1" height="1"><rect width="1" height="1" fill="#C9CCD1"/><circle cx=".5" cy=".5" r=".3" fill="none" stroke="#8A8F98" stroke-width=".06"/><path d="M.5 .25v.5M.25 .5h.5" stroke="#8A8F98" stroke-width=".05"/></pattern>
      <pattern id="lozenge" patternUnits="userSpaceOnUse" width="36" height="36"><rect width="36" height="36" fill="#9E2B18"/><path d="M18 2L34 18L18 34L2 18Z" fill="none" stroke="#C9452C" stroke-width="1.4"/><path d="M18 10L26 18L18 26L10 18Z" fill="#8A2414"/><circle cx="18" cy="18" r="2" fill="#E3B65A" opacity=".55"/></pattern>
      <pattern id="border" patternUnits="userSpaceOnUse" width="28" height="28"><rect width="28" height="28" fill="#22408C"/><path d="M0 14L14 0L28 14L14 28Z" fill="#3D7563"/><path d="M14 6L22 14L14 22L6 14Z" fill="#EDE0C4" opacity=".85"/><circle cx="14" cy="14" r="2.5" fill="#A8301C"/></pattern>
      <pattern id="cobbles" patternUnits="userSpaceOnUse" width="44" height="30"><rect width="44" height="30" fill="#6E6152"/><path d="M2 2h18v12H2zM24 2h18v12H24zM-9 17h18v12H-9zM13 17h18v12H13zM35 17h18v12H35z" fill="#857867" stroke="#5A4E41" stroke-width="1.2" rx="3"/></pattern>
      <pattern id="wood" patternUnits="userSpaceOnUse" width="200" height="16"><rect width="200" height="16" fill="#6B4425"/><path d="M0 4c40 2 80-2 120 1s60 1 80-1M0 11c50-2 90 2 140 0s40-1 60 1" stroke="#553519" stroke-width="1.2" fill="none"/></pattern>
      <radialGradient id="glow"><stop offset="0" stop-color="#F0D489" stop-opacity=".55"/><stop offset="1" stop-color="#F0D489" stop-opacity="0"/></radialGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>`;
  }
  function buildTable(opts) {
    opts = opts || {};
    const mode = stageMode(), G = shiftGeo(GEO[mode], opts.street != null ? opts.street : (mode === 'tall' ? 60 : 70)), st = $('#stage');
    st.innerHTML = '';
    const svg = E('svg', { viewBox: `0 0 ${G.W} ${G.H}`, role: 'img', 'aria-label': opts.label || 'Your counting table, seen from above.' }, st);
    defs(svg);
    // the street in front of your bench, seen straight on: Lorenzetti's Siena behind, paving underfoot, the counter's edge
    const sky = E('g', {}, svg);
    E('rect', { x: 0, y: 0, width: G.W, height: G.street, fill: '#2C3A63' }, sky);
    E('image', { href: 'img/lorenzetti-street.jpg', x: 0, y: 0, width: G.W, height: G.street - 30, preserveAspectRatio: 'xMidYMax slice' }, sky);
    const sg = E('linearGradient', { id: 'streetShade', x1: 0, y1: 0, x2: 0, y2: 1 }, svg.querySelector('defs'));
    E('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.05 }, sg); E('stop', { offset: 0.7, 'stop-color': '#000', 'stop-opacity': 0.12 }, sg); E('stop', { offset: 1, 'stop-color': '#1A0F08', 'stop-opacity': 0.55 }, sg);
    E('rect', { x: 0, y: 0, width: G.W, height: G.street - 30, fill: 'url(#streetShade)' }, sky);
    E('rect', { x: 0, y: G.street - 34, width: G.W, height: 34, fill: '#9C8A6E' }, sky);
    for (let x = -20; x < G.W; x += 46) E('path', { d: `M${x} ${G.street - 34}l-10 34`, stroke: '#7E6D55', 'stroke-width': 1.2 }, sky);
    E('path', { d: `M0 ${G.street - 18}H${G.W}`, stroke: '#7E6D55', 'stroke-width': 1.2 }, sky);
    E('rect', { x: 0, y: G.street - 6, width: G.W, height: 12, fill: '#4A2C18', stroke: '#24140A' }, sky);
    STAGE_SKY = sky;
    // the table and its counting cloth
    E('rect', { x: 0, y: G.street + 6, width: G.W, height: G.H - G.street - 6, fill: 'url(#wood)' }, svg);
    const [cx, cy, cw, chh] = G.cloth;
    E('rect', { x: cx, y: cy, width: cw, height: chh, fill: 'url(#border)', rx: 2 }, svg);
    E('rect', { x: cx + 14, y: cy + 14, width: cw - 28, height: chh - 28, fill: 'url(#lozenge)' }, svg);
    E('rect', { x: cx + 14, y: cy + 14, width: cw - 28, height: chh - 28, fill: 'none', stroke: '#E3B65A', 'stroke-width': 1.5, opacity: 0.7 }, svg);
    const layers = { places: E('g', {}, svg), stacks: E('g', {}, svg), people: E('g', {}, svg), fx: E('g', {}, svg), top: E('g', {}, svg) };
    const places = {};
    const label = (txt, x, y) => E('text', { x, y, 'text-anchor': 'middle', 'font-family': 'Alegreya, Georgia, serif', 'font-size': mode === 'tall' ? 22 : 20, 'font-style': 'italic', fill: '#F4E7C8' }, layers.places).textContent = txt;
    // the vault: an iron-bound chest, open
    const vb = G.vault.box;
    E('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], rx: 6, fill: '#3B2414', stroke: '#1E120A', 'stroke-width': 3 }, layers.places);
    E('rect', { x: vb[0] + 12, y: vb[1] + 12, width: vb[2] - 24, height: vb[3] - 24, rx: 3, fill: '#24160C' }, layers.places);
    [0.18, 0.5, 0.82].forEach((f) => { E('rect', { x: vb[0] + vb[2] * f - 7, y: vb[1] - 3, width: 14, height: 15, fill: '#6E6A62', stroke: '#1E120A' }, layers.places); E('rect', { x: vb[0] + vb[2] * f - 7, y: vb[1] + vb[3] - 12, width: 14, height: 15, fill: '#6E6A62', stroke: '#1E120A' }, layers.places); });
    places.vault = { G: G.vault, stacks: [] }; label('Your vault', ...G.vault.label);
    if (!opts.noMerch) {
      const mb = G.merch.box;
      E('rect', { x: mb[0], y: mb[1], width: mb[2], height: mb[3], rx: 8, fill: '#2F5E4F', stroke: '#1F4036', 'stroke-width': 3 }, layers.places);
      E('rect', { x: mb[0] + 8, y: mb[1] + 8, width: mb[2] - 16, height: mb[3] - 16, rx: 5, fill: 'none', stroke: '#EDE0C4', 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.5 }, layers.places);
      places.merch = { G: G.merch, stacks: [] }; label('Loans to merchants', ...G.merch.label);
    }
    if (!opts.noKing) {
      const kb = G.king.box;
      E('rect', { x: kb[0], y: kb[1], width: kb[2], height: kb[3], rx: 6, fill: '#1D2F66', stroke: '#101C40', 'stroke-width': 3 }, layers.places);
      // three gold lions, drawn as heraldic marks (England's arms), down the chest's side
      const sx = kb[0] + kb[2] - 44, sy = kb[1] + 18, sh = E('g', { transform: `translate(${sx} ${sy})` }, layers.places);
      E('path', { d: 'M0 0h34v26c0 14-8 22-17 26C8 48 0 40 0 26z', fill: '#A8301C', stroke: '#E9C66E', 'stroke-width': 2 }, sh);
      for (let i = 0; i < 3; i++) E('path', { d: `M7 ${9 + i * 12}h15l4-3 2 3-3 3h-3l-2 3h-3l1-3h-7l-2 3h-3z`, fill: '#E9C66E' }, sh);
      places.king = { G: G.king, stacks: [] }; label('Loan to King Edward', ...G.king.label);
    }
    STAGE = { svg, mode, G, layers, places, W: G.W, H: G.H };
    return STAGE;
  }
  // a stack of florins, drawn at (0,0) = the middle of its bottom coin; ten coins to the 100
  function drawStack(g, amount, kind) {
    g.innerHTML = '';
    const n = Math.max(1, Math.ceil(amount / 10 - 1e-9)), th = 2.6, hgt = n * th, rx = 15, ry = 10;
    E('ellipse', { cx: 2.5, cy: 3, rx: rx + 1, ry: ry + 0.5, fill: '#000', opacity: 0.38 }, g);
    E('path', { d: `M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0L${rx} ${-hgt}A${rx} ${ry} 0 0 1 ${-rx} ${-hgt}Z`, fill: kind === 'silver' ? '#9EA3AC' : 'url(#gold)' }, g);
    E('path', { d: `M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0L${rx} ${-hgt}A${rx} ${ry} 0 0 1 ${-rx} ${-hgt}Z`, fill: 'url(#ridges)' }, g);
    E('ellipse', { cx: 0, cy: -hgt, rx, ry, fill: kind === 'silver' ? 'url(#silver)' : 'url(#face)', stroke: kind === 'silver' ? '#6A6F78' : '#7A5A1A', 'stroke-width': 0.9 }, g);
  }
  function newStack(amount, x, y, kind) {
    const g = E('g', { class: 'stack' }, STAGE.layers.stacks); const s = { g, amount, x, y, kind: kind || 'gold' };
    drawStack(g, amount, s.kind); place(s, x, y); return s;
  }
  function place(s, x, y, sc) { s.x = x; s.y = y; s.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${sc && sc !== 1 ? ` scale(${sc.toFixed(3)})` : ''}`); }
  function slot(P, i) { const G = P.G; return [G.x0 + (i % G.cols) * G.dx, G.y0 + Math.floor(i / G.cols) * G.dy]; }
  function zsort() { const L = STAGE.layers.stacks; [...L.children].sort((a, b) => (a.__y || 0) - (b.__y || 0)).forEach((c) => L.appendChild(c)); }
  function fill(name, amount) {   // put `amount` florins into a place as full stacks and one short one, no motion
    const P = STAGE.places[name]; P.stacks.forEach((s) => s.g.remove()); P.stacks = [];
    // the short stack goes first, so gold pulled from the end of a place comes off in full stacks
    const part = amount % 100, sizes = []; if (part > 0.5) sizes.push(part); for (let k = 0; k < Math.floor(amount / 100 + 1e-9); k++) sizes.push(100);
    sizes.forEach((a, i) => { const [x, y] = slot(P, i); const s = newStack(a, x, y); s.g.__y = y; P.stacks.push(s); });
    zsort();
  }
  const total = (name) => STAGE.places[name].stacks.reduce((a, s) => a + s.amount, 0);
  // fly one stack along an arc to (x, y); resolves on landing
  function fly(s, x, y, ms, lift) {
    const x0 = s.x, y0 = s.y, L = lift == null ? 60 : lift; STAGE.layers.top.appendChild(s.g);
    return tween(ms, (t) => { place(s, lerp(x0, x, t), lerp(y0, y, t) - Math.sin(Math.PI * t) * L, 1 + Math.sin(Math.PI * t) * 0.18); }).then(() => { place(s, x, y); s.g.__y = y; if (s.g.parentNode === STAGE.layers.top) STAGE.layers.stacks.appendChild(s.g); Sound.play('coin'); });
  }
  // take `amount` from the end of a place (splitting the last stack if needed); returns the stacks taken, not yet moved
  function take(name, amount) {
    const P = STAGE.places[name], out = []; let left = amount;
    while (left > 0.5 && P.stacks.length) {
      const s = P.stacks[P.stacks.length - 1];
      if (s.amount <= left + 0.5) { P.stacks.pop(); out.push(s); left -= s.amount; }
      else { s.amount -= left; drawStack(s.g, s.amount, s.kind); const n = newStack(left, s.x, s.y, s.kind); out.push(n); left = 0; }
    }
    return out;
  }
  async function transfer(amount, from, to, opts) {
    opts = opts || {}; const stacks = take(from, amount), P = STAGE.places[to]; const jobs = [];
    stacks.forEach((s, j) => { const [x, y] = slot(P, P.stacks.length); P.stacks.push(s); jobs.push(wait((opts.stagger == null ? 40 : opts.stagger) * j).then(() => fly(s, x, y, opts.ms || 420, opts.lift))); });
    await Promise.all(jobs); zsort();
  }
  async function spawnInto(amount, to, from, opts) {   // new gold arriving (deposits, gifts, earnings), from a point
    opts = opts || {}; const P = STAGE.places[to], jobs = []; let left = amount, j = 0;
    while (left > 0.5) { const a = Math.min(100, left); const s = newStack(a, from[0], from[1]); const [x, y] = slot(P, P.stacks.length); P.stacks.push(s); jobs.push(wait((opts.stagger || 45) * j).then(() => fly(s, x, y, opts.ms || 520, 70))); left -= a; j++; }
    await Promise.all(jobs); zsort();
  }
  function settle(name, amount) { fill(name, amount); }

  // people in the street, standing, in the manner of the miniatures: long robes, hoods, caps, veils and hats; no faces drawn.
  // (x, y) is where the feet are. kinds: 'hood', 'cap', 'veil', 'hat'. A depositor holds a claim for 200 florins.
  const ROBES = ['#A8301C', '#22408C', '#3D7563', '#B8862E', '#7A2E3A', '#8C8478', '#5B4A8A', '#C26A2E'];
  const KINDS = ['hood', 'cap', 'veil', 'hat'];
  const FLESH = ['#E6C29A', '#D9AE82', '#C99A6E', '#EBCDA8'];
  function person(x, y, i, opts) {
    opts = typeof opts === 'string' ? { hold: opts } : (opts || {});
    const g = E('g', { class: 'person' }, STAGE.layers.people), robe = opts.robe || ROBES[i % ROBES.length], hoodC = ROBES[(i * 3 + 2) % ROBES.length];
    const kind = opts.kind || KINDS[(i * 7 + 1) % KINDS.length], sc = opts.scale || STAGE.personScale || 1;
    const body = E('g', {}, g), fig = E('g', {}, body);
    E('ellipse', { cx: 0, cy: 0, rx: 17, ry: 4, fill: '#000', opacity: 0.3 }, fig);
    const back = E('g', {}, fig);   // the far arm
    E('path', { d: 'M-9 -56C-16 -46 -18 -38 -16 -30', fill: 'none', stroke: robe, 'stroke-width': 7, 'stroke-linecap': 'round' }, back);
    E('path', { d: 'M-12 -60C-16 -40 -20 -16 -21 0L21 0C20 -16 16 -40 12 -60C8 -66 -8 -66 -12 -60Z', fill: robe, stroke: '#2A1C14', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, fig);
    E('path', { d: 'M-15 -34H15', stroke: '#2A1C14', 'stroke-width': 1.2, opacity: 0.55 }, fig);
    E('path', { d: 'M-21 0C-14 3 14 3 21 0', fill: 'none', stroke: '#2A1C14', 'stroke-width': 1.5 }, fig);
    const arm = E('g', {}, fig);
    const armDown = () => { arm.innerHTML = ''; E('path', { d: 'M9 -56C17 -48 20 -40 19 -32', fill: 'none', stroke: robe, 'stroke-width': 7.5, 'stroke-linecap': 'round' }, arm); E('circle', { cx: 19, cy: -30, r: 3.3, fill: FLESH[i % 4], stroke: '#2A1C14', 'stroke-width': 1 }, arm); };
    armDown();
    const head = E('g', {}, fig), skin = FLESH[i % 4];
    if (kind === 'veil') { E('path', { d: 'M-13 -64C-14 -88 14 -88 13 -64L13 -54C6 -50 -6 -50 -13 -54Z', fill: '#F2EEE4', stroke: '#2A1C14', 'stroke-width': 1.3 }, head); E('circle', { cx: 0, cy: -71, r: 7.5, fill: skin, stroke: '#2A1C14', 'stroke-width': 1.1 }, head); }
    else {
      E('circle', { cx: 0, cy: -71, r: 9.5, fill: skin, stroke: '#2A1C14', 'stroke-width': 1.3 }, head);
      if (kind === 'hood') { E('path', { d: 'M-12 -66C-15 -90 15 -90 12 -66L9 -64C9 -82 -9 -82 -9 -64Z', fill: hoodC, stroke: '#2A1C14', 'stroke-width': 1.3 }, head); E('path', { d: 'M10 -80C22 -76 25 -62 21 -52', fill: 'none', stroke: hoodC, 'stroke-width': 4, 'stroke-linecap': 'round' }, head); }
      if (kind === 'cap') E('path', { d: 'M-11 -76C-12 -86 12 -86 11 -76C6 -78 -6 -78 -11 -76Z', fill: hoodC, stroke: '#2A1C14', 'stroke-width': 1.3 }, head);
      if (kind === 'hat') { E('ellipse', { cx: 0, cy: -78, rx: 16, ry: 3.5, fill: hoodC, stroke: '#2A1C14', 'stroke-width': 1.2 }, head); E('path', { d: 'M-8 -78C-8 -90 8 -90 8 -78Z', fill: hoodC, stroke: '#2A1C14', 'stroke-width': 1.2 }, head); }
    }
    const hold = E('g', {}, fig);
    const setHold = (what) => { hold.innerHTML = ''; if (what === 'chit') { E('rect', { x: 13, y: -43, width: 18, height: 12, rx: 1, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 1 }, hold); const t = E('text', { x: 22, y: -34, 'text-anchor': 'middle', 'font-size': 8.5, 'font-family': 'Alegreya, serif', fill: '#2A1C14', 'font-weight': 700 }, hold); t.textContent = '200'; }
      if (what === 'purse') { E('path', { d: 'M14 -36c-3 6 0 12 6 12s9-6 6-12z', fill: '#7A4A22', stroke: '#2A1C14', 'stroke-width': 1 }, hold); E('circle', { cx: 20, cy: -30, r: 2.2, fill: '#E9C66E' }, hold); }
      if (what === 'letter') { E('rect', { x: 12, y: -44, width: 20, height: 14, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 1 }, hold); E('circle', { cx: 22, cy: -35, r: 3, fill: '#A8301C' }, hold); } };
    setHold(opts.hold);
    const p = { g, body, fig, x, y, sc, face: 1, setHold,
      angry() { arm.innerHTML = ''; E('path', { d: 'M9 -56C15 -66 17 -76 15 -88', fill: 'none', stroke: robe, 'stroke-width': 7.5, 'stroke-linecap': 'round' }, arm); E('circle', { cx: 15, cy: -90, r: 3.3, fill: skin, stroke: '#2A1C14', 'stroke-width': 1 }, arm); back.innerHTML = ''; E('path', { d: 'M-9 -56C-15 -66 -17 -76 -15 -88', fill: 'none', stroke: robe, 'stroke-width': 7, 'stroke-linecap': 'round' }, back); hold.innerHTML = ''; },
      turn(dir) { this.face = dir; this.draw(); },
      draw() { body.setAttribute('transform', `scale(${(this.face * this.sc).toFixed(3)} ${this.sc.toFixed(3)})`); } };
    p.draw(); move(p, x, y); return p;
  }
  function move(p, x, y) { p.x = x; p.y = y; p.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); p.g.__y = y; }
  // walking: a small bob in step; people face the way they walk
  const walk = (p, x, y, ms) => { const x0 = p.x, y0 = p.y; if (Math.abs(x - x0) > 4) p.turn(x < x0 ? -1 : 1); return tween(ms, (t) => { move(p, lerp(x0, x, t), lerp(y0, y, t)); p.fig.setAttribute('transform', `translate(0 ${(-Math.abs(Math.sin(t * Math.PI * 6)) * 3).toFixed(1)})`); }, (q) => q).then(() => { p.fig.removeAttribute('transform'); }); };
  function depthSort() { const L = STAGE.layers.people; [...L.children].sort((a, b) => (a.__y || 0) - (b.__y || 0)).forEach((c) => L.appendChild(c)); }

  // the pull: drag gold from one place toward another; the amount snaps to the turn's options as you drag
  function pull(opts) {
    // opts: { from, to, options: [{ amount, label }], index, onChange(i) }
    const svg = STAGE.svg; let idx = opts.index || 0, busy = Promise.resolve(), moved = 0;
    const P = STAGE.places, center = (nm) => { const b = P[nm].G.box; return [b[0] + b[2] / 2, b[1] + b[3] / 2]; };
    const a = center(opts.from), b = center(opts.to), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const hit = E('rect', { x: P[opts.from].G.box[0], y: P[opts.from].G.box[1], width: P[opts.from].G.box[2], height: P[opts.from].G.box[3], fill: 'transparent', style: 'cursor:grab' }, STAGE.layers.fx);
    const guide = E('path', { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, stroke: '#F0D489', 'stroke-width': 3, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round', fill: 'none', opacity: 0, 'pointer-events': 'none' }, STAGE.layers.fx);
    const tagG = E('g', { opacity: 0, 'pointer-events': 'none' }, STAGE.layers.top); const tagR = E('rect', { x: -70, y: -46, width: 140, height: 32, rx: 4, fill: '#EDE0C4', stroke: '#2A1C14' }, tagG); void tagR;
    const tagT = E('text', { x: 0, y: -24, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 19, 'font-weight': 700, fill: '#2A1C14' }, tagG);
    const pt = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * STAGE.W / r.width, (e.clientY - r.top) * STAGE.H / r.height]; };
    async function setIndex(i) {
      i = Math.max(0, Math.min(opts.options.length - 1, i)); if (i === idx) return; idx = i;
      const want = opts.options[i].amount;
      busy = busy.then(async () => { const d = want - moved; if (d > 0) await transfer(d, opts.from, opts.to, { ms: 260, stagger: 12, lift: 30 }); else if (d < 0) await transfer(-d, opts.to, opts.from, { ms: 260, stagger: 12, lift: 30 }); moved = want; });
      opts.onChange(i);
    }
    let drag = null;
    hit.addEventListener('pointerdown', (e) => { drag = pt(e); hit.setPointerCapture(e.pointerId); hit.style.cursor = 'grabbing'; guide.setAttribute('opacity', 0.8); tagG.setAttribute('opacity', 1); e.preventDefault(); });
    hit.addEventListener('pointermove', (e) => {
      if (!drag) return; const p = pt(e);
      const f = ((p[0] - drag[0]) * (b[0] - a[0]) + (p[1] - drag[1]) * (b[1] - a[1])) / (len * len);
      const n = opts.options.length, i = Math.max(0, Math.min(n - 1, Math.round(f * (n - 1) * 1.15)));
      tagG.setAttribute('transform', `translate(${p[0].toFixed(0)} ${p[1].toFixed(0)})`); tagT.textContent = opts.options[i].short;
      setIndex(i);
    });
    const end = () => { drag = null; hit.style.cursor = 'grab'; guide.setAttribute('opacity', 0); tagG.setAttribute('opacity', 0); };
    hit.addEventListener('pointerup', end); hit.addEventListener('pointercancel', end);
    return { setIndex, get index() { return idx; }, settled: () => busy, remove: () => { hit.remove(); guide.remove(); tagG.remove(); } };
  }
  // the option chips under the stage: the menu, the tap path and the keyboard path for every drag
  // on a phone, bring the table into view when it is the student's move
  function toStage() { const st = $('#stage'); if (st && window.innerWidth < 861) { const top = st.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' }); } }
  function chips(list, current, onPick, label) {
    setTimeout(toStage, 60);
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.setAttribute('role', 'group'); ov.setAttribute('aria-label', label);
    list.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.innerHTML = (c.icon || '') + esc(c.text); b.setAttribute('aria-pressed', String(i === current)); b.addEventListener('click', () => onPick(i)); ov.appendChild(b); });
    $('#stage').appendChild(ov);
    return { set(i) { $$('.chip', ov).forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); }, el: ov };
  }

  // ---------------- turn 1: the chart ----------------
  // A sea chart drawn in the manner of the 1339 Dulcert chart (rhumb lines, wind roses, the Alps as a brown ridge) on true
  // coastlines from Natural Earth, so Florence and Bruges sit where they are. Coordinates: x = (lon + 10) * cos 47° * 50, y = (55 - lat) * 50.
  const geo = (lon, lat) => [(lon + 10) * Math.cos(47 * Math.PI / 180) * 50, (55 - lat) * 50];
  const MAP = {
    view: { wide: [190, 120, 900, 576], tall: [330, 126, 520, 676] },
    florence: geo(11.2558, 43.7696), bruges: geo(3.2247, 51.2093),
    road: [geo(11.2558, 43.7696), geo(11.34, 44.49), geo(9.19, 45.46), geo(8.57, 46.56), geo(7.59, 47.56), geo(6.18, 48.69), geo(4.03, 49.26), geo(3.2247, 51.2093)],
    alps: [[6.9, 44.2], [7.0, 45.2], [7.4, 45.9], [8.2, 46.3], [9.2, 46.45], [10.3, 46.55], [11.5, 46.75], [12.8, 47.0], [14.1, 47.15], [15.4, 47.3]].map(([a, b]) => geo(a, b)),
    roses: [geo(-3.5, 46.3), geo(9.6, 41.6), geo(2.2, 53.0)],
  };
  // a smooth path through points (Catmull-Rom as cubic Béziers)
  function smooth(pts) { let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`; for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; } return d; }
  function drawChart(st) {
    const mode = stageMode(), vb = MAP.view[mode]; st.innerHTML = '';
    const svg = E('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': 'A sea chart of western Europe. Florence is in Italy at the bottom right; Bruges is in Flanders at the top left; the road between them crosses the Alps.' }, st);
    defs(svg);
    const M = window.FLORENCE_MAP, [x0, y0, w, hh] = vb;
    E('rect', { x: x0, y: y0, width: w, height: hh, fill: '#C9D3C2' }, svg);
    E('rect', { x: x0, y: y0, width: w, height: hh, fill: 'url(#vellumN)' }, svg);
    // rhumb lines from three wind roses, as on the 1339 chart
    const rh = E('g', { opacity: 0.55 }, svg);
    MAP.roses.forEach(([cx, cy], r) => { for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; E('line', { x1: cx, y1: cy, x2: cx + Math.cos(a) * 1400, y2: cy + Math.sin(a) * 1400, stroke: i % 4 === 0 ? '#2A1C14' : i % 2 ? '#3D7563' : '#A8301C', 'stroke-width': i % 4 === 0 ? 0.9 : 0.6 }, rh); } void r; });
    E('path', { d: M.land, fill: '#E8D8B2', stroke: '#4A3626', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, svg);
    E('path', { d: M.land, fill: 'url(#vellumN)' }, svg);
    E('path', { d: M.lakes, fill: '#B9C7BE', stroke: '#5A4636', 'stroke-width': 0.8 }, svg);
    M.rivers.forEach((d) => E('path', { d, fill: 'none', stroke: '#4E7F8E', 'stroke-width': 1.3, opacity: 0.8 }, svg));
    // wind roses
    MAP.roses.forEach(([cx, cy]) => { const g = E('g', { transform: `translate(${cx} ${cy})` }, svg); E('circle', { r: 20, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 1.2 }, g); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, l = i % 2 ? 15 : 26; E('path', { d: `M0 0L${(Math.cos(a - 0.25) * 6).toFixed(1)} ${(Math.sin(a - 0.25) * 6).toFixed(1)}L${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}Z`, fill: i % 2 ? '#3D7563' : '#A8301C' }, g); } E('circle', { r: 3, fill: '#C79A3A' }, g); });
    // the Alps: a brown serrated ridge, the way the chart makers drew mountains
    const al = E('g', {}, svg); for (let i = 0; i < MAP.alps.length - 1; i++) { const [a, b] = [MAP.alps[i], MAP.alps[i + 1]]; for (let k = 0; k < 3; k++) { const x = lerp(a[0], b[0], k / 3), y = lerp(a[1], b[1], k / 3); E('path', { d: `M${(x - 9).toFixed(1)} ${(y + 6).toFixed(1)}L${x.toFixed(1)} ${(y - 12).toFixed(1)}L${(x + 9).toFixed(1)} ${(y + 6).toFixed(1)}Z`, fill: '#7A4A22', stroke: '#2A1C14', 'stroke-width': 1 }, al); } }
    E('path', { d: smooth(MAP.road), fill: 'none', stroke: '#EDE0C4', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.8 }, svg);
    const road = E('path', { d: smooth(MAP.road), fill: 'none', stroke: '#A8301C', 'stroke-width': 3.6, 'stroke-dasharray': '9 7', 'stroke-linecap': 'round' }, svg);
    const lab = (x, y, t, size, col, anchor) => { const tx = E('text', { x, y, 'text-anchor': anchor || 'middle', 'font-family': 'Texturina, Georgia, serif', 'font-weight': 600, 'font-size': size || 28, fill: col || '#A8301C', stroke: '#EDE0C4', 'stroke-width': 5, 'paint-order': 'stroke' }, svg); tx.textContent = t; return tx; };
    const city = (p) => { E('circle', { cx: p[0], cy: p[1], r: 10, fill: 'url(#gold)', stroke: '#2A1C14', 'stroke-width': 2.4 }, svg); };
    city(MAP.florence); city(MAP.bruges);
    lab(MAP.florence[0] + 16, MAP.florence[1] + 36, 'Florence', 28, '#A8301C', 'start'); lab(MAP.bruges[0] - 14, MAP.bruges[1] - 18, 'Bruges', 28, '#A8301C', 'end');
    lab(geo(12.6, 47.7)[0], geo(12.6, 47.7)[1], 'the Alps', 22, '#2A1C14');
    // robbers wait in the pass
    const robbers = E('g', {}, svg), rp = geo(8.1, 46.25);
    [[0, 0], [22, -12]].forEach(([dx, dy]) => { const x = rp[0] + dx - 30, y = rp[1] + dy; E('circle', { cx: x, cy: y - 15, r: 5.5, fill: '#2A1C14' }, robbers); E('path', { d: `M${x - 8} ${y + 6}L${x} ${y - 9}L${x + 8} ${y + 6}Z`, fill: '#2A1C14' }, robbers); E('path', { d: `M${x + 7} ${y - 6}l11 -12`, stroke: '#2A1C14', 'stroke-width': 2.2 }, robbers); });
    lab(rp[0] - 34, rp[1] + 30, 'robbers', 18, '#2A1C14');
    const fx = E('g', {}, svg);
    return { svg, road, robbers, fx, vb };
  }
  function t1(ctx) {
    const st = $('#stage'), Mp = drawChart(st), svg = Mp.svg;
    // vellum noise for the chart
    const dd = svg.querySelector('defs'); dd.insertAdjacentHTML('beforeend', '<filter id="vn"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2"/><feColorMatrix values="0 0 0 0 .4 0 0 0 0 .3 0 0 0 0 .15 0 0 0 .12 0"/></filter><pattern id="vellumN" patternUnits="userSpaceOnUse" width="300" height="300"><rect width="300" height="300" filter="url(#vn)"/></pattern>');
    if (ctx.done) { finishT1(ctx, Mp, true); return; }
    // the merchant's purse, at Florence
    const purse = E('g', { style: 'cursor:grab', tabindex: -1 }, svg);
    E('ellipse', { cx: 0, cy: 8, rx: 28, ry: 9, fill: '#000', opacity: 0.25 }, purse);
    E('path', { d: 'M-24 0c-4-20 10-34 24-34s28 14 24 34c-2 12-46 12-48 0z', fill: '#7A4A22', stroke: '#2A1C14', 'stroke-width': 2.5 }, purse);
    E('path', { d: 'M-12-32c6 6 18 6 24 0', stroke: '#E9C66E', 'stroke-width': 3, fill: 'none' }, purse);
    const pl = E('text', { x: 0, y: -4, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 15, 'font-weight': 700, fill: '#F4E7C8' }, purse); pl.textContent = '1,000';
    const home = [MAP.florence[0] - 40, MAP.florence[1] - 4];
    const ring = E('circle', { cx: 0, cy: -12, r: 38, fill: 'none', stroke: '#F0D489', 'stroke-width': 3, 'stroke-dasharray': '6 6' }, purse); purse.insertBefore(ring, purse.firstChild);
    if (!reduced()) ring.animate([{ transform: 'rotate(0deg)', opacity: 1 }, { transform: 'rotate(90deg)', opacity: 0.35 }, { transform: 'rotate(180deg)', opacity: 1 }], { duration: 2400, iterations: Infinity });
    ring.style.transformOrigin = '0px -12px';
    const setPurse = (x, y) => purse.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); setPurse(...home);
    let pick = null;
    const order = ['bill', 'ship', 'refuse'];
    const icons = { bill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z" fill="#EDE0C4" stroke="#2A1C14" stroke-width="1.5"/><path d="M4 5l8 7 8-7" fill="none" stroke="#2A1C14" stroke-width="1.5"/><circle cx="12" cy="15" r="3" fill="#A8301C"/></svg>',
      ship: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c0-4 3-6 7-6h5l2-3 2 1-1 3c2 1 3 3 3 5v2h-2v4h-2v-4H8v4H6v-4H3z" fill="#7A5A3A" stroke="#2A1C14" stroke-width="1.2"/></svg>',
      refuse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z" fill="#6B4425" stroke="#2A1C14" stroke-width="1.5"/><circle cx="15" cy="12" r="1.3" fill="#E9C66E"/></svg>' };
    const ch = chips(order.map((k) => ({ text: T.t1.tag[k], icon: icons[k] })), -1, (i) => choose(order[i]), 'Ways to move the money');
    const commitBtns = () => setButtons([{ text: pick ? { bill: 'Write the bill', ship: 'Send the mules', refuse: 'Send him away' }[pick] : 'Choose a way first', disabled: !pick, id: 'commitBtn', on: () => { commitChoice('t1', pick); ch.el.remove(); purse.remove(); finishT1(ctx, Mp, false); } }]);
    function choose(k) { pick = k; ch.set(order.indexOf(k)); setWhat(`<b>${esc(T.t1.opts[k])}.</b>`); commitBtns(); }
    setWhat('Three ways are open to you.'); commitBtns();
    // drag the purse onto one of the three ways
    const pt = (e) => { const r = svg.getBoundingClientRect(); return [Mp.vb[0] + (e.clientX - r.left) * Mp.vb[2] / r.width, Mp.vb[1] + (e.clientY - r.top) * Mp.vb[3] / r.height]; };
    let drag = false; const over = (e) => { purse.style.visibility = 'hidden'; const el = document.elementFromPoint(e.clientX, e.clientY); purse.style.visibility = ''; return el && el.closest && el.closest('.chip'); };
    purse.addEventListener('pointerdown', (e) => { drag = true; purse.setPointerCapture(e.pointerId); purse.style.cursor = 'grabbing'; e.preventDefault(); });
    purse.addEventListener('pointermove', (e) => { if (!drag) return; setPurse(...pt(e)); const c = over(e); $$('.chip', ch.el).forEach((b) => b.classList.toggle('hot', b === c)); });
    const drop = (e) => { if (!drag) return; drag = false; purse.style.cursor = 'grab'; const c = over(e); $$('.chip', ch.el).forEach((b) => b.classList.remove('hot')); if (c) choose(order[[...ch.el.children].indexOf(c)]); tween(250, (f) => { const p = pt(e); setPurse(lerp(p[0], home[0], f), lerp(p[1], home[1], f)); }); };
    purse.addEventListener('pointerup', drop); purse.addEventListener('pointercancel', drop);
  }
  async function finishT1(ctx, Mp, instant) {
    const sim = C.simulate(gameChoices()), st = sim.states[1], c = st.ev.choice, fx = Mp.fx, road = Mp.road;
    const along = (path, f) => { const q = path.getPointAtLength(f * path.getTotalLength()); return [q.x, q.y]; };
    const tag = (x, y, txt, col) => { const g = E('g', {}, fx); const w = txt.length * 9 + 26; E('rect', { x: -w / 2, y: -18, width: w, height: 30, rx: 4, fill: '#EDE0C4', stroke: col || '#2A1C14', 'stroke-width': 2 }, g); const t = E('text', { x: 0, y: 3, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 17, 'font-weight': 700, fill: col || '#2A1C14' }, g); t.textContent = txt; g.setAttribute('transform', `translate(${x.toFixed(0)} ${y.toFixed(0)})`); return g; };
    const F = MAP.florence, B = MAP.bruges, run = !instant && !reduced();
    if (c === 'ship') {
      const train = E('g', {}, fx);
      const mule = (dx) => { const m = E('g', { transform: `translate(${dx} 0)` }, train); E('path', { d: 'M-14 0h22l6-8 4 2-3 7v8h-3v-6h-20v6h-3z', fill: '#7A5A3A', stroke: '#2A1C14', 'stroke-width': 1.5 }, m); E('rect', { x: -10, y: -9, width: 14, height: 9, fill: '#C79A3A', stroke: '#2A1C14', 'stroke-width': 1.2 }, m); };
      const guard = (dx) => { const m = E('g', { transform: `translate(${dx} 0)` }, train); E('circle', { cx: 0, cy: -16, r: 5, fill: '#22408C', stroke: '#2A1C14' }, m); E('path', { d: 'M-6 8L0-10L6 8Z', fill: '#22408C', stroke: '#2A1C14' }, m); E('path', { d: 'M6-24v34', stroke: '#2A1C14', 'stroke-width': 2 }, m); };
      guard(-44); mule(-22); mule(4); mule(30); guard(52);
      const note = tag(0, -44, `${C.N.charge} florins charged`, '#2F5E4F'); train.appendChild(note);
      const setNote = (txt, col) => { const w = txt.length * 9 + 26; note.querySelector('rect').setAttribute('x', -w / 2); note.querySelector('rect').setAttribute('width', w); note.querySelector('rect').setAttribute('stroke', col); const t = note.querySelector('text'); t.textContent = txt; t.setAttribute('fill', col); };
      if (run) { setWhat('The mules set out, with two hired guards.');
        await tween(3800, (f) => { const p = along(road, f); train.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(.85)`);
          if (f > 0.38 && f < 0.62) Mp.robbers.setAttribute('transform', `translate(${(-(f - 0.38) * 140).toFixed(1)} 0)`);
          if (f > 0.45 && note.__s !== 2) { note.__s = 2; setNote(`guards and mules: −${C.N.guards}`, '#A8301C'); Sound.play('coin'); setWhat('The guards keep the robbers off, and they want their pay.'); } }, (x) => x); }
      else { const p = along(road, 1); train.setAttribute('transform', `translate(${p[0]} ${p[1]}) scale(.85)`); }
      setNote(`You keep ${C.N.gain.ship} florins`, '#2A1C14');
      tag(B[0] + 30, B[1] + 64, 'Weeks on the road');
    } else if (c === 'bill') {
      // a letter goes north by courier; the gold never leaves Florence
      const letter = E('g', {}, fx); E('rect', { x: -16, y: -11, width: 32, height: 22, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 2 }, letter); E('path', { d: 'M-16-11L0 2 16-11', fill: 'none', stroke: '#2A1C14', 'stroke-width': 1.6 }, letter); E('circle', { cx: 0, cy: 4, r: 5.5, fill: '#A8301C', stroke: '#6E1D10' }, letter);
      E('circle', { cx: F[0], cy: F[1], r: 46, fill: 'url(#glow)' }, fx);
      for (let i = 0; i < 4; i++) { const g = E('g', { transform: `translate(${F[0] - 54 + i * 18} ${F[1] + 64})` }, fx); drawStack(g, 100 + (i === 3 ? 0 : 0)); }
      tag(F[0] - 20, F[1] + 104, 'The gold stays here', '#2F5E4F');
      if (run) { setWhat('Your letter goes north. The gold stays in your vault.'); await tween(1700, (f) => { const p = along(road, f); letter.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${(-10 + 20 * f).toFixed(1)})`); }); }
      else { const p = along(road, 1); letter.setAttribute('transform', `translate(${p[0]} ${p[1]})`); }
      Sound.play('seal');
      for (let i = 0; i < 5; i++) { const g = E('g', { transform: `translate(${B[0] - 46 + i * 22} ${B[1] + 50})` }, fx); drawStack(g, 60, 'silver'); }
      tag(B[0] + 20, B[1] + 92, 'Paid in Flemish money');
      tag(F[0] - 20, F[1] - 50, `Your charge: ${C.N.gain.bill} florins`, '#2F5E4F');
    } else {
      const m = E('g', {}, fx); E('circle', { cx: 0, cy: -14, r: 7, fill: '#B8862E', stroke: '#2A1C14', 'stroke-width': 1.5 }, m); E('path', { d: 'M-9 10L0-6L9 10Z', fill: '#B8862E', stroke: '#2A1C14', 'stroke-width': 1.5 }, m);
      const bardi = [F[0] + 60, F[1] + 70];
      E('rect', { x: bardi[0] - 34, y: bardi[1] - 12, width: 68, height: 24, fill: '#3D7563', stroke: '#2A1C14', 'stroke-width': 2 }, fx);
      tag(bardi[0], bardi[1] + 40, 'The Bardi’s bench');
      await tween(run ? 1500 : 0, (f) => m.setAttribute('transform', `translate(${lerp(F[0], bardi[0], f).toFixed(1)} ${lerp(F[1], bardi[1] - 26, f).toFixed(1)})`));
    }
    writeLedger(st, sim.states[0], 1, 'After this turn');
    showOutcome('t1', 0, `<p>${C.consequence('t1', st, sim.states[0])}</p>`);
  }
  // ---------------- turn 2: the vault ----------------
  async function t2(ctx) {
    buildTable({ noKing: true, label: 'Your counting table. Your vault holds your gold; beside it is the tray for loans to merchants.' });
    const prev = ctx.sim.states[1];
    fill('vault', prev.V);
    if (ctx.done) { const st = ctx.sim.states[2]; fill('vault', st.V); fill('merch', st.M); writeLedger(st, prev, 2, 'After this turn'); showOutcome('t2', 1, `<p>${C.consequence('t2', st, prev)}</p>`); return; }
    setWhat('Depositors are bringing you 4,000 florins.');
    // three depositors walk up and pour in 4,000 florins
    // a shopkeeper, a wool worker and a nun from the convent bring their money
    const G = STAGE.G, feet = G.street - 10, sc = STAGE.mode === 'tall' ? 1.05 : 1.15;
    const ppl = [{ kind: 'cap', robe: '#B8862E' }, { kind: 'hood', robe: '#8C8478' }, { kind: 'veil', robe: '#2A1C14' }].map((o, i) => person(-60 - i * 60, feet, i + 1, Object.assign({ scale: sc, hold: 'purse' }, o)));
    await Promise.all(ppl.map((p, i) => walk(p, G.front[0] - 110 + i * 110, feet, 900)));
    ppl.forEach((p) => { p.turn(1); p.setHold(null); });
    await Promise.all([0, 1, 2].map((i) => spawnInto(i < 2 ? 1300 : 1400, 'vault', [ppl[i].x + 20, ppl[i].y - 30], { stagger: 22, ms: 380 })));
    ppl.forEach((p, i) => walk(p, STAGE.W + 80 + i * 40, p.y, 1300));
    const withDeposits = Object.assign({}, prev, { V: prev.V + 4000, O: 4000, M: 0 }); withDeposits.W = withDeposits.V + withDeposits.M + withDeposits.K - withDeposits.O;
    writeLedger(withDeposits, prev, 2, 'Deposits in');
    const options = C.lendOptions().map((o) => ({ amount: o.amount, short: o.amount ? `Lend ${fl(o.amount)}` : 'Lend none', text: o.amount ? fl(o.amount) : 'None' }));
    let cur = 0;
    const label = (i) => (i === 0 ? 'Keep all 4,000 in the vault' : `Lend ${flo(options[i].amount)}`);
    const update = (i) => { cur = i; chipset.set(i); const left = withDeposits.V - options[i].amount, short = 4000 - left;
      gauge(left, 4000, 'Depositors could ask for');
      setWhat(i === 0 ? 'Every deposit stays in the vault, and none of it earns anything.' : `Merchants will pay back more than <b>${flo(options[i].amount)}</b>. If every depositor asked at once, you would be <b>${flo(short)}</b> short.`); btns(); };
    const p = pull({ from: 'vault', to: 'merch', options, index: 0, onChange: update });
    const chipset = chips(options.map((o) => ({ text: o.text })), 0, (i) => p.setIndex(i), 'How much to lend to merchants');
    const btns = () => setButtons([{ text: label(cur), id: 'commitBtn', on: async () => { commitChoice('t2', C.OPT.t2[cur]); chipset.el.remove(); p.remove(); await p.settled(); const sim = C.simulate(gameChoices()), st = sim.states[2]; settle('vault', st.V); settle('merch', st.M); writeLedger(st, prev, 2, 'After this turn'); showOutcome('t2', 1, `<p>${C.consequence('t2', st, prev)}</p>`); } }]);
    $('#act').textContent = T.t2.act;
    update(0);
  }

  // ---------------- turn 3: the king's war ----------------
  async function t3(ctx) {
    buildTable({ label: 'Your counting table, with your vault, your loans to merchants, and the king’s chest.' });
    const prev = ctx.sim.states[2];
    fill('vault', prev.V); fill('merch', prev.M);
    if (ctx.done) { const st = ctx.sim.states[3]; fill('vault', st.V); fill('king', st.K); writeLedger(st, prev, 3, 'After this turn'); showOutcome('t3', 2, `<p>${C.consequence('t3', st, prev)}</p>`); return; }
    // the envoy arrives with a sealed letter
    const G = STAGE.G, env = person(-60, G.street - 10, 1, { kind: 'hat', robe: '#22408C', hold: 'letter', scale: STAGE.mode === 'tall' ? 1.1 : 1.2 });
    const letter = E('g', {}, STAGE.layers.people); E('rect', { x: -26, y: -17, width: 52, height: 34, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 2 }, letter); E('path', { d: 'M-26-17L0 3 26-17', fill: 'none', stroke: '#2A1C14', 'stroke-width': 1.6 }, letter); E('circle', { cx: 0, cy: 6, r: 8, fill: '#A8301C', stroke: '#6E1D10' }, letter);
    letter.setAttribute('opacity', 0);
    await walk(env, G.front[0] - 40, G.street - 10, 1200); env.setHold(null);
    letter.setAttribute('opacity', 1); await tween(500, (f) => letter.setAttribute('transform', `translate(${G.front[0]} ${lerp(G.street - 50, G.street + 40, f)})`));
    Sound.play('seal');
    const ko = C.kingOptions({ t1: ctx.ch.t1, t2: ctx.ch.t2 });
    const names = ['Nothing', 'A quarter', 'Half', 'Three quarters'];
    const options = ko.map((o) => ({ amount: o.amount, short: o.amount ? fl(o.amount) : 'Nothing', text: o.amount ? fl(o.amount) : 'Nothing' }));
    let cur = 0;
    const update = (i) => { cur = i; chipset.set(i); gauge(prev.V - options[i].amount, prev.O, 'Depositors could ask for');
      setWhat(i === 0 ? 'You keep your gold, and the Bardi and Peruzzi collect the king’s gifts.' : `${names[i]} of your vault. The king’s gift: <b>${flo(ko[i].amount * C.N.giftRate)}</b> a year. If he never repays, you lose <b>${flo(options[i].amount)}</b>.`); btns(); };
    const p = pull({ from: 'vault', to: 'king', options, index: 0, onChange: update });
    const chipset = chips(options.map((o) => ({ text: o.text })), 0, (i) => p.setIndex(i), 'How much to lend the king');
    const btns = () => setButtons([{ text: cur ? `Lend the king ${flo(options[cur].amount)}` : 'Lend the king nothing', id: 'commitBtn', on: async () => {
      commitChoice('t3', C.OPT.t3[cur]); chipset.el.remove(); p.remove(); await p.settled(); setButtons([]);
      const sim = C.simulate(gameChoices()), st = sim.states[3];
      walk(env, STAGE.W + 80, env.y, 1200); letter.remove();
      if (st.ev.K) {
        // two years of gifts: each year a fifth of the loan arrives
        const half = st.ev.gifts / 2, rub = $('.rubric');
        for (let y = 0; y < 2; y++) {
          rub.textContent = `Florence, ${1340 + y} · the king’s gift`; setWhat(`The king’s gift for ${1340 + y}: <b>${flo(half)}</b>.`);
          await wait(450); await spawnInto(half, 'vault', [G.front[0], G.street - 40], { stagger: 60, ms: 620 });
        }
        rub.textContent = `${T.t3.place} · Turn 3 of 5`;
      }
      settle('vault', st.V); settle('king', st.K); writeLedger(st, prev, 3, 'After this turn'); showOutcome('t3', 2, `<p>${C.consequence('t3', st, prev)}</p>`);
    } }]);
    update(0);
  }

  // ---------------- turn 4: the Church's rule ----------------
  const T4ICON = {
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h11l3 3v17H5z" fill="#EDE0C4" stroke="#2A1C14" stroke-width="1.4"/><path d="M8 8h8M8 11h8M8 14h5" stroke="#2A1C14" stroke-width="1.2"/><path d="M8 18h8" stroke="#A8301C" stroke-width="2"/></svg>',
    exchange: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3z" fill="#EDE0C4" stroke="#2A1C14" stroke-width="1.4"/><path d="M3 6l9 7 9-7" fill="none" stroke="#2A1C14" stroke-width="1.3"/><circle cx="12" cy="15" r="3" fill="#A8301C"/></svg>',
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9c-2 4-2 10 6 11 8-1 8-7 6-11z" fill="#7A4A22" stroke="#2A1C14" stroke-width="1.4"/><path d="M8 9c2-3 6-3 8 0" stroke="#E9C66E" stroke-width="2" fill="none"/></svg>',
    free: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#2A1C14" stroke-width="1.5"/><path d="M12 7v10M8 11h8" stroke="#2A1C14" stroke-width="1.5"/></svg>' };
  async function t4(ctx) {
    buildTable({ label: 'Your counting table, with your loans to merchants.' });
    const prev = ctx.sim.states[3];
    fill('vault', prev.V); fill('merch', prev.M); fill('king', prev.K);
    if (ctx.done) { const st = ctx.sim.states[4]; fill('vault', st.V); writeLedger(st, prev, 4, 'After this turn'); showOutcome('t4', 3, `<p>${C.consequence('t4', st, prev)}</p>`); return; }
    if (!prev.M) $('#act').insertAdjacentHTML('afterend', '<p class="gate-note" style="margin:.6rem 0 0;font-size:16px">You lent nothing to merchants in The Vault, so this choice will not change your ledger. It shows how Florence’s bankers got paid when they did lend.</p>');
    const order = ['open', 'exchange', 'gift', 'free'];
    let pick = null;
    const ch = chips(order.map((k) => ({ text: T.t4.tag[k], icon: T4ICON[k] })), -1, (i) => choose(order[i]), 'Ways to be paid');
    // the loan book: drag the merchants' tray onto a way of being paid
    const mb = STAGE.G.merch.box, book = E('g', { style: 'cursor:grab' }, STAGE.layers.top);
    E('rect', { x: -34, y: -24, width: 68, height: 48, rx: 3, fill: '#6B2A1A', stroke: '#2A1C14', 'stroke-width': 2 }, book); E('path', { d: 'M0-22v44', stroke: '#E9C66E', 'stroke-width': 1.5 }, book);
    const bt = E('text', { x: 0, y: 44, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-style': 'italic', 'font-size': 17, fill: '#F4E7C8' }, book); bt.textContent = 'loan book';
    const home = [mb[0] + mb[2] - 50, mb[1] + 40]; book.setAttribute('transform', `translate(${home})`);
    const svg = STAGE.svg; let drag = false;
    book.addEventListener('pointerdown', (e) => { drag = true; book.setPointerCapture(e.pointerId); e.preventDefault(); });
    book.addEventListener('pointermove', (e) => { if (!drag) return; const r = svg.getBoundingClientRect(); book.setAttribute('transform', `translate(${(e.clientX - r.left) * STAGE.W / r.width} ${(e.clientY - r.top) * STAGE.H / r.height})`); });
    book.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; book.style.visibility = 'hidden'; const hit = document.elementFromPoint(e.clientX, e.clientY); book.style.visibility = ''; const c = hit && hit.closest && hit.closest('.chip'); if (c) choose(order[[...ch.el.children].indexOf(c)]); book.setAttribute('transform', `translate(${home})`); });
    const btns = () => setButtons([{ text: pick ? { open: 'Charge interest openly', exchange: 'Lend through bills', gift: 'Ask for gifts', free: 'Lend for free' }[pick] : 'Choose a way first', disabled: !pick, id: 'commitBtn', on: () => { commitChoice('t4', pick); ch.el.remove(); book.remove(); resolveT4(ctx, prev); } }]);
    function choose(k) { pick = k; ch.set(order.indexOf(k)); setWhat(`<b>${esc(T.t4.opts[k])}.</b>`); btns(); }
    setWhat('Choose one of the four ways.'); btns();
  }
  async function resolveT4(ctx, prev) {
    setButtons([]);
    const G = STAGE.G, c0 = C.simulate(gameChoices()).states[4].ev.choice;
    const finish = async () => {
      const sim = C.simulate(gameChoices()), st = sim.states[4];
      if (st.ev.earned > 0) await spawnInto(st.ev.earned, 'vault', [G.front[0], G.street - 40], { stagger: 50 });
      settle('vault', st.V); writeLedger(st, prev, 4, 'After this turn');
      const note = C.billNote(st.ev);
      showOutcome('t4', 3, `${note ? `<p><b>${esc(note)}</b></p>` : ''}<p>${C.consequence('t4', st, prev)}</p>`);
    };
    if (c0 !== 'exchange') return finish();
    // The bet on the bill. Rival benches charge somewhere in a known range this year; nobody knows exactly where. Ask more
    // and merchants go to them; ask less and you leave money on the table; and the exchange may move before the bills come home.
    const Y = gameChoices()._year || C.YEAR0, lo = C.YEARS.going[0], hi = C.YEARS.going[C.YEARS.going.length - 1], M = prev.M;
    const panel = document.createElement('div'); panel.className = 'panel leaf billpanel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-labelledby', 'billT');
    const pct = (v) => (100 * v / 30).toFixed(1) + '%';
    panel.innerHTML = `<h3 id="billT">Set the rate on the bill</h3>
      <p>How much should come home for every 100 florins you lend? Rival benches are asking between ${lo} and ${hi} this year. Ask more than they do and merchants go to them; the exchange may also move before the bills come home.</p>
      <div class="rate"><label class="sr-only" for="rateIn">What you ask for every 100 florins lent</label>
        <div class="track"><span class="band" style="left:${pct(lo)};width:${pct(hi - lo)}"></span><span class="mark" id="goingMark" hidden></span></div>
        <input type="range" id="rateIn" min="0" max="30" step="1" value="12">
        <div class="scale"><span>0</span><span class="bandlabel" style="left:${pct((lo + hi) / 2)}">rival benches</span><span>30</span></div></div>
      <p class="read" id="rateRead"></p>
      <div class="merchants" id="merchants" aria-hidden="true">${Array.from({ length: 8 }, () => '<i></i>').join('')}</div>
      <div class="actions" style="margin-top:.4rem"><button class="btn" type="button" id="sealRate"></button></div>`;
    $('#stage').appendChild(panel); setTimeout(toStage, 60);
    const inp = $('#rateIn', panel);
    const on = () => { const v = Number(inp.value); $('#rateRead').innerHTML = `Ask <b>${v}</b> for every 100. If every merchant stays and the exchange holds, your ${M ? flo(M) : 'loans'} would earn <b>${flo(Math.round(M * v / 100))}</b>.`;
      inp.setAttribute('aria-valuetext', `Ask ${v} for every 100 florins lent`); $('#sealRate').textContent = `Seal the bill at ${v}`; if (v % 5 === 0) Sound.play('coin'); };
    inp.addEventListener('input', on); on(); inp.focus();
    const rate = await new Promise((res) => { $('#sealRate').addEventListener('click', () => res(Number(inp.value))); if (window.__FAST) res(Y.going); });
    if (S.practice) S.prate = rate; else { S.log.t4.rate = rate; save(); }
    inp.disabled = true; $('#sealRate').remove(); Sound.play('seal');
    // the reveal: where the rivals really were, who walked, and how the exchange moved
    const ev = C.simulate(gameChoices()).states[4].ev;
    const mk = $('#goingMark'); mk.hidden = false; mk.style.left = pct(Y.going); mk.title = `Rival benches: ${Y.going}`;
    $('#rateRead').innerHTML = `Rival benches asked <b>${Y.going}</b> this year.`;
    await wait(900);
    const gone = Math.round((1 - ev.accept) * 8), ms = $$('#merchants i');
    ms.forEach((m, j) => { if (j >= 8 - gone) m.classList.add('gone'); });
    $('#rateRead').innerHTML += gone ? ` ${gone >= 8 ? 'Every merchant' : `${gone} merchant${gone === 1 ? '' : 's'} in 8`} took ${gone === 1 ? 'his' : 'their'} business to a rival bench.` : ' Every merchant stayed.';
    await wait(1100);
    $('#rateRead').innerHTML += ` The exchange moved ${ev.shock === 0 ? 'not at all' : `${Math.abs(ev.shock)} ${ev.shock > 0 ? 'in your favor' : 'against you'}`}.`;
    await wait(1400);
    panel.remove(); await finish();
  }

  // ---------------- turn 5: the run ----------------
  // The rumor brings depositors to the bench, and nobody knows how many will come (this year's `line`). The student pays each
  // by dragging gold to them (or pressing Pay). Every payment, sale and closing comes from runScript, checked against simulate.
  async function t5(ctx) {
    const tall = stageMode() === 'tall';
    buildTable({ street: tall ? 190 : 210, label: 'Your bench at the front of your shop, the street of Florence beyond it. Depositors line up to take their money out.' });
    const prev = ctx.sim.states[4], G = STAGE.G, Y = ctx.ch._year || C.YEAR0;
    fill('vault', prev.V); fill('merch', prev.M); fill('king', prev.K);
    if (ctx.done) { const st = ctx.sim.states[5]; fill('vault', st.V); fill('merch', st.M); fill('king', 0); writeLedger(st, prev, 5, 'After this turn'); if (prev.K) strikeKing(); showOutcome('t5', 4, `<p>${C.consequence('t5', st, prev)}</p>`); return; }
    const base = Object.assign({}, ctx.ch); delete base.t5;
    const scripts = {}; C.OPT.t5.forEach((c) => { scripts[c] = C.runScript(Object.assign({}, base, { t5: c })); });
    const n = scripts.pay.depositors, shared = scripts.pay.steps;   // pay, sell and bar share their first full payments
    const q = []; let arrived = 0, served = 0, phase = 'run', timer = null, paying = false, auto = false, warned = false;
    // the crowd: the person at the bench in front, the rest in rows behind, smaller as they stand farther back
    const feet0 = G.street - 12, s0 = tall ? 1.3 : 1.45;
    const spot = (j) => {
      if (j === 0) return [G.front[0], feet0, s0];
      const press = Math.min(1, q.length / 12), k = j - 1, per = tall ? 3 : 5, side = k % 2 ? -1 : 1, idx = Math.floor(k / 2) % per, row = Math.floor(k / (2 * per));
      const sc = s0 * (1 - 0.13 * (row + (idx ? 0 : 0.5)) - 0.04 * press), gap = (tall ? 54 : 70) * sc / s0 * (1 - 0.18 * press);
      return [G.front[0] + side * gap * (idx + 1) + (row % 2 ? side * gap / 2 : 0), feet0 - 22 - row * 30 - (idx % 2) * 5, sc];
    };
    const relayout = (ms) => { q.forEach((p, j) => { const [x, y, sc] = spot(j); p.sc = sc; walk(p, x, y, ms || 650).then(() => { p.turn(1); }); }); depthSort(); };
    function arrive() { if (arrived >= n) return; const i = arrived++; const side = i % 2 ? 1 : -1; const p = person(side > 0 ? STAGE.W + 50 : -50, feet0 - 40, i + 3, { hold: 'chit', scale: s0 * 0.8 }); q.push(p); relayout(); updateRace(); if (arrived === n) { setTimeout(() => { if (phase === 'run') setWhat(`No one else is coming. ${q.length} still in line.`); }, 900); } }
    const owedInLine = () => q.length * C.N.claim;
    const updateRace = () => { if (phase !== 'end') gauge(total('vault'), owedInLine(), 'Asked for in line'); };
    setWhat('A rumor sweeps Florence that the king will not pay.'); Sound.play('murmur');
    // the rumor spreads across the city
    const rip = E('circle', { cx: G.front[0], cy: G.street * 0.4, r: 4, fill: 'none', stroke: '#F0D489', 'stroke-width': 4 }, STAGE.layers.fx);
    await tween(1000, (f) => { rip.setAttribute('r', 4 + f * STAGE.W * 0.7); rip.setAttribute('opacity', 1 - f); }); rip.remove();
    for (let i = 0; i < Math.min(2, n); i++) arrive();
    // they come faster than one banker can comfortably count, and this year's pace is its own
    if (reduced()) while (arrived < n) arrive(); else timer = setInterval(() => { if (phase === 'run') { arrive(); if (q.length > 4) { Sound.play('murmur'); jostle(); } } if (arrived >= n) clearInterval(timer); }, Y.pace || 780);
    setWhat('Depositors are coming for their money. Pay them one by one.');
    function jostle() { if (reduced()) return; q.slice(2).forEach((p, j) => { const dx = (j % 2 ? 1 : -1) * 3; p.fig.animate([{ transform: 'translate(0px,0px)' }, { transform: `translate(${dx}px,-2px)` }, { transform: 'translate(0px,0px)' }], { duration: 300 }); }); }
    // the pay gesture: drag gold from the vault into the hands of the person at the bench
    const svg = STAGE.svg, vb = G.vault.box;
    const hit = E('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: 'transparent', style: 'cursor:grab' }, STAGE.layers.fx);
    const ghost = E('g', { opacity: 0, 'pointer-events': 'none' }, STAGE.layers.top); drawStack(E('g', { transform: 'translate(-10 0)' }, ghost), 100); drawStack(E('g', { transform: 'translate(12 5)' }, ghost), 100);
    const ptOf = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * STAGE.W / r.width, (e.clientY - r.top) * STAGE.H / r.height]; };
    let drag = false;
    hit.addEventListener('pointerdown', (e) => { if (phase !== 'run' || !q.length) return; drag = true; hit.setPointerCapture(e.pointerId); ghost.setAttribute('opacity', 1); ghost.setAttribute('transform', `translate(${ptOf(e)})`); e.preventDefault(); });
    hit.addEventListener('pointermove', (e) => { if (drag) ghost.setAttribute('transform', `translate(${ptOf(e)})`); });
    hit.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; ghost.setAttribute('opacity', 0); if (ptOf(e)[1] < G.street + 70) payNext(); });
    hit.addEventListener('pointercancel', () => { drag = false; ghost.setAttribute('opacity', 0); });
    const canPay = () => shared[served] && shared[served].type === 'pay' && !shared[served].partial;
    // a paid depositor takes the purse and walks off; the line steps forward
    const leave = (p) => { p.setHold('purse'); walk(p, p.x < G.front[0] ? -90 : STAGE.W + 90, p.y - 6, 1100).then(() => p.g.remove()); };
    async function payNext() {
      if (paying || phase !== 'run' || !q.length) return; if (!canPay()) return dryMoment();
      paying = true;
      const front = q.shift(), stacks = take('vault', shared[served].amount);
      await Promise.all(stacks.map((s, j) => wait(j * 60).then(() => fly(s, front.x + 20 * front.sc, front.y - 32 * front.sc, 360, 50))));
      stacks.forEach((s) => s.g.remove());
      served++; $('#stage').dataset.paid = served; leave(front); relayout(500); paying = false;
      if (phase !== 'run') return;   // the door was barred while this depositor was being paid
      updateRace();
      const inV = total('vault');
      if (served === n) return endRun('pay');
      if (!canPay()) return dryMoment();
      if (inV < owedInLine() && !warned) { warned = true; setWhat(`Paid ${served}. The line already asks for more than your vault holds.`); announce('The line asks for more than your vault holds.'); }
      else setWhat(`Paid ${served}.${arrived < n ? ' More are coming.' : ` ${q.length} still in line.`}`);
      buttons();
    }
    async function payAll() { auto = true; buttons(); while (phase === 'run' && canPay() && served < n) { if (!q.length) { arrive(); await wait(150); continue; } await payNext(); await wait(110); } }
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.setAttribute('role', 'group'); ov.setAttribute('aria-label', 'The run'); $('#stage').appendChild(ov);
    const mk = (text, on, hot) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (hot ? ' hot' : ''); b.textContent = text; b.addEventListener('click', on); ov.appendChild(b); return b; };
    function buttons() {
      ov.innerHTML = ''; if (phase !== 'run') return;
      mk(`Pay the next in line (${C.N.claim})`, () => payNext(), true);
      if (served >= 4 && !auto) mk('Keep paying everyone', payAll);
      mk('Bar the door', () => endRun('bar'));
    }
    buttons(); setButtons([]); toStage(); updateRace();
    async function dryMoment() {
      phase = 'dry'; clearInterval(timer); while (arrived < n) arrive(); updateRace();
      const left = total('vault');
      const agent = person(STAGE.W - 70, feet0 - 40, 2, { kind: 'hat', robe: '#3D7563', scale: s0 * 0.85 }); agent.turn(-1); depthSort();
      const tg = E('g', { transform: `translate(${STAGE.W - (tall ? 150 : 170)} ${G.street + 34})` }, STAGE.layers.top); E('rect', { x: tall ? -140 : -150, y: -20, width: tall ? 280 : 300, height: 36, rx: 4, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 1.5 }, tg);
      const tt = E('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': tall ? 18 : 19, 'font-weight': 700, fill: '#2A1C14' }, tg); tt.textContent = 'A rival will buy loans at half price';
      setWhat(`${left ? `Only <b>${flo(left)}</b> left` : 'Your vault is empty'}, and ${q.length} still in line.`);
      q.slice(0, 4).forEach((p) => { if (!reduced()) p.fig.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(0,-6px)' }, { transform: 'translate(0,0)' }], { duration: 400, iterations: 2 }); });
      Sound.play('murmur'); announce('Your vault cannot pay the next depositor in full.');
      ov.innerHTML = '';
      const clear = () => { tg.remove(); agent.g.remove(); };
      if (total('merch') > 0) mk('Sell loans at half price', () => { clear(); endRun('sell'); }, true);
      mk('Close the bench', () => { clear(); endRun('pay'); });
      mk('Bar the door', () => { clear(); endRun('bar'); });
      ov.querySelector('button').focus();
    }
    const shutter = async (down) => { const sh = E('rect', { x: 0, y: down ? -G.street : 0, width: STAGE.W, height: G.street + 6, fill: 'url(#wood)', stroke: '#1E120A', 'stroke-width': 3 }, STAGE.layers.top); Sound.play('thud'); await tween(500, (f) => sh.setAttribute('y', lerp(-G.street, 0, f))); return sh; };
    async function endRun(choice) {
      if (phase === 'end') return;
      phase = 'end'; clearInterval(timer);
      while (paying) await new Promise((r) => setTimeout(r, 40));   // let a payment in flight land first
      ov.remove(); hit.remove(); setButtons([]);
      commitChoice('t5', choice);
      const sim = C.simulate(gameChoices()), st = sim.states[5], rs = scripts[choice];
      if (choice === 'bar') {
        // the shutter comes down; three days later every depositor still owed is back at once
        const sh = await shutter(true);
        const lbl = E('text', { x: STAGE.W / 2, y: G.street * 0.55, 'text-anchor': 'middle', 'font-family': 'Grenze Gotisch, Texturina, serif', 'font-size': 40, 'font-weight': 600, fill: '#F4E7C8' }, STAGE.layers.top); lbl.textContent = 'Three days later';
        setWhat('You bar the door. Three days later you open it again.');
        q.forEach((p) => p.g.remove()); q.length = 0;
        await wait(1300); lbl.remove();
        for (let i = served; i < rs.depositors; i++) { q.push(person(0, 0, i + 3, { hold: 'chit', scale: s0 })); }
        q.forEach((p, j) => { const [x, y, sc] = spot(j); p.sc = sc; p.draw(); move(p, x, y); }); depthSort();
        await tween(500, (f) => sh.setAttribute('y', lerp(0, -G.street - 10, f))); sh.remove(); Sound.play('murmur');
        gauge(total('vault'), owedInLine(), 'Asked for in line');
        setWhat(`Every depositor wants all their coins back: <b>${flo(owedInLine())}</b> still owed.`);
        await wait(900);
      } else { while (arrived < n) arrive(); await wait(400); }
      await playSteps(rs.steps.slice(served), choice === 'bar' || auto);
      await kingsLetter(st, prev);
    }
    async function playSteps(steps, fast) {
      for (const s of steps) {
        if (s.type === 'pay') {
          const front = s.partial ? q[0] : q.shift(); if (!front) continue;
          const stacks = take('vault', s.amount);
          await Promise.all(stacks.map((x, j) => wait(j * 40).then(() => fly(x, front.x + 20 * front.sc, front.y - 32 * front.sc, fast ? 220 : 360, 40))));
          stacks.forEach((x) => x.g.remove());
          if (s.partial) { setWhat(`The last ${flo(s.amount)} go to the next in line, who is owed ${flo(C.N.claim)}.`); await wait(700); continue; }
          leave(front); relayout(300);
          gauge(total('vault'), owedInLine(), 'Asked for in line'); setWhat(`${q.length} still in line.`);
          await wait(fast ? 80 : 260);
        } else if (s.type === 'sell') {
          setWhat(`You sell <b>${flo(s.sold)}</b> of loans to a rival bank for <b>${flo(s.cash)}</b>.`); Sound.play('thud');
          const loans = take('merch', s.sold); await Promise.all(loans.map((x, j) => wait(j * 25).then(() => fly(x, STAGE.W + 60, G.street - 40, 460, 50)))); loans.forEach((x) => x.g.remove());
          await spawnInto(s.cash, 'vault', [STAGE.W - 40, G.street - 40], { stagger: 25, ms: 420 }); gauge(total('vault'), owedInLine(), 'Asked for in line');
          await wait(700);
        } else if (s.type === 'close') {
          // the ones you could not pay
          q.forEach((p) => p.angry()); Sound.play('murmur');
          setWhat(`The vault is empty, with ${s.unpaid} still in line.`);
          if (!reduced()) q.forEach((p, j) => p.fig.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${j % 2 ? 4 : -4}px,-5px)` }, { transform: 'translate(0,0)' }], { duration: 260, iterations: 4 }));
          await wait(1300);
          await shutter(true);
          const tg = E('text', { x: STAGE.W / 2, y: G.street * 0.55, 'text-anchor': 'middle', 'font-family': 'Grenze Gotisch, Texturina, serif', 'font-size': tall ? 32 : 40, 'font-weight': 600, fill: '#F4E7C8' }, STAGE.layers.top); tg.textContent = `Closed, with ${s.unpaid} still in line`;
          setWhat(`Your bench is closed, with ${s.unpaid} depositors still unpaid.`);
          await wait(1000);
        }
      }
    }
  }
  async function kingsLetter(st, prev) {
    // the king's letter: break the seal
    const G = STAGE.G, L = E('g', { style: 'cursor:pointer', tabindex: 0, role: 'button', 'aria-label': 'Break the seal on the king’s letter' }, STAGE.layers.top);
    const cx = STAGE.W / 2, cy = G.drop[1];
    E('rect', { x: -110, y: -70, width: 220, height: 140, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 3 }, L); E('path', { d: 'M-110-70L0 10 110-70', fill: 'none', stroke: '#2A1C14', 'stroke-width': 2.5 }, L);
    const seal = E('g', { transform: 'translate(0 16)' }, L); E('circle', { r: 26, fill: '#A8301C', stroke: '#6E1D10', 'stroke-width': 3 }, seal);
    for (let i = 0; i < 3; i++) E('path', { d: `M${-12} ${-12 + i * 9}l8-4 6 3-2 4 5 3-6 1-3 4-2-5-5 1z`, fill: '#E9C66E' }, seal);
    await tween(600, (f) => L.setAttribute('transform', `translate(${cx} ${lerp(-120, cy, easeOut(f))}) rotate(${lerp(-14, -3, f)})`));
    gauge(null);
    if (st.failed === 'run') setWhat('Your bench is closed, and a letter from King Edward arrives anyway.'); else setWhat(st.ev.Klost ? `A letter from King Edward. You lent him <b>${flo(st.ev.Klost)}</b>, and your bank is worth <b>${flo(st.ev.Wrun)}</b> if he pays.` : 'A letter from King Edward. You never lent him a coin.');
    await new Promise((res) => {
      setButtons([{ text: 'Break the seal', id: 'sealBtn', on: res }]); L.addEventListener('click', res); L.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); res(); } });
      const b = $('#sealBtn'); if (b) b.focus(); if (window.__FAST) res();
    });
    setButtons([]); Sound.play('seal');
    await tween(350, (f) => { seal.setAttribute('transform', `translate(${lerp(0, 40, f)} ${lerp(16, 120, f)}) rotate(${f * 120})`); seal.setAttribute('opacity', 1 - f); });
    L.remove();
    // the king stops paying: his chest empties
    const ks = STAGE.places.king.stacks.slice();
    await Promise.all(ks.map((s, j) => wait(j * 25).then(() => tween(500, (f) => { s.g.setAttribute('opacity', 1 - f); place(s, s.x, s.y + f * 14); })))); ks.forEach((s) => s.g.remove()); STAGE.places.king.stacks = [];
    writeLedger(st, prev, 5, 'After this turn'); if (prev.K) strikeKing();
    if (st.failed) Sound.play('bell');
    showOutcome('t5', 4, `<p>${C.consequence('t5', st, prev)}</p>`);
  }
  const TURN_FN = { t1, t2, t3, t4, t5 };

  // ---------------- the chronicle ----------------
  // where this bank stands among all 576 ways to play the five turns: something to compare with a friend
  // Where this bank stands: the student's bank against all 576 ways to play the five turns in the same year of Florence
  // (the same run, the same rival rates, the same exchange; bills set at the rivals' rate). Something to compare with a friend.
  const ALL = {};
  function standing(ch) {
    const Y = ch._year || C.YEAR0, key = JSON.stringify(Y);
    if (!ALL[key]) { const out = []; const O = C.OPT; for (const a of O.t1) for (const b of O.t2) for (const c of O.t3) for (const d of O.t4) for (const e of O.t5) { const r = C.simulate({ t1: a, t2: b, t3: c, t4: d, t5: e, _year: Y }); out.push({ s: C.score(r), f: C.fateOf(r) }); } ALL[key] = out; }
    const all = ALL[key], r = C.simulate(ch), mine = C.score(r), fate = C.fateOf(r), below = all.filter((x) => x.s < mine).length, same = all.filter((x) => x.f === fate).length;
    const best = Math.max(...all.map((x) => x.s));
    return { pct: Math.floor(100 * below / all.length), same, best, n: all.length, top: mine >= best, fate };
  }
  function shareLine(c, st) {
    return c.fate === 'survived' ? `My bank outlasted the Bardi and the Peruzzi, worth ${flo(c.W)}${st.top ? ', as good as any banker in my year of Florence' : `, ahead of ${st.pct}% of the ways to play my year of Florence`}.`
      : c.fate === 'run' ? 'My bank in 1340s Florence ran out of gold with depositors still at the door.'
      : 'King Edward stopped paying, and my bank in 1340s Florence went down with the Bardi and the Peruzzi.';
  }
  function sealHtml(c, ch) {
    const st = standing(ch), line = shareLine(c, st);
    const rank = c.fate === 'survived' ? (st.top ? `No way of playing your year of Florence does better than ${flo(st.best)}.` : `In your year of Florence (the same run, the same rival rates), the best of the ${st.n} ways to play ends worth ${flo(st.best)}.`)
      : `In your year of Florence, ${Math.round(100 * st.same / st.n)}% of the ${st.n} ways to play end this way, and the best ends worth ${flo(st.best)}. Another year brings a different run.`;
    return `<div class="seal ${c.fate === 'survived' ? 'good' : 'bad'}"><p class="seal-rank">${esc(rank)}</p><p class="seal-line" id="shareText">${esc(line)}${st.top ? ' Can you match it?' : ' Can you do better?'}</p>
      <div class="actions" style="margin-top:.5rem"><button class="btn gold" type="button" id="cardBtn">Share a picture of your bank</button><button class="btn quiet" type="button" id="shareBtn">Copy the line</button><span id="shareMsg" aria-live="polite"></span></div>
      <img class="card-preview" id="cardPreview" alt="" hidden></div>`;
  }
  // the share card: a small picture in the chronicle's style, with the fate, the worth, the standing and the link
  async function makeCard(c, ch) {
    const st = standing(ch), W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    try { await document.fonts.ready; } catch (e) { /* fonts optional */ }
    const black = '"Grenze Gotisch", Georgia, serif', disp = '"Texturina", Georgia, serif', txt = '"Alegreya", Georgia, serif';
    g.fillStyle = '#2E1C12'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#EDE0C4'; g.fillRect(44, 44, W - 88, H - 88);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#F0D489'); gr.addColorStop(0.5, '#C79A3A'); gr.addColorStop(1, '#8C6A22');
    g.strokeStyle = gr; g.lineWidth = 12; g.strokeRect(66, 66, W - 132, H - 132); g.strokeStyle = '#A8301C'; g.lineWidth = 2; g.strokeRect(86, 86, W - 172, H - 172);
    g.textAlign = 'center';
    g.fillStyle = '#A8301C'; g.font = `600 30px ${disp}`; g.fillText('Florence, 1338 to 1346', W / 2, 160);
    g.fillStyle = '#2A1C14'; g.font = `600 84px ${black}`; g.fillText('The Banker of Florence', W / 2, 250);
    // the fate's picture
    const im = new Image(); im.src = IMG[FATE_IMG[c.fate]].src; try { await im.decode(); const bw = W - 260, bh = 380, r = Math.max(bw / im.naturalWidth, bh / im.naturalHeight), sw = bw / r, sh2 = bh / r;
      g.fillStyle = gr; g.fillRect(122, 292, bw + 16, bh + 16); g.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh2) / 2, sw, sh2, 130, 300, bw, bh); } catch (e) { /* picture optional */ }
    g.fillStyle = c.fate === 'survived' ? '#2F5E4F' : '#8A2412'; g.font = `italic 600 40px ${txt}`;
    const head = c.fate === 'survived' ? 'My bank came through the 1340s' : c.fate === 'run' ? 'My bank closed in the run' : 'My bank fell with the king’s debts';
    g.fillText(head, W / 2, 770);
    if (c.fate === 'survived') { g.fillStyle = '#2A1C14'; g.font = `600 150px ${black}`; g.fillText(fl(c.W), W / 2, 930); g.font = `italic 40px ${txt}`; g.fillText('florins', W / 2, 985); }
    else { g.fillStyle = '#2A1C14'; g.font = `600 96px ${black}`; g.fillText(c.fate === 'run' ? 'Banca rotta' : 'Bankrupt', W / 2, 920); g.font = `italic 34px ${txt}`; g.fillText('a broken bench', W / 2, 975); }
    // a row of gold stacks, one for every 100 florins of worth (up to 15)
    const stacks = Math.max(0, Math.min(15, Math.floor(c.W / 100)));
    for (let i = 0; i < stacks; i++) { const x = W / 2 - (stacks - 1) * 26 + i * 52, y = 1060; const cg = g.createLinearGradient(x - 18, 0, x + 18, 0); cg.addColorStop(0, '#8C6A22'); cg.addColorStop(0.4, '#F0D489'); cg.addColorStop(1, '#8C6A22'); g.fillStyle = cg; g.fillRect(x - 18, y - 40, 36, 40); g.beginPath(); g.ellipse(x, y, 18, 7, 0, 0, Math.PI); g.fill(); g.fillStyle = '#E9C66E'; g.beginPath(); g.ellipse(x, y - 40, 18, 7, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#2A1C14'; g.font = `30px ${txt}`;
    const rank = c.fate === 'survived' ? (st.top ? 'As good as any banker in my year of Florence.' : `Ahead of ${st.pct}% of the ways to play my year of Florence.`) : `The best banker in my year of Florence ends worth ${fl(st.best)}.`;
    g.fillText(rank, W / 2, 1130);
    g.fillStyle = '#A8301C'; g.font = `italic 600 34px ${txt}`; g.fillText('Can you do better?', W / 2, 1190);
    g.fillStyle = '#5A4636'; g.font = `24px ${txt}`; g.fillText(location.href.split('#')[0].replace(/^https?:\/\//, ''), W / 2, 1240);
    return new Promise((res) => cv.toBlob((b) => res({ blob: b, url: cv.toDataURL('image/png') }), 'image/png'));
  }
  function showChronicle() {
    const ch = gameChoices(), c = C.chronicle(ch);
    if (!c) { const open = IDS[C.simulate(ch).done]; main.innerHTML = `<section class="leaf gate"><p class="rubric">Not yet</p><h2>Your bank’s story is not over yet</h2><p>Play <b>${esc(T[open].title)}</b> next.</p><div class="actions"><button class="btn" id="gateGo" type="button">Go to ${esc(T[open].title)}</button></div></section>`; $('#gateGo').addEventListener('click', () => go(open)); focusHead(); return; }
    if (!S.practice) markDone('story');
    const img = IMG[FATE_IMG[c.fate]];
    main.innerHTML = `${S.practice ? '<p class="banner"><b>Replay.</b> Not graded. Your receipt is unchanged.</p>' : ''}<article class="leaf chron" aria-labelledby="chronT">
      <div class="heading"><div><p class="rubric">The chronicle of your bank, 1338 to 1346</p><h2 id="chronT">How Your Bank Fared</h2>
        <p class="fate ${c.fate === 'survived' ? 'good' : 'bad'}">${esc(c.head)}</p></div>
        <figure class="mini" style="margin:0"><div class="frame"><img src="${img.src}" alt="${esc(img.alt)}" style="height:220px"></div><figcaption>${esc(img.cap)}</figcaption></figure></div>
      ${sealHtml(c, ch)}
      ${c.safe ? `<p class="safe">${esc(c.safe)}</p>` : ''}
      <ol class="entries">${c.items.map((x, i) => `<li><div><span class="num">${['I', 'II', 'III', 'IV', 'V'][i]}. ${esc(T[x.id].title)}</span><p class="text">${i === 0 ? initialSvg('I', 'c') + '<span class="sr-only">I</span>' + esc(x.text.slice(1)) : esc(x.text)}</p></div>
        <div class="gloss"><p>${esc(x.idea)}</p><p class="unit">${esc(x.unit)}</p></div></li>`).join('')}</ol>
      <section class="real"><h3>The Real Banks</h3><p>${c.real}</p></section>
      <div class="actions">${S.practice ? '<button class="btn" type="button" id="backRc">Back to my graded receipt</button><button class="btn quiet" type="button" id="againP">Play again</button>' : '<button class="btn" type="button" id="toNote">Next: Your note</button><button class="btn quiet" type="button" id="againP">Play again for another fate</button>'}</div></article>`;
    $('#againP').addEventListener('click', startPractice);
    if (S.practice) $('#backRc').addEventListener('click', endPractice); else $('#toNote').addEventListener('click', () => go('note'));
    const cb = $('#cardBtn'); if (cb) cb.addEventListener('click', async () => {
      const card = await makeCard(c, ch), file = new File([card.blob], 'my-bank-of-florence.png', { type: 'image/png' }), pv = $('#cardPreview');
      pv.src = card.url; pv.alt = 'Your share card: ' + $('#shareText').textContent; pv.hidden = false;
      let shared = false;
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: $('#shareText').textContent + ' ' + location.href.split('#')[0] }); shared = true; } } catch (e) { shared = false; }
      if (!shared) { const a = document.createElement('a'); a.href = URL.createObjectURL(card.blob); a.download = 'my-bank-of-florence.png'; document.body.appendChild(a); a.click(); a.remove(); }
      $('#shareMsg').textContent = shared ? 'Shared.' : 'Saved as a picture. Send it to a friend.';
    });
    const sh = $('#shareBtn'); if (sh) sh.addEventListener('click', async () => { const t = $('#shareText').textContent + ' ' + location.href.split('#')[0]; let done = false; try { await navigator.clipboard.writeText(t); done = true; } catch (e) { done = false; } $('#shareMsg').textContent = done ? 'Copied. Paste it to a friend.' : 'Select the line above and copy it.'; });
    focusHead();
  }

  // ---------------- the note ----------------
  function showNote() {
    const N = C.note, L = S.log.note;
    main.innerHTML = `<article class="leaf page note" aria-labelledby="noteT"><p class="rubric">In your own hand</p><h2 id="noteT">${esc(N.title)}</h2><p>${esc(N.prompt)}</p>
      <label for="memoText">Your note</label><textarea id="memoText" aria-describedby="memoHelp">${esc(S.memo)}</textarea>
      <p class="wc" id="memoHelp">Write 3 to 5 sentences (at least ${N.minWords} words) in your own words. Your note prints on your receipt. <span id="wc"></span></p>
      <div class="actions"><button class="btn" type="button" id="saveNote">Save my note</button><span id="saved" class="saved" aria-live="polite"></span></div>
      <div class="actions" id="nextRow" ${L.done ? '' : 'hidden'}><button class="btn gold" type="button" id="toRc">Go to your receipt</button></div></article>`;
    const ta = $('#memoText');
    const wc = () => { const n = h.wordCount(ta.value); $('#wc').textContent = n + (n === 1 ? ' word' : ' words') + ' so far.'; };
    ta.addEventListener('input', () => { if (!S.log.note.done || D.judgeNote(ta.value).ok) S.memo = ta.value; save(); wc(); if (S.log.note.done && !D.judgeNote(ta.value).ok) $('#wc').textContent += ` Under ${N.minWords} words: your saved note stays on your receipt.`; });
    wc();
    $('#saveNote').addEventListener('click', () => { const r = D.judgeNote(ta.value); if (r.ok || !S.log.note.done) S.memo = ta.value;
      if (r.ok) { markDone('note'); $('#saved').textContent = 'Saved. Your note will print on your receipt.'; $('#nextRow').hidden = false; $('#toRc').focus(); } else $('#saved').textContent = `Your note has ${r.words} words. Write at least ${N.minWords}.`; save(); });
    $('#toRc').addEventListener('click', () => go('receipt'));
    focusHead();
  }

  // ---------------- the receipt (version 1's payload, drawn on vellum) ----------------
  function wrapLines(g, text, maxW, maxLines) { const words = String(text).replace(/\s+/g, ' ').trim().split(' '); const lines = []; let cur = ''; for (const w of words) { const t2 = cur ? cur + ' ' + w : w; if (g.measureText(t2).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t2; } if (cur) lines.push(cur); if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += ' …'; } return lines; }
  async function makeReceipt() {
    const payload = D.makePayload(S.code, S.log, S.memo), n = D.STEPS.length, done = D.STEPS.filter((s) => S.log[s.id].done).length, pts = D.pointsFor(done);
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 1200; const g = cv.getContext('2d'); const W = 1200, H = 1200;
    try { await document.fonts.ready; } catch (e) { /* fonts optional */ }
    const disp = '"Texturina", Georgia, serif', txt = '"Alegreya", Georgia, serif';
    g.fillStyle = '#2E1C12'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#EDE0C4'; g.fillRect(30, 30, W - 60, H - 60);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#F0D489'); gr.addColorStop(0.5, '#C79A3A'); gr.addColorStop(1, '#8C6A22');
    g.strokeStyle = gr; g.lineWidth = 10; g.strokeRect(52, 52, W - 104, H - 104); g.strokeStyle = '#A8301C'; g.lineWidth = 2; g.strokeRect(70, 70, W - 140, H - 140);
    g.fillStyle = '#A8301C'; g.font = `600 26px ${disp}`; g.fillText('Florence, 1338 to 1346  ·  ' + C.story.kicker, 110, 140);
    g.fillStyle = '#2A1C14'; g.font = `600 64px ${disp}`; g.fillText(C.story.title, 110, 218);
    g.fillStyle = '#5A4636'; g.font = `30px ${txt}`; g.fillText('Desk code ' + h.fmtCode(S.code), 110, 280);
    g.fillStyle = done === n ? '#2F5E4F' : '#8A5A00'; g.fillRect(110, 320, W - 220, 100);
    g.fillStyle = '#FFF8EA'; g.font = `700 48px ${txt}`; g.fillText('Points: ' + pts + ' / ' + D.POINTS, 140, 388);
    g.font = `26px ${txt}`; g.textAlign = 'right'; g.fillText(done + ' of ' + n + ' steps complete · graded on completion', W - 140, 384); g.textAlign = 'left';
    const cols = 4, bw = (W - 220 - 3 * 12) / cols;
    D.STEPS.forEach((s, i) => { const x = 110 + (i % cols) * (bw + 12), y = 450 + Math.floor(i / cols) * 92, ok = S.log[s.id].done;
      g.fillStyle = ok ? '#DCE8DC' : '#F3D9D2'; g.fillRect(x, y, bw, 78); g.fillStyle = ok ? '#2F5E4F' : '#A8301C'; g.font = `700 21px ${txt}`; g.fillText((ok ? '✓ ' : '✗ ') + s.label, x + 14, y + 34, bw - 24); g.fillStyle = '#5A4636'; g.font = `18px ${txt}`; g.fillText(ok ? 'complete' : 'not finished', x + 14, y + 62); });
    const cr = C.chronicle(gameChoices()); if (cr) { g.fillStyle = cr.fate === 'survived' ? '#2F5E4F' : '#8A2412'; g.font = `italic 600 24px ${txt}`; g.fillText('This bank: ' + cr.head.replace(/^Your bank /, ''), 110, 450 + 2 * 92 + 20); }
    const ny = 450 + 2 * 92 + 70; g.fillStyle = '#2A1C14'; g.font = `700 26px ${txt}`; g.fillText(C.note.receiptHeading, 110, ny);
    g.font = `23px ${txt}`; (S.memo.trim() ? wrapLines(g, S.memo, W - 220, 8) : ['(no note yet)']).forEach((ln, i) => g.fillText(ln, 110, ny + 40 + i * 32));
    g.fillStyle = '#5A4636'; g.font = `21px ${txt}`; g.fillText('Issued ' + new Date(payload.issued).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }), 110, H - 170);
    g.fillStyle = '#2A1C14'; g.font = 'bold 28px ui-monospace, Menlo, monospace'; g.fillText('Verification code  ' + D.shortCode(payload.sum), 110, H - 128);
    g.fillStyle = '#5A4636'; g.font = `19px ${txt}`; g.fillText('Instructors: enter the points shown above. To spot-check, open ' + C.verifyUrl.replace('https://', ''), 110, H - 92);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); const bytes = new Uint8Array(await blob.arrayBuffer());
    return { blob: new Blob([D.addTextChunk(bytes, D.encodeReceipt(payload))], { type: 'image/png' }), url: cv.toDataURL('image/png'), payload, pts, done };
  }
  async function showReceipt() {
    if (S.practice) return endPractice();
    const r = await makeReceipt(), n = D.STEPS.length, all = r.done === n, file = C.filePrefix + '_' + h.fmtCode(S.code) + '.png';
    main.innerHTML = `<article class="leaf page" aria-labelledby="rcT"><p class="rubric">Your receipt</p><h2 id="rcT">${all ? 'Every step is complete.' : 'A few steps are still open.'}</h2>
      <p>${all ? 'Download your receipt and upload it to the assignment page.' : 'Finish the open steps for full credit, then download your receipt.'} <b>${r.pts} of ${D.POINTS} points.</b></p>
      <ul class="checklist">${D.STEPS.map((s) => `<li><span class="${S.log[s.id].done ? 'ok' : 'no'}">${S.log[s.id].done ? '✓' : '✗'}</span> ${esc(s.label)}${S.log[s.id].done ? '' : ` <button class="btn quiet" style="min-height:36px;padding:.2rem .7rem;font-size:15px" type="button" data-go="${s.id}">Go there</button>`}</li>`).join('')}</ul>
      <div class="actions"><a class="btn gold" id="dl" download="${file}" href="#">Download your receipt</a></div>
      <img class="receipt-img" alt="Receipt preview: desk code ${h.fmtCode(S.code)}, ${r.pts} of ${D.POINTS} points, ${r.done} of ${n} steps complete, verification code ${D.shortCode(r.payload.sum)}." src="${r.url}">
      <p class="wc">The file is named ${esc(file)}. Upload the downloaded file itself, not a screenshot: your instructor’s checker reads data stored inside the file.</p>
      <div class="actions" style="border-top:1.5px solid rgba(168,48,28,.35);padding-top:1rem"><p style="margin:0;flex:1 1 20rem"><b>Want to see another ending?</b> Play the five turns again with different choices. Replays are not graded and do not change this receipt.</p><button class="btn quiet" type="button" id="practice">Play again</button></div>
      <p class="wc">Your desk code is <b class="code" style="color:var(--ultramarine)">${h.fmtCode(S.code)}</b>. Use it to continue on another computer.</p></article>`;
    $('#dl').href = URL.createObjectURL(r.blob);
    $('#practice').addEventListener('click', startPractice);
    $$('button[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    focusHead();
  }
  // replays: a game of their own, kept in memory only
  function startPractice() { S.practice = (S.practice || 0) + 1; S.pchoices = {}; S.prate = null; go('t1'); }
  function endPractice() { S.practice = 0; S.pchoices = {}; S.prate = null; go('receipt'); }

  // ---------------- credits ----------------
  $('#creditsBtn').addEventListener('click', () => {
    const d = $('#credits'); d.querySelector('.leaf').innerHTML = `<h2 id="creditsTitle" style="font-size:28px">Image Credits</h2><ul>${CREDITS.map((c) => `<li><b>${esc(c[0])}.</b> ${esc(c[1])}. ${esc(c[2])}. <a href="${c[3]}" target="_blank" rel="noopener">Source<span class="sr-only"> (opens in a new tab)</span></a></li>`).join('')}</ul><p style="font-size:15px">Typefaces: Grenze Gotisch, Texturina and Alegreya, SIL Open Font License. Coastlines: Natural Earth, public domain. Drawings of the table, the people and the map marks are made for this game.</p><div class="actions"><button class="btn" type="button" id="closeCr">Close</button></div>`;
    d.showModal(); $('#closeCr').addEventListener('click', () => d.close()); $('#closeCr').focus();
  });

  // ---------------- resize: redraw the current turn if the table's shape changes ----------------
  let lastMode = null;
  window.addEventListener('resize', () => { if (!$('#stage')) return; const m = stageMode(); if (lastMode && m !== lastMode && STAGE && STAGE.mode !== m && IDS.includes(S.at) && (S.practice ? S.pchoices[S.at] != null : S.log[S.at].done)) go(S.at); lastMode = m; });

  // ---------------- boot ----------------
  const last = store.get(KEY + ':last'), lastSaved = last ? store.get(KEY + ':' + D.seedFor(last)) : null;
  if (lastSaved && lastSaved.code) { startFor(lastSaved.code); go(S.at && S.at !== 'start' ? S.at : firstOpen()); } else showTitle();

  // ---------------- self-checks (interactive-health contract) ----------------
  const checks = [];
  const reg = (name, fn) => checks.push({ name, fn });
  window.__selfCheck = async () => { const out = []; for (const c of checks) { try { const r = await c.fn(); out.push(r === true || r === undefined ? { name: c.name, ok: true } : r === false ? { name: c.name, ok: false } : { name: c.name, ok: !!r.ok, detail: r.detail }); } catch (e) { out.push({ name: c.name, ok: false, detail: String(e) }); } } return { ok: out.every((x) => x.ok), checks: out }; };
  reg('the model plays a known path', () => { const r = C.simulate({ t1: 'bill', t2: 'l1000', t3: 'none', t4: 'exchange', t5: 'pay' }); return (r.done === 5 && !r.failed && r.W === 1240) || { ok: false, detail: `expected survive worth 1240, got ${r.failed || 'survive'} ${r.W}` }; });
  reg('the run on the table matches the ledger', () => { for (const p of [{ t1: 'ship', t2: 'l3600', t3: 'none', t4: 'exchange', t5: 'pay' }, { t1: 'bill', t2: 'l2000', t3: 'half', t4: 'gift', t5: 'sell' }, { t1: 'refuse', t2: 'none', t3: 'most', t4: 'free', t5: 'bar' }]) { const r = C.simulate(p), rs = C.runScript(p); if (rs.V !== r.states[5].V || rs.M !== r.states[5].M || rs.closed !== (r.failed === 'run')) return { ok: false, detail: 'runScript disagrees on ' + JSON.stringify(p) }; } return true; });
  reg('every option of every turn is accepted', () => { for (const t of D.buildTasks('SELFCHEK')) { for (const v of t.values) if (!C.judgeTask(t, { choice: v }).ok) return { ok: false, detail: v + ' rejected' }; if (C.judgeTask(t, C.selfWrong(t)).ok) return { ok: false, detail: t.id + ' accepts a wrong value' }; } return true; });
  reg('a page view rendered', () => main.textContent.trim().length > 150 || { ok: false, detail: 'main is empty' });
  reg('the florin image loads', () => new Promise((res) => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0 || { ok: false, detail: 'florin.png has no width' }); im.onerror = () => res({ ok: false, detail: 'img/florin.png failed to load' }); im.src = 'img/florin.png'; }));
  reg('receipt PNG round-trips its payload', async () => {
    const code = 'SELFCHEK', tasks = D.buildTasks(code), log = {};
    D.STEPS.forEach((s) => { log[s.id] = s.kind === 'task' ? Object.assign({ done: true }, C.selfAnswer(tasks.find((t) => t.id === s.id))) : { done: true }; });
    const p = D.makePayload(code, log, 'word '.repeat(C.note.minWords + 5));
    const cv2 = document.createElement('canvas'); cv2.width = 20; cv2.height = 20; const blob = await new Promise((res) => cv2.toBlob(res, 'image/png'));
    const v = D.verifyPayload(D.decodeReceipt(D.readTextChunk(D.addTextChunk(new Uint8Array(await blob.arrayBuffer()), D.encodeReceipt(p)))));
    return (v.checksumOk && v.done === D.STEPS.length && v.points === D.POINTS) || { ok: false, detail: JSON.stringify(v.problems) };
  });
  window.__florence = { go, get state() { return S; }, choices: gameChoices };
})();
