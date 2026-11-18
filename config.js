/* The Banker of Florence: FINAN III week 1 (Why Finance Exists). Config for the shared desk engine (desk-engine.js in this
   folder, the FINAN IV no-identifier engine: random desk code, no name or email; receipt and verify.html check from the code).
   Built 2026-11-17 to COURSE-SPEC.md "Week 1", Samuel's plan-review notes 1 and 2 ("a short easy game where they're a
   Renaissance banker financing wars and stuff") and w01/TEACHING-MAP.md (the lesson of each turn in one sentence;
   tests/core_test.js enumerates all 576 paths and asserts each lesson).

   A choose-and-see story, not a quiz. Five turns, each one choice; any choice is accepted (there is no wrong answer and no
   arithmetic). After the choice the turn shows what happened and the bank's ledger. Then "How Your Bank Fared" (the engine's
   walk step) names the later unit that returns to each turn's idea, and the note prints on the receipt.

   How it sits on the engine without changing it (rule: never edit desk-engine.js, desk.css, index.html or verify.html here):
   - Each turn is a task step with `autosave: true` and a `choice` field. judgeTask accepts any of the turn's own options, so a
     receipt verifies whatever the student chose. Option values carry a seeded two-letter suffix ("bill-qk"), so a receipt
     copied onto another desk code fails verification (the kit's swap test).
   - simulate(choices) is the one function that makes every number on every screen. The tests call the same function.
   - A turn's ledger depends on earlier turns. All tasks built in one buildTasks call share one `game` object; wire() records
     the choice as the student makes it, and resolve() adds earlier choices saved by the engine in this browser (graded play
     only; a replay uses only its own choices). If an earlier turn is still open, the turn says so and hides its choices.
   - The calculator button, the two start-screen lines about checking answers and the calculator, and the engine's
     "practice with new numbers" wording do not fit a game with no numbers to type. A small stylesheet and a text patch below
     hide or reword them; the engine is unchanged.
   - Real world: Florence 1338 to 1346, King Edward III, the Bardi and Peruzzi (w01/sources/FACTS.md). The student's bank,
     its partner in Bruges, its customers and every amount are fictional. No invented personal names, so no case_reuse sweep.
   Version 1, seedVersion 1. */
(function (root) {
  'use strict';

  // ---------------- the model ----------------
  const N = {
    family: 1000,                                   // the family's own gold, florins
    gain: { bill: 40, ship: 10, refuse: 0 },        // turn 1
    deposits: 4000,                                 // turn 2
    lend: { none: 0, l1000: 1000, l2000: 2000, l3600: 3600 },
    share: { none: 0, quarter: 0.25, half: 0.5, most: 0.75 },   // turn 3: share of the vault lent to the king
    giftRate: 0.2, giftYears: 2,                    // the king's gift: a fifth of the loan a year, paid for two years
    earn: { open: 0, exchange: 0.2, gift: 0.1, free: 0 },       // turn 4: what the merchant loans bring in over the years
    line: 2400,                                     // turn 5: deposits whose owners line up
    salePrice: 0.5,                                 // turn 5: a loan sold in a panic fetches half its value
  };
  const OPT = { t1: ['bill', 'ship', 'refuse'], t2: ['none', 'l1000', 'l2000', 'l3600'], t3: ['none', 'quarter', 'half', 'most'],
    t4: ['open', 'exchange', 'gift', 'free'], t5: ['pay', 'sell', 'bar'] };
  const TURN_IDS = ['t1', 't2', 't3', 't4', 't5'];
  const keyOf = (v) => String(v == null ? '' : v).split('-')[0];
  const up10 = (x) => Math.ceil(x / 10 - 1e-9) * 10;

  // choices: { t1: 'bill', ... } (keys, without the suffix). Plays as far as the first missing turn.
  // Returns states[0..k] (states[0] is the start) with each turn's events, plus the final status.
  function simulate(choices) {
    const ch = {}; TURN_IDS.forEach((id) => { if (choices && choices[id] != null) ch[id] = keyOf(choices[id]); });
    let s = { V: N.family, M: 0, K: 0, O: 0, failed: '' };
    const snap = (ev) => Object.assign({}, s, { W: s.V + s.M + s.K - s.O, ev: ev || {} });
    const states = [snap()];
    for (const id of TURN_IDS) {
      const c = ch[id]; if (!c || OPT[id].indexOf(c) < 0) break;
      const ev = { choice: c };
      if (id === 't1') { ev.gain = N.gain[c]; s.V += ev.gain; }
      if (id === 't2') { s.V += N.deposits; s.O += N.deposits; ev.lent = N.lend[c]; s.V -= ev.lent; s.M += ev.lent; }
      if (id === 't3') {
        // "About a quarter / half / three quarters of your vault": the share of the vault rounded down to the nearest 100, so
        // the 0 to 40 florins earned in turn 1 never changes the king's loan (lesson 1 then holds on every path).
        const base = Math.floor(s.V / 100) * 100;
        ev.K = Math.round(N.share[c] * base / 10) * 10; ev.gifts = Math.round(ev.K * N.giftRate * N.giftYears);
        s.V -= ev.K; s.K += ev.K; s.V += ev.gifts;
      }
      if (id === 't4') { ev.M = s.M; ev.earned = Math.round(s.M * N.earn[c]); ev.full = Math.round(s.M * N.earn.exchange); s.V += ev.earned; }
      if (id === 't5') {
        const D = c === 'bar' ? s.O : N.line; ev.D = D; ev.Vbefore = s.V; ev.Wbefore = s.V + s.M + s.K - s.O;
        if (s.V >= D) { ev.run = 'paid'; s.V -= D; s.O -= D; }
        else if (c === 'pay') { ev.run = 'dry'; ev.paid = s.V; s.O -= s.V; s.V = 0; s.failed = 'run'; }
        else {
          const short = D - s.V, F = up10(short / N.salePrice);
          if (F <= s.M) { ev.run = 'sold'; ev.sold = F; ev.loss = F - Math.round(F * N.salePrice); s.M -= F; s.V += Math.round(F * N.salePrice) - D; s.O -= D; }
          else { ev.run = 'soldout'; ev.sold = s.M; const cash = Math.round(s.M * N.salePrice); ev.loss = s.M - cash; ev.paid = s.V + cash; s.O -= ev.paid; s.V = 0; s.M = 0; s.failed = 'run'; }
        }
        ev.Wrun = s.V + s.M + s.K - s.O;
        ev.Klost = s.K; s.K = 0;
        if (!s.failed && s.V + s.M - s.O < 0) s.failed = 'default';
      }
      states.push(snap(ev));
    }
    const last = states[states.length - 1];
    return { states, done: states.length - 1, failed: last.failed, W: last.W };
  }
  // Ranking used by the tests: a bank that survives beats one that fails; among survivors, the one worth more is better.
  const score = (sim) => (sim.failed ? -Infinity : sim.W);
  // The run's damage: failing is the worst; otherwise what the forced sale of loans cost (0 if the vault covered the line).
  const runDamage = (sim) => { const e = sim.states[5].ev; return e.run === 'dry' || e.run === 'soldout' ? Infinity : (e.loss || 0); };

  // ---------------- words ----------------
  const fl = (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const flo = (n) => fl(n) + ' florins';
  const TURNS = {
    t1: { title: 'A Bill to Bruges', label: 'A bill to Bruges', place: 'Florence, 1338',
      body: '<p>A wool merchant owes a supplier in Bruges, far to the north in Flanders, 1,000 gold florins. The road crosses the Alps, and robbers know it.</p>',
      legend: 'How will you move his money?',
      opts: { bill: 'Write him a bill of exchange: he pays you here, and your partner in Bruges pays his supplier there',
        ship: 'Load the gold on mules and hire armed guards', refuse: 'Send him away to carry it himself' },
      short: { bill: 'You wrote a bill of exchange.', ship: 'You shipped the gold under guard.', refuse: 'You sent the merchant away.' },
      idea: 'A bill of exchange moves money between cities and currencies without moving a single coin, and the banker’s pay hides in the exchange rate.',
      unit: 'Unit 12, Foreign Exchange, where you find out who sets the price of one currency in another.' },
    t2: { title: 'The Vault', label: 'The vault', place: 'Florence, 1338',
      body: '<p>Word spreads that your bench is a safe place for money. Shopkeepers, wool workers and a convent leave 4,000 florins with you, and any of them may ask for it back on any day.</p>',
      legend: 'How much of the 4,000 florins will you lend to merchants?',
      opts: { none: 'Lend none and keep all 4,000 in the vault', l1000: 'Lend 1,000 and keep 3,000 in the vault', l2000: 'Lend 2,000 and keep 2,000 in the vault',
        l3600: 'Lend 3,600 and keep 400 in the vault' },
      short: { none: 'You kept every deposit in the vault.', l1000: 'You lent 1,000 of the 4,000 florins.', l2000: 'You lent half the deposits.', l3600: 'You lent 3,600 of the 4,000 florins.' },
      idea: 'A bank earns by lending out part of what depositors leave with it, so it cannot pay all of them back at once.',
      unit: 'Unit 5, Banks, where you see how a bank earns money on your deposits.' },
    t3: { title: 'The King’s War', label: 'The king’s war', place: 'Florence, 1339',
      body: '<p>King Edward III of England is at war with France and needs gold. His agents promise you a gift of a fifth of the loan every year until he repays it.</p>',
      legend: 'How much of your vault will you lend the king?',
      opts: { none: 'Nothing', quarter: 'About a quarter of it', half: 'About half of it', most: 'About three quarters of it' },
      short: { none: 'You lent the king nothing.', quarter: 'You lent the king about a quarter of your vault.', half: 'You lent the king about half your vault.', most: 'You lent the king about three quarters of your vault.' },
      idea: 'The king promised fat gifts because lending to a king at war was dangerous: a high interest rate is pay for the risk of not being repaid.',
      unit: 'Unit 4, Bonds, where riskier borrowers pay more to borrow.' },
    t4: { title: 'The Church’s Rule', label: 'The Church’s rule', place: 'Florence, 1340',
      body: '<p>The Church forbids charging any interest on a loan, and a known usurer can be refused a Christian burial. You still want to be paid for lending to the merchants.</p>',
      legend: 'How will you get paid for your loans to merchants?',
      opts: { open: 'Write the interest into each loan contract', exchange: 'Lend through bills of exchange, and build your charge into the exchange rate',
        gift: 'Ask each merchant for a voluntary gift when he repays', free: 'Lend for free, as the preachers urge' },
      short: { open: 'You charged interest openly.', exchange: 'You hid your charge in the exchange rate.', gift: 'You asked for voluntary gifts.', free: 'You lent for free.' },
      idea: 'Lenders want rent for their money, so when the Church banned interest, bankers kept charging it inside the exchange rate on a bill.',
      unit: 'Unit 2, Renting Money, where you see why borrowing costs what it does and why people called it a sin.' },
    t5: { title: 'The Line at Your Door', label: 'The line at your door', place: 'Florence, a few years later',
      body: '<p>A rumor sweeps Florence that King Edward will not repay his Florentine bankers. Depositors who left 2,400 florins with you line up at your bench to take them out.</p>',
      legend: 'What do you do?',
      opts: { pay: 'Open the vault and pay everyone in line', sell: 'Pay everyone, and if the coins run out, sell your loans to merchants for half their value',
        bar: 'Bar the door until the panic passes' },
      short: { pay: 'You paid from the vault.', sell: 'You paid, selling loans if you had to.', bar: 'You barred the door.' },
      idea: 'In a run, a bank survives only if it can turn what it owns into coins fast enough. A bank with good loans can still die for lack of cash.',
      unit: 'Unit 5, Banks, where a run closes Silicon Valley Bank in 2023.' },
  };

  // What happened, in a sentence or two, for the turn just played.
  function consequence(id, st, prev) {
    const e = st.ev, c = e.choice;
    if (id === 't1') return {
      bill: 'He pays you here, your partner pays his supplier in Bruges in Flemish money, and no coin crosses the Alps. The exchange rate you set between the two currencies leaves you 40 florins ahead.',
      ship: 'The gold reaches Bruges after weeks on the road. You charged him 40 florins, but the guards and mules cost you 30 of them.',
      refuse: 'He takes his business to the Bardi, one of the two biggest banking companies in Florence, and they write him a bill of exchange. You earn nothing.' }[c];
    if (id === 't2') return c === 'none'
      ? 'Every coin sits safe in your vault, and none of it earns anything. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.'
      : `Cloth merchants borrow ${flo(e.lent)} to buy wool and dye, and promise to pay back more than they borrowed. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.`;
    if (id === 't3') return e.K
      ? `You lend King Edward ${flo(e.K)}. For two years his gifts arrive on time, ${flo(e.gifts)} in all, and your bank has never been worth more.`
      : 'You lend him nothing. For two years you watch the Bardi and the Peruzzi collect the king’s gifts.';
    if (id === 't4') {
      if (!e.M) return {   // nothing was lent in turn 2: say what this route would have meant, so the turn still teaches
        open: 'You have no loans to merchants, so there is no interest to collect or hand back. Had you charged it openly, your neighbors would have called you a usurer.',
        exchange: 'You have no loans to merchants, so there is nothing to collect this time. The route you chose is the one Florence’s bankers used: the charge hides in the exchange rate, and the Church treats the deal as trading currencies.',
        gift: 'You have no loans to merchants, so there is nothing to collect this time. Voluntary gifts would have brought in about half of what your loans could earn.',
        free: 'You have no loans to merchants, so lending for free costs you nothing this time.' }[c];
      return {
        open: 'Your neighbors call you a usurer, and the priest will not give you communion until you make amends. You hand the interest back and earn nothing.',
        exchange: `Each merchant takes florins here and repays your partner in Bruges in Flemish money, at exchange rates that favor you on the trip there and back. The Church treats it as trading currencies, not lending, and you collect ${flo(e.earned)}.`,
        gift: `Some merchants give generously, and some give nothing. You collect ${flo(e.earned)}, half of what your loans could have earned.`,
        free: 'The preachers praise you from the pulpit, and your loans earn nothing.' }[c];
    }
    // t5: the run, then the default
    const out = [];
    if (c === 'bar') out.push('The crowd decides you must be broke. When you open the door again, every depositor wants all their coins back.');
    if (e.run === 'paid') out.push(`You pay out ${flo(e.D)} in coin. When the line sees gold on the table, it melts away.`);
    if (e.run === 'dry') out.push(`Your vault runs dry after ${flo(e.paid)}, with people still in line, and you have to close your bench.${e.Wbefore > 0 ? ` On paper your bank was worth ${flo(e.Wbefore)}, but its loans could not be turned into coins in time.` : ''}`);
    if (e.run === 'sold') out.push(`Your vault runs short, so you sell ${flo(e.sold)} of loans to a rival bank for half their value. Everyone is paid, but the sale costs you ${flo(e.loss)}.`);
    if (e.run === 'soldout') out.push('Your vault runs dry, and even selling every loan at half price does not raise enough. You have to close your bench.');
    out.push(e.Klost ? `Then the rumor comes true: the king stops paying, and you lose the ${flo(e.Klost)} you lent him.` : 'Then the rumor comes true, and the king stops paying his lenders. You never lent him a coin.');
    if (st.failed === 'default') out.push('Your bank now owes more than it owns, and it fails, like the Peruzzi in 1343 and the Bardi in 1346.');
    else if (!st.failed) out.push(`Your bank survives, worth ${flo(st.W)}.`);
    return out.join(' ');
  }

  // The ledger after a turn, with the change since the turn before. Rows appear once they mean something.
  // k = how many turns st has played (0 to 5): merchants and depositors appear from turn 2, the king from turn 3.
  function ledger(st, prev, caption, k) {
    const rows = [['Coins in the vault', 'V', true], ['Loans to merchants', 'M', k >= 2], ['Loan to King Edward', 'K', k >= 3],
      ['Owed to depositors', 'O', k >= 2], ['What your bank is worth', 'W', true]];
    const body = rows.filter((r) => r[2]).map(([lab, k]) => {
      const d = prev ? st[k] - prev[k] : 0;
      return `<tr${k === 'W' ? ' class="fl-worth"' : ''}><td class="lbl">${lab}</td><td>${fl(st[k])}</td><td class="fl-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? (d > 0 ? '+' : '') + fl(d) : ''}</td></tr>`;
    }).join('');
    const status = st.failed ? '<p class="fl-status bad">Your bank has closed.</p>' : '';
    return `<div class="tw"><table class="cf fl-ledger"><caption>${caption}</caption><thead><tr><th scope="col">Florins</th><th scope="col">Now</th><th scope="col">${prev ? 'Change' : ''}</th></tr></thead><tbody>${body}</tbody></table></div>`
      + (prev ? '<p class="small fl-note">Worth is everything the bank owns (coins and loans) minus everything it owes.</p>' : '') + status;
  }

  // ---------------- tasks (one per turn) ----------------
  const SUFFIX = 'abcdefghjkmnpqrstuvwxyz';
  function buildTasks(rng, h) {
    const game = { choices: {}, practice: false };
    return TURN_IDS.map((id) => {
      const sfx = h.pick(rng, SUFFIX.split('')) + h.pick(rng, SUFFIX.split(''));
      return { id, sfx, values: OPT[id].map((k) => k + '-' + sfx), game };
    });
  }

  // Choices for a game: a replay uses only its own; graded play adds what the engine saved in this browser.
  function savedChoices() {
    const out = {};
    try {
      const KEY = root.DESK.storageKey, D = root.Desk; if (!D || typeof localStorage === 'undefined') return out;
      const code = JSON.parse(localStorage.getItem(KEY + ':last')); if (!code) return out;
      const saved = JSON.parse(localStorage.getItem(KEY + ':' + D.seedFor(code)));
      TURN_IDS.forEach((id) => { const l = saved && saved.log && saved.log[id]; if (l && l.done && l.choice) out[id] = keyOf(l.choice); });
    } catch (e) { /* storage blocked: use this session's choices only */ }
    return out;
  }
  const GAMES = { graded: null, practice: null };
  const inPractice = () => typeof document !== 'undefined' && !!document.querySelector('.practice-banner');
  function resolve(game) {
    if (!game) return {};
    if (game.practice) return Object.assign({}, game.choices);
    return Object.assign(savedChoices(), game.choices);
  }

  function taskView(t, L) {
    const T = TURNS[t.id];
    if (L && L.choice && t.values.indexOf(L.choice) >= 0) t.game.choices[t.id] = keyOf(L.choice);
    return { title: T.title, place: T.place, body: T.body, example: '', table: '',
      parts: [{ html: `<div class="fl-now" id="flNow" data-turn="${t.id}"></div>`, field: '' }, { html: '', field: 'choice' }],
      choice: { legend: T.legend, options: OPT[t.id].map((k, i) => [t.values[i], T.opts[k]]) },
      autosave: true, noCalc: true, wire: ($) => wireTurn(t, $) };
  }
  function goStep(id) {
    const i = root.DESK.steps.findIndex((s) => s.id === id);
    const b = document.querySelector(`#stepNav li:nth-child(${i + 1}) button`); if (b) b.click();
  }
  function wireTurn(t, $) {
    const game = t.game; game.practice = inPractice(); GAMES[game.practice ? 'practice' : 'graded'] = game;
    const k = TURN_IDS.indexOf(t.id), ch = resolve(game), sim = simulate(ch);
    const box = $('#flNow');
    if (sim.done < k) {   // an earlier turn is still open
      const open = TURN_IDS[sim.done];
      box.innerHTML = `<p class="fl-gate">Your ledger here depends on what you did before. Play <b>${TURNS[open].title}</b> first.</p><div class="actions"><button class="btn" type="button" id="flGo">Go to ${TURNS[open].title}</button></div>`;
      $('#flGo').addEventListener('click', () => goStep(open));
      document.querySelectorAll('#ask .part').forEach((p, i) => { if (i > 0) p.hidden = true; });
      const as = $('#saveState'); if (as) as.hidden = true;
      return;
    }
    box.innerHTML = ledger(sim.states[k], null, k ? 'Your bank before this turn' : 'Your bank today: your family’s gold', k)
      + (t.id === 't4' && !sim.states[k].M ? '<p class="fl-gate">You lent nothing to merchants in The Vault, so this choice will not change your ledger. It shows how Florence’s bankers got paid when they did lend.</p>' : '');
    document.querySelectorAll('#ask input[name=dec]').forEach((r) => r.addEventListener('change', () => { game.choices[t.id] = keyOf(r.value); }));
  }

  function praise(t) {
    const k = TURN_IDS.indexOf(t.id), sim = simulate(resolve(t.game));
    if (sim.done <= k) return 'Your choice is saved.';
    const st = sim.states[k + 1], prev = sim.states[k];
    let html = `<p>${consequence(t.id, st, prev)}</p>` + ledger(st, prev, 'Your bank after this turn', k + 1);
    if (t.id === 't5') html += '<p>Next, see how your bank fared and where each of your decisions comes back in the course.</p>';
    return html;
  }
  function judgeTask(t, e) {
    if (e && e.choice != null && t.values.indexOf(String(e.choice)) >= 0) return { ok: true };
    return { ok: false, msg: 'Choose one of the options.' };
  }
  const helpText = () => 'Any choice is fine. Choose the one you would make, then see what happens.';
  const selfAnswer = (t) => ({ choice: t.values[0], rows: null, value: null });
  const selfWrong = (t) => ({ choice: 'none-00', rows: null, value: null });

  // ---------------- How Your Bank Fared (the engine's walk step, no stages) ----------------
  function storyHtml(ch) {
    const sim = simulate(ch);
    if (sim.done < 5) {
      const open = TURN_IDS[sim.done];
      return `<p class="fl-gate">Your bank’s story is not over yet. Play <b>${TURNS[open].title}</b> next.</p><div class="actions"><button class="btn" type="button" id="flGo" data-go-step="${open}">Go to ${TURNS[open].title}</button></div>`;
    }
    const end = sim.states[5];
    const head = end.failed === 'run' ? 'Your bank closed when its vault ran dry in the run.'
      : end.failed === 'default' ? 'Your bank failed when the king stopped paying.'
      : `Your bank came through the 1340s, worth ${flo(end.W)}.`;
    // A bank that lent nothing to merchants and survived: show, with the same other choices, what a modest loan book would have earned.
    let safe = '';
    if (!end.failed && keyOf(ch.t2) === 'none') {
      const alt = simulate(Object.assign({}, ch, { t2: 'l1000', t4: 'exchange' })), a5 = alt.states[5];
      if (!alt.failed && a5.ev.run === 'paid' && alt.W > end.W) safe = `<p>Keeping every deposit in the vault made your bank safe, but the deposits earned nothing. Had you lent 1,000 florins of them to merchants and charged through the exchange rate, with every other choice the same, your bank would have ended worth ${flo(alt.W)} and still paid the line from its vault.</p>`;
    }
    const items = TURN_IDS.map((id, i) => `<li><p class="fl-turnhead"><b>${i + 1}. ${TURNS[id].title}.</b> ${TURNS[id].short[keyOf(ch[id])]}</p><p>${TURNS[id].idea}</p><p class="fl-unit">This idea comes back in ${TURNS[id].unit}</p></li>`).join('');
    return `<p class="fl-head">${head}</p>${safe}<ul class="fl-story">${items}</ul>
      <h3>The Real Banks</h3><p>The Peruzzi company went bankrupt in 1343, and the Bardi company failed in 1346. King Edward’s unpaid war loans helped bring both down, along with a wider crisis in Florence. In Italian a failed bank was a <i>banca rotta</i>, a broken bench, which gave English the word <i>bankrupt</i>.</p>`;
  }
  function fillStory() {
    const box = typeof document !== 'undefined' && document.getElementById('flStory'); if (!box) return;
    const practice = inPractice();
    const ch = practice ? Object.assign({}, (GAMES.practice || {}).choices) : Object.assign(savedChoices(), (GAMES.graded || {}).choices);
    box.innerHTML = storyHtml(ch);
    const done = simulate(ch).done === 5, wd = document.getElementById('walkDone'); if (wd) wd.hidden = !done;
    const go = document.getElementById('flGo'); if (go) go.addEventListener('click', () => goStep(go.dataset.goStep));
  }
  const WALK = { title: 'How Your Bank Fared', intro: '', stages: [], sources: '',
    render: () => { if (typeof setTimeout !== 'undefined') setTimeout(fillStory, 0); return '<div id="flStory" class="fl-storybox"></div>'; } };

  const STEPS = TURN_IDS.map((id) => ({ id, label: TURNS[id].label, kind: 'task' }))
    .concat([{ id: 'story', label: 'How your bank fared', kind: 'walk' }, { id: 'note', label: 'Your note', kind: 'note' }]);

  // ---------------- small UI layer (no engine change) ----------------
  const CSS = `#calcBtn{display:none}
#view>.box>ul>li:nth-child(3),#view>.box>ul>li:nth-child(4){display:none}
#ask .choices{flex-direction:column;align-items:stretch}
#ask .choice span{display:block;border-radius:8px;text-align:left;padding:.55rem .9rem;font-weight:400}
.fl-ledger{max-width:30rem}
.fl-ledger tr.fl-worth td{font-weight:700;border-top:1.5px solid var(--line-strong)}
.fl-ledger td.fl-d.up{color:var(--ok)}.fl-ledger td.fl-d.down{color:var(--bad)}
.fl-note{margin:.2rem 0 0}
.fl-status{font-weight:700;color:var(--bad);margin:.4rem 0 0}
.fl-gate{background:var(--hint-tint);border-left:4px solid var(--hint);padding:.6rem .9rem;border-radius:6px}
.fl-head{font:400 24px/1.3 var(--display);margin:.2rem 0 1rem}
ul.fl-story{list-style:none;padding:0;margin:0 0 1rem}
ul.fl-story li{border-top:1px solid var(--line);padding:.7rem 0}
ul.fl-story p{margin:.15rem 0}
.fl-unit{font-style:italic;color:var(--muted)}`;
  function patchText() {
    const set = (el, txt) => { if (el && el.textContent !== txt) el.textContent = txt; };
    set(document.getElementById('practice'), 'Play again with different choices');
    set(document.getElementById('again'), 'Play again');
    set(document.getElementById('walkDone'), 'Next: Your note');
    // The engine's start screen says "A wrong answer never costs points" beside this desk's "no wrong choice": drop that sentence.
    document.querySelectorAll('#view > .box > ul > li').forEach((li) => { if (/A wrong answer never costs points\./.test(li.innerHTML)) li.innerHTML = li.innerHTML.replace(/\s*A wrong answer never costs points\./, ''); });
    document.querySelectorAll('.practice-banner').forEach((b) => {
      const n = (b.textContent.match(/(\d+)/) || [])[1] || '';
      const html = `<b>Replay ${n}.</b> Not graded. Your receipt is unchanged.`; if (b.innerHTML !== html) b.innerHTML = html;
    });
    const k = document.querySelector('#view > p.kicker'); if (k && /^Practice round/.test(k.textContent)) k.textContent = k.textContent.replace('Practice round', 'Replay');
    const h2 = document.querySelector('#view > h2'); if (h2 && /problems with new numbers/.test(h2.textContent)) h2.textContent = 'That replay is over.';
    document.querySelectorAll('#view > p').forEach((p) => { if (/^Practice rounds are never graded/.test(p.textContent)) set(p, 'Replays are never graded. Your graded receipt is exactly as you left it.'); });
  }
  if (typeof document !== 'undefined' && !root.DESK_NO_UI) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const start = () => { patchText(); new MutationObserver(patchText).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  root.DESK = {
    app: 'finan3-w01-florence-desk', version: 1, seedVersion: 1, salt: 'rize-finan3-w01-florence:4c19e7', points: 20,
    storageKey: 'rize-finan3-w01-florence-v1', filePrefix: 'BankerOfFlorence',
    verifyUrl: 'https://rizecomputerscience.github.io/finan3-florence-desk/verify.html',
    calcPlaceholder: '', calcHint: '',
    practiceStart: 't1',
    practiceLine: '<b>Want to see another ending?</b> Play the five turns again with different choices. Replays are not graded and do not change this receipt.',
    story: { title: 'The Banker of Florence', kicker: 'Financial Markets and Institutions, Unit 1', company: 'Florence', team: '1338 to 1346',
      from: '', fromTitle: '',
      dek: 'Florence, 1338. Your family runs a small bank from a bench in the market, a <i>banca</i>, which is where the word bank comes from. For five turns you decide what the bank does with its gold, and you see what each decision does to it.',
      whatBox: '',
      stepsLine: 'The game has five turns with one decision each. There is nothing to calculate and no wrong choice, and a bank that fails earns full credit too.' },
    steps: STEPS, quiz: [], walk: WALK, buildTasks, taskView, judgeTask, helpText, praise, selfAnswer, selfWrong,
    note: { title: 'Your Note', label: 'Your note', minWords: 25, receiptHeading: 'Note: the decision that settled my bank’s fate',
      prompt: 'Which of your decisions settled your bank’s fate, and why? Then pick one stop on the paycheck’s trip in Follow One Paycheck (the credit union, the retirement fund or the grocery chain selling bonds) and say how it faces the same decision today.' },
    // For tests (not used by the engine).
    simulate, score, runDamage, N, OPT, TURN_IDS, TURNS, storyHtml, consequence, ledger, keyOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
