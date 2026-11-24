(function (G) {
'use strict';
const PM = G.PM, esc = G.esc, hl = (c, l) => /^(sql|mysql|mssql|postgres|oracle|mongo)$/.test(l) ? sqlHl(c, l) : G.hl(c, l);
const KEY = 'lp-v1';
const PASS = 65;
const passAt = n => Math.ceil(n * PASS / 100);
const L4 = 'abcde';
const isA = (q, i) => q.multi ? String(q.a).split(',').indexOf(String(i)) >= 0 : i === q.a;
const isP = (p, i) => p != null && String(p).split(',').indexOf(String(i)) >= 0;
const ansL = q => q.multi ? String(q.a).split(',').map(i => L4[i]).join(' + ') : L4[q.a];
const ansText = q => q.multi ? String(q.a).split(',').map(i => q.o[i]).join(' / ') : q.o[q.a];

/* ---------------------------------------------------------------- course registry */
const COURSES = [], CB = {}, QBY = {};
function addCourse(c) {
  c.TOP = {}; c.topics.forEach(t => c.TOP[t.code] = t);
  c.LAB = {}; c.labs.forEach(l => c.LAB[l.id] = l);
  c.labFor = code => c.labs.find(l => l.topic === code);
  c.questions = c.questions.map((q0, i) => {
    const q = Object.assign({}, q0, { id: c.id + ':' + q0.id, course: c.id, o: q0.o.slice(), r: q0.r.slice() });
    QBY[q.id] = q; return q; /* packages are balanced at authoring time (PLATFORM.md §10); no reshuffle here */ const target = (i * 7 + Math.floor(i / 4)) % 4; const shift = (target - q.a + 4) % 4;
    if (shift) { const ro = a => a.map((_, k) => a[(k - shift + 4) % 4]); q.o = ro(q.o); q.r = ro(q.r); q.a = target; }
    QBY[q.id] = q; return q;
  });
  COURSES.push(c); CB[c.id] = c;
}
/* ---------------------------------------------------------------- LP registry + package adapter (PLATFORM.md §16, §17) */
const APP_NAME = 'QA Pathways';              /* placeholder: naming is deferred (CONTEXT.md) */
const LPQ = (G.LP && G.LP.q) || [];
const LP = G.LP = { q: [], packages: [], plugins: {}, refused: [],
  register(p) { this.packages.push(p); }, match: { api: s => matchApi(s), web: s => matchWeb(s) }, plugin(p) { this.plugins[p.id] = p; }, extension(p) { this.plugins[p.id] = p; } };
LPQ.forEach(([k, p]) => k === 'course' ? LP.register(p) : LP.plugin(p));
const HOST_PLUGINS = { 'labs-api': !!(G.PM && G.PM.C), 'labs-web': !!(G.PWC && G.PWC.C), 'labs-sql': true, demos: !!LP.plugins.demos };
const hasPlugin = x => !!HOST_PLUGINS[x] || !!LP.plugins[x];   /* host-provided, or shipped inside a package (plugins/<id>/plugin.js) */
const deser = a => a && typeof a === 'object' && 're' in a ? new RegExp(a.re, a.flags) : a;
/* declarative 'match' checks (PLATFORM.md §13.3) — one generic evaluator per lab plugin, no lab-specific code */
const deepDeser = a => Array.isArray(a) ? a.map(deepDeser) : a && typeof a === 'object' ? (typeof a.re === 'string' && Object.keys(a).every(k => k === 're' || k === 'flags') ? deser(a) : Object.fromEntries(Object.entries(a).map(([k, v]) => [k, deepDeser(v)]))) : a;
const reAll = (res, s) => [].concat(res).every(re => re.test(String(s == null ? '' : s)));
const subset = (want, got) => !!got && typeof got === 'object' && Object.keys(want).every(k => want[k] && typeof want[k] === 'object' ? subset(want[k], got[k]) : got[k] === want[k]);
const jsonOf = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const quant = (arr, pred, S) => S.none ? !arr.some(pred) : S.every ? arr.length > 0 && arr.every(pred) : arr.filter(pred).length >= (S.min || 1);
function matchApi(S) {
  S = deepDeser(S);
  const runOk = (x, i, all) => !!x.request && (!S.method || x.request.method === S.method) && (!S.url || reAll(S.url, x.request.url)) &&
    (!S.path || reAll(S.path, G.PM.pathOf(x.request.url))) && (S.status === undefined || (!!x.response && x.response.code === S.status)) &&
    (!S.sentRaw || reAll(S.sentRaw, x.request.body)) && (!S.sentBody || subset(S.sentBody, jsonOf(x.request.body))) &&
    (!S.respBody || (!!x.response && subset(S.respBody, jsonOf(x.response.body)))) && (!S.hasTests || (x.tests || []).length > 0) &&
    (!S.logWhere || (x.logs || []).some(l => l.where === S.logWhere)) &&
    (!S.after || all.slice(0, i).some(y => y.request && y.request.method === S.after.method));
  const field = (it, f) => f === 'body' ? ((it.body || {}).raw || '') : f === 'tests' || f === 'prerequest' ? (it[f] || '') : (it[f] || '');
  return r => {
    if (S.on === 'runs') return quant(r.runs, (x, i) => runOk(x, i, r.runs), S);
    if (S.on === 'items') { const its = r.ws.collection.items.filter(i => !S.name || i.name === S.name); return quant(its, i => reAll(S.re, field(i, S.field || 'url')), S); }
    if (S.on === 'collection') return reAll(S.re, r.ws.collection[S.field || 'tests'] || '');
    if (S.on === 'examples') { const n = []; r.ws.collection.items.forEach(i => (i.examples || []).forEach(e => { if ((!S.method || e.method === S.method) && (!S.path || e.path === S.path)) n.push(e.name); })); return (S.names || []).every(x => n.includes(x)) && n.length >= (S.min || 1); }
    if (S.on === 'var') { const v = (r[S.scope || 'coll'] || {})[S.key]; return v !== undefined && v !== '' && (!S.re || reAll(S.re, v)) && (S.gte === undefined || Number(v) >= S.gte); }
    return false;
  };
}
function matchWeb(S) {
  S = deepDeser(S);
  return r => (!S.apiMethods || S.apiMethods.every(m => (r.api || []).some(a => a.method === m))) &&
    (!S.apiStatuses || S.apiStatuses.every(s => (r.api || []).some(a => a.status === s))) &&
    (!S.code || G.PWC.C.code(S.code, S.code, '')[1](r)) &&
    (!S.asserted || G.PWC.C.asserted(S.asserted, '')[1](r));
}
function adaptLab(a, plugin) {
  const P = a.payload || {};
  if (plugin === 'labs-sql') return { id: a.id, topic: a.topic, title: a.title, brief: a.brief, tasks: a.tasks, hints: a.hints, payload: P, spec: a.checks || [], interview: a.interview || null, checks: [] };
  const checks = (a.checks || []).map(c => {
    if (c.type === 'named') return [c.label, () => false];   /* retired: use 'match' (PLATFORM.md §13.3) */
    if (c.type === 'match') { const f = (plugin === 'labs-api' ? matchApi : matchWeb)(c.args[0]); return [c.label, r => { try { return !!f(r); } catch (e) { return false; } }]; }
    if (plugin === 'labs-api') return [c.label, G.PM.C[c.type](...(c.args || []).map(deser))];
    const r = G.PWC.C[c.type]; const out = typeof r === 'function' ? r(...(c.args || []).map(deser)) : r;
    return [c.label, out[1]];
  });
  if (plugin === 'labs-api') {
    const sol = P.solution;
    return { id: a.id, topic: a.topic, title: a.title, brief: a.brief, tasks: a.tasks, hints: a.hints, start: G.PM.normWs(JSON.parse(JSON.stringify(P.start))), bugs: P.bugs,
      solution: ws => { Object.keys(ws).forEach(k => delete ws[k]); Object.assign(ws, JSON.parse(JSON.stringify(sol))); }, checks };
  }
  return { id: a.id, topic: a.topic, title: a.title, site: P.site, brief: a.brief, tasks: a.tasks, hints: a.hints, starter: P.starter, solution: P.solution || null, checks };
}
function fromPackage(p) {
  const m = p.manifest, plug = (m.plugins || []).map(x => x.id || x);
  const missing = plug.filter(x => !hasPlugin(x));
  if (String(m.contract).split('.')[0] !== '2' || missing.length) { LP.refused.push({ id: m.id, title: m.title, why: missing.length ? 'needs the ' + missing.join(', ') + ' plugin' : 'contract ' + m.contract }); return null; }
  const lab = plug.find(x => x.startsWith('labs-')) || null;
  const modules = [], topics = [];
  p.syllabus.modules.forEach((mo, mi) => {
    const n = Number(mo.id) || mi + 1;
    modules.push({ n, title: mo.title, level: mo.difficulty || (mo.examQuestions ? mo.examQuestions + ' exam Qs' : ''), blurb: mo.blurb || '', examQuestions: mo.examQuestions });
    const add = (t, sec) => topics.push({ code: t.code, title: t.title, lo: t.objective, loCode: t.lo || null, min: t.minutes, m: n, sec: sec || null, k: t.level, refs: t.refs || [] });
    (mo.sections || []).forEach(s => s.topics.forEach(t => add(t, s.id + ' · ' + s.title)));
    (mo.topics || []).forEach(t => add(t));
  });
  const lessons = {};
  Object.keys(p.lessons).forEach(code => {
    const L = p.lessons[code]; const ex = L.example || {};
    const isVar = (m.variants || []).length && Object.keys(ex).some(k => k !== 'default');
    lessons[code] = { md: L.explanation + (isVar ? '' : '\n\n### Example\n' + L.exampleMd), ex: isVar ? ex : null, tip: L.watchOut };
  });
  const questions = p.questions.map(q => {
    const multi = Array.isArray(q.answer);
    return Object.assign({ id: q.id, code: q.topic, kind: q.kind, q: q.stem, o: q.options || [], a: q.format === 'query' ? 0 : multi ? q.answer.slice().sort().join(',') : q.answer, r: q.rationale || [], multi, k: q.level, concept: q.concept, mock: q.mock || null },
      q.format === 'query' ? { fmt: 'query', eng: q.engine || 'sql', ds: q.dataset || 'clinic', sol: q.solution, starter: q.starter || '', order: !!q.order, cols: q.columns || 'count' } : {});
  });
  const acts = Object.values(p.activities || {});
  const labs = lab ? acts.filter(a => a.type === 'lab' && !(a.payload || {}).playground).map(a => adaptLab(a, lab)) : [];
  const pg = acts.find(a => (a.payload || {}).playground);
  const demos = {}; if (plug.indexOf('demos') >= 0) acts.filter(a => a.type === 'demo' && a.plugin === 'demos').forEach(a => { demos[a.topic] = a; });
  const bp = p.blueprints, mix = {};
  let blueprint;
  const bpSlots = bp.full && bp.full.slots[0].module ? null : Object.entries(bp).map(([k, b]) => ({ id: k, title: b.title, n: b.questions, min: b.minutes, slots: b.slots }));
  if (bp.full && bp.full.slots[0].module) blueprint = Object.fromEntries(Object.entries(bp).map(([k, b]) => [k, { n: b.questions, min: b.minutes, mix: Object.fromEntries(b.slots.map(s => [s.module, s.count])) }]));
  else {
    modules.forEach(mo => { mix[mo.n] = mo.examQuestions || Math.round(40 * topics.filter(t => t.m === mo.n).length / topics.length); });
    const qmix = {}; let left = 10; modules.forEach((mo, i) => { const v = i === modules.length - 1 ? left : Math.max(1, Math.round(10 * mix[mo.n] / 40)); qmix[mo.n] = Math.min(v, left); left -= qmix[mo.n]; });
    blueprint = { full: { n: Object.values(mix).reduce((a, b) => a + b, 0), min: (Object.values(bp)[0] || {}).minutes || 60, mix }, quick: { n: 10, min: 15, mix: qmix } };
  }
  const variants = (m.variants || []).map(v => [v.id, v.label]);
  return { id: m.id, name: m.title, short: m.short || m.title, tag: m.tag, blurb: m.blurb, accent: (m.theme || {}).accent || '#1D3C9E', label: (m.labels || {}).module || 'Module',
    modules, topics, lessons, questions, cheats: p.cheatsheets, labs, demos,
    extensions: (m.extensions || []).map(x => x.id || x), bpSlots,
    fixedTests: Object.entries(p.fixedMocks || {}).map(([id, f]) => ({ id: 'fx-' + id, title: f.title, qids: f.questions.map(q => m.id + ':' + q), min: (p.blueprints[f.blueprint] || {}).minutes || 60, main: true })), labKind: lab === 'labs-api' ? 'api' : lab === 'labs-web' ? 'pw' : lab === 'labs-sql' ? 'sql' : null, interview: (p.interview || []).map(c => Object.assign({}, c, { module: Number(String(c.topic || c.module || '').split('.')[0]) || c.module })), tipLabel: (m.labels || {}).watchOut || null,
    variants: variants.length ? variants : null, version: m.version, legacy: m.legacy || [], blueprint,
    refLabel: lab === 'labs-api' ? 'API reference' : lab === 'labs-web' ? 'Practice sites' : null,
    refTitle: lab === 'labs-api' ? 'Pocket API reference' : 'Practice sites', refEyebrow: lab === 'labs-api' ? 'Practice API' : 'Built-in websites',
    playground: pg ? (lab === 'labs-web' ? { id: 'playground', title: 'Playground', site: 'https://play.test/', topic: null, brief: pg.brief, tasks: pg.tasks, starter: (pg.payload || {}).starter, solution: null, hints: [], checks: [] } : null) : null };
}
const ORDER = ['ctfl', 'api', 'pw', 'sql'];
{ const best = {}; const ver = v => String(v || '0').split('.').map(Number).reduce((a, n) => a * 1000 + (n || 0), 0);
  LP.packages.forEach(p => { const id = p.manifest.id; if (!best[id] || ver(p.manifest.version) > ver(best[id].manifest.version)) best[id] = p; });
  LP.packages = Object.values(best); }   /* same path loaded twice (built in + courses folder): keep the newest version */
LP.packages.slice().sort((a, b) => (ORDER.indexOf(a.manifest.id) + 99) % 99 - (ORDER.indexOf(b.manifest.id) + 99) % 99)
  .forEach(p => { const c = fromPackage(p); if (c) { if (c.labKind === 'pw') c.labs.forEach(l => l.checks.unshift(['Makes at least one assertion', r => r.asserts.length > 0])); addCourse(c); } });

/* ---------------------------------------------------------------- state (one store, keyed by course) */
const blankCourse = () => ({ topics: {}, labs: {}, play: null, mocks: [], weak: {}, seen: {}, adds: {}, session: null, sprint: null, sprints: [], mockSel: { test: 'full', mode: 'exam', enforce: true, module: 1 }, lang: 'js' });
const blank = () => ({ v: 2, theme: 'auto', course: COURSES[0].id, nb: [], c: {}, updatedAt: 0 });
let S = blank();
const K = () => CB[S.course] || COURSES[0];
function D(cid) { const id = cid || K().id; const d = S.c[id] || (S.c[id] = blankCourse()); if (!d.mockSel) d.mockSel = blankCourse().mockSel; if (!d.sprints) d.sprints = []; { const cv = (CB[id] || {}).variants; if (cv && !cv.some(v => v[0] === d.lang)) d.lang = cv[0][0]; else if (!d.lang) d.lang = 'js'; } return d; }

/* Older single-course stores use bare question ids; the unified store prefixes them with the course id. */
function prefixIds(cd, cid) {
  const P = id => (id && String(id).indexOf(':') < 0) ? cid + ':' + id : id;
  const remap = o => { const r = {}; Object.keys(o || {}).forEach(k => r[P(k)] = o[k]); return r; };
  Object.keys(cd.topics || {}).forEach(c => { const t = cd.topics[c]; (t.answers || []).forEach(a => a.q = P(a.q)); if (t.chain && t.chain.items) t.chain.items.forEach(x => x.q = P(x.q)); if (t.active) t.active = null; });
  (cd.mocks || []).forEach(m => { m.qs = (m.qs || []).map(P); m.answers = remap(m.answers); });
  cd.weak = remap(cd.weak); cd.seen = remap(cd.seen);
  if (cd.session) { const s = cd.session; s.qs = (s.qs || []).map(P); s.answers = remap(s.answers); s.flags = remap(s.flags); s.revealed = remap(s.revealed); }
  return cd;
}
function fromLegacy(o, cid, into) {
  const st = into || blank();
  const cd = prefixIds(Object.assign(blankCourse(), JSON.parse(JSON.stringify(o))), cid);
  ['theme', 'course', 'nb', 'c', 'updatedAt', 'v', 'mockMode'].forEach(k => delete cd[k]);
  if (o.sprint && !o.sprint.end) cd.sprint = null;
  st.c[cid] = Object.assign(blankCourse(), cd);
  (o.nb || []).forEach(n => { if (!st.nb.some(x => x.id === n.id)) st.nb.push(Object.assign({}, n, { course: cid, qid: n.qid ? (n.qid.indexOf(':') < 0 ? cid + ':' + n.qid : n.qid) : n.qid })); });
  Object.keys(o.topics || {}).forEach(code => { const t = o.topics[code]; if (t.notes && t.notes.trim() && !t.notesMigrated) st.nb.push({ id: 'n' + cid + code + Date.now(), course: cid, code, kind: 'note', text: t.notes.trim(), onSheet: false, t: Date.now() }); });
  if (o.theme && !into) st.theme = o.theme;
  st.updatedAt = Math.max(st.updatedAt || 0, o.updatedAt || 0);
  return st;
}
function detect(o) { if (o && o.v === 2 && o.c) return 'hub'; if (o && (o.lang || (o.labs && Object.values(o.labs).some(l => l && l.code)))) return 'pw'; if (o && o.topics) return 'api'; return null; }
function load(raw, into) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw; const kind = detect(o);
  if (kind === 'hub') { const st = Object.assign(blank(), o); st.nb = st.nb || []; st.nb.forEach(n => { if (!n.course) n.course = 'api'; }); if (!CB[st.course]) st.course = COURSES[0].id; return st; }
  if (kind) return fromLegacy(o, kind, into);
  throw new Error('Unknown format');
}
try {
  const raw = localStorage.getItem(KEY) || localStorage.getItem('learnpaths-v1');
  if (raw) S = load(raw);
  else {
    const a = localStorage.getItem('pmpath-v1'), p = localStorage.getItem('pwpath-v1');
    if (a) S = load(a); if (p) S = load(p, S === null ? undefined : S);
  }
} catch (e) { S = blank(); }
let saveT = null, cloud = null, cloudT = null;
function save(now) {
  S.updatedAt = Date.now(); clearTimeout(saveT);
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} pushCloud(); };
  if (now) w(); else saveT = setTimeout(w, 250);
}
function pushCloud() { if (!cloud) return; clearTimeout(cloudT); cloudT = setTimeout(() => { cloud.set({ json: JSON.stringify(S), updatedAt: S.updatedAt }).catch(() => {}); }, 2500); }
async function initCloud() {
  try {
    if (!G.claude || !G.claude.use) return;
    const [db, user] = await Promise.all([G.claude.use('db'), G.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id(); if (!id) return;
    const ref = db.doc('data/users/' + id + '/progress');
    const snap = await ref.get();
    if (snap.exists) { const d = snap.data(); if (d && d.updatedAt > (S.updatedAt || 0) && d.json) { try { S = load(d.json); localStorage.setItem(KEY, JSON.stringify(S)); if (!D().session || location.hash !== '#/exam') render(); } catch (e) {} } }
    cloud = ref;
    document.querySelectorAll('.sync').forEach(el => el.hidden = false);
    if (!snap.exists || (snap.data() || {}).updatedAt < S.updatedAt) pushCloud();
  } catch (e) {}
}
const tp = code => D().topics[code] || (D().topics[code] = { understood: false, passed: false, answers: [], chain: null });
const lb = id => D().labs[id] || (D().labs[id] = { solved: false, attempts: 0 });
const nbHere = () => S.nb.filter(n => (n.course || 'api') === K().id);

/* ---------------------------------------------------------------- metrics (§3.3) */
const passedN = () => K().topics.filter(t => { const x = D().topics[t.code] || {}; return x.passed || x.testedOut; }).length;
function coverage() { return Math.round(100 * passedN() / K().topics.length); }
function readiness() { const r = D().mocks.filter(m => m.mode === 'exam' && (m.kind === 'full' || m.kind === 'quick' || /^fx:/.test(String(m.kind)))).slice(-3); return weightedReadiness(r); }
function verdict(r) { return r === null ? { t: 'No exam-mode result yet', c: 'none' } : r >= 75 ? { t: 'Ready', c: 'strong' } : r >= 65 ? { t: 'Borderline', c: 'avg' } : { t: 'Not ready', c: 'weak' }; }
function labsSolved() { return K().labs.filter(l => (D().labs[l.id] || {}).solved).length; }
function status(code) {
  const a = ((D().topics[code] || {}).answers || []);
  if (a.length < 3) return { key: 'none', label: 'Not started', p: null };
  const last = a.slice(-6); let w = 0, s = 0; last.forEach((x, i) => { w += i + 1; s += (i + 1) * (x.ok ? 1 : 0); });
  const p = Math.round(100 * s / w);
  return p >= 95 ? { key: 'strong', label: 'Strong', p } : p >= 85 ? { key: 'good', label: 'Good', p } : p >= 70 ? { key: 'avg', label: 'Average', p } : { key: 'weak', label: 'Weak', p };
}
const chip = (key, text) => '<span class="chip chip-' + key + '">' + esc(text) + '</span>';
function record(qid, ok) { const q = QBY[qid]; const t = tp(q.code); t.answers.push({ q: qid, ok, t: Date.now() }); if (t.answers.length > 40) t.answers = t.answers.slice(-40); D().seen[qid] = Date.now(); }
function pickQ(code, exclude, preferBank) {
  let pool = K().questions.filter(q => q.code === code && exclude.indexOf(q.id) < 0);
  if (preferBank) { const b = pool.filter(q => q.kind === 'bank'); if (b.length) pool = b; }
  if (!pool.length) return null;
  const rt = id => (D().retired || []).indexOf(id) >= 0 ? 1 : 0;
  pool.sort((a, b) => (rt(a.id) - rt(b.id)) || ((D().seen[a.id] || 0) - (D().seen[b.id] || 0)) || (Math.random() - 0.5));
  return pool[0].id;
}

/* ---------------------------------------------------------------- markdown */
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function md(src) {
  const L = String(src).split('\n'); let h = '', i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const lang = l.slice(3).trim() || 'text'; const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; h += '<pre class="code-view"><span class="lang">' + esc(lang) + '</span>' + hl(buf.join('\n'), lang) + '</pre>'; continue; }
    if (/^###\s/.test(l)) { h += '<h3>' + inline(l.slice(4)) + '</h3>'; i++; continue; }
    if (/^\|/.test(l)) { const rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]); const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()); h += '<div class="tw"><table><thead><tr>' + cells(rows[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(2).map(r => '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'; continue; }
    if (/^\s*[-*]\s/.test(l)) { h += '<ul>'; while (i < L.length && /^\s*[-*]\s/.test(L[i])) h += '<li>' + inline(L[i++].replace(/^\s*[-*]\s/, '')) + '</li>'; h += '</ul>'; continue; }
    if (/^\d+\.\s/.test(l)) { h += '<ol>'; while (i < L.length && /^\d+\.\s/.test(L[i])) h += '<li>' + inline(L[i++].replace(/^\d+\.\s/, '')) + '</li>'; h += '</ol>'; continue; }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < L.length && L[i].trim() && !/^(```|###|\||\s*[-*]\s|\d+\.\s)/.test(L[i])) buf.push(L[i++]);
    h += '<p>' + inline(buf.join(' ')) + '</p>';
  }
  return h;
}

/* ---------------------------------------------------------------- shell (§7) */
const $ = s => document.querySelector(s);
const app = () => $('#app');
function applyTheme() { const t = S.theme; document.documentElement.setAttribute('data-theme', t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t); }
function nextTopic() { const t = K().topics.find(t => !(D().topics[t.code] || {}).passed); return t ? t.code : K().topics[0].code; }
const ICON = {
  learn: '<path d="M4 4.5h10a3 3 0 0 1 3 3V20H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h10"/><path d="M17 7.5h3V20h-3"/>',
  labs: '<path d="M9 3h6"/><path d="M10 3v6.5L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9.5V3"/><path d="M7.5 15h9"/>',
  mocks: '<path d="M9 3.5h6v3H9z"/><path d="M8 5H6v16h12V5h-2"/><path d="M9 13.5l2 2 4-4"/>',
  progress: '<path d="M4 20h16"/><path d="M7 16v-4"/><path d="M12 16V7"/><path d="M17 16v-7"/>'
};
const svg = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>';
function metricHtml(ctx) {
  if (ctx === 'exam') { const r = readiness(); return '<a class="metric" href="#/mocks" title="Your last three exam-mode mock results, newest weighted most (3 · 2 · 1)">Exam readiness <b>' + (r === null ? '—' : r + '%') + '</b><span class="bar"><i style="width:' + (r || 0) + '%"></i></span></a>'; }
  if (ctx === 'labs') { const n = labsSolved(); return '<a class="metric" href="#/labs" title="Labs solved with every check passing">Labs solved <b>' + n + ' / ' + K().labs.length + '</b><span class="bar cov"><i style="width:' + Math.round(100 * n / K().labs.length) + '%"></i></span></a>'; }
  if (ctx === 'learn') { const c = coverage(); return '<a class="metric" href="#/progress" title="Topics passed in Check yourself">Syllabus coverage <b>' + c + '%</b><span class="bar cov"><i style="width:' + c + '%"></i></span></a>'; }
  return '';
}
function shell(active, ctx, body, opts) {
  opts = opts || {};
  document.body.classList.remove('exam-on');
  const tabs = opts.home ? [] : [['learn', 'Learn', learnHref()], ['labs', 'Hands-on', '#/labs'], ['cheats', 'Cheat sheets', '#/cheats/' + K().modules[0].n], ['mocks', 'Mock tests', '#/mocks'], ['progress', 'My progress', '#/progress']].filter(t => t[0] !== 'labs' || K().labs.length);
  if ((K().interview || []).length && !opts.home) tabs.splice(tabs.findIndex(t => t[0] === 'cheats'), 0, ['cards', 'Interview cards', '#/cards']);
  const bar = [['learn', 'Learn', learnHref()], ['labs', 'Hands-on', '#/labs'], ['mocks', 'Mocks', '#/mocks'], ['progress', 'Progress', '#/progress']].filter(t => t[0] !== 'labs' || K().labs.length);
  app().innerHTML = '<header class="hdr"><button class="burger m-only" data-act="drawer" aria-label="Open menu">☰</button>' + '<a class="brand" href="#/" title="Home"><span class="logo">QA</span><span class="wordmark">' + esc(APP_NAME) + '</span></a>' + (opts.home ? '' : '<div class="switch"><button class="crs pathsw" id="crs" aria-haspopup="menu" aria-expanded="false" aria-controls="crsmenu" title="Switch learning path"><span class="pdot"></span><b>' + esc(K().short) + '</b><span class="chev">▾</span></button></div>') +
    '<nav class="nav d-only" aria-label="Main">' + tabs.map(t => '<a href="' + t[2] + '" class="' + (active === t[0] ? 'on' : '') + '"' + (active === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</a>').join('') + '</nav><span class="spacer"></span>' +
    metricHtml(ctx) + '<span class="sync" hidden title="Progress is saved to your account">Synced</span>' + (K().refLabel && !opts.home ? '<a class="hlink api d-only" href="#/ref">' + esc(K().refLabel) + '</a>' : '') + '<a class="hlink d-only" href="#/data">Data</a></header>' +
    (D().sprint && !opts.noSprintBar ? sprintBar() : '') +
    '<main id="main" class="' + (frameOn(active, opts) ? 'full' : (opts.cls || '')) + '" tabindex="-1">' + (frameOn(active, opts) ? frameWrap(body, opts) : body) + '</main>' +
    '<nav class="tabbar" aria-label="Main">' + bar.map(t => '<a href="' + t[2] + '" class="' + (active === t[0] ? 'on' : '') + '">' + svg(t[0]) + '<span>' + t[1] + '</span></a>').join('') + '</nav>';
  if (cloud) document.querySelectorAll('.sync').forEach(el => el.hidden = false);
  app().querySelector('[data-act="drawer"]').onclick = openDrawer;
  bindSwitcher(app().querySelector('#crs'));
  document.title = (opts.home ? '' : K().short + ' — ') + APP_NAME;
}
/* Course switcher: the wordmark looks like a plain title; a click opens the course menu. */
function courseMenuHtml() {
  return '<div class="crsmenu" id="crsmenu" role="menu" aria-label="Courses"><div class="label">Switch learning path</div><a class="crsitem home" href="#/">All learning paths</a>' + COURSES.map(c => { const d = D(c.id); const n = c.topics.filter(t => (d.topics[t.code] || {}).passed).length; const on = c.id === K().id;
    return '<button role="menuitemradio" aria-checked="' + on + '" class="crsitem' + (on ? ' on' : '') + '" data-course="' + c.id + '" style="--acc:' + c.accent + '"><span class="ci-t"><span class="pdot"></span><b>' + esc(c.name) + '</b><span class="muted">' + esc(c.tag) + '</span></span><span class="ci-d">' + esc(c.blurb) + '</span><span class="ci-m mono">' + n + ' / ' + c.topics.length + ' topics · ' + c.labs.length + ' labs</span>' + (on ? '<span class="ci-ck" aria-hidden="true">✓</span>' : '') + '</button>'; }).join('') + '</div>';
}
function switchCourse(id) {
  if (!CB[id] || id === K().id) return;
  S.course = id; save();
  const r = (location.hash.slice(2).split('/')[0]) || 'learn';
  const keep = { mocks: '#/mocks', progress: '#/progress', data: '#/data', labs: '#/labs', ref: '#/ref', sprint: '#/sprint' };
  if (!K().labs.length) { delete keep.labs; delete keep.sprint; } if (!K().refLabel) delete keep.ref;
  const target = r === 'cheats' ? '#/cheats/' + K().modules[0].n : keep[r] || learnHref();
  if (location.hash === target) render(); else location.hash = target;
}
function bindSwitcher(btn) {
  if (!btn) return;
  const wrap = btn.parentNode;
  const close = (focus) => { const m = wrap.querySelector('.crsmenu'); if (m) m.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', keys, true); if (focus) btn.focus(); };
  const outside = e => { if (!wrap.contains(e.target)) close(false); };
  const keys = e => {
    const items = Array.from(wrap.querySelectorAll('.crsitem')); const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (e.key === 'Tab') close(false);
  };
  btn.onclick = () => {
    if (wrap.querySelector('.crsmenu')) return close(true);
    wrap.insertAdjacentHTML('beforeend', courseMenuHtml()); btn.setAttribute('aria-expanded', 'true');
    const on = wrap.querySelector('.crsitem.on') || wrap.querySelector('.crsitem'); if (on) on.focus();
    wrap.querySelectorAll('.crsitem').forEach(b => b.onclick = () => { const id = b.getAttribute('data-course'); close(false); switchCourse(id); });
    document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', keys, true);
  };
}
function sprintBar() { const left = Math.max(0, D().sprint.end - Date.now()); return '<div class="sprintbar"><span>Lab sprint · ' + D().sprint.done.length + ' / 3 solved</span><span class="clock" data-clock="sprint">' + clock(left) + '</span><a href="#/sprint">Open sprint</a></div>'; }
function clock(ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function overlay(html, cls, onClose) {
  const wrap = document.createElement('div'); wrap.innerHTML = '<div class="scrim"></div>' + html; wrap.className = 'ov ' + (cls || '');
  document.body.appendChild(wrap);
  const prev = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key); if (prev && prev.focus) prev.focus(); onClose && onClose(); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  wrap.querySelector('.scrim').onclick = close;
  wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const f = wrap.querySelector('[data-close]'); if (f) f.focus();
  return { el: wrap, close };
}
function openDrawer() {
  const cur = (location.hash.match(/\/learn\/([^/]+)$/) || [])[1];
  const o = overlay('<aside class="drawer" role="dialog" aria-modal="true" aria-label="Menu"><div class="drawer-h"><span class="wordmark">' + esc(K().name) + '</span><button class="btn sm" data-close>Close</button></div><div class="drawer-b"><div class="label">Learning path</div><div class="pills" style="margin:6px 0 14px">' + COURSES.map(c => '<button class="pill' + (c.id === K().id ? ' on' : '') + '" data-dcourse="' + c.id + '" aria-pressed="' + (c.id === K().id) + '">' + esc(c.name) + '</button>').join('') + '</div>' + syllabus(cur) + '</div><div class="drawer-f"><a href="#/">Home</a><a href="#/cheats/' + K().modules[0].n + '">Cheat sheets</a>' + (K().refLabel ? '<a href="#/ref">' + esc(K().refLabel) + '</a>' : '') + '<a href="#/data">Data</a></div></aside>');
  o.el.querySelectorAll('a').forEach(a => a.addEventListener('click', () => o.close())); syncSyllabus(o.el);
  o.el.querySelectorAll('[data-dcourse]').forEach(b => b.onclick = () => { o.close(); switchCourse(b.getAttribute('data-dcourse')); });
}
function syllabus(cur) {
  let h = '<nav class="syl" aria-label="Syllabus">';
  K().modules.forEach(m => {
    const ts = K().topics.filter(t => t.m === m.n); const done = ts.filter(t => (D().topics[t.code] || {}).passed).length; const min = ts.reduce((a, t) => a + t.min, 0);
    h += '<div class="mod"><div class="ch"><span>' + m.n + ' · ' + esc(m.title) + '</span><small>' + Math.round(100 * done / ts.length) + '%</small></div><div class="chm">' + m.level + ' · ' + min + ' min</div><ul>';
    let psec = null; ts.forEach(t => { if (t.sec && t.sec !== psec) { psec = t.sec; h += '<li class="sec">' + esc(t.sec) + '</li>'; } const st = status(t.code); const l = K().labFor(t.code); const passed = (D().topics[t.code] || {}).passed;
      h += '<li><a href="#/learn/' + t.code + '" class="' + (cur === t.code ? 'on' : '') + '"' + (cur === t.code ? ' aria-current="page"' : '') + '><span class="tc">' + t.code + '</span><span>' + esc(t.title) + '</span><span class="st">' + (l ? '<span class="lab' + ((D().labs[l.id] || {}).solved ? ' done' : '') + '" title="Lab ' + ((D().labs[l.id] || {}).solved ? 'solved' : 'available') + '">' + ((D().labs[l.id] || {}).solved ? 'lab ✓' : 'lab') + '</span>' : '') + (st.key !== 'none' ? chip(st.key, st.label) : passed ? chip('strong', 'Passed') : (D().topics[t.code] || {}).testedOut ? '<span class="chip chip-out">Tested out</span>' : '') + '</span></a></li>'; });
    h += '</ul></div>';
  });
  return h + '</nav>';
}

/* ---------------------------------------------------------------- questions (§8 options + rationale) */
function questionHtml(q, pick, reveal, name) {
  if (q.fmt === 'query') return sqlQHtml(q, pick, reveal, name);
  let h = '<div class="q">' + stemHtml(q.q) + '</div><!--/q--><p class="selhint">' + (q.multi ? 'Select TWO options.' : 'Select ONE option.') + '</p><div class="opts" role="' + (q.multi ? 'group' : 'radiogroup') + '" aria-label="Options">';
  q.o.forEach((o, i) => {
    const cls = reveal ? (isA(q, i) ? ' right locked' : isP(pick, i) ? ' wrong locked' : ' locked') : (isP(pick, i) ? ' sel' : '');
    const tag = reveal ? (isA(q, i) ? '<span class="otag">' + (isP(pick, i) ? 'Correct · Your answer' : 'Correct') + '</span>' : isP(pick, i) ? '<span class="otag">Your answer</span>' : '<span></span>') : '<span></span>';
    h += '<label class="opt' + cls + '"><input type="' + (q.multi ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + i + '" data-pick="' + i + '"' + (isP(pick, i) ? ' checked' : '') + (reveal ? ' disabled' : '') + '><span class="ol">' + L4[i] + ')</span><span>' + inline(o) + '</span>' + tag + '</label>';
  });
  return h + '</div>';
}
function rationaleHtml(q, pick) {
  if (q.fmt === 'query') return sqlQRationale(q, pick);
  const ok = pick === q.a;
  return '<div class="rationale" aria-live="polite"><div class="rh">' + (ok ? '<span class="ok">Correct</span>' : '<span class="bad">Incorrect — answer: ' + ansL(q) + '</span>') + '<span class="mono">' + q.code + '</span></div><ul>' +
    q.o.map((o, i) => '<li class="' + (isA(q, i) ? 'is' : '') + '"><b>' + L4[i] + ')</b> ' + inline(q.r[i] || (isA(q, i) ? 'This is the right answer.' : '')) + '</li>').join('') + '</ul></div>';
}
function mistakeText(q) { if (q.fmt === 'query') return stemLine(q.q) + ' — Model answer: ' + q.sol; return q.q + ' — Answer: ' + ansL(q) + ') ' + ansText(q); }
function saveMistake(q) { if (S.nb.some(n => n.kind === 'mistake' && n.qid === q.id)) return false; S.nb.push({ id: 'n' + Date.now(), course: K().id, code: q.code, kind: 'mistake', qid: q.id, text: mistakeText(q), onSheet: false, t: Date.now() }); save(); return true; }

/* ================================================================ LEARN */
const nbUi = { scope: 'topic', kind: 'all' };
function pageLearn(code) {
  const t = K().TOP[code] || K().topics[0]; code = t.code; const Ls = K().lessons[code]; const st = tp(code); const lab = K().labFor(code);
  const idx = K().topics.indexOf(t); const prev = K().topics[idx - 1], next = K().topics[idx + 1];
  const mod = K().modules[t.m - 1]; const stt = status(code);
  const checking = !!st.chain;
  let h = '<div class="learn3"><aside class="colside syl-col" aria-label="Syllabus">' + syllabus(code) + '</aside><div class="lesson-col">';
  const loPlain = String(t.lo || '').replace(/^FL-[\d.]+:\s*/, '').trim(); const loSame = !loPlain || loPlain.toLowerCase() === t.title.trim().toLowerCase();
  h += '<div class="head lh"><div class="lh-top"><div class="lh-ctx"><span class="label">' + esc(K().label) + ' ' + t.m + ' · ' + esc(mod.title) + '</span></div>' +
    '<div class="lh-meta"><span class="badge mono">' + t.code + (t.k && t.k !== 'Understand' ? ' · ' + t.k : '') + '</span>' + (t.loCode ? '<span class="badge mono">' + esc(t.loCode) + '</span>' : '') + '<span class="badge">' + t.min + ' min</span>' + (st.passed ? chip('strong', 'Passed') : '') + (stt.key !== 'none' ? chip(stt.key, stt.label) : '') + planChip(code) + refLinks(t) + '</div></div>' +
    '<h1>' + esc(t.title) + '</h1>' + (loSame ? '' : '<p class="lo">' + esc(loPlain) + '</p>') + '</div>';
  if (checking) h += '<button class="lessonbar" data-act="showlesson" aria-expanded="false" aria-controls="lesson"><span>Lesson understood · ' + esc(t.title) + '</span><span>Show lesson</span></button>';
  h += '<article class="lesson card' + (checking ? ' collapsed' : '') + '" id="lesson">' + lessonBody(code) + '</article>';
  h += '<section class="card" id="check" aria-label="Check yourself">' + checkHtml(code) + '</section>';
  if (lab) { const ls = D().labs[lab.id] || {}; h += '<a class="labcard" href="#/lab/' + lab.id + '"><span class="label">Lab · ' + (ls.solved ? 'Solved' : ls.attempts ? 'Attempted' : 'New') + '</span><b>' + esc(lab.title) + '</b><span class="lb">' + inline(lab.brief) + '</span><span class="go">Open the lab</span></a>'; }
  h += '<div class="pn">' + (prev ? '<a href="#/learn/' + prev.code + '">‹ ' + prev.code + ' ' + esc(prev.title) + '</a>' : '<span></span>') + (next ? '<a href="#/learn/' + next.code + '">' + next.code + ' ' + esc(next.title) + ' ›</a>' : '') + '</div></div>';
  h += '<aside class="colside nb-col" aria-label="Notebook" id="nbcol">' + nbHtml(code) + '</aside></div><button class="nb-fab" data-act="nbsheet">Notebook</button>';
  shell('learn', 'learn', h, { cls: 'full' });
  bindCheck(code); mountDemo(code); syncSyllabus(); bindNb(app().querySelector('#nbcol'), code); applyHighlights(code); bindHighlighter(code);
  $('#lesson').addEventListener('click', e => { const b = e.target.closest('[data-variant]'); if (!b) return; D().lang = b.getAttribute('data-variant'); save(); $('#lesson').innerHTML = lessonBody(code); applyHighlights(code); const nb2 = $('#lesson [data-variant="' + D().lang + '"]'); if (nb2) nb2.focus(); });
  const sb = app().querySelector('[data-act="showlesson"]'); if (sb) sb.onclick = () => { const l = $('#lesson'); const c = l.classList.toggle('collapsed'); sb.setAttribute('aria-expanded', String(!c)); sb.lastChild.textContent = c ? 'Show lesson' : 'Hide lesson'; };
  app().querySelector('[data-act="nbsheet"]').onclick = () => openNbSheet(code);
}

function lessonBody(code) {
  const Ls = K().lessons[code]; const v = K().variants; let h = md(Ls.md);
  if (Ls.ex && v) { const lang = D().lang; h += '<div class="exhead"><h3>Example</h3><span class="pills" role="group" aria-label="Example language">' + v.map(x => '<button class="pill' + (lang === x[0] ? ' on' : '') + '" data-variant="' + x[0] + '" aria-pressed="' + (lang === x[0]) + '">' + x[1] + '</button>').join('') + '</span></div><pre class="code-view"><span class="lang">' + ((v.find(x => x[0] === lang) || [0, lang === 'py' ? 'Python' : 'JavaScript'])[1]) + '</span>' + hl(Ls.ex[lang] || Ls.ex.sql || Ls.ex.default || Object.values(Ls.ex)[0] || '', Ls.ex[lang] ? lang : 'sql') + '</pre>'; }
  if (K().demos && K().demos[code]) h += '<div class="demo-slot" data-demo="' + esc(code) + '"></div>';
  if (Ls.tip) h += '<aside class="trick"><div class="label">' + (K().tipLabel || (K().id === 'ctfl' ? 'Exam trick' : 'Watch out')) + '</div>' + md(Ls.tip) + '</aside>';
  h += interviewCorner(code);
  return h;
}
/* --- Check yourself carousel */
function checkHtml(code) {
  const st = tp(code);
  if (!st.chain) {
    if (st.passed) return '<h2>Check yourself</h2><p class="passed">Topic passed.</p><div class="row"><button class="btn" data-act="more">Give me more practice</button><button class="link" data-act="retake">Retake check</button></div>';
    return '<h2>Check yourself</h2><p class="note" style="margin:0">Three questions on this topic. A wrong answer adds a new question on the same concept; the topic passes when every question is answered correctly.</p><div class="row m-sticky"><button class="btn primary lg" data-act="understood">Understood — check yourself</button></div>';
  }
  const ch = st.chain;
  const cur = ch.view != null ? ch.view : ch.last != null ? ch.last : ch.items.findIndex(x => x.pick == null);
  if (cur < 0) {
    const ok = passedChain(ch);
    return '<h2>Check yourself</h2>' + dashes(ch, -1) + (ok ? '<p class="passed">All questions correct — topic passed.</p><div class="row"><button class="btn" data-act="more">Give me more practice</button><button class="link" data-act="retake">Retake check</button><button class="link" data-act="close">Show the lesson</button></div>' : '');
  }
  const x = ch.items[cur]; const q = QBY[x.q]; const answered = x.pick != null;
  let h = '<h2>Check yourself</h2>' + dashes(ch, cur) + '<p class="qn">Question ' + (cur + 1) + ' / ' + ch.items.length + (x.rep ? ' · replacement' : '') + '</p>' + questionHtml(q, answered ? x.pick : ch.pick, answered, 'cy-' + code);
  if (answered) {
    const ok = x.pick === q.a;
    h += rationaleHtml(q, x.pick);
    if (!ok && ch.view == null) h += '<p class="fbline bad">Wrong — a replacement question on the same concept was added.</p>';
    if (!ok) h += '<div class="row"><button class="link" data-act="mistake" data-q="' + q.id + '">' + (S.nb.some(n => n.qid === q.id && n.kind === 'mistake') ? 'Saved as mistake' : 'Save as mistake') + '</button></div>';
  }
  if (!answered) h += '<div class="row m-sticky"><button class="btn primary" data-act="checkans"' + (ch.pick == null ? ' disabled' : '') + '>Check answer</button></div>';
  else if (ch.view != null) h += '<div class="row"><button class="btn" data-act="resume">Back to the current question</button></div>';
  else h += '<div class="row m-sticky"><button class="btn primary" data-act="nextq">' + (ch.items.every(y => y.pick != null) ? 'Finish' : 'Next question') + '</button></div>';
  return h;
}
function passedChain(ch) { const last = {}; ch.items.forEach(x => last[x.slot] = x); return Object.keys(last).every(k => last[k].pick === QBY[last[k].q].a); }
function dashes(ch, cur) { return '<div class="dashes" role="list" aria-label="Questions">' + ch.items.map((x, i) => '<button role="listitem" class="dash' + (i === cur ? ' cur' : '') + (x.pick == null ? '' : x.pick === QBY[x.q].a ? ' ok' : ' no') + '" data-dash="' + i + '"' + (x.pick == null ? ' disabled' : '') + ' aria-label="Question ' + (i + 1) + (x.pick == null ? '' : x.pick === QBY[x.q].a ? ', correct' : ', wrong') + '"></button>').join('') + '</div>'; }
function bindCheck(code) {
  const box = $('#check'); const st = tp(code);
  const redraw = () => { box.innerHTML = checkHtml(code); };
  box.onchange = e => { const r = e.target.closest('input[data-pick]'); if (!r || !st.chain) return; const cq = QBY[st.chain.items[st.chain.items.findIndex(x => x.pick == null)].q]; st.chain.pick = pickFrom(box, cq, r); redraw(); const n = box.querySelector('input[data-pick="' + r.value + '"]'); if (n) n.focus(); };
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.getAttribute('data-act');
    if (act === 'understood' || act === 'retake') { st.understood = true; const ids = K().questions.filter(q => q.code === code && q.kind === 'check').map(q => q.id); st.chain = { items: ids.map((id, i) => ({ q: id, slot: i, pick: null })), pick: null, view: null, last: null }; save(); return pageLearn(code); }
    if (act === 'more') return startSession({ kind: 'topic', code, mode: 'practice', title: 'Practice · ' + code + ' ' + K().TOP[code].title });
    if (act === 'close') { st.chain = null; save(); return pageLearn(code); }
    if (act === 'mistake') { saveMistake(QBY[b.getAttribute('data-q')]); b.textContent = 'Saved as mistake'; refreshNb(code); return; }
    const ch = st.chain; if (!ch) return;
    if (b.hasAttribute('data-dash')) { ch.view = Number(b.getAttribute('data-dash')); return redraw(); }
    if (act === 'resume') { ch.view = null; return redraw(); }
    if (act === 'checkans') {
      const cur = ch.items.findIndex(x => x.pick == null); const x = ch.items[cur]; x.pick = ch.pick; ch.pick = null;
      const ok = x.pick === QBY[x.q].a; record(x.q, ok);
      if (!ok) { const used = ch.items.map(y => y.q); const rep = pickQ(code, used, true) || K().questions.filter(q => q.code === code && q.id !== x.q).sort((a, c) => (D().seen[a.id] || 0) - (D().seen[c.id] || 0))[0].id; ch.items.push({ q: rep, slot: x.slot, pick: null, rep: true }); D().weak[x.q] = 0; }
      if (ch.items.every(y => y.pick != null) && passedChain(ch)) st.passed = true;
      ch.last = cur; ch.view = null; save(); return redraw();
    }
    if (act === 'nextq') { ch.view = null; ch.last = null; if (ch.items.every(y => y.pick != null)) { save(); return pageLearn(code); } redraw(); if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' }); return; }
  };
}

/* --- Notebook (§8) */
function nbItems(code) {
  return nbHere().filter(n => (nbUi.scope === 'all' || n.code === code) && (nbUi.kind === 'all' || n.kind === nbUi.kind)).sort((a, b) => b.t - a.t);
}
function nbHtml(code) {
  const items = nbItems(code);
  const kinds = [['all', 'All'], ['note', 'Notes'], ['highlight', 'Highlights'], ['mistake', 'Mistakes']];
  return '<div class="nb"><div class="row" style="justify-content:space-between"><h2>Notebook</h2><span class="label">' + (nbUi.scope === 'all' ? 'All topics' : code) + '</span></div>' +
    '<label class="sr" for="nbtext">New note</label><textarea id="nbtext" rows="3" placeholder="Write the idea in your own words."></textarea><div class="row"><button class="btn sm" data-nb="add">Save note</button><span class="note" style="margin:0">Select lesson text to highlight it.</span></div>' +
    '<div class="pills" role="group" aria-label="Filter">' + kinds.map(k => '<button class="pill' + (nbUi.kind === k[0] ? ' on' : '') + '" data-nbkind="' + k[0] + '" aria-pressed="' + (nbUi.kind === k[0]) + '">' + k[1] + '</button>').join('') + '<button class="pill' + (nbUi.scope === 'all' ? ' on' : '') + '" data-nbscope aria-pressed="' + (nbUi.scope === 'all') + '">All topics</button></div>' +
    (items.length ? '<ul class="nbl">' + items.map(n => '<li class="nbi ' + n.kind + '"><div class="meta"><a href="#/learn/' + n.code + '">' + n.code + ' · ' + n.kind + '</a><span>' + new Date(n.t).toLocaleDateString() + '</span></div><div class="txt">' + esc(n.text) + '</div><div class="acts"><label><input type="checkbox" data-nbsheet="' + n.id + '"' + (n.onSheet ? ' checked' : '') + '> On my cheat sheet</label><button class="link" data-nbdel="' + n.id + '">Remove</button></div></li>').join('') + '</ul>' : '<p class="empty">' + (nbUi.kind === 'all' ? 'Nothing here yet. Notes, highlights and saved mistakes appear here.' : 'No ' + nbUi.kind + 's for this filter.') + '</p>') + '</div>';
}
function bindNb(root, code) {
  if (!root) return;
  root.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.getAttribute('data-nb') === 'add') { const ta = root.querySelector('#nbtext'); const v = ta.value.trim(); if (!v) { ta.focus(); return; } S.nb.push({ id: 'n' + Date.now(), course: K().id, code, kind: 'note', text: v, onSheet: false, t: Date.now() }); save(); }
    else if (b.hasAttribute('data-nbkind')) nbUi.kind = b.getAttribute('data-nbkind');
    else if (b.hasAttribute('data-nbscope')) nbUi.scope = nbUi.scope === 'all' ? 'topic' : 'all';
    else if (b.hasAttribute('data-nbdel')) { const id = b.getAttribute('data-nbdel'); const n = S.nb.find(x => x.id === id); S.nb = S.nb.filter(x => x.id !== id); save(); if (n && n.kind === 'highlight') { refreshNb(code); const l = $('#lesson'); if (l) { l.innerHTML = lessonBody(code); applyHighlights(code); } return; } }
    else return;
    refreshNb(code);
  };
  root.onchange = e => { const c = e.target.closest('[data-nbsheet]'); if (!c) return; const n = S.nb.find(x => x.id === c.getAttribute('data-nbsheet')); if (n) { n.onSheet = c.checked; save(); } };
}
function refreshNb(code) { document.querySelectorAll('[data-nbroot]').forEach(r => { r.innerHTML = nbHtml(code); }); const col = $('#nbcol'); if (col) { col.innerHTML = nbHtml(code); } }
function openNbSheet(code) {
  const o = overlay('<section class="sheet nbs" role="dialog" aria-modal="true" aria-label="Notebook"><div class="grab"></div><div class="sheet-h"><b>Notebook</b><button class="btn sm" data-close>Close</button></div><div class="sheet-b" data-nbroot>' + nbHtml(code) + '</div></section>');
  bindNb(o.el.querySelector('[data-nbroot]'), code);
}
function applyHighlights(code) {
  const root = $('#lesson'); if (!root) return;
  nbHere().filter(n => n.kind === 'highlight' && n.code === code).forEach(n => {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
    while ((node = w.nextNode())) { const i = node.nodeValue.indexOf(n.text); if (i >= 0 && !(node.parentNode.closest && node.parentNode.closest('mark'))) { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + n.text.length); const m = document.createElement('mark'); m.className = 'hl'; try { r.surroundContents(m); } catch (e) {} break; } }
  });
}
let hlBtn = null;
function bindHighlighter(code) {
  const lesson = $('#lesson');
  const hide = () => { if (hlBtn) { hlBtn.remove(); hlBtn = null; } };
  const onSel = () => {
    const s = window.getSelection ? window.getSelection() : null;
    if (!s || s.isCollapsed || !lesson || !document.body.contains(lesson)) return hide();
    const txt = s.toString().replace(/\s+/g, ' ').trim();
    if (txt.length < 3 || !lesson.contains(s.anchorNode) || !lesson.contains(s.focusNode)) return hide();
    let rect; try { rect = s.getRangeAt(0).getBoundingClientRect(); } catch (e) { return hide(); }
    if (!hlBtn) { hlBtn = document.createElement('button'); hlBtn.className = 'hlbtn'; hlBtn.textContent = 'Highlight'; document.body.appendChild(hlBtn);
      hlBtn.addEventListener('mousedown', e => e.preventDefault());
      hlBtn.onclick = () => { const s2 = window.getSelection(); const t2 = s2 ? s2.toString().trim() : ''; if (t2.length >= 3) { S.nb.push({ id: 'n' + Date.now(), course: K().id, code, kind: 'highlight', text: t2.slice(0, 400), onSheet: false, t: Date.now() }); save(); s2.removeAllRanges(); applyHighlights(code); refreshNb(code); } hide(); }; }
    const small = window.innerWidth <= 760;
    hlBtn.style.left = (small ? 14 : Math.max(8, Math.min(window.innerWidth - 110, rect.left + rect.width / 2 - 45))) + 'px';
    hlBtn.style.top = small ? '' : Math.max(70, rect.top - 44) + 'px';
    hlBtn.style.bottom = small ? 'calc(124px + env(safe-area-inset-bottom,0px))' : '';
  };
  document.onselectionchange = onSel;
}

/* ================================================================ K().labs */
function pageLabs() {
  let h = '<div class="page hub"><div><div class="label">Hands-on</div><h1>Labs</h1><p class="lead">' + (K().labKind === 'sql' ? 'Every lab runs in this page on a fresh copy of the Pocket Clinic database. Write your query and select <b>Run</b>: the checks compare your result with the expected rows, so any correct query passes.' : K().labKind === 'api' ? 'Every lab runs in this page against the Pocket practice API. Edit requests and scripts, then select <b>Run &amp; check</b>. Labs marked "broken API" also run your tests against a faulty version of the API; your tests must detect the fault.' : 'Every lab runs in this page: write a Playwright test in JavaScript or Python and run it against the built-in practice websites. No browser download, compiler or library is needed. Checks look at what your test does, so several correct solutions pass.') + '</p></div>';
  if (K().labKind !== 'sql') h += '<a class="playcard" href="#/lab/playground"><span class="label">Free workspace</span><b>Playground</b><span class="muted sm">' + (K().labKind === 'api' ? 'Dev and Staging environments, a sample collection, the Runner and the mock server.' : 'Any test against shop.test, todo.test, play.test and api.test, in either language.') + ' Nothing is checked.</span></a>';
  K().modules.forEach(m => {
    const ls = K().labs.filter(l => K().TOP[l.topic].m === m.n); if (!ls.length) return;
    const solved = ls.filter(l => (D().labs[l.id] || {}).solved).length;
    h += '<div class="modh"><h2>' + m.n + ' · ' + esc(m.title) + '</h2><span class="badge mono">' + solved + ' / ' + ls.length + '</span></div><div class="labgrid">';
    ls.forEach(l => { const s = D().labs[l.id] || {}; h += '<a class="labtile" href="#/lab/' + l.id + '"><span class="lt-top"><span class="badge mono">' + l.topic + '</span>' + (s.solved ? chip('strong', 'Solved') : s.attempts ? chip('avg', 'Attempted') : chip('none', 'New')) + '</span><b>' + esc(l.title) + '</b><span class="lt-b">' + inline(l.brief) + '</span>' + ((l.bugs || []).length ? '<span class="lt-x">Broken API checks · ' + l.bugs.length + '</span>' : '') + '</a>'; });
    h += '</div>';
  });
  shell('labs', 'labs', h + '</div>');
}

const servers = {};
function labServer(id) { return servers[id] || (servers[id] = new PM.Server()); }
const wbUi = {};
let handle = null;
function pageLab(id) {
  const k = K();
  if (k.labKind === 'sql') { const lab = k.LAB[id]; if (!lab) return pageLabs(); return pageSqlLab(lab); }
  if (k.labKind === 'pw') { const lab = id === 'playground' ? k.playground : k.LAB[id]; if (!lab) return pageLabs(); return pagePwLab(lab); }
  if (id === 'playground') return pagePlayground();
  const l = K().LAB[id]; if (!l) return pageLabs();
  const st = lb(id); st.ws = st.ws ? PM.normWs(st.ws) : G.labStart(l);
  const t = K().TOP[l.topic];
  const checksHtml = () => {
    const ev = st.lastEval;
    const all = l.checks.map(c => c[0]).concat((l.bugs || []).map(b => 'Your tests detect a broken API: ' + PM.BUGS[b]));
    return '<ul class="checks">' + all.map((lab, i) => { const c = ev && ev[i]; return '<li class="' + (c ? (c.ok ? 'ok' : 'no') : '') + '"><span class="ck" aria-hidden="true">' + (c ? (c.ok ? '✓' : '✗') : '·') + '</span><span>' + inline(lab) + (c ? '<span class="sr">' + (c.ok ? ' — passed' : ' — failing') + '</span>' : '') + '</span></li>'; }).join('') + '</ul>';
  };
  const h = '<div class="labpage"><section class="card brief" id="brief" aria-label="Lab brief"><p class="crumb"><a href="#/labs">Labs</a> · <a href="#/learn/' + t.code + '">' + t.code + ' ' + esc(t.title) + '</a></p><h1>' + esc(l.title) + '</h1><div class="metaline">' + (st.solved ? chip('strong', 'Solved') : st.attempts ? chip('avg', 'Attempted') : chip('none', 'New')) + '<span class="badge mono">' + l.checks.length + ' checks' + ((l.bugs || []).length ? ' · ' + l.bugs.length + ' broken API' : '') + '</span></div>' +
    '<div class="bd">' + md(l.brief) + '</div><div><div class="label">Tasks</div><ol class="bd">' + l.tasks.map(x => '<li>' + inline(x) + '</li>').join('') + '</ol></div>' +
    '<div class="runbox"><button class="btn primary lg wide" data-act="check">Run &amp; check</button><p class="note" style="margin:0">Runs the collection with your Runner settings on a fresh copy of the API. Ctrl+Shift+Enter.</p></div>' +
    '<div><div class="label">Checks</div><div id="checks">' + checksHtml() + '</div></div>' + ((l.bugs || []).length ? '<p class="note" style="margin:0">Broken-API checks re-run your collection against a version of the API with one fault. At least one of your tests must fail there, and all must pass against the correct API.</p>' : '') +
    '<div><div class="label">Hints</div><div id="hints" style="margin-top:6px">' + l.hints.slice(0, st.hints || 0).map(x => '<p class="hint">' + inline(x) + '</p>').join('') + ((st.hints || 0) < l.hints.length ? '<button class="btn sm" data-act="hint">Show hint ' + ((st.hints || 0) + 1) + ' / ' + l.hints.length + '</button>' : '') + '</div></div>' +
    '<div class="foot"><span id="cf-sol"><button class="link" data-act="sol">Show solution</button></span><span id="cf-reset"><button class="link" data-act="reset">Reset lab</button></span><button class="link" data-act="api">API reference</button></div></section>' +
    '<section class="bench" id="bench" aria-label="Workbench"></section></div>';
  shell('labs', 'labs', h, { cls: 'wide' });
  const wb = new G.Workbench($('#bench'), { getWs: () => lb(id).ws, save: () => save(), server: () => labServer(id), ui: wbUi[id] || (wbUi[id] = {}) });
  wbUi[id] = wb.ui;
  const brief = $('#brief');
  brief.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return; const act = b.getAttribute('data-act');
    if (act === 'hint') { st.hints = (st.hints || 0) + 1; save(); return pageLab(id); }
    if (act === 'api') return openApi();
    if (act === 'sol' || act === 'reset') { $('#cf-' + (act === 'sol' ? 'sol' : 'reset')).innerHTML = '<span class="confirm">' + (act === 'sol' ? 'Replace your work with the solution?' : 'Restart this lab from the starter?') + ' <button class="btn sm danger" data-act="' + act + '-yes">' + (act === 'sol' ? 'Show solution' : 'Reset lab') + '</button><button class="link" data-act="no">Cancel</button></span>'; return; }
    if (act === 'no') return pageLab(id);
    if (act === 'sol-yes') { st.ws = G.labSolution(l); st.sawSolution = true; st.lastEval = null; servers[id] = null; wbUi[id] = {}; save(); return pageLab(id); }
    if (act === 'reset-yes') { st.ws = G.labStart(l); st.lastEval = null; st.hints = 0; servers[id] = null; wbUi[id] = {}; save(); return pageLab(id); }
    if (act === 'check') {
      b.disabled = true; b.textContent = 'Running…';
      const res = await PM.evaluate(l, st.ws);
      st.attempts = (st.attempts || 0) + 1;
      st.lastEval = res.checks.map(c => ({ ok: c.ok }));
      if (res.solved && !st.solved) { st.solved = true; st.solvedAt = Date.now(); }
      if (res.solved && D().sprint && D().sprint.labs.indexOf(id) >= 0 && D().sprint.done.indexOf(id) < 0 && Date.now() < D().sprint.end) D().sprint.done.push(id);
      save();
      $('#checks').innerHTML = checksHtml();
      wb.showRun(res.error ? { error: res.error } : res.r);
      b.disabled = false; b.textContent = 'Run & check';
      const failing = res.checks.filter(c => !c.ok).length;
      const msg = document.createElement('p'); msg.className = 'runmsg ' + (res.solved ? 'ok' : 'no'); msg.setAttribute('role', 'status');
      msg.textContent = res.error ? res.error : res.solved ? 'All checks pass — lab solved.' + (st.sawSolution ? ' You viewed the solution; reset the lab later and solve it unaided.' : '') : failing + ' of ' + res.checks.length + ' checks failing. The run report is under the request.';
      const old = brief.querySelector('.runmsg'); if (old) old.remove(); b.parentNode.appendChild(msg);
      const m = app().querySelector('.metric'); if (m) m.outerHTML = metricHtml('labs');
    }
  };
  document.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') { e.preventDefault(); const b = brief.querySelector('[data-act="check"]'); if (b) b.click(); } };
}

function pagePwLab(lab) {
  const k = K(); const t = lab.topic ? k.TOP[lab.topic] : null; const st = lb(lab.id);
  shell('labs', 'labs', '<div id="pwhost"></div>', { cls: 'wide' });
  const crumb = '<p class="crumb"><a href="#/labs">Labs</a>' + (t ? ' · <a href="#/learn/' + t.code + '">' + t.code + ' ' + esc(t.title) + '</a>' : '') + '</p>';
  handle = G.PwLab.render($('#pwhost'), lab, { st, lang: D().lang, inline, md, chip, crumb, refLabel: k.refLabel, openRef: openApi,
    setLang: l => { D().lang = l; save(); if (handle) handle.destroy(); handle = null; pagePwLab(lab); },
    save: () => save(),
    onSolved: () => { const sp = D().sprint; if (sp && sp.labs.indexOf(lab.id) >= 0 && sp.done.indexOf(lab.id) < 0 && Date.now() < sp.end) sp.done.push(lab.id); },
    refresh: () => { const m = app().querySelector('.metric'); if (m) m.outerHTML = metricHtml('labs'); } });
  document.onkeydown = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (handle) handle.run(); } };
}
const PLAY = () => PM.normWs({
  collection: { name: 'Pocket API tour', variables: [{ key: 'userId', value: '2' }], auth: { type: 'bearer', token: '{{token}}' },
    items: [
      { id: 'p_login', name: 'Log in', method: 'POST', url: '{{baseUrl}}/auth/login', body: { mode: 'raw', raw: '{\n  "username": "{{user}}",\n  "password": "{{password}}"\n}' }, tests: "const body = pm.response.json();\npm.test('Login returns a token', () => {\n  pm.response.to.have.status(200);\n  pm.expect(body.token).to.be.a('string');\n});\npm.environment.set('token', body.token);" },
      { id: 'p_me', name: 'Who am I', method: 'GET', url: '{{baseUrl}}/auth/me' },
      { id: 'p_users', name: 'List users', method: 'GET', url: '{{baseUrl}}/users?page=1&limit=5' },
      { id: 'p_user', name: 'Get user', method: 'GET', url: '{{baseUrl}}/users/:id', pathVars: { id: '{{userId}}' } },
      { id: 'p_books', name: 'Books in stock', method: 'GET', url: '{{baseUrl}}/books?inStock=true&sort=price' },
      { id: 'p_order', name: 'Order a book', method: 'POST', url: '{{baseUrl}}/orders', body: { mode: 'raw', raw: '{\n  "bookId": 3,\n  "quantity": 2\n}' } },
      { id: 'p_echo', name: 'Echo', method: 'POST', url: '{{baseUrl}}/echo', headers: [{ key: 'X-Demo', value: '{{$guid}}' }], body: { mode: 'raw', raw: '{\n  "hello": "{{$randomFirstName}}"\n}' } }
    ] },
  environments: [{ id: 'env_dev', name: 'Dev', values: [{ key: 'baseUrl', value: 'https://dev.pocket.test' }, { key: 'user', value: 'tester' }, { key: 'password', value: 'test123' }] }, { id: 'env_staging', name: 'Staging', values: [{ key: 'baseUrl', value: 'https://staging.pocket.test' }, { key: 'user', value: 'admin' }, { key: 'password', value: 'admin123' }] }],
  activeEnv: 'env_dev'
});
let playServer = null;
function pagePlayground() {
  D().play = D().play ? PM.normWs(D().play) : PLAY();
  const h = '<div class="labpage"><section class="card brief"><p class="crumb"><a href="#/labs">Labs</a></p><h1>Playground</h1><div class="bd"><p>A free workspace. Your changes are saved; the practice API keeps its data until you reset it.</p><ul><li>Switch between <b>Dev</b> and <b>Staging</b> above the request list.</li><li>Run the whole collection from the <b>Runner</b> tab.</li><li>Save a response as an example, then call the same path on <code>https://mock.test</code>.</li></ul></div>' +
    '<div class="foot"><button class="link" data-act="apireset">Reset API data</button><span id="cf-play"><button class="link" data-act="playreset">Reset playground</button></span><button class="link" data-act="api">API reference</button></div></section><section class="bench" id="bench" aria-label="Workbench"></section></div>';
  shell('labs', 'labs', h, { cls: 'wide' });
  if (!playServer) playServer = new PM.Server();
  new G.Workbench($('#bench'), { getWs: () => D().play, save: () => save(), server: () => playServer, ui: wbUi.play || (wbUi.play = {}) });
  app().querySelector('.brief').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const a = b.getAttribute('data-act');
    if (a === 'api') return openApi();
    if (a === 'apireset') { playServer = new PM.Server(); b.textContent = 'API data reset'; return; }
    if (a === 'playreset') { $('#cf-play').innerHTML = '<span class="confirm">Replace the playground with the sample? <button class="btn sm danger" data-act="playyes">Reset playground</button><button class="link" data-act="no">Cancel</button></span>'; return; }
    if (a === 'playyes') { D().play = PLAY(); wbUi.play = {}; playServer = new PM.Server(); save(); return pagePlayground(); }
    if (a === 'no') return pagePlayground();
  };
}

/* ================================================================ CHEAT SHEETS */
function pageCheats(m) {
  m = Number(m) || K().modules[0].n; const mod = K().modules.find(x => x.n === m) || K().modules[0]; m = mod.n;
  const adds = D().adds[m] || [];
  const fromNb = nbHere().filter(n => n.onSheet && K().TOP[n.code] && K().TOP[n.code].m === m);
  const body = String(K().cheats[m] || '').replace(/^\s*#\s[^\n]*\n+/, '');          /* the title is shown as the page heading */
  const h = '<div class="qh-pagehead"><div class="label">Cheat sheet · ' + esc(K().label) + ' ' + m + '</div><h1>' + esc(mod.title) + '</h1></div><article class="card cheat">' + md(body) + '</article>';
  const right = '<section class="card adds" aria-label="My additions"><h2>My additions</h2>' + (adds.length || fromNb.length ? '<ul>' + adds.map((a, i) => '<li>' + inline(a) + ' <button class="link" data-rm="' + i + '">Remove</button></li>').join('') + fromNb.map(n => '<li><span class="meta">' + n.code + ' · ' + n.kind + '</span> ' + esc(n.text) + '</li>').join('') + '</ul>' : '<p class="muted" style="margin:0">Add lines in your own words, or tick "On my cheat sheet" on a notebook entry.</p>') +
    '<div class="row qh-addrow"><label class="sr" for="addline">New line</label><input id="addline" placeholder="Add a line"><button class="btn" data-act="addline">Add line</button></div></section>';
  shell('cheats', 'learn', h, { frame: { left: 'chapters', cur: m, right } });
  const go = () => { const v = $('#addline').value.trim(); if (!v) return; (D().adds[m] = D().adds[m] || []).push(v); save(); pageCheats(m); $('#addline').focus(); };
  app().querySelector('[data-act="addline"]').onclick = go;
  $('#addline').onkeydown = e => { if (e.key === 'Enter') go(); };
  app().querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { D().adds[m].splice(Number(b.getAttribute('data-rm')), 1); save(); pageCheats(m); });
}

/* ================================================================ MOCK TESTS */
function buildQs(kind, code, m) {
  if (kind === 'full' && K().bpSlots) { const ids = buildPatternMock(); if (ids && ids.length) return ids; }
  if (kind === 'full' || kind === 'quick') {
    const bp = K().blueprint[kind].mix; let ids = [];
    Object.keys(bp).forEach(mn => {
      const ts = K().topics.filter(t => t.m === Number(mn)).sort(() => Math.random() - 0.5);
      let i = 0, guard = 0; const got = [];
      while (got.length < bp[mn] && guard++ < 60) { const t = ts[i++ % ts.length]; const q = pickQ(t.code, ids.concat(got)); if (q) got.push(q); }
      ids = ids.concat(got);
    });
    return ids.sort(() => Math.random() - 0.5);
  }
  if (/^fx:/.test(kind)) { const t = (K().fixedTests || []).find(x => 'fx:' + x.id === kind); return t ? t.qids.filter(id => QBY[id]) : []; }
  if (kind === 'module') { const ts = K().topics.filter(t => t.m === m); const ids = []; let i = 0, g = 0; while (ids.length < 10 && g++ < 80) { const q = pickQ(ts[i++ % ts.length].code, ids); if (q) ids.push(q); } return ids; }
  if (kind === 'topic') { const ids = []; for (let k = 0; k < 5; k++) { const q = pickQ(code, ids, k < 2); if (q) ids.push(q); } return ids; }
  if (kind === 'weak') return Object.keys(D().weak).filter(id => QBY[id]).slice(0, 10);
  return [];
}
function startSession(o) {
  const qs = buildQs(o.kind, o.code, o.m); if (!qs.length) return;
  const exam = o.mode === 'exam';
  const fx = (K().fixedTests || []).find(x => 'fx:' + x.id === o.kind);
  const dur = exam && fx ? fx.min * 60000 : exam && (o.kind === 'full' || o.kind === 'quick') ? K().blueprint[o.kind].min * 60000 : 0;
  D().session = { id: 's' + Date.now(), kind: o.kind, mode: o.mode, title: o.title, qs, answers: {}, flags: {}, revealed: {}, idx: 0, elapsed: 0, running: null, dur, code: o.code || null, m: o.m || null, enforce: exam && !!o.enforce, begun: !exam, warned: false };
  if (!exam) D().session.running = Date.now();
  save(); location.hash = '#/exam';
}
function pageMocks() {
  const r = readiness(); const v = verdict(r); const weakN = Object.keys(D().weak).filter(id => QBY[id]).length; const sel = D().mockSel;
  const practiceOnly = sel.test === 'module' || sel.test === 'weak';
  const mode = practiceOnly ? 'practice' : sel.mode;
  const BP = K().blueprint; const FX = K().fixedTests || []; const grp = o => FX.filter(t => !!t.official === o); const pickIn = g => (g.find(t => 'fx:' + t.id === sel.test) || g[0]);
  const gtile = (g, name, note) => g.length ? [['fx:' + pickIn(g).id, name, g.length + ' tests · ' + g[0].qids.length + ' questions · ' + g[0].min + ' min · ' + note]] : [];
  const tiles = gtile(grp(true), 'ISTQB sample exam', 'official questions').concat(gtile(grp(false), 'Fixed mock', 'same 40 questions each time')).concat([['full', 'Full mock', (FX.length ? 'Exam pattern · ' : '') + BP.full.n + ' questions · ' + BP.full.min + ' min · pass at ' + passAt(BP.full.n)], ['quick', 'Quick check', BP.quick.n + ' questions · ' + BP.quick.min + ' min · pass at ' + passAt(BP.quick.n)], ['module', K().label + ' practice', '10 questions from one module · practice mode'], ['weak', 'Weak areas', weakN + ' question' + (weakN === 1 ? '' : 's') + ' · retire after 2 correct answers']]);
  const tileHtml = t => { const dis = t[0] === 'weak' && !weakN; const on = sel.test === t[0] || (/^fx:/.test(t[0]) && /^fx:/.test(sel.test) && !!(FX.find(x => 'fx:' + x.id === t[0]) || {}).official === !!(FX.find(x => 'fx:' + x.id === sel.test) || {}).official); return '<label class="tile' + (on ? ' sel' : '') + (dis ? ' dis' : '') + '"><input type="radio" name="test" value="' + t[0] + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><b>' + t[1] + '</b><span>' + t[2] + '</span></label>'; };
  const modeHtml = (k, title, d) => '<label class="tile' + (mode === k ? ' sel' : '') + (practiceOnly && k === 'exam' ? ' dis' : '') + '"><input type="radio" name="mode" value="' + k + '"' + (mode === k ? ' checked' : '') + (practiceOnly && k === 'exam' ? ' disabled' : '') + '><b>' + title + '</b><span>' + d + '</span></label>';
  const fxSel = FX.find(t => 'fx:' + t.id === sel.test); if (/^fx:/.test(sel.test) && !fxSel) sel.test = 'full';
  const testName = fxSel ? fxSel.title : { full: 'Full mock', quick: 'Quick check', module: K().label + ' ' + sel.module + ' practice', weak: 'Weak areas' }[sel.test];
  let h = '<div class="page hub"><div><div class="label">Exam practice</div><h1>Mock tests</h1></div>' +
    (D().session ? '<div class="resume">Unfinished test: <b>' + esc(D().session.title) + '</b> · ' + Object.keys(D().session.answers).length + ' / ' + D().session.qs.length + ' answered <a class="btn sm" href="#/exam">Resume test</a><button class="link" data-act="discard">Discard</button></div>' : '') +
    '<div class="hubgrid"><div class="stack">' +
    '<section class="card"><div class="label">1 · Choose a test</div><div class="tiles" role="radiogroup" aria-label="Test">' + tiles.map(tileHtml).join('') + '</div>' + (hasExt('pdf-viewer') && !officialN ? '<p class="note" style="margin:0">ISTQB Sample Exams A–D appear here when your own <span class="mono">questions.json</span> is in the <span class="mono">istqb</span> folder next to the app.</p>' : '') + (fxSel ? '<label class="optsrow">Test <select id="fxsel">' + grp(!!fxSel.official).map(t => '<option value="fx:' + t.id + '"' + (t.id === fxSel.id ? ' selected' : '') + '>' + esc(t.title) + '</option>').join('') + '</select></label>' : '') + (sel.test === 'module' ? '<label class="optsrow">' + esc(K().label) + ' <select id="modsel">' + K().modules.map(m => '<option value="' + m.n + '"' + (sel.module === m.n ? ' selected' : '') + '>' + m.n + ' · ' + esc(m.title) + '</option>').join('') + '</select></label>' : '') + '</section>' +
    '<section class="card"><div class="label">2 · Choose a mode</div><div class="tiles" role="radiogroup" aria-label="Mode">' + modeHtml('exam', 'Exam mode', 'Timer, no feedback until you submit. Counts towards exam readiness.') + modeHtml('practice', 'Practice mode', 'Rationale after each answer. No timer. Not counted in readiness.') + '</div></section>' +
    (mode === 'exam' ? '<section class="card"><div class="label">3 · Options</div><div class="optsrow"><label><input type="checkbox" id="enforce"' + (sel.enforce ? ' checked' : '') + '> Enforce exam conditions — fullscreen, one warning, no pause</label></div><p class="note" style="margin:0">Without enforcement you can pause the timer, for example when studying on a phone.</p></section>' : '') +
    '<div class="row"><button class="btn primary lg" data-act="start"' + (sel.test === 'weak' && !weakN ? ' disabled' : '') + '>Start ' + testName + ' · ' + (mode === 'exam' ? 'Exam mode' : 'Practice mode') + '</button>' + (weakN && sel.test !== 'weak' ? '<button class="btn amber" data-act="weak">Practise my weak areas</button>' : '') + '</div>' +
    (K().labs.length ? '<section class="card"><div class="label">Lab sprint</div><p style="margin:0">Three labs against a 25-minute clock, unsolved labs first.</p><div class="row"><a class="btn" href="#/sprint">' + (D().sprint ? 'Open the running sprint' : 'Start a lab sprint') + '</a></div></section>' : '') + '</div>' +
    '<aside class="stack">' + examDatesCard() + '<section class="card"><div class="label">Exam readiness</div><div class="row" style="align-items:baseline"><span class="big">' + (r === null ? '—' : r + '%') + '</span>' + chip(v.c, v.t) + '</div>' +
    '<div class="scale" aria-hidden="true"><span class="s1">Not ready</span><span class="s2"></span><span class="s3">Ready</span>' + (r !== null ? '<i class="mk" style="left:calc(' + r + '% - 1px)"></i>' : '') + '</div><p class="note" style="margin:0">Last three exam-mode mock results, newest weighted most (3 · 2 · 1). Ready ≥ 75 · Borderline 65–74 · Not ready &lt; 65.</p></section>' +
    '<section class="card"><div class="label">History</div>' + (D().mocks.length ? '<ul class="hist">' + D().mocks.slice(-10).reverse().map(m => '<li><a href="#/results/' + m.id + '"><span>' + esc(m.title) + '<small>' + (m.mode === 'exam' ? 'Exam mode' : 'Practice mode') + ' · ' + new Date(m.date).toLocaleDateString() + '</small></span><b class="' + (m.pct >= PASS ? 'good' : 'low') + '">' + m.score + '/' + m.total + '</b></a></li>').join('') + '</ul>' : '<p class="empty">No tests taken yet.</p>') + '</section></aside></div></div>';
  shell('mocks', 'exam', h);
  const main = $('#main');
  main.onchange = e => {
    const t = e.target;
    if (t.name === 'test') sel.test = t.value; else if (t.name === 'mode') sel.mode = t.value; else if (t.id === 'enforce') sel.enforce = t.checked; else if (t.id === 'modsel') sel.module = Number(t.value); else if (t.id === 'fxsel') sel.test = t.value; else return;
    save(); pageMocks();
  };
  main.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const a = b.getAttribute('data-act');
    if (a === 'discard') { D().session = null; save(); return pageMocks(); }
    if (a === 'weak') return startSession({ kind: 'weak', mode: 'practice', title: 'Weak areas' });
    if (a === 'start') return startSession({ kind: sel.test, m: sel.module, mode, enforce: sel.enforce, title: testName });
  };
}

/* --- exam screen (no app chrome) */
let tick = null, examListeners = false;
function pageExam() {
  const s = D().session; if (!s) { location.hash = '#/mocks'; return; }
  document.body.classList.add('exam-on');
  const exam = s.mode === 'exam';
  if (exam && !s.begun) return examRules();
  const q = QBY[s.qs[s.idx]]; const pick = s.answers[q.id]; const revealed = !exam && s.revealed[q.id];
  const answered = Object.keys(s.answers).length;
  const canPause = exam && s.dur && !s.enforce;
  let h = '<div class="exam"><header class="ex-h"><b>' + esc(s.title) + '</b><span class="mono">' + (exam ? 'Exam mode' : 'Practice mode') + ' · ' + answered + '/' + s.qs.length + '</span>' + (s.dur ? '<span class="clock" id="exclock" role="timer" aria-label="Time left">' + clock(remaining(s)) + '</span>' : '<span style="margin-left:auto"></span>') +
    (canPause ? '<button class="btn sm" data-act="pause">Pause</button>' : '') + (!s.enforce ? '<button class="btn sm" data-act="leave">Leave</button>' : '') + '<button class="btn sm" data-act="submit">Submit</button></header>';
  h += '<div class="ex-body"><section class="card" aria-label="Question"><p class="qn">Question ' + (s.idx + 1) + ' / ' + s.qs.length + ' · ' + q.code + ' ' + esc(K().TOP[q.code].title) + '</p>' + questionHtml(q, pick, revealed, 'ex-' + q.id) + (revealed ? rationaleHtml(q, pick) + (pick !== q.a ? '<div class="row"><button class="link" data-act="mistake">' + (S.nb.some(n => n.qid === q.id && n.kind === 'mistake') ? 'Saved as mistake' : 'Save as mistake') + '</button></div>' : '') : '') +
    '<div class="row d-only">' + (s.idx > 0 ? '<button class="btn" data-act="prev">‹ Previous</button>' : '') + (exam ? '<button class="btn' + (s.flags[q.id] ? ' flagged' : '') + '" data-act="flag" aria-pressed="' + !!s.flags[q.id] + '">⚑ ' + (s.flags[q.id] ? 'Flagged' : 'Flag') + '</button>' : '') +
    (!exam && pick != null && !revealed ? '<button class="btn primary" data-act="reveal">Check answer</button>' : '') +
    (s.idx < s.qs.length - 1 ? '<button class="btn' + (exam || revealed ? ' primary' : '') + '" data-act="next">Next ›</button>' : '<button class="btn primary" data-act="submit">Submit test</button>') + '</div>' +
    (!exam && pick != null && !revealed ? '<div class="row m-only"><button class="btn primary wide" data-act="reveal">Check answer</button></div>' : '') + '</section>' +
    '<aside class="card ex-map d-only" aria-label="Question map"><div class="label">Question map</div>' + mapHtml(s) + '<p class="note" style="margin:0">' + answered + ' / ' + s.qs.length + ' answered' + (exam ? ' · ' + Object.keys(s.flags).filter(k => s.flags[k]).length + ' flagged' : '') + '</p></aside></div>' +
    '<nav class="exbar" aria-label="Question navigation"><button class="btn" data-act="prev"' + (s.idx > 0 ? '' : ' disabled') + '>‹ Previous</button>' + (exam ? '<button class="btn' + (s.flags[q.id] ? ' flagged' : '') + '" data-act="flag">⚑ Flag</button>' : '<button class="btn" data-act="reveal"' + (pick != null && !revealed ? '' : ' disabled') + '>Check</button>') + '<button class="btn" data-act="mapsheet">Map</button>' + (s.idx < s.qs.length - 1 ? '<button class="btn primary" data-act="next">Next ›</button>' : '<button class="btn primary" data-act="submit">Submit</button>') + '</nav></div>';
  app().innerHTML = h;
  bindExam();
}
function mapHtml(s) { const exam = s.mode === 'exam'; return '<div class="map">' + s.qs.map((id, i) => '<button class="mq' + (i === s.idx ? ' cur' : '') + (s.flags[id] ? ' flag' : s.answers[id] != null ? (!exam && s.revealed[id] ? (s.answers[id] === QBY[id].a ? ' ok' : ' no') : ' ans') : '') + '" data-go="' + i + '" aria-label="Question ' + (i + 1) + (s.answers[id] != null ? ', answered' : '') + (s.flags[id] ? ', flagged' : '') + '">' + (i + 1) + '</button>').join('') + '</div>'; }
function remaining(s) { const el = s.elapsed + (s.running ? Date.now() - s.running : 0); return Math.max(0, s.dur - el); }
function examRules() {
  const s = D().session;
  app().innerHTML = '<div class="modal dark" role="dialog" aria-modal="true" aria-labelledby="rt"><div class="modal-box rules"><div class="label">' + esc(s.title) + ' · Exam mode</div><h2 id="rt">Exam rules</h2><p style="margin:0">' + s.qs.length + ' questions · ' + (s.dur / 60000) + ' min · pass at ' + passAt(s.qs.length) + '</p><ul>' +
    '<li>No feedback until you submit. You can change answers and flag questions for review.</li><li>The test submits automatically when the time runs out.</li>' +
    (s.enforce ? '<li>The test runs fullscreen. Leaving the tab or fullscreen gives <b>one warning</b>; the second time, the test is submitted.</li><li>Pause is not available.</li>' : '<li>You can pause the timer.</li>') + '</ul>' +
    '<div class="row"><button class="btn primary lg" data-act="begin">Start exam</button><button class="btn" data-act="cancel">Cancel</button></div></div></div>';
  app().querySelector('[data-act="begin"]').onclick = async () => {
    s.begun = true; s.running = Date.now(); s.fs = false;
    if (s.enforce && document.documentElement.requestFullscreen) { try { await document.documentElement.requestFullscreen(); s.fs = true; } catch (e) { s.fs = false; } }
    save(); pageExam();
  };
  app().querySelector('[data-act="cancel"]').onclick = () => { D().session = null; save(); location.hash = '#/mocks'; };
  app().querySelector('[data-act="begin"]').focus();
}
function violation() {
  const s = D().session; if (!s || !s.enforce || !s.begun || location.hash !== '#/exam') return;
  if (!s.warned) {
    s.warned = true; save();
    const d = document.createElement('div'); d.className = 'modal dark'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="modal-box"><div class="label">Warning</div><h2>You left the exam</h2><p style="margin:0">This is your one warning. If you leave the exam tab or fullscreen again, the test is submitted as it is.</p><div class="row"><button class="btn primary" data-act="back">Return to the exam</button></div></div>';
    document.body.appendChild(d);
    const b = d.querySelector('[data-act="back"]'); b.focus();
    b.onclick = async () => { d.remove(); if (s.fs && document.documentElement.requestFullscreen && !document.fullscreenElement) { try { await document.documentElement.requestFullscreen(); } catch (e) { s.fs = false; } } };
  } else finish('Submitted after a second exit from the exam.');
}
function addExamListeners() {
  if (examListeners) return; examListeners = true;
  document.addEventListener('visibilitychange', () => { if (document.hidden) violation(); });
  document.addEventListener('fullscreenchange', () => { const s = D().session; if (s && s.enforce && s.begun && s.fs && !document.fullscreenElement) violation(); });
}
function bindExam() {
  const s = D().session; addExamListeners();
  app().onchange = e => { const r = e.target.closest('input[data-pick]'); if (!r) return; const q = QBY[s.qs[s.idx]]; if (s.mode === 'practice' && s.revealed[q.id]) return; s.answers[q.id] = pickFrom(app(), q, r); save(); pageExam(); const n = app().querySelector('input[data-pick="' + r.value + '"]'); if (n) n.focus(); };
  app().onclick = e => {
    const b = e.target.closest('button'); if (!b || !D().session) return; const a = b.getAttribute('data-act'); const q = QBY[s.qs[s.idx]];
    if (b.hasAttribute('data-go')) { s.idx = Number(b.getAttribute('data-go')); save(); return pageExam(); }
    if (a === 'next' && s.idx < s.qs.length - 1) { s.idx++; save(); return pageExam(); }
    if (a === 'prev' && s.idx > 0) { s.idx--; save(); return pageExam(); }
    if (a === 'flag') { s.flags[q.id] = !s.flags[q.id]; save(); return pageExam(); }
    if (a === 'reveal' && s.answers[q.id] != null) { s.revealed[q.id] = true; record(q.id, s.answers[q.id] === q.a); if (s.answers[q.id] !== q.a) D().weak[q.id] = 0; save(); return pageExam(); }
    if (a === 'mistake') { saveMistake(q); b.textContent = 'Saved as mistake'; return; }
    if (a === 'mapsheet') { const o = overlay('<section class="sheet" role="dialog" aria-modal="true" aria-label="Question map"><div class="grab"></div><div class="sheet-h"><b>Question map</b><button class="btn sm" data-close>Close</button></div><div class="sheet-b">' + mapHtml(s) + '</div></section>'); o.el.querySelectorAll('[data-go]').forEach(g => g.onclick = () => { s.idx = Number(g.getAttribute('data-go')); save(); o.close(); pageExam(); }); return; }
    if (a === 'pause') { s.elapsed += Date.now() - s.running; s.running = null; save(); clearInterval(tick); const d = document.createElement('div'); d.className = 'paused'; d.innerHTML = '<div><div class="label" style="color:#C7CCD6">' + esc(s.title) + '</div><h2>Paused</h2><p>The timer is stopped. Questions are hidden.</p><button class="btn white lg">Resume test</button></div>'; document.body.appendChild(d); const rb = d.querySelector('button'); rb.focus(); rb.onclick = () => { d.remove(); s.running = Date.now(); save(); pageExam(); }; return; }
    if (a === 'leave') { if (s.running && s.dur) { s.elapsed += Date.now() - s.running; s.running = null; } save(); document.body.classList.remove('exam-on'); location.hash = '#/mocks'; return; }
    if (a === 'submit') {
      const left = s.qs.filter(id => s.answers[id] == null).length;
      if (left && b.getAttribute('data-sure') !== '1') { app().querySelectorAll('[data-act="submit"]').forEach(x => { x.setAttribute('data-sure', '1'); x.textContent = left + ' unanswered — submit anyway'; }); return; }
      return finish();
    }
  };
  clearInterval(tick);
  if (s.dur && s.running) tick = setInterval(() => { if (!D().session || location.hash !== '#/exam') { clearInterval(tick); return; } const left = remaining(D().session); const c = $('#exclock'); if (c) { c.textContent = clock(left); c.classList.toggle('low', left < 300000); } if (left <= 0) { clearInterval(tick); finish('Time ran out — the test was submitted.'); } }, 500);
}
function finish(reason) {
  const s = D().session; if (!s) return;
  let score = 0;
  s.qs.forEach(id => { const ok = s.answers[id] === QBY[id].a; if (ok) score++;
    if (!(s.mode === 'practice' && s.revealed[id]) && s.answers[id] != null) record(id, ok);
    if (!ok) D().weak[id] = 0; else if (D().weak[id] !== undefined) { D().weak[id]++; if (D().weak[id] >= 2) { delete D().weak[id]; D().retired = (D().retired || []).filter(x => x !== id).concat([id]); } } });
  const res = { id: 'm' + Date.now(), kind: s.kind, mode: s.mode, title: s.title, date: Date.now(), score, total: s.qs.length, pct: Math.round(100 * score / s.qs.length), answers: s.answers, qs: s.qs, code: s.code, note: reason || null };
  D().mocks.push(res); planAfterMock(res); if (D().mocks.length > 60) D().mocks = D().mocks.slice(-60);
  D().session = null; save(true); clearInterval(tick);
  document.querySelectorAll('.modal.dark,.paused').forEach(x => x.remove());
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  document.body.classList.remove('exam-on');
  location.hash = '#/results/' + res.id;
}

/* --- results */
function pageResults(id) {
  const m = D().mocks.find(x => x.id === id); if (!m) { location.hash = '#/mocks'; return; }
  const pa = passAt(m.total); const passed = m.score >= pa;
  const byT = {}; m.qs.forEach(qid => { const q = QBY[qid]; const t = byT[q.code] = byT[q.code] || { n: 0, ok: 0 }; t.n++; if (m.answers[qid] === q.a) t.ok++; });
  const missed = Object.keys(byT).filter(c => byT[c].ok < byT[c].n).sort((a, b) => (byT[a].ok / byT[a].n) - (byT[b].ok / byT[b].n) || (byT[b].n - byT[a].n));
  const focus = missed[0];
  let h = '<div class="page"><p class="crumb"><a href="#/mocks">Mock tests</a></p><div><div class="label">' + (m.mode === 'exam' ? 'Exam mode' : 'Practice mode') + ' · ' + new Date(m.date).toLocaleString() + '</div><h1>' + esc(m.title) + ' — results</h1></div>' +
    (m.note ? '<div class="banner">' + esc(m.note) + '</div>' : '') +
    '<section class="card"><div class="label">Score</div><div class="scorecard"><span class="score">' + m.pct + '%</span><div style="display:grid;gap:6px">' + chip(passed ? 'strong' : 'weak', passed ? 'Pass' : 'Not passed') + '<span class="mono sm">' + m.score + ' / ' + m.total + ' correct · pass at ' + pa + '</span></div></div></section>';
  if (focus) h += '<section class="card blue"><div class="label">Focus next</div><h2>' + focus + ' ' + esc(K().TOP[focus].title) + '</h2><p style="margin:0">' + (byT[focus].n - byT[focus].ok) + ' of ' + byT[focus].n + ' missed on this topic.</p><div class="row"><a class="btn white" href="#/learn/' + focus + '">Revise ' + focus + '</a></div></section>';
  h += '<section class="card"><h2>Feedback by topic</h2><div class="fbt">' + K().modules.map(mod => {
    const ts = Object.keys(byT).filter(c => K().TOP[c].m === mod.n).sort(); if (!ts.length) return '';
    const n = ts.reduce((a, c) => a + byT[c].n, 0), ok = ts.reduce((a, c) => a + byT[c].ok, 0); const p = Math.round(100 * ok / n);
    const cls = p >= 95 ? 'st-strong' : p >= 85 ? 'st-good' : p >= 70 ? 'st-avg' : 'st-weak';
    return '<div class="fbm"><div class="mh"><span>' + mod.n + ' · ' + esc(mod.title) + '</span><span class="bar"><i class="' + cls + '" style="width:' + p + '%"></i></span><span class="mono">' + ok + '/' + n + '</span></div><ul>' + ts.map(c => '<li><span><span class="mono sm">' + c + '</span> ' + esc(K().TOP[c].title) + ' <span class="mono sm muted">' + byT[c].ok + '/' + byT[c].n + '</span></span>' + (byT[c].ok < byT[c].n ? '<span class="acts"><a href="#/learn/' + c + '">Revise</a><button class="link" data-prac="' + c + '">Practise</button></span>' : chip('strong', 'All correct')) + '</li>').join('') + '</ul></div>';
  }).join('') + '</div></section>';
  h += '<section class="card"><h2>Review</h2><ol class="review">' + m.qs.map((qid, i) => { const q = QBY[qid]; const p = m.answers[qid]; return '<li><details><summary><span><span class="mono sm muted">' + (i + 1) + ' · ' + q.code + '</span> ' + inline(stemLine(q.q)) + '</span>' + chip(p === q.a ? 'strong' : 'weak', p === q.a ? 'Correct' : p == null ? 'Unanswered' : 'Incorrect') + '</summary><div class="body">' + questionHtml(q, p, true, 'rv-' + i).replace(/^<div class="q">[\s\S]*?<!--\/q--><p class="selhint">[\s\S]*?<\/p>/, '') + rationaleHtml(q, p) + (p !== q.a ? '<div class="row"><button class="link" data-mis="' + q.id + '">' + (S.nb.some(n => n.qid === q.id && n.kind === 'mistake') ? 'Saved as mistake' : 'Save as mistake') + '</button></div>' : '') + '</div></details></li>'; }).join('') + '</ol></section>' +
    '<div class="row"><a class="btn" href="#/mocks">Back to mock tests</a></div></div>';
  shell('mocks', 'exam', h);
  app().querySelectorAll('[data-prac]').forEach(b => b.onclick = () => { const c = b.getAttribute('data-prac'); startSession({ kind: 'topic', code: c, mode: 'practice', title: 'Practice · ' + c + ' ' + K().TOP[c].title }); });
  app().querySelectorAll('[data-mis]').forEach(b => b.onclick = () => { saveMistake(QBY[b.getAttribute('data-mis')]); b.textContent = 'Saved as mistake'; });
}

/* ================================================================ SPRINT */
function pageSprint() {
  const sp = D().sprint;
  let h = '<div class="page"><p class="crumb"><a href="#/mocks">Mock tests</a></p><div><div class="label">Timed skills practice</div><h1>Lab sprint</h1></div>';
  if (!sp) {
    h += '<section class="card"><p style="margin:0">Three labs · 25 min · unsolved labs first. A lab counts when <b>Run &amp; check</b> passes every check before the time runs out. The three labs restart from their starters.</p><div class="row"><button class="btn primary lg" data-act="sprint">Start lab sprint</button></div></section>';
    if ((D().sprints || []).length) h += '<section class="card"><div class="label">Past sprints</div><ul class="hist">' + D().sprints.slice(-8).reverse().map(p => '<li><span class="hrow"><span>' + new Date(p.date).toLocaleString() + '</span><b class="' + (p.score >= 2 ? 'good' : 'low') + '">' + p.score + '/3</b></span></li>').join('') + '</ul></section>';
  } else {
    const left = Math.max(0, sp.end - Date.now());
    h += '<section class="card"><div class="label">Time left</div><span class="big clock" data-clock="sprint">' + clock(left) + '</span><ul class="sprintl">' + sp.labs.map(id => { const l = K().LAB[id]; const ok = sp.done.indexOf(id) >= 0; return '<li class="' + (ok ? 'ok' : '') + '"><span class="ck">' + (ok ? '✓' : '·') + '</span><a href="#/lab/' + id + '">' + esc(l.title) + '</a><span class="badge mono">' + l.topic + '</span>' + (ok ? chip('strong', 'Solved') : '') + '</li>'; }).join('') + '</ul><div class="row"><button class="btn" data-act="endsprint">Finish sprint</button></div></section>';
  }
  shell('mocks', 'exam', h + '</div>', { noSprintBar: true });
  const st = app().querySelector('[data-act="sprint"]'); if (st) st.onclick = () => {
    const un = K().labs.filter(l => !(D().labs[l.id] || {}).solved).sort(() => Math.random() - 0.5); const so = K().labs.filter(l => (D().labs[l.id] || {}).solved).sort(() => Math.random() - 0.5);
    const pick = un.concat(so).slice(0, 3).map(l => l.id);
    pick.forEach(id => { const reset = K().labKind === 'api' ? { ws: G.labStart(K().LAB[id]), lastEval: null, hints: 0 } : { code: {}, hints: 0 }; D().labs[id] = Object.assign(lb(id), reset); });
    D().sprint = { labs: pick, done: [], start: Date.now(), end: Date.now() + 25 * 60000 }; save(); pageSprint();
  };
  const en = app().querySelector('[data-act="endsprint"]'); if (en) en.onclick = endSprint;
}
function endSprint() { if (!D().sprint) return; (D().sprints = D().sprints || []).push({ date: Date.now(), score: D().sprint.done.length }); D().sprint = null; save(); if (/^#\/sprint/.test(location.hash)) pageSprint(); else render(); }
setInterval(() => { COURSES.forEach(c => { const d = D(c.id); if (d.sprint && d.sprint.end < Date.now() && c.id !== K().id) { d.sprints.push({ date: Date.now(), score: d.sprint.done.length }); d.sprint = null; save(); } }); if (!D().sprint) return; const left = D().sprint.end - Date.now(); document.querySelectorAll('[data-clock="sprint"]').forEach(c => c.textContent = clock(Math.max(0, left))); if (left <= 0) endSprint(); }, 1000);

/* ================================================================ PROGRESS */
function pageProgress() {
  const r = readiness(); const v = verdict(r); const cov = coverage(); const ls = labsSolved();
  let h = '<div class="page hub"><div><div class="label">Overview · ' + esc(K().name) + '</div><h1>My progress</h1></div><div class="kpis">' +
    '<section class="card"><div class="label">Syllabus coverage</div><span class="big">' + cov + '%</span><div class="bar cov"><i style="width:' + cov + '%"></i></div><span class="mono sm muted">' + passedN() + ' / ' + K().topics.length + ' topics passed</span></section>' +
    '<section class="card"><div class="label">Exam readiness</div><div class="row" style="align-items:baseline"><span class="big">' + (r === null ? '—' : r + '%') + '</span>' + chip(v.c, v.t) + '</div><div class="bar"><i style="width:' + (r || 0) + '%"></i></div><span class="sm muted">Last three exam-mode mocks</span></section>' +
    (K().labs.length ? '<section class="card"><div class="label">Labs solved</div><span class="big">' + ls + '</span><div class="bar cov"><i style="width:' + Math.round(100 * ls / K().labs.length) + '%"></i></div><span class="mono sm muted">' + ls + ' / ' + K().labs.length + ' labs</span></section>' : '') + '</div>';
  h += '<section class="card"><h2>Topic map</h2><div class="tmap">' + K().topics.map(t => { const s = status(t.code); const passed = (D().topics[t.code] || {}).passed; return '<a href="#/learn/' + t.code + '" class="tm' + (s.key !== 'none' ? ' st-' + s.key : '') + (passed ? ' passed' : '') + '" title="' + esc(t.code + ' ' + t.title + ' · ' + s.label + (passed ? ' · lesson passed' : '')) + '" aria-label="' + esc(t.code + ' ' + t.title + ', ' + s.label + (passed ? ', passed' : '')) + '">' + t.code + '</a>'; }).join('') + '</div>' +
    '<div class="legend">' + chip('strong', 'Strong ≥ 95%') + chip('good', 'Good ≥ 85%') + chip('avg', 'Average ≥ 70%') + chip('weak', 'Weak < 70%') + chip('none', 'Not started') + '<span>Outlined = lesson passed</span></div></section>';
  const ex = D().mocks.filter(m => m.kind === 'full' || m.kind === 'quick').slice(-12);
  h += '<section class="card"><h2>Mock trend</h2>' + (ex.length ? '<div class="trend" role="img" aria-label="Recent mock scores: ' + ex.map(m => m.pct + '%').join(', ') + '">' + ex.map(m => '<div class="tb"><small>' + m.pct + '</small><i style="height:' + Math.max(2, m.pct) + '%" class="' + (m.pct >= PASS ? '' : 'low') + (m.mode === 'practice' ? ' prac' : '') + '"></i></div>').join('') + '<span class="passline" style="bottom:' + PASS + '%"></span></div><p class="note" style="margin:0">Dashed line = pass mark (65%). Lighter bars = practice mode.</p>' : '<p class="empty">Take a Full mock or Quick check to see a trend.</p>') + '</section></div>';
  h += '<section class="card"><h2>All courses</h2><div class="tw"><table><thead><tr><th>Course</th><th>Coverage</th><th>Readiness</th><th>Labs</th><th></th></tr></thead><tbody>' + COURSES.map(c => { const d = D(c.id); const n = c.topics.filter(t => (d.topics[t.code] || {}).passed).length; const ms = d.mocks.filter(m => m.mode === 'exam' && (m.kind === 'full' || m.kind === 'quick')).slice(-3); const rr = ms.length ? Math.round(ms.reduce((a, m) => a + m.pct, 0) / ms.length) + '%' : '—'; const lsn = c.labs.filter(l => (d.labs[l.id] || {}).solved).length;
    return '<tr><td><b>' + esc(c.name) + '</b> <span class="muted sm">' + esc(c.tag) + '</span></td><td class="mono">' + Math.round(100 * n / c.topics.length) + '%</td><td class="mono">' + rr + '</td><td class="mono">' + lsn + ' / ' + c.labs.length + '</td><td>' + (c.id === K().id ? chip('good', 'Current') : '<button class="link" data-switch="' + c.id + '">Switch</button>') + '</td></tr>'; }).join('') + '</tbody></table></div></section></div>';
  h = h.replace(/<\/section><\/div><section class="card"><h2>All courses/, '</section><section class="card"><h2>All courses');
  shell('progress', 'learn', h);
  app().querySelectorAll('[data-switch]').forEach(b => b.onclick = () => switchCourse(b.getAttribute('data-switch')));
}

/* ================================================================ DATA */
function pageData() {
  let h = '<div class="page"><div><div class="label">Settings</div><h1>Data &amp; setup</h1></div>' +
    '<section class="card"><h2>Where your progress is kept</h2><p style="margin:0">Progress, notes and lab work for every course are saved in this browser' + (cloud ? ' and synced to your account.' : '. When you open the published app signed in to claude.ai, it is also synced to your account.') + '</p></section>' +
    '<section class="card"><h2>Appearance</h2><div class="tiles" role="radiogroup" aria-label="Theme">' + [['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(t => '<label class="tile' + (S.theme === t[0] ? ' sel' : '') + '"><input type="radio" name="theme" value="' + t[0] + '"' + (S.theme === t[0] ? ' checked' : '') + '><b>' + t[1] + '</b></label>').join('') + '</div></section>' +
    '<section class="card"><h2>Backup and restore</h2><div class="backup"><div class="row"><button class="btn" data-act="copy">Copy backup to clipboard</button><span class="note" id="copymsg" role="status" style="margin:0"></span></div><label class="sr" for="restore">Backup text</label><textarea id="restore" rows="3" placeholder="Paste a backup here. A Postman Path or Playwright Path backup is merged into its course."></textarea><div class="row"><button class="btn" data-act="restore">Restore from pasted backup</button></div></div></section>' +
    '<section class="card"><h2>Reset</h2><p style="margin:0">Deletes all progress, notebook entries and lab work on this device' + (cloud ? ' and in your account' : '') + '.</p><div class="row" id="cf-wipe"><button class="btn danger" data-act="wipe">Reset all progress</button></div></section></div>';
  shell('', 'learn', h);
  app().querySelectorAll('input[name="theme"]').forEach(r => r.onchange = () => { S.theme = r.value; save(); applyTheme(); pageData(); });
  app().querySelector('[data-act="copy"]').onclick = async () => { const t = JSON.stringify(S); try { await navigator.clipboard.writeText(t); $('#copymsg').textContent = 'Copied. Paste it somewhere safe.'; } catch (e) { $('#restore').value = t; $('#restore').select(); $('#copymsg').textContent = 'The clipboard is blocked here. The backup is in the box below; copy it from there.'; } };
  app().querySelector('[data-act="restore"]').onclick = () => { try { const o = JSON.parse($('#restore').value); if (!o || typeof o !== 'object') throw new Error('x'); const kind = detect(o); if (!kind) throw new Error('x'); S = kind === 'hub' ? load(o) : load(o, S); save(true); render(); } catch (e) { $('#copymsg').textContent = 'That text is not a Learning Paths, Postman Path or Playwright Path backup.'; } };
  app().querySelector('[data-act="wipe"]').onclick = () => { $('#cf-wipe').innerHTML = '<span class="confirm">Delete everything? <button class="btn sm danger" id="wipeyes">Delete all progress</button><button class="link" id="wipeno">Cancel</button></span>'; $('#wipeyes').onclick = () => { S = blank(); save(true); render(); }; $('#wipeno').onclick = pageData; };
}

/* ================================================================ API reference */
function apiDocs() {
  const E = [
    ['GET', '/health', '—', 'Service status and environment name (<code>api</code>, <code>dev</code>, <code>staging</code>).'],
    ['ANY', '/echo, /echo/…', '—', 'Returns the method, path, query, headers and parsed body it received.'],
    ['GET', '/status/:code', '—', 'Answers with that status code (200–504).'],
    ['GET', '/slow?ms=1500', '—', 'Waits before answering (max 5000 ms).'],
    ['GET', '/limited', '—', 'Rate-limited: 3 calls per 30 s, then <code>429</code> with <code>Retry-After</code>.'],
    ['POST', '/auth/login', '—', 'Body <code>{"username","password"}</code> → <code>{token, tokenType, expiresIn, user}</code>. Wrong credentials → 401.'],
    ['GET', '/auth/me', 'Bearer', 'The logged-in user.'],
    ['GET', '/users', '—', 'Query: <code>page</code> (≥1), <code>limit</code> (1–50, default 5), <code>role</code>, <code>active</code>, <code>q</code>, <code>sort</code> (id, name, email; <code>-</code> for descending). Returns <code>{page, limit, total, totalPages, data}</code> and <code>X-Total-Count</code>.'],
    ['GET', '/users/:id', '—', '200 user · 404 unknown · 400 non-numeric id.'],
    ['POST', '/users', 'Bearer', 'Body <code>{name (2–50), email, role?}</code> → 201 + <code>Location</code>. 400 validation (<code>details[]</code>), 409 duplicate email, 415 non-JSON.'],
    ['PUT', '/users/:id', 'Bearer', 'Full replace: name, email and role are all required.'],
    ['PATCH', '/users/:id', 'Bearer', 'Partial update.'],
    ['DELETE', '/users/:id', 'Bearer (admin)', '204. Non-admins get 403.'],
    ['GET', '/books', '—', 'Plain array. Query: <code>genre</code> (testing, fiction, design), <code>maxPrice</code>, <code>inStock=true</code>, <code>sort</code> (price, title, id).'],
    ['GET', '/books/:id', '—', 'Book 1–8; others 404. Book 5 is out of stock.'],
    ['GET', '/orders', 'Bearer', 'Your orders (admins see all).'],
    ['POST', '/orders', 'Bearer', 'Body <code>{bookId, quantity (1–10)}</code> → 201. 400 validation, 422 unknown book or not enough stock.'],
    ['GET', '/orders/:id', 'Bearer', 'Owner or admin. Order 5001 belongs to tester.'],
    ['POST', '/orders/:id/pay', 'Bearer', 'Calls the payment service (<code>POST {paymentUrl}/charge</code> with <code>{orderId, amount, currency}</code>). Approved → 200 paid · declined (402 or <code>status: "declined"</code>) → 402, order stays pending · 5xx or unreachable → 502 · already paid → 409. Forwards <code>x-mock-response-name</code> / <code>x-mock-response-code</code>.'],
    ['GET · PUT', '/config/payment', 'PUT: Bearer (admin)', 'Where the payment service lives. Default <code>https://payments.pocket.test</code> (not built yet, so payments fail with 502 until you point it at a stub such as <code>https://mock.test/payments</code>).'],
    ['GET', '/reports/sales', 'API key', 'Header <code>x-api-key: PMK-12345</code> (or <code>?api_key=</code>).'],
    ['GET', '/basic/secure', 'Basic', '<code>admin</code> / <code>admin123</code>.']
  ];
  return '<p>Base URLs: <code>https://api.pocket.test</code>, <code>https://dev.pocket.test</code> and <code>https://staging.pocket.test</code> — the same API with separate data. <code>https://mock.test</code> serves the examples saved in the current collection and records every call it receives: <code>GET https://mock.test/__calls</code> lists them, <code>DELETE</code> clears them.</p>' +
    '<h3>Accounts</h3><div class="tw"><table><thead><tr><th>Username</th><th>Password</th><th>User</th><th>Role</th></tr></thead><tbody><tr><td><code>admin</code></td><td><code>admin123</code></td><td>1 · Ada Lovelace</td><td>admin</td></tr><tr><td><code>tester</code></td><td><code>test123</code></td><td>2 · Grace Hopper</td><td>user</td></tr></tbody></table></div>' +
    '<h3>Endpoints</h3><div class="tw"><table class="api"><thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Notes</th></tr></thead><tbody>' + E.map(e => '<tr><td><span class="mb">' + e[0] + '</span></td><td><code>' + esc(e[1]) + '</code></td><td>' + e[2] + '</td><td>' + e[3] + '</td></tr>').join('') + '</tbody></table></div>' +
    '<p class="note">Errors are JSON: <code>{"error": "…", "message": "…"}</code>. Unsupported methods return 405 with an <code>Allow</code> header. All data is in this page; nothing leaves your browser.</p>';
}
function pwSites() {
  const pg = K().playground;
  return '<p>Playwright labs run against four built-in websites. They are simulated inside this page, behave like real sites (delays, dialogs, network calls) and reset for every test.</p><ul>' + pg.tasks.map(t => '<li>' + inline(t) + '</li>').join('') + '</ul><h3>Accounts</h3><div class="tw"><table><thead><tr><th>Site</th><th>Username</th><th>Password</th></tr></thead><tbody><tr><td><code>shop.test</code></td><td><code>standard_user</code></td><td><code>secret_sauce</code></td></tr></tbody></table></div><p class="note">Type a site address into the practice browser on any lab page to explore it before writing a test.</p>';
}
function refHtml() { return K().labKind === 'api' ? apiDocs() : pwSites(); }
function pageApi() { shell('', 'labs', '<div class="page"><div><div class="label">' + esc(K().refEyebrow) + '</div><h1>' + esc(K().refTitle) + '</h1></div><section class="card" style="display:block">' + refHtml() + '</section></div>'); }
function openApi() { overlay('<div class="modal" style="background:transparent;pointer-events:none"><div class="modal-box wide" role="dialog" aria-modal="true" aria-label="' + esc(K().refTitle) + '" style="pointer-events:auto"><div class="modal-h"><h2>' + esc(K().refTitle) + '</h2><button class="btn sm" data-close>Close</button></div>' + refHtml() + '</div></div>'); }

/* keep the side-rail exam trick inside the lesson card on wide screens */
function fitTrick() {   /* D23: copy the lesson's exam trick to the top of the right pane; CSS shows one copy per screen size */
  const tr = document.querySelector('#lesson > .trick'), nb = document.getElementById('nbcol'); if (!nb) return;
  const old = nb.querySelector(':scope > .trick.rail');
  if (!tr) { if (old) old.remove(); return; }
  if (old && old.dataset.src === tr.innerHTML.length + ':' + location.hash) return;
  if (old) old.remove();
  const c = tr.cloneNode(true); c.classList.add('rail'); c.dataset.src = tr.innerHTML.length + ':' + location.hash; nb.prepend(c);
}
(function () { const go = () => { const a = document.getElementById('app'); if (!a) return; let q = 0; new MutationObserver(() => { if (q) return; q = 1; requestAnimationFrame(() => { q = 0; fitTrick(); }); }).observe(a, { childList: true, subtree: true }); fitTrick(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go(); })();
/* ================================================================ SYLLABUS TREE: keep the active topic in view */
const SYL_POS = {};
document.addEventListener('scroll', e => { const t = e.target; if (t && t.classList && t.classList.contains('syl-col') && t.closest('main')) { const k = (K() || {}).id || ''; SYL_POS[k] = t.scrollTop; } }, true);
/* clicking the topic you are already on does nothing (lesson, notes and scroll stay as they are) */
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('.syl a.on, .syl a[aria-current]'); if (a) e.preventDefault(); }, true);
function syncSyllabus(root) {
  if (!root) { fitTrick(); if (!G.__fitT) { G.__fitT = true; G.addEventListener('resize', fitTrick); } }
  /* D28: the navigation pane keeps its scroll position between topics; it only moves when the current topic would be out of view
     (first visit to a path: the current topic is centred) */
  const pane = !root && document.querySelector('main .learn3 > .syl-col');
  const key = (K() || {}).id || '';
  if (pane && SYL_POS[key] != null) pane.scrollTop = SYL_POS[key];
  (root || document).querySelectorAll('.syl a.on, .syl a[aria-current]').forEach(a => {
    let p = a.parentElement;
    while (p && p !== document.body) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
        const pr = p.getBoundingClientRect(), ar = a.getBoundingClientRect();
        const kept = p === pane && SYL_POS[key] != null;
        if (!kept) p.scrollTop += (ar.top - pr.top) - (p.clientHeight - ar.height) / 2;
        else if (ar.top < pr.top + 8) p.scrollTop -= pr.top + 8 - ar.top;
        else if (ar.bottom > pr.bottom - 8) p.scrollTop += ar.bottom - pr.bottom + 8;
        break;
      }
      p = p.parentElement;
    }
  });
  if (pane) SYL_POS[key] = pane.scrollTop;
}
/* ================================================================ INLINE DEMOS (plugin "demos") */
let demoOff = null;
function mountDemo(code) {
  const el = document.querySelector('#lesson .demo-slot'); const a = K().demos && K().demos[code]; const P = LP.plugins.demos;
  if (!el || !a || !P) return;
  if (demoOff) { try { demoOff.destroy(); } catch (e) {} }
  demoOff = P.mount(el, { activity: a, course: K().id });
}
/* ================================================================ PAGE FRAME: the same three columns on every in-path screen */
const FRAMED = ['cheats', 'mocks', 'progress', 'labs', 'learn', 'sprint'];
function frameOn(active, opts) { return !!opts.frame || (FRAMED.indexOf(active) >= 0 && !opts.home && !opts.cls); }
function chapterNav(cur) {
  return '<nav class="syl qh-chapnav" aria-label="' + esc(K().label) + 's"><div class="label">' + esc(K().label) + 's</div>' + K().modules.map(mo => {
    const ts = K().topics.filter(t => t.m === mo.n); const done = ts.filter(t => { const x = D().topics[t.code] || {}; return x.passed || x.testedOut; }).length;
    return '<a href="#/cheats/' + mo.n + '" class="qh-ch' + (mo.n === cur ? ' on' : '') + '"' + (mo.n === cur ? ' aria-current="page"' : '') + '><span class="tc">' + mo.n + '</span><span class="t">' + esc(mo.title) + '</span><small class="mono">' + done + '/' + ts.length + '</small></a>'; }).join('') + '</nav>';
}
function frameWrap(body, opts) {
  const f = opts.frame || {}; const cur = f.cur != null ? f.cur : ((location.hash.match(/\/learn\/([^/]+)$/) || [])[1]);
  const left = f.left === 'chapters' ? chapterNav(f.cur) : syllabus(cur);
  return '<div class="learn3 qh-frame' + (f.right ? '' : ' no-right') + '"><aside class="colside syl-col" aria-label="Navigation">' + left + '</aside><div class="qh-main">' + body + '</div>' + (f.right ? '<aside class="colside qh-right">' + f.right + '</aside>' : '') + '</div>';
}
/* ================================================================ PATH COLOUR (PLATFORM.md §15) */
function pathVars() {
  const a = K().accent || '#1D3C9E'; const r = document.documentElement.style;
  r.setProperty('--path', a); r.setProperty('--path-bg', a + '14'); r.setProperty('--path-line', a + '4D');
  document.documentElement.setAttribute('data-course', K().id);
}
const outN = (c, d) => (c || K()).topics.filter(t => ((d || D()).topics[t.code] || {}).testedOut && !((d || D()).topics[t.code] || {}).passed).length;
const doneN = (c, d) => (c || K()).topics.filter(t => { const x = (d || D()).topics[t.code] || {}; return x.passed || x.testedOut; }).length;
const isAssess = cid => D(cid).mode === 'assess';
function learnHref() { return D().mode == null ? '#/start' : isAssess() ? (D().placement && D().placement.finished ? '#/plan' : '#/placement') : '#/learn/' + nextTopic(); }

/* ---------------------------------------------------------------- shared bits */
function ringSvg(p, q, c, size) {
  size = size || 88; const r = size / 2 - 6, C = 2 * Math.PI * r;
  return '<svg width="' + size + '" height="' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--none)" stroke-width="7"/>' +
    (q ? '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-opacity=".35" stroke-width="7" stroke-dasharray="' + (C * (p + q) / 100) + ' ' + C + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' : '') +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="7" stroke-dasharray="' + (C * p / 100) + ' ' + C + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
}
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const fmtMin = m => m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' m' : m + ' min';
const mainKind = k => k === 'full' || k === 'quick' || /^fx:/.test(String(k));
/* Readiness: last 3 exam-mode results, newest weighted 3, then 2, then 1 (CTFL Prep rule) */
function weightedReadiness(r) { if (!r.length) return null; const w = [3, 2, 1]; const last = r.slice(-3).reverse(); let a = 0, t = 0; last.forEach((m, i) => { a += m.pct * w[i]; t += w[i]; }); return Math.round(a / t); }
function courseReadiness(c) { return weightedReadiness(D(c.id).mocks.filter(m => m.mode === 'exam' && mainKind(m.kind)).slice(-3)); }
function nextFor(c) {
  const d = D(c.id);
  if (d.mode === 'assess' && d.placement && d.placement.finished) { const p = planLists(c); const t = p.learn[0] || p.review[0]; if (t) return t; }
  return c.topics.find(t => { const x = d.topics[t.code] || {}; return !x.passed && !x.testedOut; }) || c.topics[0];
}
function studyDays() {
  const days = new Set(); COURSES.forEach(c => { const d = D(c.id); Object.values(d.topics).forEach(t => (t.answers || []).forEach(a => days.add(new Date(a.t).toDateString()))); (d.mocks || []).forEach(m => days.add(new Date(m.date).toDateString())); });
  const out = []; for (let i = 13; i >= 0; i--) { const dt = new Date(Date.now() - i * 864e5); out.push(days.has(dt.toDateString())); } return out;
}

/* ================================================================ HOME (mockup 03: journey map + totals) */
function pageHome() {
  if (S.homeSel == null || !CB[S.homeSel]) S.homeSel = K().id;
  const sel = CB[S.homeSel]; const sd = D(sel.id);
  let all = 0, done = 0, ls = 0, la = 0, mins = 0, weak = 0;
  COURSES.forEach(c => { const d = D(c.id); all += c.topics.length; done += doneN(c, d); la += c.labs.length; ls += c.labs.filter(l => (d.labs[l.id] || {}).solved).length; weak += Object.keys(d.weak).filter(id => QBY[id]).length;
    c.topics.forEach(t => { const x = d.topics[t.code] || {}; if (x.passed) mins += t.min; }); });
  const stages = { ctfl: 'Foundations', api: 'API testing', pw: 'UI automation' };
  const kinds = c => c.labs.length ? 'Hands-on · ' + c.labs.length + ' labs' : 'Theory · certification';
  let h = '<div class="page home"><section class="card qh-map"><div class="qh-maptop"><div><div class="label">' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · Your QA journey</div><h1>From foundations to automation</h1></div></div><div class="qh-track">';
  COURSES.forEach((c, i) => { const d = D(c.id); const p = pct(c.topics.filter(t => (d.topics[t.code] || {}).passed).length, c.topics.length), o = pct(outN(c, d), c.topics.length);
    h += '<button class="qh-st' + (c.id === sel.id ? ' sel' : '') + '" data-sel="' + c.id + '" style="--acc:' + c.accent + '"><span class="qh-stage-tag">' + (i + 1) + ' · ' + esc(stages[c.id] || c.tag) + '</span><span class="qh-ring">' + ringSvg(p, o, c.accent) + '<span class="v">' + (p + o) + '%</span></span><b>' + esc(c.name) + '</b><span class="k">' + esc(kinds(c)) + '</span></button>'; });
  h += '<div class="qh-st qh-future" title="Put a .lpp.js file in the courses folder next to the app, then reload"><span class="qh-stage-tag">' + (COURSES.length + 1) + ' · Next path</span><span class="qh-ring"><span class="v qh-plus">+</span></span><b>Add a learning path</b><span class="k">courses folder · .lpp.js</span></div>';
  h += '</div><div class="qh-kstrip"><div><div class="label">Topics done · all paths</div><span class="big">' + done + '<small> / ' + all + '</small></span><div class="bar cov"><i style="width:' + pct(done, all) + '%"></i></div></div>' +
    '<div><div class="label">Labs solved</div><span class="big">' + ls + '<small> / ' + la + '</small></span><div class="bar"><i style="width:' + pct(ls, la) + '%"></i></div></div>' +
    '<div><div class="label">Study time</div><span class="big">' + fmtMin(mins) + '</span><span class="sm muted">from passed topics</span></div>' +
    '<div><div class="label">Weak areas</div><span class="big">' + weak + '</span><span class="sm muted">questions to re-practise</span></div></div>';
  if (LP.refused.length) h += '<div class="qh-notice">' + LP.refused.map(r => '<b>' + esc(r.title) + '</b> could not be loaded: it ' + esc(r.why) + '.').join(' ') + ' Your other paths are not affected.</div>';
  h += '</section>';
  const assess = sd.mode === 'assess' && sd.placement && sd.placement.finished;
  const p = sel.topics.filter(t => (sd.topics[t.code] || {}).passed).length, o = outN(sel, sd);
  h += '<div class="qh-detail"><section class="card qh-pcard"><div class="label">Station ' + (COURSES.indexOf(sel) + 1) + ' · <span class="qh-ptext">' + esc(sel.name) + '</span></div><h2>' + p + ' passed' + (o ? ' · ' + o + ' tested out' : '') + ' <span class="muted" style="font-size:16px">of ' + sel.topics.length + ' topics</span></h2>' +
    '<div class="qh-split"><i style="width:' + pct(p, sel.topics.length) + '%"></i><i class="o" style="width:' + pct(o, sel.topics.length) + '%"></i></div>' +
    '<div class="qh-modepills"><a class="qh-mp' + (sd.mode !== 'assess' ? ' on' : '') + '" href="#/start/step/' + sel.id + '">Learn step by step</a><a class="qh-mp' + (sd.mode === 'assess' ? ' on' : '') + '" href="#/start/assess/' + sel.id + '">Assess first</a></div>';
  if (assess) { const L = planLists(sel); h += '<div class="label" style="margin-top:12px">Study plan · from placement test</div>' + [['learn', 'Learn', L.learn], ['review', 'Review', L.review], ['out', 'Skip', L.out]].map(x => '<div class="qh-pl"><span class="tagp t-' + x[0] + '">' + x[1] + '</span><span>' + (x[2].slice(0, 2).map(t => t.code + ' ' + esc(t.title)).join(' · ') || '<span class="muted">none</span>') + (x[2].length > 2 ? ' · +' + (x[2].length - 2) : '') + '</span><span class="mono sm muted">' + x[2].length + '</span></div>').join(''); }
  else h += '<div class="qh-mods">' + sel.modules.map(m => { const ts = sel.topics.filter(t => t.m === m.n); const v = pct(doneN({ topics: ts }, sd), ts.length); return '<div class="qh-mod"><span class="i mono">' + m.n + '</span><span>' + esc(m.title) + '</span><span class="bar cov"><i style="width:' + v + '%"></i></span><span class="mono sm muted">' + v + '%</span></div>'; }).join('') + '</div>';
  h += '</section><div class="qh-side">';
  const nx = nextFor(sel); const r = courseReadiness(sel); const v = verdict(r); const wk = Object.keys(sd.weak).filter(id => QBY[id]).length;
  h += '<section class="card qh-pcard qh-nextc"><div class="label">' + (assess ? 'Next in your plan' : 'Next step') + '</div><h2>' + nx.code + ' ' + esc(nx.title) + '</h2><p class="muted sm" style="margin:0">' + esc(nx.lo) + '</p><div class="row"><a class="btn primary" href="#/c/' + sel.id + '/learn/' + nx.code + '">Start lesson</a><span class="mono sm muted">' + nx.min + ' min</span></div>' +
    (sd.mode !== 'assess' ? '<div class="qh-hr sm">Know some of this already? <a href="#/start/assess/' + sel.id + '">Take the placement test</a> <span class="muted">· one test across the whole path</span></div>' : '') +
    '<div class="qh-hr qh-rowb sm"><span><span class="label">Exam readiness</span><br>' + (r === null ? '— <span class="muted">no exam-mode mock yet</span>' : r + '% ' + chip(v.c, v.t)) + '</span>' + (wk ? '<a class="btn amber sm" href="#/c/' + sel.id + '/mocks">' + wk + ' weak areas</a>' : '') + '</div></section>';
  const sdays = studyDays();
  h += examDatesCard(sel) + '<section class="card"><div class="label">Study days · last 2 weeks</div><div class="qh-heat">' + sdays.map(x => '<i class="' + (x ? 'on' : '') + '"></i>').join('') + '</div><div class="sm muted" style="margin-top:8px">' + sdays.filter(Boolean).length + ' of 14 days · all paths</div></section></div></div></div>';
  shell('home', '', h, { home: true });
  app().querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { S.homeSel = b.getAttribute('data-sel'); pageHome(); });
}

/* ================================================================ ASSESS FIRST (PLATFORM.md §5.1, mockup 04) */
function planLists(c) {
  const d = D(c.id); const out = { learn: [], review: [], out: [] };
  c.topics.forEach(t => { const x = d.topics[t.code] || {}; if (x.passed) return; if (x.testedOut) out.out.push(t); else if (x.plan === 'review') out.review.push(t); else if (x.plan === 'learn' || (d.placement && d.placement.finished)) out.learn.push(t); });
  return out;
}
function pageStart(mode, cid) {
  if (cid && CB[cid] && cid !== K().id) { S.course = cid; save(); }
  if (mode === 'step') { D().mode = 'step'; save(); location.hash = '#/learn/' + nextTopic(); return; }
  if (mode === 'assess') { D().mode = 'assess'; save(); location.hash = D().placement && D().placement.finished ? '#/plan' : '#/placement'; return; }
  const left = K().topics.filter(t => !(D().topics[t.code] || {}).passed); const passed = K().topics.length - left.length;
  const total = K().topics.reduce((a, t) => a + t.min, 0);
  let h = '<div class="page narrow"><span class="pchip"><span class="pdot"></span>' + esc(K().name) + '</span><h1>How do you want to study this path?</h1><p class="muted" style="margin:0">You can switch at any time. Your progress is kept either way.</p><div class="qh-choices">' +
    '<section class="card qh-choice"><div class="label">Option 1</div><h2>Learn step by step</h2><ol><li>Every topic in syllabus order</li><li>Lesson → Check yourself → next topic</li><li>Mock tests when you feel ready</li></ol><span class="mono sm muted">' + K().topics.length + ' topics · about ' + fmtMin(total) + '</span><span class="sm muted">Best if the subject is new to you.</span><a class="btn" href="#/start/step">Start step by step</a></section>' +
    '<section class="card qh-choice qh-rec"><div class="label">Option 2</div><h2>Assess first</h2><ol><li>One placement test across the whole syllabus</li><li>Topics you already know are skipped</li><li>A study plan with only what needs work</li></ol><span class="mono sm muted">Placement: ' + left.length + ' topics · ' + left.length + '–' + 2 * left.length + ' questions · pause any time</span><span class="sm muted">Best if you already work in testing or have studied part of the syllabus.</span><a class="btn primary" href="#/start/assess">Take the placement test</a></section></div>' +
    (passed ? '<p class="sm muted">' + passed + ' topics are already passed from your earlier progress, so the placement test covers the other ' + left.length + '.</p>' : '') + '</div>';
  shell('learn', 'learn', h);
}
function newPlacement() {
  const left = K().topics.filter(t => !(D().topics[t.code] || {}).passed);
  const q = []; left.forEach(t => { const id = pickQ(t.code, Object.keys(QBY).filter(x => QBY[x].fmt === 'query'), true); if (id) q.push(id); });
  q.sort(() => Math.random() - 0.5);
  return { started: Date.now(), finished: null, queue: q, idx: 0, answers: {}, first: {}, placed: {}, total: left.length, pick: null };
}
function pagePlacement() {
  const d = D(); if (!d.placement || d.placement.finished) { d.placement = newPlacement(); save(); }
  const P = d.placement;
  if (P.idx >= P.queue.length) return finishPlacement();
  const q = QBY[P.queue[P.idx]]; const placed = Object.keys(P.placed).length;
  let h = '<div class="page narrow"><div class="qh-rowb"><span class="pchip"><span class="pdot"></span>' + esc(K().short) + ' · Placement test</span><span class="mono sm muted">Question ' + (P.idx + 1) + ' · ' + placed + ' of ' + P.total + ' topics placed · <a href="#/" data-act="pause">Pause</a></span></div>' +
    '<div class="qh-pbar"><i style="width:' + pct(placed, P.total) + '%"></i></div><section class="card" id="pq"><div class="label">Topic ' + q.code + ' · ' + esc(K().TOP[q.code].title) + '</div>' + questionHtml(q, P.pick, false, 'pl') +
    '<label class="opt notsure' + (P.pick === 'ns' ? ' sel' : '') + '"><input type="radio" name="pl" value="ns" data-pick="ns"' + (P.pick === 'ns' ? ' checked' : '') + '><span class="ol"></span><span>Not sure</span><span></span></label>' +
    '<div class="row qh-rowb"><span class="sm muted">No feedback until the end. Questions are mixed across ' + esc(K().label.toLowerCase()) + 's.</span><button class="btn primary" data-act="plnext"' + (P.pick == null ? ' disabled' : '') + '>Next</button></div></section></div>';
  shell('learn', 'learn', h);
  const box = $('#pq');
  box.onchange = e => { const r = e.target.closest('input[data-pick]'); if (!r) return; P.pick = r.value === 'ns' ? 'ns' : pickFrom(box, q, r); save(); pagePlacement(); };
  box.querySelector('[data-act="plnext"]').onclick = () => {
    const ok = P.pick !== 'ns' && P.pick === q.a; P.answers[q.id] = ok; const code = q.code;
    if (P.first[code] === undefined) {
      P.first[code] = ok;
      if (!ok) P.placed[code] = 'learn';
      else { const used = P.queue.slice(); const pool = K().questions.filter(x => x.code === code && x.kind === 'bank' && used.indexOf(x.id) < 0); const alt = pool.find(x => x.concept !== q.concept) || pool[0];
        if (alt) { const at = P.idx + 1 + Math.floor(Math.random() * (P.queue.length - P.idx)); P.queue.splice(at, 0, alt.id); } else P.placed[code] = 'out'; }
    } else P.placed[code] = ok ? 'out' : 'review';
    P.idx++; P.pick = null; save(); pagePlacement();
  };
}
function pickFrom(box, q, r) {
  if (!q.multi) return Number(r.value);
  const v = Array.from(box.querySelectorAll('input[data-pick]:checked')).map(x => x.value).filter(x => x !== 'ns').map(Number).sort(); return v.length ? v.join(',') : null;
}
function finishPlacement() {
  const d = D(), P = d.placement; P.finished = Date.now();
  Object.keys(P.placed).forEach(code => { const t = tp(code); if (P.placed[code] === 'out') { t.testedOut = true; t.plan = null; } else { t.testedOut = false; t.plan = P.placed[code]; } });
  d.mode = 'assess'; save(); location.hash = '#/placed';
}
function pagePlaced() {
  const P = D().placement; if (!P || !P.finished) { location.hash = '#/start'; return; }
  const n = k => Object.values(P.placed).filter(x => x === k).length; const qs = Object.keys(P.answers).length, ok = Object.values(P.answers).filter(Boolean).length;
  const minOf = k => Object.keys(P.placed).filter(c => P.placed[c] === k).reduce((a, c) => a + K().TOP[c].min, 0);
  let h = '<div class="page narrow"><span class="pchip"><span class="pdot"></span>' + esc(K().short) + ' · Placement test · results</span><h1>' + Object.keys(P.placed).length + ' topics placed</h1><p class="muted" style="margin:0">' + qs + ' questions, ' + ok + ' correct. This is a placement result, not exam readiness: readiness comes only from exam-mode mocks.</p>' +
    '<div class="qh-sum3"><section class="card"><div class="label">Skip · tested out</div><span class="big">' + n('out') + '</span><span class="sm muted">topics · about ' + fmtMin(minOf('out')) + ' saved</span></section><section class="card"><div class="label">Review</div><span class="big">' + n('review') + '</span><span class="sm muted">straight to Check yourself</span></section><section class="card"><div class="label">Learn</div><span class="big">' + n('learn') + '</span><span class="sm muted">full lesson · about ' + fmtMin(minOf('learn')) + '</span></section></div>' +
    '<div class="card tw"><table><thead><tr><th>' + esc(K().label) + '</th><th>Skip</th><th>Review</th><th>Learn</th></tr></thead><tbody>' + K().modules.map(m => { const cs = K().topics.filter(t => t.m === m.n && P.placed[t.code]); if (!cs.length) return ''; const c = k => cs.filter(t => P.placed[t.code] === k).length;
      return '<tr><td><span class="mono muted">' + m.n + '</span> ' + esc(m.title) + '<div class="qh-split3"><i class="g" style="width:' + pct(c('out'), cs.length) + '%"></i><i class="a" style="width:' + pct(c('review'), cs.length) + '%"></i><i class="r" style="width:' + pct(c('learn'), cs.length) + '%"></i></div></td><td class="mono">' + c('out') + '</td><td class="mono">' + c('review') + '</td><td class="mono">' + c('learn') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="row qh-rowb"><a class="btn" href="#/placement" data-act="retake">Retake for topics still in Learn or Review</a><a class="btn primary" href="#/plan">Open my study plan</a></div></div>';
  shell('learn', 'learn', h);
  app().querySelector('[data-act="retake"]').onclick = e => { e.preventDefault(); retakePlacement(); };
}
function retakePlacement() {
  const d = D(); const keep = K().topics.filter(t => { const x = d.topics[t.code] || {}; return !x.passed && !x.testedOut; });
  const q = []; keep.forEach(t => { const id = pickQ(t.code, Object.keys((d.placement || {}).answers || {}), true); if (id) q.push(id); }); q.sort(() => Math.random() - 0.5);
  d.placement = { started: Date.now(), finished: null, queue: q, idx: 0, answers: {}, first: {}, placed: {}, total: keep.length, pick: null }; save(); location.hash = '#/placement';
}
function pagePlan() {
  const d = D(); if (!d.placement || !d.placement.finished) { location.hash = d.mode === 'assess' && d.placement ? '#/placement' : '#/start'; return; }
  const L = planLists(K()); const tot = K().topics.length; const p = K().topics.filter(t => (d.topics[t.code] || {}).passed).length, o = L.out.length;
  const planMin = L.learn.reduce((a, t) => a + t.min, 0) + L.review.length * 5, saved = L.out.reduce((a, t) => a + t.min, 0);
  const row = (t, k, first) => '<div class="qh-pi' + (first ? ' cur' : '') + '"><span class="tagp t-' + k + '">' + ({ learn: 'Learn', review: 'Review', out: 'Skip' })[k] + '</span><span><span class="mono sm muted">' + t.code + '</span> ' + esc(t.title) + ((d.topics[t.code] || {}).moved ? '<br><span class="sm muted">Moved back: missed in ' + esc(d.topics[t.code].moved) + '</span>' : '') + '</span><span class="mono sm muted">' + (k === 'out' ? 'skipped' : (k === 'review' ? '~5' : t.min) + ' min') + '</span>' + (first ? '<a class="btn primary sm" href="#/learn/' + t.code + '">Start</a>' : '<a class="sm" href="#/learn/' + t.code + '">' + (k === 'out' ? 'Lesson' : 'Open') + '</a>') + '</div>';
  const moved = K().topics.filter(t => (d.topics[t.code] || {}).moved && (d.topics[t.code] || {}).plan === 'review' && !(d.topics[t.code] || {}).movedSeen);
  let h = '<div class="page narrow"><div class="qh-rowb" style="align-items:flex-end"><div><span class="pchip"><span class="pdot"></span>' + esc(K().short) + ' · Assess first</span><h1>My study plan</h1></div><span class="sm"><a href="#/learn/' + nextTopic() + '">Syllabus view</a> · <a href="#/start/step">Switch to step by step</a></span></div>' +
    '<section class="card qh-pcard"><div class="qh-rowb"><span class="label">Syllabus coverage</span><span class="mono sm">' + p + ' passed · ' + o + ' tested out · ' + (tot - p - o) + ' to go</span></div><div class="qh-split"><i style="width:' + pct(p, tot) + '%"></i><i class="o" style="width:' + pct(o, tot) + '%"></i></div><span class="sm muted">Plan time: about ' + fmtMin(planMin) + ' · saved: about ' + fmtMin(saved) + ' · <a href="#/placement" data-act="retake">Retake placement</a> for topics still in Learn or Review</span></section>' +
    (moved.length ? '<div class="qh-notice">' + moved.length + ' topic' + (moved.length > 1 ? 's' : '') + ' moved back to Review after a mock: ' + moved.map(t => t.code + ' ' + esc(t.title)).join(', ') + '. Their questions are in Weak areas too.</div>' : '');
  [['learn', 'Learn', 'full lesson', L.learn], ['review', 'Review', 'straight to Check yourself', L.review], ['out', 'Skip · tested out', 'reading is optional', L.out]].forEach((g, gi) => {
    h += '<div class="qh-pgrp"><div class="label qh-rowb"><span>' + g[1] + ' · ' + g[3].length + '</span><span>' + g[2] + '</span></div>' + (g[3].length ? g[3].map((t, i) => row(t, g[0], gi === 0 ? i === 0 : (gi === 1 && !L.learn.length && i === 0))).join('') : '<p class="sm muted">None.</p>') + '</div>';
  });
  h += '</div>';
  moved.forEach(t => d.topics[t.code].movedSeen = true); if (moved.length) save();
  shell('learn', 'learn', h);
  app().querySelector('[data-act="retake"]').onclick = e => { e.preventDefault(); retakePlacement(); };
}
function planChip(code) {
  const x = D().topics[code] || {}; if (D().mode !== 'assess' || x.passed) return '';
  if (x.testedOut) return '<span class="tagp t-out">Tested out in placement · reading is optional</span>';
  if (x.plan === 'review') return '<span class="tagp t-review">In your plan · Review</span>';
  if (x.plan === 'learn') return '<span class="tagp t-learn">In your plan · Learn</span>';
  return '';
}
/* Mocks keep the plan current: a tested-out topic answered wrong moves back to Review (§5.1). */
function planAfterMock(res) {
  if (D().mode !== 'assess') return;
  res.qs.forEach(id => { const q = QBY[id]; if (!q || res.answers[id] === q.a || res.answers[id] == null) return; const t = tp(q.code); if (t.testedOut && !t.passed) { t.testedOut = false; t.plan = 'review'; t.moved = res.title + ' on ' + new Date(res.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); t.movedSeen = false; } });
}

/* ================================================================ legacy CTFL Prep progress (ctfl-personal-v1 → lp-v1 courses.ctfl) */
function importCtfl(st) {
  if (!CB.ctfl) return false;
  let o; try { o = JSON.parse(localStorage.getItem('ctfl-personal-v1') || 'null'); } catch (e) { o = null; }
  if (!o || !o.topics) return false;
  const cd = st.c.ctfl || (st.c.ctfl = blankCourse());
  Object.keys(o.topics).forEach(code => { const t = cd.topics[code] || (cd.topics[code] = { answers: [] }); t.understood = t.understood || !!o.topics[code].understood; t.passed = t.passed || !!o.topics[code].passed; });
  (o.answers || []).forEach(a => { const qid = 'ctfl:' + a.qid; const q = QBY[qid]; if (!q) return; const t = cd.topics[q.code] || (cd.topics[q.code] = { answers: [] }); t.answers = t.answers || []; t.answers.push({ q: qid, ok: !!a.ok, t: a.ts || Date.now() }); cd.seen[qid] = Math.max(cd.seen[qid] || 0, a.ts || 0); });
  Object.keys(o.weak || {}).forEach(id => { if (QBY['ctfl:' + id]) cd.weak['ctfl:' + id] = (o.weak[id] || {}).streak || 0; });
  (o.notes || []).forEach(n => { if (!st.nb.some(x => x.id === 'ctfl-' + n.id)) st.nb.push({ id: 'ctfl-' + n.id, course: 'ctfl', code: n.topic, kind: n.kind || 'note', text: n.text, onSheet: !!n.cheat, t: n.ts || Date.now() }); });
  Object.keys(o.cheatAdds || {}).forEach(ch => { cd.adds[ch] = (cd.adds[ch] || []).concat(o.cheatAdds[ch] || []); });
  return true;
}

/* ================================================================ EXTENSIONS (PLATFORM.md §14.2) */
const LOCAL = location.protocol !== 'file:';   /* local-files and server-proxy exist only when served (exe / PWA) */
const hasExt = (id, c) => ((c || K()).extensions || []).indexOf(id) >= 0;
/* --- exam-dates: Pakistan Software Testing Board (pstb.pk). Same source, cache key and parsing as CTFL Prep v1.9. */
const PSTB_KEY = 'ctfl-pstb-dates', PSTB_TTL = 216e5, PSTB_PAGE = 'https://pstb.pk/certifications/Certified%20Tester%20Foundation%20Level%20v4.0';
let pstb = null, pstbLoading = false;
try { pstb = JSON.parse(localStorage.getItem(PSTB_KEY) || 'null'); } catch (e) { pstb = null; }
function pstbParse(list) {
  const t = list.find(e => e.tag === 'CTFL') || list.find(e => /certified tester foundation level/i.test(String(e.name || ''))); if (!t) return null;
  const cities = [];
  Object.keys(t).filter(k => /^examDate/.test(k)).forEach(k => { const city = k.replace(/^examDate/, ''); (Array.isArray(t[k]) ? t[k] : []).forEach(x => { if (x.exam) cities.push({ city, exam: x.exam.slice(0, 10), closing: (x.closing || '').slice(0, 10) }); }); });
  cities.sort((a, b) => a.exam.localeCompare(b.exam) || a.city.localeCompare(b.city));
  return { fee: typeof t.examFee === 'number' ? t.examFee : undefined, cities, pageUrl: PSTB_PAGE };
}
async function pstbLoad(force) {
  if (pstbLoading || (!force && pstb && Date.now() - pstb.fetchedAt < PSTB_TTL)) return;
  pstbLoading = true;
  for (const u of (LOCAL ? ['./pstb-api/certificates'] : []).concat(['https://api.pstb.pk/certificates'])) {
    try { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue; const d = pstbParse(await r.json()); if (!d) continue;
      pstb = Object.assign(d, { fetchedAt: Date.now() }); try { localStorage.setItem(PSTB_KEY, JSON.stringify(pstb)); } catch (e) {} break; } catch (e) {}
  }
  pstbLoading = false; refreshIf(['', 'mocks']);
}
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysTo = s => Math.round((Date.parse(s + 'T00:00:00') - Date.parse(ymd(new Date()) + 'T00:00:00')) / 864e5);
function examDatesCard(c) {
  if (!hasExt('exam-dates', c) || !pstb) return '';   /* capability missing or never reached: hidden (§14.3) */
  const up = (pstb.cities || []).filter(x => x.exam >= ymd(new Date())); if (!up.length) return '';
  const n = up[0], d = daysTo(n.exam); const fmt = s => new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return '<section class="card qh-exam"><div class="label">Next CTFL exam · PSTB</div><span class="qh-examdays">' + (d === 0 ? 'Today' : d + ' day' + (d === 1 ? '' : 's')) + '</span>' +
    '<div class="sm">' + fmt(n.exam) + ' · ' + esc(n.city) + (n.closing ? ' · registration closes ' + fmt(n.closing) : '') + '</div>' +
    (up.length > 1 ? '<div class="sm qh-dim">Also: ' + up.slice(1, 4).map(x => esc(x.city) + ' ' + fmt(x.exam)).join(' · ') + '</div>' : '') +
    '<div class="sm qh-dim">' + (pstb.fee ? 'Fee PKR ' + pstb.fee.toLocaleString() + ' · ' : '') + 'updated ' + new Date(pstb.fetchedAt).toLocaleDateString('en-GB') + ' · <a href="' + PSTB_PAGE + '" target="_blank" rel="noopener">pstb.pk</a></div></section>';
}
/* --- pdf-viewer: the learner's own copy of the official syllabus in the istqb folder next to the app */
let pdfOK = false;
async function pdfCheck() { if (!LOCAL) return; try { const r = await fetch('./istqb/syllabus.pdf', { method: 'HEAD', cache: 'no-store' }); pdfOK = r.ok && /pdf/i.test(r.headers.get('content-type') || 'pdf'); } catch (e) { pdfOK = false; } if (pdfOK) refreshIf(['learn']); }
function refLinks(t) {
  if (!hasExt('pdf-viewer') || !pdfOK) return '';
  return (t.refs || []).filter(r => r.pdfPage).map(r => '<button class="pchip qh-ref" data-pdf="' + r.pdfPage + '-' + (r.pdfPageTo || r.pdfPage) + '" title="Open these pages of your official syllabus">' + esc(r.label) + '</button>').join(' ');
}
/* Official syllabus panel: renders only the topic's pages of the learner's own syllabus.pdf (pdf.js, loaded on first use). */
let pdfDoc = null, pdfLib = null;
async function openPdfPanel(from, to, title) {
  const o = overlay('<aside class="qh-pdf" role="dialog" aria-modal="true" aria-label="Official syllabus"><div class="qh-pdf-h"><div><div class="label">Official syllabus</div><b>' + esc(title) + ' · p. ' + from + (to !== from ? '–' + to : '') + '</b></div><span><a class="sm" href="./istqb/syllabus.pdf#page=' + from + '" target="_blank" rel="noopener">Open full PDF ↗</a> <button class="btn sm" data-close>Close</button></span></div><div class="qh-pdf-b"><p class="muted sm">Loading pages…</p></div></aside>', 'qh-pdfov');
  const box = o.el.querySelector('.qh-pdf-b');
  try {
    if (!pdfLib) { pdfLib = await import('./vendor/pdf.min.mjs'); pdfLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs'; }
    if (!pdfDoc) pdfDoc = await pdfLib.getDocument({ url: './istqb/syllabus.pdf', disableRange: true, disableStream: true }).promise;
    box.innerHTML = '';
    const w = Math.max(320, (box.clientWidth || o.el.querySelector('.qh-pdf').clientWidth || 720) - 40);
    for (let n = from; n <= Math.min(to, pdfDoc.numPages); n++) {
      const pg = await pdfDoc.getPage(n); const v0 = pg.getViewport({ scale: 1 }); const scale = w / v0.width; const dpr = window.devicePixelRatio || 1;
      const vp = pg.getViewport({ scale: scale * dpr }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.width = Math.floor(vp.width / dpr) + 'px';
      const fig = document.createElement('figure'); fig.className = 'qh-pdf-page'; fig.appendChild(cv); const cap = document.createElement('figcaption'); cap.textContent = 'Page ' + n; fig.appendChild(cap); box.appendChild(fig);
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) { console.warn('pdf panel', e && (e.name + ': ' + e.message + ' ' + (e.details || ''))); box.innerHTML = '<p class="sm">The syllabus could not be shown here. <a href="./istqb/syllabus.pdf#page=' + from + '" target="_blank" rel="noopener">Open it in a new tab</a>.</p>'; }
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pdf]'); if (!b) return; e.preventDefault(); const [f, t] = b.getAttribute('data-pdf').split('-').map(Number); const tp0 = K().TOP[(location.hash.match(/\/learn\/([^/]+)$/) || [])[1]]; openPdfPanel(f, t, tp0 ? tp0.code + ' ' + tp0.title : 'Syllabus'); });
/* --- official sample exams: the learner's own questions.json (ISTQB Sample Exams A–D) in the istqb folder */
let officialN = 0;
async function officialLoad() {
  const c = CB.ctfl; if (!c || !hasExt('pdf-viewer', c) || !LOCAL) return;
  let list; try { const r = await fetch('./istqb/questions.json', { cache: 'no-store' }); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
  if (!Array.isArray(list)) return;
  const byLo = {}; c.topics.forEach(t => { if (t.loCode) byLo[t.loCode] = t.code; });
  const qs = list.filter(e => e && ['A', 'B', 'C', 'D'].indexOf(e.set) >= 0 && e.options && Array.isArray(e.correct));
  qs.forEach(e => {
    const keys = Object.keys(e.options); const ans = e.correct.map(k => keys.indexOf(k)).sort(); const multi = ans.length > 1;
    const rat = {}; String(e.explanation || '').split('\n').forEach(l => { const m = l.match(/^\s*([a-e])\)\s*(.*)$/); if (m) rat[m[1]] = m[2].replace(/^(Correct|Incorrect)\s*[.:—–-]?\s*/i, ''); });
    const id = 'ctfl:' + e.id; QBY[id] = { id, course: 'ctfl', code: byLo[e.lo] || c.topics[0].code, kind: 'official', q: String(e.stem).replace(/\s*Select (ONE|TWO) options?\.?\s*$/i, ''), o: keys.map(k => e.options[k]), a: multi ? ans.join(',') : ans[0], r: keys.map(k => rat[k] || ''), multi, k: e.k };
  });
  const off = [];
  ['A', 'B', 'C', 'D'].forEach(set => { const m = qs.filter(e => e.set === set && e.inMainExam).sort((a, b) => Number(a.number) - Number(b.number));
    if (m.length === 40 && !c.fixedTests.some(t => t.id === 'off-' + set)) off.push({ id: 'off-' + set, title: 'ISTQB Sample Exam ' + set, qids: m.map(e => 'ctfl:' + e.id), min: 60, main: true, official: true }); });
  c.fixedTests = off.concat(c.fixedTests);
  officialN = qs.length; refreshIf(['mocks']);
}
function refreshIf(routes) {
  const h = (location.hash || '#/').replace(/^#\/c\/[^/]+\/?/, '#/'); const r = h.slice(2).split('/')[0];
  if (routes.indexOf(r) >= 0 && !D().session) render();
}

/* ================================================================ EXAM-PATTERN RANDOMISER (CTFL Prep rules, PLATFORM.md §19)
   One of the path's blueprints at random; every slot (topic + K-level) draws from a per-topic deck of non-check questions;
   no two questions on the same concept; decks persist so a question does not repeat until its topic's pool is used;
   questions from the previous randomised mock go to the back of a fresh deck. */
function buildPatternMock() {
  const c = K(), d = D(); const bps = c.bpSlots || []; if (!bps.length) return null;
  const bp = bps[Math.floor(Math.random() * bps.length)];
  d.decks = d.decks || {}; d.recent = d.recent || []; d.retired = d.retired || [];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const picked = [], concepts = new Set(); const cOf = id => (QBY[id] && QBY[id].concept) || id;
  bp.slots.forEach(sl => {
    for (let k = 0; k < (sl.count || 1); k++) {
      const pool = c.questions.filter(q => q.code === sl.topic && q.kind !== 'check' && (!sl.level || q.k === sl.level)).map(q => q.id);
      const ok = id => picked.indexOf(id) < 0 && !concepts.has(cOf(id));
      let deck = (d.decks[sl.topic] || []).filter(id => pool.indexOf(id) >= 0);
      if (!deck.some(ok)) { const f = shuffle(pool); deck = deck.concat(f.filter(id => d.recent.indexOf(id) < 0), f.filter(id => d.recent.indexOf(id) >= 0)); }
      const id = deck.find(ok) || pool.find(ok);
      if (id) { picked.push(id); concepts.add(cOf(id)); deck = deck.filter(x => x !== id); }
      d.decks[sl.topic] = deck;
    }
  });
  d.recent = picked.slice();
  return shuffle(picked);
}

/* D22 left nav: chapter headers toggle open; open set survives re-renders */
(function () {
  const open = new Set();
  const key = m => { const s = m.querySelector('.ch>span'); return s ? s.textContent : ''; };
  const apply = () => document.querySelectorAll('.syl-col .syl .mod').forEach(m => { const k = key(m); m.classList.toggle('open', open.has(k)); const c = m.querySelector('.ch'); if (c && !c.hasAttribute('role')) { c.setAttribute('role', 'button'); c.tabIndex = 0; } if (c) c.setAttribute('aria-expanded', String(open.has(k) || !!m.querySelector('a.on'))); });
  const toggle = c => { const m = c.closest('.mod'); if (!m || m.querySelector('a.on')) return; const k = key(m); open.has(k) ? open.delete(k) : open.add(k); apply(); };
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('.syl-col .syl .ch'); if (c) toggle(c); });
  document.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = e.target.closest && e.target.closest('.syl-col .syl .ch'); if (c) { e.preventDefault(); toggle(c); } });
  const start = () => { const a = document.getElementById('app'); if (a) new MutationObserver(apply).observe(a, { childList: true }); apply(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();

/* D24 resizable right pane (desktop): width persists per browser; centre never narrower than 420 px, right pane 280 px or more */
(function () {
  const KEY = 'qap-rightw', MIN = 280, CENTRE = 420, DEF = 330;
  let w = DEF; try { w = Number(localStorage.getItem(KEY)) || DEF; } catch (e) {}
  const grid = () => document.querySelector('main .learn3:not(.no-right)');
  const right = g => g && (g.querySelector(':scope > .nb-col') || g.querySelector(':scope > .qh-right') || g.lastElementChild);
  const clamp = (g, v) => Math.round(Math.max(MIN, Math.min(v, g.clientWidth - 290 - CENTRE)));
  const save = () => { try { localStorage.setItem(KEY, String(w)); } catch (e) {} };
  function place() {
    const g = grid(); if (!g || innerWidth < 1101) return;
    const v = clamp(g, w); if (g.style.getPropertyValue('--rightw') !== v + 'px') g.style.setProperty('--rightw', v + 'px');
    let h = g.querySelector(':scope > .qh-resizer');
    if (!h) {
      h = document.createElement('button'); h.className = 'qh-resizer'; h.type = 'button';
      h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical'); h.setAttribute('aria-label', 'Resize the right panel (arrow keys; double-click to reset)');
      g.appendChild(h);
      h.addEventListener('pointerdown', e => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag'); document.body.classList.add('qh-resizing');
        const gx = g.getBoundingClientRect().right;
        const mv = ev => { w = clamp(g, gx - ev.clientX); place(); };
        const up = () => { h.removeEventListener('pointermove', mv); h.classList.remove('drag'); document.body.classList.remove('qh-resizing'); save(); };
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up, { once: true }); h.addEventListener('pointercancel', up, { once: true });
      });
      h.addEventListener('dblclick', () => { w = DEF; save(); place(); });
      h.addEventListener('keydown', e => { const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0; if (!d) return; e.preventDefault(); w = clamp(g, w + d); save(); place(); });
    }
    const r = right(g); if (r) { const x = r.offsetLeft + 'px'; if (h.style.left !== x) h.style.left = x; }
    h.setAttribute('aria-valuenow', String(clamp(g, w))); h.setAttribute('aria-valuemin', String(MIN)); h.setAttribute('aria-valuemax', String(Math.max(MIN, g.clientWidth - 290 - CENTRE)));
  }
  const go = () => { const a = document.getElementById('app'); if (!a) return; let q = 0; new MutationObserver(() => { if (q) return; q = 1; requestAnimationFrame(() => { q = 0; place(); }); }).observe(a, { childList: true, subtree: true }); addEventListener('resize', place); place(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();

/* ================================================================ QUESTION STEMS (PLATFORM.md §10.1)
   Every question screen (Check yourself, practice, mocks, exams, placement, review, official samples) renders stems here:
   blank line = new paragraph; lines starting i. / 1. / A. (or a) b) …) = one list item per line with a hanging marker.
   Flat imported text ("…: i. x ii. y Which…") is split into the same shape as a fallback. */
const STEM_ITEM = /^(\s*)((?:[ivx]{1,4}|\d{1,2}|[A-Ea-e])[.)]|[-•*])\s+(.*)$/;
function stemUnflatten(s) {
  if (/\n/.test(s)) return s;
  const seqs = [['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'], ['1', '2', '3', '4', '5', '6', '7', '8'], ['A', 'B', 'C', 'D', 'E']];
  for (const seq of seqs) {
    const at = []; let from = 0;
    for (const m of seq) { const re = new RegExp('(^|[\\s:;])' + m + '[.)]\\s', 'g'); re.lastIndex = from; const r = re.exec(s); if (!r) break; at.push(r.index + r[1].length); from = r.index + r[0].length; }
    if (at.length < 2) continue;
    let out = s.slice(0, at[0]).trim(), parts = [];
    at.forEach((p, k) => parts.push(s.slice(p, k + 1 < at.length ? at[k + 1] : s.length).trim()));
    let last = parts.pop(); const q = last.match(/^(.*?[a-z0-9)\]])\s+((?:Which|What|How|Who|Select|Identify|Match)\b.*)$/);
    if (q) { parts.push(q[1]); last = q[2]; } else { parts.push(last); last = ''; }
    return (out ? out + '\n\n' : '') + parts.join('\n') + (last ? '\n\n' + last : '');
  }
  return s;
}
function stemHtml(s) {
  return stemUnflatten(String(s == null ? '' : s)).split(/\n\s*\n/).map(par => {
    const lines = par.split('\n').filter(l => l.trim());
    let h = '', list = [], rows = [];
    const flushL = () => { if (list.length) { h += '<div class="q-list">' + list.map(([ind, m, t]) => '<div class="q-item' + (ind ? ' q-sub' : '') + '"><span class="q-mk">' + esc(/^[-*]$/.test(m) ? '•' : m) + '</span><span>' + inline(t) + '</span></div>').join('') + '</div>'; list = []; } };
    const flushT = () => { if (rows.length) { const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); const body = rows.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(cells);
      h += '<div class="q-tblw"><table class="q-tbl"><thead><tr>' + body[0].map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' + body.slice(1).map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'; rows = []; } };
    lines.forEach(l => {
      if (/^\s*\|/.test(l)) { flushL(); rows.push(l); return; }
      flushT(); const m = l.match(STEM_ITEM);
      if (m) list.push([m[1].length >= 2, m[2], m[3]]); else { flushL(); h += '<p class="q-p">' + inline(l.trim()) + '</p>'; }
    });
    flushL(); flushT(); return h;
  }).join('');
}
function stemLine(s) { return String(s == null ? '' : s).replace(/\s*\n+\s*/g, ' '); }
LP.stemHtml = stemHtml;

/* ================================================================ UPDATE NOTICE (PLATFORM.md §23)
   The served app checks version.json (never cached) on load, on return to the tab and every 2 minutes.
   When the files on disk are newer than the page, a bar offers a one-click reload. */
(function () {
  if (!/^https?:$/.test(location.protocol) || !G.QAP_BUILD) return;
  let shown = false;
  const bar = () => {
    if (shown) return; shown = true;
    const d = document.createElement('div'); d.className = 'qh-update'; d.setAttribute('role', 'status');
    d.innerHTML = '<span><b>QA Pathways was updated.</b> Reload to use the new version — your progress is kept.</span><button class="btn primary sm" data-upd="go">Reload now</button><button class="btn sm" data-upd="later">Later</button>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { const a = e.target.getAttribute('data-upd'); if (a === 'later') { d.remove(); shown = false; later = Date.now(); }
      if (a === 'go') { const go = () => location.reload(); navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration().then(r => r ? r.update().catch(() => {}).then(go) : go(), go) : go(); } });
  };
  let later = 0;
  const check = () => { if (Date.now() - later < 30 * 60000) return;
    fetch('version.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => { if (v && v.build && v.build !== G.QAP_BUILD) bar(); }).catch(() => {}); };
  addEventListener('focus', check); document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(check, 120000); setTimeout(check, 3000);
})();

/* ================================================================ labs-sql: SQL (SQLite in the browser, MySQL-style) and NoSQL
   (MongoDB-style queries via mingo) labs, write-a-query questions, interview corner and interview cards. PLATFORM.md §13.5, §10.2, §12a */
const SQLX = { SQL: null, wait: null, qres: {} };
const sqlData = () => LP.plugins['sql-data'] || { datasets: {}, documents: {}, today: '2026-11-20' };
function sqlEngine() {
  if (SQLX.SQL) return Promise.resolve(SQLX.SQL);
  if (SQLX.wait) return SQLX.wait;
  const boot = () => G.initSqlJs().then(S => (SQLX.SQL = S));
  SQLX.wait = G.initSqlJs ? boot() : new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/sql-wasm-inline.js'; s.onload = () => boot().then(ok, no); s.onerror = () => no(new Error('The SQL engine could not be loaded.')); document.head.appendChild(s); });
  return SQLX.wait;
}
/* MySQL functions SQLite lacks, plus the most common SQL Server / Oracle spellings. The clinic's "today" is fixed so answers never drift. */
function sqlCompat(db) {
  const T = sqlData().today || '2026-11-20', dt = v => String(v == null ? '' : v);
  const f = (n, fn) => { try { db.create_function(n, fn); } catch (e) {} };
  f('NOW', () => T + ' 09:00:00'); f('CURDATE', () => T); f('CURRENT_DATE', () => T); f('GETDATE', () => T + ' 09:00:00'); f('SYSDATETIME', () => T + ' 09:00:00');
  f('YEAR', v => v == null ? null : Number(dt(v).slice(0, 4))); f('MONTH', v => v == null ? null : Number(dt(v).slice(5, 7))); f('DAY', v => v == null ? null : Number(dt(v).slice(8, 10)));
  f('DATEDIFF', (a, b) => a == null || b == null ? null : Math.round((Date.parse(dt(a).slice(0, 10)) - Date.parse(dt(b).slice(0, 10))) / 864e5));
  f('LEFT', (s, n) => s == null ? null : dt(s).slice(0, n)); f('RIGHT', (s, n) => s == null ? null : (n > 0 ? dt(s).slice(-n) : ''));
  f('IF', (c, a, b) => (c ? a : b)); f('LEN', s => s == null ? null : dt(s).length); f('NVL', (a, b) => (a == null ? b : a));
  f('DATE_FORMAT', (d, fm) => d == null ? null : String(fm).replace('%Y', dt(d).slice(0, 4)).replace('%m', dt(d).slice(5, 7)).replace('%d', dt(d).slice(8, 10)));
}
function sqlSplit(src) {   /* statements, keeping ; inside quotes and comments */
  const out = []; let cur = '', q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (!q && c === '-' && n === '-') { const j = src.indexOf('\n', i); const e = j < 0 ? src.length : j; cur += src.slice(i, e); i = e - 1; continue; }
    if (!q && c === '/' && n === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? src.length : j + 2; cur += src.slice(i, e); i = e - 1; continue; }
    if (q) { if (c === q) q = null; } else if (c === "'" || c === '"' || c === '`') q = c;
    if (!q && c === ';' && !(/^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(cur.replace(/^(\s*(--[^\n]*|\/\*[\s\S]*?\*\/))*/, '')) && !/\bEND\s*$/i.test(cur))) { if (cur.trim()) out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim()) out.push(cur);
  return out;
}
function sqlDialect(st) {  /* light rewrite so the common SQL Server / Oracle / MySQL-only forms also run here */
  let s = st, lim = null;
  s = s.replace(/^(\s*SELECT\s+(?:DISTINCT\s+)?)TOP\s*\(?\s*(\d+)\s*\)?\s*/i, (a, p, n) => { lim = n; return p; });
  s = s.replace(/\s+FETCH\s+(?:FIRST|NEXT)\s+(\d+)\s+ROWS?\s+ONLY\s*$/i, (a, n) => { lim = n; return ''; });
  if (lim && !/\bLIMIT\s+\d+\s*$/i.test(s)) s = s.replace(/\s*$/, ' LIMIT ' + lim);
  s = s.replace(/\bINT(?:EGER)?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT').replace(/\bINT(?:EGER)?\s+PRIMARY\s+KEY\s+AUTO_INCREMENT/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\bIDENTITY\s*\(\s*1\s*,\s*1\s*\)/gi, '').replace(/^\s*TRUNCATE\s+TABLE\s+/i, 'DELETE FROM ').replace(/\bISNULL\s*\(/gi, 'IFNULL(').replace(/\bSYSDATE\b/gi, "'" + (sqlData().today || '2026-11-20') + "'")
    .replace(/\bILIKE\b/gi, 'LIKE').replace(/\bSTART\s+TRANSACTION\b/gi, 'BEGIN');
  return s;
}
function sqlFreshDb(ds) {
  const db = new SQLX.SQL.Database(); sqlCompat(db);
  db.run(sqlData().datasets[ds || 'clinic'] || ''); db.run('PRAGMA foreign_keys = ON;');
  return db;
}
function sqlRun(src, ds, db) {      /* -> { sets: [{columns, values}], error, ms, db } ; db kept so a verify query can follow */
  const t0 = performance.now(); db = db || sqlFreshDb(ds); const sets = []; let error = null, changes = 0;
  for (const st of sqlSplit(String(src || ''))) {
    try { const stmt = db.prepare(sqlDialect(st)); const columns = stmt.getColumnNames(); const values = [];
      while (stmt.step()) values.push(stmt.get()); stmt.free();
      if (columns.length) sets.push({ columns, values }); else changes += db.getRowsModified(); }
    catch (e) { error = String(e.message || e).replace(/^Error:\s*/, ''); break; }
  }
  return { sets, error, changes, ms: Math.max(1, Math.round(performance.now() - t0)), db };
}
/* ---- MongoDB-style queries over the document version of the clinic */
function mongoRun(src, ds) {
  const t0 = performance.now(); const base = JSON.parse(JSON.stringify((sqlData().documents || {})[ds || 'clinic'] || {}));
  const M = G.mingo; const fix = p => (p || []).map(st => st.$lookup && typeof st.$lookup.from === 'string' ? { $lookup: Object.assign({}, st.$lookup, { from: base[st.$lookup.from] || [] }) } : st);
  const cursor = arr => { const c = { _a: arr, sort(s) { c._a = M.find(c._a, {}).sort(s).all(); return c; }, limit(n) { c._a = c._a.slice(0, n); return c; }, skip(n) { c._a = c._a.slice(n); return c; },
    count() { return c._a.length; }, toArray() { return c._a; }, pretty() { return c; } }; return c; };
  const coll = name => { const a = base[name] || (base[name] = []); return {
    find: (q, p) => cursor(M.find(a, q || {}, p || undefined).all()), findOne: (q, p) => M.find(a, q || {}, p || undefined).all()[0] || null,
    aggregate: pl => M.aggregate(a, fix(pl)), countDocuments: q => M.find(a, q || {}).all().length, distinct: (f, q) => [...new Set(M.find(a, q || {}).all().map(d => f.split('.').reduce((o, k) => o == null ? o : o[k], d)).filter(v => v !== undefined).map(v => JSON.stringify(v)))].map(v => JSON.parse(v)),
    insertOne: d => { a.push(d); return { acknowledged: true, insertedId: d._id }; }, insertMany: ds => { ds.forEach(d => a.push(d)); return { acknowledged: true, insertedCount: ds.length }; },
    updateOne: (q, u) => M.updateOne(a, q, u), updateMany: (q, u) => M.updateMany(a, q, u),
    deleteOne: q => { const d = M.find(a, q).all()[0]; const i = a.indexOf(d); if (i >= 0) a.splice(i, 1); return { acknowledged: true, deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: q => { const ds = M.find(a, q).all(); ds.forEach(d => a.splice(a.indexOf(d), 1)); return { acknowledged: true, deletedCount: ds.length }; } }; };
  const db = new Proxy({}, { get: (_, n) => n === 'getCollectionNames' ? () => Object.keys(base) : coll(String(n)) });
  const sets = []; let error = null;
  for (const st of sqlSplit(String(src || ''))) {
    const code = st.replace(/\/\/[^\n]*/g, '').trim(); if (!code) continue;
    try { let v = Function('db', '"use strict"; return (' + code + ');')(db); if (v && v._a) v = v._a; sets.push(docsToSet(v)); }
    catch (e) { error = String(e.message || e); break; }
  }
  return { sets, error, ms: Math.max(1, Math.round(performance.now() - t0)), docs: base };
}
function docsToSet(v) {
  if (!Array.isArray(v)) v = v == null ? [] : [typeof v === 'object' ? v : { value: v }];
  const cols = []; v.forEach(d => Object.keys(d && typeof d === 'object' ? d : { value: d }).forEach(k => { if (cols.indexOf(k) < 0) cols.push(k); }));
  cols.sort((x, y) => x === '_id' ? -1 : y === '_id' ? 1 : x < y ? -1 : x > y ? 1 : 0);   /* key order in documents is not meaningful */
  return { columns: cols, values: v.map(d => cols.map(k => { const x = d && typeof d === 'object' ? d[k] : d; return x === undefined ? null : x !== null && typeof x === 'object' ? JSON.stringify(x) : x; })), docs: v };
}
/* ---- result comparison: same rows (order optional), same number of columns (names optional) */
function sqlNorm(set, opts) {
  const rows = (set ? set.values : []).map(r => JSON.stringify(r.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && opts.looseNum ? Math.round(Number(v) * 100) / 100 : v)));
  return opts.order ? rows : rows.slice().sort();
}
function sqlSame(a, b, opts) {
  opts = opts || {};
  if (!a) return { ok: false, why: 'No result set' };
  if (a.columns.length !== b.columns.length) return { ok: false, why: 'Expected ' + b.columns.length + ' column' + (b.columns.length === 1 ? '' : 's') + ', got ' + a.columns.length };
  if (opts.columns === 'names' && a.columns.map(c => c.toLowerCase()).join() !== b.columns.map(c => c.toLowerCase()).join()) return { ok: false, why: 'Column names should be: ' + b.columns.join(', ') };
  if (a.values.length !== b.values.length) return { ok: false, why: 'Expected ' + b.values.length + ' row' + (b.values.length === 1 ? '' : 's') + ', got ' + a.values.length };
  const x = sqlNorm(a, opts), y = sqlNorm(b, opts);
  if (x.join('\n') !== y.join('\n')) return { ok: false, why: opts.order && sqlNorm(a, {}).join() === sqlNorm(b, {}).join() ? 'Right rows, wrong order' : 'Different rows' };
  return { ok: true };
}
const pickSet = (sets, i) => sets[i == null || i < 0 ? sets.length + (i == null ? -1 : i) : i];
const stripSql = s => String(s || '').replace(/--[^\n]*|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
function sqlEvaluate(lab, src) {   /* run learner + solution on fresh copies and apply the lab's declarative checks */
  const P = lab.payload, mongo = P.engine === 'mongo', run = s => mongo ? mongoRun(s, P.dataset) : sqlRun(s, P.dataset);
  const me = run(src), ref = run(P.solution);
  const checks = (lab.spec || []).map(c => {
    const a = (c.args || [])[0] || {}; let ok = false, why = '';
    if (me.error && !P.expectError && c.type !== 'code' && c.type !== 'noCode') return { label: c.label, ok: false, why: 'The query stopped with an error' };
    if (c.type === 'result') { const r = sqlSame(pickSet(me.sets, a.set), pickSet(ref.sets, a.set), a); ok = r.ok; why = r.why || ''; }
    else if (c.type === 'state') { const v = mongo ? null : sqlSame(pickSet(sqlRun(a.query, null, me.db).sets, 0), pickSet(sqlRun(a.query, null, ref.db).sets, 0), a); ok = !!v && v.ok; why = v ? v.why || '' : ''; }
    else if (c.type === 'code') ok = new RegExp(a.re, a.flags).test(a.raw ? String(src || '') : stripSql(src));
    else if (c.type === 'noCode') ok = !new RegExp(a.re, a.flags).test(stripSql(src));
    else if (c.type === 'sets') ok = me.sets.length >= (a.min || 1);
    else if (c.type === 'noError') ok = !me.error;
    return { label: c.label, ok, why };
  });
  return { me, ref, checks, passed: (P.expectError ? !!me.error : !me.error) && checks.every(c => c.ok) };
}
function gridHtml(set, max) {
  if (!set) return '<p class="note">No rows returned.</p>';
  max = max || 200; const v = set.values.slice(0, max);
  return '<div class="rg-wrap"><table class="rgrid"><thead><tr>' + set.columns.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    v.map(r => '<tr>' + r.map(x => x === null ? '<td class="null">NULL</td>' : '<td>' + esc(String(x)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
    '<p class="rmeta">' + set.values.length + ' row' + (set.values.length === 1 ? '' : 's') + (set.values.length > max ? ' · first ' + max + ' shown' : '') + '</p>';
}
const sqlVar = () => { const v = K().variants || []; return (v.find(x => x[0] === D().lang) || v[0] || ['mysql', 'MySQL']); };

/* ---- lab page: schema · brief + editor + results · tasks + checks */
function sqlSchemaHtml(P) {
  if (P.engine === 'mongo') {
    const docs = (sqlData().documents || {})[P.dataset || 'clinic'] || {};
    return '<div class="label">Collections</div>' + Object.keys(docs).map(n => { const keys = []; docs[n].slice(0, 30).forEach(d => Object.keys(d).forEach(k => { if (keys.indexOf(k) < 0) keys.push(k); }));
      return '<div class="tbl"><button class="tblh" data-peek="' + esc(n) + '">' + esc(n) + '<small>' + docs[n].length + ' docs</small></button><ul>' + keys.map(k => '<li>' + esc(k) + '</li>').join('') + '</ul></div>'; }).join('') +
      '<p class="note">Write MongoDB shell syntax, e.g. <code>db.patients.find({ city: "Lahore" })</code>. One query per line, ending with ;</p>';
  }
  const db = sqlFreshDb(P.dataset); let h = '<div class="label">Pocket Clinic database</div>';
  const tabs = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid")[0];
  (tabs ? tabs.values : []).forEach(([t]) => {
    const cols = db.exec('PRAGMA table_info(' + t + ')')[0].values, fks = (db.exec('PRAGMA foreign_key_list(' + t + ')')[0] || { values: [] }).values.map(r => r[3]);
    const n = db.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0];
    h += '<div class="tbl"><button class="tblh" data-peek="' + t + '">' + t + '<small>' + n + ' rows</small></button><ul>' + cols.map(c => '<li>' + (c[5] ? '<span class="pk">PK</span>' : fks.indexOf(c[1]) >= 0 ? '<span class="fk">FK</span>' : '<span class="nk"></span>') + esc(c[1]) + '<i>' + esc(String(c[2]).toLowerCase()) + '</i></li>').join('') + '</ul></div>';
  });
  db.close();
  return h + '<p class="note">Click a table name to preview its rows. Every run starts from a fresh copy of the data. The clinic\'s "today" is ' + esc(sqlData().today) + '.</p>';
}
function pageSqlLab(lab) {
  const st = D().labs[lab.id] || (D().labs[lab.id] = {});
  const P = lab.payload, mongo = P.engine === 'mongo';
  if (typeof st.code !== 'string') st.code = P.starter || '';
  shell('labs', 'labs', '<div class="sqllab"><aside class="sl-schema" aria-label="Database"><p class="note">Loading the SQL engine…</p></aside>' +
    '<section class="sl-mid"><a class="crumb" href="#/labs">‹ Labs</a><div class="label">Lab · ' + esc(lab.topic) + ' ' + esc((K().TOP[lab.topic] || {}).title || '') + '</div><h1>' + esc(lab.title) + '</h1><div class="lead">' + md(lab.brief || '') + '</div>' +
    '<div class="editor"><div class="bar"><span>' + (mongo ? 'query.js · MongoDB' : 'query.sql · ' + esc(sqlVar()[1])) + '</span><span class="sp"></span><button class="btn sm" data-sl="reset">Reset</button><button class="btn primary sm" data-sl="run">▶ Run (Ctrl+Enter)</button></div>' +
    '<textarea class="sqled" id="sqled" spellcheck="false" aria-label="Your query">' + esc(st.code) + '</textarea></div><div class="res" id="slres"></div></section>' +
    '<aside class="sl-side" aria-label="Tasks and checks"><div class="label">Tasks</div><ol class="tasks">' + (lab.tasks || []).map(t => '<li>' + inline(t) + '</li>').join('') + '</ol>' +
    '<div class="label">Checks</div><ul class="chk" id="slchk">' + (lab.spec || []).map(c => '<li><span class="dotq">•</span>' + inline(c.label) + '</li>').join('') + '</ul>' +
    '<p class="note">Checks compare what your query returns with the expected result, so any correct query passes, not one exact wording.</p>' +
    '<div class="row"><button class="btn sm" data-sl="hint">Hint' + ((lab.hints || []).length ? ' (' + Math.min((st.hints || 0) + 1, lab.hints.length) + ' of ' + lab.hints.length + ')' : '') + '</button><button class="btn sm" data-sl="sol">Show solution</button></div><div id="slhint">' + (lab.hints || []).slice(0, st.hints || 0).map(h => '<p class="note">💡 ' + inline(h) + '</p>').join('') + '</div><div id="slsol"></div>' +
    (lab.interview ? '<aside class="trick" style="margin-top:16px"><div class="label">Interview angle</div>' + md(lab.interview) + '</aside>' : '') + '</aside></div>', { cls: 'full' });
  const ed = $('#sqled'), res = $('#slres');
  const show = (r, ev) => {
    let h = '';
    if (r.error) h += '<div class="sl-err"><b>Error</b> ' + esc(r.error) + '</div>';
    const sets = r.sets || []; if (sets.length > 1) h += '<div class="tabs">' + sets.map((s, i) => '<button class="' + (i === sets.length - 1 ? 'on' : '') + '" data-set="' + i + '">Result ' + (i + 1) + '</button>').join('') + '</div>';
    h += sets.length ? gridHtml(sets[sets.length - 1]) : (!r.error ? '<p class="note">' + (r.changes ? r.changes + ' row' + (r.changes === 1 ? '' : 's') + ' changed. ' : '') + 'No result set. Add a SELECT to see rows.</p>' : '');
    h += '<p class="rmeta">' + r.ms + ' ms</p>'; res.innerHTML = h;
    res.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { res.querySelectorAll('[data-set]').forEach(x => x.classList.toggle('on', x === b)); res.querySelector('.rg-wrap') && res.querySelector('.rg-wrap').remove(); res.querySelector('.rmeta') && res.querySelector('.rmeta').remove(); b.parentNode.insertAdjacentHTML('afterend', gridHtml(sets[+b.dataset.set])); });
    if (ev) $('#slchk').innerHTML = ev.checks.map(c => '<li><span class="' + (c.ok ? 'ok">✓' : 'no">✗') + '</span><span>' + inline(c.label) + (c.ok || !c.why ? '' : '<br><small class="muted">' + esc(c.why) + '</small>') + '</span></li>').join('');
  };
  const run = () => { st.code = ed.value; st.attempts = (st.attempts || 0) + 1; res.innerHTML = '<p class="note">Running…</p>';
    sqlEngine().then(() => { const ev = sqlEvaluate(lab, ed.value); show(ev.me, ev); if (ev.passed && !st.solved) { st.solved = true; st.solvedAt = Date.now(); } save(); if (ev.passed) $('#slchk').insertAdjacentHTML('afterend', '<p class="sl-ok">All checks pass — lab solved.</p>'); }, e => { res.innerHTML = '<div class="sl-err">' + esc(e.message) + '</div>'; }); };
  ed.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } if (e.key === 'Tab') { e.preventDefault(); const s = ed.selectionStart; ed.value = ed.value.slice(0, s) + '  ' + ed.value.slice(ed.selectionEnd); ed.selectionStart = ed.selectionEnd = s + 2; } });
  ed.addEventListener('input', () => { st.code = ed.value; clearTimeout(SQLX.t); SQLX.t = setTimeout(save, 600); });
  app().querySelector('.sqllab').addEventListener('click', e => {
    const b = e.target.closest('[data-sl],[data-peek]'); if (!b) return;
    const a = b.getAttribute('data-sl');
    if (a === 'run') run();
    if (a === 'reset') { ed.value = P.starter || ''; st.code = ed.value; save(); res.innerHTML = ''; }
    if (a === 'hint') { st.hints = Math.min((st.hints || 0) + 1, (lab.hints || []).length); save(); $('#slhint').innerHTML = (lab.hints || []).slice(0, st.hints).map(h => '<p class="note">💡 ' + inline(h) + '</p>').join(''); }
    if (a === 'sol') { st.sawSolution = true; save(); $('#slsol').innerHTML = '<div class="label" style="margin-top:12px">Solution</div><pre class="sqlview">' + esc(P.solution) + '</pre><button class="btn sm" data-sl="usesol">Copy into the editor</button>'; }
    if (a === 'usesol') { ed.value = P.solution; st.code = ed.value; save(); }
    const pk = b.getAttribute('data-peek'); if (pk) sqlEngine().then(() => show(mongo ? mongoRun('db.' + pk + '.find().limit(20)', P.dataset) : sqlRun('SELECT * FROM ' + pk + ' LIMIT 20', P.dataset)));
  });
  sqlEngine().then(() => { const s = app().querySelector('.sl-schema'); if (s) s.innerHTML = sqlSchemaHtml(P); }, e => { const s = app().querySelector('.sl-schema'); if (s) s.innerHTML = '<p class="sl-err">' + esc(e.message) + '</p>'; });
}

/* ---- write-a-query questions (practice, mocks, mock interview): marked by comparing result rows with the model answer.
   The stored pick is q.a when the last run matched, -1 otherwise, so the existing scoring code works unchanged. */
function sqlQHtml(q, pick, reveal, name) {
  const s = D().session || {}; const txt = ((s.qtext || {})[q.id]) != null ? s.qtext[q.id] : (q.starter || '');
  const mongo = q.eng === 'mongo';
  return '<div class="q">' + stemHtml(q.q) + '</div><!--/q--><p class="selhint">Write and run your ' + (mongo ? 'MongoDB query' : 'SQL') + '. ' + (reveal ? '' : 'It is marked by comparing your result with the expected rows.') + '</p>' +
    '<div class="editor"><div class="bar"><span>' + (mongo ? 'answer.js · MongoDB' : 'answer.sql · ' + esc(sqlVar()[1])) + '</span><span class="sp"></span>' + (reveal ? '' : '<button class="btn primary sm" data-qrun="' + esc(q.id) + '">▶ Run</button>') + '</div>' +
    '<textarea class="sqled sm" data-qtext="' + esc(q.id) + '" spellcheck="false" aria-label="Your query"' + (reveal ? ' readonly' : '') + '>' + esc(txt) + '</textarea></div>' +
    '<div class="res" data-qres="' + esc(q.id) + '">' + (SQLX.qres[q.id] || '') + '</div>';
}
function sqlQRationale(q, pick) {
  const ok = pick === q.a;
  return '<div class="rationale" aria-live="polite"><div class="rh">' + (ok ? '<span class="ok">Correct — your result matches</span>' : '<span class="bad">' + (pick == null ? 'Not answered' : 'Your result does not match the expected rows') + '</span>') + '</div>' +
    '<div class="label" style="margin-top:8px">Model answer</div><pre class="sqlview">' + esc(q.sol) + '</pre>' + (q.r && q.r[0] ? '<p>' + inline(q.r[0]) + '</p>' : '') + '</div>';
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-qrun]'); if (!b) return;
  const id = b.getAttribute('data-qrun'), q = QBY[id], s = D().session; if (!q || !s) return;
  const ta = document.querySelector('[data-qtext="' + CSS.escape(id) + '"]'), out = document.querySelector('[data-qres="' + CSS.escape(id) + '"]');
  const txt = ta ? ta.value : ''; out.innerHTML = '<p class="note">Running…</p>';
  sqlEngine().then(() => {
    const mongo = q.eng === 'mongo', run = t => mongo ? mongoRun(t, q.ds) : sqlRun(t, q.ds);
    const me = run(txt), ref = run(q.sol);
    const ok = !me.error && sqlSame(pickSet(me.sets), pickSet(ref.sets), { order: !!q.order, columns: q.cols }).ok;
    (s.qtext = s.qtext || {})[id] = txt; s.answers[id] = ok ? q.a : -1; save();
    SQLX.qres[id] = (me.error ? '<div class="sl-err"><b>Error</b> ' + esc(me.error) + '</div>' : gridHtml(pickSet(me.sets), 50)) + '<p class="rmeta">Saved as your answer · ' + (s.mode === 'exam' ? 'marked when you submit' : 'select Check answer to see if it matches') + '</p>';
    if (/^#\/(c\/[^/]+\/)?exam/.test(location.hash)) pageExam(); else out.innerHTML = SQLX.qres[id];
  }, err => { out.innerHTML = '<div class="sl-err">' + esc(err.message) + '</div>'; });
});
document.addEventListener('keydown', e => { const t = e.target; if (t && t.matches && t.matches('textarea[data-qtext]')) { e.stopPropagation(); if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); const b = document.querySelector('[data-qrun="' + CSS.escape(t.getAttribute('data-qtext')) + '"]'); if (b) b.click(); } } }, true);
document.addEventListener('input', e => { const t = e.target; if (t && t.matches && t.matches('textarea[data-qtext]')) { const s = D().session; if (s) (s.qtext = s.qtext || {})[t.getAttribute('data-qtext')] = t.value; } });

/* ================================================================ INTERVIEW: lesson corner + cards (PLATFORM.md §12a) */
const BANDS = [['fresher', 'Fresher', '0–1 yrs'], ['junior', 'Junior', '1–3 yrs'], ['mid', 'Mid', '3–5 yrs'], ['senior', 'Senior', '5–8 yrs'], ['lead', 'Lead', '8–10+ yrs']];
const QTYPES = [['concept', 'Concept'], ['scenario', 'Scenario'], ['hands-on', 'Hands-on'], ['design', 'Design'], ['behavioural', 'Behavioural']];
const bandOf = id => BANDS.find(b => b[0] === id) || BANDS[0];
const bandChip = b => '<span class="bchip b-' + b + '">' + bandOf(b)[1] + ' · ' + bandOf(b)[2] + '</span>';
function interviewCorner(code) {
  const cs = (K().interview || []).filter(c => c.topic === code); if (!cs.length) return '';
  return '<section class="icorner"><div class="row" style="justify-content:space-between;align-items:center"><div class="label">Interview corner</div><a class="link" href="#/cards/t-' + esc(code) + '">Practise as cards ›</a></div>' +
    cs.slice(0, 4).map((c, i) => '<details' + (i === 0 ? ' open' : '') + '><summary><span>' + inline(c.q) + '</span>' + bandChip(c.band) + '</summary><div class="ans">' + md(c.answer) + '</div></details>').join('') + '</section>';
}
function cardsState() { const d = D(); return d.cards || (d.cards = { target: 'junior', rate: {}, typed: {} }); }
function cardKnown(id) { const r = cardsState().rate[id]; return !!r && (r.got || []).length >= 2; }
function pageCards(filter) {
  const all = K().interview || []; if (!all.length) { location.hash = '#/'; return; }
  const cs = cardsState(); const ti = BANDS.findIndex(b => b[0] === cs.target);
  const decks = [['all', 'All cards', all], ['level', 'My level (' + bandOf(cs.target)[1] + ' and below)', all.filter(c => BANDS.findIndex(b => b[0] === c.band) <= ti && BANDS.findIndex(b => b[0] === c.band) >= ti - 1)],
    ['missed', 'Missed (to review)', all.filter(c => (cs.rate[c.id] || {}).last === 'miss')], ['behavioural', 'Behavioural', all.filter(c => c.type === 'behavioural')], ['scenario', 'Scenarios', all.filter(c => c.type === 'scenario')]]
    .concat(K().modules.map(m => ['m' + m.n, m.n + ' · ' + m.title, all.filter(c => c.module === m.n)]).filter(d => d[2].length));
  let key = filter || 'level'; let deck;
  if (/^t-/.test(key)) deck = ['t', 'Topic ' + key.slice(2), all.filter(c => c.topic === key.slice(2))]; else deck = decks.find(d => d[0] === key) || decks[1];
  if (!deck[2].length) deck = decks[0];
  if (!SQLX.cs || SQLX.cs.key !== key || SQLX.cs.n !== deck[2].length) SQLX.cs = { key, n: deck[2].length, order: deck[2].map(c => c.id).sort(() => Math.random() - 0.5), i: 0, shown: false, t0: Date.now(), tally: { got: 0, part: 0, miss: 0 }, times: [] };
  const S2 = SQLX.cs; const c = all.find(x => x.id === S2.order[S2.i]) || deck[2][0];
  const known = all.filter(x => cardKnown(x.id) && BANDS.findIndex(b => b[0] === x.band) <= ti).length, poolN = all.filter(x => BANDS.findIndex(b => b[0] === x.band) <= ti).length;
  const left = '<div class="label" style="padding:4px 10px 8px">Interview cards</div>' + decks.map(d => '<a class="deck' + (d[0] === deck[0] ? ' on' : '') + '" href="#/cards/' + d[0] + '"><span>' + esc(d[1]) + '</span><small>' + d[2].length + '</small></a>').join('') +
    '<div style="padding:16px 10px 4px"><div class="label">My target level</div></div><div class="bandpick">' + BANDS.map(b => '<button class="pill' + (b[0] === cs.target ? ' on' : '') + '" data-band="' + b[0] + '">' + b[1] + ' <small>' + b[2] + '</small></button>').join('') + '</div>';
  const typed = cs.typed[c.id] || '';
  let mid = '<div class="head lh"><div class="lh-top"><div class="lh-ctx"><span class="label">Interview cards · ' + esc(deck[1]) + '</span></div><div class="lh-meta"><span class="badge mono">Card ' + (S2.i + 1) + ' / ' + S2.order.length + '</span></div></div><h1>Say your answer out loud, then check</h1><p class="lo">Or type it. Rate yourself honestly: missed cards come back in the Missed deck.</p></div>' +
    '<div class="fc"><div class="front"><div class="row" style="gap:8px;flex-wrap:wrap">' + bandChip(c.band) + '<span class="tchip">' + esc((QTYPES.find(t => t[0] === c.type) || ['', c.type])[1]) + '</span>' + (c.topic ? '<span class="tchip mono">' + esc(c.topic) + '</span>' : '') + '</div><h2>' + inline(c.q) + '</h2>' +
    (c.type === 'behavioural' ? '<p class="note" style="margin:0 0 8px">Answer with STAR: Situation, Task, Action, Result. Say what <b>you</b> did, and end with a measurable result.</p>' : '') +
    '<textarea class="fc-type" data-cardtext="' + esc(c.id) + '" rows="4" placeholder="Optional: type your answer here. It is saved to your Notebook when you rate the card.">' + esc(typed) + '</textarea>' +
    (S2.shown ? '' : '<div class="row" style="margin-top:10px"><span class="badge mono" id="fctimer">0:00</span><button class="btn primary" data-card="show">Show the model answer</button><button class="btn" data-card="skip">Skip ›</button></div>') + '</div>';
  if (S2.shown) mid += '<div class="back"><h3>Model answer</h3>' + md(c.answer) + (c.code ? '<pre class="sqlview">' + esc(c.code) + '</pre>' : '') +
    (c.points && c.points.length ? '<h3>Key points — tick what you covered</h3><ul class="kp">' + c.points.map((p, i) => '<li><label><input type="checkbox" data-kp="' + i + '"> ' + inline(p) + '</label></li>').join('') + '</ul>' : '') +
    (c.follow ? '<div class="follow"><b>Likely follow-up:</b> ' + inline(c.follow) + '</div>' : '') +
    '<div class="rate"><button class="btn got" data-rate="got">✓ Got it</button><button class="btn part" data-rate="part">~ Partly</button><button class="btn miss" data-rate="miss">✗ Missed</button><span class="note" id="kpsug" style="margin:0"></span></div></div>';
  mid += '</div>';
  const t = S2.tally, avg = S2.times.length ? Math.round(S2.times.reduce((a, b) => a + b, 0) / S2.times.length) : null;
  const right = '<div class="label">This session</div><div class="prog"><i style="width:' + pct(S2.i, S2.order.length) + '%"></i></div><p class="note" style="margin:0 0 6px">' + S2.i + ' of ' + S2.order.length + ' cards</p>' +
    '<ul class="slist"><li><span class="dot" style="background:#1E7A46"></span>Got it<b>' + t.got + '</b></li><li><span class="dot" style="background:#B7791F"></span>Partly<b>' + t.part + '</b></li><li><span class="dot" style="background:#C9372C"></span>Missed<b>' + t.miss + '</b></li><li><span class="dot" style="background:#9AA0AD"></span>Average answer time<b>' + (avg == null ? '—' : avg + ' s') + '</b></li></ul>' +
    '<div class="label" style="margin-top:20px">Interview readiness · ' + esc(bandOf(cs.target)[1]) + '</div><div class="prog"><i style="width:' + pct(known, poolN) + '%"></i></div><p class="note">' + pct(known, poolN) + '% · ' + known + ' of ' + poolN + ' cards up to your level rated "Got it" in two separate sessions</p>';
  shell('cards', 'cards', '<div class="learn3"><aside class="colside syl-col" aria-label="Decks">' + left + '</aside><div class="lesson-col">' + mid + '</div><aside class="colside nb-col" aria-label="Session">' + right + '</aside></div>', { cls: 'full' });
  clearInterval(SQLX.ft); if (!S2.shown) { const t0 = S2.t0 = S2.t0 || Date.now(); SQLX.ft = setInterval(() => { const el = $('#fctimer'); if (!el) return clearInterval(SQLX.ft); el.textContent = clock(Date.now() - t0 + 999); }, 1000); }
  const root = app().querySelector('.learn3');
  root.addEventListener('input', e => { const ta = e.target.closest('[data-cardtext]'); if (ta) { cs.typed[c.id] = ta.value; clearTimeout(SQLX.t); SQLX.t = setTimeout(save, 600); } });
  root.addEventListener('change', e => { if (!e.target.matches('[data-kp]')) return; const n = root.querySelectorAll('[data-kp]').length, k = root.querySelectorAll('[data-kp]:checked').length; const s = k === n ? 'got' : k >= Math.ceil(n / 2) ? 'part' : 'miss'; $('#kpsug').textContent = k + ' of ' + n + ' covered · suggests "' + ({ got: 'Got it', part: 'Partly', miss: 'Missed' })[s] + '"'; });
  root.addEventListener('click', e => {
    const bd = e.target.closest('[data-band]'); if (bd) { cs.target = bd.getAttribute('data-band'); save(); SQLX.cs = null; return pageCards(filter); }
    const b = e.target.closest('[data-card],[data-rate]'); if (!b) return;
    const a = b.getAttribute('data-card'), r = b.getAttribute('data-rate');
    if (a === 'show') { S2.shown = true; S2.times.push(Math.round((Date.now() - S2.t0) / 1000)); return pageCards(filter); }
    if (a === 'skip' || r) {
      if (r) { const x = cs.rate[c.id] || (cs.rate[c.id] = { got: [] }); x.last = r; S2.tally[r]++; const day = new Date().toDateString(); if (r === 'got' && x.got.indexOf(day) < 0) x.got.push(day);
        const txt = (cs.typed[c.id] || '').trim(); if (txt && !S.nb.some(n => n.cardId === c.id && n.text.indexOf(txt) >= 0)) S.nb.push({ id: 'n' + Date.now(), course: K().id, code: c.topic || 'cards', kind: 'note', cardId: c.id, text: 'Interview — ' + stemLine(c.q) + '\nMy answer: ' + txt, onSheet: false, t: Date.now() }); save(); }
      S2.i = (S2.i + 1) % S2.order.length; S2.shown = false; S2.t0 = Date.now(); pageCards(filter);
    }
  });
}

/* SQL / MongoDB highlighting for lesson code blocks (the shared highlighter handles JS, Python, JSON and HTTP) */
function sqlHl(code, lang) {
  code = String(code == null ? '' : code);
  const re = lang === 'mongo' ? /(\/\/.*$)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(\$[A-Za-z]+)|(-?\b\d+(?:\.\d+)?\b)|\b(db|find|findOne|aggregate|countDocuments|distinct|sort|limit|skip|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|true|false|null)\b/gm
    : /(--.*$|\/\*[\s\S]*?\*\/)|('(?:[^'\n]|'')*')|\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|TOP|FETCH|FIRST|ROWS|ONLY|DISTINCT|UNION|ALL|EXCEPT|INTERSECT|CASE|WHEN|THEN|ELSE|END|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|VIEW|INDEX|DROP|ALTER|ADD|TRUNCATE|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|CONSTRAINT|BEGIN|COMMIT|ROLLBACK|TRANSACTION|SAVEPOINT|WITH|RECURSIVE|OVER|PARTITION|EXISTS|BETWEEN|LIKE|ASC|DESC|PROCEDURE|TRIGGER|FUNCTION|RETURNS|EXPLAIN|GRANT|REVOKE)\b|(-?\b\d+(?:\.\d+)?\b)|\b([A-Z_]+)(?=\s*\()/gmi;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    const cls = lang === 'mongo' ? (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'kw' : m[4] ? 'n' : 'pm') : (m[1] ? 'c' : m[2] ? 's' : m[3] ? 'kw' : m[4] ? 'n' : 'pm');
    out += '<span class="t-' + cls + '">' + esc(m[0]) + '</span>'; last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
LP.sql = { evaluate: sqlEvaluate, engine: sqlEngine, run: sqlRun, mongo: mongoRun, same: sqlSame, pick: pickSet };

/* ================================================================ router */
function render() {
  applyTheme();
  if (handle) { try { handle.destroy(); } catch (e) {} handle = null; }
  if (demoOff) { try { demoOff.destroy(); } catch (e) {} demoOff = null; }
  document.onkeydown = null; document.onselectionchange = null; if (hlBtn) { hlBtn.remove(); hlBtn = null; }
  document.querySelectorAll('.ov').forEach(o => o.remove());
  let hs = location.hash || '#/'; const cm = hs.match(/^#\/c\/([^/]+)\/?(.*)$/);
  if (cm && CB[cm[1]]) { if (S.course !== cm[1]) { S.course = cm[1]; save(); } hs = '#/' + cm[2]; }
  pathVars();
  const p = hs.slice(2).split('/');
  const [r, a] = p;
  if (r !== 'exam') { clearInterval(tick); document.body.classList.remove('exam-on'); }
  if (!r) pageHome();
  else if (r === 'start') pageStart(a, p[2]);
  else if (r === 'placement') pagePlacement();
  else if (r === 'placed') pagePlaced();
  else if (r === 'plan') pagePlan();
  else if (r === 'learn') pageLearn(a || nextTopic());
  else if (r === 'labs' && K().labs.length) pageLabs();
  else if (r === 'lab') pageLab(a);
  else if (r === 'cheats') pageCheats(a);
  else if (r === 'cards' && (K().interview || []).length) pageCards(a);
  else if (r === 'mocks') pageMocks();
  else if (r === 'exam') pageExam();
  else if (r === 'results') pageResults(a);
  else if (r === 'sprint') pageSprint();
  else if (r === 'progress') pageProgress();
  else if (r === 'data') pageData();
  else if (r === 'ref' || r === 'api') pageApi();
  else pageHome();
  if (r !== 'exam') { const m = $('#main'); if (m && G.__navd) m.focus({ preventScroll: true }); }
  G.__navd = true; window.scrollTo(0, 0);
}
if (!S.ctflImported) { importCtfl(S); S.ctflImported = true; save(true); }
G.addEventListener('hashchange', render);
setTimeout(() => { if (CB.ctfl && hasExt('exam-dates', CB.ctfl)) pstbLoad(false); if (CB.ctfl && hasExt('pdf-viewer', CB.ctfl)) { pdfCheck(); officialLoad(); } }, 50);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); });
render();
initCloud();
})(window);
