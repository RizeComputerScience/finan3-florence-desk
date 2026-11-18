/* The Banker of Florence, version 2: the model and the receipt contract. No DOM.
   FINAN III Unit 1. Version 1 lives at the repo root (w01/desk/config.js); this file keeps its model, its words and its
   receipt contract unchanged, and adds the pieces version 2's table needs (runScript, kingOptions, ledgerRows, chronicle).
   - simulate(choices) is still the one function that makes every number on every screen. The tests call the same function.
   - app, version, seedVersion, salt, points, the step ids and buildTasks/judgeTask are exactly version 1's, so a version 2
     receipt verifies in the version 1 verify.html at the repo root, and in the copy beside this file.
   - Real world: Florence 1338 to 1346, King Edward III, the Bardi and Peruzzi (w01/sources/FACTS.md, ../FACTS.md).
   Loaded by index.html (game.js draws the table) and by verify.html and the tests (window.DESK_NO_UI). */
(function (root) {
  'use strict';

  // ---------------- the model (version 1, unchanged) ----------------
  const N = {
    family: 1000,                                   // the family's own gold, florins
    gain: { bill: 40, ship: 10, refuse: 0 },        // turn 1
    charge: 40, guards: 30,                         // turn 1: what shipping is charged, and what the guards and mules cost
    deposits: 4000,                                 // turn 2
    lend: { none: 0, l1000: 1000, l2000: 2000, l3600: 3600 },
    share: { none: 0, quarter: 0.25, half: 0.5, most: 0.75 },   // turn 3: share of the vault lent to the king
    giftRate: 0.2, giftYears: 2,                    // the king's gift: a fifth of the loan a year, paid for two years
    earn: { open: 0, exchange: 0.2, gift: 0.1, free: 0 },       // turn 4: what the merchant loans bring in over the years
    line: 2400,                                     // turn 5: deposits whose owners line up
    claim: 200,                                     // turn 5 (v2 display): each depositor in line asks for 200 florins
    salePrice: 0.5,                                 // turn 5: a loan sold in a panic fetches half its value
  };
  const OPT = { t1: ['bill', 'ship', 'refuse'], t2: ['none', 'l1000', 'l2000', 'l3600'], t3: ['none', 'quarter', 'half', 'most'],
    t4: ['open', 'exchange', 'gift', 'free'], t5: ['pay', 'sell', 'bar'] };
  const TURN_IDS = ['t1', 't2', 't3', 't4', 't5'];
  const keyOf = (v) => String(v == null ? '' : v).split('-')[0];
  const up10 = (x) => Math.ceil(x / 10 - 1e-9) * 10;

  /* A year of Florence (version 2): what the bankers could not know in advance. `line` is how many florins the run asks for
     (version 1 fixed it at 2,400), `going` is what rival benches charge on a bill for every 100 lent, and `shock` is how far
     exchange rates moved by the time the bills came home (de Roover: "the instability of the exchange rates made his profit
     uncertain and could even change this profit into a loss"). With no year given, simulate plays version 1 exactly. */
  // Version 3 adds `vanish`: whether the hooded dealer in alum (a borrower in the vault chapter) disappears with his loan.
  const YEAR0 = { line: 2400, going: 20, shock: 0, vanish: false };
  const YEARS = { line: [1600, 1800, 2000, 2200, 2400, 2600], going: [16, 17, 18, 19, 20, 21, 22, 23, 24], shock: [-4, -3, -2, -1, 0, 1, 2, 3, 4], vanish: [false, true] };
  // a year from a seed: rng is any function returning [0, 1)
  function yearFrom(rng) { const p = (a) => a[Math.floor(rng() * a.length)]; return { line: p(YEARS.line), going: p(YEARS.going), shock: p(YEARS.shock), pace: 560 + Math.floor(rng() * 9) * 50, vanish: rng() < 0.5 }; }
  /* Version 3: in the vault chapter, borrowers come to the bench one at a time. Their loans add up to what version 1 offered
     (all four = 3,600, the thinnest vault). The hooded dealer pays half again as much, because no one else will lend to him,
     and in some years he disappears with the money. choices.lend (a list of ids) overrides the t2 option when given; the
     receipt records the t2 option nearest the total (bucketOf), so version 1's receipt contract is unchanged. */
  const PITCHES = [
    { id: 'nun', amount: 600, risky: false, who: 'Sister Agnese', role: 'cellarer of the convent', want: 'brewing kettles' },
    { id: 'silk', amount: 1200, risky: false, who: 'Monna Tessa', role: 'silk weaver', want: 'raw silk from Lucca' },
    { id: 'alum', amount: 800, risky: true, who: 'Ser Guccio', role: 'a hooded man who says he deals in alum', want: 'a cargo of alum' },
    { id: 'wool', amount: 1000, risky: false, who: 'Ser Lapo', role: 'wool merchant', want: 'English wool and dye' },
  ];
  const RISK_PREMIUM = 1.5;
  const lentOf = (ids) => PITCHES.filter((p) => (ids || []).indexOf(p.id) >= 0).reduce((a, p) => a + p.amount, 0);
  const bucketOf = (amount) => OPT.t2.reduce((best, k) => (Math.abs(N.lend[k] - amount) < Math.abs(N.lend[best] - amount) ? k : best), 'none');
  // turn 4, the bill: merchants accept any rate up to the going rate; each point above it sends one in eight to a rival bench
  const accepting = (rate, going) => (rate <= going ? 1 : Math.max(0, 1 - (rate - going) / 8));
  function simulate(choices) {
    const Y = Object.assign({}, YEAR0, choices && choices._year);
    const rate = choices && choices.rate != null && isFinite(choices.rate) ? Math.max(0, Math.min(30, Math.round(+choices.rate))) : Y.going;
    const ch = {}; TURN_IDS.forEach((id) => { if (choices && choices[id] != null) ch[id] = keyOf(choices[id]); });
    const lend = choices && Array.isArray(choices.lend) ? choices.lend.filter((x) => PITCHES.some((p) => p.id === x)) : null;
    let s = { V: N.family, M: 0, K: 0, O: 0, failed: '' };
    const snap = (ev) => Object.assign({}, s, { W: s.V + s.M + s.K - s.O, ev: ev || {} });
    const states = [snap()];
    for (const id of TURN_IDS) {
      const c = ch[id]; if (!c || OPT[id].indexOf(c) < 0) break;
      const ev = { choice: c };
      if (id === 't1') { ev.gain = N.gain[c]; s.V += ev.gain; }
      if (id === 't2') { s.V += N.deposits; s.O += N.deposits;
        if (Array.isArray(lend)) { ev.lend = lend.slice(); ev.lent = lentOf(lend); s.Mrisky = lend.indexOf('alum') >= 0 ? PITCHES[2].amount : 0; } else { ev.lent = N.lend[c]; s.Mrisky = 0; }
        s.V -= ev.lent; s.M += ev.lent; }
      if (id === 't3') {
        const base = Math.floor(s.V / 100) * 100;
        ev.K = Math.round(N.share[c] * base / 10) * 10; ev.gifts = Math.round(ev.K * N.giftRate * N.giftYears);
        s.V -= ev.K; s.K += ev.K; s.V += ev.gifts;
      }
      if (id === 't4') {
        // the risky borrower comes due first: in a `vanish` year he is gone, and his loan with him
        ev.vanished = !!(Y.vanish && s.Mrisky); if (ev.vanished) { ev.lostRisky = s.Mrisky; s.M -= s.Mrisky; s.Mrisky = 0; }
        ev.M = s.M; ev.full = Math.round(s.M * N.earn.exchange);
        const book = s.M - s.Mrisky + s.Mrisky * RISK_PREMIUM;   // what the loans pay on, the risky one at half again
        if (c === 'exchange') { ev.rate = rate; ev.going = Y.going; ev.shock = Y.shock; ev.accept = accepting(rate, Y.going); ev.earned = Math.round(book * ev.accept * (rate + Y.shock) / 100); }
        else ev.earned = Math.round(book * N.earn[c]);
        ev.riskyEarned = s.Mrisky ? Math.round(ev.earned * s.Mrisky * RISK_PREMIUM / book) : 0;
        s.V += ev.earned; }
      if (id === 't5') {
        const D = c === 'bar' ? s.O : Y.line; ev.D = D; ev.Vbefore = s.V; ev.Wbefore = s.V + s.M + s.K - s.O;
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
  const score = (sim) => (sim.failed ? -Infinity : sim.W);
  const runDamage = (sim) => { const e = sim.states[5].ev; return e.run === 'dry' || e.run === 'soldout' ? Infinity : (e.loss || 0); };

  // ---------------- version 2 additions (pure functions of simulate) ----------------
  // The amounts the student can pull across the table in turns 2 and 3, in option order. Turn 3's depend on the vault.
  function lendOptions() { return OPT.t2.map((k) => ({ key: k, amount: N.lend[k] })); }
  function kingOptions(prev) {
    return OPT.t3.map((k) => { const r = simulate(Object.assign({}, prev, { t3: k })); return { key: k, amount: r.states[3] ? r.states[3].ev.K : 0, gifts: r.states[3] ? r.states[3].ev.gifts : 0 }; });
  }
  /* The run, as the table plays it: one depositor at a time, each asking for N.claim florins, paid from the vault until it
     cannot pay the next one in full. Then, by choice: sell loans to the rival at half price (one sale of exactly the amount
     simulate sells), or close the bench (pay what is left to the next in line). Barring the door brings back every depositor
     at once. Built from simulate's own result, and tests/core_test.js asserts that the totals agree on every path. */
  function runScript(choices) {
    const r = simulate(choices), before = r.states[4], st = r.states[5]; if (!st) return null;
    const e = st.ev, n = Math.round(e.D / N.claim), steps = [];
    let V = before.V, M = before.M, i = 0, sold = false;
    const cashFromSale = e.sold ? Math.round(e.sold * N.salePrice) : 0;
    while (i < n) {
      if (V >= N.claim) { V -= N.claim; steps.push({ type: 'pay', who: i, amount: N.claim, V, M }); i++; continue; }
      if ((e.run === 'sold' || e.run === 'soldout') && !sold && e.sold > 0) { sold = true; M -= e.sold; V += cashFromSale; steps.push({ type: 'sell', sold: e.sold, cash: cashFromSale, V, M }); continue; }
      // the vault cannot pay the next depositor in full and nothing is left to sell: pay what is left, close the bench
      if (V > 0) steps.push({ type: 'pay', who: i, amount: V, V: 0, M, partial: true }), V = 0;   // the next in line gets what is left, not all he is owed
      steps.push({ type: 'close', unpaid: n - i, V, M }); break;
    }
    const paid = steps.filter((s) => s.type === 'pay').reduce((a, s) => a + s.amount, 0);
    return { choice: e.choice, barred: e.choice === 'bar', depositors: n, claim: N.claim, steps, paid, V, M, closed: steps.some((s) => s.type === 'close') };
  }
  // The five ledger rows after k turns (merchants and depositors appear from turn 2, the king from turn 3).
  function ledgerRows(st, prev, k) {
    return [['Coins in the vault', 'V', true], ['Loans to merchants', 'M', k >= 2], ['Loan to King Edward', 'K', k >= 3],
      ['Owed to depositors', 'O', k >= 2], ['What your bank is worth', 'W', true]]
      .filter((r) => r[2]).map(([label, key]) => ({ label, key, now: st[key], change: prev ? st[key] - prev[key] : 0 }));
  }

  // ---------------- words (version 1's reviewed wording; v2 adds `act`, the instruction line for the table) ----------------
  const fl = (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const flo = (n) => fl(n) + ' florins';
  const TURNS = {
    t1: { title: 'A Bill to Bruges', label: 'A bill to Bruges', place: 'Florence, 1338', year: 1338,
      body: '<p>A wool merchant owes a supplier in Bruges, far to the north in Flanders, 1,000 gold florins. The road crosses the Alps, and robbers know it.</p>',
      legend: 'How will you move his money?',
      act: 'Drag his purse to the way you will move it.',
      opts: { bill: 'Write him a bill of exchange: he pays you here, and your partner in Bruges pays his supplier there',
        ship: 'Load the gold on mules and hire armed guards', refuse: 'Send him away to carry it himself' },
      tag: { bill: 'Write a bill', ship: 'Load the mules', refuse: 'Send him away' },
      short: { bill: 'You wrote a bill of exchange.', ship: 'You shipped the gold under guard.', refuse: 'You sent the merchant away.' },
      idea: 'A bill of exchange moves money between cities and currencies without moving a single coin, and the banker’s pay hides in the exchange rate.',
      unit: 'Unit 12, Foreign Exchange, where you find out who sets the price of one currency in another.' },
    t2: { title: 'The Vault', label: 'The vault', place: 'Florence, 1338', year: 1338,
      body: '<p>Word spreads that your bench is a safe place for money. Shopkeepers, wool workers and a convent leave 4,000 florins with you, and any of them may ask for it back on any day.</p>',
      legend: 'How much of the 4,000 florins will you lend to merchants?',
      act: 'Drag gold from your vault to the merchants. Each stack is 100 florins.',
      opts: { none: 'Lend none and keep all 4,000 in the vault', l1000: 'Lend 1,000 and keep 3,000 in the vault', l2000: 'Lend 2,000 and keep 2,000 in the vault',
        l3600: 'Lend 3,600 and keep 400 in the vault' },
      short: { none: 'You kept every deposit in the vault.', l1000: 'You lent 1,000 of the 4,000 florins.', l2000: 'You lent half the deposits.', l3600: 'You lent 3,600 of the 4,000 florins.' },
      idea: 'A bank earns by lending out part of what depositors leave with it, so it cannot pay all of them back at once.',
      unit: 'Unit 5, Banks, where you see how a bank earns money on your deposits.' },
    t3: { title: 'The King’s War', label: 'The king’s war', place: 'Florence, 1339', year: 1339,
      body: '<p>King Edward III of England is at war with France and needs gold. His agents promise you a gift of a fifth of the loan every year until he repays it.</p>',
      legend: 'How much of your vault will you lend the king?',
      act: 'Drag gold from your vault into the king’s chest, or lend him nothing.',
      opts: { none: 'Nothing', quarter: 'About a quarter of it', half: 'About half of it', most: 'About three quarters of it' },
      short: { none: 'You lent the king nothing.', quarter: 'You lent the king about a quarter of your vault.', half: 'You lent the king about half your vault.', most: 'You lent the king about three quarters of your vault.' },
      idea: 'The king promised fat gifts because lending to a king at war was dangerous: a high interest rate is pay for the risk of not being repaid.',
      unit: 'Unit 4, Bonds, where riskier borrowers pay more to borrow.' },
    t4: { title: 'The Church’s Rule', label: 'The Church’s rule', place: 'Florence, 1340', year: 1340,
      body: '<p>The Church forbids charging any interest on a loan, and a known usurer can be refused a Christian burial. You still want to be paid for lending to the merchants.</p>',
      legend: 'How will you get paid for your loans to merchants?',
      act: 'Lay your loan book on the way you will be paid.',
      opts: { open: 'Write the interest into each loan contract', exchange: 'Lend through bills of exchange, and build your charge into the exchange rate',
        gift: 'Ask each merchant for a voluntary gift when he repays', free: 'Lend for free, as the preachers urge' },
      tag: { open: 'Charge interest openly', exchange: 'Hide it in the exchange rate', gift: 'Ask for a gift', free: 'Lend for free' },
      short: { open: 'You charged interest openly.', exchange: 'You hid your charge in the exchange rate.', gift: 'You asked for voluntary gifts.', free: 'You lent for free.' },
      idea: 'Lenders want rent for their money, so when the Church banned interest, bankers kept charging it inside the exchange rate on a bill.',
      unit: 'Unit 2, Renting Money, where you see why borrowing costs what it does and why people called it a sin.' },
    t5: { title: 'The Line at Your Door', label: 'The line at your door', place: 'Florence, a few years later', year: 1345,
      body: '<p>A rumor sweeps Florence that King Edward will not repay his Florentine bankers. Depositors begin to line up at your bench to take their money out, and nobody knows how many will come.</p>',
      legend: 'What do you do?',
      act: 'Pay each depositor by dragging gold from your vault to them, or bar the door.',
      opts: { pay: 'Open the vault and pay everyone in line', sell: 'Pay everyone, and if the coins run out, sell your loans to merchants for half their value',
        bar: 'Bar the door until the panic passes' },
      short: { pay: 'You paid from the vault.', sell: 'You paid, selling loans if you had to.', bar: 'You barred the door.' },
      idea: 'In a run, a bank survives only if it can turn what it owns into coins fast enough. A bank with good loans can still die for lack of cash.',
      unit: 'Unit 5, Banks, where a run closes Silicon Valley Bank in 2023.' },
  };

  // What happened, in a sentence or two (version 1's reviewed wording).
  function consequence(id, st, prev) {
    const e = st.ev, c = e.choice;
    if (id === 't1') return {
      bill: 'He pays you here, your partner pays his supplier in Bruges in Flemish money, and no coin crosses the Alps. The exchange rate you set between the two currencies leaves you 40 florins ahead.',
      ship: 'The gold reaches Bruges after weeks on the road. You charged him 40 florins, but the guards and mules cost you 30 of them.',
      refuse: 'He takes his business to the Bardi, one of the two biggest banking companies in Florence, and they write him a bill of exchange. You earn nothing.' }[c];
    if (id === 't2' && Array.isArray(e.lend)) return e.lend.length
      ? `You lend ${flo(e.lent)} to ${e.lend.length === 1 ? 'one borrower' : e.lend.length + ' borrowers'}, who promise to repay more than they borrowed. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.`
      : 'Every coin sits safe in your vault, and none of it earns anything. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.';
    if (id === 't2') return c === 'none'
      ? 'Every coin sits safe in your vault, and none of it earns anything. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.'
      : `Cloth merchants borrow ${flo(e.lent)} to buy wool and dye, and promise to pay back more than they borrowed. Your depositors can ask for their 4,000 florins on any day, so the ledger counts them as money you owe.`;
    if (id === 't3') return e.K
      ? `You lend King Edward ${flo(e.K)}. For two years his gifts arrive on time, ${flo(e.gifts)} in all, and your bank has never been worth more.`
      : 'You lend him nothing. For two years you watch the Bardi and the Peruzzi collect the king’s gifts.';
    if (id === 't4') {
      if (!e.M) return {
        open: 'You have no loans to merchants, so there is no interest to collect or hand back. Had you charged it openly, your neighbors would have called you a usurer.',
        exchange: 'You have no loans to merchants, so there is nothing to collect this time. The route you chose is the one Florence’s bankers used: the charge hides in the exchange rate, and the Church treats the deal as trading currencies.',
        gift: 'You have no loans to merchants, so there is nothing to collect this time. Voluntary gifts would have brought in about half of what your loans could earn.',
        free: 'You have no loans to merchants, so lending for free costs you nothing this time.' }[c];
      return {
        open: 'Your neighbors call you a usurer, and the priest will not give you communion until you make amends. You hand the interest back and earn nothing.',
        exchange: e.earned > 0 ? `Each merchant takes florins here and repays your partner in Bruges in Flemish money, at exchange rates that favor you on the trip there and back. The Church treats it as trading currencies, not lending, and you collect ${flo(e.earned)}.`
          : `Each merchant takes florins here and repays your partner in Bruges in Flemish money, but the exchange rates move against you before the bills come home, and you ${e.earned < 0 ? 'lose ' + flo(-e.earned) : 'earn nothing'}.`,
        gift: `Some merchants give generously, and some give nothing. You collect ${flo(e.earned)}, half of what your loans could have earned.`,
        free: 'The preachers praise you from the pulpit, and your loans earn nothing.' }[c];
    }
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
  // Turn 4 on the table: what the student asked on the bill, what rival benches asked this year, and how the exchange moved.
  function billNote(e) {
    if (e.choice !== 'exchange' || e.rate == null) return '';
    const lost = Math.round((1 - e.accept) * 8), mv = e.shock === 0 ? 'The exchange rates did not move while the bills travelled.' : `The exchange rates moved ${Math.abs(e.shock)} ${e.shock > 0 ? 'in your favor' : 'against you'} for every 100 while the bills travelled.`;
    return `You asked ${e.rate} for every 100. Rival benches asked ${e.going} this year, ${e.rate > e.going ? (lost >= 8 ? 'so every merchant took his business to them.' : `so ${lost} merchant${lost === 1 ? '' : 's'} in 8 took their business to them.`) : e.rate < e.going ? `so you left ${e.going - e.rate} for every 100 on the table.` : 'so every merchant stayed.'} ${mv}`;
  }
  // Plain-text ledger (the tests read it; the table draws ledgerRows in a book hand).
  function ledger(st, prev, caption, k) {
    return caption + ': ' + ledgerRows(st, prev, k).map((r) => `${r.label} ${fl(r.now)}${r.change ? ' (' + (r.change > 0 ? '+' : '') + fl(r.change) + ')' : ''}`).join('; ') + (st.failed ? '. Your bank has closed.' : '');
  }

  // ---------------- the chronicle (the version 1 "How Your Bank Fared" content, written as a page) ----------------
  const CHRON = {
    t1: { bill: 'In the year 1338 a wool merchant came to the bench, owing a supplier in Bruges, and the banker wrote him a bill of exchange, so that not one coin crossed the Alps.',
      ship: 'In the year 1338 a wool merchant came to the bench, owing a supplier in Bruges, and the banker sent his gold over the Alps on mules, under guard.',
      refuse: 'In the year 1338 a wool merchant came to the bench, owing a supplier in Bruges, and the banker sent him away to the Bardi.' },
    t2: { none: 'Shopkeepers, wool workers and a convent left 4,000 florins with the bank, and the banker kept every coin in the vault.',
      l1000: 'Shopkeepers, wool workers and a convent left 4,000 florins with the bank, and the banker lent 1,000 of them to cloth merchants.',
      l2000: 'Shopkeepers, wool workers and a convent left 4,000 florins with the bank, and the banker lent half of them to cloth merchants.',
      l3600: 'Shopkeepers, wool workers and a convent left 4,000 florins with the bank, and the banker lent 3,600 of them to cloth merchants.' },
    t3: (e) => (e.K ? `In 1339 the agents of King Edward III of England came for gold for his war with France, and the banker lent him ${flo(e.K)}.`
      : 'In 1339 the agents of King Edward III of England came for gold for his war with France, and the banker lent him nothing.'),
    t4: { open: 'The banker wrote interest openly into his contracts, and was called a usurer for it.',
      exchange: 'The banker took his pay inside the exchange rate on his bills, as Florence’s bankers did.',
      gift: 'The banker asked the merchants for gifts, and some gave and some did not.',
      free: 'The banker lent for free, as the preachers urged.' },
  };
  // the vault chapter, written from the borrowers the banker accepted (version 3)
  function chronLend(e) {
    if (!Array.isArray(e.lend)) return '';
    const who = { nun: 'the convent, for brewing kettles', silk: 'a silk weaver', alum: 'a hooded dealer in alum nobody knew', wool: 'Ser Lapo the wool merchant' };
    const names = PITCHES.filter((p) => e.lend.indexOf(p.id) >= 0).map((p) => who[p.id]);
    if (!names.length) return CHRON.t2.none;
    const list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return `Shopkeepers, wool workers and a convent left 4,000 florins with the bank, and the banker lent ${flo(e.lent)} of them to ${list}.`;
  }
  function fateOf(sim) { return sim.failed === 'run' ? 'run' : sim.failed === 'default' ? 'default' : 'survived'; }
  // The safe-path line (version 1 review fix): a bank that lent nothing to merchants and survived sees what a modest loan book earns.
  function safeLine(ch, sim) {
    if (sim.failed || keyOf(ch.t2) !== 'none') return '';
    const alt = simulate(Object.assign({}, ch, { t2: 'l1000', t4: 'exchange', rate: null })), a5 = alt.states[5];
    if (!alt.failed && a5.ev.run === 'paid' && alt.W > sim.W) return `Keeping every deposit in the vault made your bank safe, but the deposits earned nothing. Had you lent 1,000 florins of them to merchants and charged through the exchange rate, with every other choice the same, your bank would have ended worth ${flo(alt.W)} and still paid the line from its vault.`;
    return '';
  }
  const HEADS = { run: 'Your bank closed when its vault ran dry in the run.', default: 'Your bank failed when the king stopped paying.' };
  function chronicle(ch) {
    const sim = simulate(ch); if (sim.done < 5) return null;
    const end = sim.states[5], fate = fateOf(sim);
    const e5 = end.ev;
    const run = e5.choice === 'bar' ? 'When the rumor came that the king would not pay, the banker barred his door, and when he opened it every depositor wanted all their coins back.'
      : e5.run === 'paid' ? `When the rumor came that the king would not pay, depositors lined up for ${flo(e5.D)}, and the banker paid them all from his vault.`
      : e5.run === 'sold' ? 'When the rumor came that the king would not pay, the vault ran short, and the banker sold loans at half their value to pay the line.'
      : 'When the rumor came that the king would not pay, the vault ran dry with people still in line, and the banker closed his bench.';
    const ends = { survived: `The king stopped paying, and the bank survived, worth ${flo(end.W)}.`,
      run: 'The king stopped paying, but the bank had already closed.',
      default: 'The king stopped paying, and the bank owed more than it owned, and failed.' };
    const items = [
      { id: 't1', text: CHRON.t1[keyOf(ch.t1)] }, { id: 't2', text: chronLend(sim.states[2].ev) || CHRON.t2[keyOf(ch.t2)] }, { id: 't3', text: CHRON.t3(sim.states[3].ev) },
      { id: 't4', text: CHRON.t4[keyOf(ch.t4)] + (sim.states[4].ev.vanished ? ' The hooded dealer in alum vanished with his loan.' : '') }, { id: 't5', text: run + ' ' + ends[fate] },
    ].map((x) => Object.assign(x, { short: TURNS[x.id].short[keyOf(ch[x.id])], idea: TURNS[x.id].idea, unit: 'This idea comes back in ' + TURNS[x.id].unit }));
    return { fate, head: HEADS[fate] || `Your bank came through the 1340s, worth ${flo(end.W)}.`, W: end.W, items, safe: safeLine(ch, sim),
      real: 'The Peruzzi company went bankrupt in 1343, and the Bardi company failed in 1346. King Edward’s unpaid war loans helped bring both down, along with a wider crisis in Florence. In Italian a failed bank was a <i>banca rotta</i>, a broken bench, which gave English the word <i>bankrupt</i>.' };
  }
  // The same content as HTML (the tests read this; the table lays the chronicle out itself).
  function storyHtml(ch) {
    const c = chronicle(ch); if (!c) return '<p>Your bank’s story is not over yet.</p>';
    return `<p class="fl-head">${c.head}</p>${c.safe ? `<p>${c.safe}</p>` : ''}<ul>${c.items.map((x, i) => `<li><p>${i + 1}. ${TURNS[x.id].title}. ${x.text}</p><p>${x.idea}</p><p>${x.unit}</p></li>`).join('')}</ul><p>${c.real}</p>`;
  }

  // ---------------- receipt contract (version 1, unchanged) ----------------
  const SUFFIX = 'abcdefghjkmnpqrstuvwxyz';
  function buildTasks(rng, h) {
    const game = { choices: {}, practice: false };
    return TURN_IDS.map((id) => {
      const sfx = h.pick(rng, SUFFIX.split('')) + h.pick(rng, SUFFIX.split(''));
      return { id, sfx, values: OPT[id].map((k) => k + '-' + sfx), game };
    });
  }
  function judgeTask(t, e) {
    if (e && e.choice != null && t.values.indexOf(String(e.choice)) >= 0) return { ok: true };
    return { ok: false, msg: 'Choose one of the options.' };
  }
  const helpText = () => 'Any choice is fine. Choose the one you would make, then see what happens.';
  const selfAnswer = (t) => ({ choice: t.values[0], rows: null, value: null });
  const selfWrong = () => ({ choice: 'none-00', rows: null, value: null });

  const STEPS = TURN_IDS.map((id) => ({ id, label: TURNS[id].label, kind: 'task' }))
    .concat([{ id: 'story', label: 'How your bank fared', kind: 'walk' }, { id: 'note', label: 'Your note', kind: 'note' }]);

  root.DESK = {
    app: 'finan3-w01-florence-desk', version: 1, seedVersion: 1, salt: 'rize-finan3-w01-florence:4c19e7', points: 20,
    storageKey: 'rize-finan3-w01-florence-v2table', filePrefix: 'BankerOfFlorence',
    verifyUrl: 'https://rizecomputerscience.github.io/finan3-florence-desk/verify.html',
    calcPlaceholder: '', calcHint: '',
    story: { title: 'The Banker of Florence', kicker: 'Financial Markets and Institutions, Unit 1', company: 'Florence', team: '1338 to 1346',
      dek: 'Florence, 1338. Your family runs a small bank from a bench in the market, a <i>banca</i>, which is where the word bank comes from. For five turns you decide what the bank does with its gold, and you see what each decision does to it.',
      stepsLine: 'The game has five turns with one decision each. There is nothing to calculate and no wrong choice, and a bank that fails earns full credit too.' },
    steps: STEPS, quiz: [], walk: { title: 'How Your Bank Fared', intro: '', stages: [], sources: '', render: () => '' },
    buildTasks, judgeTask, helpText, selfAnswer, selfWrong, praise: () => '', taskView: () => ({}),
    note: { title: 'Your Note', label: 'Your note', minWords: 25, receiptHeading: 'Note: the decision that settled my bank’s fate',
      prompt: 'Which of your decisions settled your bank’s fate, and why? Then pick one stop on the paycheck’s trip in Follow One Paycheck (the credit union, the retirement fund or the grocery chain selling bonds) and say how it faces the same decision today.' },
    // For the table and the tests.
    simulate, score, runDamage, runScript, billNote, PITCHES, RISK_PREMIUM, lentOf, bucketOf, yearFrom, YEARS, YEAR0, accepting, kingOptions, lendOptions, ledgerRows, chronicle, fateOf, safeLine,
    N, OPT, TURN_IDS, TURNS, storyHtml, consequence, ledger, keyOf, fl, flo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
