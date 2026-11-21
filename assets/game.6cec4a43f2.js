import { createView, FAITH_COLOURS, VENUE_COLOURS, SPORT_COLOURS } from './view3d.5c150d4580.js';
import {
  MAX_GUESSES, STAGES, CHECKS, stageFor, hintsFor, countryLock, distanceShown, dayNumber, puzzleId, msUntilTomorrow,
  searchPlaces, scoreGuess, formatKm, proximity, shareText, emptyStats, recordResult,
} from './logic.b618b19450.js';

const SPORT_NAMES = { soccer: 'Football', gaelic_games: 'Gaelic games', rugby_union: 'Rugby union', rugby_league: 'Rugby league', australian_football: 'Australian football', american_football: 'American football', field_hockey: 'Hockey', table_tennis: 'Table tennis', four_square: 'Four square', beachvolleyball: 'Beach volleyball', american_handball: 'Handball (US)' };
const sportName = (k) => SPORT_NAMES[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const CHECK_VALUES = {
  north: 'North', south: 'South', left: 'Left', right: 'Right', none: 'Folk / none', christian: 'Christian', muslim: 'Muslim', hindu: 'Hindu',
  buddhist: 'Buddhist', jewish: 'Jewish', shinto: 'Shinto', latin: 'Latin', cyrillic: 'Cyrillic', arabic: 'Arabic', greek: 'Greek',
  hebrew: 'Hebrew', georgian: 'Georgian', armenian: 'Armenian', indic: 'Indic', thai: 'Thai', lao: 'Lao', khmer: 'Khmer',
  burmese: 'Burmese', chinese: 'Chinese', japanese: 'Japanese', korean: 'Korean', ethiopic: 'Ethiopic', thaana: 'Thaana',
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

const today = dayNumber(meta.epoch);
const view = createView($('map'), window.maplibregl);
window.__view = view;
let game; // { n, id, answer, practice, guesses: [], map }

async function start({ practiceId } = {}) {
  const practice = !!practiceId;
  const n = practice ? 0 : (Number(params.get('day')) || today);
  const id = practiceId || params.get('city') || puzzleId(meta.order, n);
  const answer = meta.cities[id];
  const saved = practice ? null : store.get(`streetle:day:${n}`, null);
  game = { n, id, answer, practice, guesses: saved?.id === id ? saved.guesses : [], map: null };
  $('sub').textContent = practice ? 'Practice map' : `No. ${n} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  $('loading').hidden = false;
  $('guessInput').value = '';
  hideSuggest();
  try {
    const res = await fetch(`data/3d/${id}.json`);
    if (!res.ok) throw new Error(res.status);
    game.map = await res.json();
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


// Which coloured building set is lit: the newest one a stage brings, unless the player tapped a legend.
function lit(stage) {
  const options = [stage.faith && 'faith', stage.venues && 'venues'].filter(Boolean);
  return options.includes(game.lit) ? game.lit : options[options.length - 1] || null;
}

function draw({ animate = true } = {}) {
  if (!game.map) return;
  const stage = stageFor(game.guesses.length, finished());
  const on = lit(stage);
  view.show(game.map, { ...stage, faith: on === 'faith', venues: on === 'venues' }, { animate });
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
  const stage = stageFor(count, done);
  $('stageLabel').textContent = done ? `${(stage.view * 2) / 1000} km across` : `Guess ${count + 1}/${MAX_GUESSES} · ${stage.label} · ${(stage.view * 2 / 1000).toFixed(1)} km`;

  renderHints(count, done);

  const list = $('guesses');
  list.innerHTML = '';
  game.guesses.forEach((g, i) => {
    const li = el('li', g.correct ? 'ok' : '');
    const top = el('div', 'row-top');
    const name = el('span', 'n', g.name + ' ');
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
    list.append(li);
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
    $('answerPattern').textContent = a.pattern;
    $('answerNote').textContent = a.note;
    $('practiceBtn').textContent = game.practice ? 'Another practice map' : 'Practice another';
    $('nextIn').textContent = game.practice ? 'Practice maps don’t count towards your stats.' : nextText();
  }
}

function renderHints(count, done) {
  const hints = $('hints');
  hints.innerHTML = '';
  const a = game.answer;
  const stage = stageFor(count, done);
  const on = lit(stage);
  const both = stage.faith && stage.venues;
  const add = (label, ...content) => {
    const li = el('li');
    // With both building legends showing, each one switches which set is coloured on the model.
    const toggle = both && (label === 'Places of worship' ? 'faith' : label === 'Drinking and cafés' ? 'venues' : null);
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
  const t = game.map.tally || {};
  for (const h of hintsFor(count, done)) {
    if (h === 'drink') {
      add('Drinking and cafés',
        dot('faith', `Pubs and bars ${(t.pub || 0) + (t.bar || 0) + (t.nightclub || 0) + (t.biergarten || 0)}`, VENUE_COLOURS.drink),
        dot('faith', `Cafés ${t.cafe || 0}`, VENUE_COLOURS.cafe), dot('faith', `Embassies ${t.embassy || 0}`, VENUE_COLOURS.embassy));
    } else if (h === 'sports') {
      const sp = Object.entries(t.sport || {}).filter(([k]) => !['multi', 'chess'].includes(k)).sort((x, y) => y[1] - x[1]).slice(0, 6);
      if (!sp.length) add('Sports grounds', 'none tagged here');
      else add('Sports grounds', ...sp.map(([k, n]) => dot('faith', `${sportName(k)} ${n}`, SPORT_COLOURS[k] || SPORT_COLOURS.other)));
    } else if (h === 'faiths') {
      const f = Object.entries(game.map.faiths || {}).sort((x, y) => y[1] - x[1]);
      if (!f.length) add('Places of worship', 'none mapped here');
      else add('Places of worship', ...f.map(([k, n]) => {
        const s = el('span', 'faith', `${FAITH_NAMES[k] || k} ${n}`);
        s.style.setProperty('--dot', FAITH_COLOURS[k] || FAITH_COLOURS.other);
        return s;
      }));
    } else if (h === 'streets') {
      const st = (game.map.streets || []).slice(0, 3);
      if (!st.length) add('Street names', 'none mapped here');
      else add('Street names', ...st.map(([n, latin]) => el('span', 'street', latin ? `${n} (${latin})` : n)));
    } else if (h === 'pattern') add('Pattern', a.pattern);
    else if (h === 'continent') add('Continent', a.continent);
    else if (h === 'country' && !done) add('Country', a.country);
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
  $('guessInput').value = '';
  hideSuggest();
  if (!game.practice) {
    store.set(`streetle:day:${game.n}`, { id: game.id, guesses: game.guesses });
    if (finished()) store.set('streetle:stats', recordResult(store.get('streetle:stats', emptyStats()), game.n, won(), game.guesses.length));
  }
  update();
  if (finished() && !game.practice) setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
}

// Autocomplete
let matches = [], active = -1;
function showSuggest() {
  const ul = $('suggest');
  ul.innerHTML = '';
  matches.forEach((p, i) => {
    const li = document.createElement('li');
    li.role = 'option';
    li.setAttribute('aria-selected', String(i === active));
    li.textContent = p[0] + ' ';
    const s = document.createElement('span');
    s.textContent = p[1];
    li.append(s);
    li.addEventListener('mousedown', (e) => { e.preventDefault(); submit(p); });
    ul.append(li);
  });
  ul.hidden = !matches.length;
}
function hideSuggest() { matches = []; active = -1; $('suggest').hidden = true; }

const lockNow = () => countryLock(game.guesses.length, finished(), game.answer);
function suggest() {
  const lock = lockNow();
  matches = searchPlaces(places, $('guessInput').value, lock ? 40 : 8, lock);
  active = matches.length && $('guessInput').value ? 0 : -1;
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
$('practiceBtn').addEventListener('click', () => {
  const ids = meta.order.filter((id) => id !== puzzleId(meta.order, today) && id !== game.id);
  start({ practiceId: ids[Math.floor(Math.random() * ids.length)] });
  scrollTo({ top: 0, behavior: 'smooth' });
});

// Dialogs
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.hasAttribute('data-close')) d.close(); });
}
$('helpBtn').addEventListener('click', () => $('help').showModal());
$('statsBtn').addEventListener('click', () => {
  const s = store.get('streetle:stats', emptyStats());
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
await start();
window.__streetle = { get game() { return game; }, STAGES };
