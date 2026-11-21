import { createView, FAITH_COLOURS, CATEGORY_COLOURS, SPORT_COLOURS } from './view3d.358eb06de8.js';
import {
  MAX_GUESSES, STAGES, CHECKS, stageFor, stageView, hintsFor, foundedText, sizeText, countryLock, distanceShown, dayNumber, puzzleId, msUntilTomorrow,
  dateOfDay, chooseDay, pastPuzzles, allChecksMatch, bonusDistance, DISTANCE_FROM,
  searchPlaces, suggestPlaces, scoreGuess, formatKm, proximity, shareText, emptyStats, recordResult, crowdStanding, placeCounts,
} from './logic.d5c6621bba.js';

const SPORT_NAMES = { soccer: 'Football', gaelic_games: 'Gaelic games', rugby_union: 'Rugby union', rugby_league: 'Rugby league', australian_football: 'Australian football', american_football: 'American football', field_hockey: 'Hockey', table_tennis: 'Table tennis', four_square: 'Four square', beachvolleyball: 'Beach volleyball', american_handball: 'Handball (US)' };
const sportName = (k) => SPORT_NAMES[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const CHECK_VALUES = {
  north: 'North', south: 'South', left: 'Left', right: 'Right', none: 'Folk / none', christian: 'Christian', muslim: 'Muslim', hindu: 'Hindu',
  buddhist: 'Buddhist', jewish: 'Jewish', shinto: 'Shinto', latin: 'Latin', cyrillic: 'Cyrillic', arabic: 'Arabic', greek: 'Greek',
  hebrew: 'Hebrew', georgian: 'Georgian', armenian: 'Armenian', indic: 'Indic', thai: 'Thai', lao: 'Lao', khmer: 'Khmer',
  burmese: 'Burmese', chinese: 'Chinese', japanese: 'Japanese', korean: 'Korean', ethiopic: 'Ethiopic', thaana: 'Thaana',
};

// How each kind of place is named, and what its legend lists.
const CATEGORY = {
  faith: { title: 'Places of worship' },
  drink: { title: 'Where people drink', parts: { drink: 'Pubs and bars', cafe: 'Cafés' } },
  civic: { title: 'Embassies and government', parts: { embassy: 'Embassies', government: 'Government and courts', police: 'Police and fire stations' } },
  market: { title: 'Markets and bazaars', parts: { market: 'Markets', jeweller: 'Jewellers', tailor: 'Tailors and cloth', carpet: 'Carpets' } },
  stay: { title: 'Places to stay', parts: { hotel: 'Hotels', guest: 'Guest houses' } },
  culture: { title: 'Museums and theatres', parts: { museum: 'Museums and galleries', theatre: 'Theatres and cinemas' } },
  eating: { title: 'Eating out', parts: { restaurant: 'Restaurants', fastfood: 'Fast food' } },
  foodshop: { title: 'Food shops', parts: { bakery: 'Bakeries', grocer: 'Butchers and greengrocers', convenience: 'Convenience stores' } },
  learning: { title: 'Schools and universities', parts: { university: 'Universities and colleges', school: 'Schools', library: 'Libraries and bookshops' } },
  health: { title: 'Hospitals and pharmacies', parts: { hospital: 'Hospitals', clinic: 'Clinics and dentists', pharmacy: 'Pharmacies' } },
  money: { title: 'Banks', parts: { bank: 'Banks', atm: 'Cash machines' } },
  beauty: { title: 'Massage and beauty', parts: { massage: 'Massage', salon: 'Beauty salons', cosmetics: 'Cosmetics and perfume' } },
  repair: { title: 'Spare parts and repair', parts: { hardware: 'Hardware', motor: 'Car and motorbike parts', electronics: 'Phones and electronics' } },
  highstreet: { title: 'High-street shops', parts: { charity: 'Charity and second-hand', tobacco: 'Tobacconists', chocolate: 'Chocolatiers' } },
  paperwork: { title: 'Paperwork', parts: { notary: 'Notaries', lawyer: 'Lawyers and translators' } },
  heritage: { title: 'Old walls and ruins', parts: { castle: 'Castles and forts', ruins: 'Ruins', gate: 'Old gates', monument: 'Monuments' } },
  cemetery: { title: 'Cemeteries', parts: { cemetery: 'Cemeteries', graveyard: 'Churchyards and temple graveyards' } },
  sport: { title: 'Sports grounds' },
};
const FAITH_NAMES = { christian: 'Christian', muslim: 'Muslim', hindu: 'Hindu', buddhist: 'Buddhist', jewish: 'Jewish', sikh: 'Sikh', shinto: 'Shinto', taoist: 'Taoist', jain: 'Jain', other: 'Other' };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: play on without saving */ } },
};

const params = new URLSearchParams(location.search);
const [meta, places, facts] = await Promise.all([
  fetch('data/puzzles.json').then((r) => r.json()),
  fetch('data/places.json').then((r) => r.json()),
  fetch('data/countries.json').then((r) => r.json()),
]);

// One city a day, the same for everyone. Earlier days can be opened with ?day=, future days can't.
// On a local dev server, ?day= and ?city= open anything, for QA. The smoke-test server (:5291) plays the
// build exactly as the public site does.
const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '5291';
const todayNow = () => Math.max(1, dayNumber(meta.epoch));
const today = todayNow();
// Saves and stats use keys new at the public launch (2026-11-14), so staging test plays don't carry over.
const dayKey = (n) => `streetle:daily:${n}`;
const STATS_KEY = 'streetle:record';
const view = createView($('map'), window.maplibregl);
window.__view = view;
let game; // { n, id, answer, practice, guesses: [], map }

async function start({ practiceId } = {}) {
  const practice = !!practiceId;
  const n = practice ? 0 : dev ? Number(params.get('day')) || today : chooseDay(params.get('day'), today);
  const id = practiceId || (dev && params.get('city')) || puzzleId(meta.order, n);
  const answer = meta.cities[id];
  const saved = practice ? null : store.get(dayKey(n), null);
  game = { n, id, answer, practice, guesses: saved?.id === id ? saved.guesses : [], map: null };
  $('sub').textContent = practice ? 'An earlier map' : `No. ${n} · ${dateOfDay(meta.epoch, n).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  $('loading').hidden = false;
  $('guessInput').value = '';
  hideSuggest();
  try {
    // The wide map of the city around the model; without it (days served before it existed: no `wide` in the
    // puzzle entry) the map stays close.
    const [res, wide] = await Promise.all([fetch(`data/3d/${id}.json`), (answer.wide ? fetch(`data/wide/${id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null)]);
    if (!res.ok) throw new Error(res.status);
    game.map = await res.json();
    game.map.wide = wide;
  } catch {
    $('loading').textContent = 'This map could not be loaded. Please reload the page.';
    return;
  }
  $('loading').hidden = true;
  draw({ animate: false });
  Promise.race([view.idle(), new Promise((r) => setTimeout(r, 1500))]).then(() => $('mapwrap').classList.add('ready'));
  update({ redraw: false });
}

const won = () => game.guesses.some((g) => g.correct);
const finished = () => won() || game.guesses.length >= MAX_GUESSES;


// The city's own place categories revealed so far (three per city, places of worship always last).
const revealed = (stage) => (game.answer.clues || ['faith', 'drink', 'sport']).slice(0, stage.reveal || 0);

// Which revealed category is coloured on the buildings: the newest, unless the player tapped a legend.
// Sports grounds colour the pitches, so they are always shown once revealed.
function lit(stage) {
  const options = revealed(stage).filter((c) => c !== 'sport');
  return options.includes(game.lit) ? game.lit : options[options.length - 1] || null;
}

function draw({ animate = true } = {}) {
  if (!game.map) return;
  const stage = stageView(stageFor(game.guesses.length, finished()), game.map.wide);
  view.show(game.map, { ...stage, lit: lit(stage), sports: revealed(stage).includes('sport') }, { animate });
}

function setLit(which) {
  game.lit = which;
  draw({ animate: false });
  renderHints(game.guesses.length, finished());
}

function update({ redraw = true } = {}) {
  if (redraw) draw();
  const done = finished();
  const count = game.guesses.length;
  const a = game.answer;

  const dots = $('dots');
  dots.innerHTML = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const li = document.createElement('li');
    if (i < count) li.className = 'used';
    else if (i === count && !done) li.className = 'now';
    dots.append(li);
  }
  const stage = stageView(stageFor(count, done), game.map?.wide);
  const newest = revealed(stage).at(-1);
  const label = stage.label || `New: ${CATEGORY[newest]?.title.toLowerCase() || 'clue'}${stage.hints?.includes('streets') ? ', street names' : ''}`;
  $('stageLabel').textContent = done ? `${+((stage.view * 2) / 1000).toFixed(1)} km across` : `Guess ${count + 1}/${MAX_GUESSES} · ${label} · ${(stage.view * 2 / 1000).toFixed(1)} km`;

  renderHints(count, done);

  const list = $('guesses');
  list.innerHTML = '';
  game.guesses.forEach((g, i) => {
    const li = el('li', g.correct ? 'ok' : '');
    const top = el('div', 'row-top');
    const name = el('span', 'n');
    name.append(el('span', 'no', `${i + 1}`), g.name + ' ');
    name.append(el('span', 'c', g.country));
    top.append(name);
    if (g.correct) top.append(el('span', 'hit', 'Correct'));
    else if (distanceShown(i, done)) {
      const dist = el('span', 'dist');
      dist.append(el('span', 'km', formatKm(g.km)));
      const dir = el('span', 'arrow');
      dir.setAttribute('aria-label', `direction ${Math.round(g.deg)}°`);
      dir.innerHTML = `<svg viewBox="0 0 20 20" style="transform:rotate(${g.deg.toFixed(0)}deg)"><path d="M10 2 L15 12 L10.9 10.6 L10.9 18 L9.1 18 L9.1 10.6 L5 12 Z"/></svg>`;
      dist.append(dir, el('span', 'pct', `${proximity(g.km)}%`));
      top.append(dist);
    } else if (allChecksMatch(g)) {
      // Bonus: all five checks match, so this guess earns the direction; two in a row earns the distance too.
      const dist = el('span', 'dist bonus');
      dist.append(el('span', 'km', bonusDistance(game.guesses, i) ? formatKm(g.km) : 'All 5 match'));
      const dir = el('span', 'arrow');
      dir.setAttribute('aria-label', `direction ${Math.round(g.deg)}°`);
      dir.innerHTML = `<svg viewBox="0 0 20 20" style="transform:rotate(${g.deg.toFixed(0)}deg)"><path d="M10 2 L15 12 L10.9 10.6 L10.9 18 L9.1 18 L9.1 10.6 L5 12 Z"/></svg>`;
      dist.append(dir);
      top.append(dist);
    } else top.append(el('span', 'later', 'distance from guess 5'));
    li.append(top);
    if (g.checks && !g.correct) {
      const row = el('div', 'checks');
      for (const { key, label } of CHECKS) {
        const c = g.checks[key];
        const cell = el('span', c.ok ? 'chk yes' : 'chk no');
        cell.append(el('span', 'mark', c.ok ? '✓' : '✗'), el('span', 'lab', label), el('span', 'val', CHECK_VALUES[c.guess] || c.guess || '?'));
        cell.title = `${label}: ${c.ok ? 'same as the answer' : 'different from the answer'}`;
        row.append(cell);
      }
      li.append(row);
    }
    // Newest guess on top, right under the box, so it never lands below the fold.
    list.prepend(li);
  });

  const lock = countryLock(count, done, game.answer);
  $('guessInput').placeholder = lock ? `Pick a city in ${lock}…` : 'Type a city…';
  // The box usually still has focus from the previous guess, so open the country's list now.
  if (lock && document.activeElement === $('guessInput')) setTimeout(suggest, 0);

  $('guessForm').hidden = done;
  $('result').hidden = !done;
  if (done) {
    $('verdict').textContent = won() ? ['First try!', 'Splendid.', 'Well read.', 'Got there.', 'Close call.', 'Phew — last guess.'][count - 1] : 'Out of guesses. It was…';
    $('answerName').textContent = `${a.name}, ${a.country}`;
    $('answerPattern').textContent = a.area ? `${a.area} · ${a.pattern}` : a.pattern;
    $('answerNote').textContent = a.note;
    $('practiceBtn').textContent = game.practice ? 'Another earlier map' : 'Play an earlier map';
    $('practiceBtn').hidden = !practicePool().length;
    $('nextIn').textContent = game.practice ? 'Earlier maps don’t count towards your stats.' : nextText();
  }
  if (done && !game.practice) { if ($('crowd').hidden || !crowdAt) showCrowd(); }
  else $('crowd').hidden = true;
}

// ---------- everyone's results for the day (totals only), like Trendle's "Where you stand today"
// A finished game is counted once by the pulse counter (games-hub/pulse, POST /v1/play: the puzzle number, solved or
// not, and guesses; no ID, no cookie), which answers with the day's totals including it. Live site only, never on
// staging, localhost or test browsers, and skipped under Global Privacy Control or Do Not Track. Reading the totals
// (GET /v1/stats) adds nothing, so it happens everywhere.
const PULSE = 'https://pulse.fourthmeridiangames.com';
let reported = null;          // { n, totals: Promise } for the game finished on this page
let crowdAt = 0;              // when the totals were last asked for
const reports = () => location.hostname === 'fourthmeridiangames.com' && !/-staging\//.test(location.pathname) && !navigator.webdriver
  && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1' && window.doNotTrack !== '1';

function reportPlay(n, solved, tries) {
  try {
    if (!reports()) return;
    const body = JSON.stringify({ g: 'streetle', n, won: solved, tries });
    // Plain text needs no CORS preflight; keepalive lets it land even if the page is closed at once.
    const sent = fetch(`${PULSE}/v1/play`, { method: 'POST', body, keepalive: true, mode: 'cors', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null));
    reported = { n, totals: sent.catch(() => null) };
  } catch { /* counting must never break the game */ }
}

async function fetchCrowd(n) {
  try {
    const r = await fetch(`${PULSE}/v1/stats?g=streetle&n=${n}`, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function showCrowd() {
  const n = game.n;
  const saved = store.get(`streetle:crowd:${n}`, null);
  renderCrowd(saved);
  crowdAt = Date.now();
  const fresh = await ((reported?.n === n && (await reported.totals)) || fetchCrowd(n));
  if (game.n !== n || game.practice) return;
  if (fresh && fresh.n === n) {
    store.set(`streetle:crowd:${n}`, fresh);
    renderCrowd(fresh);
  } else if (!saved) renderCrowd(null, 'unreachable');
}

const pct = (k, of) => (of ? Math.round((100 * k) / of) : 0);
const svg = (tag, attrs, text) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

function renderCrowd(stats, problem) {
  $('crowd').hidden = false;
  $('crowdTitle').textContent = game.n === today ? 'Where you stand today' : `Where you stand on No. ${game.n}`;
  const mine = won() ? game.guesses.length : 'X';
  const note = (text) => {
    $('crowdNums').replaceChildren(); $('crowdChart').replaceChildren(); $('crowdSub').textContent = '';
    $('crowdRank').className = 'crowd-note';
    $('crowdRank').textContent = text;
  };
  if (!stats) {
    note(problem ? 'The day’s results can’t be reached right now. Your game is saved on this device.' : 'Comparing with the day’s players…');
    return;
  }
  const s = crowdStanding(stats, mine, reported?.n === game.n || reports());
  if (s.beat === null) {
    note('You’re the first to finish. Check back later to see how the day plays out.');
    return;
  }
  $('crowdRank').className = 'crowd-rank';
  $('crowdRank').innerHTML = s.beat >= 50 ? `Top <strong>${Math.max(1, 100 - s.beat)}%</strong>` : `Better than <strong>${s.beat}%</strong>`;
  const players = stats.players.toLocaleString('en-US');
  let vsAvg = '';
  if (s.avg !== null && won()) {
    const d = s.avg - mine;
    vsAvg = ` · ${d >= 0.05 ? `${d.toFixed(1)} guesses under` : d <= -0.05 ? `${(-d).toFixed(1)} guesses over` : 'right on'} the average`;
  }
  $('crowdSub').innerHTML = `${s.beat >= 50 ? `Better than ${s.beat}% of` : 'of'} <strong>${players}</strong> ${stats.players === 1 ? 'player' : 'players'}${vsAvg}`;

  const tile = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
  $('crowdNums').innerHTML = tile(players, 'Players') + tile(`${s.solvedPct}%`, 'Solved')
    + tile(s.avg === null ? '–' : s.avg.toFixed(1), 'Average') + tile(`${pct(stats.dist[0] + stats.dist[1], s.total)}%`, 'In 1 or 2');

  // Bars for not solved, then 6 down to 1 guess, so fewer guesses (better) sit on the right (James, 2026-11-20);
  // the player's own in brass, the solvers' average marked.
  const rows = [...stats.dist, stats.failed];
  const at = mine === 'X' ? MAX_GUESSES : mine - 1;
  const W = 600, H = 120, bw = W / rows.length, peak = Math.max(1, ...rows);
  const col = (i) => rows.length - 1 - i; // rows index (0 = 1 guess, 6 = not solved) → column from the left
  const chart = svg('svg', { viewBox: `0 -34 ${W} ${H + 104}`, role: 'img', 'aria-label': `How ${players} players did: not solved, then 6 guesses down to 1; yours is highlighted` });
  rows.forEach((c, i) => {
    const h = c ? Math.max(3, (c / peak) * H) : 0;
    const bar = svg('rect', { class: i === at ? 'bar you' : 'bar', x: col(i) * bw + 6, y: H - h, width: bw - 12, height: h });
    bar.append(svg('title', {}, `${i < MAX_GUESSES ? `${i + 1} ${i ? 'guesses' : 'guess'}` : 'Not solved'}: ${c.toLocaleString('en-US')} ${c === 1 ? 'player' : 'players'}`));
    chart.append(bar);
    chart.append(svg('text', { class: 'count', x: (col(i) + 0.5) * bw, y: H - h - 6, 'text-anchor': 'middle' }, `${pct(c, s.total)}%`));
    chart.append(svg('text', { class: i === at ? 'label you' : 'label', x: (col(i) + 0.5) * bw, y: H + 20, 'text-anchor': 'middle' }, i < MAX_GUESSES ? String(i + 1) : 'X'));
  });
  chart.append(svg('line', { class: 'axis', x1: 0, x2: W, y1: H + 0.5, y2: H + 0.5 }));
  if (s.avg !== null) {
    const x = (col(s.avg - 1) + 0.5) * bw;
    chart.append(svg('line', { class: 'avg', x1: x, x2: x, y1: -12, y2: H }));
    chart.append(svg('text', { class: 'avg-label', x: Math.min(W - 40, Math.max(40, x)), y: -18, 'text-anchor': 'middle' }, `avg ${s.avg.toFixed(1)}`));
  }
  chart.append(svg('text', { class: 'you-label', x: (col(at) + 0.5) * bw, y: H + 40, 'text-anchor': 'middle' }, 'you'));
  chart.append(svg('text', { class: 'axis-title', x: W / 2, y: H + 62, 'text-anchor': 'middle' }, 'guesses'));
  $('crowdChart').replaceChildren(chart);
}

function renderHints(count, done) {
  const hints = $('hints');
  hints.innerHTML = '';
  const a = game.answer;
  const stage = stageFor(count, done);
  const on = lit(stage);
  const buildingSets = revealed(stage).filter((c) => c !== 'sport');
  const add = (label, ...content) => add2(null, label, ...content);
  const add2 = (cat, label, ...content) => {
    const li = el('li');
    // With more than one kind of building revealed, each legend switches which kind is coloured.
    const toggle = cat && cat !== 'sport' && buildingSets.length > 1 ? cat : null;
    if (toggle) {
      const btn = el('button', 'legend' + (on === toggle ? ' on' : ''));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', String(on === toggle));
      btn.title = on === toggle ? 'Shown on the model' : 'Show these on the model';
      btn.append(el('b', null, label), ...content);
      btn.addEventListener('click', () => setLit(toggle));
      li.append(btn);
      li.className = 'has-legend';
    } else li.append(el('b', null, label), ...content);
    hints.append(li);
  };
  const dot = (cls, text, colour) => { const s = el('span', cls, text); s.style.setProperty('--dot', colour); return s; };
  // Counts follow the zoom: places inside the square on screen, from the wide map's place points. A map without
  // them (a day served before they existed) keeps the fixed totals for the 3D model.
  const zoomed = game.map.wide?.places ? placeCounts(game.map.wide.places, stageView(stage, game.map.wide).view) : null;
  const t = zoomed || game.map.tally || {};
  for (const h of hintsFor(count, done)) {
    const cat = h.startsWith('clue') ? revealed(STAGES[STAGES.length - 1])[Number(h.slice(4))] : null;
    if (cat === 'sport') {
      const sp = Object.entries(t.sport || {}).filter(([k]) => !['multi', 'chess'].includes(k)).sort((x, y) => y[1] - x[1]).slice(0, 6);
      if (!sp.length) add2(cat, CATEGORY.sport.title, 'none tagged here');
      else add2(cat, CATEGORY.sport.title, ...sp.map(([k, n]) => dot('faith', `${sportName(k)} ${n}`, SPORT_COLOURS[k] || SPORT_COLOURS.other)));
    } else if (cat && cat !== 'faith') {
      const parts = CATEGORY[cat].parts, counts = t[cat] || {};
      add2(cat, CATEGORY[cat].title, ...Object.entries(parts).map(([k, name]) => dot('faith', `${name} ${counts[k] || 0}`, CATEGORY_COLOURS[cat][k])));
    } else if (cat === 'faith') {
      const f = Object.entries((zoomed ? zoomed.faith : game.map.faiths) || {}).sort((x, y) => y[1] - x[1]);
      if (!f.length) add2(cat, CATEGORY.faith.title, 'none mapped here');
      else add2(cat, CATEGORY.faith.title, ...f.map(([k, n]) => {
        const s = el('span', 'faith', `${FAITH_NAMES[k] || k} ${n}`);
        s.style.setProperty('--dot', FAITH_COLOURS[k] || FAITH_COLOURS.other);
        return s;
      }));
    } else if (h === 'streets') {
      const st = (game.map.streets || []).slice(0, 3);
      if (!st.length) add('Street names', 'none mapped here');
      else add('Street names', ...st.map(([n, latin]) => el('span', 'street', latin ? `${n} (${latin})` : n)));
    } else if (h === 'country' && !done) add('Country', a.country);
    else if (h === 'founded' && a.founded) add('Founded', foundedText(a.founded));
    else if (h === 'size' && a.rank) add('Size', sizeText(a.rank));
  }
}

function nextText() {
  const ms = msUntilTomorrow();
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `Next map in ${h} h ${m} min.`;
}

function submit(place) {
  if (!place || finished()) return;
  if (game.guesses.some((g) => g.name === place[0] && g.country === place[1])) {
    toast('Already guessed');
    return;
  }
  game.guesses.push(scoreGuess(game.answer, place, facts));
  if (allChecksMatch(game.guesses.at(-1)) && game.guesses.length <= DISTANCE_FROM && !finished()) {
    toast(bonusDistance(game.guesses, game.guesses.length - 1) ? 'All five match twice in a row: here is the distance too' : 'All five match: here is the direction');
  }
  $('guessInput').value = '';
  hideSuggest();
  if (!game.practice) {
    store.set(dayKey(game.n), { id: game.id, guesses: game.guesses });
    if (finished()) {
      store.set(STATS_KEY, recordResult(store.get(STATS_KEY, emptyStats()), game.n, won(), game.guesses.length));
      reportPlay(game.n, won(), game.guesses.length);
    }
  }
  update();
  if (finished() && !game.practice) setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
}

// Autocomplete
let matches = [], active = -1, byCountry = null;
function showSuggest() {
  const ul = $('suggest');
  ul.innerHTML = '';
  matches.forEach((p, i) => {
    if (byCountry && i === byCountry.from) {
      // Typing a country lists its cities under a heading; the heading itself can't be picked.
      const h = document.createElement('li');
      h.className = 'head';
      h.role = 'presentation';
      const n = matches.filter((m) => m[1] === byCountry.country).length;
      h.textContent = `${n} ${n === 1 ? 'city' : 'cities'} in ${byCountry.country}, biggest first`;
      h.addEventListener('mousedown', (e) => e.preventDefault());
      ul.append(h);
    }
    const li = document.createElement('li');
    li.role = 'option';
    li.setAttribute('aria-selected', String(i === active));
    li.textContent = p[0] + ' ';
    const s = document.createElement('span');
    s.textContent = p[1];
    li.append(s);
    li.addEventListener('mousedown', (e) => { e.preventDefault(); submit(p); });
    ul.append(li);
    if (i === active) requestAnimationFrame(() => li.scrollIntoView({ block: 'nearest' }));
  });
  ul.hidden = !matches.length;
}
function hideSuggest() { matches = []; active = -1; byCountry = null; $('suggest').hidden = true; }

const lockNow = () => countryLock(game.guesses.length, finished(), game.answer);
function suggest() {
  const q = $('guessInput').value;
  const s = suggestPlaces(places, q, lockNow());
  matches = s.list;
  byCountry = s.country ? s : null;
  // A bare country name doesn't preselect its biggest city, so Enter can't guess it by accident.
  active = matches.length && q && !(byCountry && byCountry.from === 0) ? 0 : -1;
  showSuggest();
}
$('guessInput').addEventListener('input', suggest);
// On the last guess, focusing the box lists the country's cities straight away.
$('guessInput').addEventListener('focus', () => { if (lockNow()) suggest(); });
$('guessInput').addEventListener('click', () => { if (lockNow() && $('suggest').hidden) suggest(); });
$('guessInput').addEventListener('keydown', (e) => {
  if (!matches.length) return;
  if (e.key === 'ArrowDown') { active = (active + 1) % matches.length; showSuggest(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { active = (active - 1 + matches.length) % matches.length; showSuggest(); e.preventDefault(); }
  else if (e.key === 'Escape') hideSuggest();
});
$('guessInput').addEventListener('blur', () => setTimeout(hideSuggest, 120));
$('guessForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (active >= 0 && matches[active]) submit(matches[active]);
  else {
    const m = $('guessInput').value ? searchPlaces(places, $('guessInput').value, 1, lockNow()) : [];
    if (m.length) submit(m[0]);
    else toast('Pick a city from the list');
  }
});

// Result actions
$('shareBtn').addEventListener('click', async () => {
  const text = shareText({ n: game.n, guesses: game.guesses, won: won(), practice: game.practice }) + '\n' + location.origin + location.pathname;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
  } catch { /* share sheet dismissed */ }
});
// Practice replays cities from earlier days only (none on day 1), so it never shows a future day's city.
const practicePool = () => pastPuzzles(meta.order, today).filter((id) => id !== puzzleId(meta.order, today) && id !== game.id);
$('practiceBtn').addEventListener('click', () => {
  const ids = practicePool();
  if (!ids.length) return;
  start({ practiceId: ids[Math.floor(Math.random() * ids.length)] });
  scrollTo({ top: 0, behavior: 'smooth' });
});

// Dialogs
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.hasAttribute('data-close')) d.close(); });
}
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('statsBtn').addEventListener('click', () => {
  const s = store.get(STATS_KEY, emptyStats());
  $('nums').innerHTML = [['Played', s.played], ['Win %', s.played ? Math.round((100 * s.won) / s.played) : 0], ['Streak', s.streak], ['Best', s.best]]
    .map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  const max = Math.max(1, ...s.dist);
  const mine = !game.practice && won() ? game.guesses.length : 0;
  $('dist').innerHTML = s.dist.map((v, i) => `<div><span>${i + 1}</span><i class="${mine === i + 1 ? 'me' : ''}" style="width:${Math.max(8, (100 * v) / max)}%">${v}</i></div>`).join('');
  $('stats').showModal();
});

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

let lastWidth = 0;
new ResizeObserver(() => {
  const w = $('mapwrap').clientWidth;
  if (Math.abs(w - lastWidth) > 2) { lastWidth = w; view.resize(); }
}).observe($('mapwrap'));
$('recenter').addEventListener('click', () => view.resetCamera());

if (!store.get('streetle:seenHelp', false)) {
  store.set('streetle:seenHelp', true);
  $('help').showModal();
}
// A page left open past midnight moves on to the new day's city: the countdown ticks, and the page reloads
// once the day has changed (checked every half minute and whenever the tab is looked at again).
function checkNewDay() {
  if (game && !game.practice && !params.has('day') && todayNow() !== today) location.reload();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  checkNewDay();
  // Like Trendle, keep the day's numbers fresh while the finished page is open: at most once a minute.
  if (game && finished() && !game.practice && Date.now() - crowdAt > 60000) showCrowd();
});
setInterval(() => {
  checkNewDay();
  if (game && finished() && !game.practice) $('nextIn').textContent = nextText();
}, 30000);

await start();
window.__streetle = { get game() { return game; }, STAGES };
