/* The Banker of Florence, version 3: people at the bench. Visitors come to your bench one at a time and pitch you; your clerk
   tells you what is at stake and what just happened; the ledger shows what you have beside what you owe. The chart (chapter I)
   and the run (chapter V) keep their scenes. Every number comes from config.js (simulate, runScript, kingOptions).
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
  const phone = () => window.innerWidth < 861;
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


  // ---------------- images (all in img/; licenses in ../FACTS.md and the credits dialog) ----------------
  // Every image is loaded eagerly with its size set, retried once with a fresh URL if it fails, and hidden (never shown
  // broken) if the retry fails too. Upcoming pictures are fetched ahead of time.
  const IMG = {
    folio: { src: 'img/counting-house-folio.jpg', w: 820, h: 1317, alt: 'A fourteenth-century painting of a counting house in two scenes. Above, a banker in red sits behind a chest while men count gold coins on a table. Below, two bankers write in account books on a red cloth while a crowd waits.' },
    crowd: { src: 'img/counting-house-crowd.jpg', w: 820, h: 503, alt: 'A crowd presses toward two bankers writing in account books on a red cloth.' },
    goodcity: { src: 'img/lorenzetti-dancers.jpg', w: 900, h: 480, alt: 'Townspeople dance in a street of busy shops, in a fresco.' },
    badcity: { src: 'img/lorenzetti-ruin.jpg', w: 800, h: 425, alt: 'A city in ruins, with damaged houses and empty streets, in a fresco.' },
    street: { src: 'img/lorenzetti-street.jpg', w: 1500, h: 310 },
  };
  const FATE_IMG = { survived: 'goodcity', run: 'crowd', default: 'badcity' };
  const imgTag = (k, cls) => { const m = IMG[k]; return `<img class="${cls || ''}" src="${m.src}" width="${m.w}" height="${m.h}" alt="${esc(m.alt || '')}" decoding="async" data-src="${m.src}">`; };
  document.addEventListener('error', (e) => { const im = e.target; if (!(im instanceof HTMLImageElement) || !im.dataset.src) return;
    if (!im.dataset.retried) { im.dataset.retried = '1'; im.src = im.dataset.src + '?r=' + Date.now(); } else { const f = im.closest('figure') || im; f.hidden = true; } }, true);
  Object.values(IMG).forEach((m) => { const i = new Image(); i.src = m.src; });   // warm the cache
  const CREDITS = [
    ['A counting house (the title picture and the run ending)', 'Cocharelli treatise on the vices, Genoa, 14th century, British Library Add MS 27695, f. 8', 'CC0, released by the British Library', 'https://commons.wikimedia.org/wiki/File:Counting_house_scenes_-_Treatise_on_the_Vices_(late_14th_C),_f.8_-_BL_Add_MS_27695.jpg'],
    ['Effects of Good Government in the City (the street behind your bench, and the survivors’ ending)', 'Ambrogio Lorenzetti, Palazzo Pubblico, Siena, 1338 to 1339', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Ambrogio_Lorenzetti_-_Effects_of_Good_Government_in_the_city_-_Google_Art_Project.jpg'],
    ['Effects of Bad Government in the City (detail)', 'Ambrogio Lorenzetti, Palazzo Pubblico, Siena, 1338 to 1339', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Ambrogio_Lorenzetti_-_Bad_Government_and_the_Effects_of_Bad_Government_on_the_City_Life_-_WGA13499.jpg'],
    ['Gold florin of Florence, 1323 (the coins)', 'Photograph by Sailko, Teylers Museum', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Firenze,_fiorino_d%27oro,_1323.jpg'],
    ['Coastlines, lakes and rivers on the chart', 'Natural Earth, 1:50m physical data, drawn in the manner of Angelino Dulcert’s sea chart of 1339', 'Public domain', 'https://www.naturalearthdata.com/'],
  ];

  // ---------------- state ----------------
  // S.log[id] = { done, attempts, help, choice (with the desk's suffix), at }; t2 also keeps `lend` (the borrowers accepted),
  // t4 keeps `rate` (the bill's rate). A chapter's choice is final once made.
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
  // This play's year of Florence (run size and pace, rival rate, exchange move, whether the hooded dealer vanishes), seeded
  // by the desk code. Every replay is a new year.
  const yearFor = () => C.yearFrom(h.mulberry32(h.fnv1a(S.code + '|florence-year' + (S.practice ? '|P' + S.practice : ''))));
  function gameChoices() {
    const c = S.practice ? Object.assign({}, S.pchoices) : choices(); c._year = yearFor();
    const r = S.practice ? S.prate : (S.log.t4 && S.log.t4.rate); if (r != null) c.rate = r;
    const l = S.practice ? S.plend : (S.log.t2 && S.log.t2.lend); if (Array.isArray(l)) c.lend = l;
    return c;
  }
  function commitChoice(id, key, extra) {
    if (S.practice) { S.pchoices[id] = key; if (extra && extra.lend) S.plend = extra.lend; return; }
    const t = S.tasks.find((x) => x.id === id), v = t.values[C.OPT[id].indexOf(key)], L = S.log[id];
    L.choice = v; L.attempts = Math.max(L.attempts || 0, 1); if (extra) Object.assign(L, extra); if (!L.done) { L.done = true; L.at = new Date().toISOString(); }
    save(); renderChapters();
  }
  function markDone(id) { const L = S.log[id]; if (!L.done) { L.done = true; L.at = new Date().toISOString(); save(); renderChapters(); } }

  // ---------------- chapters ----------------
  const NUM = ['I', 'II', 'III', 'IV', 'V'];
  const CH = [...IDS.map((id, i) => ({ id, glyph: NUM[i], label: T[id].title })), { id: 'story', glyph: 'book', label: 'Your bank’s chronicle' }, { id: 'note', glyph: 'pen', label: 'Your note' }, { id: 'receipt', glyph: 'seal', label: 'Receipt' }];
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
    $('#codeNote').innerHTML = S.code ? ` Desk code <span class="code">${h.fmtCode(S.code)}</span> continues it on another computer.` : '';
    document.body.classList.toggle('playing', !!S.code && S.at !== 'start');
    if (!S.code || S.at === 'start') return;
    CH.forEach((c) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button';
      const done = c.id === 'receipt' ? D.STEPS.every((s) => S.log[s.id].done) : (S.practice ? false : S.log[c.id].done);
      b.innerHTML = GLYPH[c.glyph] || c.glyph; if (done) b.classList.add('done'); if (S.at === c.id) b.setAttribute('aria-current', 'step');
      b.setAttribute('aria-label', c.label + (done ? ', done' : '')); b.title = c.label;
      if (!reachable(c.id)) b.disabled = true; else b.addEventListener('click', () => go(c.id));
      li.appendChild(b); ol.appendChild(li);
    });
  }
  function go(id) {
    animGen++; hurry = false; S.at = id; save(); renderChapters(); window.scrollTo(0, 0);
    if (id === 'start') return showTitle();
    if (IDS.includes(id)) return showChapter(id);
    if (id === 'story') return showChronicle();
    if (id === 'note') return showNote();
    return showReceipt();
  }
  const focusHead = () => { const hd = $('#main h1, #main h2'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); } };

  // ---------------- title ----------------
  const initialSvg = (letter, id) => `<svg class="initial" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="gl${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7E3A3"/><stop offset=".45" stop-color="#C79A3A"/><stop offset=".7" stop-color="#F0D489"/><stop offset="1" stop-color="#8C6A22"/></linearGradient></defs>
    <rect x="3" y="3" width="94" height="94" fill="#22408C" stroke="url(#gl${id})" stroke-width="5"/>
    <path d="M10 10h80v80h-80z" fill="none" stroke="#F0D489" stroke-width=".8" stroke-dasharray="2 3" opacity=".7"/>
    <path d="M20 50c8-14 22-16 30-6M80 50c-8 14-22 16-30 6" fill="none" stroke="#A8301C" stroke-width="2.2" opacity=".85"/>
    <text x="50" y="76" text-anchor="middle" font-family="Texturina, Georgia, serif" font-weight="700" font-size="70" fill="url(#gl${id})" stroke="#5b3a12" stroke-width=".8">${letter}</text></svg>`;
  function showTitle() {
    S.at = 'start';
    const last = store.get(KEY + ':last'), saved = last ? store.get(KEY + ':' + D.seedFor(last)) : null;
    main.innerHTML = `<section class="title">
      <figure class="plate"><div class="frame">${imgTag('folio')}</div></figure>
      <div class="leaf">
        <p class="rubric">Florence, 1338</p>
        <h1>The Banker of Florence</h1>
        <p class="hook">Europe’s two biggest banks failed in the 1340s. Can yours survive?</p>
        <p>You run a small bank from a bench in the market, a <i>banca</i>. People will come to your bench with money, with requests, and with trouble. You decide.</p>
        <div class="actions">${saved ? '<button class="btn" type="button" id="goBtn">Continue your bank</button>' : '<button class="btn" type="button" id="goBtn">Open the bank</button>'}</div>
        <p class="credit">There are no wrong choices. Reach the end of your bank’s story and download your receipt: that earns all 20 points.</p>
        ${saved ? `<p class="small-note">Your desk code is <b class="code" style="color:var(--ultramarine)">${h.fmtCode(last)}</b>.</p>` : ''}
        <details class="resume"><summary>Started on another computer?</summary>
          <form id="codeForm" novalidate><label for="dc">Your desk code</label>
          <input type="text" id="dc" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" aria-describedby="dcHelp">
          <p class="small-note" id="dcHelp">It is at the bottom of every page and on your receipt.</p>
          <p class="err" id="startErr" role="alert"></p>
          <button class="btn quiet" type="submit">Continue with this code</button></form></details>
      </div></section>`;
    $('#goBtn').addEventListener('click', () => { startFor(saved ? last : h.newCode()); go(S.at && S.at !== 'start' ? S.at : firstOpen()); });
    $('#codeForm').addEventListener('submit', (e) => {
      e.preventDefault(); const v = $('#dc').value;
      if (!h.validCode(v)) { $('#startErr').textContent = 'A desk code is 8 letters and numbers, like ABCD-2345.'; $('#dc').focus(); return; }
      startFor(v); go(S.at && S.at !== 'start' ? S.at : firstOpen());
    });
    renderChapters();
  }

  // ---------------- portraits: people in the manner of the miniatures, drawn simply ----------------
  // Each is a half-figure in a gilt niche with a patterned ground. Faces are two dots and a line; the costume and the prop
  // say who they are.
  const SKIN = '#E6C29A';
  function portrait(kind) {
    const P = {
      lapo: { robe: '#A8301C', hat: 'cap', capC: '#22408C', prop: 'bale', mood: 'plain' },
      nun: { robe: '#2A1C14', hat: 'veil', prop: 'kettle', mood: 'kind' },
      silk: { robe: '#5B4A8A', hat: 'coif', capC: '#EDE0C4', prop: 'silk', mood: 'plain' },
      alum: { robe: '#3A3530', hat: 'deephood', capC: '#2A2622', prop: 'purse', mood: 'shifty' },
      depositors: { group: true },
      envoy: { robe: '#22408C', hat: 'hat', capC: '#1D2F66', prop: 'letter', mood: 'plain', lions: true },
      noble: { robe: '#7A1F1A', hat: 'beret', capC: '#2A1C14', prop: 'cup', mood: 'smug', fur: true, chain: true },
      friar: { robe: '#6B5440', hat: 'tonsure', prop: 'book', mood: 'stern' },
      clerk: { robe: '#3D7563', hat: 'cap', capC: '#A8301C', prop: 'quill', mood: 'kind' },
    }[kind] || {};
    const niche = `<defs><pattern id="pg-${kind}" patternUnits="userSpaceOnUse" width="22" height="22"><rect width="22" height="22" fill="#22408C"/><path d="M11 2L20 11L11 20L2 11Z" fill="none" stroke="#C79A3A" stroke-width="1.2"/><circle cx="11" cy="11" r="1.8" fill="#A8301C"/></pattern>
      <linearGradient id="pgold-${kind}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#F0D489"/><stop offset=".5" stop-color="#C79A3A"/><stop offset="1" stop-color="#8C6A22"/></linearGradient></defs>
      <path d="M8 216V70C8 30 50 8 100 8s92 22 92 62v146z" fill="url(#pg-${kind})"/>
      <path d="M8 216V70C8 30 50 8 100 8s92 22 92 62v146" fill="none" stroke="url(#pgold-${kind})" stroke-width="8"/>`;
    if (P.group) {   // three depositors with purses
      const one = (x, robe, hat, s) => `<g transform="translate(${x} 0) scale(${s})">${figure({ robe, hat, capC: '#B8862E', prop: 'purse', mood: 'plain' })}</g>`;
      return `<svg viewBox="0 0 200 220" aria-hidden="true">${niche}<g transform="translate(-28 30) scale(.82)">${one(0, '#B8862E', 'cap', 1)}</g><g transform="translate(68 30) scale(.82)">${one(0, '#8C8478', 'hood', 1)}</g><g transform="translate(20 46) scale(.8)">${one(0, '#2A1C14', 'veil', 1)}</g></svg>`;
    }
    return `<svg viewBox="0 0 200 220" aria-hidden="true">${niche}${figure(P)}</svg>`;
  }
  function figure(P) {
    const ink = '#2A1C14';
    let s = '';
    // shoulders and robe
    s += `<path d="M30 220C32 176 56 154 100 152s68 24 70 68z" fill="${P.robe}" stroke="${ink}" stroke-width="2.5"/>`;
    if (P.fur) s += `<path d="M48 172c16 12 88 12 104 0" fill="none" stroke="#EDE0C4" stroke-width="14" stroke-linecap="round"/><path d="M48 172c16 12 88 12 104 0" fill="none" stroke="#C9B386" stroke-width="2" stroke-dasharray="3 4"/>`;
    if (P.chain) s += `<path d="M66 168c10 26 58 26 68 0" fill="none" stroke="#E9C66E" stroke-width="3.5" stroke-dasharray="5 2"/><circle cx="100" cy="190" r="6" fill="#E9C66E" stroke="${ink}"/>`;
    if (P.lions) s += `<path d="M78 168h44v26c0 12-10 20-22 24-12-4-22-12-22-24z" fill="#A8301C" stroke="#E9C66E" stroke-width="2"/>${[0, 1, 2].map((i) => `<path d="M86 ${176 + i * 12}h18l5-3 3 3-4 3h-4l-2 3h-4l1-3h-9l-2 3h-3z" fill="#E9C66E"/>`).join('')}`;
    if (P.hat === 'tonsure') s += `<path d="M64 60c0-30 72-30 72 0" fill="none" stroke="${P.robe}" stroke-width="18"/>`;
    // neck and head
    s += `<rect x="90" y="128" width="20" height="26" fill="${SKIN}" stroke="${ink}" stroke-width="2"/>`;
    if (P.hat === 'deephood') s += `<path d="M54 160C46 92 66 48 100 48s54 44 46 112z" fill="${P.capC}" stroke="${ink}" stroke-width="2.5"/>`;
    if (P.hat === 'veil') s += `<path d="M58 160c-6-50 6-98 42-98s48 48 42 98z" fill="#1C1410" stroke="${ink}" stroke-width="2"/><path d="M70 150c-4-34 6-70 30-70s34 36 30 70c-10 8-50 8-60 0z" fill="#F2EEE4" stroke="${ink}" stroke-width="2"/>`;
    s += `<ellipse cx="100" cy="${P.hat === 'veil' ? 110 : 104}" rx="${P.hat === 'veil' ? 23 : 28}" ry="${P.hat === 'veil' ? 27 : 32}" fill="${SKIN}" stroke="${ink}" stroke-width="2.5"/>`;
    const ey = P.hat === 'veil' ? 108 : 102;
    // the face: two dots, brows and a mouth that set the mood
    const brows = { stern: `M82 ${ey - 9}l12 4M118 ${ey - 9}l-12 4`, smug: `M82 ${ey - 8}c4-3 9-3 12 0M106 ${ey - 8}c4-3 9-3 12 0`, shifty: `M82 ${ey - 6}h12M106 ${ey - 6}h12`, kind: `M83 ${ey - 9}c4-3 8-3 11 0M106 ${ey - 9}c4-3 8-3 11 0`, plain: `M83 ${ey - 8}h11M106 ${ey - 8}h11` }[P.mood || 'plain'];
    const eyes = P.mood === 'smug' ? `<path d="M84 ${ey}h9M107 ${ey}h9" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>` : P.mood === 'shifty' ? `<circle cx="93" cy="${ey}" r="3" fill="${ink}"/><circle cx="116" cy="${ey}" r="3" fill="${ink}"/>` : `<circle cx="89" cy="${ey}" r="3.2" fill="${ink}"/><circle cx="111" cy="${ey}" r="3.2" fill="${ink}"/>`;
    const mouth = { stern: `M90 ${ey + 22}h20`, smug: `M88 ${ey + 20}c8 6 16 6 24-2`, shifty: `M92 ${ey + 22}c6-2 12-2 16 1`, kind: `M90 ${ey + 19}c6 5 14 5 20 0`, plain: `M91 ${ey + 21}h18` }[P.mood || 'plain'];
    s += `<path d="${brows}" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>${eyes}<path d="M100 ${ey + 4}l-3 9h5" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/><path d="${mouth}" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (P.mood === 'smug') s += `<circle cx="80" cy="${ey + 12}" r="6" fill="#D9776A" opacity=".45"/><circle cx="120" cy="${ey + 12}" r="6" fill="#D9776A" opacity=".45"/>`;
    // headgear
    if (P.hat === 'cap') s += `<path d="M70 86c-2-26 62-26 60 0c-12-6-48-6-60 0z" fill="${P.capC}" stroke="${ink}" stroke-width="2.5"/>`;
    if (P.hat === 'coif') s += `<path d="M72 96c-4-34 60-34 56 0c-10-8-46-8-56 0z" fill="${P.capC}" stroke="${ink}" stroke-width="2.2"/><path d="M72 96c-2 14 0 30 6 40M128 96c2 14 0 30-6 40" fill="none" stroke="${P.capC}" stroke-width="6"/>`;
    if (P.hat === 'hood') s += `<path d="M64 120c-8-60 80-60 72 0l-8-4c2-40-58-40-56 0z" fill="${P.capC}" stroke="${ink}" stroke-width="2.2"/>`;
    if (P.hat === 'deephood') s += `<path d="M66 100C70 64 130 64 134 100C122 84 78 84 66 100z" fill="${P.capC}" stroke="${ink}" stroke-width="2.5"/><path d="M72 96c10-8 46-8 56 0v12c-16-6-40-6-56 0z" fill="#000" opacity=".5"/>`;
    if (P.hat === 'hat') s += `<ellipse cx="100" cy="76" rx="46" ry="9" fill="${P.capC}" stroke="${ink}" stroke-width="2.2"/><path d="M76 76c0-30 48-30 48 0z" fill="${P.capC}" stroke="${ink}" stroke-width="2.2"/>`;
    if (P.hat === 'beret') s += `<path d="M64 84c-6-28 70-36 76-4c-20-8-56-8-76 4z" fill="${P.capC}" stroke="${ink}" stroke-width="2.4"/><path d="M128 74c12-8 22-4 26 4" fill="none" stroke="#A8301C" stroke-width="4" stroke-linecap="round"/>`;
    if (P.hat === 'tonsure') s += `<path d="M74 86c4-22 48-22 52 0c-6-6-14-9-26-9s-20 3-26 9z" fill="#5A4636"/><ellipse cx="100" cy="78" rx="18" ry="7" fill="${SKIN}" stroke="${ink}" stroke-width="1.5"/>`;
    // props held up in front
    const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="${SKIN}" stroke="${ink}" stroke-width="2"/>`;
    if (P.prop === 'kettle') s += `<path d="M126 176c0-14 34-14 34 0v22c0 8-34 8-34 0z" fill="#9C7A4A" stroke="${ink}" stroke-width="2.2"/><path d="M126 182h34M160 182c8 0 10 12 2 14" fill="none" stroke="${ink}" stroke-width="2"/>${hand(130, 196)}`;
    if (P.prop === 'silk') s += `<rect x="124" y="164" width="44" height="36" rx="6" fill="#C8442A" stroke="${ink}" stroke-width="2"/><path d="M128 172h36M128 182h36M128 192h36" stroke="#F0D489" stroke-width="2"/>${hand(130, 200)}`;
    if (P.prop === 'bale') s += `<rect x="122" y="166" width="48" height="36" rx="5" fill="#EDE0C4" stroke="${ink}" stroke-width="2"/><path d="M134 166v36M158 166v36" stroke="#8C6A22" stroke-width="3"/>${hand(126, 200)}`;
    if (P.prop === 'purse') s += `<path d="M128 182c-6 12 0 24 14 24s20-12 14-24z" fill="#7A4A22" stroke="${ink}" stroke-width="2"/><path d="M132 182c4 4 16 4 20 0" stroke="#E9C66E" stroke-width="2.5" fill="none"/>${hand(132, 202)}`;
    if (P.prop === 'letter') s += `<g transform="rotate(-8 146 186)"><rect x="124" y="170" width="46" height="32" fill="#EDE0C4" stroke="${ink}" stroke-width="2"/><circle cx="147" cy="190" r="7" fill="#A8301C" stroke="#6E1D10"/></g>${hand(126, 200)}`;
    if (P.prop === 'cup') s += `<path d="M132 148h26l-4 18c-2 6-16 6-18 0z" fill="#E9C66E" stroke="${ink}" stroke-width="2"/><path d="M140 140h10" stroke="#7A1F1A" stroke-width="4"/><path d="M145 166v12M136 180h18" stroke="${ink}" stroke-width="2.5"/>${hand(146, 180)}`;
    if (P.prop === 'book') s += `<path d="M122 174l26-6 26 6v28l-26-6-26 6z" fill="#7A1F1A" stroke="${ink}" stroke-width="2"/><path d="M148 168v28" stroke="#E9C66E" stroke-width="2"/>${hand(64, 150)}<path d="M64 142v-16" stroke="${SKIN}" stroke-width="6" stroke-linecap="round"/>`;
    if (P.prop === 'quill') s += `<path d="M140 206l26-52c4 0 8 4 6 8l-28 46z" fill="#EDE0C4" stroke="${ink}" stroke-width="2"/><path d="M144 200l22-42" stroke="${ink}" stroke-width="1"/>${hand(142, 202)}`;
    return s;
  }
  // the clerk's small portrait
  const clerkFace = () => `<svg viewBox="40 52 120 120" aria-hidden="true">${figure({ robe: '#3D7563', hat: 'cap', capC: '#A8301C', mood: 'kind' })}</svg>`;

  // ---------------- motion helpers shared by every chapter ----------------
  let hurry = false;
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
  function drawChart(st, keep, opts) {
    opts = opts || {};
    const vb = opts.view || MAP.view.wide; st.innerHTML = ''; st.classList.remove('street', 'run'); st.classList.add('chartstage'); setClerk('over');
    if (keep) st.appendChild(keep);
    const holder = document.createElement('div'); holder.className = 'chart'; st.appendChild(holder);
    const svg = E('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': 'A sea chart of western Europe. Florence is in Italy at the bottom right; Bruges is in Flanders at the top left; the road between them crosses the Alps.' }, holder);
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
    const roadPts = opts.road || MAP.road;
    E('path', { d: smooth(roadPts), fill: 'none', stroke: '#EDE0C4', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.8 }, svg);
    const road = E('path', { d: smooth(roadPts), fill: 'none', stroke: '#A8301C', 'stroke-width': 3.6, 'stroke-dasharray': '9 7', 'stroke-linecap': 'round' }, svg);
    const lab = (x, y, t, size, col, anchor) => { const tx = E('text', { x, y, 'text-anchor': anchor || 'middle', 'font-family': 'Texturina, Georgia, serif', 'font-weight': 600, 'font-size': size || 28, fill: col || '#A8301C', stroke: '#EDE0C4', 'stroke-width': 5, 'paint-order': 'stroke' }, svg); tx.textContent = t; return tx; };
    const city = (p) => { E('circle', { cx: p[0], cy: p[1], r: 10, fill: 'url(#gold)', stroke: '#2A1C14', 'stroke-width': 2.4 }, svg); };
    city(MAP.florence); city(MAP.bruges);
    lab(MAP.florence[0] + 16, MAP.florence[1] + 36, 'Florence', 28, '#A8301C', 'start'); lab(MAP.bruges[0] - 14, MAP.bruges[1] - 18, 'Bruges', 28, '#A8301C', 'end');
    lab(geo(12.6, 47.7)[0], geo(12.6, 47.7)[1], 'the Alps', 22, '#2A1C14');
    // robbers wait in the pass
    const robbers = E('g', opts.noRobbers ? { display: 'none' } : {}, svg), rp = geo(8.1, 46.25);
    [[0, 0], [22, -12]].forEach(([dx, dy]) => { const x = rp[0] + dx - 30, y = rp[1] + dy; E('circle', { cx: x, cy: y - 15, r: 5.5, fill: '#2A1C14' }, robbers); E('path', { d: `M${x - 8} ${y + 6}L${x} ${y - 9}L${x + 8} ${y + 6}Z`, fill: '#2A1C14' }, robbers); E('path', { d: `M${x + 7} ${y - 6}l11 -12`, stroke: '#2A1C14', 'stroke-width': 2.2 }, robbers); });
    if (!opts.noRobbers) lab(rp[0] - 34, rp[1] + 30, 'robbers', 18, '#2A1C14');
    if (opts.cities) opts.cities.forEach(([p, t, dx, dy, anchor]) => { city(p); lab(p[0] + (dx || 0), p[1] + (dy || 0), t, 28, '#A8301C', anchor || 'middle'); });
    const fx = E('g', {}, svg);
    return { svg, road, robbers, fx, vb, lab, city };
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
  function place(s, x, y, sc) { s.x = x; s.y = y; const k = (sc || 1) * (s.sc || 1); s.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${k !== 1 ? ` scale(${k.toFixed(3)})` : ''}`); }
  function slot(P, i) { const G = P.G; return [G.x0 + (i % G.cols) * G.dx, G.y0 + Math.floor(i / G.cols) * G.dy]; }
  function zsort() { const L = STAGE.layers.stacks; [...L.children].sort((a, b) => (a.__y || 0) - (b.__y || 0)).forEach((c) => L.appendChild(c)); }
  function fill(name, amount) {   // put `amount` florins into a place as full stacks and one short one, no motion
    const P = STAGE.places[name]; P.stacks.forEach((s) => s.g.remove()); P.stacks = [];
    // the short stack goes first, so gold pulled from the end of a place comes off in full stacks
    const part = amount % 100, sizes = []; if (part > 0.5) sizes.push(part); for (let k = 0; k < Math.floor(amount / 100 + 1e-9); k++) sizes.push(100);
    sizes.forEach((a, i) => { const [x, y] = slot(P, i); const s = newStack(a, x, y); s.sc = P.G.scale || 1; place(s, x, y); s.g.__y = y; P.stacks.push(s); });
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
      else { s.amount -= left; drawStack(s.g, s.amount, s.kind); const n = newStack(left, s.x, s.y, s.kind); n.sc = s.sc; place(n, s.x, s.y); out.push(n); left = 0; }
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
    while (left > 0.5) { const a = Math.min(100, left); const s = newStack(a, from[0], from[1]); s.sc = P.G.scale || 1; const [x, y] = slot(P, P.stacks.length); P.stacks.push(s); jobs.push(wait((opts.stagger || 45) * j).then(() => fly(s, x, y, opts.ms || 520, 70))); left -= a; j++; }
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

  // ---------------- the chapter screen: a scene (visitor, chart or street), choices, the clerk, and the ledger ----------------
  let STAGE = null;
  function showChapter(id) {
    const k = IDS.indexOf(id), ch = gameChoices(), sim = C.simulate(ch);
    if (sim.done < k) {
      const open = IDS[sim.done];
      main.innerHTML = `<section class="leaf gate"><h2>${esc(T[id].title)}</h2><p>Your bank’s story has to happen in order. Play <b>${esc(T[open].title)}</b> first.</p><div class="actions"><button class="btn" type="button" id="gateGo">Go to ${esc(T[open].title)}</button></div></section>`;
      $('#gateGo').addEventListener('click', () => go(open)); focusHead(); return;
    }
    const done = ch[id] != null;
    main.innerHTML = `${S.practice ? '<p class="banner"><b>Another year.</b> Not graded; your receipt is unchanged.</p>' : ''}<section class="play">
      <div class="scene">
        <header class="scenehead"><p class="rubric">${esc(String(T[id].year === 1345 ? 'A few years later' : T[id].year))}</p><h2 id="chT">${NUM[k]}. ${esc(T[id].title)}</h2></header>
        <div class="stagewrap" id="stagewrap" data-clerk="side"><div class="stage" id="stage"></div>
          <div class="clerk" id="clerk"><div class="clerkface" title="Iacopo, your clerk">${clerkFace()}</div><div class="bubble"><p class="who">Iacopo, your clerk</p><p class="say" id="say" aria-live="polite"></p></div></div></div>
        <div class="choices" id="choices" role="group" aria-labelledby="chT"></div>
      </div>
      <aside class="side" aria-label="Your bank">
        <details class="ledger2" id="ledger"${phone() ? '' : ' open'}></details>
      </aside></section>`;
    focusHead();
    $('#stage').addEventListener('click', () => { if (!$('#choices button')) hurry = true; });
    writeLedger(sim.states[k], null);
    CHAPTER[id]({ id, k, ch, sim, before: sim.states[k], done });
  }
  // the clerk speaks: what is at stake before a choice, what happened after it
  // The clerk stands beside the visitor (or over the chart and the street) and speaks in type at least as large as the
  // visitor's own; a new line arrives just before the buttons wake, so it is read first.
  let saidAt = 0;
  const say = (html) => { const s = $('#say'); if (!s) return; s.innerHTML = html; s.parentNode.classList.remove('fresh'); void s.offsetWidth; s.parentNode.classList.add('fresh'); saidAt = performance.now(); };
  const setClerk = (mode) => { const w = $('#stagewrap'); if (w) w.dataset.clerk = mode; };
  // choices: big buttons under the scene. Each has a name and, where it helps, what it risks and pays.
  function choose(list) {
    const box = $('#choices'); box.innerHTML = ''; box.className = 'choices' + (list.length > 2 ? ' many' : '');
    return new Promise((res) => {
      list.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pick ' + (c.cls || '');
        b.innerHTML = `<b>${esc(c.text)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}`; if (c.disabled) b.disabled = true;
        b.addEventListener('click', () => { box.querySelectorAll('button').forEach((x) => { x.disabled = true; }); res(c.value != null ? c.value : i); });
        box.appendChild(b); });
      // the buttons wake a moment after the clerk's newest line, so the line is seen first
      const hold = reduced() ? 0 : Math.max(0, saidAt + 650 - performance.now());
      const all = [...box.querySelectorAll('button')].filter((b) => !b.disabled);
      if (hold) { all.forEach((b) => { b.disabled = true; b.classList.add('waking'); }); setTimeout(() => { all.forEach((b) => { if (b.classList.contains('waking')) { b.disabled = false; b.classList.remove('waking'); } }); const f = box.querySelector('button:not([disabled])'); if (f && !phone()) f.focus({ preventScroll: true }); }, hold); }
      else { const first = box.querySelector('button:not([disabled])'); if (first && !phone()) first.focus({ preventScroll: true }); }
    });
  }
  const clearChoices = () => { const b = $('#choices'); if (b) b.innerHTML = ''; };
  function nextButton(k) {
    const next = k < 4 ? IDS[k + 1] : 'story';
    return choose([{ text: k < 4 ? `Next: ${T[next].title}` : (S.practice ? 'See how this bank fared' : 'Read your bank’s chronicle'), cls: 'go' }]).then(() => go(next));
  }

  // the ledger: what you have on one side, what you owe on the other; worth is the difference, written out
  let ledgerPrev = null;
  function writeLedger(st, prev, opts) {
    const box = $('#ledger'); if (!box) return; opts = opts || {};
    const have = [['Coins in the vault', st.V], ['Loans to merchants', st.M], ['Loan to King Edward', st.K]].filter((r, i) => i === 0 || r[1] || (i === 1 && st.O) || (i === 2 && opts.king));
    const owe = [['Owed to depositors', st.O]];
    const H = st.V + st.M + st.K, O = st.O, W = H - O, old = ledgerPrev || {};
    const cell = (k, v) => `<span class="num${old[k] != null && old[k] !== v ? ' changed' : ''}">${fl(v)}</span>`;
    box.innerHTML = `<summary><span class="lt">Your bank</span><span class="lw">worth <b>${fl(W)}</b></span></summary>
      <div class="sides"><div class="side-have"><h3>What you have</h3>${have.map(([l, v], i) => `<p class="${opts.struck && i === 2 ? 'struck' : ''}"><span>${l}</span>${cell('h' + i, v)}</p>`).join('')}<p class="sum"><span>Total</span>${cell('H', H)}</p></div>
      <div class="side-owe"><h3>What you owe</h3>${owe.map(([l, v], i) => `<p><span>${l}</span>${cell('o' + i, v)}</p>`).join('')}<p class="sum"><span>Total</span>${cell('O', O)}</p></div></div>
      <p class="worth">Worth: ${fl(H)} − ${fl(O)} = <b>${fl(W)}</b></p>${st.failed ? '<p class="closed">Your bank has closed.</p>' : ''}
      ${vaultMini(st.V)}`;
    ledgerPrev = { h0: st.V, h1: st.M, h2: st.K, H, o0: O, O };
    if (prev) Sound.play('quill');
  }
  // the vault, compact: one small stack for every 100 florins in it
  function vaultMini(V) {
    const n = Math.min(60, Math.floor(V / 100)), cols = 15;
    let s = ''; for (let i = 0; i < n; i++) { const x = 10 + (i % cols) * 17, y = 26 + Math.floor(i / cols) * 13; s += `<g transform="translate(${x} ${y})"><rect x="-6" y="-8" width="12" height="8" fill="#C79A3A"/><ellipse cy="0" rx="6" ry="2.4" fill="#8C6A22"/><ellipse cy="-8" rx="6" ry="2.4" fill="#F0D489" stroke="#8C6A22" stroke-width=".6"/></g>`; }
    return `<div class="vaultmini" aria-hidden="true"><svg viewBox="0 0 264 ${Math.max(40, 30 + Math.ceil(n / cols) * 13)}">${s}</svg></div>`;
  }

  // ---------------- a visitor: a card that comes to the bench (swipe it, or press a choice) ----------------
  function visitor(kind, who, role, line, opts) {
    opts = opts || {};
    const st = $('#stage'); st.classList.add('street'); st.classList.remove('chartstage', 'run'); st.innerHTML = ''; setClerk('side');
    const card = document.createElement('article'); card.className = 'card' + (opts.small ? ' small' : ''); card.setAttribute('aria-label', `${who}, ${role}`);
    card.innerHTML = `<div class="portrait">${portrait(kind)}</div><div class="cardtext"><p class="who">${esc(who)}<span>${esc(role)}</span></p><p class="line">“${esc(line)}”</p>${opts.ask ? `<p class="ask">${esc(opts.ask)}</p>` : ''}</div>
      <span class="stamp yes">${esc(opts.yes || 'Yes')}</span><span class="stamp no">${esc(opts.no || 'No')}</span>`;
    st.appendChild(card);
    if (!reduced()) card.animate([{ transform: 'translateY(40px) rotate(-2deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return card;
  }
  // a yes/no visitor: swipe right to agree, left to refuse, or press the buttons; resolves true or false
  function decideCard(card, yesText, noText) {
    let x0 = null, dx = 0, done = false;
    return new Promise((res) => {
      const finish = (yes) => { if (done) return; done = true; card.style.transition = 'transform .35s ease, opacity .35s ease'; card.style.transform = `translateX(${yes ? 140 : -140}%) rotate(${yes ? 18 : -18}deg)`; card.style.opacity = '0'; Sound.play(yes ? 'coin' : 'thud'); setTimeout(() => res(yes), reduced() ? 0 : 330); };
      card.addEventListener('pointerdown', (e) => { x0 = e.clientX; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; });
      card.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; card.style.setProperty('--yes', Math.max(0, Math.min(1, dx / 90))); card.style.setProperty('--no', Math.max(0, Math.min(1, -dx / 90))); });
      const up = () => { if (x0 == null) return; x0 = null; if (Math.abs(dx) > 90) finish(dx > 0); else { card.style.transition = 'transform .25s ease'; card.style.transform = ''; card.style.setProperty('--yes', 0); card.style.setProperty('--no', 0); } dx = 0; };
      card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
      choose([{ text: noText, cls: 'no', value: 0 }, { text: yesText, cls: 'yes', value: 1 }]).then((v) => finish(v === 1));
    });
  }

  // ---------------- chapter I: a bill to Bruges, on the chart ----------------
  async function ch1(ctx) {
    if (ctx.done) { const Mp = drawChart($('#stage')); await finishT1(Mp, true); return; }
    // the merchant first, then the chart with his purse at Florence
    const card = visitor('lapo', 'Ser Lapo', 'wool merchant', 'I owe a cloth-finisher in Bruges 1,000 florins. Get it to him, and I will pay you 40 for the trouble.', { small: true });
    say('Mules need hired guards over the Alps, and they cost 30 of the 40. A <b>bill of exchange</b> is a letter telling our partner in Bruges to pay the man there in Flemish money: no gold travels, and we keep all 40.');
    await wait(phone() ? 0 : 400);
    const Mp = drawChart($('#stage'), card);
    const svg = Mp.svg;
    const purse = E('g', { style: 'cursor:grab', class: 'purse' }, svg);
    E('ellipse', { cx: 0, cy: 8, rx: 28, ry: 9, fill: '#000', opacity: 0.25 }, purse);
    E('path', { d: 'M-24 0c-4-20 10-34 24-34s28 14 24 34c-2 12-46 12-48 0z', fill: '#7A4A22', stroke: '#2A1C14', 'stroke-width': 2.5 }, purse);
    E('path', { d: 'M-12-32c6 6 18 6 24 0', stroke: '#E9C66E', 'stroke-width': 3, fill: 'none' }, purse);
    const pl = E('text', { x: 0, y: -4, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 15, 'font-weight': 700, fill: '#F4E7C8' }, purse); pl.textContent = '1,000';
    const home = [MAP.florence[0] - 40, MAP.florence[1] - 4];
    const setPurse = (x, y) => purse.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); setPurse(...home);
    // the road glows as the way the gold would go; dragging the purse up the road to Bruges sends it by mule
    let pick = null;
    const pt = (e) => { const r = svg.getBoundingClientRect(); return [Mp.vb[0] + (e.clientX - r.left) * Mp.vb[2] / r.width, Mp.vb[1] + (e.clientY - r.top) * Mp.vb[3] / r.height]; };
    let drag = false;
    purse.addEventListener('pointerdown', (e) => { drag = true; purse.setPointerCapture(e.pointerId); e.preventDefault(); });
    purse.addEventListener('pointermove', (e) => { if (drag) setPurse(...pt(e)); });
    const decided = new Promise((res) => {
      purse.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; const p = pt(e);
        const toBruges = Math.hypot(p[0] - MAP.bruges[0], p[1] - MAP.bruges[1]) < 120 || p[1] < MAP.florence[1] - 160;
        const over = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('pick'));
        if (over) over.click(); else if (toBruges) res('ship'); else tween(250, (f) => setPurse(lerp(p[0], home[0], f), lerp(p[1], home[1], f))); });
      choose([{ text: 'Write a bill', sub: 'keep 40 · no gold travels', value: 'bill' }, { text: 'Send the gold by mule', sub: 'keep 10 · weeks over the Alps', value: 'ship' }, { text: 'Send him to the Bardi', sub: 'keep nothing', value: 'refuse' }]).then(res);
    });
    pick = await decided; clearChoices(); purse.remove();
    commitChoice('t1', pick);
    if (pick === 'bill') await billWalk(Mp, true); else { await finishT1(Mp, false); await choose([{ text: 'Show me how a bill would do it', cls: 'go' }]); const Mp2 = drawChart($('#stage'), null); await billWalk(Mp2, false); }
    await nextButton(0);
  }
  // A bill of exchange, one tap per step, on the chart: florins taken in Florence, a letter written, only the letter travels,
  // the partner in Bruges pays in Flemish coin, and the gold never crosses the Alps.
  async function billWalk(Mp, real) {
    const fx = Mp.fx, svg = Mp.svg, F = MAP.florence, B = MAP.bruges, road = Mp.road;
    const along = (f) => { const q = road.getPointAtLength(f * road.getTotalLength()); return [q.x, q.y]; };
    const tag = (x, y, txt, col) => { const g = E('g', { class: 'maptag' }, fx); const w = txt.length * 9.5 + 26; E('rect', { x: -w / 2, y: -19, width: w, height: 32, rx: 4, fill: '#EDE0C4', stroke: col || '#2A1C14', 'stroke-width': 2 }, g); const t = E('text', { x: 0, y: 3, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 18, 'font-weight': 700, fill: col || '#2A1C14' }, g); t.textContent = txt; g.setAttribute('transform', `translate(${x.toFixed(0)} ${y.toFixed(0)})`); return g; };
    const step = async (line, button) => { say(line); await choose([{ text: button, cls: 'go' }]); clearChoices(); };
    // the pieces: Ser Lapo's purse at Florence, our strongbox beside it, our partner's bench and the supplier at Bruges
    const box = E('g', { transform: `translate(${F[0] + 70} ${F[1] - 40})` }, fx); E('rect', { x: -26, y: -16, width: 52, height: 32, rx: 4, fill: '#3B2414', stroke: '#1E120A', 'stroke-width': 2 }, box); E('rect', { x: -26, y: -16, width: 52, height: 8, fill: '#6E6A62' }, box);
    const purse = E('g', { transform: `translate(${F[0] - 36} ${F[1] - 6})` }, fx); E('path', { d: 'M-18 0c-3-15 8-26 18-26s21 11 18 26c-2 9-34 9-36 0z', fill: '#7A4A22', stroke: '#2A1C14', 'stroke-width': 2 }, purse);
    const bench = E('rect', { x: B[0] + 24, y: B[1] + 30, width: 50, height: 18, fill: '#3D7563', stroke: '#2A1C14', 'stroke-width': 2 }, fx);
    const sup = E('g', { transform: `translate(${B[0] - 40} ${B[1] + 52})` }, fx); E('circle', { cx: 0, cy: -16, r: 6, fill: '#E6C29A', stroke: '#2A1C14' }, sup); E('path', { d: 'M-9 10L0-8L9 10Z', fill: '#5B4A8A', stroke: '#2A1C14' }, sup);
    tag(B[0] - 84, B[1] + 92, 'the supplier'); tag(B[0] + 64, B[1] + 76, 'our partner');
    const pre = real ? '' : 'Here is how a bill would have done it. ';
    await step(`${pre}Ser Lapo pays us here in Florence: <b>1,040 florins</b>, 1,000 for his supplier and 40 for us.`, 'Take his florins');
    await tween(700, (f) => purse.setAttribute('transform', `translate(${lerp(F[0] - 36, F[0] + 70, f)} ${lerp(F[1] - 6, F[1] - 46, f)}) scale(${1 - f * 0.4})`)); Sound.play('coin');
    E('circle', { cx: F[0] + 70, cy: F[1] - 40, r: 44, fill: 'url(#glow)' }, fx); tag(F[0] + 170, F[1] - 4, '1,040 florins stay here', '#2F5E4F');
    await step('Now I write the <b>bill</b>: a letter telling our partner in Bruges to pay the supplier Flemish money worth 1,000 florins.', 'Write the bill');
    const bill = E('g', { transform: `translate(${F[0] - 90} ${F[1] - 40})` }, fx);
    E('rect', { x: -44, y: -30, width: 88, height: 60, fill: '#F4EAD2', stroke: '#2A1C14', 'stroke-width': 2 }, bill);
    [[-34, -16, 68], [-34, -6, 60], [-34, 4, 64], [-34, 14, 40]].forEach(([x, y, w]) => E('path', { d: `M${x} ${y}h${w}`, stroke: '#5A4636', 'stroke-width': 2 }, bill));
    E('circle', { cx: 28, cy: 16, r: 8, fill: '#A8301C', stroke: '#6E1D10' }, bill); Sound.play('quill');
    await step('Only the letter travels. A courier carries it over the Alps, and there is no gold for robbers to take.', 'Send the bill to Bruges');
    const b0 = [F[0] - 90, F[1] - 40];
    await tween(1800, (f) => { const p = along(f); const x = f < 0.06 ? lerp(b0[0], p[0], f / 0.06) : p[0], y = f < 0.06 ? lerp(b0[1], p[1], f / 0.06) : p[1]; bill.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(.6)`); }); Sound.play('seal');
    tag(MAP.alps[3][0] + 20, MAP.alps[3][1] - 42, 'No gold crossed here', '#A8301C');
    await step('Our partner in Bruges pays the supplier from the Flemish coins he holds for us there.', 'Pay the supplier in Bruges');
    for (let i = 0; i < 5; i++) { const g = E('g', {}, fx); drawStack(g, 60, 'silver'); await tween(260, (f) => g.setAttribute('transform', `translate(${lerp(B[0] + 49, B[0] - 40 + (i - 2) * 14, f)} ${lerp(B[1] + 36, B[1] + 34, f)})`)); Sound.play('coin'); }
    if (real) { const sim = C.simulate(gameChoices()); writeLedger(sim.states[1], sim.states[0]); }
    say(real ? 'The gold never crossed the Alps. Nothing to rob, no guards to pay, and we keep all 40.' : 'The gold never crossed the Alps. That is why bankers wrote bills: only paper travels, so there is nothing to rob and no guards to pay.');
  }
  async function finishT1(Mp, instant) {
    const sim = C.simulate(gameChoices()), st = sim.states[1], c = st.ev.choice, fx = Mp.fx, road = Mp.road;
    const along = (path, f) => { const q = path.getPointAtLength(f * path.getTotalLength()); return [q.x, q.y]; };
    const tag = (x, y, txt, col) => { const g = E('g', {}, fx); const w = txt.length * 9 + 26; E('rect', { x: -w / 2, y: -18, width: w, height: 30, rx: 4, fill: '#EDE0C4', stroke: col || '#2A1C14', 'stroke-width': 2 }, g); const t = E('text', { x: 0, y: 3, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': 17, 'font-weight': 700, fill: col || '#2A1C14' }, g); t.textContent = txt; g.setAttribute('transform', `translate(${x.toFixed(0)} ${y.toFixed(0)})`); return g; };
    const F = MAP.florence, B = MAP.bruges, run = !instant && !reduced();
    if (c === 'ship') {
      const train = E('g', {}, fx);
      const mule = (dx) => { const m = E('g', { transform: `translate(${dx} 0)` }, train); E('path', { d: 'M-14 0h22l6-8 4 2-3 7v8h-3v-6h-20v6h-3z', fill: '#7A5A3A', stroke: '#2A1C14', 'stroke-width': 1.5 }, m); E('rect', { x: -10, y: -9, width: 14, height: 9, fill: '#C79A3A', stroke: '#2A1C14', 'stroke-width': 1.2 }, m); };
      const guard = (dx) => { const m = E('g', { transform: `translate(${dx} 0)` }, train); E('circle', { cx: 0, cy: -16, r: 5, fill: '#22408C', stroke: '#2A1C14' }, m); E('path', { d: 'M-6 8L0-10L6 8Z', fill: '#22408C', stroke: '#2A1C14' }, m); E('path', { d: 'M6-24v34', stroke: '#2A1C14', 'stroke-width': 2 }, m); };
      guard(-44); mule(-22); mule(4); mule(30); guard(52);
      if (run) { say('The mules set out over the Alps with two hired guards.');
        await tween(3600, (f) => { const p = along(road, f); train.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(.85)`); if (f > 0.38 && f < 0.62) Mp.robbers.setAttribute('transform', `translate(${(-(f - 0.38) * 140).toFixed(1)} 0)`); }, (x) => x); }
      else { const p = along(road, 1); train.setAttribute('transform', `translate(${p[0]} ${p[1]}) scale(.85)`); }
      tag(B[0] + 30, B[1] + 64, 'Weeks on the road');
    } else if (c === 'bill') {
      const letter = E('g', {}, fx); E('rect', { x: -16, y: -11, width: 32, height: 22, fill: '#EDE0C4', stroke: '#2A1C14', 'stroke-width': 2 }, letter); E('path', { d: 'M-16-11L0 2 16-11', fill: 'none', stroke: '#2A1C14', 'stroke-width': 1.6 }, letter); E('circle', { cx: 0, cy: 4, r: 5.5, fill: '#A8301C', stroke: '#6E1D10' }, letter);
      E('circle', { cx: F[0], cy: F[1], r: 46, fill: 'url(#glow)' }, fx);
      tag(F[0] - 20, F[1] + 60, 'The gold stays here', '#2F5E4F');
      if (run) { say('Only a letter goes north. The gold stays in your vault.'); await tween(1700, (f) => { const p = along(road, f); letter.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) rotate(${(-10 + 20 * f).toFixed(1)})`); }); }
      else { const p = along(road, 1); letter.setAttribute('transform', `translate(${p[0]} ${p[1]})`); }
      Sound.play('seal');
      for (let i = 0; i < 5; i++) { const g = E('g', { transform: `translate(${B[0] - 46 + i * 22} ${B[1] + 50})` }, fx); drawStack(g, 60, 'silver'); }
      tag(B[0] + 20, B[1] + 92, 'Paid in Flemish money');
    } else {
      const bardi = [F[0] + 60, F[1] + 70];
      E('rect', { x: bardi[0] - 34, y: bardi[1] - 12, width: 68, height: 24, fill: '#3D7563', stroke: '#2A1C14', 'stroke-width': 2 }, fx);
      tag(bardi[0], bardi[1] + 40, 'The Bardi’s bench');
    }
    writeLedger(st, sim.states[0]);
    say(C.consequence('t1', st, sim.states[0]));
  }

  // ---------------- chapter II: deposits, then borrowers, one at a time ----------------
  const PITCH_LINES = {
    nun: { kind: 'nun', line: 'Lend the convent 600 florins for brewing kettles. Our ale sells in every tavern by the Arno, and we will repay more than we borrow.', clerk: 'The convent has never missed a payment.' },
    silk: { kind: 'silk', line: 'Lend me 1,200 florins for raw silk from Lucca. My looms turn it into cloth that sells for far more.', clerk: 'She has borrowed before and always repaid.' },
    alum: { kind: 'alum', line: 'Lend me 800 florins for a cargo of alum. I will pay you half again what the others pay, and ask no questions.', clerk: 'No one in the guild knows him. He offers more because no one else will lend to him.' },
    wool: { kind: 'lapo', line: 'Lend me 1,000 florins for English wool and dye. You know me.', clerk: 'A good customer, and the guild vouches for him.' },
  };
  async function ch2(ctx) {
    const prev = ctx.sim.states[1];
    if (ctx.done) { const st = ctx.sim.states[2]; visitor('depositors', 'Your depositors', 'shopkeepers, wool workers and the convent', 'We trust you with 4,000 florins.', {}); writeLedger(st, prev); say(C.consequence('t2', st, prev)); await nextButton(1); return; }
    // the deposits arrive
    visitor('depositors', 'Your depositors', 'shopkeepers, wool workers and the convent', 'Keep our 4,000 florins safe. We may want them back any day.');
    say('Word has spread that your bench is safe. Take their deposits, and you owe them every florin, whenever they ask.');
    await choose([{ text: 'Take the 4,000 florins', cls: 'go' }]);
    let st = Object.assign({}, prev, { V: prev.V + 4000, O: 4000, M: 0 }); st.W = st.V - st.O + st.M + st.K;
    writeLedger(st, prev);
    say('Gold in the vault earns nothing. Lent to merchants, it comes back with more. But every florin we lend is one we cannot hand to a depositor who wants it back.');
    await wait(phone() ? 0 : 300);
    const lend = [];
    const order = ['nun', 'silk', 'alum', 'wool'];
    for (const pid of order) {
      const P = C.PITCHES.find((x) => x.id === pid), L = PITCH_LINES[pid];
      const card = visitor(L.kind, P.who, P.role, L.line, { ask: `Asks ${flo(P.amount)}`, yes: 'Lend', no: 'Refuse' });
      const left = st.V - P.amount;
      let extra = ''; if (pid === 'wool' && keyOf(ctx.ch.t1) === 'refuse') extra = ' You sent him to the Bardi last time, but he is back.';
      say(`${L.clerk}${extra} Lend it, and <b>${flo(Math.max(0, left))}</b> stays in the vault for the 4,000 your depositors could ask for.`);
      const yes = await decideCard(card, `Lend ${fl(P.amount)}`, 'Refuse');
      if (yes) { lend.push(pid); const nst = Object.assign({}, st, { V: st.V - P.amount, M: st.M + P.amount }); writeLedger(nst, st); st = nst; }
    }
    const total = C.lentOf(lend), key = C.bucketOf(total);
    commitChoice('t2', key, { lend });
    const sim = C.simulate(gameChoices()), fin = sim.states[2];
    writeLedger(fin, prev);
    visitor('depositors', 'Your depositors', 'shopkeepers, wool workers and the convent', total ? 'So you lent some of our money?' : 'Our money is all here?');
    say(total ? `We lent <b>${flo(total)}</b> to ${lend.length} borrower${lend.length === 1 ? '' : 's'}. <b>${flo(fin.V)}</b> stays in the vault, and we owe depositors 4,000.` : 'We lent nothing. Every deposit is in the vault, and none of it is earning.');
    await nextButton(1);
  }

  // ---------------- chapter III: the king's envoy ----------------
  async function ch3(ctx) {
    const prev = ctx.sim.states[2];
    if (ctx.done) { const st = ctx.sim.states[3]; visitor('envoy', 'The king’s envoy', 'from Edward III of England', 'His Majesty thanks the bankers of Florence.'); writeLedger(st, prev, { king: true }); say(C.consequence('t3', st, prev)); await nextButton(2); return; }
    visitor('envoy', 'The king’s envoy', 'from Edward III of England', 'My king is at war with France. Lend him gold, and he will give you a fifth of the loan every year until he repays it.');
    say('A rich gift, because it is a dangerous loan. A king who loses a war may never pay, and no court can make a king pay. The Bardi and the Peruzzi have lent him fortunes.');
    const ko = C.kingOptions({ t1: ctx.ch.t1, t2: ctx.ch.t2, lend: ctx.ch.lend });
    const names = ['Lend nothing', 'A quarter of the vault', 'Half of the vault', 'Three quarters'];
    const pick = await choose(ko.map((o, i) => ({ text: i ? `${names[i]}: ${fl(o.amount)}` : names[0], sub: i ? `gift ${fl(o.amount * C.N.giftRate)} a year · lose ${fl(o.amount)} if he never pays` : 'no risk, no gift', value: i })));
    commitChoice('t3', C.OPT.t3[pick]); clearChoices();
    const sim = C.simulate(gameChoices()), st = sim.states[3];
    if (st.ev.K) {
      writeLedger(Object.assign({}, prev, { V: prev.V - st.ev.K, K: st.ev.K, W: prev.W }), prev, { king: true });
      for (let y = 0; y < 2; y++) { say(`${1340 + y}: the king’s gift arrives, <b>${flo(st.ev.gifts / 2)}</b>.`); Sound.play('coin'); await wait(1100); writeLedger(Object.assign({}, prev, { V: prev.V - st.ev.K + st.ev.gifts / 2 * (y + 1), K: st.ev.K }), null, { king: true }); }
      writeLedger(st, prev, { king: true });
      say(C.consequence('t3', st, prev));
    } else {
      writeLedger(st, prev);
      // the Bardi partner comes to gloat
      const card = visitor('noble', 'A partner of the Bardi', 'Florence’s biggest bank', 'The best wine in Florence, friend, paid for with King Edward’s gifts. I bought a villa in the hills with them too. You lent him nothing? A pity.');
      say('For two years the Bardi and the Peruzzi collect the king’s gifts, and we collect nothing.');
      await decideCard(card, 'Wish him luck', 'Show him the door');
      say(C.consequence('t3', st, prev));
    }
    await nextButton(2);
  }

  // ---------------- chapter IV: the Church's rule, then the borrowers come due ----------------
  async function ch4(ctx) {
    const prev = ctx.sim.states[3], M = prev.M;
    if (ctx.done) { const st = ctx.sim.states[4]; visitor('friar', 'Fra Matteo', 'a Franciscan preacher', 'Usury is a sin.'); writeLedger(st, prev, { king: true }); say(C.consequence('t4', st, prev)); await nextButton(3); return; }
    visitor('friar', 'Fra Matteo', 'a Franciscan preacher', 'Usury is a sin. A known usurer is refused communion and Christian burial.');
    say('If we charge interest openly, we are usurers: no communion, no Christian burial, and Dante, a Florentine, put usurers on burning sand under a rain of fire in his <i>Inferno</i>. Our customers do not want to be seen with us either.');
    await choose([{ text: 'How do other banks get paid?', cls: 'go' }]);
    await roundTrip();
    say(M ? `We have ${flo(M)} lent to merchants. Choose how we get paid.` : 'We lent nothing to merchants, so this costs us nothing either way. It is how Florence’s bankers got paid when they did lend.');
    const est = (r) => (M ? `about ${fl(Math.round(M * r))}` : 'nothing to collect');
    const pick = await choose([
      { text: 'Lend through bills of exchange', sub: `${est(0.2)} · the usual way`, value: 'exchange' },
      { text: 'Ask for gifts', sub: `${est(0.1)} · some give, some do not`, value: 'gift' },
      { text: 'Charge interest openly', sub: 'the Church makes you give it back', value: 'open' },
      { text: 'Lend for free', sub: 'nothing earned', value: 'free' }]);
    commitChoice('t4', pick); clearChoices();
    if (pick === 'exchange') await billBet(prev);
    const sim = C.simulate(gameChoices()), st = sim.states[4], ev = st.ev;
    // the borrowers come due, as people
    const lend = gameChoices().lend || [];
    if (lend.length) {
      const stg = $('#stage'); stg.classList.add('street'); stg.innerHTML = '<div class="returns" id="returns"></div>';
      const book = ev.M - (ev.vanished ? 0 : (lend.indexOf('alum') >= 0 ? 800 : 0)) + (lend.indexOf('alum') >= 0 && !ev.vanished ? 800 * C.RISK_PREMIUM : 0);
      for (const pid of lend) {
        const P = C.PITCHES.find((x) => x.id === pid), L = PITCH_LINES[pid], gone = pid === 'alum' && ev.vanished;
        const paid = gone ? 0 : Math.round(ev.earned * (pid === 'alum' ? P.amount * C.RISK_PREMIUM : P.amount) / (book || 1));
        const el = document.createElement('div'); el.className = 'rcard' + (gone ? ' gone' : '');
        el.innerHTML = `<div class="portrait">${portrait(L.kind)}</div><p><b>${esc(P.who)}</b><br>${gone ? `gone, with ${fl(P.amount)}` : (paid > 0 ? `pays ${fl(paid)}` : paid < 0 ? `loses you ${fl(-paid)}` : 'pays nothing more')}</p>`;
        $('#returns').appendChild(el); Sound.play(gone ? 'thud' : 'coin'); await wait(500);
      }
    }
    writeLedger(st, prev, { king: !!st.K });
    const note = C.billNote(ev);
    const head = ev.vanished ? `Ser Guccio has left Florence, and the ${flo(ev.lostRisky)} went with him. ` : (lend.indexOf('alum') >= 0 && ev.earned > 0 ? 'Ser Guccio paid, half again what the others paid. ' : (lend.indexOf('alum') >= 0 ? 'Ser Guccio repaid his loan. ' : ''));
    say(note ? `${head}${note} We collect <b>${flo(ev.earned)}</b>.` : `${head}${C.consequence('t4', st, prev)}`);
    await nextButton(3);
  }
  // A real round trip of bills (Munro's example from the Datini archives, 1399 to 1400): lend in Bruges, collect in Barcelona's
  // coin, buy a bill back at that day's rate, collect more than you lent. One tap per leg, the arithmetic shown small.
  async function roundTrip() {
    const BAR = geo(2.17, 41.39), B = MAP.bruges;
    const route = [B, geo(2.35, 48.86), geo(4.83, 45.76), geo(3.88, 43.61), geo(2.9, 42.7), BAR];
    const Mp = drawChart($('#stage'), null, { view: [130, 150, 900, 576], road: route, noRobbers: true, cities: [[BAR, 'Barcelona', 0, -22, 'middle']] });
    const fx = Mp.fx, road = Mp.road, L = road.getTotalLength();
    const at = (f) => { const q = road.getPointAtLength(f * L); return [q.x, q.y]; };
    const sums = document.createElement('div'); sums.className = 'sums leaf'; sums.setAttribute('aria-label', 'The arithmetic'); $('#stage').appendChild(sums);
    const line = (html) => { const p = document.createElement('p'); p.innerHTML = html; sums.appendChild(p); };
    const step = async (text, button) => { say(text); await choose([{ text: button, cls: 'go' }]); clearChoices(); };
    const coins = (p, n, kind) => { const g = E('g', {}, fx); for (let i = 0; i < n; i++) { const s = E('g', { transform: `translate(${p[0] - (n - 1) * 9 + i * 18} ${p[1]})` }, g); drawStack(s, 100, kind); } return g; };
    const paper = E('g', { opacity: 0 }, fx); E('rect', { x: -30, y: -20, width: 60, height: 40, fill: '#F4EAD2', stroke: '#2A1C14', 'stroke-width': 2 }, paper); E('path', { d: 'M-22-8h44M-22 2h38M-22 12h26', stroke: '#5A4636', 'stroke-width': 2 }, paper); E('circle', { cx: 20, cy: 10, r: 6, fill: '#A8301C' }, paper);
    const put = (p) => paper.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`);
    await step('This is how bankers were paid without charging interest. Here is a real one, from a merchant’s account books: in Bruges, in December 1399, Jacopo Goscio lends <b>600 écus</b> of Flemish money.', 'Lend 600 écus in Bruges');
    let g1 = coins([B[0] + 40, B[1] + 50], 6, 'gold'); line('Lent in Bruges: <b>600 écus</b>'); Sound.play('coin');
    await step('The borrower gives him a <b>bill on Barcelona</b>: there, the borrower’s partner must pay 10 shillings 5 pence of Barcelona money for every écu.', 'Send the bill to Barcelona');
    paper.setAttribute('opacity', 1); g1.remove(); await tween(1600, (f) => put(at(f))); Sound.play('seal');
    line('600 × 10s 5d = <b>6,250 shillings</b> of Barcelona');
    await step('Goscio’s partner in Barcelona collects <b>6,250 shillings</b> in Barcelona’s own coin.', 'Collect in Barcelona');
    const g2 = coins([BAR[0] + 110, BAR[1] + 18], 6, 'silver'); Sound.play('coin');
    await step('He spends it on a <b>bill back to Bruges</b>, at that day’s rate in Barcelona: 10 shillings for every écu. Nobody knew that rate back in December.', 'Buy a bill home');
    g2.remove(); await tween(1600, (f) => put(at(1 - f))); Sound.play('seal');
    line('6,250 ÷ 10s = <b>625 écus</b>');
    await step('In April 1400 the bill is paid in Bruges.', 'Collect in Bruges');
    paper.setAttribute('opacity', 0); coins([B[0] + 40, B[1] + 50], 6, 'gold'); Sound.play('coin');
    line('Gain: <b>25 écus</b>, about 4 for every 100, in four months');
    say('625 écus for 600: the gain sits in the gap between 10s 5d going out and 10s 0d coming back. No paper says “interest”, so the Church treats it as trading money. The catch: had the rate in Barcelona moved the other way, he could have lost.');
    await choose([{ text: 'Now choose how we get paid', cls: 'go' }]);
  }
  // the bet on the bill: what to ask for every 100 lent, before you know what rival benches ask this year
  async function billBet(prev) {
    const Y = gameChoices()._year || C.YEAR0, lo = C.YEARS.going[0], hi = C.YEARS.going[C.YEARS.going.length - 1], M = prev.M;
    const st = $('#stage'); st.classList.remove('street');
    const pct = (v) => (100 * v / 30).toFixed(1) + '%';
    st.innerHTML = `<div class="billpanel leaf" role="group" aria-labelledby="billT">
      <h3 id="billT">Set the rate on your bills</h3>
      <div class="rate"><label class="sr-only" for="rateIn">What you ask for every 100 florins lent</label>
        <div class="track"><span class="band" style="left:${pct(lo)};width:${pct(hi - lo)}"></span><span class="mark" id="goingMark" hidden></span></div>
        <input type="range" id="rateIn" min="0" max="30" step="1" value="14">
        <div class="scale"><span>0</span><span class="bandlabel" style="left:${pct((lo + hi) / 2)}">rival benches</span><span>30</span></div></div>
      <p class="read" id="rateRead"></p>
      <div class="merchants" id="merchants" aria-hidden="true">${Array.from({ length: 8 }, () => '<i></i>').join('')}</div></div>`;
    say(`Rival benches ask between ${lo} and ${hi} for every 100 this year. Ask more than they do and merchants go to them; ask less and we earn less. The exchange may also move before the bills come home.`);
    const inp = $('#rateIn');
    const on = () => { const v = Number(inp.value); $('#rateRead').innerHTML = `Ask <b>${v}</b> for every 100: ${M ? `about <b>${flo(Math.round(M * v / 100))}</b> if every merchant stays` : 'nothing to collect this time'}.`; inp.setAttribute('aria-valuetext', `Ask ${v} for every 100 florins lent`); const b = $('#choices .pick b'); if (b) b.textContent = `Seal the bills at ${v}`; if (v % 5 === 0) Sound.play('coin'); };
    inp.addEventListener('input', on);
    const p = choose([{ text: 'Seal the bills', cls: 'go' }]); on();
    if (!phone()) inp.focus({ preventScroll: true });
    if (window.__FAST) $('#choices button').click();
    await p; const rate = Number(inp.value); inp.disabled = true;
    if (S.practice) S.prate = rate; else { S.log.t4.rate = rate; save(); }
    Sound.play('seal');
    const ev = C.simulate(gameChoices()).states[4].ev;
    const mk = $('#goingMark'); mk.hidden = false; mk.style.left = pct(Y.going);
    $('#rateRead').innerHTML = `Rival benches asked <b>${Y.going}</b> this year.`; await wait(900);
    const gone = Math.round((1 - ev.accept) * 8);
    $$('#merchants i').forEach((m, j) => { if (j >= 8 - gone) m.classList.add('gone'); });
    $('#rateRead').innerHTML += gone ? ` ${gone >= 8 ? 'Every merchant' : `${gone} merchant${gone === 1 ? '' : 's'} in 8`} went to a rival.` : ' Every merchant stayed.';
    await wait(1000);
    $('#rateRead').innerHTML += ` The exchange moved ${ev.shock === 0 ? 'not at all' : `${Math.abs(ev.shock)} ${ev.shock > 0 ? 'in our favor' : 'against us'}`}.`;
    await wait(1300);
  }

  // ---------------- chapter V: the run (the street, the counter, the crowd) ----------------
  // the run's scene fits the stage it is drawn in: the street takes the top, the counter the bottom
  function runGeo() {
    const el = $('#stage'), r = el.getBoundingClientRect(), tall = phone(), W = tall ? 600 : 1000;
    const H = Math.round(Math.max(tall ? 600 : 480, Math.min(tall ? 1000 : 640, W * r.height / Math.max(1, r.width))));
    const street = Math.round(H * (tall ? 0.56 : 0.62)), cnt = H - street;
    if (!tall) { const bh = cnt - 34; return { W, H, street, vault: { box: [24, street + 16, 600, bh], x0: 50, y0: street + 70, cols: 25, dx: 23, dy: 40, scale: 0.72 }, merch: { box: [640, street + 16, 160, bh] }, king: { box: [816, street + 16, 160, bh] }, front: [440] }; }
    const vh = Math.round(cnt * 0.6) - 20;
    return { W, H, street, vault: { box: [14, street + 14, 572, vh], x0: 40, y0: street + 66, cols: 18, dx: 30, dy: 40, scale: 0.8 }, merch: { box: [14, street + vh + 26, 280, cnt - vh - 40] }, king: { box: [306, street + vh + 26, 280, cnt - vh - 40] }, front: [300] };
  }
  function buildRun(st0) {
    const mode = phone() ? 'tall' : 'wide', stg = $('#stage'); stg.classList.remove('street', 'chartstage'); stg.classList.add('run'); stg.innerHTML = ''; setClerk('over'); const G = runGeo();
    const svg = E('svg', { viewBox: `0 0 ${G.W} ${G.H}`, role: 'img', 'aria-label': 'The street in front of your bench, with depositors lining up, and your counter with the vault, your loans and the king’s bond.' }, stg);
    defs(svg);
    E('rect', { x: 0, y: 0, width: G.W, height: G.street, fill: '#2C3A63' }, svg);
    E('image', { href: IMG.street.src, x: 0, y: 0, width: G.W, height: G.street - 30, preserveAspectRatio: 'xMidYMax slice' }, svg);
    E('rect', { x: 0, y: G.street - 34, width: G.W, height: 34, fill: '#9C8A6E' }, svg);
    for (let x = -20; x < G.W; x += 46) E('path', { d: `M${x} ${G.street - 34}l-10 34`, stroke: '#7E6D55', 'stroke-width': 1.2 }, svg);
    E('rect', { x: 0, y: G.street - 6, width: G.W, height: G.H - G.street + 6, fill: 'url(#wood)' }, svg);
    E('rect', { x: 0, y: G.street - 6, width: G.W, height: 12, fill: '#4A2C18', stroke: '#24140A' }, svg);
    const layers = { places: E('g', {}, svg), stacks: E('g', {}, svg), people: E('g', {}, svg), fx: E('g', {}, svg), top: E('g', {}, svg) };
    const vb = G.vault.box; E('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], rx: 6, fill: '#24160C', stroke: '#1E120A', 'stroke-width': 3 }, layers.places);
    const lab = (t, x, y, sz) => { const e = E('text', { x, y, 'text-anchor': 'middle', 'font-family': 'Alegreya, serif', 'font-size': sz || 20, 'font-weight': 700, fill: '#F4E7C8' }, layers.places); e.textContent = t; return e; };
    lab('Your vault', vb[0] + vb[2] / 2, vb[1] + 22, 18);
    const box = (b, fill, title) => { E('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 6, fill, stroke: '#101C40', 'stroke-width': 2 }, layers.places); lab(title, b[0] + b[2] / 2, b[1] + 24, 18); return lab('', b[0] + b[2] / 2, b[1] + b[3] / 2 + 24, 30); };
    const merchNum = box(G.merch.box, '#2F5E4F', 'Loans to merchants'), kingNum = box(G.king.box, '#1D2F66', 'The king’s bond');
    STAGE = { svg, mode, G, layers, places: { vault: { G: G.vault, stacks: [] } }, W: G.W, H: G.H, merchNum, kingNum, personScale: mode === 'tall' ? 1.3 : 1.45 };
    STAGE.setMerch = (v) => { merchNum.textContent = fl(v); }; STAGE.setKing = (v, struck) => { kingNum.textContent = fl(v); kingNum.setAttribute('text-decoration', struck ? 'line-through' : 'none'); };
    STAGE.setMerch(st0.M); STAGE.setKing(st0.K);
    return STAGE;
  }
  function defs(svg) {
    const d = E('defs', {}, svg);
    d.innerHTML = `
      <linearGradient id="gold" x1="0" x2="1"><stop offset="0" stop-color="#8C6A22"/><stop offset=".25" stop-color="#E9C66E"/><stop offset=".55" stop-color="#C79A3A"/><stop offset=".8" stop-color="#F0D489"/><stop offset="1" stop-color="#7A5A1A"/></linearGradient>
      <pattern id="ridges" patternUnits="userSpaceOnUse" width="6" height="2.6"><rect width="6" height="2.6" fill="none"/><line x1="0" y1="2.3" x2="6" y2="2.3" stroke="#6B4E14" stroke-width=".7" opacity=".7"/></pattern>
      <pattern id="face" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="img/florin.png" width="1" height="1" preserveAspectRatio="none"/></pattern>
      <pattern id="silver" patternContentUnits="objectBoundingBox" width="1" height="1"><rect width="1" height="1" fill="#C9CCD1"/><circle cx=".5" cy=".5" r=".3" fill="none" stroke="#8A8F98" stroke-width=".06"/></pattern>
      <pattern id="wood" patternUnits="userSpaceOnUse" width="200" height="16"><rect width="200" height="16" fill="#6B4425"/><path d="M0 4c40 2 80-2 120 1s60 1 80-1M0 11c50-2 90 2 140 0s40-1 60 1" stroke="#553519" stroke-width="1.2" fill="none"/></pattern>
      <radialGradient id="glow"><stop offset="0" stop-color="#F0D489" stop-opacity=".55"/><stop offset="1" stop-color="#F0D489" stop-opacity="0"/></radialGradient>
      <filter id="vn"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2"/><feColorMatrix values="0 0 0 0 .4 0 0 0 0 .3 0 0 0 0 .15 0 0 0 .12 0"/></filter><pattern id="vellumN" patternUnits="userSpaceOnUse" width="300" height="300"><rect width="300" height="300" filter="url(#vn)"/></pattern>`;
  }
  async function ch5(ctx) {
    const prev = ctx.sim.states[4];
    if (ctx.done) { const st = ctx.sim.states[5]; buildRun(st); fill('vault', st.V); STAGE.setKing(0, true); writeLedger(st, prev, { king: true, struck: !!prev.K }); say(C.consequence('t5', st, prev)); await nextButton(4); return; }
    buildRun(prev); const G = STAGE.G, Y = ctx.ch._year || C.YEAR0, tall = STAGE.mode === 'tall';
    fill('vault', prev.V);
    const base = Object.assign({}, ctx.ch); delete base.t5;
    const scripts = {}; C.OPT.t5.forEach((c) => { scripts[c] = C.runScript(Object.assign({}, base, { t5: c })); });
    const n = scripts.pay.depositors, shared = scripts.pay.steps;
    const q = []; let arrived = 0, served = 0, phase = 'run', timer = null, paying = false, auto = false, warned = false;
    const feet0 = G.street - 12, s0 = STAGE.personScale;
    const spot = (j) => {
      if (j === 0) return [G.front[0], feet0, s0];
      // on a laptop the clerk speaks from the top right, so two in three of the crowd gather to the left
      const press = Math.min(1, q.length / 12), k = j - 1, per = tall ? 3 : 5, side = tall ? (k % 2 ? -1 : 1) : (k % 3 === 0 ? 1 : -1);
      const n = tall ? Math.floor(k / 2) : (side > 0 ? k / 3 : k - Math.floor(k / 3) - 1), idx = n % per, row = Math.floor(n / per);
      const sc = s0 * (1 - 0.13 * (row + 0.5) - 0.04 * press), gap = (tall ? 54 : 70) * sc / s0 * (1 - 0.18 * press);
      return [G.front[0] + side * gap * (idx + 1) + (row % 2 ? side * gap / 2 : 0), feet0 - 22 - row * 30 - (idx % 2) * 5, sc];
    };
    const relayout = (ms) => { q.forEach((p, j) => { const [x, y, sc] = spot(j); p.sc = sc; walk(p, x, y, ms || 650).then(() => p.turn(1)); }); depthSort(); };
    const owedInLine = () => q.length * C.N.claim;
    const race = () => { const v = total('vault'), o = owedInLine(); $('#race').innerHTML = `<span>Vault <b>${fl(v)}</b></span><span class="${o > v ? 'bad' : ''}">Asked for in line <b>${fl(o)}</b></span>`; };
    $('#stage').insertAdjacentHTML('afterbegin', '<p class="race" id="race" aria-live="off"></p>');
    function arrive() { if (arrived >= n) return; const i = arrived++; const side = i % 2 ? 1 : -1; const p = person(side > 0 ? STAGE.W + 50 : -50, feet0 - 40, i + 3, { hold: 'chit', scale: s0 * 0.8 }); q.push(p); relayout(); race(); if (arrived === n) setTimeout(() => { if (phase === 'run') say(`No one else is coming. ${q.length} still in line.`); }, 900); }
    say('Rumor says King Edward will not pay his Florentine bankers, and our depositors want their money. Pay each one in coin, and the panic may pass.');
    Sound.play('murmur');
    for (let i = 0; i < Math.min(2, n); i++) arrive();
    if (reduced()) while (arrived < n) arrive(); else timer = setInterval(() => { if (phase === 'run') { arrive(); if (q.length > 4) Sound.play('murmur'); } if (arrived >= n) clearInterval(timer); }, Y.pace || 780);
    // drag gold from the vault to the person at the bench, or press Pay
    const svg = STAGE.svg, vb = G.vault.box;
    const hit = E('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: 'transparent', style: 'cursor:grab' }, STAGE.layers.fx);
    const ptOf = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * STAGE.W / r.width, (e.clientY - r.top) * STAGE.H / r.height]; };
    let drag = false;
    hit.addEventListener('pointerdown', (e) => { if (phase === 'run' && q.length) { drag = true; hit.setPointerCapture(e.pointerId); e.preventDefault(); } });
    hit.addEventListener('pointerup', (e) => { if (!drag) return; drag = false; if (ptOf(e)[1] < G.street) payNext(); });
    const canPay = () => shared[served] && shared[served].type === 'pay' && !shared[served].partial;
    const leave = (p) => { p.setHold('purse'); walk(p, p.x < G.front[0] ? -90 : STAGE.W + 90, p.y - 6, 1100).then(() => p.g.remove()); };
    async function payNext() {
      if (paying || phase !== 'run' || !q.length) return; if (!canPay()) return dryMoment();
      paying = true;
      const front = q.shift(), stacks = take('vault', shared[served].amount);
      await Promise.all(stacks.map((s, j) => wait(j * 60).then(() => fly(s, front.x + 20 * front.sc, front.y - 32 * front.sc, 360, 50))));
      stacks.forEach((s) => s.g.remove());
      served++; $('#stage').dataset.paid = served; leave(front); relayout(500); paying = false;
      if (phase !== 'run') return;
      race();
      if (served === n) return endRun('pay');
      if (!canPay()) return dryMoment();
      if (total('vault') < owedInLine() && !warned) { warned = true; say('The line already asks for more than the vault holds.'); }
      buttons();
    }
    async function payAll() { auto = true; buttons(); while (phase === 'run' && canPay() && served < n) { if (!q.length) { arrive(); await wait(150); continue; } await payNext(); await wait(110); } }
    function buttons() {
      if (phase !== 'run') return;
      const list = [{ text: `Pay the next in line (${C.N.claim})`, cls: 'go', value: 'pay' }];
      if (served >= 4 && !auto) list.push({ text: 'Keep paying everyone', value: 'all' });
      list.push({ text: 'Bar the door', sub: 'stop paying for now', value: 'bar' });
      choose(list).then((v) => { if (v === 'pay') payNext(); else if (v === 'all') payAll(); else if (v === 'bar') endRun('bar'); });
    }
    buttons(); race();
    async function dryMoment() {
      phase = 'dry'; clearInterval(timer); while (arrived < n) arrive(); race();
      const left = total('vault'), M = prev.M;
      const agent = person(STAGE.W - 70, feet0 - 40, 2, { kind: 'hat', robe: '#3D7563', scale: s0 * 0.85 }); agent.turn(-1); depthSort();
      say(M ? `${left ? `Only ${flo(left)} left` : 'The vault is empty'}, ${q.length} still in line. Our loans are good, but merchants repay over months. A rival will buy them now for <b>half their worth</b>: we lose half, but everyone is paid. Or we close.`
        : `${left ? `Only ${flo(left)} left` : 'The vault is empty'}, and ${q.length} still in line. We have no loans to sell. We can close the bench, or bar the door and hope.`);
      Sound.play('murmur'); announce('The vault cannot pay the next depositor in full.');
      const list = []; if (M > 0) list.push({ text: 'Sell our loans at half price', sub: `${fl(M)} of loans`, cls: 'go', value: 'sell' });
      list.push({ text: 'Close the bench', value: 'pay' }, { text: 'Bar the door', value: 'bar' });
      const v = await choose(list); agent.g.remove(); endRun(v);
    }
    const shutter = async () => { const sh = E('rect', { x: 0, y: -G.street, width: STAGE.W, height: G.street + 6, fill: 'url(#wood)', stroke: '#1E120A', 'stroke-width': 3 }, STAGE.layers.top); Sound.play('thud'); await tween(500, (f) => sh.setAttribute('y', lerp(-G.street, 0, f))); return sh; };
    async function endRun(choice) {
      if (phase === 'end') return;
      phase = 'end'; clearInterval(timer);
      while (paying) await new Promise((r) => setTimeout(r, 40));
      hit.remove(); clearChoices();
      commitChoice('t5', choice);
      const sim = C.simulate(gameChoices()), st = sim.states[5], rs = scripts[choice];
      if (choice === 'bar') {
        say('Barring the door tells the city we are broke.');
        const sh = await shutter();
        const lbl = E('text', { x: STAGE.W / 2, y: G.street * 0.55, 'text-anchor': 'middle', 'font-family': 'Grenze Gotisch, Texturina, serif', 'font-size': 40, 'font-weight': 600, fill: '#F4E7C8' }, STAGE.layers.top); lbl.textContent = 'Three days later';
        q.forEach((p) => p.g.remove()); q.length = 0;
        await wait(1300); lbl.remove();
        for (let i = served; i < rs.depositors; i++) q.push(person(0, 0, i + 3, { hold: 'chit', scale: s0 }));
        q.forEach((p, j) => { const [x, y, sc] = spot(j); p.sc = sc; p.draw(); move(p, x, y); }); depthSort();
        await tween(500, (f) => sh.setAttribute('y', lerp(0, -G.street - 10, f))); sh.remove(); Sound.play('murmur'); race();
        say(`When the door opens, every depositor wants all their coins back: <b>${flo(owedInLine())}</b>.`);
        await wait(1000);
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
          if (s.partial) { say(`The last ${flo(s.amount)} go to the next in line, who is owed ${flo(C.N.claim)}.`); await wait(800); continue; }
          leave(front); relayout(300); race(); await wait(fast ? 80 : 260);
        } else if (s.type === 'sell') {
          say(`We sell <b>${flo(s.sold)}</b> of loans to a rival bank for <b>${flo(s.cash)}</b>.`); Sound.play('thud');
          STAGE.setMerch(prev.M - s.sold);
          await spawnInto(s.cash, 'vault', [STAGE.W - 40, G.street - 40], { stagger: 25, ms: 420 }); race(); await wait(700);
        } else if (s.type === 'close') {
          q.forEach((p) => p.angry()); Sound.play('murmur');
          say(`The vault is empty, with ${s.unpaid} still owed.`);
          if (!reduced()) q.forEach((p, j) => p.fig.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${j % 2 ? 4 : -4}px,-5px)` }, { transform: 'translate(0,0)' }], { duration: 260, iterations: 4 }));
          await wait(1300); await shutter();
          const tg = E('text', { x: STAGE.W / 2, y: G.street * 0.55, 'text-anchor': 'middle', 'font-family': 'Grenze Gotisch, Texturina, serif', 'font-size': tall ? 34 : 42, 'font-weight': 600, fill: '#F4E7C8' }, STAGE.layers.top); tg.textContent = 'Closed';
          await wait(900);
        }
      }
    }
  }
  // the king's letter: a card with a seal; break it, and the letter is read out
  async function kingsLetter(st, prev) {
    const stg = $('#stage'), wrap = document.createElement('div'); wrap.className = 'letterwrap';
    wrap.innerHTML = `<div class="letter leaf" id="letter"><p class="from">From the treasurer of Edward III, King of England</p><div class="lettertext" id="letterText" hidden><p>His Majesty will make no further payment to his Florentine bankers at this time.</p></div><button class="sealbtn" type="button" id="sealBtn" aria-label="Break the seal and read the letter"><svg viewBox="-30 -30 60 60" aria-hidden="true"><circle r="26" fill="#A8301C" stroke="#6E1D10" stroke-width="3"/>${[0, 1, 2].map((i) => `<path d="M-12 ${-12 + i * 9}l8-4 6 3-2 4 5 3-6 1-3 4-2-5-5 1z" fill="#E9C66E"/>`).join('')}</svg><span>Break the seal</span></button></div>`;
    stg.appendChild(wrap);
    say(st.failed === 'run' ? 'The bench is closed, and a letter from the king arrives anyway.' : (st.ev.Klost ? `A letter from the king. We lent him <b>${flo(st.ev.Klost)}</b>; if he pays, the bank is worth <b>${flo(st.ev.Wrun)}</b>.` : 'A letter from the king. We never lent him a coin.'));
    await new Promise((res) => { $('#sealBtn').addEventListener('click', res); if (window.__FAST) res(); });
    Sound.play('seal'); $('#sealBtn').remove(); $('#letterText').hidden = false;
    if (STAGE && STAGE.setKing) STAGE.setKing(prev.K, true);
    writeLedger(st, prev, { king: !!prev.K, struck: !!prev.K });
    if (st.failed) Sound.play('bell');
    say(C.consequence('t5', st, prev));
    await nextButton(4);
  }
  const CHAPTER = { t1: ch1, t2: ch2, t3: ch3, t4: ch4, t5: ch5 };
  // ---------------- the chronicle ----------------
  // Where this bank stands: the student's bank against every way to play the five chapters (2,304, counting each set of borrowers) in the same year of Florence
  // (the same run, the same rival rates, the same exchange; bills set at the rivals' rate). Something to compare with a friend.
  const ALL = {};
  function standing(ch) {
    const Y = ch._year || C.YEAR0, key = JSON.stringify(Y);
    if (!ALL[key]) { const out = []; const O = C.OPT, ids = C.PITCHES.map((p) => p.id), subsets = [];
      for (let m = 0; m < 1 << ids.length; m++) subsets.push(ids.filter((_, i) => m & (1 << i)));
      for (const a of O.t1) for (const lend of subsets) for (const c of O.t3) for (const d of O.t4) for (const e of O.t5) { const r = C.simulate({ t1: a, t2: C.bucketOf(C.lentOf(lend)), lend, t3: c, t4: d, t5: e, _year: Y }); out.push({ s: C.score(r), f: C.fateOf(r) }); } ALL[key] = out; }
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
    main.innerHTML = `${S.practice ? '<p class="banner"><b>Another year.</b> Not graded; your receipt is unchanged.</p>' : ''}<article class="leaf chron" aria-labelledby="chronT">
      <div class="heading"><div><p class="rubric">The chronicle of your bank, 1338 to 1346</p><h2 id="chronT">How Your Bank Fared</h2>
        <p class="fate ${c.fate === 'survived' ? 'good' : 'bad'}">${esc(c.head)}</p></div>
        <figure class="fatepic"><div class="frame">${imgTag(FATE_IMG[c.fate], 'fateimg')}</div></figure></div>
      ${sealHtml(c, ch)}
      ${c.safe ? `<p class="safe">${esc(c.safe)}</p>` : ''}
      <ol class="entries">${c.items.map((x, i) => `<li><div><span class="num">${['I', 'II', 'III', 'IV', 'V'][i]}. ${esc(T[x.id].title)}</span><p class="text">${i === 0 ? initialSvg('I', 'c') + '<span class="sr-only">I</span>' + esc(x.text.slice(1)) : esc(x.text)}</p></div>
        <div class="gloss"><p>${esc(x.idea)}</p><p class="unit">${esc(x.unit)}</p></div></li>`).join('')}</ol>
      <section class="real"><h3>The Real Banks</h3><p>${c.real}</p></section>
      <div class="actions">${S.practice ? '<button class="btn" type="button" id="backRc">Back to my graded receipt</button><button class="btn quiet" type="button" id="againP">Play another year</button>' : '<button class="btn" type="button" id="toNote">Next: Your note</button><button class="btn quiet" type="button" id="againP">Play another year</button>'}</div></article>`;
    $('#againP').addEventListener('click', startPractice);
    if (S.practice) $('#backRc').addEventListener('click', endPractice); else $('#toNote').addEventListener('click', () => go('note'));
    const cb = $('#cardBtn'); if (cb) cb.addEventListener('click', async () => {
      const text = $('#shareText').textContent, card = await makeCard(c, ch), file = new File([card.blob], 'my-bank-of-florence.png', { type: 'image/png' }), pv = $('#cardPreview');
      if (!pv) return;   // the player has moved on while the card was drawn
      pv.src = card.url; pv.alt = 'Your share card: ' + text; pv.hidden = false;
      let shared = false;
      try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: $('#shareText').textContent + ' ' + location.href.split('#')[0] }); shared = true; } } catch (e) { shared = false; }
      if (!shared) { const a = document.createElement('a'); a.href = URL.createObjectURL(card.blob); a.download = 'my-bank-of-florence.png'; document.body.appendChild(a); a.click(); a.remove(); }
      const sm = $('#shareMsg'); if (sm) sm.textContent = shared ? 'Shared.' : 'Saved as a picture. Send it to a friend.';
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
      <div class="actions" style="border-top:1.5px solid rgba(168,48,28,.35);padding-top:1rem"><p style="margin:0;flex:1 1 20rem"><b>Another year of Florence?</b> A new year brings a different run and different rates. It is not graded and does not change this receipt.</p><button class="btn quiet" type="button" id="practice">Play another year</button></div>
      <p class="wc">Your desk code is <b class="code" style="color:var(--ultramarine)">${h.fmtCode(S.code)}</b>. Use it to continue on another computer.</p></article>`;
    $('#dl').href = URL.createObjectURL(r.blob);
    $('#practice').addEventListener('click', startPractice);
    $$('button[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    focusHead();
  }
  // replays: a game of their own, kept in memory only
  function startPractice() { S.practice = (S.practice || 0) + 1; S.pchoices = {}; S.prate = null; S.plend = null; go('t1'); }
  function endPractice() { S.practice = 0; S.pchoices = {}; S.prate = null; S.plend = null; go('receipt'); }

  // ---------------- credits ----------------
  $('#creditsBtn').addEventListener('click', () => {
    const d = $('#credits'); d.querySelector('.leaf').innerHTML = `<h2 id="creditsTitle" style="font-size:28px">Image Credits</h2><ul>${CREDITS.map((c) => `<li><b>${esc(c[0])}.</b> ${esc(c[1])}. ${esc(c[2])}. <a href="${c[3]}" target="_blank" rel="noopener">Source<span class="sr-only"> (opens in a new tab)</span></a></li>`).join('')}</ul><p style="font-size:15px">Typefaces: Grenze Gotisch, Texturina and Alegreya, SIL Open Font License. Coastlines: Natural Earth, public domain. Drawings of the table, the people and the map marks are made for this game.</p><div class="actions"><button class="btn" type="button" id="closeCr">Close</button></div>`;
    d.showModal(); $('#closeCr').addEventListener('click', () => d.close()); $('#closeCr').focus();
  });

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
