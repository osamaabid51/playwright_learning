/* Postman Path — engine (DOM-free): practice API, variables, pm sandbox, chai subset, JSON schema, runner, lab checks */
(function (G) {
'use strict';
const PM = G.PM = {};
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
PM.clone = clone;

/* ------------------------------------------------------------ status texts */
const STATUS = { 100: 'Continue', 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 409: 'Conflict', 410: 'Gone',
  415: 'Unsupported Media Type', 418: "I'm a teapot", 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };
PM.STATUS = STATUS;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hex(n, len) { let s = ''; let x = n; while (s.length < len) { s += (x & 15).toString(16); x = (x >>> 4) || hash(s + len); } return s; }
function b64(s) { try { return typeof btoa === 'function' ? btoa(s) : Buffer.from(s).toString('base64'); } catch (e) { return ''; } }
function unb64(s) { try { return typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString(); } catch (e) { return ''; } }
PM.b64 = b64;

/* ------------------------------------------------------------ practice API data */
const BUGS = {
  create200: 'POST requests return 200 instead of 201',
  noJson: 'responses are sent as text/plain instead of JSON',
  emailNull: 'user emails come back as null',
  nameTypo: 'the user field "name" is renamed to "nmae"',
  slow: 'every response takes about 1.6 seconds',
  authOpen: 'protected endpoints accept requests without a token',
  notFound200: 'unknown ids return 200 with an empty object',
  validationOff: 'POST /users accepts a body without an email',
  idString: 'ids are returned as strings',
  pageIgnored: 'the page query parameter is ignored',
  priceString: 'book prices are returned as strings',
  deleteNoop: 'DELETE answers 204 but the record is not removed',
  tokenMissing: 'login responses have no token field',
  limitOff: 'rate limiting is switched off',
  wrongTotal: 'order totals ignore the quantity',
  echoDrop: 'the echo endpoint drops custom headers',
  filterOff: 'the role filter on GET /users is ignored',
  stockOff: 'out-of-stock books can still be ordered',
  declineAsPaid: 'a declined payment still marks the order as paid',
  gateway500: 'payment outages return 500 instead of 502',
  chargeWrong: 'the payment service is charged the unit price, not the order total'
};
PM.BUGS = BUGS;

const SEED_USERS = [
  ['Ada Lovelace', 'admin', true], ['Grace Hopper', 'user', true], ['Alan Turing', 'user', true], ['Katherine Johnson', 'viewer', true],
  ['Margaret Hamilton', 'user', true], ['Tim Berners-Lee', 'viewer', false], ['Barbara Liskov', 'user', true], ['Donald Knuth', 'admin', true],
  ['Radia Perlman', 'user', true], ['Ken Thompson', 'user', false], ['Frances Allen', 'viewer', true], ['Edsger Dijkstra', 'user', true]];
const SEED_BOOKS = [
  ['The Pragmatic Tester', 'R. Lane', 'testing', 29.5, 12], ['Contracts Before Code', 'M. Osei', 'testing', 34, 4], ['Night Train to Lisbon', 'P. Mercier', 'fiction', 14.99, 20],
  ['Designing Calm Interfaces', 'S. Varga', 'design', 41, 7], ['The Last Lighthouse', 'E. Morrow', 'fiction', 12.5, 0], ['HTTP in Plain Words', 'J. Ruiz', 'testing', 22, 9],
  ['Paper Cities', 'L. Nakamura', 'fiction', 16, 3], ['Grids and Rhythm', 'A. Brandt', 'design', 27.75, 5]];
const ACCOUNTS = { admin: { password: 'admin123', userId: 1 }, tester: { password: 'test123', userId: 2 } };
const API_KEY = 'PMK-12345';
const tokenFor = u => 'pk_' + u + '_' + hex(hash('pocket:' + u), 12);
PM.API = { API_KEY, ACCOUNTS, tokenFor };

function freshDB(env) {
  const users = SEED_USERS.map((u, i) => ({ id: i + 1, name: u[0], email: u[0].split(' ')[0].toLowerCase() + '@pocket.test', role: u[1], active: u[2], createdAt: '2026-0' + (1 + (i % 9)) + '-1' + (i % 9) + 'T09:00:00Z' }));
  const books = SEED_BOOKS.map((b, i) => ({ id: i + 1, title: b[0], author: b[1], genre: b[2], price: b[3], stock: b[4] }));
  const tokens = {}; Object.keys(ACCOUNTS).forEach(k => tokens[tokenFor(k)] = ACCOUNTS[k].userId);
  return { env, users, books, orders: [{ id: 5001, userId: 2, bookId: 2, quantity: 1, unitPrice: 34, total: 34, status: 'paid' }], tokens, nextUser: 13, nextOrder: 5002, hits: [], paymentUrl: 'https://payments.pocket.test' };
}

/* ------------------------------------------------------------ URL + body helpers */
function parseUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return { error: 'Invalid URL: the URL is empty' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  const m = s.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i);
  if (!m) return { error: 'Invalid URL: ' + raw };
  const query = [];
  (m[4] || '').slice(1).split('&').filter(Boolean).forEach(p => { const i = p.indexOf('='); const k = i < 0 ? p : p.slice(0, i); const v = i < 0 ? '' : p.slice(i + 1); query.push([dec(k), dec(v)]); });
  return { protocol: m[1].toLowerCase(), host: m[2].toLowerCase(), path: m[3] || '/', query, href: s };
}
function dec(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } }
PM.parseUrl = parseUrl;
function qget(q, k) { const f = q.find(p => p[0] === k); return f ? f[1] : undefined; }
function parseForm(s) { const o = {}; String(s || '').split('&').filter(Boolean).forEach(p => { const i = p.indexOf('='); o[dec(i < 0 ? p : p.slice(0, i))] = dec(i < 0 ? '' : p.slice(i + 1)); }); return o; }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------ the server */
class Server {
  constructor(bugs) { this.bugs = new Set(bugs || []); this.dbs = {}; this.examples = []; this.mockCalls = []; this.depth = 0; }
  reset() { this.dbs = {}; this.mockCalls = []; }
  db(host) { return this.dbs[host] || (this.dbs[host] = freshDB(host.split('.')[0])); }
  handle(req) {
    const u = parseUrl(req.url);
    if (u.error) return { error: u.error };
    const host = u.host.replace(/:\d+$/, '');
    if (/\{\{/.test(u.host)) return { error: 'getaddrinfo ENOTFOUND ' + u.host, hint: 'The URL still contains an unresolved variable. Check the variable name and the selected environment.' };
    const known = ['api.pocket.test', 'dev.pocket.test', 'staging.pocket.test', 'mock.test'];
    if (known.indexOf(host) < 0) return { error: 'getaddrinfo ENOTFOUND ' + host, hint: 'Practice hosts: api.pocket.test, dev.pocket.test, staging.pocket.test, mock.test' };
    const headers = {}; Object.keys(req.headers || {}).forEach(k => headers[k.toLowerCase()] = String(req.headers[k]));
    const ctx = { method: (req.method || 'GET').toUpperCase(), path: u.path.replace(/\/+$/, '') || '/', query: u.query, headers, body: req.body == null ? '' : String(req.body), host };
    let out;
    if (host === 'mock.test') out = this.mock(ctx);
    else { try { out = this.route(ctx, this.db(host)); } catch (e) { out = { code: 500, json: { error: 'Internal Server Error', message: e.message } }; } }
    return this.finish(ctx, out);
  }
  finish(ctx, out) {
    const h = Object.assign({}, out.headers || {});
    let body = '';
    if (out.json !== undefined) {
      let j = out.json;
      if (this.bugs.size) j = this.mutate(ctx, j);
      body = JSON.stringify(j);
      if (!h['Content-Type']) h['Content-Type'] = this.bugs.has('noJson') ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8';
    } else if (out.text !== undefined) { body = out.text; if (!h['Content-Type']) h['Content-Type'] = 'text/plain; charset=utf-8'; }
    if (ctx.method === 'HEAD') body = '';
    const base = { 'Date': new Date().toUTCString(), 'Server': 'pocket-api/1.4', 'X-Request-Id': hex(hash(ctx.path + Math.random()), 16) };
    const headers = Object.assign(base, h, { 'Content-Length': String(utf8len(body)) });
    let time = 28 + (hash(ctx.method + ctx.path) % 70) + (out.delay || 0);
    if (this.bugs.has('slow')) time += 1600;
    return { code: out.code, status: STATUS[out.code] || '', headers, body, time, size: utf8len(body) + 180 };
  }
  mutate(ctx, j) {
    const B = this.bugs;
    const walk = (o) => {
      if (Array.isArray(o)) return o.map(walk);
      if (o && typeof o === 'object') {
        const r = {};
        Object.keys(o).forEach(k => {
          let v = walk(o[k]); let key = k;
          if (B.has('emailNull') && k === 'email') v = null;
          if (B.has('nameTypo') && k === 'name') key = 'nmae';
          if (B.has('idString') && k === 'id' && typeof v === 'number') v = String(v);
          if (B.has('priceString') && k === 'price' && typeof v === 'number') v = v.toFixed(2);
          r[key] = v;
        });
        return r;
      }
      return o;
    };
    return walk(j);
  }
  user(ctx, db) {
    const a = ctx.headers['authorization'] || '';
    const m = a.match(/^Bearer\s+(\S+)$/i);
    if (m && db.tokens[m[1]]) return db.users.find(u => u.id === db.tokens[m[1]]) || null;
    return null;
  }
  needAuth(ctx, db) {
    const u = this.user(ctx, db);
    if (u) return { u };
    if (this.bugs.has('authOpen')) return { u: db.users[1] };
    const a = ctx.headers['authorization'];
    return { fail: { code: 401, headers: { 'WWW-Authenticate': 'Bearer realm="pocket"' }, json: { error: 'Unauthorized', message: a ? 'The access token is invalid or expired' : 'Missing Authorization header. Send: Authorization: Bearer <token>' } } };
  }
  jsonBody(ctx) {
    const ct = ctx.headers['content-type'] || '';
    if (!/json/i.test(ct)) return { fail: { code: 415, json: { error: 'Unsupported Media Type', message: 'Send the body as JSON with Content-Type: application/json' } } };
    if (!ctx.body.trim()) return { fail: { code: 400, json: { error: 'Bad Request', message: 'Request body is empty' } } };
    try { const b = JSON.parse(ctx.body); if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('x'); return { b }; }
    catch (e) { return { fail: { code: 400, json: { error: 'Bad Request', message: 'Malformed JSON in request body' } } }; }
  }
  created(code) { return this.bugs.has('create200') ? 200 : code; }
  route(ctx, db) {
    const { method, path, query } = ctx;
    const seg = path.split('/').filter(Boolean);
    const nf = (msg) => ({ code: 404, json: { error: 'Not Found', message: msg } });
    const notAllowed = (allow) => ({ code: 405, headers: { Allow: allow }, json: { error: 'Method Not Allowed', message: method + ' is not supported on ' + path + '. Allowed: ' + allow } });
    const idOf = s => /^\d+$/.test(s) ? Number(s) : NaN;
    const badId = s => ({ code: 400, json: { error: 'Bad Request', message: 'id must be a number, got "' + s + '"' } });
    if (method === 'OPTIONS') return { code: 204, headers: { Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' } };

    if (path === '/' ) return { code: 200, json: { name: 'Pocket API', version: '1.4.2', docs: 'Open "API reference" in the app', resources: ['/users', '/books', '/orders', '/auth/login', '/echo', '/status/:code'] } };
    if (seg[0] === 'health') return method === 'GET' || method === 'HEAD' ? { code: 200, json: { status: 'ok', env: db.env, version: '1.4.2' } } : notAllowed('GET, HEAD');

    if (seg[0] === 'echo') {
      const hs = Object.assign({}, ctx.headers);
      if (this.bugs.has('echoDrop')) Object.keys(hs).forEach(k => { if (/^x-/.test(k)) delete hs[k]; });
      let body = null; const ct = ctx.headers['content-type'] || '';
      if (ctx.body) { if (/json/.test(ct)) { try { body = JSON.parse(ctx.body); } catch (e) { body = ctx.body; } } else if (/x-www-form-urlencoded/.test(ct)) body = parseForm(ctx.body); else body = ctx.body; }
      const q = {}; query.forEach(p => q[p[0]] = p[1]);
      return { code: 200, json: { method, path, query: q, headers: hs, contentType: ct || null, body } };
    }

    if (seg[0] === 'status' && seg[1]) {
      const c = Number(seg[1]);
      if (!STATUS[c] || c < 200) return { code: 400, json: { error: 'Bad Request', message: 'Unsupported status code ' + seg[1] } };
      if (c === 204) return { code: 204 };
      return { code: c, json: { code: c, message: STATUS[c] } };
    }

    if (seg[0] === 'slow') {
      const ms = Math.min(5000, Math.max(0, Number(qget(query, 'ms')) || 1500));
      return { code: 200, delay: ms, json: { waited: ms } };
    }

    if (seg[0] === 'limited') {
      const now = Date.now(); db.hits = db.hits.filter(t => now - t < 30000); db.hits.push(now);
      const used = db.hits.length; const rem = Math.max(0, 3 - used);
      const hdr = { 'X-RateLimit-Limit': '3', 'X-RateLimit-Remaining': String(rem) };
      if (used > 3 && !this.bugs.has('limitOff')) return { code: 429, headers: Object.assign(hdr, { 'Retry-After': '30' }), json: { error: 'Too Many Requests', message: 'Limit is 3 requests per 30 seconds' } };
      return { code: 200, headers: hdr, json: { ok: true, call: used } };
    }

    if (seg[0] === 'auth') {
      if (seg[1] === 'login') {
        if (method !== 'POST') return notAllowed('POST');
        const r = this.jsonBody(ctx); if (r.fail) return r.fail;
        const { username, password } = r.b;
        if (!username || !password) return { code: 400, json: { error: 'Bad Request', message: 'username and password are required' } };
        const acc = ACCOUNTS[username];
        if (!acc || acc.password !== password) return { code: 401, json: { error: 'Unauthorized', message: 'Invalid username or password' } };
        const u = db.users.find(x => x.id === acc.userId);
        const out = { token: tokenFor(username), tokenType: 'Bearer', expiresIn: 3600, user: { id: u.id, name: u.name, role: u.role } };
        if (this.bugs.has('tokenMissing')) delete out.token;
        return { code: 200, json: out };
      }
      if (seg[1] === 'me') {
        if (method !== 'GET') return notAllowed('GET');
        const a = this.needAuth(ctx, db); if (a.fail) return a.fail;
        return { code: 200, json: a.u };
      }
      return nf('Cannot ' + method + ' ' + path);
    }

    if (seg[0] === 'config' && seg[1] === 'payment' && !seg[2]) {
      if (method === 'GET') return { code: 200, json: { url: db.paymentUrl } };
      if (method !== 'PUT') return notAllowed('GET, PUT');
      const a = this.needAuth(ctx, db); if (a.fail) return a.fail;
      if (a.u.role !== 'admin') return { code: 403, json: { error: 'Forbidden', message: 'Only admins can change service configuration' } };
      const r = this.jsonBody(ctx); if (r.fail) return r.fail;
      if (typeof r.b.url !== 'string' || !/^https?:\/\/\S+$/.test(r.b.url)) return { code: 400, json: { error: 'Bad Request', message: 'url must be an http(s) URL' } };
      db.paymentUrl = r.b.url.replace(/\/+$/, '');
      return { code: 200, json: { url: db.paymentUrl } };
    }

    if (seg[0] === 'reports') {
      const key = ctx.headers['x-api-key'] || qget(query, 'api_key');
      if (key !== API_KEY) return { code: 401, json: { error: 'Unauthorized', message: key ? 'API key is not valid' : 'Missing API key. Send it in the x-api-key header' } };
      const revenue = db.orders.reduce((s, o) => s + o.total, 0);
      return { code: 200, json: { orders: db.orders.length, revenue: Math.round(revenue * 100) / 100, currency: 'EUR' } };
    }

    if (seg[0] === 'basic') {
      const a = ctx.headers['authorization'] || '';
      const m = a.match(/^Basic\s+(\S+)$/i);
      const pair = m ? unb64(m[1]) : '';
      if (pair !== 'admin:admin123') return { code: 401, headers: { 'WWW-Authenticate': 'Basic realm="pocket-admin"' }, json: { error: 'Unauthorized', message: m ? 'Wrong username or password' : 'Basic credentials required' } };
      return { code: 200, json: { authenticated: true, user: 'admin', scheme: 'Basic' } };
    }

    if (seg[0] === 'users') {
      if (!seg[1]) {
        if (method === 'GET') {
          let list = db.users.slice();
          const role = qget(query, 'role'); if (role && !this.bugs.has('filterOff')) list = list.filter(u => u.role === role);
          const active = qget(query, 'active'); if (active === 'true' || active === 'false') list = list.filter(u => String(u.active) === active);
          const q = qget(query, 'q'); if (q) list = list.filter(u => u.name.toLowerCase().indexOf(q.toLowerCase()) >= 0);
          const sort = qget(query, 'sort');
          if (sort) { const desc = sort[0] === '-'; const f = sort.replace(/^-/, ''); if (['id', 'name', 'email'].indexOf(f) < 0) return { code: 400, json: { error: 'Bad Request', message: 'sort must be one of id, name, email (prefix - for descending)' } }; list.sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (desc ? -1 : 1)); }
          const pRaw = qget(query, 'page'), lRaw = qget(query, 'limit');
          let page = pRaw === undefined ? 1 : Number(pRaw), limit = lRaw === undefined ? 5 : Number(lRaw);
          if (!Number.isInteger(page) || page < 1) return { code: 400, json: { error: 'Bad Request', message: 'page must be a positive integer' } };
          if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { code: 400, json: { error: 'Bad Request', message: 'limit must be an integer from 1 to 50' } };
          if (this.bugs.has('pageIgnored')) page = 1;
          const total = list.length; const totalPages = Math.max(1, Math.ceil(total / limit));
          return { code: 200, headers: { 'X-Total-Count': String(total) }, json: { page, limit, total, totalPages, data: list.slice((page - 1) * limit, page * limit) } };
        }
        if (method === 'POST') {
          const a = this.needAuth(ctx, db); if (a.fail) return a.fail;
          const r = this.jsonBody(ctx); if (r.fail) return r.fail;
          const b = r.b; const details = [];
          if (typeof b.name !== 'string' || b.name.trim().length < 2) details.push({ field: 'name', message: 'name is required (2–50 characters)' });
          else if (b.name.length > 50) details.push({ field: 'name', message: 'name must be at most 50 characters' });
          if (!this.bugs.has('validationOff')) { if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email)) details.push({ field: 'email', message: 'email must be a valid address' }); }
          if (b.role !== undefined && ['user', 'admin', 'viewer'].indexOf(b.role) < 0) details.push({ field: 'role', message: 'role must be user, admin or viewer' });
          if (details.length) return { code: 400, json: { error: 'Validation failed', details } };
          if (b.email && db.users.some(u => u.email.toLowerCase() === b.email.toLowerCase())) return { code: 409, json: { error: 'Conflict', message: 'A user with email ' + b.email + ' already exists' } };
          const u = { id: db.nextUser++, name: b.name.trim(), email: b.email || null, role: b.role || 'user', active: true, createdAt: new Date().toISOString() };
          db.users.push(u);
          return { code: this.created(201), headers: { Location: '/users/' + u.id }, json: u };
        }
        return notAllowed('GET, POST');
      }
      const id = idOf(seg[1]); if (isNaN(id)) return badId(seg[1]);
      if (seg[2]) return nf('Cannot ' + method + ' ' + path);
      const idx = db.users.findIndex(u => u.id === id);
      const missing = () => this.bugs.has('notFound200') ? { code: 200, json: {} } : nf('User ' + id + ' not found');
      if (method === 'GET' || method === 'HEAD') return idx < 0 ? missing() : { code: 200, json: db.users[idx] };
      if (['PUT', 'PATCH', 'DELETE'].indexOf(method) < 0) return notAllowed('GET, PUT, PATCH, DELETE');
      const a = this.needAuth(ctx, db); if (a.fail) return a.fail;
      if (method === 'DELETE') {
        if (a.u.role !== 'admin') return { code: 403, json: { error: 'Forbidden', message: 'Only admins can delete users' } };
        if (idx < 0) return missing();
        if (!this.bugs.has('deleteNoop')) db.users.splice(idx, 1);
        return { code: 204 };
      }
      if (idx < 0) return missing();
      const r = this.jsonBody(ctx); if (r.fail) return r.fail;
      const b = r.b; const cur = db.users[idx];
      if (method === 'PUT') {
        const miss = ['name', 'email', 'role'].filter(k => b[k] === undefined);
        if (miss.length) return { code: 400, json: { error: 'Bad Request', message: 'PUT replaces the whole user. Missing: ' + miss.join(', ') } };
      }
      const details = [];
      if (b.name !== undefined && (typeof b.name !== 'string' || b.name.trim().length < 2)) details.push({ field: 'name', message: 'name is required (2–50 characters)' });
      if (b.email !== undefined && (typeof b.email !== 'string' || !EMAIL_RE.test(b.email))) details.push({ field: 'email', message: 'email must be a valid address' });
      if (b.role !== undefined && ['user', 'admin', 'viewer'].indexOf(b.role) < 0) details.push({ field: 'role', message: 'role must be user, admin or viewer' });
      if (details.length) return { code: 400, json: { error: 'Validation failed', details } };
      ['name', 'email', 'role', 'active'].forEach(k => { if (b[k] !== undefined) cur[k] = b[k]; });
      cur.updatedAt = new Date().toISOString();
      return { code: 200, json: cur };
    }

    if (seg[0] === 'books') {
      if (!seg[1]) {
        if (method !== 'GET') return notAllowed('GET');
        let list = db.books.slice();
        const g = qget(query, 'genre'); if (g) list = list.filter(b => b.genre === g);
        const mp = qget(query, 'maxPrice'); if (mp !== undefined) { if (isNaN(Number(mp))) return { code: 400, json: { error: 'Bad Request', message: 'maxPrice must be a number' } }; list = list.filter(b => b.price <= Number(mp)); }
        const inStock = qget(query, 'inStock'); if (inStock === 'true') list = list.filter(b => b.stock > 0);
        const sort = qget(query, 'sort');
        if (sort) { const desc = sort[0] === '-'; const f = sort.replace(/^-/, ''); if (['price', 'title', 'id'].indexOf(f) < 0) return { code: 400, json: { error: 'Bad Request', message: 'sort must be price, title or id' } }; list.sort((a, b) => (a[f] > b[f] ? 1 : a[f] < b[f] ? -1 : 0) * (desc ? -1 : 1)); }
        return { code: 200, headers: { 'Cache-Control': 'public, max-age=60' }, json: list };
      }
      const id = idOf(seg[1]); if (isNaN(id)) return badId(seg[1]);
      if (method !== 'GET') return notAllowed('GET');
      const b = db.books.find(x => x.id === id);
      return b ? { code: 200, json: b } : (this.bugs.has('notFound200') ? { code: 200, json: {} } : nf('Book ' + id + ' not found'));
    }

    if (seg[0] === 'orders') {
      const a = this.needAuth(ctx, db); if (a.fail) return a.fail;
      if (!seg[1]) {
        if (method === 'GET') return { code: 200, json: db.orders.filter(o => a.u.role === 'admin' || o.userId === a.u.id) };
        if (method !== 'POST') return notAllowed('GET, POST');
        const r = this.jsonBody(ctx); if (r.fail) return r.fail;
        const { bookId, quantity } = r.b; const details = [];
        if (!Number.isInteger(bookId)) details.push({ field: 'bookId', message: 'bookId must be an integer' });
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) details.push({ field: 'quantity', message: 'quantity must be an integer from 1 to 10' });
        if (details.length) return { code: 400, json: { error: 'Validation failed', details } };
        const book = db.books.find(x => x.id === bookId);
        if (!book) return { code: 422, json: { error: 'Unprocessable Entity', message: 'Book ' + bookId + ' does not exist' } };
        if (book.stock < quantity && !this.bugs.has('stockOff')) return { code: 422, json: { error: 'Unprocessable Entity', message: 'Only ' + book.stock + ' left in stock' } };
        book.stock = Math.max(0, book.stock - quantity);
        const total = this.bugs.has('wrongTotal') ? book.price : Math.round(book.price * quantity * 100) / 100;
        const o = { id: db.nextOrder++, userId: a.u.id, bookId, quantity, unitPrice: book.price, total, status: 'pending' };
        db.orders.push(o);
        return { code: this.created(201), headers: { Location: '/orders/' + o.id }, json: o };
      }
      const id = idOf(seg[1]); if (isNaN(id)) return badId(seg[1]);
      const o = db.orders.find(x => x.id === id);
      if (!o) return nf('Order ' + id + ' not found');
      if (o.userId !== a.u.id && a.u.role !== 'admin') return { code: 403, json: { error: 'Forbidden', message: 'This order belongs to another user' } };
      if (seg[2] === 'pay') {
        if (method !== 'POST') return notAllowed('POST');
        if (o.status === 'paid') return { code: 409, json: { error: 'Conflict', message: 'Order is already paid' } };
        const fwd = { 'Content-Type': 'application/json' };
        ['x-mock-response-name', 'x-mock-response-code'].forEach(h => { if (ctx.headers[h]) fwd[h] = ctx.headers[h]; });
        const fail = (msg, t) => ({ code: this.bugs.has('gateway500') ? 500 : 502, delay: t || 0, json: { error: this.bugs.has('gateway500') ? 'Internal Server Error' : 'Bad Gateway', message: msg, orderStatus: o.status } });
        if (this.depth > 2) return fail('Payment service call loop detected');
        this.depth++; let r;
        try { r = this.handle({ method: 'POST', url: db.paymentUrl + '/charge', headers: fwd, body: JSON.stringify({ orderId: o.id, amount: this.bugs.has('chargeWrong') ? o.unitPrice : o.total, currency: 'EUR' }) }); } finally { this.depth--; }
        if (r.error) return fail('Payment service unreachable at ' + db.paymentUrl + ' (' + r.error + ')');
        let pj = null; try { pj = JSON.parse(r.body); } catch (e) {}
        if (r.code >= 500) return fail('Payment service answered ' + r.code, r.time);
        const declined = r.code === 402 || (pj && pj.status === 'declined');
        if (declined && !this.bugs.has('declineAsPaid')) return { code: 402, delay: r.time, json: { error: 'Payment Required', message: 'Payment declined', reason: (pj && pj.reason) || 'declined', orderStatus: o.status } };
        if (r.code >= 400 && !declined) return fail('Payment service rejected the charge with ' + r.code, r.time);
        o.status = 'paid'; o.transactionId = (pj && pj.transactionId) || null;
        return { code: 200, delay: r.time, json: o };
      }
      if (method === 'GET') return { code: 200, json: o };
      if (method === 'DELETE') { if (o.status === 'paid') return { code: 409, json: { error: 'Conflict', message: 'Paid orders cannot be cancelled' } }; o.status = 'cancelled'; return { code: 200, json: o }; }
      return notAllowed('GET, DELETE');
    }
    return nf('Cannot ' + method + ' ' + path);
  }
  mock(ctx) {
    if (ctx.path === '/__calls') {
      if (ctx.method === 'DELETE') { this.mockCalls = []; return { code: 204 }; }
      return { code: 200, json: { calls: this.mockCalls.slice() } };
    }
    let rb = ctx.body; try { rb = ctx.body ? JSON.parse(ctx.body) : null; } catch (e) {}
    this.mockCalls.push({ method: ctx.method, path: ctx.path, body: rb, scenario: ctx.headers['x-mock-response-name'] || null });
    const cands = this.examples.filter(e => e.method === ctx.method && (e.path.replace(/\/+$/, '') || '/') === ctx.path);
    let ex = cands[0];
    const want = ctx.headers['x-mock-response-name'];
    if (want) ex = cands.find(e => e.name === want) || ex;
    const wantCode = ctx.headers['x-mock-response-code'];
    if (wantCode) ex = cands.find(e => String(e.code) === wantCode) || ex;
    if (!ex) return { code: 404, json: { error: { name: 'mockRequestNotFoundError', message: 'Double check your method and the request path and try again. No example matches ' + ctx.method + ' ' + ctx.path + '.' } } };
    const h = Object.assign({ 'x-mock-example': ex.name }, ex.headers || {});
    let parsed; try { parsed = JSON.parse(ex.body); } catch (e) { parsed = undefined; }
    return parsed !== undefined ? { code: ex.code, headers: h, json: parsed } : { code: ex.code, headers: h, text: ex.body || '' };
  }
}
function utf8len(s) { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 128 ? 1 : c < 2048 ? 2 : 3; } return n; }
PM.Server = Server;

/* ------------------------------------------------------------ variables */
const FIRST = ['Mila', 'Noah', 'Ines', 'Omar', 'Lena', 'Kofi', 'Aiko', 'Ravi', 'Sara', 'Tomas'];
const LAST = ['Okafor', 'Berg', 'Silva', 'Kowalski', 'Haddad', 'Moreau', 'Tanaka', 'Novak'];
const CITIES = ['Lisbon', 'Accra', 'Oslo', 'Lahore', 'Quito', 'Osaka', 'Tallinn'];
const pick = a => a[Math.floor(Math.random() * a.length)];
function uuid() { const h = '0123456789abcdef'; let s = ''; for (let i = 0; i < 36; i++) s += [8, 13, 18, 23].indexOf(i) >= 0 ? '-' : i === 14 ? '4' : h[Math.floor(Math.random() * 16)]; return s; }
const DYN = {
  $guid: uuid, $randomUUID: uuid, $timestamp: () => String(Math.floor(Date.now() / 1000)), $isoTimestamp: () => new Date().toISOString(),
  $randomInt: () => String(Math.floor(Math.random() * 1001)), $randomEmail: () => pick(FIRST).toLowerCase() + '.' + pick(LAST).toLowerCase() + Math.floor(Math.random() * 1000) + '@example.com',
  $randomFirstName: () => pick(FIRST), $randomLastName: () => pick(LAST), $randomFullName: () => pick(FIRST) + ' ' + pick(LAST),
  $randomAlphaNumeric: () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)], $randomBoolean: () => String(Math.random() < 0.5),
  $randomPrice: () => (Math.random() * 1000).toFixed(2), $randomCity: () => pick(CITIES), $randomColor: () => pick(['red', 'green', 'blue', 'teal', 'amber'])
};
PM.DYN = Object.keys(DYN);

class VarScope {
  constructor(name, list) { this.name = name; this.values = {}; (list || []).forEach(v => { if (v && v.key && v.enabled !== false) this.values[v.key] = v.value; }); }
  get(k) { return Object.prototype.hasOwnProperty.call(this.values, k) ? this.values[k] : undefined; }
  set(k, v) { if (k === undefined || k === null || k === '') throw new TypeError('Variable name is required'); this.values[String(k)] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v === undefined ? undefined : (typeof v === 'string' ? v : String(v)); }
  unset(k) { delete this.values[k]; }
  has(k) { return Object.prototype.hasOwnProperty.call(this.values, k); }
  clear() { this.values = {}; }
  toObject() { return Object.assign({}, this.values); }
  toList() { return Object.keys(this.values).map(k => ({ key: k, value: this.values[k] == null ? '' : String(this.values[k]), enabled: true })); }
}
PM.VarScope = VarScope;

function makeResolver(sc) {
  const order = ['local', 'data', 'env', 'coll', 'glob'];
  const lookup = (name) => {
    if (name[0] === '$') return DYN[name] ? { v: DYN[name]() } : null;
    for (const s of order) { const scope = sc[s]; if (scope && scope.has(name)) return { v: scope.get(name), scope: s }; }
    return null;
  };
  const resolve = (str, missing) => {
    if (typeof str !== 'string') return str;
    let s = str;
    for (let pass = 0; pass < 4 && /\{\{[^{}]+\}\}/.test(s); pass++) {
      s = s.replace(/\{\{([^{}]+)\}\}/g, (m, n) => { const r = lookup(n.trim()); if (!r) { if (missing && missing.indexOf(n.trim()) < 0) missing.push(n.trim()); return m; } return r.v == null ? '' : String(r.v); });
    }
    return s;
  };
  return { resolve, lookup };
}
PM.makeResolver = makeResolver;

/* ------------------------------------------------------------ formatting */
function fmt(v) {
  if (typeof v === 'string') return "'" + (v.length > 80 ? v.slice(0, 77) + '…' : v) + "'";
  if (v === undefined) return 'undefined';
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  if (typeof v === 'function') return '[Function]';
  try { const s = JSON.stringify(v); if (Array.isArray(v)) return s.length > 80 ? '[ Array(' + v.length + ') ]' : s.replace(/,/g, ', '); return s.length > 80 ? '{ Object (' + Object.keys(v).slice(0, 4).join(', ') + (Object.keys(v).length > 4 ? ', …' : '') + ') }' : s.replace(/,"/g, ', "'); } catch (e) { return String(v); }
}
PM.fmt = fmt;
function typeOf(v) { if (v === null) return 'null'; if (Array.isArray(v)) return 'array'; return typeof v; }
function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
  return ka.every(k => deepEq(a[k], b[k]));
}
PM.deepEq = deepEq;
function getPath(o, path) {
  const parts = String(path).replace(/\[(\w+)\]/g, '.$1').split('.').filter(p => p !== '');
  let cur = o;
  for (const p of parts) { if (cur == null || !(typeof cur === 'object') || !(p in cur)) return { found: false }; cur = cur[p]; }
  return { found: true, value: cur };
}

class AssertionError extends Error { constructor(m) { super(m); this.name = 'AssertionError'; } }
PM.AssertionError = AssertionError;

/* ------------------------------------------------------------ JSON schema subset */
function validateSchema(data, schema, path, errs) {
  path = path || 'data'; errs = errs || [];
  if (!schema || typeof schema !== 'object') return errs;
  const t = typeOf(data);
  if (schema.type) {
    const types = [].concat(schema.type);
    const ok = types.some(x => x === t || (x === 'integer' && t === 'number' && Number.isInteger(data)) || (x === 'number' && t === 'number'));
    if (!ok) { errs.push(path + ' must be ' + types.join(' or ') + ' (got ' + t + ')'); return errs; }
  }
  if (schema.enum && !schema.enum.some(e => deepEq(e, data))) errs.push(path + ' must be one of ' + JSON.stringify(schema.enum));
  if ('const' in schema && !deepEq(schema.const, data)) errs.push(path + ' must equal ' + JSON.stringify(schema.const));
  if (t === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errs.push(path + ' must be >= ' + schema.minimum);
    if (schema.maximum !== undefined && data > schema.maximum) errs.push(path + ' must be <= ' + schema.maximum);
    if (schema.exclusiveMinimum !== undefined && data <= schema.exclusiveMinimum) errs.push(path + ' must be > ' + schema.exclusiveMinimum);
  }
  if (t === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) errs.push(path + ' must have at least ' + schema.minLength + ' characters');
    if (schema.maxLength !== undefined && data.length > schema.maxLength) errs.push(path + ' must have at most ' + schema.maxLength + ' characters');
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) errs.push(path + ' must match pattern "' + schema.pattern + '"');
    if (schema.format === 'email' && !EMAIL_RE.test(data)) errs.push(path + ' must match format "email"');
    if (schema.format === 'date-time' && isNaN(Date.parse(data))) errs.push(path + ' must match format "date-time"');
    if (schema.format === 'uri' && !/^[a-z]+:\/\//i.test(data)) errs.push(path + ' must match format "uri"');
  }
  if (t === 'array') {
    if (schema.minItems !== undefined && data.length < schema.minItems) errs.push(path + ' must have at least ' + schema.minItems + ' items');
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errs.push(path + ' must have at most ' + schema.maxItems + ' items');
    if (schema.uniqueItems && data.some((x, i) => data.findIndex(y => deepEq(x, y)) !== i)) errs.push(path + ' must not contain duplicate items');
    if (schema.items) data.forEach((x, i) => validateSchema(x, schema.items, path + '[' + i + ']', errs));
  }
  if (t === 'object') {
    (schema.required || []).forEach(k => { if (!(k in data)) errs.push(path + " must have required property '" + k + "'"); });
    const props = schema.properties || {};
    Object.keys(props).forEach(k => { if (k in data) validateSchema(data[k], props[k], path + '.' + k, errs); });
    if (schema.additionalProperties === false) Object.keys(data).forEach(k => { if (!(k in props)) errs.push(path + " must not have additional property '" + k + "'"); });
  }
  return errs;
}
PM.validateSchema = validateSchema;

/* ------------------------------------------------------------ chai subset */
const CHAIN = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'but', 'does', 'still'];
function expectFactory(track) {
  function Assertion(obj, msg, flags) { this._obj = obj; this._msg = msg; this._f = flags || {}; }
  const P = Assertion.prototype;
  CHAIN.forEach(w => Object.defineProperty(P, w, { get() { return this; } }));
  ['not', 'deep', 'nested', 'own', 'any', 'all'].forEach(f => Object.defineProperty(P, f, { get() { if (f === 'not') this._f.neg = !this._f.neg; else this._f[f] = true; return this; } }));
  P.assert = function (cond, pos, neg) {
    track && track();
    const ok = this._f.neg ? !cond : !!cond;
    if (!ok) throw new AssertionError((this._msg ? this._msg + ': ' : '') + (this._f.neg ? neg : pos));
    return this;
  };
  const o = a => fmt(a._obj);
  function eq(v) { const d = this._f.deep; return this.assert(d ? deepEq(this._obj, v) : this._obj === v, 'expected ' + o(this) + ' to ' + (d ? 'deeply ' : '') + 'equal ' + fmt(v), 'expected ' + o(this) + ' to not ' + (d ? 'deeply ' : '') + 'equal ' + fmt(v)); }
  P.equal = P.equals = P.eq = eq;
  P.eql = P.eqls = function (v) { return this.assert(deepEq(this._obj, v), 'expected ' + o(this) + ' to deeply equal ' + fmt(v), 'expected ' + o(this) + ' to not deeply equal ' + fmt(v)); };
  const num = (a, name) => { if (typeof a._obj !== 'number' && !(a._f.len)) throw new AssertionError('expected ' + o(a) + ' to be a number or a date (for ' + name + ')'); };
  function cmp(name, test, word) {
    return function (n) {
      const v = this._f.len ? lengthOfVal(this._obj) : this._obj; if (!this._f.len) num(this, name);
      const subj = this._f.len ? 'expected ' + o(this) + ' to have a length ' : 'expected ' + o(this) + ' to be ';
      return this.assert(test(v, n), subj + word + ' ' + n + (this._f.len ? ' but got ' + v : ''), subj.replace(' to ', ' to not ') + word + ' ' + n);
    };
  }
  P.above = P.gt = P.greaterThan = cmp('above', (a, b) => a > b, 'above');
  P.below = P.lt = P.lessThan = cmp('below', (a, b) => a < b, 'below');
  P.least = P.gte = P.greaterThanOrEqual = cmp('least', (a, b) => a >= b, 'at least');
  P.most = P.lte = P.lessThanOrEqual = cmp('most', (a, b) => a <= b, 'at most');
  P.within = function (a, b) { const v = this._f.len ? lengthOfVal(this._obj) : this._obj; return this.assert(v >= a && v <= b, 'expected ' + o(this) + ' to be within ' + a + '..' + b, 'expected ' + o(this) + ' to not be within ' + a + '..' + b); };
  P.closeTo = P.approximately = function (e, d) { return this.assert(Math.abs(this._obj - e) <= d, 'expected ' + o(this) + ' to be close to ' + e + ' +/- ' + d, 'expected ' + o(this) + ' not to be close to ' + e + ' +/- ' + d); };
  P.a = P.an = function (type) {
    type = String(type).toLowerCase(); const t = typeOf(this._obj);
    const art = /^[aeiou]/.test(type) ? 'an ' : 'a ';
    return this.assert(t === type, 'expected ' + o(this) + ' to be ' + art + type, 'expected ' + o(this) + ' not to be ' + art + type);
  };
  P.instanceOf = P.instanceof = function (C) { return this.assert(this._obj instanceof C, 'expected ' + o(this) + ' to be an instance of ' + (C && C.name), 'expected ' + o(this) + ' to not be an instance of ' + (C && C.name)); };
  const prop = (name, test, pos, neg) => Object.defineProperty(P, name, { get() { return this.assert(test(this._obj), 'expected ' + o(this) + ' to ' + pos, 'expected ' + o(this) + ' to ' + neg); } });
  prop('ok', v => !!v, 'be truthy', 'be falsy');
  prop('true', v => v === true, 'be true', 'not be true');
  prop('false', v => v === false, 'be false', 'not be false');
  prop('null', v => v === null, 'be null', 'not be null');
  prop('undefined', v => v === undefined, 'be undefined', 'not be undefined');
  prop('NaN', v => Number.isNaN(v), 'be NaN', 'not be NaN');
  prop('exist', v => v !== null && v !== undefined, 'exist', 'not exist');
  prop('empty', v => typeof v === 'string' || Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' ? Object.keys(v).length === 0 : false, 'be empty', 'not be empty');
  function lengthOfVal(v) { return v == null ? undefined : (v.length !== undefined ? v.length : (typeof v === 'object' ? Object.keys(v).length : undefined)); }
  function lengthOf(n) { const l = lengthOfVal(this._obj); return this.assert(l === n, 'expected ' + o(this) + ' to have a length of ' + n + ' but got ' + l, 'expected ' + o(this) + ' to not have a length of ' + n); }
  P.lengthOf = lengthOf;
  Object.defineProperty(P, 'length', { get() { const self = this; const fn = function (n) { return lengthOf.call(self, n); }; self._f.len = true; ['above', 'gt', 'below', 'lt', 'least', 'gte', 'most', 'lte', 'within', 'equal', 'eq'].forEach(m => fn[m] = function () { if (m === 'equal' || m === 'eq') return lengthOf.apply(self, arguments); return P[m].apply(self, arguments); }); return fn; } });
  P.property = function (name, val) {
    const n = this._f.nested; const r = n ? getPath(this._obj, name) : { found: this._obj != null && (typeof this._obj === 'object' || typeof this._obj === 'string') && name in Object(this._obj), value: this._obj != null ? this._obj[name] : undefined };
    const what = (n ? 'nested ' : '') + 'property ' + fmt(name);
    if (arguments.length > 1) {
      const same = this._f.deep ? deepEq(r.value, val) : r.value === val;
      this.assert(r.found && same, 'expected ' + o(this) + ' to have ' + what + ' of ' + fmt(val) + (r.found ? ', but got ' + fmt(r.value) : ''), 'expected ' + o(this) + ' to not have ' + what + ' of ' + fmt(val));
    } else this.assert(r.found, 'expected ' + o(this) + ' to have ' + what, 'expected ' + o(this) + ' to not have ' + what);
    if (!this._f.neg) return new Assertion(r.value, this._msg, {});
    return this;
  };
  P.ownProperty = P.haveOwnProperty = function (name) { return this.assert(this._obj != null && Object.prototype.hasOwnProperty.call(this._obj, name), 'expected ' + o(this) + ' to have own property ' + fmt(name), 'expected ' + o(this) + ' to not have own property ' + fmt(name)); };
  function include(v) {
    const x = this._obj; let ok = false;
    if (typeof x === 'string') ok = x.indexOf(v) >= 0;
    else if (Array.isArray(x)) ok = x.some(e => (typeof v === 'object' && v !== null) ? deepEq(e, v) : e === v);
    else if (x && typeof x === 'object' && v && typeof v === 'object') ok = Object.keys(v).every(k => deepEq(x[k], v[k]));
    return this.assert(ok, 'expected ' + o(this) + ' to include ' + fmt(v), 'expected ' + o(this) + ' to not include ' + fmt(v));
  }
  ['include', 'includes', 'contain', 'contains'].forEach(w => Object.defineProperty(P, w, { get() { const self = this; self._f.contains = true; const fn = function (v) { return include.call(self, v); }; fn.members = a => P.members.call(self, a); fn.keys = function () { return P.keys.apply(self, arguments); }; fn.all = { keys() { self._f.all = true; return P.keys.apply(self, arguments); } }; fn.any = { keys() { self._f.any = true; return P.keys.apply(self, arguments); } }; return fn; } }));
  P.string = function (s) { return this.assert(typeof this._obj === 'string' && this._obj.indexOf(s) >= 0, 'expected ' + o(this) + ' to contain ' + fmt(s), 'expected ' + o(this) + ' to not contain ' + fmt(s)); };
  P.match = P.matches = function (re) { return this.assert(re instanceof RegExp && re.test(String(this._obj)), 'expected ' + o(this) + ' to match ' + re, 'expected ' + o(this) + ' not to match ' + re); };
  P.oneOf = function (list) { return this.assert(Array.isArray(list) && list.some(e => this._f.deep ? deepEq(e, this._obj) : e === this._obj), 'expected ' + o(this) + ' to be one of ' + fmt(list), 'expected ' + o(this) + ' to not be one of ' + fmt(list)); };
  P.keys = P.key = function () {
    let keys = Array.prototype.slice.call(arguments); if (keys.length === 1 && Array.isArray(keys[0])) keys = keys[0];
    const actual = this._obj && typeof this._obj === 'object' ? Object.keys(this._obj) : [];
    let ok;
    if (this._f.any) ok = keys.some(k => actual.indexOf(k) >= 0);
    else if (this._f.contains) ok = keys.every(k => actual.indexOf(k) >= 0);
    else ok = keys.every(k => actual.indexOf(k) >= 0) && actual.length === keys.length;
    return this.assert(ok, 'expected ' + o(this) + ' to have ' + (this._f.any ? 'any of ' : this._f.contains ? '' : 'exactly ') + 'keys ' + keys.map(fmt).join(', '), 'expected ' + o(this) + ' to not have keys ' + keys.map(fmt).join(', '));
  };
  P.members = function (list) {
    const x = this._obj; const has = (arr, v) => arr.some(e => deepEq(e, v));
    const ok = Array.isArray(x) && Array.isArray(list) && (this._f.contains ? list.every(v => has(x, v)) : (x.length === list.length && list.every(v => has(x, v)) && x.every(v => has(list, v))));
    return this.assert(ok, 'expected ' + o(this) + ' to have the same members as ' + fmt(list), 'expected ' + o(this) + ' to not have the same members as ' + fmt(list));
  };
  P.satisfy = P.satisfies = function (fn) { return this.assert(fn(this._obj), 'expected ' + o(this) + ' to satisfy the given function', 'expected ' + o(this) + ' to not satisfy the given function'); };
  P.jsonSchema = function (schema) { const errs = validateSchema(this._obj, schema); return this.assert(errs.length === 0, 'expected data to satisfy schema but found error: ' + errs[0], 'expected data to not satisfy schema'); };
  P.throw = P.throws = function () { let threw = false; try { this._obj(); } catch (e) { threw = true; } return this.assert(threw, 'expected [Function] to throw an error', 'expected [Function] to not throw an error'); };
  const expect = (v, m) => new Assertion(v, m, {});
  expect.fail = (m) => { track && track(); throw new AssertionError(m || 'expect.fail()'); };
  return expect;
}
PM.expectFactory = expectFactory;

/* ------------------------------------------------------------ header list */
class HeaderList {
  constructor(list) { this.list = (list || []).map(h => ({ key: h.key, value: h.value, disabled: !!h.disabled })); }
  _find(k) { const l = String(k).toLowerCase(); return this.list.filter(h => !h.disabled && String(h.key).toLowerCase() === l); }
  get(k) { const f = this._find(k); return f.length ? f[f.length - 1].value : undefined; }
  has(k, v) { const f = this._find(k); return v === undefined ? f.length > 0 : f.some(h => h.value === v); }
  add(h) { if (typeof h === 'string') { const i = h.indexOf(':'); h = { key: h.slice(0, i).trim(), value: h.slice(i + 1).trim() }; } this.list.push({ key: h.key, value: String(h.value) }); }
  upsert(h) { const f = this._find(h.key); if (f.length) f[f.length - 1].value = String(h.value); else this.add(h); }
  remove(k) { const l = String(k).toLowerCase(); this.list = this.list.filter(h => String(h.key).toLowerCase() !== l); }
  toObject() { const o = {}; this.list.forEach(h => { if (!h.disabled) o[h.key] = h.value; }); return o; }
  all() { return this.list.filter(h => !h.disabled).map(h => ({ key: h.key, value: h.value })); }
  each(fn) { this.all().forEach(fn); }
  count() { return this.all().length; }
  get size() { return this.count(); }
}

/* ------------------------------------------------------------ pm.response */
function makeResponse(res, track) {
  const hl = new HeaderList(Object.keys(res.headers).map(k => ({ key: k, value: res.headers[k] })));
  const r = {
    code: res.code, status: res.status, responseTime: res.time, responseSize: res.size, headers: hl,
    json() { try { return JSON.parse(res.body); } catch (e) { throw new SyntaxError('JSONError: ' + (res.body ? 'Unexpected token ' + fmt(res.body.trim()[0]) + ' at 1:1 — the body is not JSON' : 'No data, empty input at 1:1')); } },
    text() { return res.body; }, reason() { return res.status; }
  };
  const fail = (m) => { throw new AssertionError(m); };
  function build(neg) {
    const A = (c, pos, negm) => { track && track(); if (neg ? c : !c) fail(neg ? negm : pos); };
    const have = {
      status(x) {
        if (typeof x === 'number') A(res.code === x, 'expected response to have status code ' + x + ' but got ' + res.code, 'expected response to not have status code ' + x);
        else A(res.status === x, 'expected response to have status reason ' + fmt(x) + ' but got ' + fmt(res.status), 'expected response to not have status reason ' + fmt(x));
      },
      header(k, v) {
        const has = hl.has(k);
        if (v === undefined) A(has, 'expected response to have header with key ' + fmt(k), 'expected response to not have header with key ' + fmt(k));
        else { const got = hl.get(k); A(has && got === v, 'expected ' + fmt(k) + ' response header to be ' + fmt(v) + ' but got ' + fmt(got), 'expected ' + fmt(k) + ' response header to not be ' + fmt(v)); }
      },
      body(v) { if (v === undefined) A(res.body.length > 0, 'expected response to have content in body', 'expected response to not have content in body'); else if (v instanceof RegExp) A(v.test(res.body), 'expected response body text to match ' + v, 'expected response body text to not match ' + v); else A(res.body === v, 'expected response body to equal ' + fmt(v), 'expected response body to not equal ' + fmt(v)); },
      jsonBody(path, val) {
        let j; try { j = JSON.parse(res.body); } catch (e) { return A(false, 'expected response body to be a valid json but got error ' + e.message, 'expected response body not to be a valid json'); }
        if (path === undefined) return A(true);
        if (typeof path === 'object') return A(deepEq(j, path), 'expected response body json to equal ' + fmt(path) + ' but got ' + fmt(j), 'expected response body json to not equal ' + fmt(path));
        const g = getPath(j, path);
        if (arguments.length < 2) A(g.found, 'expected ' + fmt(j) + ' in response to contain property ' + fmt(path), 'expected response json not to contain property ' + fmt(path));
        else A(g.found && deepEq(g.value, val), 'expected response to have value ' + fmt(val) + ' at ' + fmt(path) + ' but got ' + fmt(g.value), 'expected response to not have value ' + fmt(val) + ' at ' + fmt(path));
      },
      jsonSchema(schema) { let j; try { j = JSON.parse(res.body); } catch (e) { return A(false, 'expected response body to be valid JSON', ''); } const errs = validateSchema(j, schema); A(errs.length === 0, 'expected data to satisfy schema but found error: ' + errs[0], 'expected data to not satisfy schema'); },
      responseTime: undefined
    };
    const be = {};
    const cls = { ok: c => c === 200, success: c => c >= 200 && c < 300, accepted: c => c === 202, badRequest: c => c === 400, unauthorized: c => c === 401, unauthorised: c => c === 401, forbidden: c => c === 403, notFound: c => c === 404, rateLimited: c => c === 429, info: c => c < 200, redirection: c => c >= 300 && c < 400, clientError: c => c >= 400 && c < 500, serverError: c => c >= 500, error: c => c >= 400 };
    Object.keys(cls).forEach(k => Object.defineProperty(be, k, { get() { A(cls[k](res.code), 'expected response code to be ' + k + ' but found ' + res.code, 'expected response code to not be ' + k + ' but found ' + res.code); return be; } }));
    Object.defineProperty(be, 'json', { get() { let ok = /json/i.test(hl.get('Content-Type') || ''); A(ok, "expected response to be json but got content type " + fmt(hl.get('Content-Type')), 'expected response to not be json'); return be; } });
    Object.defineProperty(be, 'withBody', { get() { A(res.body.length > 0, 'expected response to have content in body', 'expected response to not have content in body'); return be; } });
    have.responseTime = undefined;
    const obj = { have, be, has: have, get not() { return build(!neg).to; } };
    obj.to = obj;
    return obj;
  }
  r.to = build(false);
  return r;
}

/* ------------------------------------------------------------ script sandbox */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function errLine(e) {
  const st = String(e && e.stack || '');
  let m = st.match(/<anonymous>:(\d+):(\d+)/) || st.match(/Function:(\d+):(\d+)/) || st.match(/eval[^\n]*?:(\d+):(\d+)/);
  if (m) { const n = Number(m[1]) - 2; return n > 0 ? n : null; }
  return null;
}
async function runScript(code, ctx, event, where) {
  if (!code || !code.trim()) return;
  const out = ctx.out;
  const logs = out.logs;
  const mkLog = lvl => function () { logs.push({ lvl, where, text: Array.prototype.map.call(arguments, a => typeof a === 'string' ? a : fmtLog(a)).join(' ') }); };
  const consoleObj = { log: mkLog('log'), info: mkLog('info'), warn: mkLog('warn'), error: mkLog('error') };
  const expect = expectFactory(() => { out.assertCount++; });
  const pending = [];
  const pm = buildPm(ctx, event, expect, pending, where, consoleObj);
  let fn;
  try { fn = new AsyncFunction('pm', 'postman', 'console', 'require', 'responseBody', code); }
  catch (e) { out.errors.push({ where, event, msg: 'There was an error in evaluating the ' + (event === 'test' ? 'test script' : 'Pre-request Script') + ':  ' + e.name + ': ' + e.message }); return; }
  try {
    await fn(pm, pm.__postman, consoleObj, (name) => { throw new Error("Cannot find module '" + name + "'. This practice sandbox supports pm.*, console and plain JavaScript only."); }, ctx.response ? ctx.response.body : undefined);
    await Promise.all(pending);
  } catch (e) {
    const ln = errLine(e);
    out.errors.push({ where, event, line: ln, msg: 'There was an error in evaluating the ' + (event === 'test' ? 'test script' : 'Pre-request Script') + ':  ' + (e && e.name || 'Error') + ': ' + (e && e.message || String(e)) + (ln ? ' (line ' + ln + ')' : '') });
  }
}
function fmtLog(a) { if (a === undefined) return 'undefined'; if (a === null) return 'null'; if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch (e) { return String(a); } } return String(a); }

function scopeApi(scope, extra) {
  const api = {
    get: k => scope.get(k), set: (k, v) => scope.set(k, v), unset: k => scope.unset(k), has: k => scope.has(k), clear: () => scope.clear(),
    toObject: () => scope.toObject(), replaceIn: s => extra.resolve(s)
  };
  if (extra.name) api.name = extra.name;
  return api;
}
function buildPm(ctx, event, expect, pending, where, consoleObj) {
  const sc = ctx.scopes; const res = makeResolver(sc);
  const pm = {
    info: { eventName: event, iteration: ctx.iteration, iterationCount: ctx.iterationCount, requestName: ctx.item.name, requestId: ctx.item.id },
    expect,
    test(name, fn) {
      const rec = { name: String(name), pass: true, where };
      ctx.out.tests.push(rec);
      if (typeof fn !== 'function') { rec.skipped = true; return; }
      const before = ctx.out.assertCount;
      const fail = e => { rec.pass = false; rec.error = (e && e.name ? e.name + ': ' : '') + (e && e.message || String(e)); };
      try {
        const r = fn();
        if (r && typeof r.then === 'function') pending.push(r.then(() => { rec.asserts = ctx.out.assertCount - before; }, fail));
        else rec.asserts = ctx.out.assertCount - before;
      } catch (e) { fail(e); }
    },
    variables: Object.assign(scopeApi(sc.local, res), { get: k => { const r = res.lookup(k); return r ? r.v : undefined; }, has: k => !!res.lookup(k), replaceIn: s => res.resolve(s), toObject: () => Object.assign({}, sc.glob.toObject(), sc.coll.toObject(), sc.env.toObject(), sc.data.toObject(), sc.local.toObject()) }),
    environment: scopeApi(sc.env, { resolve: res.resolve, name: ctx.envName || 'No environment' }),
    collectionVariables: scopeApi(sc.coll, { resolve: res.resolve }),
    globals: scopeApi(sc.glob, { resolve: res.resolve }),
    iterationData: { get: k => sc.data.get(k), has: k => sc.data.has(k), toObject: () => sc.data.toObject(), toJSON: () => sc.data.toObject() },
    execution: {
      setNextRequest(n) { ctx.out.next = n === null ? null : String(n); ctx.out.nextSet = true; },
      skipRequest() { if (event !== 'prerequest') throw new Error('pm.execution.skipRequest() can only be used in a pre-request script'); ctx.out.skipped = true; },
      location: [ctx.collName || 'Collection', ctx.item.name]
    },
    sendRequest(req, cb) {
      const r = typeof req === 'string' ? { url: req, method: 'GET' } : (req || {});
      let headers = {};
      if (Array.isArray(r.header)) r.header.forEach(h => headers[h.key] = h.value); else if (r.header && typeof r.header === 'object') headers = Object.assign({}, r.header);
      if (r.headers && typeof r.headers === 'object' && !Array.isArray(r.headers)) Object.assign(headers, r.headers);
      let body = '';
      if (r.body) { if (r.body.mode === 'raw') body = typeof r.body.raw === 'string' ? r.body.raw : JSON.stringify(r.body.raw); else if (r.body.mode === 'urlencoded') { body = (r.body.urlencoded || []).map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&'); if (!Object.keys(headers).some(k => /content-type/i.test(k))) headers['Content-Type'] = 'application/x-www-form-urlencoded'; } }
      if (body && r.body && r.body.mode === 'raw' && !Object.keys(headers).some(k => /content-type/i.test(k)) && /^\s*[{[]/.test(body)) headers['Content-Type'] = 'application/json';
      let err = null, resp = null;
      if (/\{\{/.test(r.url || '')) err = new Error('Invalid URL "' + r.url + '". pm.sendRequest does not resolve {{variables}} — build the URL with pm.variables.replaceIn() or pm.environment.get().');
      else {
        const x = ctx.server.handle({ method: r.method || 'GET', url: r.url, headers, body });
        if (x.error) err = new Error(x.error); else { resp = makeResponse(x, () => ctx.out.assertCount++); ctx.out.sub.push({ method: (r.method || 'GET').toUpperCase(), url: r.url, code: x.code }); }
      }
      if (typeof cb === 'function') { try { cb(err, resp); } catch (e) { throw e; } }
      return err ? Promise.reject(err) : Promise.resolve(resp);
    },
    request: ctx.preq,
    response: ctx.response ? makeResponse(ctx.response, () => ctx.out.assertCount++) : undefined
  };
  pm.__postman = { setNextRequest: n => pm.execution.setNextRequest(n), setEnvironmentVariable: (k, v) => sc.env.set(k, v), getEnvironmentVariable: k => sc.env.get(k), setGlobalVariable: (k, v) => sc.glob.set(k, v) };
  if (event === 'prerequest') delete pm.response;
  return pm;
}

/* ------------------------------------------------------------ request execution */
function mutableRequest(item) {
  const r = clone(item);
  const urlObj = {
    _raw: r.url || '',
    toString() { return this._raw; },
    getPath() { const p = parseUrl(this._raw); return p.path; },
    getHost() { const p = parseUrl(this._raw); return p.host; },
    get query() { const p = parseUrl(this._raw); return { get: k => qget(p.query || [], k), all: () => (p.query || []).map(q => ({ key: q[0], value: q[1] })), toObject: () => { const o = {}; (p.query || []).forEach(q => o[q[0]] = q[1]); return o; }, add: (q) => { const add = (typeof q === 'string' ? q : encodeURIComponent(q.key) + '=' + encodeURIComponent(q.value)); urlObj._raw += (urlObj._raw.indexOf('?') >= 0 ? '&' : '?') + add; } }; },
    update(s) { this._raw = String(s); }
  };
  const headers = new HeaderList(r.headers || []);
  const body = { mode: (r.body && r.body.mode) || 'none', raw: (r.body && r.body.raw) || '', urlencoded: (r.body && r.body.form) || [], toString() { return this.mode === 'raw' ? this.raw : this.mode === 'urlencoded' ? this.urlencoded.map(p => p.key + '=' + p.value).join('&') : ''; }, update(s) { if (typeof s === 'string') { this.mode = 'raw'; this.raw = s; } else if (s && s.mode) { this.mode = s.mode; if (s.raw !== undefined) this.raw = typeof s.raw === 'string' ? s.raw : JSON.stringify(s.raw); } } };
  const preq = { method: (r.method || 'GET').toUpperCase(), headers, body, name: r.name, id: r.id, auth: r.auth };
  Object.defineProperty(preq, 'url', { get() { return urlObj; }, set(v) { urlObj._raw = String(v); }, enumerable: true });
  preq.addHeader = h => headers.add(h); preq.removeHeader = k => headers.remove(k);
  return { preq, pathVars: r.pathVars || {} };
}

function applyAuth(auth, headers, urlRef, resolve) {
  if (!auth || auth.type === 'none' || !auth.type) return null;
  if (auth.type === 'bearer') { const t = resolve(auth.token || ''); headers.upsert({ key: 'Authorization', value: 'Bearer ' + t }); return 'Bearer'; }
  if (auth.type === 'basic') { headers.upsert({ key: 'Authorization', value: 'Basic ' + b64(resolve(auth.username || '') + ':' + resolve(auth.password || '')) }); return 'Basic'; }
  if (auth.type === 'apikey') {
    const k = resolve(auth.key || ''), v = resolve(auth.value || '');
    if (!k) return null;
    if (auth.in === 'query') urlRef.v += (urlRef.v.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    else headers.upsert({ key: k, value: v });
    return 'API Key';
  }
  return null;
}

async function execItem(item, ctx) {
  const out = { name: item.name, id: item.id, iteration: ctx.iteration, tests: [], errors: [], logs: [], sub: [], assertCount: 0, next: undefined, nextSet: false, skipped: false };
  ctx.out = out; ctx.item = item; ctx.response = null;
  ctx.scopes.local = new VarScope('local');
  const m = mutableRequest(item); ctx.preq = m.preq;
  await runScript(ctx.collection.pre, ctx, 'prerequest', 'collection pre-request');
  await runScript(item.pre, ctx, 'prerequest', 'pre-request');
  if (out.skipped) { out.logs.push({ lvl: 'info', where: 'runner', text: 'Request skipped by pm.execution.skipRequest()' }); return out; }
  const missing = [];
  const R = makeResolver(ctx.scopes); const resolve = s => R.resolve(s, missing);
  const preq = m.preq;
  let url = resolve(preq.url.toString());
  // path variables (:name)
  url = url.replace(/(\/):([A-Za-z_][\w-]*)/g, (all, sl, n) => Object.prototype.hasOwnProperty.call(m.pathVars, n) ? sl + encodeURIComponent(resolve(String(m.pathVars[n]))) : all);
  const headers = new HeaderList(preq.headers.list.map(h => ({ key: resolve(h.key), value: resolve(String(h.value)), disabled: h.disabled })));
  const urlRef = { v: url };
  let auth = item.auth && item.auth.type !== 'inherit' ? item.auth : (ctx.collection.auth || { type: 'none' });
  if (item.auth && item.auth.type === 'none') auth = { type: 'none' };
  applyAuth(auth, headers, urlRef, resolve);
  let body = '';
  const b = preq.body;
  if (b.mode === 'raw') { body = resolve(b.raw || ''); if (!headers.has('Content-Type') && (item.body && item.body.lang) !== 'text') headers.add({ key: 'Content-Type', value: 'application/json' }); }
  else if (b.mode === 'urlencoded') { body = (b.urlencoded || []).filter(p => !p.disabled && p.key).map(p => encodeURIComponent(resolve(p.key)) + '=' + encodeURIComponent(resolve(String(p.value)))).join('&'); if (!headers.has('Content-Type')) headers.add({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }); }
  const sent = { method: preq.method, url: urlRef.v, headers: headers.toObject(), body, rawUrl: item.url };
  if (!headers.has('User-Agent')) sent.headers['User-Agent'] = 'PostmanRuntime/7.43.0';
  if (!headers.has('Accept')) sent.headers['Accept'] = '*/*';
  if (!headers.has('Host')) { const p = parseUrl(urlRef.v); if (p.host) sent.headers['Host'] = p.host; }
  out.request = sent;
  if (missing.length) out.unresolved = missing;
  const r = ctx.server.handle(sent);
  if (r.error) { out.netError = r.error; out.hint = r.hint || (missing.length ? 'Unresolved variable: ' + missing.map(x => '{{' + x + '}}').join(', ') : ''); return out; }
  out.response = r; ctx.response = r;
  await runScript(ctx.collection.tests, ctx, 'test', 'collection tests');
  await runScript(item.tests, ctx, 'test', 'tests');
  return out;
}

function scopesFrom(ws, dataRow) {
  const env = ws.activeEnv ? (ws.environments || []).find(e => e.id === ws.activeEnv) : null;
  return {
    glob: new VarScope('global', ws.globals || []), coll: new VarScope('collection', ws.collection.variables || []),
    env: new VarScope('environment', env ? env.values : []), data: new VarScope('data', dataRow ? Object.keys(dataRow).map(k => ({ key: k, value: typeof dataRow[k] === 'object' ? JSON.stringify(dataRow[k]) : dataRow[k] })) : []),
    local: new VarScope('local'), envName: env ? env.name : null
  };
}
/* Send one request inside a workspace; scope changes are written back to ws */
PM.send = async function (ws, itemId, server) {
  const item = ws.collection.items.find(i => i.id === itemId);
  const sc = scopesFrom(ws, null);
  server.examples = collectExamples(ws);
  const ctx = { scopes: sc, server, collection: ws.collection, collName: ws.collection.name, iteration: 0, iterationCount: 1, envName: sc.envName };
  const out = await execItem(item, ctx);
  writeBack(ws, sc);
  return out;
};
function writeBack(ws, sc) {
  ws.globals = sc.glob.toList();
  ws.collection.variables = sc.coll.toList();
  const env = ws.activeEnv ? (ws.environments || []).find(e => e.id === ws.activeEnv) : null;
  if (env) env.values = sc.env.toList();
}
function collectExamples(ws) { const ex = []; ws.collection.items.forEach(i => (i.examples || []).forEach(e => ex.push(e))); return ex; }

PM.parseData = function (text) {
  const t = String(text || '').trim();
  if (!t) return { rows: [] };
  if (t[0] === '[' || t[0] === '{') {
    try { const j = JSON.parse(t); const rows = Array.isArray(j) ? j : [j]; if (!rows.every(r => r && typeof r === 'object' && !Array.isArray(r))) return { error: 'JSON data must be an array of objects' }; return { rows, kind: 'json' }; }
    catch (e) { return { error: 'Data file is not valid JSON: ' + e.message }; }
  }
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  const split = l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]);
  const rows = lines.slice(1).map(l => { const v = split(l); const o = {}; head.forEach((h, i) => o[h] = v[i] === undefined ? '' : v[i]); return o; });
  return { rows, kind: 'csv', columns: head };
};

/* Collection runner */
PM.run = async function (wsIn, opts) {
  opts = opts || {};
  const ws = clone(wsIn);
  const server = opts.server || new Server(opts.bugs);
  server.examples = collectExamples(ws);
  const runner = ws.runner || {};
  const data = opts.data || PM.parseData(runner.data || '');
  if (data.error) return { error: data.error, runs: [] };
  const rows = data.rows || [];
  let iterations = Math.max(1, Math.min(50, Number(opts.iterations || runner.iterations) || 1));
  if (rows.length && !(opts.iterations || Number(runner.iterations) > 1)) iterations = rows.length;
  const selected = (runner.selected && runner.selected.length) ? ws.collection.items.filter(i => runner.selected.indexOf(i.id) >= 0) : ws.collection.items;
  const items = selected.filter(i => !i.disabledInRun);
  const runs = [];
  const sc0 = scopesFrom(ws, null);
  let guard = 0;
  for (let it = 0; it < iterations; it++) {
    const row = rows.length ? rows[Math.min(it, rows.length - 1)] : null;
    sc0.data = new VarScope('data', row ? Object.keys(row).map(k => ({ key: k, value: typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k] })) : []);
    let idx = 0;
    while (idx < items.length && guard < 300) {
      guard++;
      const ctx = { scopes: sc0, server, collection: ws.collection, collName: ws.collection.name, iteration: it, iterationCount: iterations, envName: sc0.envName };
      const out = await execItem(items[idx], ctx);
      runs.push(out);
      if (out.nextSet) {
        if (out.next === null) break;
        const j = items.findIndex(i => i.name === out.next);
        if (j < 0) { out.logs.push({ lvl: 'warn', where: 'runner', text: 'setNextRequest: no request named "' + out.next + '" in this run. Continuing in order.' }); idx++; }
        else idx = j;
      } else idx++;
    }
    if (guard >= 300) { runs.push({ name: 'Runner stopped', tests: [], errors: [{ msg: 'Stopped after 300 requests — check pm.execution.setNextRequest() for an endless loop.' }], logs: [], sub: [] }); break; }
  }
  writeBack(ws, sc0);
  const tests = runs.reduce((a, r) => a.concat(r.tests || []), []);
  return { runs, ws, iterations, tests, passed: tests.filter(t => t.pass).length, failed: tests.filter(t => !t.pass).length, errors: runs.reduce((a, r) => a.concat(r.errors || []), []), env: sc0.env.toObject(), coll: sc0.coll.toObject(), glob: sc0.glob.toObject() };
};

/* ------------------------------------------------------------ lab checks */
const pathOf = u => { const p = parseUrl(u || ''); return (p.path || '') + (p.query && p.query.length ? '?' + p.query.map(q => q[0] + '=' + q[1]).join('&') : ''); };
PM.pathOf = pathOf;
function allScripts(ws, which) {
  const s = [];
  const add = (code) => { if (code) s.push(code); };
  if (!which || which === 'pre') { add(ws.collection.pre); ws.collection.items.forEach(i => add(i.pre)); }
  if (!which || which === 'tests') { add(ws.collection.tests); ws.collection.items.forEach(i => add(i.tests)); }
  return s.join('\n');
}
function stripComments(code) { return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1'); }
const C = {
  sent: (method, re, code) => r => r.runs.some(x => x.request && x.request.method === method && re.test(pathOf(x.request.url)) && (code === undefined || (x.response && x.response.code === code))),
  count: (method, re, min) => r => r.runs.filter(x => x.request && x.request.method === method && re.test(pathOf(x.request.url))).length >= min,
  header: (re, valRe) => r => r.runs.some(x => x.request && Object.keys(x.request.headers).some(k => re.test(k) && (!valRe || valRe.test(x.request.headers[k])))),
  sentBody: (pred) => r => r.runs.some(x => { if (!x.request || !x.request.body) return false; let j; try { j = JSON.parse(x.request.body); } catch (e) { j = x.request.body; } try { return pred(j, x); } catch (e) { return false; } }),
  status: (code) => r => r.runs.some(x => x.response && x.response.code === code),
  tests: (min) => r => r.tests.length >= min,
  allPass: () => r => r.tests.length > 0 && r.failed === 0 && r.errors.length === 0,
  noErrors: () => r => r.errors.length === 0 && r.runs.every(x => !x.netError),
  script: (re, which) => r => re.test(stripComments(allScripts(r.ws, which))),
  noScript: (re, which) => r => !re.test(stripComments(allScripts(r.ws, which))),
  env: (k, pred) => r => r.env[k] !== undefined && r.env[k] !== '' && (!pred || pred(r.env[k])),
  coll: (k, pred) => r => r.coll[k] !== undefined && r.coll[k] !== '' && (!pred || pred(r.coll[k])),
  glob: (k, pred) => r => r.glob[k] !== undefined && r.glob[k] !== '' && (!pred || pred(r.glob[k])),
  usesVar: (name) => r => { const re = new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}'); return r.ws.collection.items.some(i => re.test(JSON.stringify([i.url, i.headers, i.body, i.auth, i.pathVars]))) || re.test(JSON.stringify(r.ws.collection.auth || {})); },
  urlVar: (name) => r => { const re = new RegExp('\\{\\{\\s*' + name + '\\s*\\}\\}'); return r.ws.collection.items.some(i => re.test(i.url || '')); },
  noLiteral: (re) => r => !r.ws.collection.items.some(i => re.test(JSON.stringify([i.url, i.headers, i.body, i.auth]))) && !re.test(JSON.stringify(r.ws.collection.auth || {})),
  auth: (type) => r => (r.ws.collection.auth && r.ws.collection.auth.type === type) || r.ws.collection.items.some(i => i.auth && i.auth.type === type),
  collAuth: (type) => r => r.ws.collection.auth && r.ws.collection.auth.type === type,
  items: (min) => r => r.ws.collection.items.length >= min,
  iterations: (n) => r => r.iterations >= n,
  runs: (min) => r => r.runs.filter(x => x.request).length >= min,
  logged: (re) => r => r.runs.some(x => (x.logs || []).some(l => re.test(l.text))),
  subRequest: () => r => r.runs.some(x => x.sub && x.sub.length),
  testName: (re) => r => r.tests.some(t => re.test(t.name)),
  passing: (re) => r => r.tests.some(t => re.test(t.name) && t.pass),
  examples: (min) => r => r.ws.collection.items.reduce((a, i) => a + (i.examples || []).length, 0) >= min,
  envActive: () => r => !!r.ws.activeEnv,
  envVal: (envName, key, re) => r => { const e = (r.ws.environments || []).find(x => x.name === envName); return !!e && e.values.some(v => v.key === key && re.test(v.value)); },
  fn: f => r => { try { return !!f(r); } catch (e) { return false; } }
};
PM.C = C;

/* Evaluate a lab: main run + bug-variant runs */
PM.evaluate = async function (lab, ws) {
  const r = await PM.run(ws);
  if (r.error) return { error: r.error, checks: [], r };
  const checks = (lab.checks || []).map(([label, fn]) => { let ok = false; try { ok = !!fn(r); } catch (e) { ok = false; } return { label, ok }; });
  for (const b of (lab.bugs || [])) {
    const rb = await PM.run(ws, { bugs: [b] });
    const caught = rb.failed > 0 || rb.errors.length > 0;
    checks.push({ label: 'Your tests catch a broken API (' + BUGS[b] + ')', ok: caught && r.failed === 0 && r.tests.length > 0, bug: true });
  }
  return { checks, r, solved: checks.length > 0 && checks.every(c => c.ok) };
};

/* ------------------------------------------------------------ workspace helpers */
let idc = 0;
PM.uid = p => (p || 'id') + '_' + Date.now().toString(36) + (idc++).toString(36);
PM.newItem = (o) => Object.assign({ id: PM.uid('req'), name: 'New request', method: 'GET', url: '', headers: [], auth: { type: 'inherit' }, body: { mode: 'none', raw: '', lang: 'json', form: [] }, pre: '', tests: '', pathVars: {}, examples: [] }, o || {});
PM.normWs = function (ws) {
  ws = clone(ws);
  ws.collection = ws.collection || { name: 'Collection', items: [] };
  const c = ws.collection;
  c.variables = c.variables || []; c.auth = c.auth || { type: 'none' }; c.pre = c.pre || ''; c.tests = c.tests || ''; c.items = (c.items || []).map(i => PM.newItem(i));
  c.items.forEach(i => { i.body = Object.assign({ mode: 'none', raw: '', lang: 'json', form: [] }, i.body || {}); i.auth = i.auth || { type: 'inherit' }; i.headers = i.headers || []; });
  ws.environments = (ws.environments || []).map(e => Object.assign({ id: PM.uid('env'), values: [] }, e));
  ws.globals = ws.globals || [];
  ws.runner = Object.assign({ iterations: 1, data: '', selected: [] }, ws.runner || {});
  if (ws.activeEnv === undefined) ws.activeEnv = null;
  return ws;
};
})(typeof window !== 'undefined' ? window : globalThis);

/* Postman Path — labs. Each lab: start workspace, solution(ws) mutator, checks, bug variants, hints */
(function (G) {
const PM = G.PM, C = PM.C;
const BASE = 'https://api.pocket.test';
const R = (name, method, url, extra) => Object.assign({ id: 'r_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, method, url }, extra || {});
const json = o => JSON.stringify(o, null, 2);
const W = (name, items, extra) => Object.assign({ collection: Object.assign({ name, variables: [{ key: 'baseUrl', value: BASE }], items }, (extra && extra.coll) || {}) }, extra || {});
const item = (ws, name) => ws.collection.items.find(i => i.name === name);
const add = (ws, it) => { ws.collection.items.push(PM.newItem(it)); };
const LOGIN = (user, pass, tests) => R('Log in', 'POST', '{{baseUrl}}/auth/login', { body: { mode: 'raw', raw: json({ username: user, password: pass }) }, tests: tests || '' });
const SAVE_TOKEN = `const body = pm.response.json();
pm.test('Login returns a token', () => {
  pm.response.to.have.status(200);
  pm.expect(body.token).to.be.a('string');
});
pm.collectionVariables.set('token', body.token);`;
const sentTo = (re, code) => r => r.runs.some(x => x.request && re.test(x.request.url) && x.response && (code === undefined || x.response.code === code));
const respBody = (x) => { try { return JSON.parse(x.response.body); } catch (e) { return null; } };


const LABS = G.LABS = [];
const LAB = l => LABS.push(l);

/* ---------------------------------------------------------------- 1.2 */
/* starters normalised */
LABS.forEach(l => { l.start = PM.normWs(l.start); });
G.labStart = l => PM.normWs(l.start);
G.labSolution = l => { const ws = PM.normWs(l.start); l.solution(ws); return PM.normWs(ws); };
})(typeof window !== 'undefined' ? window : globalThis);



/* ===== Playwright Path · simulated Playwright runtime (core) ===== */
(function (G) {
'use strict';
const RT = G.PWRT = G.PWRT || {};

class PWError extends Error { constructor(m) { super(m); this.name = 'Error'; this.pw = true; } }
class TimeoutError extends PWError { constructor(m) { super(m); this.name = 'TimeoutError'; } }
RT.PWError = PWError; RT.TimeoutError = TimeoutError;

/* ---------- virtual clock: makes waiting deterministic and instant ---------- */
class Clock {
  constructor() { this.now = 0; this.q = []; this.seq = 0; }
  setTimeout(fn, ms) { const t = { at: this.now + Math.max(0, ms || 0), fn, id: ++this.seq }; this.q.push(t); this.q.sort((a, b) => a.at - b.at || a.id - b.id); return t.id; }
  clear(id) { this.q = this.q.filter(t => t.id !== id); }
  runDue() { let g = 0; while (this.q.length && this.q[0].at <= this.now && g++ < 5000) { const t = this.q.shift(); try { t.fn(); } catch (e) { console.error('[site]', e); } } }
  next() { return this.q.length ? this.q[0].at : Infinity; }
  advance(ms) { const end = this.now + ms; while (this.q.length && this.q[0].at <= end) { this.now = Math.max(this.now, this.q[0].at); this.runDue(); } this.now = end; }
}
RT.Clock = Clock;

/* ---------- text / format helpers ---------- */
const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const sq = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const fmtVal = v => v instanceof RegExp ? String(v) : typeof v === 'string' ? sq(v) : (v && v.__kind === 'locator') ? v._desc : JSON.stringify(v);
function fmtOpts(o) { if (!o || typeof o !== 'object') return ''; const p = Object.keys(o).filter(k => o[k] !== undefined).map(k => k + ': ' + fmtVal(o[k])); return p.length ? ', { ' + p.join(', ') + ' }' : ''; }
function strMatch(actual, expected, exact) {
  const a = norm(actual);
  if (expected instanceof RegExp) { expected.lastIndex = 0; return expected.test(a); }
  const e = norm(expected);
  return exact ? a === e : a.toLowerCase().includes(e.toLowerCase());
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
RT.norm = norm; RT.fmtVal = fmtVal;

/* ---------- DOM semantics: visibility, roles, accessible names ---------- */
function isVisible(el) {
  if (!el || !el.isConnected) return false;
  if (/^(HEAD|SCRIPT|STYLE|TITLE|META|LINK)$/.test(el.tagName)) return false;
  const win = el.ownerDocument.defaultView || G;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.hidden) return false;
    if (n.tagName === 'INPUT' && (n.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
    if (n.style && n.style.display === 'none') return false;
    let cs = null; try { cs = win.getComputedStyle(n); } catch (e) {}
    if (cs && cs.display === 'none') return false;
    if (n === el && cs && cs.visibility === 'hidden') return false;
  }
  if (el.tagName === 'OPTION') { const s = el.closest('select'); return s ? isVisible(s) : true; }
  return true;
}
function isDisabled(el) {
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (/^(BUTTON|INPUT|SELECT|TEXTAREA|OPTION|FIELDSET)$/.test(el.tagName) && el.disabled) return true;
  const fs = el.closest('fieldset[disabled]'); if (fs && !fs.querySelector('legend')?.contains(el)) return true;
  return false;
}
function roleOf(el) {
  const r = el.getAttribute('role'); if (r) return r.split(/\s+/)[0];
  const t = el.tagName.toLowerCase();
  switch (t) {
    case 'button': return 'button';
    case 'a': return el.hasAttribute('href') ? 'link' : null;
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
    case 'input': {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(ty)) return 'button';
      if (ty === 'checkbox') return 'checkbox'; if (ty === 'radio') return 'radio';
      if (ty === 'range') return 'slider'; if (ty === 'number') return 'spinbutton';
      if (ty === 'search') return 'searchbox'; if (ty === 'hidden' || ty === 'file') return null;
      return 'textbox';
    }
    case 'textarea': return 'textbox';
    case 'select': return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
    case 'option': return 'option';
    case 'ul': case 'ol': return 'list';
    case 'li': return 'listitem';
    case 'img': return el.getAttribute('alt') === '' ? 'presentation' : 'img';
    case 'nav': return 'navigation'; case 'main': return 'main';
    case 'header': return 'banner'; case 'footer': return 'contentinfo';
    case 'table': return 'table'; case 'tr': return 'row'; case 'td': return 'cell';
    case 'th': return 'columnheader'; case 'dialog': return 'dialog'; case 'article': return 'article';
    case 'form': return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'form' : null;
    case 'section': return (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) ? 'region' : null;
    case 'fieldset': return 'group'; case 'progress': return 'progressbar';
  }
  return null;
}
const NAME_FROM_CONTENT = new Set(['button', 'link', 'heading', 'option', 'cell', 'columnheader', 'rowheader', 'row', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'treeitem', 'tooltip']);
function contentText(el, skip) {
  let s = '';
  el.childNodes.forEach(c => {
    if (c === skip) return;
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeType === 1) {
      if (c.tagName === 'IMG') s += ' ' + (c.getAttribute('alt') || '') + ' ';
      else if (/^(SCRIPT|STYLE)$/.test(c.tagName) || c.hidden || c.getAttribute('aria-hidden') === 'true') return;
      else if (skip && /^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName)) return;
      else s += contentText(c, skip);
    }
  });
  return s;
}
function labelText(el) {
  const parts = []; const doc = el.ownerDocument;
  if (el.id) doc.querySelectorAll('label[for="' + cssEsc(el.id) + '"]').forEach(l => parts.push(contentText(l, el)));
  const wrap = el.closest('label'); if (wrap && !(wrap.htmlFor && wrap.htmlFor === el.id)) parts.push(contentText(wrap, el));
  return norm(parts.join(' '));
}
function accName(el) {
  const lb = el.getAttribute('aria-labelledby');
  if (lb) return norm(lb.split(/\s+/).map(id => { const t = el.ownerDocument.getElementById(id); return t ? contentText(t) : ''; }).join(' '));
  const al = el.getAttribute('aria-label'); if (al && al.trim()) return norm(al);
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (['submit', 'button', 'reset'].includes(ty)) return norm(el.value || (ty === 'submit' ? 'Submit' : ty === 'reset' ? 'Reset' : ''));
    const l = labelText(el); if (l) return l;
    return norm(el.getAttribute('placeholder') || el.getAttribute('title') || '');
  }
  if (tag === 'TEXTAREA' || tag === 'SELECT') { const l = labelText(el); return l || norm(el.getAttribute('placeholder') || el.getAttribute('title') || ''); }
  if (tag === 'IMG') return norm(el.getAttribute('alt') || el.getAttribute('title') || '');
  if (tag === 'FIELDSET') { const lg = el.querySelector('legend'); if (lg) return norm(contentText(lg)); }
  if (tag === 'TABLE') { const c = el.querySelector('caption'); if (c) return norm(contentText(c)); }
  const role = roleOf(el);
  if (role && NAME_FROM_CONTENT.has(role)) { const t = norm(contentText(el)); if (t) return t; }
  return norm(el.getAttribute('title') || '');
}
function textOfEl(el) { if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) return el.value; return el.textContent; }
function innerTextOf(el) { const t = el.innerText; return typeof t === 'string' ? t : norm(el.textContent); }
function preview(el) {
  const t = el.tagName.toLowerCase(); let attrs = '';
  ['id', 'class', 'type', 'name', 'aria-label', 'data-testid', 'href', 'placeholder'].forEach(a => { if (el.hasAttribute(a)) attrs += ` ${a}="${el.getAttribute(a)}"`; });
  let txt = norm(el.textContent); if (txt.length > 30) txt = txt.slice(0, 30) + '…';
  return `<${t}${attrs.length > 60 ? attrs.slice(0, 60) + '…' : attrs}>${txt}</${t}>`;
}
RT.dom = { isVisible, isDisabled, roleOf, accName, preview };

/* ---------- locator resolution ---------- */
function allEls(scope) { return Array.from(scope.querySelectorAll('*')).filter(e => !/^(HEAD|SCRIPT|STYLE|TITLE|META|LINK|HTML)$/.test(e.tagName) && !e.closest('head')); }
function uniqueOrdered(list, doc) {
  const set = new Set(list); const all = Array.from(doc.querySelectorAll('*'));
  return all.filter(e => set.has(e));
}
function matchStep(scope, s, doc) {
  switch (s.k) {
    case 'css': {
      let sel = s.sel.trim();
      if (sel.startsWith('xpath=') || sel.startsWith('//') || sel.startsWith('(//') || sel.startsWith('..')) {
        const xp = sel.replace(/^xpath=/, ''); const out = [];
        const ctxNode = scope.nodeType === 9 ? doc : scope;
        const r = doc.evaluate(xp.startsWith('/') && scope.nodeType !== 9 ? '.' + xp : xp, ctxNode, null, 7, null);
        for (let i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
        return out.filter(n => n.nodeType === 1);
      }
      if (sel.startsWith('css=')) sel = sel.slice(4);
      const tm = sel.match(/^text=(.*)$/); if (tm) return matchStep(scope, { k: 'text', text: tm[1].replace(/^["']|["']$/g, ''), opts: {} }, doc);
      // support :has-text("x") and :text("x") pseudo (Playwright extensions)
      const ht = sel.match(/^(.*?):has-text\((["'])(.*)\2\)(.*)$/);
      if (ht) { const base = ht[1] || '*'; return Array.from(scope.querySelectorAll(base + ht[4])).filter(e => strMatch(e.textContent, ht[3], false)); }
      try { return Array.from(scope.querySelectorAll(sel)); }
      catch (e) { throw new PWError(`Unexpected token in selector "${s.sel}" — is it valid CSS?`); }
    }
    case 'role': {
      const o = s.opts || {};
      return allEls(scope).filter(el => {
        if (roleOf(el) !== s.role) return false;
        if (!o.includeHidden && (!isVisible(el) || el.closest('[aria-hidden="true"]'))) return false;
        if (o.name !== undefined && !strMatch(accName(el), o.name, o.exact)) return false;
        if (o.level !== undefined) { const lv = el.getAttribute('aria-level') || (/^H[1-6]$/.test(el.tagName) ? el.tagName[1] : null); if (String(lv) !== String(o.level)) return false; }
        if (o.checked !== undefined) { const c = el.getAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : !!el.checked; if (c !== !!o.checked) return false; }
        if (o.disabled !== undefined && isDisabled(el) !== !!o.disabled) return false;
        if (o.selected !== undefined) { const sl = el.getAttribute('aria-selected') ? el.getAttribute('aria-selected') === 'true' : !!el.selected; if (sl !== !!o.selected) return false; }
        if (o.expanded !== undefined && (el.getAttribute('aria-expanded') === 'true') !== !!o.expanded) return false;
        if (o.pressed !== undefined && (el.getAttribute('aria-pressed') === 'true') !== !!o.pressed) return false;
        return true;
      });
    }
    case 'text': {
      const o = s.opts || {};
      const cands = allEls(scope).filter(el => strMatch(textOfEl(el), s.text, o.exact));
      const set = new Set(cands);
      return cands.filter(el => !Array.from(el.querySelectorAll('*')).some(d => set.has(d)) || (o.exact && norm(textOfEl(el)) === norm(s.text) && !Array.from(el.children).some(c => norm(textOfEl(c)) === norm(s.text))));
    }
    case 'label': return allEls(scope).filter(el => {
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) return false;
      const n = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? accName(el) : labelText(el));
      return n && strMatch(n, s.text, s.opts && s.opts.exact);
    });
    case 'placeholder': return allEls(scope).filter(el => el.hasAttribute('placeholder') && strMatch(el.getAttribute('placeholder'), s.text, s.opts && s.opts.exact));
    case 'alt': return allEls(scope).filter(el => el.hasAttribute('alt') && strMatch(el.getAttribute('alt'), s.text, s.opts && s.opts.exact));
    case 'title': return allEls(scope).filter(el => el.hasAttribute('title') && strMatch(el.getAttribute('title'), s.text, s.opts && s.opts.exact));
    case 'testid': return allEls(scope).filter(el => { const v = el.getAttribute(s.attr || 'data-testid'); return v != null && (s.id instanceof RegExp ? s.id.test(v) : v === s.id); });
  }
  return [];
}
function resolveSteps(doc, steps) {
  let cur = [doc];
  for (const s of steps) {
    if (s.k === 'nth') { const i = s.i < 0 ? cur.length + s.i : s.i; cur = cur[i] ? [cur[i]] : []; continue; }
    if (s.k === 'filter') {
      const o = s.opts || {};
      cur = cur.filter(el => {
        if (o.hasText !== undefined && !strMatch(el.textContent, o.hasText, false)) return false;
        if (o.hasNotText !== undefined && strMatch(el.textContent, o.hasNotText, false)) return false;
        if (o.has && resolveSteps(el, o.has._steps).length === 0) return false;
        if (o.hasNot && resolveSteps(el, o.hasNot._steps).length > 0) return false;
        if (o.visible !== undefined && isVisible(el) !== !!o.visible) return false;
        return true;
      });
      continue;
    }
    if (s.k === 'or') { cur = uniqueOrdered(resolveSteps(doc, s.a).concat(resolveSteps(doc, s.b)), doc.nodeType === 9 ? doc : doc.ownerDocument); continue; }
    if (s.k === 'and') { const b = new Set(resolveSteps(doc.nodeType === 9 ? doc : doc.ownerDocument, s.b)); cur = cur.filter(e => b.has(e)); continue; }
    const next = [];
    cur.forEach(sc => matchStep(sc, s, sc.nodeType === 9 ? sc : sc.ownerDocument).forEach(e => next.push(e)));
    const d = (cur[0] && (cur[0].nodeType === 9 ? cur[0] : cur[0].ownerDocument)) || doc;
    cur = uniqueOrdered(next, d);
  }
  return cur.filter(e => e.nodeType === 1);
}

/* ---------- Locator ---------- */
function builderDesc(name, a, o) { return `${name}(${fmtVal(a)}${fmtOpts(o)})`; }
class Locator {
  constructor(page, steps, desc) { this.__kind = 'locator'; this._page = page; this._steps = steps; this._desc = desc; }
  _chain(step, d) { return new Locator(this._page, this._steps.concat([step]), this._desc ? this._desc + '.' + d : d); }
  _resolve() { const doc = this._page._env.doc; return doc ? resolveSteps(doc, this._steps) : []; }
  toString() { return this._desc; }
  locator(sel, opts) {
    if (sel && sel.__kind === 'locator') return this._chain({ k: 'chain', steps: sel._steps }, `locator(${sel._desc})`)._flattenChain();
    let l = this._chain({ k: 'css', sel }, `locator(${sq(sel)})`);
    return opts ? l.filter(opts) : l;
  }
  _flattenChain() { const steps = []; this._steps.forEach(s => s.k === 'chain' ? steps.push(...s.steps) : steps.push(s)); return new Locator(this._page, steps, this._desc); }
  getByRole(role, opts) { return this._chain({ k: 'role', role, opts: opts || {} }, builderDesc('getByRole', role, opts)); }
  getByText(text, opts) { return this._chain({ k: 'text', text, opts: opts || {} }, builderDesc('getByText', text, opts)); }
  getByLabel(text, opts) { return this._chain({ k: 'label', text, opts: opts || {} }, builderDesc('getByLabel', text, opts)); }
  getByPlaceholder(text, opts) { return this._chain({ k: 'placeholder', text, opts: opts || {} }, builderDesc('getByPlaceholder', text, opts)); }
  getByAltText(text, opts) { return this._chain({ k: 'alt', text, opts: opts || {} }, builderDesc('getByAltText', text, opts)); }
  getByTitle(text, opts) { return this._chain({ k: 'title', text, opts: opts || {} }, builderDesc('getByTitle', text, opts)); }
  getByTestId(id) { return this._chain({ k: 'testid', id, attr: this._page._env.testIdAttribute }, builderDesc('getByTestId', id)); }
  first() { return this._chain({ k: 'nth', i: 0 }, 'first()'); }
  last() { return this._chain({ k: 'nth', i: -1 }, 'last()'); }
  nth(i) { return this._chain({ k: 'nth', i: Number(i) }, `nth(${i})`); }
  filter(opts) { return this._chain({ k: 'filter', opts: opts || {} }, `filter(${fmtOpts(opts).replace(/^, /, '')})`); }
  or(other) { return new Locator(this._page, [{ k: 'or', a: this._steps, b: other._steps }], `${this._desc}.or(${other._desc})`); }
  and(other) { return this._chain({ k: 'and', b: other._steps }, `and(${other._desc})`); }
  contentFrame() { return this; }
  page() { return this._page; }

  /* waiting core */
  _strict(els) {
    if (els.length > 1) {
      throw new PWError(`strict mode violation: ${this._desc} resolved to ${els.length} elements:\n` +
        els.slice(0, 6).map((e, i) => `    ${i + 1}) ${preview(e)}`).join('\n') + (els.length > 6 ? `\n    …and ${els.length - 6} more` : '') +
        `\n\nTip: make the locator unique (filter, a more specific role/name) or pick one with first(), last() or nth().`);
    }
  }
  _waitOne(api, opts, conds) {
    const env = this._page._env;
    const timeout = opts && opts.timeout != null ? opts.timeout : env.actionTimeout;
    let last = null;
    const r = env.waitUntil(() => {
      const els = this._resolve();
      this._strict(els);
      if (!els.length) { last = null; return { ok: false }; }
      const el = els[0];
      if (conds.includes('visible') && !isVisible(el)) { last = 'element is not visible'; return { ok: false }; }
      if (conds.includes('enabled') && isDisabled(el)) { last = 'element is not enabled'; return { ok: false }; }
      if (conds.includes('editable') && (el.readOnly || el.getAttribute('aria-readonly') === 'true')) { last = 'element is not editable'; return { ok: false }; }
      return { ok: true, value: el };
    }, timeout);
    if (!r.ok) throw new TimeoutError(`${api}: Timeout ${timeout}ms exceeded.\nCall log:\n  - waiting for ${this._desc}` + (last ? `\n    - locator resolved to 1 element\n    - ${last}, retrying…` : ''));
    return r.value;
  }
  _act(kind, el, value) { const env = this._page._env; env.recordAction(kind, this._desc, value, el); }

  /* queries */
  count() { return this._resolve().length; }
  all() { const n = this.count(); return Array.from({ length: n }, (_, i) => this.nth(i)); }
  allTextContents() { return this._resolve().map(e => e.textContent); }
  allInnerTexts() { return this._resolve().map(innerTextOf); }
  textContent(o) { return this._waitOne('locator.textContent', o, []).textContent; }
  innerText(o) { return innerTextOf(this._waitOne('locator.innerText', o, [])); }
  innerHTML(o) { return this._waitOne('locator.innerHTML', o, []).innerHTML; }
  inputValue(o) { const el = this._waitOne('locator.inputValue', o, []); if (!('value' in el)) throw new PWError('locator.inputValue: Error: Node is not an <input>, <textarea> or <select> element'); return el.value; }
  getAttribute(n, o) { return this._waitOne('locator.getAttribute', o, []).getAttribute(n); }
  _peek() { const els = this._resolve(); this._strict(els); return els[0]; }
  isVisible() { const e = this._peek(); return !!e && isVisible(e); }
  isHidden() { return !this.isVisible(); }
  isEnabled(o) { return !isDisabled(this._waitOne('locator.isEnabled', o, [])); }
  isDisabled(o) { return isDisabled(this._waitOne('locator.isDisabled', o, [])); }
  isChecked(o) { const el = this._waitOne('locator.isChecked', o, []); return el.getAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : !!el.checked; }
  isEditable(o) { const el = this._waitOne('locator.isEditable', o, []); return !isDisabled(el) && !el.readOnly; }
  boundingBox() { const e = this._peek(); return e ? { x: 0, y: 0, width: 100, height: 20 } : null; }

  /* actions */
  click(o) {
    const env = this._page._env; const el = this._waitOne('locator.click', o, ['visible', 'enabled']);
    const btn = o && o.button; const count = (o && o.clickCount) || 1;
    if (btn === 'right') { env.fire(el, 'contextmenu', 'MouseEvent'); this._act('right-click', el); return; }
    env.fire(el, 'mouseover', 'MouseEvent'); env.fire(el, 'mousedown', 'MouseEvent');
    if (el.focus) el.focus(); env.focused = el; env.fire(el, 'mouseup', 'MouseEvent');
    this._act('click', el);
    for (let i = 0; i < count; i++) el.click();
    env.afterAction();
  }
  dblclick(o) { const env = this._page._env; const el = this._waitOne('locator.dblclick', o, ['visible', 'enabled']); el.click(); el.click(); env.fire(el, 'dblclick', 'MouseEvent'); this._act('dblclick', el); env.afterAction(); }
  tap(o) { return this.click(o); }
  hover(o) {
    const env = this._page._env; const el = this._waitOne('locator.hover', o, ['visible']);
    env.hoverTo(el); this._act('hover', el); env.afterAction();
  }
  focus(o) { const el = this._waitOne('locator.focus', o, []); el.focus(); this._page._env.focused = el; this._page._env.fire(el, 'focus', 'FocusEvent', { bubbles: false }); }
  blur(o) { const el = this._waitOne('locator.blur', o, []); el.blur(); this._page._env.fire(el, 'blur', 'FocusEvent', { bubbles: false }); }
  fill(value, o) {
    const env = this._page._env; const el = this._waitOne('locator.fill', o, ['visible', 'enabled', 'editable']);
    if (typeof value !== 'string') throw new PWError(`locator.fill: value: expected string, got ${value === null ? 'null' : typeof value}`);
    const tag = el.tagName, ty = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'INPUT' && ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image'].includes(ty)) throw new PWError(`locator.fill: Error: Input of type "${ty}" cannot be filled`);
    if (!(tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable || el.getAttribute('contenteditable') === 'true')) throw new PWError('locator.fill: Error: Element is not an <input>, <textarea> or [contenteditable] element');
    el.focus(); env.focused = el;
    if ('value' in el && tag !== 'DIV') el.value = value; else el.textContent = value;
    env.fire(el, 'input', 'Event'); env.fire(el, 'change', 'Event');
    this._act('fill', el, value); env.afterAction();
  }
  clear(o) { return this.fill('', o); }
  pressSequentially(text, o) {
    const env = this._page._env; const el = this._waitOne('locator.pressSequentially', o, ['visible', 'enabled', 'editable']);
    el.focus(); env.focused = el; for (const ch of String(text)) env.typeChar(el, ch);
    this._act('type', el, text); env.afterAction();
  }
  type(text, o) { return this.pressSequentially(text, o); }
  press(key, o) {
    const env = this._page._env; const el = this._waitOne('locator.press', o, []);
    if (el.focus) el.focus(); env.focused = el; env.pressKey(el, key);
    this._act('press', el, key); env.afterAction();
  }
  _setCheck(want, api, o) {
    const env = this._page._env; const el = this._waitOne(api, o, ['visible', 'enabled']);
    const isCb = el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type);
    const role = roleOf(el);
    if (!isCb && !['checkbox', 'radio', 'switch', 'menuitemcheckbox'].includes(role) && el.tagName !== 'LABEL') throw new PWError(`${api}: Error: Not a checkbox or radio button`);
    const target = el.tagName === 'LABEL' ? (el.control || el.querySelector('input')) : el;
    const cur = () => target.getAttribute('aria-checked') ? target.getAttribute('aria-checked') === 'true' : !!target.checked;
    if (!want && target.type === 'radio') throw new PWError(`${api}: Error: Cannot uncheck radio button. Radio buttons can only be unchecked by selecting another radio button in the same group.`);
    if (cur() !== want) { el.click(); }
    if (cur() !== want && target.tagName === 'INPUT' && !target.getAttribute('aria-checked')) { target.checked = want; env.fire(target, 'input', 'Event'); env.fire(target, 'change', 'Event'); }
    if (cur() !== want) throw new PWError(`${api}: Error: Clicking the checkbox did not change its state`);
    this._act(want ? 'check' : 'uncheck', el); env.afterAction();
  }
  check(o) { this._setCheck(true, 'locator.check', o); }
  uncheck(o) { this._setCheck(false, 'locator.uncheck', o); }
  setChecked(v, o) { this._setCheck(!!v, 'locator.setChecked', o); }
  selectOption(values, o) {
    const env = this._page._env; const el = this._waitOne('locator.selectOption', o, ['visible', 'enabled']);
    if (el.tagName !== 'SELECT') throw new PWError('locator.selectOption: Error: Element is not a <select> element');
    const list = Array.isArray(values) ? values : [values];
    const opts = Array.from(el.options); const picked = [];
    list.forEach(v => {
      const f = opts.find(op => {
        if (v && typeof v === 'object') return (v.value !== undefined && op.value === v.value) || (v.label !== undefined && norm(op.label || op.textContent) === norm(v.label)) || (v.index !== undefined && op.index === v.index);
        return op.value === String(v) || norm(op.label || op.textContent) === norm(v);
      });
      if (!f) throw new PWError(`locator.selectOption: Error: options not found: ${fmtVal(v)}\nAvailable options: ${opts.map(op => `"${norm(op.textContent)}" (value="${op.value}")`).join(', ')}`);
      picked.push(f);
    });
    opts.forEach(op => { op.selected = picked.includes(op); });
    env.fire(el, 'input', 'Event'); env.fire(el, 'change', 'Event');
    this._act('select', el, picked.map(p => p.value).join(', ')); env.afterAction();
    return picked.map(p => p.value);
  }
  setInputFiles(files, o) { const el = this._waitOne('locator.setInputFiles', o, []); this._act('upload', el, String(files)); this._page._env.fire(el, 'change', 'Event'); }
  dispatchEvent(type, o) { const el = this._waitOne('locator.dispatchEvent', o, []); if (type === 'click') el.click(); else this._page._env.fire(el, type, 'Event'); this._page._env.afterAction(); }
  waitFor(o) {
    const env = this._page._env; const state = (o && o.state) || 'visible';
    const timeout = o && o.timeout != null ? o.timeout : env.actionTimeout;
    const r = env.waitUntil(() => {
      const els = this._resolve();
      const ok = state === 'attached' ? els.length > 0 : state === 'detached' ? els.length === 0 : state === 'hidden' ? !els.some(isVisible) : els.some(isVisible);
      if (els.length > 1 && (state === 'visible' || state === 'attached')) this._strict(els);
      return { ok };
    }, timeout);
    if (!r.ok) throw new TimeoutError(`locator.waitFor: Timeout ${timeout}ms exceeded.\nCall log:\n  - waiting for ${this._desc} to be ${state}`);
  }
  scrollIntoViewIfNeeded() { this._waitOne('locator.scrollIntoViewIfNeeded', null, []); }
  highlight() {}
  screenshot(o) { const env = this._page._env; const el = this._waitOne('locator.screenshot', o, ['visible']); env.snap('screenshot ' + this._desc, el); env.log('📸 screenshot of ' + this._desc + ((o && o.path) ? ' → ' + o.path : '') + ' (simulated)'); return ''; }
  evaluate(fn, arg) { const el = this._waitOne('locator.evaluate', null, []); return this._page._evalIn(fn, arg, el); }
}
RT.Locator = Locator;

/* ---------- keyboard / mouse ---------- */
class Keyboard {
  constructor(page) { this.__kind = 'keyboard'; this._page = page; }
  _target() { const env = this._page._env, d = env.doc; if (env.focused && env.focused.isConnected) return env.focused; return (d && d.activeElement) || (d && d.body); }
  press(key) { const env = this._page._env; const t = this._target(); env.pressKey(t, key); env.recordAction('press', 'keyboard', key, t); env.afterAction(); }
  type(text) { const env = this._page._env; const t = this._target(); for (const ch of String(text)) env.typeChar(t, ch); env.recordAction('type', 'keyboard', text, t); env.afterAction(); }
  insertText(text) { const env = this._page._env; const t = this._target(); if ('value' in t) { t.value += text; env.fire(t, 'input', 'Event'); } }
  down(key) { const t = this._target(); this._page._env.fire(t, 'keydown', 'KeyboardEvent', { key }); }
  up(key) { const t = this._target(); this._page._env.fire(t, 'keyup', 'KeyboardEvent', { key }); }
}
class Mouse {
  constructor(page) { this.__kind = 'mouse'; this._page = page; }
  click() { this._page._env.log('mouse.click at coordinates is not simulated — use a locator instead.'); }
  move() {} down() {} up() {} wheel() {} dblclick() {}
}

/* ---------- dialogs, routes, requests ---------- */
class Dialog {
  constructor(type, message, def) { this.__kind = 'dialog'; this._type = type; this._message = message; this._def = def || ''; this._handled = false; this._result = undefined; }
  type() { return this._type; }
  message() { return this._message; }
  defaultValue() { return this._def; }
  accept(text) { if (this._handled) throw new PWError('dialog.accept: Cannot accept dialog which is already handled!'); this._handled = true; this._result = this._type === 'prompt' ? (text !== undefined ? String(text) : this._def) : true; }
  dismiss() { if (this._handled) throw new PWError('dialog.dismiss: Cannot dismiss dialog which is already handled!'); this._handled = true; this._result = this._type === 'prompt' ? null : false; }
}
class Request {
  constructor(r) { this.__kind = 'request'; this._r = r; }
  url() { return this._r.url; } method() { return this._r.method; }
  postData() { return this._r.body == null ? null : JSON.stringify(this._r.body); }
  postDataJSON() { return this._r.body == null ? null : this._r.body; }
  postDataJson() { return this.postDataJSON(); }
  headers() { return { 'content-type': 'application/json' }; }
  resourceType() { return 'fetch'; }
}
class Route {
  constructor(env, req, decide) { this.__kind = 'route'; this._env = env; this._req = req; this._decide = decide; this._done = false; }
  request() { return new Request(this._req); }
  _once(d) { if (this._done) throw new PWError('route: Route is already handled!'); this._done = true; this._decide(d); }
  fulfill(o) {
    o = o || {}; let json = o.json, status = o.status || 200;
    if (o.response) { status = o.status || o.response.status(); if (json === undefined && o.body === undefined) json = o.response._json; }
    if (json === undefined && o.body !== undefined) { try { json = JSON.parse(o.body); } catch (e) { json = o.body; } }
    this._env.recordAction('route.fulfill', this._req.method + ' ' + this._req.url, String(status));
    this._once({ kind: 'fulfill', status, json });
  }
  abort(code) { this._env.recordAction('route.abort', this._req.method + ' ' + this._req.url, code || 'failed'); this._once({ kind: 'abort' }); }
  continue(o) { this._once({ kind: 'continue', overrides: o }); }
  continue_(o) { return this.continue(o); }
  fallback(o) { this._once({ kind: 'continue', overrides: o }); }
  fetch(o) { const r = this._env.backendCall(this._req.method, this._req.url, (o && o.postData) || this._req.body); return new APIResponse(this._req.url, r); }
}
class APIResponse {
  constructor(url, r) { this.__kind = 'apiResponse'; this._url = url; this._status = r.status; this._json = r.json; this._text = r.text; }
  status() { return this._status; }
  statusText() { return ({ 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' })[this._status] || ''; }
  ok() { return this._status >= 200 && this._status <= 299; }
  url() { return this._url; }
  headers() { return { 'content-type': 'application/json' }; }
  json() { if (this._json === undefined) throw new PWError('apiResponse.json: Response body is empty'); return JSON.parse(JSON.stringify(this._json)); }
  text() { return this._text !== undefined ? this._text : (this._json === undefined ? '' : JSON.stringify(this._json)); }
  body() { return this.text(); }
  dispose() {}
}
class APIRequestContext {
  constructor(env, opts) { this.__kind = 'apiRequestContext'; this._env = env; this._base = (opts && (opts.baseURL || opts.base_url)) || null; this._headers = (opts && opts.extraHTTPHeaders) || {}; }
  _do(method, url, o) {
    o = o || {}; const env = this._env;
    let full; try { full = new URL(url, this._base || env.baseURL || undefined).href; } catch (e) { throw new PWError(`apiRequestContext.${method.toLowerCase()}: Invalid URL "${url}" — set baseURL or use an absolute URL`); }
    if (o.params) { const u = new URL(full); Object.keys(o.params).forEach(k => u.searchParams.set(k, o.params[k])); full = u.href; }
    const origin = new URL(full).origin;
    if (!RT.SITES[origin]) throw new PWError(`apiRequestContext.${method.toLowerCase()}: getaddrinfo ENOTFOUND ${new URL(full).host}`);
    const body = o.data !== undefined ? o.data : o.form;
    env.clock.advance(80);
    const r = env.backendCall(method, full, body, Object.assign({}, this._headers, o.headers || {}));
    env.api.push({ method, url: full, status: r.status, body });
    env.recordAction('api', method + ' ' + full, String(r.status));
    if (o.failOnStatusCode && (r.status < 200 || r.status > 299)) throw new PWError(`apiRequestContext.${method.toLowerCase()}: ${r.status} ${new APIResponse(full, r).statusText()}`);
    return new APIResponse(full, r);
  }
  get(u, o) { return this._do('GET', u, o); } post(u, o) { return this._do('POST', u, o); }
  put(u, o) { return this._do('PUT', u, o); } patch(u, o) { return this._do('PATCH', u, o); }
  delete(u, o) { return this._do('DELETE', u, o); } head(u, o) { return this._do('HEAD', u, o); }
  fetch(u, o) { return this._do(((o && o.method) || 'GET').toUpperCase(), u, o); }
  dispose() {}
  storageState() { return { cookies: [], origins: [] }; }
}
RT.APIResponse = APIResponse; RT.APIRequestContext = APIRequestContext; RT.Route = Route; RT.Dialog = Dialog; RT.Request = Request;

function globToRe(p) {
  if (p instanceof RegExp) return p;
  if (typeof p === 'function') return { test: p };
  let s = ''; const str = String(p);
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '*') { if (str[i + 1] === '*') { s += '.*'; i++; if (str[i + 1] === '/') { s += '/?'; i++; } } else s += '[^/]*'; }
    else if (c === '?') s += '.';
    else if (c === '{') { const e = str.indexOf('}', i); s += '(' + str.slice(i + 1, e).split(',').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')'; i = e; }
    else s += c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  }
  return new RegExp('^' + s + '$');
}
RT.globToRe = globToRe;

/* ---------- BrowserContext & Page ---------- */
class BrowserContext {
  constructor(page) { this.__kind = 'browserContext'; this._page = page; }
  pages() { return [this._page]; }
  newPage() { throw new PWError('This simulator runs one page per test. Use the page fixture.'); }
  cookies() { return Object.entries(this._page._env.sessions).filter(([, s]) => s && s.user).map(([o, s]) => ({ name: 'session', value: s.user, domain: new URL(o).host })); }
  addCookies() { this._page._env.log('context.addCookies: cookies are simulated as app sessions.'); }
  clearCookies() { this._page._env.sessions = {}; }
  storageState(o) { const st = { cookies: this.cookies(), origins: [] }; if (o && o.path) this._page._env.log('💾 storage state saved → ' + o.path + ' (simulated)'); return st; }
  route(p, h) { return this._page.route(p, h); }
  unroute(p) { return this._page.unroute(p); }
  close() {}
  request() { return this._page.request; }
}
class Page {
  constructor(env) {
    this.__kind = 'page'; this._env = env; this._handlers = {}; this._routes = [];
    this.keyboard = new Keyboard(this); this.mouse = new Mouse(this);
    this.request = new APIRequestContext(env); this._ctx = new BrowserContext(this);
    this._root = new Locator(this, [], '');
  }
  /* navigation */
  goto(url, o) { const env = this._env; env.recordAction('goto', 'page', url); env.navigate(url, true); env.afterAction(); return null; }
  reload() { this._env.recordAction('reload', 'page'); this._env.navigate(this._env.url, true); this._env.afterAction(); }
  goBack() { const env = this._env; if (env.history.length > 1) { env.history.pop(); const prev = env.history.pop(); env.navigate(prev, true); } env.afterAction(); return null; }
  goForward() { return null; }
  url() { return this._env.url; }
  title() { return this._env.doc ? this._env.doc.title : ''; }
  content() { return this._env.doc ? '<html>' + this._env.doc.documentElement.innerHTML + '</html>' : ''; }
  setContent(html) { this._env.setContent(html); }
  context() { return this._ctx; }
  waitForTimeout(ms) { this._env.calls.waitForTimeout = (this._env.calls.waitForTimeout || 0) + 1; this._env.clock.advance(Number(ms) || 0); this._env.recordAction('wait', 'page', ms + 'ms'); }
  waitForLoadState() {}
  waitForURL(url, o) {
    const env = this._env; const timeout = o && o.timeout != null ? o.timeout : env.actionTimeout;
    const r = env.waitUntil(() => ({ ok: urlMatches(env.url, url, env) }), timeout);
    if (!r.ok) throw new TimeoutError(`page.waitForURL: Timeout ${timeout}ms exceeded.\n  waiting for navigation to ${fmtVal(url)}\n  current URL: "${env.url}"`);
  }
  waitForSelector(sel, o) { const l = this.locator(sel); l.waitFor(o); return l; }
  waitForResponse(p, o) {
    const env = this._env; const re = globToRe(p); const start = env.net.length; const timeout = (o && o.timeout) || env.actionTimeout;
    const r = env.waitUntil(() => { const hit = env.net.slice(0).reverse().find(n => n.done && re.test(n.url)); return { ok: !!hit, value: hit }; }, timeout);
    if (!r.ok) throw new TimeoutError(`page.waitForResponse: Timeout ${timeout}ms exceeded while waiting for ${fmtVal(p)}`);
    return new APIResponse(r.value.url, { status: r.value.status, json: r.value.json });
  }
  /* locators */
  locator(s, o) { return this._root.locator(s, o); }
  getByRole(r, o) { return this._root.getByRole(r, o); }
  getByText(t, o) { return this._root.getByText(t, o); }
  getByLabel(t, o) { return this._root.getByLabel(t, o); }
  getByPlaceholder(t, o) { return this._root.getByPlaceholder(t, o); }
  getByAltText(t, o) { return this._root.getByAltText(t, o); }
  getByTitle(t, o) { return this._root.getByTitle(t, o); }
  getByTestId(t) { return this._root.getByTestId(t); }
  frameLocator(s) { this._env.log('frameLocator: the practice sites have no iframes — searching the main page.'); return this._root; }
  /* legacy element-handle style shortcuts */
  click(s, o) { return this.locator(s).click(o); }
  fill(s, v, o) { return this.locator(s).fill(v, o); }
  press(s, k, o) { return this.locator(s).press(k, o); }
  check(s, o) { return this.locator(s).check(o); }
  type(s, t, o) { return this.locator(s).pressSequentially(t, o); }
  hover(s, o) { return this.locator(s).hover(o); }
  selectOption(s, v, o) { return this.locator(s).selectOption(v, o); }
  textContent(s, o) { return this.locator(s).textContent(o); }
  innerText(s, o) { return this.locator(s).innerText(o); }
  inputValue(s, o) { return this.locator(s).inputValue(o); }
  getAttribute(s, n, o) { return this.locator(s).getAttribute(n, o); }
  isVisible(s) { return this.locator(s).isVisible(); }
  isChecked(s) { return this.locator(s).isChecked(); }
  isEnabled(s) { return this.locator(s).isEnabled(); }
  dblclick(s, o) { return this.locator(s).dblclick(o); }
  /* events */
  on(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push({ fn, once: false }); return this; }
  once(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push({ fn, once: true }); return this; }
  off(ev, fn) { this._handlers[ev] = (this._handlers[ev] || []).filter(h => h.fn !== fn); return this; }
  removeListener(ev, fn) { return this.off(ev, fn); }
  _emit(ev, obj) {
    const hs = this._handlers[ev] || []; if (!hs.length) return false;
    this._handlers[ev] = hs.filter(h => !h.once);
    hs.forEach(h => this._env.callUser(h.fn, [obj]));
    return true;
  }
  /* network */
  route(p, handler, o) { this._routes.unshift({ re: globToRe(p), raw: p, handler, times: o && o.times }); this._env.calls.route = (this._env.calls.route || 0); this._env.recordAction('route', 'page', String(p)); }
  unroute(p) { this._routes = this._routes.filter(r => String(r.raw) !== String(p)); }
  unrouteAll() { this._routes = []; }
  /* misc */
  screenshot(o) { this._env.snap('page.screenshot'); this._env.log('📸 page screenshot' + ((o && o.path) ? ' → ' + o.path : '') + (o && o.fullPage ? ' (full page)' : '') + ' (simulated)'); return ''; }
  setViewportSize(s) { this._env.viewport = s; }
  viewportSize() { return this._env.viewport || { width: 1280, height: 720 }; }
  pause() { this._env.log('⏸ page.pause() opens the Playwright Inspector in a real run. Skipped in the simulator.'); }
  bringToFront() {} close() {} isClosed() { return false; }
  evaluate(fn, arg) { return this._evalIn(fn, arg); }
  _evalIn(fn, arg, el) {
    const doc = this._env.doc; const win = doc.defaultView || G;
    const src = typeof fn === 'function' ? fn.toString() : String(fn);
    let f; try { f = new win.Function('document', '__arg', '__el', 'return (' + src + ')(' + (el ? '__el' : '__arg') + (el ? ', __arg' : '') + ')'); }
    catch (e) { try { f = new win.Function('document', 'return (' + src + ')'); } catch (e2) { throw new PWError('page.evaluate: ' + e2.message); } }
    try { const r = f(doc, arg, el); return typeof r === 'function' ? r() : r; } catch (e) { throw new PWError('page.evaluate: ' + e.message); }
  }
}
RT.Page = Page;

function urlMatches(actual, expected, env) {
  if (expected instanceof RegExp) { expected.lastIndex = 0; return expected.test(actual); }
  if (typeof expected === 'function') return !!expected(new URL(actual));
  let exp = String(expected);
  if (!/^[a-z]+:/.test(exp) && env.baseURL) { try { exp = new URL(exp, env.baseURL).href; } catch (e) {} }
  if (exp.includes('*')) return globToRe(exp).test(actual);
  return actual === exp;
}

/* ---------- expect ---------- */
function deepEq(a, b) { return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b)); }
function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object' && !(v instanceof RegExp)) { const o = {}; Object.keys(v).sort().forEach(k => o[k] = sortKeys(v[k])); return o; } return v; }
function show(v) { if (typeof v === 'string') return JSON.stringify(v); if (v instanceof RegExp) return String(v); if (v === undefined) return 'undefined'; if (v && v.__kind) return '<' + v.__kind + '>'; try { return JSON.stringify(v); } catch (e) { return String(v); } }

class Expect {
  constructor(env, actual, neg, msg, soft) { this.__kind = 'expect'; this._env = env; this._a = actual; this._neg = !!neg; this._msg = msg; this._soft = !!soft; }
  get not() { return new Expect(this._env, this._a, !this._neg, this._msg, this._soft); }
  _isWeb() { const k = this._a && this._a.__kind; return k === 'locator' || k === 'page' || k === 'apiResponse'; }
  _fail(name, lines, args) {
    const head = `expect(${this._kindName()})${this._neg ? '.not' : ''}.${name}(${args || ''}) failed`;
    const msg = (this._msg ? this._msg + '\n\n' : '') + head + '\n\n' + lines.join('\n');
    this._env.recordAssert(name, false, this._neg, this._a, msg);
    const err = new PWError(msg); err.assertion = true;
    if (this._soft) { this._env.softErrors.push(err); return; }
    throw err;
  }
  _pass(name) { this._env.recordAssert(name, true, this._neg, this._a); }
  _kindName() { const k = this._a && this._a.__kind; return k === 'locator' ? 'locator' : k === 'page' ? 'page' : k === 'apiResponse' ? 'response' : 'received'; }
  /* polling helper for web-first assertions */
  _poll(name, test, describe, o, args) {
    const env = this._env; const timeout = o && o.timeout != null ? o.timeout : env.expectTimeout;
    let last;
    const r = env.waitUntil(() => { last = test(); return { ok: last.pass !== this._neg }; }, timeout);
    if (r.ok) return this._pass(name);
    const lines = [];
    if (this._a.__kind === 'locator') lines.push('Locator: ' + this._a._desc);
    describe(lines, last);
    lines.push('Timeout: ' + timeout + 'ms');
    if (last && last.notFound) lines.push('', 'Call log:', '  - waiting for ' + this._a._desc, '  - element(s) not found');
    this._fail(name, lines, args);
  }
  _els() { return this._a._resolve(); }
  _single(name) {
    const els = this._els();
    if (els.length > 1) { try { this._a._strict(els); } catch (e) { const err = new PWError(`expect(locator).${name}() failed\n\n` + e.message); throw err; } }
    return els[0] || null;
  }
  _req(kind) { if (!this._a || this._a.__kind !== kind) throw new PWError(`expect: this matcher needs a ${kind === 'locator' ? 'Locator (e.g. page.getByRole(…))' : kind === 'page' ? 'Page' : 'APIResponse'} — received ${show(this._a)}`); }
  _state(name, pred, label, o) {
    this._req('locator');
    this._poll(name, () => { const el = this._single(name); if (!el) return { pass: false, notFound: true, rec: '<element(s) not found>' }; return { pass: pred(el), rec: pred(el) ? label : 'not ' + label }; },
      (L, l) => { L.push('Expected: ' + (this._neg ? 'not ' : '') + label); L.push('Received: ' + (l ? l.rec : '?')); }, o);
  }
  toBeVisible(o) { if (o && o.visible === false) return this.not.toBeVisible(); this._req('locator'); this._poll('toBeVisible', () => { const els = this._els(); if (els.length > 1) this._single('toBeVisible'); const el = els[0]; return { pass: !!el && isVisible(el), notFound: !el, rec: !el ? '<element(s) not found>' : isVisible(el) ? 'visible' : 'hidden' }; }, (L, l) => { L.push('Expected: ' + (this._neg ? 'not visible' : 'visible')); L.push('Received: ' + (l ? l.rec : '?')); }, o); }
  toBeHidden(o) { this._req('locator'); this._poll('toBeHidden', () => { const els = this._els(); if (els.length > 1) this._single('toBeHidden'); const el = els[0]; return { pass: !el || !isVisible(el), rec: !el ? 'hidden (not in DOM)' : isVisible(el) ? 'visible' : 'hidden' }; }, (L, l) => { L.push('Expected: ' + (this._neg ? 'not hidden' : 'hidden')); L.push('Received: ' + (l ? l.rec : '?')); }, o); }
  toBeEnabled(o) { this._state('toBeEnabled', el => !isDisabled(el), 'enabled', o); }
  toBeDisabled(o) { this._state('toBeDisabled', el => isDisabled(el), 'disabled', o); }
  toBeEditable(o) { this._state('toBeEditable', el => !isDisabled(el) && !el.readOnly, 'editable', o); }
  toBeFocused(o) { this._state('toBeFocused', el => el === this._env.focused || el.ownerDocument.activeElement === el, 'focused', o); }
  toBeAttached(o) { this._req('locator'); this._poll('toBeAttached', () => { const n = this._els().length; return { pass: n > 0, rec: n ? 'attached' : 'detached' }; }, (L, l) => { L.push('Expected: ' + (this._neg ? 'detached' : 'attached')); L.push('Received: ' + l.rec); }, o); }
  toBeEmpty(o) { this._state('toBeEmpty', el => ('value' in el && el.tagName !== 'LI' && el.tagName !== 'BUTTON') ? el.value === '' : norm(el.textContent) === '', 'empty', o); }
  toBeChecked(o) { const want = !(o && o.checked === false); this._state('toBeChecked', el => { const c = el.getAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : !!el.checked; return c === want; }, want ? 'checked' : 'unchecked', o); }
  _text(name, expected, o, contain) {
    this._req('locator');
    const useInner = o && o.useInnerText; const ic = o && o.ignoreCase;
    const get = el => norm(useInner ? innerTextOf(el) : textOfEl(el));
    const cmp = (rec, exp) => {
      if (exp instanceof RegExp) { exp.lastIndex = 0; return exp.test(rec); }
      let a = rec, b = norm(exp); if (ic) { a = a.toLowerCase(); b = b.toLowerCase(); }
      return contain ? a.includes(b) : a === b;
    };
    const isArr = Array.isArray(expected);
    this._poll(name, () => {
      if (isArr) { const recs = this._els().map(get); const pass = contain ? expected.every((e, i) => recs.some(r => cmp(r, e))) && recs.length >= expected.length : recs.length === expected.length && recs.every((r, i) => cmp(r, expected[i])); return { pass, rec: recs }; }
      const el = this._single(name); if (!el) return { pass: false, notFound: true, rec: '<element(s) not found>' };
      const rec = get(el); return { pass: cmp(rec, expected), rec };
    }, (L, l) => {
      const label = isArr ? 'array' : expected instanceof RegExp ? 'pattern' : (contain ? 'substring' : 'string');
      L.push(`Expected ${label}: ${this._neg ? 'not ' : ''}${isArr ? JSON.stringify(expected.map(x => x instanceof RegExp ? String(x) : x)) : show(expected)}`);
      L.push(`Received ${isArr ? 'array' : 'string'}: ${l && typeof l.rec !== 'string' ? JSON.stringify(l.rec) : (l && l.notFound ? l.rec : show(l && l.rec))}`);
    }, o, show(expected));
  }
  toHaveText(e, o) { this._text('toHaveText', e, o, false); }
  toContainText(e, o) { this._text('toContainText', e, o, true); }
  toHaveValue(v, o) {
    this._req('locator');
    this._poll('toHaveValue', () => { const el = this._single('toHaveValue'); if (!el) return { pass: false, notFound: true, rec: '<element(s) not found>' }; const rec = el.value; return { pass: v instanceof RegExp ? v.test(rec) : rec === String(v), rec }; },
      (L, l) => { L.push('Expected: ' + (this._neg ? 'not ' : '') + show(v)); L.push('Received: ' + show(l && l.rec)); }, o, show(v));
  }
  toHaveAttribute(n, v, o) {
    this._req('locator'); if (v && typeof v === 'object' && !(v instanceof RegExp)) { o = v; v = undefined; }
    this._poll('toHaveAttribute', () => { const el = this._single('toHaveAttribute'); if (!el) return { pass: false, notFound: true }; const rec = el.getAttribute(n); return { pass: v === undefined ? rec !== null : v instanceof RegExp ? rec !== null && v.test(rec) : rec === String(v), rec }; },
      (L, l) => { L.push(`Expected attribute ${n}: ${this._neg ? 'not ' : ''}${v === undefined ? '(present)' : show(v)}`); L.push('Received: ' + show(l && l.rec)); }, o);
  }
  toHaveClass(c, o) {
    this._req('locator');
    this._poll('toHaveClass', () => { const el = this._single('toHaveClass'); if (!el) return { pass: false, notFound: true }; const rec = el.getAttribute('class') || ''; return { pass: c instanceof RegExp ? c.test(rec) : norm(rec) === norm(c), rec }; },
      (L, l) => { L.push('Expected: ' + show(c)); L.push('Received: ' + show(l && l.rec)); }, o);
  }
  toContainClass(c, o) { this._req('locator'); this._poll('toContainClass', () => { const el = this._single('toContainClass'); if (!el) return { pass: false, notFound: true }; return { pass: el.classList.contains(c), rec: el.getAttribute('class') }; }, (L, l) => { L.push('Expected class: ' + show(c)); L.push('Received: ' + show(l && l.rec)); }, o); }
  toHaveId(id, o) { this.toHaveAttribute('id', id, o); }
  toHaveCount(n, o) {
    this._req('locator');
    this._poll('toHaveCount', () => { const rec = this._els().length; return { pass: rec === n, rec }; }, (L, l) => { L.push('Expected: ' + (this._neg ? 'not ' : '') + n); L.push('Received: ' + (l ? l.rec : '?')); }, o, String(n));
  }
  toHaveAccessibleName(n, o) { this._req('locator'); this._poll('toHaveAccessibleName', () => { const el = this._single('toHaveAccessibleName'); if (!el) return { pass: false, notFound: true }; const rec = accName(el); return { pass: strMatch(rec, n, true), rec }; }, (L, l) => { L.push('Expected: ' + show(n)); L.push('Received: ' + show(l && l.rec)); }, o); }
  toHaveScreenshot(name, o) { this._env.snap('toHaveScreenshot'); this._env.log('🖼 toHaveScreenshot: the first run writes a baseline image; later runs compare pixels. Simulated as a pass here.'); this._pass('toHaveScreenshot'); }
  toHaveURL(u, o) {
    this._req('page'); const env = this._env;
    this._poll('toHaveURL', () => ({ pass: urlMatches(env.url, u, env), rec: env.url }), (L, l) => { L.push('Expected: ' + (this._neg ? 'not ' : '') + show(u)); L.push('Received: ' + show(l.rec)); }, o, show(u));
  }
  toHaveUrl(u, o) { return this.toHaveURL(u, o); }
  toHaveTitle(t, o) {
    this._req('page'); const env = this._env;
    this._poll('toHaveTitle', () => { const rec = env.doc ? env.doc.title : ''; return { pass: t instanceof RegExp ? t.test(rec) : rec === String(t), rec }; }, (L, l) => { L.push('Expected: ' + (this._neg ? 'not ' : '') + show(t)); L.push('Received: ' + show(l.rec)); }, o, show(t));
  }
  toBeOK() { this._req('apiResponse'); const ok = this._a.ok(); if (ok !== this._neg) return this._pass('toBeOK'); this._fail('toBeOK', ['Expected: ' + (this._neg ? 'not ' : '') + 'status 2xx', 'Received: ' + this._a.status() + ' ' + this._a.statusText()]); }
  toBeOk() { return this.toBeOK(); }
  /* generic (non-retrying) matchers */
  _g(name, pass, expected, extra) {
    if (pass !== this._neg) return this._pass(name);
    const lines = []; if (expected !== undefined) lines.push('Expected: ' + (this._neg ? 'not ' : '') + show(expected));
    lines.push('Received: ' + show(this._a)); if (extra) lines.push(extra);
    this._fail(name, lines, expected !== undefined ? 'expected' : '');
  }
  toBe(e) { this._g('toBe', Object.is(this._a, e), e); }
  toEqual(e) { this._g('toEqual', deepEq(this._a, e), e); }
  toStrictEqual(e) { this._g('toStrictEqual', deepEq(this._a, e), e); }
  toMatchObject(e) { const a = this._a; this._g('toMatchObject', !!a && Object.keys(e).every(k => deepEq(a[k], e[k])), e); }
  toContain(e) { const a = this._a; this._g('toContain', a != null && (typeof a === 'string' ? a.includes(e) : Array.from(a).some(x => Object.is(x, e))), e); }
  toContainEqual(e) { this._g('toContainEqual', Array.from(this._a || []).some(x => deepEq(x, e)), e); }
  toBeTruthy() { this._g('toBeTruthy', !!this._a); }
  toBeFalsy() { this._g('toBeFalsy', !this._a); }
  toBeNull() { this._g('toBeNull', this._a === null, null); }
  toBeUndefined() { this._g('toBeUndefined', this._a === undefined); }
  toBeDefined() { this._g('toBeDefined', this._a !== undefined); }
  toBeNaN() { this._g('toBeNaN', Number.isNaN(this._a)); }
  toBeGreaterThan(n) { this._g('toBeGreaterThan', this._a > n, '> ' + n); }
  toBeGreaterThanOrEqual(n) { this._g('toBeGreaterThanOrEqual', this._a >= n, '>= ' + n); }
  toBeLessThan(n) { this._g('toBeLessThan', this._a < n, '< ' + n); }
  toBeLessThanOrEqual(n) { this._g('toBeLessThanOrEqual', this._a <= n, '<= ' + n); }
  toBeCloseTo(n, d) { const p = Math.pow(10, -(d == null ? 2 : d)) / 2; this._g('toBeCloseTo', Math.abs(this._a - n) < p, n); }
  toHaveLength(n) { this._g('toHaveLength', this._a != null && this._a.length === n, n, 'Received length: ' + (this._a ? this._a.length : 'n/a')); }
  toHaveProperty(k, v) { const a = this._a; const has = a != null && k.split('.').reduce((o, p) => (o != null && p in Object(o)) ? o[p] : undefined, a) !== undefined; const val = has ? k.split('.').reduce((o, p) => o[p], a) : undefined; this._g('toHaveProperty', has && (arguments.length < 2 || deepEq(val, v)), arguments.length < 2 ? k : { [k]: v }); }
  toMatch(re) { this._g('toMatch', typeof this._a === 'string' && (re instanceof RegExp ? re.test(this._a) : this._a.includes(re)), re); }
  toBeInstanceOf(c) { this._g('toBeInstanceOf', this._a instanceof c); }
  toThrow() { let threw = false; try { this._a(); } catch (e) { threw = true; } this._g('toThrow', threw); }
}
RT.Expect = Expect;
RT.makeExpect = function (env, unwrap) {
  const expect = (a, m) => new Expect(env, unwrap(a), false, typeof m === 'string' ? m : (m && m.message), false);
  expect.soft = (a, m) => new Expect(env, unwrap(a), false, typeof m === 'string' ? m : (m && m.message), true);
  expect.configure = () => expect;
  expect.poll = () => { throw new PWError('expect.poll is not supported in the simulator — use a web-first assertion instead.'); };
  expect.set_options = () => {};
  return expect;
};
RT.urlMatches = urlMatches;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== Playwright Path · virtual browser environment + practice sites ===== */
(function (G) {
'use strict';
const RT = G.PWRT;
const { PWError, Clock, Page, Route, Dialog } = RT;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const BASE_CSS = `*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1f2933;background:#fff}
main{max-width:720px;margin:0 auto;padding:20px}h1{font-size:26px;margin:.2em 0 .5em}h2{font-size:20px;margin:.8em 0 .4em}h3{font-size:16px;margin:.2em 0}
label{display:block;font-weight:600;margin:10px 0 4px}input:not([type=checkbox]):not([type=radio]),select,textarea{width:100%;padding:9px 10px;border:1px solid #c5ccd6;border-radius:6px;font:inherit;background:#fff;color:inherit}
button{font:inherit;padding:8px 14px;border-radius:6px;border:1px solid #2f5d8a;background:#2f5d8a;color:#fff;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}
button.ghost{background:#fff;color:#2f5d8a}a{color:#2f5d8a}[hidden]{display:none!important}.error{background:#fde8e8;color:#9b1c1c;border:1px solid #f5b5b5;padding:8px 12px;border-radius:6px;margin:10px 0}
.success{background:#e6f6ec;color:#17603a;border:1px solid #a8dcbc;padding:8px 12px;border-radius:6px;margin:10px 0}.muted{color:#66788a;font-size:13px}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e3e8ee;padding:8px;text-align:left}pre{background:#f5f7fa;padding:12px;border-radius:6px;overflow:auto;font-size:13px}
[data-pw-hl]{outline:3px solid #e2483d!important;outline-offset:2px;background-color:rgba(226,72,61,.08)!important}`;

/* ------------------------------------------------------------------ */
/* Pocket Shop — https://shop.test                                     */
/* ------------------------------------------------------------------ */
const PRODUCTS = [
  { id: 1, name: 'Trail Backpack', price: 29.99, desc: 'Carries a laptop and a lunch.', icon: '🎒' },
  { id: 2, name: 'Bike Light', price: 9.99, desc: 'Three modes, USB charging.', icon: '🔦' },
  { id: 3, name: 'Graphic Tee', price: 15.99, desc: 'Soft cotton, printed locally.', icon: '👕' },
  { id: 4, name: 'Fleece Jacket', price: 49.99, desc: 'Warm without the weight.', icon: '🧥' },
  { id: 5, name: 'Baby Onesie', price: 7.99, desc: 'For the smallest testers.', icon: '🍼' },
  { id: 6, name: 'Rain Shell', price: 39.99, desc: 'Packs into its own pocket.', icon: '🌧️' }
];
const money = n => '$' + n.toFixed(2);
const shopHeader = (s) => `<header class="top"><a href="/inventory" class="brand">Pocket Shop</a>
  <nav><a href="/cart" class="cart" aria-label="Cart">🛒 <span class="badge" data-testid="cart-badge"${s.cart.length ? '' : ' hidden'}>${s.cart.length}</span></a>
  <button class="ghost" id="logout">Log out</button></nav></header>`;
function wireHeader(doc, ctx) {
  const lo = doc.getElementById('logout'); if (lo) lo.addEventListener('click', () => { ctx.session.user = null; ctx.session.cart = []; ctx.nav('/'); });
}
const SHOP = {
  name: 'Pocket Shop', origin: 'https://shop.test',
  css: `.top{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;background:#16324f;color:#fff}.top a{color:#fff;text-decoration:none}.brand{font-weight:700;font-size:18px}
.top nav{display:flex;gap:14px;align-items:center}.badge{background:#e2483d;border-radius:10px;padding:0 7px;font-size:12px;font-weight:700}
.products{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.product{border:1px solid #e3e8ee;border-radius:8px;padding:12px}
.product .icon{font-size:30px}.price{font-weight:700}.login{max-width:360px;margin:30px auto}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}
.cart-list{list-style:none;padding:0}.cart-list li{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e3e8ee;padding:8px 0}`,
  route(path, s, u) {
    const guarded = ['/inventory', '/cart', '/checkout', '/checkout/overview', '/checkout/complete'];
    if (guarded.includes(path) && !s.user) return { redirect: '/?error=' + encodeURIComponent(path) };
    if (path === '/') return {
      title: 'Pocket Shop', html: `<main class="login"><h1>Pocket Shop</h1>
      <form id="login-form" novalidate>
        <label for="username">Username</label><input id="username" name="username" data-testid="username" autocomplete="off">
        <label for="password">Password</label><input id="password" name="password" type="password" data-testid="password">
        <div role="alert" class="error" hidden></div>
        <p><button type="submit" data-testid="login-button">Log in</button></p>
      </form>
      <p class="muted">Test users: <b>standard_user</b>, <b>locked_out_user</b>. Password for all: <b>secret_sauce</b></p></main>`,
      setup(doc, ctx) {
        const f = doc.getElementById('login-form'), err = doc.querySelector('[role=alert]'), btn = f.querySelector('button');
        const show = m => { err.textContent = m; err.hidden = false; };
        const q = ctx.url.searchParams.get('error'); if (q) show(`You can only access '${q}' when you are logged in.`);
        f.addEventListener('submit', e => {
          e.preventDefault(); err.hidden = true;
          const u = doc.getElementById('username').value.trim(), p = doc.getElementById('password').value;
          if (!u) return show('Username is required');
          if (!p) return show('Password is required');
          btn.disabled = true; btn.textContent = 'Logging in…';
          ctx.fetch('POST', '/api/login', { username: u, password: p }, (st, j) => {
            btn.disabled = false; btn.textContent = 'Log in';
            if (st === 200) { ctx.session.user = u; ctx.nav('/inventory'); } else show((j && j.error) || 'Login failed');
          }, 400);
        });
      }
    };
    if (path === '/inventory') return {
      title: 'Pocket Shop', html: shopHeader(s) + `<main><div class="row"><h2>Products</h2>
        <div><label for="sort" style="display:inline;margin-right:6px">Sort</label><select id="sort" style="width:auto">
        <option value="az">Name (A to Z)</option><option value="za">Name (Z to A)</option><option value="lohi">Price (low to high)</option><option value="hilo">Price (high to low)</option></select></div></div>
        <ul class="products"></ul></main>`,
      setup(doc, ctx) {
        wireHeader(doc, ctx);
        const ul = doc.querySelector('.products'), badge = doc.querySelector('[data-testid=cart-badge]');
        let order = PRODUCTS.slice().sort((a, b) => a.name.localeCompare(b.name));
        const render = () => {
          ul.innerHTML = order.map(p => { const inCart = ctx.session.cart.includes(p.id); return `<li class="product" data-testid="product"><div class="icon" aria-hidden="true">${p.icon}</div>
            <h3 class="name">${p.name}</h3><p class="muted">${p.desc}</p><div class="row"><span class="price">${money(p.price)}</span>
            <button data-id="${p.id}" class="${inCart ? 'ghost' : ''}">${inCart ? 'Remove' : 'Add to cart'}</button></div></li>`; }).join('');
          badge.textContent = ctx.session.cart.length; badge.hidden = !ctx.session.cart.length;
        };
        ul.addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return; const id = +b.dataset.id; const c = ctx.session.cart;
          if (c.includes(id)) c.splice(c.indexOf(id), 1); else c.push(id); render();
        });
        doc.getElementById('sort').addEventListener('change', e => {
          const v = e.target.value; order = PRODUCTS.slice();
          order.sort(v === 'az' ? (a, b) => a.name.localeCompare(b.name) : v === 'za' ? (a, b) => b.name.localeCompare(a.name) : v === 'lohi' ? (a, b) => a.price - b.price : (a, b) => b.price - a.price);
          render();
        });
        render();
      }
    };
    if (path === '/cart') return {
      title: 'Pocket Shop — Cart', html: shopHeader(s) + `<main><h2>Your cart</h2><ul class="cart-list"></ul><p class="empty muted" hidden>Your cart is empty.</p>
        <div class="row"><a href="/inventory">Continue shopping</a><button id="checkout">Checkout</button></div></main>`,
      setup(doc, ctx) {
        wireHeader(doc, ctx);
        const ul = doc.querySelector('.cart-list'), empty = doc.querySelector('.empty'), badge = doc.querySelector('[data-testid=cart-badge]');
        const render = () => {
          const items = ctx.session.cart.map(id => PRODUCTS.find(p => p.id === id));
          ul.innerHTML = items.map(p => `<li data-testid="cart-item"><span><b class="name">${p.name}</b> <span class="price">${money(p.price)}</span></span><button class="ghost" data-id="${p.id}">Remove</button></li>`).join('');
          empty.hidden = items.length > 0; badge.textContent = items.length; badge.hidden = !items.length;
        };
        ul.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const c = ctx.session.cart; c.splice(c.indexOf(+b.dataset.id), 1); render(); });
        doc.getElementById('checkout').addEventListener('click', () => ctx.nav('/checkout'));
        render();
      }
    };
    if (path === '/checkout') return {
      title: 'Pocket Shop — Checkout', html: shopHeader(s) + `<main><h2>Checkout: your details</h2><form id="co" novalidate>
        <label for="first">First name</label><input id="first"><label for="last">Last name</label><input id="last">
        <label for="zip">Postal code</label><input id="zip"><div role="alert" class="error" hidden></div>
        <div class="row" style="margin-top:12px"><a href="/cart">Cancel</a><button type="submit">Continue</button></div></form></main>`,
      setup(doc, ctx) {
        wireHeader(doc, ctx);
        const err = doc.querySelector('[role=alert]');
        doc.getElementById('co').addEventListener('submit', e => {
          e.preventDefault();
          const [f, l, z] = ['first', 'last', 'zip'].map(id => doc.getElementById(id).value.trim());
          const m = !f ? 'First name is required' : !l ? 'Last name is required' : !z ? 'Postal code is required' : '';
          if (m) { err.textContent = m; err.hidden = false; return; }
          ctx.session.buyer = f + ' ' + l; ctx.nav('/checkout/overview');
        });
      }
    };
    if (path === '/checkout/overview') {
      const items = s.cart.map(id => PRODUCTS.find(p => p.id === id)); const sub = items.reduce((a, p) => a + p.price, 0); const tax = Math.round(sub * 8) / 100;
      return {
        title: 'Pocket Shop — Overview', html: shopHeader(s) + `<main><h2>Checkout: overview</h2><ul class="cart-list">${items.map(p => `<li data-testid="cart-item"><b class="name">${p.name}</b><span class="price">${money(p.price)}</span></li>`).join('')}</ul>
        <p data-testid="subtotal">Item total: ${money(sub)}</p><p data-testid="tax">Tax: ${money(tax)}</p><p data-testid="total"><b>Total: ${money(sub + tax)}</b></p>
        <div class="row"><a href="/inventory">Cancel</a><button id="finish">Finish</button></div></main>`,
        setup(doc, ctx) { wireHeader(doc, ctx); doc.getElementById('finish').addEventListener('click', () => { ctx.session.cart = []; ctx.nav('/checkout/complete'); }); }
      };
    }
    if (path === '/checkout/complete') return {
      title: 'Pocket Shop — Complete', html: shopHeader(s) + `<main style="text-align:center"><div style="font-size:48px" aria-hidden="true">📦</div><h2>Thank you for your order!</h2>
      <p>Your order has been dispatched and will arrive soon.</p><button id="home">Back home</button></main>`,
      setup(doc, ctx) { wireHeader(doc, ctx); doc.getElementById('home').addEventListener('click', () => ctx.nav('/inventory')); }
    };
    return null;
  },
  api(method, u, body, state) {
    if (u.pathname === '/api/login' && method === 'POST') {
      const b = body || {};
      if (b.password !== 'secret_sauce' || !['standard_user', 'locked_out_user'].includes(b.username)) return { status: 401, json: { error: 'Username and password do not match any user.' } };
      if (b.username === 'locked_out_user') return { status: 403, json: { error: 'Sorry, this user has been locked out.' } };
      return { status: 200, json: { user: b.username } };
    }
    if (u.pathname === '/api/products') return { status: 200, json: PRODUCTS.map(({ icon, ...p }) => p) };
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Todos — https://todo.test                                           */
/* ------------------------------------------------------------------ */
const TODO = {
  name: 'Todos', origin: 'https://todo.test',
  css: `main{max-width:520px}h1{font-size:44px;font-weight:200;color:#b83f45;text-align:center;letter-spacing:.02em}
.todo-list{list-style:none;padding:0;margin:0;border-top:1px solid #e3e8ee}.todo-list li{display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid #e3e8ee}
.todo-list li label{flex:1;margin:0;font-weight:400}.todo-list li.completed label{text-decoration:line-through;color:#9aa5b1}.destroy{background:none;border:none;color:#b83f45;font-size:20px;padding:0 6px}.destroy::after{content:"×"}
footer.bar{display:flex;justify-content:space-between;align-items:center;padding:10px 4px;font-size:13px;color:#52606d}.filters{list-style:none;display:flex;gap:6px;padding:0;margin:0}
.filters a{padding:2px 7px;border:1px solid transparent;border-radius:4px;text-decoration:none;color:inherit}.filters a.selected{border-color:#d9b3b5}.clear{background:none;border:none;color:#52606d;padding:0}`,
  route(path) {
    if (path !== '/') return null;
    return {
      title: 'Todos', html: `<main><h1>todos</h1><input class="new-todo" placeholder="What needs to be done?" aria-label="New todo" autofocus>
        <p class="loading muted">Loading…</p><div role="alert" class="error" hidden></div>
        <ul class="todo-list"></ul>
        <footer class="bar" hidden><span data-testid="todo-count"></span>
        <ul class="filters"><li><a href="#/" class="selected">All</a></li><li><a href="#/active">Active</a></li><li><a href="#/completed">Completed</a></li></ul>
        <button class="clear" hidden>Clear completed</button></footer></main>`,
      setup(doc, ctx) {
        let todos = [], filter = (ctx.url.hash || '#/').slice(2) || 'all', seq = 1;
        const ul = doc.querySelector('.todo-list'), foot = doc.querySelector('footer.bar'), count = doc.querySelector('[data-testid=todo-count]'), clear = doc.querySelector('.clear');
        const input = doc.querySelector('.new-todo'), loading = doc.querySelector('.loading'), err = doc.querySelector('[role=alert]');
        const render = () => {
          const shown = todos.filter(t => filter === 'active' ? !t.completed : filter === 'completed' ? t.completed : true);
          ul.innerHTML = shown.map(t => `<li data-testid="todo-item" data-id="${t.id}" class="${t.completed ? 'completed' : ''}"><input type="checkbox" class="toggle" aria-label="Toggle todo"${t.completed ? ' checked' : ''}><label>${esc(t.title)}</label><button class="destroy" aria-label="Delete"></button></li>`).join('');
          const left = todos.filter(t => !t.completed).length;
          count.innerHTML = `<strong>${left}</strong> ${left === 1 ? 'item' : 'items'} left`;
          foot.hidden = todos.length === 0; clear.hidden = !todos.some(t => t.completed);
          doc.querySelectorAll('.filters a').forEach(a => a.classList.toggle('selected', (a.getAttribute('href').slice(2) || 'all') === filter));
        };
        ctx.fetch('GET', '/api/todos', null, (st, j) => {
          loading.hidden = true;
          if (st >= 200 && st < 300 && Array.isArray(j)) { todos = j.map(t => ({ id: seq++, title: String(t.title), completed: !!t.completed })); render(); }
          else { err.textContent = 'Could not load todos'; err.hidden = false; }
        }, 300);
        input.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return; const v = input.value.trim(); if (!v) return;
          todos.push({ id: seq++, title: v, completed: false }); input.value = ''; render();
        });
        ul.addEventListener('change', e => { if (!e.target.classList.contains('toggle')) return; const id = +e.target.closest('li').dataset.id; const t = todos.find(x => x.id === id); t.completed = e.target.checked; render(); });
        ul.addEventListener('click', e => { if (!e.target.classList.contains('destroy')) return; const id = +e.target.closest('li').dataset.id; todos = todos.filter(x => x.id !== id); render(); });
        clear.addEventListener('click', () => { todos = todos.filter(t => !t.completed); render(); });
        ctx.onHash(h => { filter = (h || '#/').slice(2) || 'all'; render(); });
      }
    };
  },
  api(method, u, body, state) {
    if (u.pathname === '/api/todos') {
      if (method === 'GET') return { status: 200, json: state.todos };
      if (method === 'POST') { const t = { title: body && body.title, completed: false }; state.todos.push(t); return { status: 201, json: t }; }
    }
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Playground — https://play.test                                      */
/* ------------------------------------------------------------------ */
const PEOPLE = [['Aisha Khan', 'aisha@team.test', 'Admin'], ['Ben Carter', 'ben@team.test', 'Editor'], ['Chen Wei', 'chen@team.test', 'Viewer'], ['Dana Silva', 'dana@team.test', 'Editor']];
const PLAY = {
  name: 'Playground', origin: 'https://play.test',
  css: `.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;list-style:none;padding:0}.cards a{display:block;padding:14px;border:1px solid #e3e8ee;border-radius:8px;text-decoration:none}
section{border:1px solid #e3e8ee;border-radius:8px;padding:12px 14px;margin:12px 0}fieldset{border:1px solid #e3e8ee;border-radius:6px;margin:12px 0}fieldset label{display:inline-flex;gap:6px;font-weight:400;margin-right:14px}
.check{display:flex;gap:8px;font-weight:400}.menu{position:relative;display:inline-block}.menu ul{position:absolute;list-style:none;margin:0;padding:6px;background:#fff;border:1px solid #c5ccd6;border-radius:6px;min-width:140px}
.menu li a{display:block;padding:6px 8px}[role=tooltip]{display:inline-block;margin-left:8px;background:#1f2933;color:#fff;padding:3px 8px;border-radius:4px;font-size:13px}`,
  route(path) {
    if (path === '/') return { title: 'Playground', html: `<main><h1>Playground</h1><p>Practice pages for common UI patterns.</p><ul class="cards">
      <li><a href="/forms">Forms</a></li><li><a href="/dynamic">Dynamic content</a></li><li><a href="/dialogs">Dialogs</a></li><li><a href="/hover">Hover menu</a></li><li><a href="/table">Data table</a></li></ul></main>` };
    if (path === '/forms') return {
      title: 'Playground — Forms', html: `<main><h1>Create your account</h1><form id="signup" novalidate>
        <label for="name">Full name</label><input id="name" name="name">
        <label for="email">Email</label><input id="email" type="email" placeholder="you@example.com">
        <label for="password">Password</label><input id="password" type="password">
        <label for="country">Country</label><select id="country"><option value="">Choose…</option><option value="pk">Pakistan</option><option value="in">India</option><option value="uk">United Kingdom</option><option value="us">United States</option><option value="de">Germany</option></select>
        <fieldset><legend>Plan</legend><label><input type="radio" name="plan" value="free" checked> Free</label><label><input type="radio" name="plan" value="pro"> Pro</label></fieldset>
        <label class="check"><input type="checkbox" id="terms"> I agree to the terms</label>
        <p><button type="submit" disabled>Create account</button></p></form>
        <div role="alert" class="error" hidden></div><div role="status" class="success" hidden></div></main>`,
      setup(doc, ctx) {
        const f = doc.getElementById('signup'), btn = f.querySelector('button'), terms = doc.getElementById('terms');
        const err = doc.querySelector('[role=alert]'), ok = doc.querySelector('[role=status]');
        terms.addEventListener('change', () => { btn.disabled = !terms.checked; });
        f.addEventListener('submit', e => {
          e.preventDefault(); err.hidden = true;
          const v = id => doc.getElementById(id).value.trim();
          const m = !v('name') ? 'Full name is required' : !v('email').includes('@') ? 'Enter a valid email address' : doc.getElementById('password').value.length < 8 ? 'Password must be at least 8 characters' : !v('country') ? 'Choose a country' : '';
          if (m) { err.textContent = m; err.hidden = false; return; }
          const plan = f.querySelector('input[name=plan]:checked').value === 'pro' ? 'Pro' : 'Free';
          btn.disabled = true; btn.textContent = 'Creating…';
          ctx.setTimeout(() => { btn.textContent = 'Create account'; ok.textContent = `Welcome, ${v('name').split(' ')[0]}! Your ${plan} plan is ready.`; ok.hidden = false; }, 500);
        });
      }
    };
    if (path === '/dynamic') return {
      title: 'Playground — Dynamic', html: `<main><h1>Dynamic content</h1>
        <section><h2>Delayed text</h2><button id="start">Start</button><p id="loading" hidden>Loading…</p><h3 id="finish" hidden>Hello World!</h3></section>
        <section><h2>Delayed enable</h2><button id="late" disabled>Enabled soon</button><p id="late-msg"></p></section>
        <section><h2>Slow report</h2><button id="report-btn">Generate report</button><p role="status" id="report"></p></section>
        <section><h2>Load more</h2><ul id="items"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul><button id="more">Load more</button></section></main>`,
      setup(doc, ctx) {
        const $ = id => doc.getElementById(id);
        $('start').addEventListener('click', () => { $('start').hidden = true; $('loading').hidden = false; ctx.setTimeout(() => { $('loading').hidden = true; $('finish').hidden = false; }, 2000); });
        ctx.setTimeout(() => { $('late').disabled = false; $('late').textContent = 'Click me'; }, 3000);
        $('late').addEventListener('click', () => { $('late-msg').textContent = 'Clicked!'; });
        $('report-btn').addEventListener('click', () => { $('report').textContent = 'Generating…'; ctx.setTimeout(() => { $('report').textContent = 'Report ready'; }, 8000); });
        $('more').addEventListener('click', () => { $('more').disabled = true; ctx.setTimeout(() => { const ul = $('items'); const n = ul.children.length; for (let i = 1; i <= 3; i++) { const li = doc.createElement('li'); li.textContent = 'Item ' + (n + i); ul.appendChild(li); } $('more').disabled = false; }, 1500); });
      }
    };
    if (path === '/dialogs') return {
      title: 'Playground — Dialogs', html: `<main><h1>Dialogs</h1><p><button id="a">Show alert</button> <button id="c">Show confirm</button> <button id="p">Show prompt</button></p><p role="status" id="result"></p></main>`,
      setup(doc, ctx) {
        const r = doc.getElementById('result');
        doc.getElementById('a').addEventListener('click', () => { ctx.alert('Hello from the playground!'); r.textContent = 'Alert closed'; });
        doc.getElementById('c').addEventListener('click', () => { r.textContent = 'You clicked: ' + (ctx.confirm('Delete this file?') ? 'OK' : 'Cancel'); });
        doc.getElementById('p').addEventListener('click', () => { const v = ctx.prompt('What is your name?', 'Guest'); r.textContent = v === null ? 'You cancelled the prompt' : 'You entered: ' + v; });
      }
    };
    if (path === '/hover') return {
      title: 'Playground — Hover', html: `<main><h1>Hover menu</h1><nav aria-label="Main"><div class="menu"><button aria-haspopup="true" aria-expanded="false">Account</button>
        <ul role="menu" hidden><li><a role="menuitem" href="/profile">Profile</a></li><li><a role="menuitem" href="/settings">Settings</a></li></ul></div></nav>
        <p style="margin-top:90px"><button class="ghost" id="help">Help</button><span role="tooltip" hidden>We reply within 24 hours</span></p></main>`,
      setup(doc) {
        const m = doc.querySelector('.menu'), ul = m.querySelector('ul'), b = m.querySelector('button');
        m.addEventListener('mouseenter', () => { ul.hidden = false; b.setAttribute('aria-expanded', 'true'); });
        m.addEventListener('mouseleave', () => { ul.hidden = true; b.setAttribute('aria-expanded', 'false'); });
        const h = doc.getElementById('help'), tip = doc.querySelector('[role=tooltip]');
        h.addEventListener('mouseenter', () => { tip.hidden = false; }); h.addEventListener('mouseleave', () => { tip.hidden = true; });
      }
    };
    if (path === '/profile' || path === '/settings') return { title: 'Playground — ' + (path === '/profile' ? 'Profile' : 'Settings'), html: `<main><h1>${path === '/profile' ? 'Your profile' : 'Settings'}</h1><p><a href="/hover">Back</a></p></main>` };
    if (path === '/table') return {
      title: 'Playground — Table', html: `<main><h1>Team</h1><table><caption class="muted" style="text-align:left">Team members</caption><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead>
        <tbody>${PEOPLE.map(p => `<tr><td>${p[0]}</td><td>${p[1]}</td><td>${p[2]}</td><td><button class="ghost">Edit</button></td></tr>`).join('')}</tbody></table><p role="status" id="status"></p></main>`,
      setup(doc) {
        doc.querySelector('tbody').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; doc.getElementById('status').textContent = 'Editing ' + b.closest('tr').cells[0].textContent; });
      }
    };
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* REST API — https://api.test                                         */
/* ------------------------------------------------------------------ */
const API = {
  name: 'Users API', origin: 'https://api.test',
  route(path, s, u, env) {
    const r = API.api('GET', u, null, env.state);
    if (!r) return { title: 'Not found', html: '<pre>{"error":"Not found"}</pre>' };
    return { title: 'api.test' + path, html: `<pre>${esc(JSON.stringify(r.json, null, 2))}</pre>` };
  },
  api(method, u, body, state, env, headers) {
    const p = u.pathname.replace(/\/+$/, '') || '/';
    const stamp = () => new Date(Date.UTC(2026, 0, 1) + (env ? env.clock.now : 0)).toISOString();
    if (p === '/' && method === 'GET') return { status: 200, json: { name: 'Users API', endpoints: ['GET /users', 'GET /users/:id', 'POST /users', 'PUT /users/:id', 'DELETE /users/:id', 'POST /login'] } };
    if (p === '/users' && method === 'GET') {
      let data = state.users; const role = u.searchParams.get('job'); if (role) data = data.filter(x => x.job.toLowerCase() === role.toLowerCase());
      return { status: 200, json: { total: data.length, data } };
    }
    if (p === '/users' && method === 'POST') {
      const b = body || {}; if (!b.name) return { status: 400, json: { error: 'name is required' } };
      const nu = { id: state.nextId++, name: String(b.name), job: String(b.job || ''), createdAt: stamp() }; state.users.push({ id: nu.id, name: nu.name, job: nu.job });
      return { status: 201, json: nu };
    }
    const m = p.match(/^\/users\/(\d+)$/);
    if (m) {
      const id = +m[1]; const i = state.users.findIndex(x => x.id === id);
      if (method === 'GET') return i < 0 ? { status: 404, json: { error: 'User not found' } } : { status: 200, json: { data: state.users[i] } };
      if (method === 'PUT' || method === 'PATCH') { if (i < 0) return { status: 404, json: { error: 'User not found' } }; Object.assign(state.users[i], body || {}); return { status: 200, json: Object.assign({}, state.users[i], { updatedAt: stamp() }) }; }
      if (method === 'DELETE') { if (i < 0) return { status: 404, json: { error: 'User not found' } }; state.users.splice(i, 1); return { status: 204, text: '' }; }
    }
    if (p === '/login' && method === 'POST') {
      const b = body || {}; if (!b.email) return { status: 400, json: { error: 'Missing email' } }; if (!b.password) return { status: 400, json: { error: 'Missing password' } };
      if (b.email === 'qa@example.com' && b.password === 'secret') return { status: 200, json: { token: 'pw-token-123' } };
      return { status: 401, json: { error: 'Invalid credentials' } };
    }
    if (p === '/me' && method === 'GET') {
      const auth = headers && (headers.Authorization || headers.authorization);
      return auth === 'Bearer pw-token-123' ? { status: 200, json: { email: 'qa@example.com' } } : { status: 401, json: { error: 'Unauthorized' } };
    }
    return null;
  }
};

const SITES = RT.SITES = {};
[SHOP, TODO, PLAY, API].forEach(s => SITES[s.origin] = s);
RT.SITE_LIST = [
  { url: 'https://shop.test/', name: 'Pocket Shop', about: 'Login, product list, cart and checkout' },
  { url: 'https://todo.test/', name: 'Todos', about: 'Add, complete and filter todos (loads from /api/todos)' },
  { url: 'https://play.test/', name: 'Playground', about: 'Forms, dynamic content, dialogs, hover menu, table' },
  { url: 'https://api.test/', name: 'Users API', about: 'REST endpoints for API testing' }
];

function freshState() {
  return { users: [{ id: 1, name: 'Aisha Khan', job: 'QA Lead' }, { id: 2, name: 'Ben Carter', job: 'Developer' }, { id: 3, name: 'Chen Wei', job: 'Designer' }], nextId: 4, todos: [] };
}

/* ------------------------------------------------------------------ */
/* Env: one isolated browser context per test                         */
/* ------------------------------------------------------------------ */
class Env {
  constructor(frame, opts) {
    opts = opts || {};
    this.frame = frame; this.clock = new Clock();
    this.url = 'about:blank'; this.history = []; this.sessions = {}; this.state = freshState();
    this.net = []; this.api = []; this.actions = []; this.asserts = []; this.trace = []; this.logs = [];
    this.calls = {}; this.softErrors = []; this.handlerErrors = [];
    this.actionTimeout = opts.actionTimeout || 30000; this.expectTimeout = opts.expectTimeout || 5000;
    this.baseURL = opts.baseURL || null; this.testIdAttribute = opts.testIdAttribute || 'data-testid';
    this.navId = 0; this.hovered = null; this.hashHandler = null; this.line = 0;
    this.onEvent = opts.onEvent || null; this.wrap = x => x; this.selectAll = null;
    this.page = new Page(this);
    this.setContent('');
  }
  get doc() { return this.frame.contentDocument; }
  emit(e) { if (this.onEvent) try { this.onEvent(e); } catch (x) {} }
  sessionFor(origin) { return this.sessions[origin] = this.sessions[origin] || { user: null, cart: [] }; }
  _write(headExtra, bodyHtml, title) {
    const doc = this.doc;
    doc.documentElement.innerHTML = `<head><meta charset="utf-8"><title></title><style>${BASE_CSS}${headExtra || ''}</style></head><body>${bodyHtml}</body>`;
    doc.title = title || '';
    const body = doc.body;
    body.addEventListener('click', e => {
      const sb = e.target && e.target.closest && e.target.closest('button,input[type=submit],input[type=image]');
      if (sb && !e.defaultPrevented && sb.form && !sb.disabled && (sb.tagName === 'INPUT' || (sb.getAttribute('type') || 'submit').toLowerCase() === 'submit')) { e.preventDefault(); this.fire(sb.form, 'submit', 'Event'); return; }
      const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
      if (e.defaultPrevented) return; e.preventDefault();
      const href = a.getAttribute('href');
      if (href.startsWith('#')) return this.hashChange(href);
      this.navigate(new URL(href, this.url.startsWith('http') ? this.url : undefined).href, false);
    });
    body.addEventListener('submit', e => e.preventDefault());
  }
  setContent(html) { this.navId++; this._write('', html, ''); this.url = 'about:blank'; this.emit({ type: 'nav', url: this.url }); }
  hashChange(h) { const u = new URL(this.url); u.hash = h; this.url = u.href; if (this.hashHandler) this.hashHandler(h); this.emit({ type: 'nav', url: this.url }); }
  navigate(raw, fromApi, depth) {
    depth = depth || 0;
    if (raw === 'about:blank') { this.setContent(''); return; }
    let u;
    try { u = new URL(raw, this.url.startsWith('http') ? this.url : (this.baseURL || undefined)); }
    catch (e) { throw new PWError(`page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL\n  navigating to "${raw}"` + (!this.baseURL && !/^[a-z]+:/i.test(raw) ? '\n  Tip: relative URLs need a baseURL (set in the config) or an absolute URL like https://shop.test/' : '')); }
    const site = SITES[u.origin];
    this.navId++; this.hashHandler = null;
    if (!site) {
      this._write('', `<main><h1>This site can’t be reached</h1><p>${esc(u.host)}’s server IP address could not be found.</p><p class="muted">Practice sites: ${RT.SITE_LIST.map(s => s.url).join(', ')}</p></main>`, u.host);
      this.url = u.href; this.emit({ type: 'nav', url: this.url });
      if (fromApi) throw new PWError(`page.goto: net::ERR_NAME_NOT_RESOLVED at ${u.href}`);
      return;
    }
    const sess = this.sessionFor(u.origin);
    const res = site.route(u.pathname, sess, u, this);
    if (res && res.redirect && depth < 5) return this.navigate(new URL(res.redirect, u.origin).href, fromApi, depth + 1);
    if (!res) {
      this._write(site.css, `<main><h1>404</h1><p>Page not found: ${esc(u.pathname)}</p></main>`, '404 Not Found');
      this.url = u.href; this.history.push(u.href); this.emit({ type: 'nav', url: this.url }); return;
    }
    this._write(site.css, res.html, res.title);
    this.url = u.href; this.history.push(u.href); this.hovered = null; this.focused = null;
    if (res.setup) res.setup(this.doc, this.pageCtx(u, site));
    this.emit({ type: 'nav', url: this.url });
  }
  pageCtx(u, site) {
    const env = this, navId = this.navId, doc = this.doc;
    return {
      url: u, doc, session: this.sessionFor(u.origin), state: this.state,
      nav: p => { if (navId === env.navId) env.navigate(new URL(p, env.url).href, false); },
      setTimeout: (fn, ms) => env.clock.setTimeout(() => { if (navId === env.navId) fn(); }, ms),
      fetch: (method, path, body, cb, latency) => env.siteFetch(navId, method, new URL(path, env.url).href, body, cb, latency == null ? 300 : latency),
      alert: m => env.dialog('alert', m), confirm: m => env.dialog('confirm', m), prompt: (m, d) => env.dialog('prompt', m, d),
      onHash: fn => { env.hashHandler = fn; }
    };
  }
  backendCall(method, url, body, headers) {
    let u; try { u = new URL(url); } catch (e) { return { status: 404, json: { error: 'Bad URL' } }; }
    const site = SITES[u.origin];
    const r = site && site.api ? site.api(method, u, body, this.state, this, headers) : null;
    return r || { status: 404, json: { error: 'Not found' } };
  }
  siteFetch(navId, method, url, body, cb, latency) {
    const req = { method, url, body, done: false }; this.net.push(req);
    const deliver = (status, json, lat) => this.clock.setTimeout(() => { req.done = true; req.status = status; req.json = json; if (navId === this.navId) cb(status, json); }, lat);
    const real = () => { const r = this.backendCall(method, url, body); deliver(r.status, r.json, latency); };
    const page = this.page; const rt = page._routes.find(r => r.re.test(url));
    if (!rt) return real();
    if (rt.times != null) { rt.times--; if (rt.times <= 0) page._routes = page._routes.filter(x => x !== rt); }
    req.routed = true;
    const route = new Route(this, req, d => { if (d.kind === 'fulfill') deliver(d.status, d.json, 30); else if (d.kind === 'abort') deliver(0, null, 30); else real(); });
    this.callUser(rt.handler, [route]);
  }
  dialog(type, msg, def) {
    const d = new Dialog(type, msg, def);
    this.recordAction('dialog', type, msg);
    if (!this.page._emit('dialog', d)) { this.log(`💬 ${type}("${msg}") was auto-dismissed — no page.on('dialog') handler was registered`); return type === 'alert' ? undefined : type === 'prompt' ? null : false; }
    if (!d._handled) { this.log('⚠ The dialog handler did not call accept() or dismiss(). The dialog was dismissed.'); return type === 'prompt' ? null : false; }
    return d._result;
  }
  callUser(fn, args) {
    try {
      const r = fn.apply(null, args.map(a => this.wrap(a)));
      if (r && typeof r.then === 'function') {
        const set = this.asyncHandlers = this.asyncHandlers || new Set(); const pr = Promise.resolve(r);
        set.add(pr); pr.then(() => set.delete(pr), e => { set.delete(pr); this.handlerErrors.push(e); this.log('✖ Error in handler: ' + (e && e.message)); });
      }
    } catch (e) { this.handlerErrors.push(e); this.log('✖ Error in handler: ' + (e && e.message)); }
  }
  waitUntil(check, timeout) {
    const deadline = this.clock.now + timeout; this.clock.runDue();
    for (let i = 0; i < 20000; i++) {
      const r = check(); if (r.ok) return r;
      const n = this.clock.next();
      if (n <= deadline) { this.clock.now = Math.max(this.clock.now, n); this.clock.runDue(); }
      else { this.clock.advance(Math.max(0, deadline - this.clock.now)); return check(); }
    }
    return { ok: false };
  }
  fire(el, type, ctor, init) {
    const W = el.ownerDocument.defaultView || G; const C = W[ctor] || W.Event;
    let ev; try { ev = new C(type, Object.assign({ bubbles: true, cancelable: true }, init || {})); } catch (e) { ev = new W.Event(type, Object.assign({ bubbles: true, cancelable: true }, init || {})); }
    return el.dispatchEvent(ev);
  }
  typeChar(el, ch) {
    const ok = this.fire(el, 'keydown', 'KeyboardEvent', { key: ch });
    if (ok && el && 'value' in el && !/^(checkbox|radio|button|submit)$/i.test(el.type || '')) { el.value += ch; this.fire(el, 'input', 'Event'); }
    this.fire(el, 'keyup', 'KeyboardEvent', { key: ch });
  }
  pressKey(el, combo) {
    const parts = String(combo).split('+'); let key = parts.pop() || '+'; if (key === '' && combo.endsWith('+')) key = '+';
    const mods = new Set(parts.map(p => p.toLowerCase().replace('controlormeta', 'control')));
    if (key === 'Space') key = ' ';
    const init = { key, ctrlKey: mods.has('control'), metaKey: mods.has('meta'), shiftKey: mods.has('shift'), altKey: mods.has('alt') };
    if (!el) return;
    const ok = this.fire(el, 'keydown', 'KeyboardEvent', init);
    if (ok) {
      const ctrl = init.ctrlKey || init.metaKey; const isText = 'value' in el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|button|submit)$/i.test(el.type || '');
      if (ctrl && key.toLowerCase() === 'a') this.selectAll = el;
      else if (key === 'Enter') {
        if (el.tagName === 'INPUT' && el.form && isText) this.fire(el.form, 'submit', 'Event');
        else if (/^(BUTTON|A)$/.test(el.tagName)) el.click();
        else if (el.tagName === 'TEXTAREA') { el.value += '\n'; this.fire(el, 'input', 'Event'); }
      }
      else if (key === ' ' && (el.tagName === 'BUTTON' || /^(checkbox|radio)$/i.test(el.type || ''))) el.click();
      else if ((key === 'Backspace' || key === 'Delete') && isText) { el.value = this.selectAll === el ? '' : (key === 'Backspace' ? el.value.slice(0, -1) : el.value); this.selectAll = null; this.fire(el, 'input', 'Event'); }
      else if (key === 'Tab') { const f = Array.from(el.ownerDocument.querySelectorAll('a[href],button,input,select,textarea')).filter(x => !x.disabled && RT.dom.isVisible(x)); const i = f.indexOf(el); const n = f[(i + (init.shiftKey ? -1 : 1) + f.length) % f.length]; if (n) { n.focus(); this.focused = n; } }
      else if (key.length === 1 && !ctrl && isText) { if (this.selectAll === el) { el.value = ''; this.selectAll = null; } el.value += key; this.fire(el, 'input', 'Event'); }
    }
    this.fire(el, 'keyup', 'KeyboardEvent', init);
  }
  hoverTo(el) {
    if (this.hovered === el) return;
    if (this.hovered && this.hovered.isConnected) {
      let n = this.hovered; while (n && n.nodeType === 1 && !n.contains(el)) { this.fire(n, 'mouseleave', 'MouseEvent', { bubbles: false }); n = n.parentElement; }
      this.fire(this.hovered, 'mouseout', 'MouseEvent');
    }
    const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { if (this.hovered && this.hovered.isConnected && n.contains(this.hovered) && n !== el) break; chain.unshift(n); }
    this.fire(el, 'mouseover', 'MouseEvent');
    chain.forEach(n => this.fire(n, 'mouseenter', 'MouseEvent', { bubbles: false }));
    this.fire(el, 'mousemove', 'MouseEvent');
    this.hovered = el;
  }
  afterAction() { this.clock.runDue(); }
  log(m) { this.logs.push({ t: this.clock.now, m: String(m), line: this.line }); this.emit({ type: 'log', m }); }
  recordAction(kind, target, value, el) {
    const a = { kind, target, value, url: this.url, t: this.clock.now, line: this.line };
    this.actions.push(a);
    this.snap(kind + (target && target !== 'page' ? ' ' + target : '') + (value !== undefined && value !== '' ? ' → ' + value : ''), el);
  }
  recordAssert(name, pass, neg, target, msg) {
    const desc = target && target._desc ? target._desc : target && target.__kind === 'page' ? 'page' : '';
    this.asserts.push({ matcher: name, pass, neg, target: desc, line: this.line });
    let el = null; if (target && target.__kind === 'locator') { try { const els = target._resolve(); if (els.length === 1) el = els[0]; } catch (e) {} }
    this.snap((pass ? '✓ ' : '✗ ') + 'expect' + (desc ? '(' + desc + ')' : '') + (neg ? '.not' : '') + '.' + name, el, !pass);
  }
  snap(title, el, failed) {
    const doc = this.doc; if (!doc) return;
    try {
      doc.querySelectorAll('input,textarea').forEach(i => { if (/^(checkbox|radio)$/i.test(i.type)) { if (i.checked) i.setAttribute('checked', ''); else i.removeAttribute('checked'); } else if (i.tagName === 'TEXTAREA') i.textContent = i.value; else i.setAttribute('value', i.value); });
      doc.querySelectorAll('option').forEach(o => { if (o.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
      if (el && el.isConnected) el.setAttribute('data-pw-hl', '');
      const html = doc.documentElement.innerHTML;
      if (el && el.isConnected) el.removeAttribute('data-pw-hl');
      this.trace.push({ title, html, url: this.url, t: this.clock.now, line: this.line, failed: !!failed });
      this.emit({ type: 'step', title, failed: !!failed });
    } catch (e) {}
  }
}
RT.Env = Env; RT.freshState = freshState;
/* A same-origin in-memory document that stands in for an iframe. Immune to page sandboxing. */
RT.createVirtualFrame = () => ({ contentDocument: G.document.implementation.createHTMLDocument('') });
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== Playwright Path · Python (pytest-playwright subset) → JavaScript translator ===== */
(function (G) {
'use strict';
const RT = G.PWRT;

class PySyntaxError extends Error { constructor(m, line) { super(m); this.name = 'SyntaxError'; this.pyLine = line; } }
RT.PySyntaxError = PySyntaxError;

const OPS3 = ['**=', '//=', '>>=', '<<=', '...'];
const OPS2 = ['==', '!=', '<=', '>=', '->', '**', '//', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', ':=', '<<', '>>'];
const OPS1 = '()[]{},:.;+-*/%<>=@&|^~!';

/* ---------- tokenizer → logical lines ---------- */
function tokenize(src) {
  src = src.replace(/\r\n?/g, '\n');
  const lines = []; let toks = [], i = 0, n = src.length, line = 1, depth = 0, atStart = true, curIndent = 0, startLine = 1;
  const reStr = /([rRbBuUfF]{1,2})?("""|'''|"|')/y, reNum = /(0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?j?|\.\d+)/y, reName = /[A-Za-z_][A-Za-z0-9_]*/y;
  const push = t => { if (!toks.length) startLine = line; t.line = line; toks.push(t); };
  while (i < n) {
    if (atStart && depth === 0) {
      let col = 0; while (i < n && (src[i] === ' ' || src[i] === '\t')) { col += src[i] === '\t' ? 4 : 1; i++; }
      if (i >= n) break;
      if (src[i] === '\n') { i++; line++; continue; }
      if (src[i] === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      curIndent = col; atStart = false;
    }
    const c = src[i];
    if (c === '\n') { i++; line++; if (depth > 0) continue; if (toks.length) { lines.push({ indent: curIndent, toks, line: startLine }); toks = []; } atStart = true; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    reStr.lastIndex = i; let m = reStr.exec(src);
    if (m) {
      const prefix = (m[1] || '').toLowerCase(), q = m[2]; let j = i + m[0].length, body = '', sl = line, closed = false;
      while (j < n) {
        if (src[j] === '\\') { body += src[j] + (src[j + 1] || ''); if (src[j + 1] === '\n') line++; j += 2; continue; }
        if (src.startsWith(q, j)) { j += q.length; closed = true; break; }
        if (src[j] === '\n') { if (q.length === 1) throw new PySyntaxError('unterminated string literal', sl); line++; }
        body += src[j]; j++;
      }
      if (!closed) throw new PySyntaxError('unterminated string literal', sl);
      if (!toks.length) startLine = sl; toks.push({ t: 'str', v: body, prefix, q, line: sl }); i = j; continue;
    }
    reNum.lastIndex = i; m = reNum.exec(src);
    if (m && /[\d.]/.test(c) && !(c === '.' && !/\d/.test(src[i + 1] || ''))) { push({ t: 'num', v: m[0].replace(/_/g, '') }); i += m[0].length; continue; }
    reName.lastIndex = i; m = reName.exec(src);
    if (m) { push({ t: 'name', v: m[0] }); i += m[0].length; continue; }
    const o3 = src.substr(i, 3), o2 = src.substr(i, 2);
    if (OPS3.includes(o3)) { push({ t: 'op', v: o3 }); i += 3; continue; }
    if (OPS2.includes(o2)) { push({ t: 'op', v: o2 }); i += 2; continue; }
    if (OPS1.includes(c)) {
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
      push({ t: 'op', v: c }); i++; continue;
    }
    throw new PySyntaxError(`invalid character '${c}'`, line);
  }
  if (toks.length) lines.push({ indent: curIndent, toks, line: startLine });
  return lines;
}

/* ---------- bracket grouping ---------- */
function group(toks, line) {
  const root = []; const stack = [{ items: root }];
  for (const t of toks) {
    if (t.t === 'op' && '([{'.includes(t.v)) { const g = { g: t.v, items: [], line: t.line }; stack[stack.length - 1].items.push(g); stack.push(g); }
    else if (t.t === 'op' && ')]}'.includes(t.v)) { if (stack.length === 1) throw new PySyntaxError(`unmatched '${t.v}'`, t.line); stack.pop(); }
    else stack[stack.length - 1].items.push(t);
  }
  if (stack.length > 1) throw new PySyntaxError(`'${stack[stack.length - 1].g}' was never closed`, line);
  return root;
}
const isName = (x, v) => x && x.t === 'name' && (v === undefined || x.v === v);
const isOp = (x, v) => x && x.t === 'op' && (v === undefined || x.v === v);
function splitTop(items, pred) { const out = [[]]; for (const it of items) { if (pred(it)) out.push([]); else out[out.length - 1].push(it); } return out; }
const splitComma = items => { const s = splitTop(items, it => isOp(it, ',')); if (s.length > 1 && s[s.length - 1].length === 0) s.pop(); return s; };
function srcOf(items) {
  return items.map(it => it.g ? it.g + srcOf(it.items) + ({ '(': ')', '[': ']', '{': '}' })[it.g] : it.t === 'str' ? (it.prefix || '') + it.q + it.v + it.q : it.v).join(' ').replace(/ ([.,)\]]) ?/g, '$1').replace(/([([]) /g, '$1').replace(/ \(/g, '(').replace(/\. /g, '.');
}

/* ---------- names ---------- */
const JS_RESERVED = new Set(['new', 'function', 'var', 'let', 'const', 'default', 'delete', 'switch', 'case', 'this', 'void', 'typeof', 'instanceof', 'catch', 'enum', 'extends', 'super', 'throw', 'export', 'debugger', 'arguments', 'eval', 'null', 'true', 'false', 'undefined', 'static', 'package', 'interface', 'private', 'protected', 'public', 'implements']);
const KW_OPS = new Set(['and', 'or', 'not', 'in', 'is', 'if', 'else', 'lambda', 'return', 'yield', 'for', 'await', 'from', 'as']);
const camel = s => s.replace(/_+([a-z0-9])/g, (_, c) => c.toUpperCase());
const KW_MAP = { base_url: 'baseURL', extra_http_headers: 'extraHTTPHeaders', ignore_https_errors: 'ignoreHTTPSErrors', storage_state: 'storageState' };
const ATTR_MAP = { upper: 'toUpperCase', lower: 'toLowerCase', strip: 'trim', lstrip: 'trimStart', rstrip: 'trimEnd', startswith: 'startsWith', endswith: 'endsWith', append: 'push', post_data_json: 'postDataJSON', to_have_url: 'toHaveURL', to_be_ok: 'toBeOK', not_to_be_ok: 'not.toBeOK', not_to_have_url: 'not.toHaveURL' };
function attrName(v, line) {
  if (ATTR_MAP[v]) return ATTR_MAP[v];
  if (/^__\w+__$/.test(v)) return v;
  if (/[a-z][A-Z]/.test(v) && /^(get|to|is|wait|all|inner|text|input|set|select|press|go|new|post|status|default|content)/.test(v)) {
    return '$bad$' + v;
  }
  if (v.startsWith('not_to_')) return 'not.' + camel(v.slice(4));
  return camel(v);
}
function nameMap(v) {
  if (v === 'True') return 'true'; if (v === 'False') return 'false'; if (v === 'None') return 'null';
  if (JS_RESERVED.has(v)) return v + '_';
  return v;
}

/* ---------- strings ---------- */
function convStr(tok) {
  if (tok.prefix.includes('f')) return convFStr(tok);
  if (tok.prefix.includes('r')) return JSON.stringify(tok.v);
  return '"' + tok.v.replace(/\\([\s\S])|"|\n/g, (m, e) => e !== undefined ? (e === '\n' ? '' : '\\' + e) : m === '"' ? '\\"' : '\\n') + '"';
}
function convFStr(tok) {
  const s = tok.v, raw = tok.prefix.includes('r'); let out = '`', i = 0, lit = '';
  const flush = () => { let t = lit; if (raw) t = t.replace(/\\/g, '\\\\'); t = t.replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n'); out += t; lit = ''; };
  while (i < s.length) {
    const c = s[i];
    if (c === '{' && s[i + 1] === '{') { lit += '{'; i += 2; continue; }
    if (c === '}' && s[i + 1] === '}') { lit += '}'; i += 2; continue; }
    if (c === '{') {
      let d = 0, j = i + 1, q = null, expr = '', spec = null;
      for (; j < s.length; j++) {
        const ch = s[j];
        if (q) { if (ch === q) q = null; if (spec === null) expr += ch; else spec += ch; continue; }
        if (ch === '"' || ch === "'") { q = ch; if (spec === null) expr += ch; else spec += ch; continue; }
        if ('([{'.includes(ch)) d++;
        if (')]}'.includes(ch)) { if (d === 0 && ch === '}') break; d--; }
        if (d === 0 && spec === null && (ch === ':' || (ch === '!' && s[j + 1] !== '='))) { spec = ''; if (ch === '!') { spec = '!' + s[j + 1]; j++; } continue; }
        if (spec === null) expr += ch; else spec += ch;
      }
      flush();
      const js = convExprSrc(expr.replace(/=\s*$/, ''), tok.line);
      out += '${' + (spec ? `__fmt(${js}, ${JSON.stringify(spec)})` : `__str(${js})`) + '}';
      i = j + 1; continue;
    }
    lit += c; i++;
  }
  flush(); return out + '`';
}
function convExprSrc(src, line) { const ls = tokenize(src); if (!ls.length) return '""'; return convertExpr(group(ls[0].toks, line), line); }

/* ---------- expressions ---------- */
function findTopName(items, v, from) { for (let i = from || 0; i < items.length; i++) if (isName(items[i], v)) return i; return -1; }
function convertExpr(items, line) {
  if (!items.length) return '';
  if (isName(items[0], 'lambda')) {
    const ci = items.findIndex(x => isOp(x, ':')); if (ci < 0) throw new PySyntaxError('invalid lambda', line);
    const ps = splitComma(items.slice(1, ci)).map(p => p.length > 1 && isOp(p[1], '=') ? p[0].v + ' = ' + convertExpr(p.slice(2), line) : p.map(x => x.v).join(''));
    return `((${ps.join(', ')}) => ${convertExpr(items.slice(ci + 1), line)})`;
  }
  const ifI = findTopName(items, 'if', 1);
  if (ifI > 0) {
    const elI = findTopName(items, 'else', ifI + 1);
    if (elI < 0) throw new PySyntaxError("expected 'else' after 'if' expression", line);
    return `(__t(${convertExpr(items.slice(ifI + 1, elI), line)}) ? ${convertExpr(items.slice(0, ifI), line)} : ${convertExpr(items.slice(elI + 1), line)})`;
  }
  const ors = splitTop(items, x => isName(x, 'or'));
  if (ors.length > 1) return '(' + ors.map(p => convertExpr(p, line)).join(' || ') + ')';
  const ands = splitTop(items, x => isName(x, 'and'));
  if (ands.length > 1) return '(' + ands.map(p => convertExpr(p, line)).join(' && ') + ')';
  if (isName(items[0], 'not')) return `!__t(${convertExpr(items.slice(1), line)})`;
  // comparisons
  const parts = [[]], ops = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i], cur = parts[parts.length - 1];
    if (isOp(it) && ['==', '!=', '<', '>', '<=', '>='].includes(it.v)) { ops.push(it.v); parts.push([]); continue; }
    if (isName(it, 'in') && cur.length) { ops.push('in'); parts.push([]); continue; }
    if (isName(it, 'not') && isName(items[i + 1], 'in') && cur.length) { ops.push('not in'); i++; parts.push([]); continue; }
    if (isName(it, 'is') && cur.length) { if (isName(items[i + 1], 'not')) { ops.push('is not'); i++; } else ops.push('is'); parts.push([]); continue; }
    cur.push(it);
  }
  if (ops.length) {
    const js = parts.map(p => convertExpr(p, line)); const pieces = [];
    ops.forEach((op, k) => {
      const a = js[k], b = js[k + 1];
      pieces.push(op === '==' ? `__eq(${a}, ${b})` : op === '!=' ? `!__eq(${a}, ${b})` : op === 'in' ? `__in(${a}, ${b})` : op === 'not in' ? `!__in(${a}, ${b})` : op === 'is' ? `__is(${a}, ${b})` : op === 'is not' ? `!__is(${a}, ${b})` : `(${a} ${op} ${b})`);
    });
    return pieces.length > 1 ? '(' + pieces.join(' && ') + ')' : pieces[0];
  }
  return convertAtoms(items, line);
}
function convertAtoms(items, line) {
  let out = '', prev = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.g) {
      const callable = prev && ((prev.t === 'name' && !KW_OPS.has(prev.v)) || prev.t === 'str' || prev.g);
      if (it.g === '(') out += callable ? convertCall(it.items, line) : convertParen(it.items, line);
      else if (it.g === '[') out += callable ? convertSub(it.items, line) : convertList(it.items, line);
      else out += convertDict(it.items, line);
    } else if (it.t === 'name') {
      if (prev && isOp(prev, '.')) out += attrName(it.v, it.line || line);
      else if (KW_OPS.has(it.v)) throw new PySyntaxError(`unexpected '${it.v}'`, it.line || line);
      else out += nameMap(it.v);
    } else if (it.t === 'str') { if (prev && prev.t === 'str') out += ' + '; out += convStr(it); }
    else if (it.t === 'num') out += it.v.replace(/j$/, '');
    else if (it.t === 'op') {
      const v = it.v;
      if (v === '.') out += '.';
      else if (v === '//') out += ' / ';
      else if (v === ':' || v === '->' || v === ';') throw new PySyntaxError(`invalid syntax near '${v}'`, it.line || line);
      else if (v === '=') throw new PySyntaxError("invalid syntax: '=' here (did you mean '=='?)", it.line || line);
      else out += ' ' + v + ' ';
    }
    prev = it;
  }
  return out;
}
function convertCall(items, line) {
  if (findTopName(items, 'for') > 0 && !items.some(x => isOp(x, ','))) return '(' + convertComp(items, line) + ')';
  const pos = [], kw = [];
  for (const a of splitComma(items)) {
    if (!a.length) continue;
    if (isName(a[0]) && isOp(a[1], '=')) { const k = KW_MAP[a[0].v] || camel(a[0].v); kw.push(`${JSON.stringify(k)}: ${convertExpr(a.slice(2), line)}`); }
    else if (isOp(a[0], '**')) kw.push('...' + convertExpr(a.slice(1), line));
    else if (isOp(a[0], '*')) pos.push('...__iter(' + convertExpr(a.slice(1), line) + ')');
    else pos.push(convertExpr(a, line));
  }
  if (kw.length) pos.push(`__K({${kw.join(', ')}})`);
  return '(' + pos.join(', ') + ')';
}
function convertParen(items, line) {
  if (!items.length) return '[]';
  if (findTopName(items, 'for') > 0) return convertComp(items, line);
  const parts = splitTop(items, x => isOp(x, ','));
  if (parts.length > 1) return '[' + parts.filter(p => p.length).map(p => convertExpr(p, line)).join(', ') + ']';
  return '(' + convertExpr(items, line) + ')';
}
function convertSub(items, line) {
  if (items.some(x => isOp(x, ':'))) {
    const p = splitTop(items, x => isOp(x, ':'));
    const a = p[0].length ? convertExpr(p[0], line) : '0', b = p[1] && p[1].length ? convertExpr(p[1], line) : null;
    return `.slice(${a}${b ? ', ' + b : ''})`;
  }
  if (items.length === 2 && isOp(items[0], '-') && items[1].t === 'num') return `.at(-${items[1].v})`;
  return '[' + convertExpr(items, line) + ']';
}
function convertList(items, line) {
  if (findTopName(items, 'for') > 0) return convertComp(items, line);
  return '[' + splitComma(items).map(p => convertExpr(p, line)).join(', ') + ']';
}
function convertComp(items, line) {
  const f = findTopName(items, 'for'); const inI = findTopName(items, 'in', f + 1);
  if (inI < 0) throw new PySyntaxError('invalid comprehension', line);
  const ifI = findTopName(items, 'if', inI + 1);
  if (findTopName(items, 'for', f + 1) > 0) throw new PySyntaxError('nested comprehensions are not supported here — use a for loop', line);
  const tgt = splitComma(items.slice(f + 1, inI)).map(p => p.map(x => x.v).join('')); const t = tgt.length > 1 ? '[' + tgt.join(', ') + ']' : tgt[0];
  const it = convertExpr(items.slice(inI + 1, ifI > 0 ? ifI : items.length), line);
  let s = `__iter(${it})`;
  if (ifI > 0) s += `.filter((${t}) => __t(${convertExpr(items.slice(ifI + 1), line)}))`;
  return s + `.map((${t}) => ${convertExpr(items.slice(0, f), line)})`;
}
function convertDict(items, line) {
  if (!items.length) return '({})';
  const entries = splitComma(items);
  if (!items.some(x => isOp(x, ':'))) return 'new Set([' + entries.map(p => convertExpr(p, line)).join(', ') + '])';
  return '({' + entries.map(p => {
    if (isOp(p[0], '**')) return '...' + convertExpr(p.slice(1), line);
    const ci = p.findIndex(x => isOp(x, ':')); if (ci < 0) throw new PySyntaxError('invalid dict entry', line);
    const k = p.slice(0, ci); const key = k.length === 1 && k[0].t === 'str' && !k[0].prefix.includes('f') ? convStr(k[0]) : '[' + convertExpr(k, line) + ']';
    return key + ': ' + convertExpr(p.slice(ci + 1), line);
  }).join(', ') + '})';
}

/* ---------- statements ---------- */
const COMPOUND = new Set(['if', 'elif', 'else', 'for', 'while', 'def', 'class', 'try', 'except', 'finally', 'with']);
function headerSplit(items) {
  let lam = 0;
  for (let i = 0; i < items.length; i++) {
    if (isName(items[i], 'lambda')) lam++;
    if (isOp(items[i], ':')) { if (lam) { lam--; continue; } return [items.slice(0, i), items.slice(i + 1)]; }
  }
  return null;
}
function parseParams(items, line, dropSelf) {
  const names = [], js = [], defaults = [];
  splitComma(items).forEach(p => {
    if (!p.length) return;
    if (isOp(p[0], '*') && p.length === 1) return; // keyword-only marker
    let star = '';
    if (isOp(p[0], '**')) { star = '**'; p = p.slice(1); } else if (isOp(p[0], '*')) { star = '*'; p = p.slice(1); }
    const nm = p[0].v; const eq = p.findIndex(x => isOp(x, '='));
    const def = eq > 0 ? convertExpr(p.slice(eq + 1), line) : null;
    names.push(star === '*' ? '*' + nm : nm); js.push(nameMap(nm) + (def ? ' = ' + def : ''));
  });
  if (dropSelf && names[0] === 'self') { names.shift(); js.shift(); }
  return { names, js };
}

function translate(src) {
  const lines = tokenize(src).map(l => Object.assign(l, { items: group(l.toks, l.line) }));
  const out = []; const stack = [{ indent: 0, kind: 'module', last: null }];
  let pending = null, decorators = [], clsName = null;
  const topDefs = [], meta = {}, marks = {}, classes = [];
  const emit = s => { if (s) out.push('  '.repeat(stack.length - 1) + s); };

  function genScan(idx, indent) {
    for (let k = idx + 1; k < lines.length && lines[k].indent > indent; k++) if (lines[k].toks.some(t => isName(t, 'yield'))) return true;
    return false;
  }

  function stmt(items, line, idx, indent, parent) {
    const P = `__ln(${line}); `; const first = items[0]; const kw = isName(first) ? first.v : null; const inClass = parent.kind === 'class';
    if (isOp(first, '@')) { decorators.push(items.slice(1)); return null; }
    if (kw && COMPOUND.has(kw)) {
      const hs = headerSplit(items); if (!hs) throw new PySyntaxError("expected ':'", line);
      const [head, body] = hs; let js, kind = 'block';
      switch (kw) {
        case 'if': js = P + `if (__t(${convertExpr(head.slice(1), line)})) {`; break;
        case 'elif': js = `else if (__t(${convertExpr(head.slice(1), line)})) {`; break;
        case 'else': js = 'else {'; break;
        case 'while': js = P + `while (__t(${convertExpr(head.slice(1), line)})) {`; break;
        case 'for': {
          const inI = findTopName(head, 'in', 1); if (inI < 0) throw new PySyntaxError("expected 'in' in for loop", line);
          const tg = splitComma(head.slice(1, inI)).map(p => p.length === 1 ? nameMap(p[0].v) : convertExpr(p, line));
          js = P + `for (let ${tg.length > 1 ? '[' + tg.join(', ') + ']' : tg[0]} of __iter(${convertExpr(head.slice(inI + 1), line)})) {`; break;
        }
        case 'try': js = P + 'try {'; break;
        case 'except': {
          if (parent.last === 'except') throw new PySyntaxError('only one except block per try is supported in the simulator', line);
          const asI = findTopName(head, 'as'); const nm = asI > 0 ? head[asI + 1].v : '__e';
          js = `catch (${nm}) { var __lastErr = ${nm};`; break;
        }
        case 'finally': js = 'finally {'; break;
        case 'with': throw new PySyntaxError("'with' blocks are not supported in the simulator", line);
        case 'class': {
          const nm = head[1].v; let base = '';
          if (head[2] && head[2].g === '(' && head[2].items.length && !isName(head[2].items[0], 'object')) base = ' extends ' + convertExpr(head[2].items, line);
          js = `class ${nm}${base} {`; kind = 'class'; clsName = nm; if (parent.kind === 'module') classes.push(nm); decorators = []; break;
        }
        case 'def': {
          const nm = head[1].v; const pg = head[2]; if (!pg || pg.g !== '(') throw new PySyntaxError('invalid function definition', line);
          const { names, js: pjs } = parseParams(pg.items, line, inClass);
          const gen = genScan(idx, indent);
          const bind = `let [${pjs.join(', ')}] = __bind(__a, ${JSON.stringify(names)});`;
          if (inClass) js = `${gen ? '*' : ''}${nm === '__init__' ? 'constructor' : nm}(...__a) { const self = this; ${bind}`;
          else js = `function${gen ? '*' : ''} ${nameMap(nm)}(...__a) { ${bind}`;
          if (parent.kind === 'module') {
            topDefs.push(nm); meta[nm] = { params: names, gen, line };
            if (decorators.length) marks[nm] = decorators.map(d => convertExpr(d, line));
          }
          decorators = []; kind = 'def'; break;
        }
      }
      return { js, kind, body: body.length ? body : null, kw };
    }
    if (decorators.length && parent.kind === 'module') throw new PySyntaxError('a decorator must be followed by def', line);
    switch (kw) {
      case 'import': case 'from': case 'global': case 'nonlocal': return { js: '' };
      case 'del': return { js: '' };
      case 'pass': return { js: inClass ? '' : ';' };
      case 'break': case 'continue': return { js: P + kw + ';' };
      case 'return': return { js: P + 'return' + (items.length > 1 ? ' ' + convertExpr(items.slice(1), line) : '') + ';' };
      case 'yield': return { js: P + 'yield' + (items.length > 1 ? ' ' + convertExpr(items.slice(1), line) : '') + ';' };
      case 'raise': { const fi = findTopName(items, 'from'); const e = items.slice(1, fi > 0 ? fi : items.length); return { js: P + 'throw ' + (e.length ? `__raise(${convertExpr(e, line)})` : '__lastErr') + ';' }; }
      case 'assert': { const p = splitTop(items.slice(1), x => isOp(x, ',')); return { js: P + `__assert(${convertExpr(p[0], line)}, ${p[1] ? convertExpr(p[1], line) : 'undefined'}, ${JSON.stringify(srcOf(p[0]))});` }; }
      case 'async': case 'await': throw new PySyntaxError('Use the sync API here — no async/await in the Python labs (pytest-playwright is synchronous).', line);
      case 'print': break;
    }
    if (items.length === 1 && items[0].t === 'str') return { js: '' }; // docstring
    const eqs = []; items.forEach((x, k) => { if (isOp(x, '=')) eqs.push(k); });
    if (eqs.length) {
      const segs = []; let s = 0; eqs.forEach(k => { segs.push(items.slice(s, k)); s = k + 1; }); const value = convertExpr(items.slice(s), line);
      return { js: segs.map(t => {
        const ci = t.findIndex(x => isOp(x, ':')); if (ci > 0) t = t.slice(0, ci);
        const tp = splitTop(t, x => isOp(x, ','));
        if (tp.length > 1) return P + `var [${tp.filter(p => p.length).map(p => p.length === 1 ? nameMap(p[0].v) : convertExpr(p, line)).join(', ')}] = __iter(${value});`;
        if (t.length === 1 && isName(t[0])) return inClass ? `${t[0].v} = ${value};` : P + `var ${nameMap(t[0].v)} = ${value};`;
        return P + `${convertExpr(t, line)} = ${value};`;
      }).join(' ') };
    }
    const aug = items.findIndex(x => isOp(x) && /^(\+|-|\*|\/|%|\*\*|&|\||\^|<<|>>)=$/.test(x.v));
    if (aug > 0) return { js: P + `${convertExpr(items.slice(0, aug), line)} ${items[aug].v} ${convertExpr(items.slice(aug + 1), line)};` };
    if (items.length >= 2 && isName(items[0]) && isOp(items[1], ':')) return { js: '' }; // bare annotation
    if (inClass) throw new PySyntaxError('only methods and attributes are allowed in a class body', line);
    return { js: P + convertExpr(items, line) + ';' };
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const ln = lines[idx];
    if (pending) {
      if (ln.indent <= stack[stack.length - 1].indent) throw new PySyntaxError('expected an indented block', ln.line);
      pending.indent = ln.indent; stack.push(pending); pending = null;
    } else if (ln.indent > stack[stack.length - 1].indent) throw new PySyntaxError('unexpected indent', ln.line);
    while (ln.indent < stack[stack.length - 1].indent) { const b = stack.pop(); emit('}'); if (b.kind === 'class') emit(`${b.name} = __cls(${b.name});`); }
    if (ln.indent !== stack[stack.length - 1].indent) throw new PySyntaxError('unindent does not match any outer indentation level', ln.line);
    const parent = stack[stack.length - 1];
    const r = stmt(ln.items, ln.line, idx, ln.indent, parent);
    if (!r) continue;
    if (r.kind) {
      if ((r.kw === 'elif' || r.kw === 'else' || r.kw === 'except' || r.kw === 'finally') && !['if', 'elif', 'for', 'while', 'try', 'except'].includes(parent.last)) throw new PySyntaxError(`invalid syntax: '${r.kw}' without a matching block`, ln.line);
      emit(r.js); parent.last = r.kw;
      if (r.body) { const b = stmt(r.body, ln.line, idx, ln.indent + 1, { kind: r.kind === 'class' ? 'class' : 'block' }); emit('  ' + (b && b.js || '')); emit('}'); }
      else pending = { indent: null, kind: r.kind, last: null, name: r.kind === 'class' ? clsName : null };
    } else { emit(r.js); parent.last = null; }
  }
  if (pending) throw new PySyntaxError('expected an indented block', lines.length ? lines[lines.length - 1].line : 1);
  while (stack.length > 1) { const b = stack.pop(); emit('}'); if (b.kind === 'class') emit(`${b.name} = __cls(${b.name});`); }
  const markJs = Object.keys(marks).map(k => `${JSON.stringify(k)}: [${marks[k].join(', ')}]`).join(', ');
  out.push(`return { defs: { ${topDefs.map(n => `${JSON.stringify(n)}: ${nameMap(n)}`).join(', ')} }, classes: { ${classes.map(n => `${JSON.stringify(n)}: ${n}`).join(', ')} }, meta: ${JSON.stringify(meta)}, marks: { ${markJs} } };`);
  return out.join('\n');
}
RT.translatePython = translate;
})(typeof window !== 'undefined' ? window : globalThis);


/* ===== Playwright Path · test runner (JavaScript + Python) ===== */
(function (G) {
'use strict';
const RT = G.PWRT;
const { Env, PWError, APIRequestContext, PySyntaxError } = RT;

let cur = null; // current Env
const SKIP = { skip: true };
const flush = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel(); const q = []; ch.port1.onmessage = () => { const f = q.shift(); f && f(); };
    return () => new Promise(r => { q.push(r); ch.port2.postMessage(0); });
  }
  return () => new Promise(r => setTimeout(r, 0));
})();

const PROXY2T = new WeakMap();
const unwrap = x => (x && typeof x === 'object' && PROXY2T.has(x)) ? PROXY2T.get(x) : x;
function unwrapDeep(x) {
  x = unwrap(x);
  if (Array.isArray(x)) return x.map(unwrap);
  if (x && typeof x === 'object' && !x.__kind && !(x instanceof RegExp) && Object.getPrototypeOf(x) === Object.prototype) { const o = {}; Object.keys(x).forEach(k => o[k] = unwrap(x[k])); return o; }
  return x;
}
const snake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();
const KIND_NAMES = { page: 'Page', locator: 'Locator', expect: 'Expect', apiRequestContext: 'APIRequestContext', apiResponse: 'APIResponse', route: 'Route', request: 'Request', dialog: 'Dialog', keyboard: 'Keyboard', mouse: 'Mouse', browserContext: 'BrowserContext', apiFactory: 'APIRequest', playwright: 'Playwright', browser: 'Browser' };
const INTERNAL = new Set(['then', 'toJSON', 'constructor', 'valueOf', 'toString', '__kind', 'nodeType', 'length', '$$typeof', 'asymmetricMatch', 'inspect', '_desc', '_steps', '_page']);
const count = (k, p) => { if (cur) cur.calls[p] = (cur.calls[p] || 0) + 1; };

/* ---------------- JavaScript wrapper: async methods return awaitables ---------------- */
const ASYNC = {
  page: 'goto reload goBack goForward title content setContent waitForTimeout waitForURL waitForLoadState waitForSelector waitForResponse click fill press check type hover selectOption dblclick textContent innerText inputValue getAttribute isVisible isChecked isEnabled route unroute unrouteAll screenshot evaluate setViewportSize pause close bringToFront',
  locator: 'click dblclick tap fill clear press pressSequentially type check uncheck setChecked selectOption setInputFiles hover focus blur textContent innerText innerHTML inputValue getAttribute isVisible isHidden isEnabled isDisabled isChecked isEditable count all allTextContents allInnerTexts waitFor scrollIntoViewIfNeeded screenshot highlight dispatchEvent evaluate boundingBox',
  apiRequestContext: 'get post put patch delete head fetch dispose storageState',
  apiResponse: 'json text body dispose',
  route: 'fulfill abort continue fallback fetch',
  dialog: 'accept dismiss',
  keyboard: 'press type down up insertText',
  mouse: 'click move down up wheel dblclick',
  browserContext: 'cookies addCookies clearCookies storageState newPage close route unroute',
  apiFactory: 'newContext', browser: 'newContext newPage close'
};
Object.keys(ASYNC).forEach(k => ASYNC[k] = new Set(ASYNC[k].split(' ')));
const JS_CACHE = new WeakMap();
function captureLine() { const s = (new Error().stack) || ''; const m = s.match(/user-test\.js:(\d+):\d+/); return m ? (+m[1] - RT.JS_LINE_OFFSET) : null; }
RT.JS_LINE_OFFSET = 3;
const IMMEDIATE = { dialog: new Set(['accept', 'dismiss']), route: new Set(['fulfill', 'abort', 'continue', 'fallback', 'fetch']), apiResponse: new Set(['json', 'text', 'body', 'dispose']), page: new Set(['route', 'unroute', 'unrouteAll']), browserContext: new Set(['route', 'unroute']) };
const WAITS_FOR_HANDLERS = new Set(['page', 'locator', 'expect', 'keyboard', 'mouse']);
function settled(v, err) { const p = err ? Promise.reject(err) : Promise.resolve(v); p.catch(() => {}); return { then: (a, b) => p.then(a, b), catch: b => p.catch(b), finally: f => p.finally(f) }; }
async function drainHandlers(env) {
  const t0 = Date.now();
  while (env.asyncHandlers && env.asyncHandlers.size && Date.now() - t0 < 3000) {
    await Promise.race([Promise.allSettled(Array.from(env.asyncHandlers)), new Promise(r => setTimeout(r, 3000))]);
    await flush();
  }
}
function mkThen(label, fn, kind) {
  const env = cur; const rec = { label, line: captureLine(), awaited: false };
  const p = (async () => { await flush(); if (WAITS_FOR_HANDLERS.has(kind)) await drainHandlers(env); if (env !== cur) throw new PWError(label + ': Target page, context or browser has been closed'); if (rec.line) env.line = rec.line; const v = fn(); await flush(); return v; })();
  rec.p = p; p.catch(() => {}); if (env.pending) env.pending.push(rec);
  return { then(a, b) { rec.awaited = true; return p.then(a, b); }, catch(b) { rec.awaited = true; return p.catch(b); }, finally(f) { rec.awaited = true; return p.finally(f); } };
}
function jsWrap(obj) {
  if (Array.isArray(obj)) return obj.map(jsWrap);
  if (!obj || typeof obj !== 'object' || !obj.__kind) return obj;
  if (JS_CACHE.has(obj)) return JS_CACHE.get(obj);
  const px = new Proxy(obj, {
    get(t, p) {
      if (typeof p === 'symbol') return t[p];
      if (p === 'then') return undefined;
      const v = t[p];
      if (v === undefined && typeof p === 'string' && p.includes('_') && !p.startsWith('_')) { const cm = p.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); if (cm in t) throw new TypeError(`${t.__kind}.${p} is not a function — JavaScript uses camelCase: ${cm}()`); }
      if (typeof v !== 'function') return jsWrap(v);
      return (...args) => {
        count(t.__kind, p);
        const a = args.map(unwrapDeep);
        const isAsync = t.__kind === 'expect' ? (t._isWeb() && p.startsWith('to')) : (ASYNC[t.__kind] && ASYNC[t.__kind].has(p));
        if (!isAsync) { if (cur) cur.line = captureLine() || cur.line; return jsWrap(v.apply(t, a)); }
        if (IMMEDIATE[t.__kind] && IMMEDIATE[t.__kind].has(p)) { try { return settled(jsWrap(v.apply(t, a))); } catch (e) { return settled(null, e); } }
        return mkThen(`${t.__kind}.${p}`, () => jsWrap(v.apply(t, a)), t.__kind);
      };
    }
  });
  PROXY2T.set(px, obj); JS_CACHE.set(obj, px); return px;
}

/* ---------------- Python wrapper: sync calls, snake_case properties ---------------- */
const PY_PROPS = { page: ['url', 'context', 'keyboard', 'mouse', 'request'], locator: ['first', 'last'], apiResponse: ['status', 'ok', 'statusText', 'url', 'headers'], route: ['request'], request: ['url', 'method', 'postDataJSON', 'postData', 'headers', 'resourceType'], dialog: ['message', 'type', 'defaultValue'], browserContext: ['pages', 'request'] };
const PY_CACHE = new WeakMap();
function pyWrap(obj) {
  if (Array.isArray(obj)) return obj.map(pyWrap);
  if (!obj || typeof obj !== 'object' || !obj.__kind) return obj;
  if (PY_CACHE.has(obj)) return PY_CACHE.get(obj);
  const px = new Proxy(obj, {
    get(t, p) {
      if (typeof p === 'symbol' || INTERNAL.has(p)) return p === 'then' ? undefined : t[p];
      if (p.startsWith('$bad$')) { const nm = p.slice(5); throw new TypeError(`AttributeError: '${KIND_NAMES[t.__kind] || t.__kind}' object has no attribute '${nm}'. Python uses snake_case — did you mean '${snake(nm)}'?`); }
      const props = PY_PROPS[t.__kind];
      if (props && props.includes(p)) { count(t.__kind, p); const fv = t[p]; return pyWrap(typeof fv === 'function' ? fv.call(t) : fv); }
      const v = t[p];
      if (v === undefined) throw new TypeError(`AttributeError: '${KIND_NAMES[t.__kind] || t.__kind}' object has no attribute '${snake(String(p))}'`);
      if (typeof v !== 'function') return pyWrap(v);
      return (...args) => { count(t.__kind, p); return pyWrap(v.apply(t, args.map(unwrapDeep))); };
    }
  });
  PROXY2T.set(px, obj); PY_CACHE.set(obj, px); return px;
}

/* ---------------- shared helpers ---------------- */
function paramNames(fn) {
  const s = Function.prototype.toString.call(fn);
  const m = s.match(/^\s*(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\(\s*\{([^}]*)\}/) || s.match(/^\s*(?:async\s*)?\{([^}]*)\}\s*=>/);
  if (!m) return [];
  return m[1].split(',').map(x => x.trim()).filter(Boolean).map(x => x.replace(/^\.\.\./, '').split(/[:=]/)[0].trim()).filter(Boolean);
}
async function setupFixture(fn, deps, info) {
  let res; const valP = new Promise(r => res = r); let release; const gate = new Promise(r => release = r);
  let used = false;
  const done = Promise.resolve().then(() => fn(deps, async v => { used = true; res(v); await gate; }, info));
  const v = await Promise.race([valP, done.then(() => { if (!used) throw new PWError('Fixture function finished without calling use(value)'); })]);
  return { value: v, teardown: async () => { release(); await done; } };
}
function pyStr(v, inner) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True'; if (v === false) return 'False';
  if (typeof v === 'string') return inner ? "'" + v.replace(/'/g, "\\'") + "'" : v;
  if (Array.isArray(v)) return '[' + v.map(x => pyStr(x, true)).join(', ') + ']';
  if (v instanceof RegExp) return "re.compile('" + v.source + "')";
  if (v && v.__kind) return `<${KIND_NAMES[v.__kind] || v.__kind}${v._desc ? ' ' + v._desc : ''}>`;
  if (typeof v === 'object') { if (PROXY2T.has(v)) return pyStr(PROXY2T.get(v)); return '{' + Object.keys(v).map(k => `'${k}': ${pyStr(v[k], true)}`).join(', ') + '}'; }
  return String(v);
}
function jsStr(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && PROXY2T.has(v)) v = PROXY2T.get(v);
  if (v && v.__kind) return v._desc ? `Locator@${v._desc}` : `<${v.__kind}>`;
  try { return JSON.stringify(v, null, 0) ?? String(v); } catch (e) { return String(v); }
}

/* ---------------- Python runtime helpers ---------------- */
const KW = Symbol('kwargs');
function pyHelpers() {
  const E = (name, base) => { const f = function (msg) { const e = new Error(msg === undefined ? '' : String(msg)); e.name = name; e.pyType = name; return e; }; f.pyName = name; return f; };
  const deepEq = (a, b) => { a = unwrap(a); b = unwrap(b); if (a === b) return true; if (a && b && typeof a === 'object' && typeof b === 'object') { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } } return a == b && typeof a === typeof b; };
  const iter = x => { x = unwrap(x); if (x == null) throw new TypeError("TypeError: 'NoneType' object is not iterable"); if (Array.isArray(x)) return x.map(pyWrapIf); if (typeof x === 'string') return Array.from(x); if (x instanceof Set) return Array.from(x); if (typeof x[Symbol.iterator] === 'function') return Array.from(x); if (typeof x === 'object') return Object.keys(x); throw new TypeError(`TypeError: '${typeof x}' object is not iterable`); };
  const pyWrapIf = v => (v && v.__kind) ? pyWrap(v) : v;
  const fixture = function (arg) { if (typeof arg === 'function') return arg; return { kind: 'fixture', opts: arg || {} }; }; fixture.kind = 'fixture'; fixture.opts = {};
  const skipMark = function (o) { return { kind: 'skip' }; }; skipMark.kind = 'skip';
  const pytest = { fixture, mark: { parametrize: (names, values) => ({ kind: 'parametrize', names, values }), skip: skipMark, slow: { kind: 'none' }, only: { kind: 'none' }, smoke: { kind: 'none' } }, fail: m => { throw Object.assign(new Error(m), { name: 'Failed' }); }, skip: () => { throw SKIP; }, raises: () => { throw new PySyntaxError("pytest.raises needs a 'with' block, which the simulator doesn't support. Use try/except instead."); } };
  const re = {
    IGNORECASE: 'i', I: 'i', MULTILINE: 'm', M: 'm', DOTALL: 's', S: 's',
    compile: (p, f) => { let src = String(p), fl = typeof f === 'string' ? f : ''; const m = src.match(/^\(\?([imsx]+)\)/); if (m) { src = src.slice(m[0].length); fl += m[1].replace('x', ''); } return new RegExp(src, Array.from(new Set(fl)).join('')); },
    search: (p, s, f) => { const r = p instanceof RegExp ? p : re.compile(p, f); const m = String(s).match(r); return m ? { group: (i) => m[i || 0] } : null; },
    match: (p, s, f) => { const r = new RegExp('^(?:' + (p instanceof RegExp ? p.source : p) + ')', f || ''); const m = String(s).match(r); return m ? { group: (i) => m[i || 0] } : null; },
    escape: s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  };
  const H = {
    __ln: n => { if (cur) cur.line = n; },
    __t: x => { x = unwrap(x); if (Array.isArray(x) || typeof x === 'string') return x.length > 0; if (x instanceof Set) return x.size > 0; if (x && typeof x === 'object' && !x.__kind && Object.getPrototypeOf(x) === Object.prototype) return Object.keys(x).length > 0; return !!x; },
    __assert: (c, msg, src) => {
      const ok = H.__t(c);
      if (cur) { cur.asserts.push({ matcher: 'assert', pass: ok, target: src, line: cur.line }); cur.snap((ok ? '✓ ' : '✗ ') + 'assert ' + src, null, !ok); }
      if (!ok) { const e = new Error(msg !== undefined ? String(msg) : 'assert ' + src); e.name = 'AssertionError'; e.pyType = 'AssertionError'; throw e; }
    },
    __iter: iter,
    __in: (a, b) => { b = unwrap(b); a = unwrap(a); if (typeof b === 'string') return b.includes(String(a)); if (Array.isArray(b)) return b.some(x => deepEq(x, a)); if (b instanceof Set) return b.has(a); if (b && typeof b === 'object') return Object.prototype.hasOwnProperty.call(b, a); throw new TypeError("TypeError: argument of type '" + (b === null ? 'NoneType' : typeof b) + "' is not iterable"); },
    __eq: deepEq,
    __is: (a, b) => (a == null && b == null) || a === b,
    __raise: e => { if (typeof e === 'function') e = e(); if (e instanceof Error) return e; return new Error(String(e)); },
    __cls: C => new Proxy(C, { apply: (t, th, args) => new t(...args) }),
    __K: o => { Object.defineProperty(o, KW, { value: true }); return o; },
    __bind: (args, names) => {
      const a = args.slice(); let kw = null;
      if (a.length && a[a.length - 1] && typeof a[a.length - 1] === 'object' && a[a.length - 1][KW]) kw = a.pop();
      const out = [];
      let ai = 0;
      names.forEach((nm, i) => {
        if (nm.startsWith('*')) { out[i] = a.slice(ai); ai = a.length; return; }
        out[i] = ai < a.length ? a[ai++] : undefined;
      });
      if (kw) {
        const left = Object.assign({}, kw);
        names.forEach((nm, i) => { const c = nm.replace(/_+([a-z0-9])/g, (_, x) => x.toUpperCase()); if (nm in left) { out[i] = left[nm]; delete left[nm]; } else if (c in left) { out[i] = left[c]; delete left[c]; } });
        const kwi = names.findIndex(n => /^(kwargs|kw|options|opts)$/.test(n)); if (kwi >= 0 && Object.keys(left).length) out[kwi] = left;
      }
      return out;
    },
    __str: v => pyStr(v),
    __fmt: (v, spec) => { if (spec.startsWith('!')) return spec === '!r' ? pyStr(v, true) : pyStr(v); const m = spec.match(/^\.(\d+)f$/); if (m) return Number(v).toFixed(+m[1]); const w = spec.match(/^>(\d+)$/); if (w) return pyStr(v).padStart(+w[1]); return pyStr(v); },
    print: (...a) => { let o = a; if (o.length && o[o.length - 1] && o[o.length - 1][KW]) o = o.slice(0, -1); if (cur) cur.log(o.map(x => pyStr(x)).join(' ')); },
    len: x => { x = unwrap(x); if (x == null) throw new TypeError("TypeError: object of type 'NoneType' has no len()"); if (x.__kind === 'locator') throw new TypeError("TypeError: object of type 'Locator' has no len() — use locator.count()"); if (x instanceof Set) return x.size; if (typeof x.length === 'number') return x.length; if (typeof x === 'object') return Object.keys(x).length; throw new TypeError('TypeError: object has no len()'); },
    str: x => pyStr(x), int: x => { const n = parseInt(String(x).trim().replace(/^\$/, ''), 10); if (isNaN(n)) throw new Error(`ValueError: invalid literal for int(): '${x}'`); return n; },
    float: x => { const n = parseFloat(String(x).trim().replace(/^\$/, '')); if (isNaN(n)) throw new Error(`ValueError: could not convert string to float: '${x}'`); return n; },
    bool: x => H.__t(x), list: x => x === undefined ? [] : iter(x).slice(), tuple: x => iter(x).slice(), set: x => new Set(x === undefined ? [] : iter(x)), dict: o => Object.assign({}, o || {}),
    range: (a, b, s) => { if (b === undefined) { b = a; a = 0; } s = s || 1; const r = []; for (let i = a; s > 0 ? i < b : i > b; i += s) r.push(i); return r; },
    enumerate: (x, st) => iter(x).map((v, i) => [i + (st || 0), v]), zip: (...xs) => { const ar = xs.map(iter); const n = Math.min(...ar.map(a => a.length)); return Array.from({ length: n }, (_, i) => ar.map(a => a[i])); },
    sorted: (x, o) => { const a = iter(x).slice().sort((p, q) => p < q ? -1 : p > q ? 1 : 0); return o && o.reverse ? a.reverse() : a; }, reversed: x => iter(x).slice().reverse(),
    sum: x => iter(x).reduce((p, q) => p + q, 0), min: (...x) => Math.min(...(x.length === 1 ? iter(x[0]) : x)), max: (...x) => Math.max(...(x.length === 1 ? iter(x[0]) : x)),
    abs: Math.abs, round: (x, d) => d ? Number(Number(x).toFixed(d)) : Math.round(x), isinstance: () => true, type: x => typeof x, any: x => iter(x).some(v => H.__t(v)), all: x => iter(x).every(v => H.__t(v)),
    re, pytest, fixture,
    Exception: E('Exception'), AssertionError: E('AssertionError'), ValueError: E('ValueError'), KeyError: E('KeyError'), RuntimeError: E('RuntimeError'), TimeoutError: RT.TimeoutError, Error: Error,
    Page: null, Locator: null, BrowserContext: null, APIRequestContext: null, Route: null, Dialog: null, Playwright: null, Browser: null
  };
  return H;
}

/* ---------------- error presentation ---------------- */
function pyfyMessage(msg) {
  return String(msg)
    .replace(/\b(getBy\w+|toHave\w+|toBe\w+|toContain\w+|selectOption|pressSequentially|textContent|innerText|inputValue|waitForURL|waitForTimeout|allTextContents|setChecked|isVisible|isChecked)\b/g, m => snake(m).replace('to_have_u_r_l', 'to_have_url').replace('to_be_o_k', 'to_be_ok').replace('wait_for_u_r_l', 'wait_for_url'))
    .replace(/\.not\.(to_\w+)/g, '.not_$1')
    .replace(/\(('[^']*'|\/[^/]*\/[a-z]*), \{ ([^}]*) \}\)/g, (m, a, opts) => '(' + a + ', ' + opts.split(', ').map(kv => kv.replace(/^(\w+): /, (_, k) => snake(k) + '=')).join(', ') + ')')
    .replace(/'([^'\n]*)'/g, '"$1"');
}
function presentError(e, lang, env) {
  if (!e) return null;
  if (e === SKIP) return null;
  let msg = (e && e.message) || String(e); let name = e && e.name;
  if (lang === 'py') {
    if (e instanceof ReferenceError) { const m = msg.match(/(\w+) is not defined/); if (m) msg = `NameError: name '${m[1]}' is not defined`; }
    else if (e instanceof TypeError) {
      let m;
      if ((m = msg.match(/reading '(\w+)'/))) msg = `AttributeError: 'NoneType' object has no attribute '${snake(m[1])}'`;
      else if ((m = msg.match(/([\w.$]+) is not a function/))) msg = `TypeError: '${m[1].split('.').pop()}' is not callable — check the method name and whether it is a property (page.url, locator.first) or a method (page.title())`;
      else if ((m = msg.match(/Class constructor (\w+) cannot be invoked without 'new'/))) msg = `TypeError: call the class directly — ${m[1]}(page) works in Python. (Internal: ${msg})`;
    }
    else if (e.pw) msg = pyfyMessage(msg);
    else if (e.pyType) msg = (e.pyType === 'Exception' || msg.startsWith(e.pyType) ? '' : e.pyType + ': ') + msg;
    if (e.pyType === 'AssertionError') msg = 'AssertionError: ' + msg;
  } else {
    if (e instanceof TypeError && /(\w+) is not a function/.test(msg) && /\bpage\b/.test(msg) === false && /test is not a function/.test(msg)) msg += ' — did you import { test, expect }?';
    if (e instanceof TypeError && /Cannot read properties of undefined \(reading '(goto|getBy\w+|locator)'\)/.test(msg)) msg += "\nTip: fixtures arrive as one object — write async ({ page }) => { … } with the braces.";
  }
  const line = e.pyLine || (e.stack && (e.stack.match(/user-test\.js:(\d+):\d+/) || [])[1] ? (+(e.stack.match(/user-test\.js:(\d+):\d+/)[1]) - RT.JS_LINE_OFFSET) : null) || (env && env.line) || null;
  return { message: msg, name, line, timeout: e instanceof RT.TimeoutError, assertion: !!e.assertion };
}

/* ---------------- result assembly ---------------- */
function testResult(name, env, err, lang, skipped, extraWarn) {
  const errs = [];
  if (err && err !== SKIP) errs.push(presentError(err, lang, env));
  if (env) env.softErrors.forEach(se => errs.push(presentError(se, lang, env)));
  if (env) env.handlerErrors.forEach(he => errs.push(presentError(he, lang, env)));
  return {
    name, status: skipped || err === SKIP ? 'skipped' : errs.length ? 'failed' : 'passed', errors: errs, warnings: extraWarn || [],
    trace: env ? env.trace : [], actions: env ? env.actions : [], asserts: env ? env.asserts : [], logs: env ? env.logs : [],
    calls: env ? env.calls : {}, api: env ? env.api : [], net: env ? env.net : [], finalUrl: env ? env.url : '', duration: env ? env.clock.now : 0
  };
}
function aggregate(lang, code, tests, compileError, warnings) {
  const calls = {}; const actions = [], asserts = [], api = [], logs = [];
  tests.forEach(t => { Object.keys(t.calls).forEach(k => calls[k] = (calls[k] || 0) + t.calls[k]); actions.push(...t.actions); asserts.push(...t.asserts); api.push(...t.api); logs.push(...t.logs); });
  const ran = tests.filter(t => t.status !== 'skipped');
  return {
    lang, code, tests, compileError, warnings: warnings.concat(...tests.map(t => t.warnings)), calls, actions, asserts, api, logs,
    passed: !compileError && ran.length > 0 && ran.every(t => t.status === 'passed'),
    finalUrl: tests.length ? tests[tests.length - 1].finalUrl : ''
  };
}

/* ---------------- JavaScript runner ---------------- */
function prepJS(code) {
  const lines = code.replace(/\r\n?/g, '\n').split('\n'); let imported = false;
  const decl = spec => spec.split(',').map(x => x.trim()).filter(Boolean).map(x => { const m = x.split(/\s+as\s+|\s*:\s*/); const from = m[0].trim(), to = (m[1] || m[0]).trim(); return `const ${to} = __pw.${from};`; }).join(' ');
  const out = lines.map((l, i) => {
    let m = l.match(/^\s*import\s*\{([^}]*)\}\s*from\s+['"]@playwright\/test['"];?\s*$/);
    if (m) { imported = true; return decl(m[1]); }
    m = l.match(/^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"]@playwright\/test['"]\s*\);?\s*$/);
    if (m) { imported = true; return decl(m[1]); }
    if (/^\s*import\s/.test(l)) { const e = new SyntaxError(`Only '@playwright/test' can be imported here — define helpers and page objects in this file. (line ${i + 1})`); e.pyLine = i + 1; throw e; }
    return l.replace(/^(\s*)export\s+(default\s+)?(?=(const|let|var|function|class|async))/, '$1');
  });
  if (!imported) out[0] = 'const test = __pw.test, expect = __pw.expect; ' + out[0];
  return out.join('\n');
}
function makeTestAPI(reg, defs, expectFn) {
  const top = () => reg.scopes[reg.scopes.length - 1];
  const add = (name, fn, flags) => {
    if (typeof name === 'function') { fn = name; name = '(unnamed test)'; }
    if (typeof fn !== 'function') throw new TypeError(`test("${name}") needs a function as its second argument`);
    reg.tests.push(Object.assign({ name: reg.scopes.slice(1).map(s => s.name).filter(Boolean).concat(name).join(' › '), fn, scopes: reg.scopes.slice(), defs }, flags));
  };
  const t = (n, f) => add(n, f, {});
  t.only = (n, f) => add(n, f, { only: true });
  t.skip = (n, f) => { if (typeof n === 'string' && typeof f === 'function') add(n, f, { skip: true }); else if (n !== false) throw SKIP; };
  t.fixme = t.skip; t.fail = (n, f) => add(n, f, { expectFail: true });
  const describe = (n, f) => { if (typeof n === 'function') { f = n; n = ''; } const s = { name: n, before: [], after: [], beforeAll: [], afterAll: [], use: {}, ranAll: false }; reg.scopes.push(s); try { f(); } finally { reg.scopes.pop(); } };
  describe.only = describe; describe.serial = describe; describe.parallel = describe; describe.fixme = () => {}; describe.skip = () => {}; describe.configure = () => {};
  describe.serial.only = describe;
  t.describe = describe;
  const hook = k => (a, b) => top()[k].push(typeof a === 'function' ? a : b);
  t.beforeEach = hook('before'); t.afterEach = hook('after'); t.beforeAll = hook('beforeAll'); t.afterAll = hook('afterAll');
  t.use = o => Object.assign(top().use, o);
  t.step = async (name, fn) => { if (cur) { cur.calls.step = (cur.calls.step || 0) + 1; cur.snap('▸ step: ' + name); } return await fn(); };
  t.extend = d => makeTestAPI(reg, Object.assign({}, defs, d), expectFn);
  t.expect = expectFn; t.setTimeout = () => {}; t.slow = () => {};
  t.info = () => ({ title: cur && cur.testName, retry: 0, project: { name: 'chromium' }, annotations: [], attach: async () => {} });
  return t;
}
async function runJS(code, opts) {
  const reg = { tests: [], scopes: [{ name: '', before: [], after: [], beforeAll: [], afterAll: [], use: {} }] };
  const expectFn = (a, m) => jsWrap(RT.makeExpect(cur, unwrap)(a, m));
  expectFn.soft = (a, m) => jsWrap(RT.makeExpect(cur, unwrap).soft(a, m));
  expectFn.configure = () => expectFn; expectFn.poll = () => { throw new PWError('expect.poll is not supported in the simulator.'); };
  const consoleShim = { log: (...a) => cur ? cur.log(a.map(jsStr).join(' ')) : null, info: (...a) => consoleShim.log(...a), warn: (...a) => consoleShim.log('⚠', ...a), error: (...a) => consoleShim.log('✖', ...a), table: x => consoleShim.log(x) };
  const devices = new Proxy({}, { get: (_, k) => ({ name: k, viewport: { width: 390, height: 844 }, userAgent: 'simulated' }) });
  const t = makeTestAPI(reg, {}, expectFn);
  let fn;
  try {
    const src = prepJS(code);
    fn = new Function('__pw', 'console', '"use strict";\n' + src + '\n//# sourceURL=user-test.js');
  } catch (e) { return aggregate('js', code, [], presentError(e, 'js', null), []); }
  try { fn({ test: t, expect: expectFn, devices, defineConfig: x => x, chromium: {}, firefox: {}, webkit: {}, request: {} }, consoleShim); }
  catch (e) { return aggregate('js', code, [], presentError(e, 'js', null), []); }
  const warnings = lintJS(code);
  if (!reg.tests.length) return aggregate('js', code, [], { message: "No tests found. Define one with test('name', async ({ page }) => { … })." }, warnings);
  const hasOnly = reg.tests.some(x => x.only);
  const results = [];
  for (const T of reg.tests) {
    if ((hasOnly && !T.only) || T.skip) { results.push(testResult(T.name, null, null, 'js', true)); continue; }
    const use = Object.assign({}, opts.use || {}, ...T.scopes.map(s => s.use));
    const env = new Env(opts.frame, { baseURL: use.baseURL || opts.baseURL, testIdAttribute: use.testIdAttribute, expectTimeout: opts.expectTimeout, onEvent: opts.onEvent });
    cur = env; env.wrap = jsWrap; env.pending = []; env.testName = T.name; env.lang = 'js';
    if (opts.onEvent) opts.onEvent({ type: 'test', name: T.name });
    const cache = {}, teardowns = [];
    const info = { title: T.name, retry: 0, project: { name: 'chromium' } };
    const builtins = {
      page: () => jsWrap(env.page), context: () => jsWrap(env.page.context()), request: () => jsWrap(new APIRequestContext(env, { baseURL: env.baseURL })),
      browserName: () => 'chromium', baseURL: () => env.baseURL, headless: () => true, viewport: () => ({ width: 1280, height: 720 }),
      browser: () => jsWrap({ __kind: 'browser', newContext: () => env.page.context(), newPage: () => env.page, close: () => {}, version: () => 'simulated' })
    };
    async function getFix(name, chain) {
      if (name in cache) return cache[name];
      if (chain.includes(name)) throw new PWError('Fixtures have a cycle: ' + chain.concat(name).join(' → '));
      if (T.defs[name] !== undefined) {
        let def = T.defs[name], o = {};
        if (Array.isArray(def)) { o = def[1] || {}; def = def[0]; }
        if (typeof def !== 'function') return cache[name] = def;
        const deps = {}; for (const d of paramNames(def)) deps[d] = await getFix(d, chain.concat(name));
        const { value, teardown } = await setupFixture(def, deps, info);
        teardowns.push(teardown); return cache[name] = value;
      }
      if (builtins[name]) return cache[name] = builtins[name]();
      throw new PWError(`Fixture "${name}" is not defined. Built-ins: page, context, request, browser, browserName, baseURL. Custom fixtures come from test.extend({ … }).`);
    }
    const argsFor = async f => { const o = {}; for (const n of paramNames(f)) o[n] = await getFix(n, []); return o; };
    let err = null;
    try {
      for (const k of Object.keys(T.defs)) { const d = T.defs[k]; if (Array.isArray(d) && d[1] && d[1].auto) await getFix(k, []); }
      for (const s of T.scopes) if (!s.ranAll) { s.ranAll = true; for (const h of s.beforeAll) await h(await argsFor(h), info); }
      for (const s of T.scopes) for (const h of s.before) await h(await argsFor(h), info);
      await T.fn(await argsFor(T.fn), info);
    } catch (e) { err = e; }
    for (const s of T.scopes.slice().reverse()) for (const h of s.after) { try { await h(await argsFor(h), info); } catch (e) { err = err || e; } }
    for (const td of teardowns.reverse()) { try { await td(); } catch (e) { err = err || e; } }
    await flush(); await flush();
    const warn = [];
    for (const p of env.pending) {
      if (p.awaited) continue;
      let failed = null; try { await p.p; } catch (e) { failed = e; }
      if (failed && !err) { err = failed; err.message = `${err.message}\n\nThis call was not awaited (line ${p.line || '?'}). Add await before ${p.label}(…).`; }
      warn.push(`Line ${p.line || '?'}: ${p.label}() is not awaited. Playwright calls return promises — put await in front.`);
    }
    env.snap('end of test');
    results.push(testResult(T.name, env, err, 'js', false, warn));
  }
  reg.scopes.forEach(s => s.ranAll = false);
  cur = null;
  return aggregate('js', code, results, null, warnings);
}
function lintJS(code) {
  const w = []; const lines = code.split('\n');
  lines.forEach((l, i) => {
    if (/waitForTimeout\s*\(/.test(l)) w.push(`Line ${i + 1}: waitForTimeout() is a fixed sleep. Prefer a web-first assertion that waits for the condition.`);
  });
  return w;
}

/* ---------------- Python runner ---------------- */
async function runPy(code, opts) {
  let mod, js;
  const H = pyHelpers();
  const expectFn = (a, m) => pyWrap(RT.makeExpect(cur, unwrap)(a, m));
  H.expect = expectFn;
  const names = Object.keys(H);
  try { js = RT.translatePython(code); }
  catch (e) { return aggregate('py', code, [], presentError(e, 'py', null), []); }
  try {
    const f = new Function(...names, '"use strict";\n' + js + '\n//# sourceURL=user-test.py.js');
    mod = f(...names.map(n => H[n]));
  } catch (e) { const pe = presentError(e, 'py', null); pe.message = (e instanceof SyntaxError ? 'SyntaxError: ' : '') + pe.message + (e instanceof SyntaxError ? '\n(The simulator supports a practical subset of Python — see the Python notes in the lab panel.)' : ''); return aggregate('py', code, [], pe, []); }
  const fixtures = {}, tests = [];
  Object.keys(mod.meta).forEach(n => {
    const mk = (mod.marks[n] || []);
    const fx = mk.find(m => m && m.kind === 'fixture');
    if (fx) { fixtures[n] = { fn: mod.defs[n], params: mod.meta[n].params, gen: mod.meta[n].gen, autouse: !!(fx.opts && fx.opts.autouse) }; return; }
    if (!n.startsWith('test')) return;
    const skip = mk.some(m => m && m.kind === 'skip');
    const pz = mk.filter(m => m && m.kind === 'parametrize');
    if (!pz.length) tests.push({ name: n, fn: mod.defs[n], params: mod.meta[n].params, given: {}, skip });
    else {
      let combos = [{}];
      pz.forEach(p => { const ks = String(p.names).split(',').map(s => s.trim()); const nc = []; combos.forEach(c => p.values.forEach(v => { const o = Object.assign({}, c); const vals = ks.length > 1 ? v : [v]; ks.forEach((k, i) => o[k] = vals[i]); nc.push(o); })); combos = nc; });
      combos.forEach(c => tests.push({ name: `${n}[${Object.values(c).map(v => pyStr(v)).join('-')}]`, fn: mod.defs[n], params: mod.meta[n].params, given: c, skip }));
    }
  });
  if (!tests.length) return aggregate('py', code, [], { message: 'No tests found. pytest collects functions whose names start with test_, e.g. def test_login(page: Page):' }, []);
  const results = [];
  for (const T of tests) {
    if (T.skip) { results.push(testResult(T.name, null, null, 'py', true)); continue; }
    const env = new Env(opts.frame, { baseURL: opts.baseURL, expectTimeout: opts.expectTimeout, onEvent: opts.onEvent });
    cur = env; env.wrap = pyWrap; env.testName = T.name; env.lang = 'py';
    if (opts.onEvent) opts.onEvent({ type: 'test', name: T.name });
    const cache = {}, teardowns = [];
    const builtins = {
      page: () => pyWrap(env.page), context: () => pyWrap(env.page.context()), browser_name: () => 'chromium', base_url: () => env.baseURL,
      api_request_context: () => pyWrap(new APIRequestContext(env, { baseURL: env.baseURL || 'https://api.test' })),
      playwright: () => pyWrap({ __kind: 'playwright', request: { __kind: 'apiFactory', newContext: o => new APIRequestContext(env, o || {}) }, devices: {} }),
      browser: () => pyWrap({ __kind: 'browser', newContext: () => env.page.context(), newPage: () => env.page, close: () => {} })
    };
    const getFix = (name, chain) => {
      if (name in cache) return cache[name];
      if (name in T.given) return T.given[name];
      if (chain.includes(name)) throw new PWError('fixture cycle: ' + chain.concat(name).join(' → '));
      const fx = fixtures[name];
      if (fx) {
        const args = fx.params.map(p => getFix(p, chain.concat(name)));
        const r = fx.fn(...args);
        if (fx.gen) { const st = r.next(); teardowns.push(() => { const s2 = r.next(); }); return cache[name] = st.value; }
        return cache[name] = r;
      }
      if (builtins[name]) return cache[name] = builtins[name]();
      throw new PWError(`fixture '${name}' not found\n  available fixtures: page, context, browser, browser_name, base_url, api_request_context, playwright${Object.keys(fixtures).length ? ', ' + Object.keys(fixtures).join(', ') : ''}`);
    };
    let err = null;
    try {
      Object.keys(fixtures).filter(k => fixtures[k].autouse).forEach(k => getFix(k, []));
      const args = T.params.map(p => getFix(p, []));
      T.fn(...args);
    } catch (e) { err = e; }
    for (const td of teardowns.reverse()) { try { td(); } catch (e) { err = err || e; } }
    env.snap('end of test');
    results.push(testResult(T.name, env, err, 'py'));
  }
  cur = null;
  const warnings = [];
  code.split('\n').forEach((l, i) => { if (/wait_for_timeout\s*\(|time\.sleep\s*\(/.test(l)) warnings.push(`Line ${i + 1}: fixed sleeps make tests slow and flaky. Prefer a web-first assertion.`); });
  return aggregate('py', code, results, null, warnings);
}

RT.run = async function (opts) {
  const fn = opts.lang === 'py' ? runPy : runJS;
  try { return await fn(opts.code, opts); }
  catch (e) { cur = null; return aggregate(opts.lang, opts.code, [], presentError(e, opts.lang, null), []); }
};
RT.pyStr = pyStr;
})(typeof window !== 'undefined' ? window : globalThis);



/* ===== Playwright Path · labs ===== */
(function (G) {
'use strict';
const PWC = G.PWC = G.PWC || {};
const strip = (code, lang) => code.split('\n').map(l => lang === 'py' ? l.replace(/(^|\s)#.*$/, '') : l.replace(/\/\/.*$/, '')).join('\n');
const C = {
  pass: ['All tests pass', r => r.passed],
  tests: n => [`At least ${n} passing tests`, r => r.tests.filter(t => t.status === 'passed').length >= n],
  calls: (name, label, min) => [label, r => (r.calls[name] || 0) >= (min || 1)],
  noCalls: (name, label) => [label, r => !r.calls[name] && r.tests.length > 0],
  code: (js, py, label) => [label, r => (r.lang === 'py' ? py : js).test(strip(r.code, r.lang))],
  noCode: (re, label) => [label, r => r.tests.length > 0 && !re.test(strip(r.code, r.lang))],
  acted: (kind, re, label, min) => [label, r => r.actions.filter(a => a.kind === kind && (!re || re.test(String(a.value)) || re.test(String(a.target)))).length >= (min || 1)],
  asserted: (m, label, min) => [label, r => r.asserts.filter(a => (Array.isArray(m) ? m.includes(a.matcher) : a.matcher === m) && a.pass).length >= (min || 1)],
  url: (re, label) => [label, r => r.tests.some(t => re.test(t.finalUrl) || t.actions.some(a => re.test(a.url)))]
};
PWC.C = C;

const JSI = "import { test, expect } from '@playwright/test';\n\n";
const PYI = 'from playwright.sync_api import Page, expect\n\n\n';
const LOGIN_JS = `  await page.goto('https://shop.test/');
  await page.getByLabel('Username').fill('standard_user');
  await page.getByLabel('Password').fill('secret_sauce');
  await page.getByRole('button', { name: 'Log in' }).click();`;
const LOGIN_PY = `    page.goto("https://shop.test/")
    page.get_by_label("Username").fill("standard_user")
    page.get_by_label("Password").fill("secret_sauce")
    page.get_by_role("button", name="Log in").click()`;

PWC.labs = [];

PWC.playground = {
  js: JSI + `// Free practice. Sites: https://shop.test  https://todo.test  https://play.test  https://api.test
test('explore', async ({ page }) => {
  await page.goto('https://play.test/');
  await expect(page.getByRole('heading', { name: 'Playground' })).toBeVisible();
  console.log(await page.getByRole('link').allTextContents());
});
`,
  py: PYI + `# Free practice. Sites: https://shop.test  https://todo.test  https://play.test  https://api.test
def test_explore(page: Page):
    page.goto("https://play.test/")
    expect(page.get_by_role("heading", name="Playground")).to_be_visible()
    print(page.get_by_role("link").all_text_contents())
`
};
})(typeof window !== 'undefined' ? window : globalThis);


/* Postman Path — workbench: request builder, collection settings, response viewer, runner, environments */
(function (G) {
'use strict';
const PM = G.PM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
G.esc = esc;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/* ---------------------------------------------------------------- highlighting */
const PYKW = new Set('def return if elif else for in while import from as class with try except finally raise assert lambda pass yield and or not is None True False self async await'.split(' '));
function hlPy(code) {
  const re = /("""[\s\S]*?"""|'''[\s\S]*?'''|[rfbRFB]{0,2}"(?:\\.|[^"\\\n])*"|[rfbRFB]{0,2}'(?:\\.|[^'\\\n])*')|(#.*)|(\b\d[\d_.]*\b)|(@?[A-Za-z_]\w*)(?=\s*\()|(@?[A-Za-z_]\w*)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    const [, st, c, n, f, w] = m;
    if (st) out += '<span class="t-s">' + esc(st) + '</span>';
    else if (c) out += '<span class="t-c">' + esc(c) + '</span>';
    else if (n) out += '<span class="t-n">' + esc(n) + '</span>';
    else if (f) out += PYKW.has(f) ? '<span class="t-kw">' + f + '</span>' : '<span class="t-k">' + esc(f) + '</span>';
    else out += PYKW.has(w) || /^@/.test(w) ? '<span class="t-kw">' + esc(w) + '</span>' : (w === 'page' || w === 'expect' ? '<span class="t-pm">' + w + '</span>' : esc(w));
    last = re.lastIndex; if (m[0] === '') re.lastIndex++;
  }
  return out + esc(code.slice(last));
}
function hl(code, lang) {
  code = String(code == null ? '' : code);
  if (lang === 'py' || lang === 'python') return hlPy(code);
  let re;
  if (lang === 'json') re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\{\{[^}\n]*\}\})/g;
  else if (lang === 'http' || lang === 'text' || lang === 'bash' || lang === 'csv' || lang === 'yaml') re = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|^(HTTP\/1\.1 .*|→ .*)$|^([A-Za-z][\w-]*)(?=: )|(\{\{[^}\n]*\}\})|("(?:\\.|[^"\\\n])*")|(#.*$)|(^\s*-?-?[a-z][\w-]*(?= )|\s--?[a-z][\w-]*)/gm;
  else re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|of|in|new|true|false|null|undefined|async|await|typeof|throw|try|catch|while)\b|\b(\d+(?:\.\d+)?)\b|\b(pm|console|page|expect|test|request)\b|(\/(?![*/])(?:\\.|[^/\\\n])+\/[gimsuy]*)(?=\s*[.,;)\]]|$)/gm;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(last, m.index));
    let cls = '';
    if (lang === 'json') cls = m[1] ? (m[2] ? 'k' : 's') : m[3] ? 'b' : m[4] ? 'n' : 'v';
    else if (lang === 'http' || lang === 'text' || lang === 'bash' || lang === 'csv' || lang === 'yaml') cls = m[1] ? 'kw' : m[2] ? 'st' : m[3] ? 'k' : m[4] ? 'v' : m[5] ? 's' : m[6] ? 'c' : 'kw';
    else cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'kw' : m[4] ? 'n' : m[5] ? 'pm' : 're';
    if (lang === 'json' && m[1] && m[2]) out += '<span class="t-k">' + esc(m[1]) + '</span>' + esc(m[2]);
    else out += '<span class="t-' + cls + '">' + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
G.hl = hl;

/* ---------------------------------------------------------------- code editor */
function editorHtml(key, value, lang, ph) {
  const v = value || '';
  const lines = Math.max(1, v.split('\n').length);
  let g = ''; for (let i = 1; i <= lines; i++) g += i + '\n';
  return '<div class="ed" data-lang="' + lang + '"><div class="ed-in"><pre class="ed-g" aria-hidden="true">' + g + '</pre><div class="ed-txt"><pre class="ed-hl" aria-hidden="true">' + hl(v, lang) + '\n</pre><textarea class="ed-ta" spellcheck="false" autocapitalize="off" autocomplete="off" data-ed="' + key + '" placeholder="' + esc(ph || '') + '">' + esc(v) + '</textarea></div></div></div>';
}
function refreshEditor(ta) {
  const wrap = ta.closest('.ed'); if (!wrap) return;
  const lang = wrap.getAttribute('data-lang');
  wrap.querySelector('.ed-hl').innerHTML = hl(ta.value, lang) + '\n';
  const lines = Math.max(1, ta.value.split('\n').length);
  let g = ''; for (let i = 1; i <= lines; i++) g += i + '\n';
  wrap.querySelector('.ed-g').textContent = g;
}
function editorKeys(e, onRun) {
  const ta = e.target;
  if (!ta.classList || !ta.classList.contains('ed-ta')) return;
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    const s = ta.selectionStart, en = ta.selectionEnd;
    ta.setRangeText('  ', s, en, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    const s = ta.selectionStart; const before = ta.value.slice(0, s); const line = before.split('\n').pop();
    let ind = (line.match(/^\s*/) || [''])[0]; if (/[{[(]\s*$/.test(line)) ind += '  ';
    e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
G.editorHtml = editorHtml; G.refreshEditor = refreshEditor; G.editorKeys = editorKeys;

const SNIPPETS = [
  ['Status code is 200', "pm.test('Status code is 200', () => {\n  pm.response.to.have.status(200);\n});\n"],
  ['Response time below 500 ms', "pm.test('Response time is below 500 ms', () => {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});\n"],
  ['JSON value check', "pm.test('Has the expected value', () => {\n  const body = pm.response.json();\n  pm.expect(body.id).to.eql(1);\n});\n"],
  ['Content-Type is JSON', "pm.test('Content-Type is JSON', () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json');\n});\n"],
  ['Header is present', "pm.test('Location header is present', () => {\n  pm.response.to.have.header('Location');\n});\n"],
  ['JSON schema', "const schema = {\n  type: 'object',\n  required: ['id'],\n  properties: { id: { type: 'integer' } }\n};\npm.test('Matches schema', () => {\n  pm.response.to.have.jsonSchema(schema);\n});\n"],
  ['Set a collection variable', "pm.collectionVariables.set('userId', pm.response.json().id);\n"],
  ['Set an environment variable', "pm.environment.set('token', pm.response.json().token);\n"],
  ['Get a variable', "const value = pm.variables.get('baseUrl');\n"],
  ['Log to the console', "console.log(pm.info.requestName, pm.response.code);\n"],
  ['Send a request', "pm.sendRequest(pm.variables.replaceIn('{{baseUrl}}/health'), (err, res) => {\n  console.log(err ? err.message : res.json());\n});\n"],
  ['Set next request', "pm.execution.setNextRequest('Request name');\n"]
];
const PRE_SNIPPETS = [
  ['Set a variable', "pm.collectionVariables.set('email', pm.variables.replaceIn('{{$randomEmail}}'));\n"],
  ['Add a header', "pm.request.headers.add({ key: 'X-Trace-Id', value: pm.variables.replaceIn('{{$guid}}') });\n"],
  ['Log the request', "console.log(pm.request.method, pm.request.url.toString());\n"],
  ['Skip this request', "if (!pm.collectionVariables.get('userId')) pm.execution.skipRequest();\n"],
  ['Send a request', "pm.sendRequest(pm.variables.replaceIn('{{baseUrl}}/health'), (err, res) => {\n  console.log(res.code);\n});\n"]
];

/* ---------------------------------------------------------------- helpers */
function splitUrl(url) { const i = (url || '').indexOf('?'); return i < 0 ? [url || '', ''] : [url.slice(0, i), url.slice(i + 1)]; }
function queryRows(url, prev) {
  const q = splitUrl(url)[1];
  const rows = q ? q.split('&').map(p => { const i = p.indexOf('='); return { key: i < 0 ? p : p.slice(0, i), value: i < 0 ? '' : p.slice(i + 1) }; }) : [];
  (prev || []).filter(r => r.disabled).forEach(r => rows.push(r));
  return rows;
}
function urlFromRows(url, rows) { const base = splitUrl(url)[0]; const q = rows.filter(r => !r.disabled && (r.key || r.value)).map(r => r.key + (r.value !== '' || /=/.test(r.key) ? '=' + r.value : '')).join('&'); return base + (q ? '?' + q : ''); }
function pathVarNames(url) { const out = []; splitUrl(url)[0].replace(/\/:([A-Za-z_][\w-]*)/g, (a, n) => { if (out.indexOf(n) < 0) out.push(n); }); return out; }
function prettyJson(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return null; } }
function codeClass(c) { return c >= 500 ? 's5' : c >= 400 ? 's4' : c >= 300 ? 's3' : 's2'; }
function fmtSize(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }
G.codeClass = codeClass;

function kvTable(name, rows, o) {
  o = o || {};
  const list = (rows || []).concat([{ key: '', value: '', _new: true }]);
  let h = '<div class="kv" role="table"><div class="kv-h" role="row">' + (o.toggle ? '<span></span>' : '') + '<span>' + (o.k || 'Key') + '</span><span>' + (o.v || 'Value') + '</span><span></span></div>';
  list.forEach((r, i) => {
    h += '<div class="kv-r' + (r.disabled ? ' off' : '') + (r._new ? ' new' : '') + '" role="row">' + (o.toggle ? '<input type="checkbox" aria-label="Include" data-kv="' + name + '" data-i="' + i + '" data-f="on"' + (r.disabled ? '' : ' checked') + (r._new ? ' disabled' : '') + '>' : '') +
      '<input class="kv-k" data-kv="' + name + '" data-i="' + i + '" data-f="key" value="' + esc(r.key) + '" placeholder="' + (r._new ? 'Add key' : '') + '" spellcheck="false" aria-label="Key">' +
      '<input class="kv-v" data-kv="' + name + '" data-i="' + i + '" data-f="value" value="' + esc(r.value) + '" placeholder="' + (r._new ? 'Value' : '') + '" spellcheck="false" aria-label="Value"' + (o.readonlyKeys ? '' : '') + '>' +
      (r._new || o.noDelete ? '<span></span>' : '<button class="icon" data-kvdel="' + name + '" data-i="' + i + '" aria-label="Remove row" title="Remove">×</button>') + '</div>';
  });
  return h + '</div>';
}


/* ================================================================ Workbench */
function Workbench(root, opts) {
  this.root = root; this.o = opts;
  this.ui = Object.assign({ sel: null, reqTab: 'params', collTab: 'vars', resTab: 'body', view: 'response', outs: {}, run: null, env: null, confirm: null, rename: null }, opts.ui || {});
  const ws = this.ws();
  if (!this.ui.sel || (this.ui.sel !== 'coll' && !ws.collection.items.find(i => i.id === this.ui.sel))) this.ui.sel = ws.collection.items[0] ? ws.collection.items[0].id : 'coll';
  this.render();
  this.bind();
}
const W = Workbench.prototype;
W.ws = function () { return this.o.getWs(); };
W.save = function () { this.o.save(); };
W.item = function () { return this.ws().collection.items.find(i => i.id === this.ui.sel); };

W.render = function () {
  const ws = this.ws(); const c = ws.collection; const ui = this.ui;
  let side = '<div class="wb-side"><div class="wb-envbar"><label class="sr" for="envsel">Environment</label><select id="envsel" data-act="env" title="Active environment"><option value="">No environment</option>' +
    ws.environments.map(e => '<option value="' + esc(e.id) + '"' + (ws.activeEnv === e.id ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select><button class="btn sm ghost" data-act="envs">Environments</button></div>' +
    '<button class="wb-coll' + (ui.sel === 'coll' ? ' on' : '') + '" data-act="selcoll" title="Collection settings: variables, auth, scripts"><span class="folder" aria-hidden="true"></span><span>' + esc(c.name) + '</span><span class="muted sm">settings</span></button><ul class="wb-items">';
  c.items.forEach(it => {
    side += '<li class="wb-item' + (ui.sel === it.id ? ' on' : '') + '" data-sel="' + esc(it.id) + '" tabindex="0"><span class="mb m-' + it.method + '">' + (it.method === 'DELETE' ? 'DEL' : it.method === 'OPTIONS' ? 'OPT' : it.method) + '</span><span class="nm">' + esc(it.name) + '</span>' +
      '<span class="wb-acts"><button class="icon" data-dup="' + esc(it.id) + '" title="Duplicate" aria-label="Duplicate ' + esc(it.name) + '">⧉</button><button class="icon" data-del="' + esc(it.id) + '" title="Delete" aria-label="Delete ' + esc(it.name) + '">×</button></span></li>';
  });
  side += '</ul><button class="btn sm ghost wide" data-act="add">+ Add request</button></div>';
  let main = '<div class="wb-main"><div class="wb-top">' + (ui.sel === 'coll' ? this.collHtml() : this.reqHtml()) + '</div>' +
    '<div class="wb-bottom"><div class="tabs" role="tablist"><button role="tab" class="tab' + (ui.view === 'response' ? ' on' : '') + '" data-view="response">Response</button><button role="tab" class="tab' + (ui.view === 'runner' ? ' on' : '') + '" data-view="runner">Runner</button>' + (ui.view === 'response' ? this.statusHtml() : '') + '</div><div class="wb-res">' + (ui.view === 'runner' ? this.runnerHtml() : this.resHtml()) + '</div></div></div>';
  this.root.innerHTML = '<div class="wb">' + side + main + '</div>' + (ui.env ? this.envHtml() : '');
};

W.reqHtml = function () {
  const it = this.item(); if (!it) return '<p class="empty">Add a request to start.</p>';
  const ui = this.ui;
  const tabs = [['params', 'Params'], ['auth', 'Authorization'], ['headers', 'Headers' + (it.headers.filter(h => !h.disabled && h.key).length ? ' (' + it.headers.filter(h => !h.disabled && h.key).length + ')' : '')], ['body', 'Body'], ['pre', 'Pre-request'], ['tests', 'Tests'], ['examples', 'Examples' + ((it.examples || []).length ? ' (' + it.examples.length + ')' : '')]];
  const dot = k => (k === 'pre' && it.pre && it.pre.trim()) || (k === 'tests' && it.tests && it.tests.trim()) || (k === 'body' && it.body.mode !== 'none') || (k === 'auth' && it.auth.type !== 'inherit') ? '<i class="dot" aria-hidden="true"></i>' : '';
  return '<input class="wb-name" data-f="name" value="' + esc(it.name) + '" aria-label="Request name" spellcheck="false">' +
    '<div class="wb-url"><select data-f="method" class="msel m-' + it.method + '" aria-label="Method">' + METHODS.map(m => '<option' + (m === it.method ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
    '<input data-f="url" value="' + esc(it.url) + '" placeholder="https://api.pocket.test/users" spellcheck="false" aria-label="URL"><button class="btn dark" data-act="send" title="Send (Ctrl+Enter)">Send</button></div>' +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button role="tab" class="tab' + (ui.reqTab === t[0] ? ' on' : '') + '" data-rtab="' + t[0] + '">' + t[1] + dot(t[0]) + '</button>').join('') + '</div><div class="wb-panel" data-panel="req">' + this.reqPanel() + '</div>';
};
W.reqPanel = function () {
  const it = this.item(); const t = this.ui.reqTab;
  if (t === 'params') {
    const pv = pathVarNames(it.url);
    let h = '<h4>Query params</h4>' + kvTable('query', queryRows(it.url, it._qoff));
    if (pv.length) h += '<h4>Path variables</h4><div class="kv"><div class="kv-h"><span>Key</span><span>Value</span><span></span></div>' + pv.map(n => '<div class="kv-r"><input class="kv-k" value="' + esc(n) + '" readonly aria-label="Path variable"><input class="kv-v" data-pv="' + esc(n) + '" value="' + esc((it.pathVars || {})[n] || '') + '" placeholder="value" spellcheck="false" aria-label="Value of ' + esc(n) + '"><span></span></div>').join('') + '</div>';
    return h;
  }
  if (t === 'headers') return kvTable('headers', it.headers, { toggle: true }) + '<p class="note">Auto-added when sending: <code>User-Agent</code>, <code>Accept</code>, <code>Host</code>' + (it.body.mode === 'raw' ? ', <code>Content-Type: application/json</code> (unless you set one)' : it.body.mode === 'urlencoded' ? ', <code>Content-Type: application/x-www-form-urlencoded</code>' : '') + '.</p>';
  if (t === 'auth') return this.authHtml(it.auth, true);
  if (t === 'body') {
    const b = it.body;
    let h = '<div class="radios" role="radiogroup" aria-label="Body type">' + [['none', 'none'], ['raw', 'raw (JSON)'], ['urlencoded', 'x-www-form-urlencoded']].map(r => '<label><input type="radio" name="bmode" data-bmode="' + r[0] + '"' + (b.mode === r[0] ? ' checked' : '') + '> ' + r[1] + '</label>').join('') + (b.mode === 'raw' ? '<button class="btn sm ghost" data-act="beautify">Beautify</button><span class="bmsg" aria-live="polite"></span>' : '') + '</div>';
    if (b.mode === 'raw') h += editorHtml('body', b.raw, 'json', '{\n  "name": "Ada"\n}');
    else if (b.mode === 'urlencoded') h += kvTable('form', b.form, { toggle: true });
    else h += '<p class="note">This request has no body.</p>';
    return h;
  }
  if (t === 'examples') {
    const ex = it.examples || [];
    let h = '<p class="note">Examples are saved responses for this request. <code>https://mock.test</code> serves them when the method and path match; pick one with the header <code>x-mock-response-name</code> (or <code>x-mock-response-code</code>).</p>';
    ex.forEach((e, k) => {
      h += '<div class="exed"><div class="exrow"><label>Name <input data-ex="' + k + '" data-exf="name" value="' + esc(e.name) + '" spellcheck="false"></label>' +
        '<label>Method <select data-ex="' + k + '" data-exf="method">' + METHODS.map(m => '<option' + (m === e.method ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' +
        '<label class="grow">Path <input data-ex="' + k + '" data-exf="path" value="' + esc(e.path) + '" spellcheck="false"></label>' +
        '<label>Status <input type="number" min="100" max="599" data-ex="' + k + '" data-exf="code" value="' + esc(e.code) + '"></label>' +
        '<button class="icon" data-exdel="' + esc(it.id) + '" data-k="' + k + '" aria-label="Delete example ' + esc(e.name) + '" title="Delete">×</button></div>' +
        editorHtml('exbody-' + k, e.body, 'json', '{ }') + '</div>';
    });
    if (!ex.length) h += '<p class="empty">No examples yet. Add one here, or send the request and choose <b>Save as example</b>.</p>';
    return h + '<button class="btn sm" data-act="exadd">+ Add example</button>';
  }
  if (t === 'pre' || t === 'tests') return this.scriptHtml(t, it[t], t === 'pre' ? 'Runs before the request is sent.' : 'Runs after the response arrives. Use pm.test() and pm.expect().');
  return '';
};
W.scriptHtml = function (key, val, note) {
  const sn = key === 'pre' || key === 'cpre' ? PRE_SNIPPETS : SNIPPETS;
  return '<div class="script"><div class="script-ed"><p class="note">' + note + '</p>' + editorHtml(key, val, 'js', key === 'pre' || key === 'cpre' ? '// pre-request script' : "pm.test('Status code is 200', () => {\n  pm.response.to.have.status(200);\n});") + '</div><div class="snips"><h4>Snippets</h4>' + sn.map((s, i) => '<button class="snip" data-snip="' + i + '" data-sk="' + key + '">' + esc(s[0]) + '</button>').join('') + '</div></div>';
};
W.authHtml = function (a, isReq) {
  const types = (isReq ? [['inherit', 'Inherit auth from parent']] : []).concat([['none', 'No Auth'], ['apikey', 'API Key'], ['basic', 'Basic Auth'], ['bearer', 'Bearer Token']]);
  let h = '<div class="authf"><label>Type <select data-auth="type">' + types.map(t => '<option value="' + t[0] + '"' + (a.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label>';
  if (a.type === 'inherit') { const p = this.ws().collection.auth || { type: 'none' }; h += '<p class="note">This request uses the collection\'s auth: <b>' + ({ none: 'No Auth', apikey: 'API Key', basic: 'Basic Auth', bearer: 'Bearer Token' }[p.type] || 'No Auth') + '</b>. Change it in the collection settings.</p>'; }
  if (a.type === 'apikey') h += '<label>Key <input data-auth="key" value="' + esc(a.key || '') + '" placeholder="x-api-key" spellcheck="false"></label><label>Value <input data-auth="value" value="' + esc(a.value || '') + '" spellcheck="false"></label><label>Add to <select data-auth="in"><option value="header"' + (a.in !== 'query' ? ' selected' : '') + '>Header</option><option value="query"' + (a.in === 'query' ? ' selected' : '') + '>Query params</option></select></label>';
  if (a.type === 'basic') h += '<label>Username <input data-auth="username" value="' + esc(a.username || '') + '" spellcheck="false"></label><label>Password <input data-auth="password" value="' + esc(a.password || '') + '" spellcheck="false"></label><p class="note">Sent as <code>Authorization: Basic base64(username:password)</code>.</p>';
  if (a.type === 'bearer') h += '<label>Token <input data-auth="token" value="' + esc(a.token || '') + '" placeholder="{{token}}" spellcheck="false"></label><p class="note">Sent as <code>Authorization: Bearer &lt;token&gt;</code>. Use <code>{{token}}</code> to read a variable.</p>';
  if (a.type === 'none') h += '<p class="note">No credentials are sent' + (isReq ? ', even if the collection has auth.' : '.') + '</p>';
  return h + '</div>';
};
W.collHtml = function () {
  const c = this.ws().collection; const t = this.ui.collTab;
  const tabs = [['vars', 'Variables'], ['auth', 'Authorization'], ['cpre', 'Pre-request'], ['ctests', 'Tests'], ['ex', 'Examples']];
  let h = '<input class="wb-name" data-cf="name" value="' + esc(c.name) + '" aria-label="Collection name" spellcheck="false"><p class="note">Collection settings apply to every request in it.</p><div class="tabs" role="tablist">' + tabs.map(x => '<button role="tab" class="tab' + (t === x[0] ? ' on' : '') + '" data-ctab="' + x[0] + '">' + x[1] + '</button>').join('') + '</div><div class="wb-panel" data-panel="coll">';
  if (t === 'vars') h += kvTable('cvars', c.variables, { k: 'Variable', v: 'Value' });
  if (t === 'auth') h += this.authHtml(c.auth || { type: 'none' }, false);
  if (t === 'cpre') h += this.scriptHtml('cpre', c.pre, 'Runs before every request in the collection.');
  if (t === 'ctests') h += this.scriptHtml('ctests', c.tests, 'Runs after every request in the collection.');
  if (t === 'ex') {
    const ex = []; c.items.forEach(i => (i.examples || []).forEach((e, k) => ex.push([i, e, k])));
    h += ex.length ? '<p class="note">These examples are served by <code>https://mock.test</code> (matched by method and path).</p><ul class="exl">' + ex.map(([i, e, k]) => '<li><span class="mb m-' + e.method + '">' + e.method + '</span> <code>' + esc(e.path) + '</code> → <span class="code ' + codeClass(e.code) + '">' + e.code + '</span> ' + esc(e.name) + ' <span class="muted">(' + esc(i.name) + ')</span> <button class="icon" data-exdel="' + esc(i.id) + '" data-k="' + k + '" aria-label="Delete example">×</button></li>').join('') + '</ul>' : '<p class="empty">No examples yet. Send a request and choose <b>Save as example</b>.</p>';
  }
  return h + '</div>';
};

W.statusHtml = function () {
  const out = this.ui.outs[this.ui.sel];
  if (!out || !out.response) return '';
  const r = out.response;
  return '<span class="stat"><span class="code ' + codeClass(r.code) + '">' + r.code + ' ' + esc(r.status) + '</span><span>' + r.time + ' ms</span><span>' + fmtSize(r.size) + '</span><button class="btn sm ghost" data-act="saveex">Save as example</button></span>';
};
W.resHtml = function () {
  const out = this.ui.outs[this.ui.sel];
  if (this.ui.sel === 'coll') return '<p class="empty">Select a request and press Send. Use the Runner tab to run the whole collection.</p>';
  if (!out) return '<p class="empty">Press <b>Send</b> (Ctrl+Enter) to see the response here.</p>';
  if (out.skipped) return '<p class="empty">The request was skipped by <code>pm.execution.skipRequest()</code>.</p>' + this.consoleHtml(out);
  const t = this.ui.resTab;
  const nt = out.tests.length, np = out.tests.filter(x => x.pass).length;
  let h = '<div class="tabs sub" role="tablist">' + [['body', 'Body'], ['headers', 'Headers'], ['tests', 'Test Results' + (nt ? ' (' + np + '/' + nt + ')' : '')], ['console', 'Console']].map(x => '<button role="tab" class="tab' + (t === x[0] ? ' on' : '') + (x[0] === 'tests' && nt && np < nt ? ' bad' : '') + '" data-restab="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>';
  if (out.netError) h += '<div class="err"><b>Could not send request</b><br>Error: ' + esc(out.netError) + (out.hint ? '<br><span class="muted">' + esc(out.hint) + '</span>' : '') + '</div>';
  out.errors.forEach(e => { h += '<div class="err">' + esc(e.msg) + ' <span class="muted">(' + esc(e.where) + ')</span></div>'; });
  if (t === 'body' && out.response) {
    const b = out.response.body; const p = prettyJson(b);
    h += b ? '<pre class="code-view">' + (p ? hl(p, 'json') : esc(b)) + '</pre>' : '<p class="empty">The response has no body.</p>';
  }
  if (t === 'headers' && out.response) h += '<table class="ht"><tbody>' + Object.keys(out.response.headers).map(k => '<tr><th>' + esc(k) + '</th><td>' + esc(out.response.headers[k]) + '</td></tr>').join('') + '</tbody></table>';
  if (t === 'tests') h += testsHtml(out.tests, true);
  if (t === 'console') h += this.consoleHtml(out);
  return h;
};
function testsHtml(tests, emptyMsg) {
  if (!tests.length) return emptyMsg ? '<p class="empty">No tests ran. Add <code>pm.test()</code> blocks on the Tests tab.</p>' : '';
  return '<ul class="tres">' + tests.map(t => '<li class="' + (t.pass ? 'ok' : 'no') + '"><span class="chip ' + (t.pass ? 'chip-strong' : 'chip-weak') + '">' + (t.pass ? 'Pass' : 'Fail') + '</span> ' + esc(t.name) + (t.where === 'collection tests' ? ' <span class="muted">(collection)</span>' : '') + (t.pass && t.asserts === 0 ? ' <span class="warn">no assertion inside — this test cannot fail</span>' : '') + (t.error ? '<div class="terr">' + esc(t.error) + '</div>' : '') + '</li>').join('') + '</ul>';
}
G.testsHtml = testsHtml;
W.consoleHtml = function (out) {
  let h = '<div class="console">';
  (out.logs || []).filter(l => l.where && /pre/.test(l.where)).forEach(l => h += '<div class="log ' + l.lvl + '">' + esc(l.text) + '</div>');
  if (out.request) {
    const rq = out.request;
    h += '<details open><summary><span class="mb m-' + rq.method + '">' + rq.method + '</span> ' + esc(rq.url) + (out.response ? ' <span class="code ' + codeClass(out.response.code) + '">' + out.response.code + '</span> <span class="muted">' + out.response.time + ' ms</span>' : '') + '</summary>' +
      '<div class="cgrid"><h5>Request headers</h5><table class="ht"><tbody>' + Object.keys(rq.headers).map(k => '<tr><th>' + esc(k) + '</th><td>' + esc(rq.headers[k]) + '</td></tr>').join('') + '</tbody></table>' +
      (rq.body ? '<h5>Request body</h5><pre class="code-view sm">' + esc(rq.body) + '</pre>' : '') +
      (out.response ? '<h5>Response headers</h5><table class="ht"><tbody>' + Object.keys(out.response.headers).map(k => '<tr><th>' + esc(k) + '</th><td>' + esc(out.response.headers[k]) + '</td></tr>').join('') + '</tbody></table>' : '') + '</div></details>';
    (out.sub || []).forEach(s => h += '<div class="log info">pm.sendRequest → ' + esc(s.method) + ' ' + esc(s.url) + ' <span class="code ' + codeClass(s.code) + '">' + s.code + '</span></div>');
  }
  (out.logs || []).filter(l => !l.where || !/pre/.test(l.where)).forEach(l => h += '<div class="log ' + l.lvl + '">' + esc(l.text) + '</div>');
  if (out.unresolved && out.unresolved.length) h += '<div class="log warn">Unresolved: ' + out.unresolved.map(v => '{{' + esc(v) + '}}').join(', ') + '</div>';
  return h + '</div>';
};

W.runnerHtml = function () {
  const ws = this.ws(); const rn = ws.runner;
  const sel = rn.selected && rn.selected.length ? rn.selected : ws.collection.items.map(i => i.id);
  let h = '<div class="runner"><div class="run-set"><label>Iterations <input type="number" min="1" max="50" data-rn="iterations" value="' + esc(rn.iterations || 1) + '"></label>' +
    '<div class="run-items"><span class="lbl">Requests in this run</span>' + ws.collection.items.map(i => '<label><input type="checkbox" data-rsel="' + esc(i.id) + '"' + (sel.indexOf(i.id) >= 0 ? ' checked' : '') + '> <span class="mb m-' + i.method + '">' + i.method + '</span> ' + esc(i.name) + '</label>').join('') + '</div>' +
    '<label class="dl">Data file (CSV with a header row, or a JSON array)</label>' + editorHtml('rdata', rn.data || '', 'csv', 'username,password,expected\nadmin,admin123,200') +
    '<p class="note">With data, one iteration runs per row unless you set more iterations. Columns become data variables: <code>{{username}}</code>, <code>pm.iterationData.get("username")</code>.</p>' +
    '<button class="btn dark" data-act="run">Run ' + esc(ws.collection.name) + '</button></div><div class="run-rep">' + (this.ui.run ? runReport(this.ui.run) : '<p class="empty">Run results appear here.</p>') + '</div></div>';
  return h;
};
function runReport(r) {
  if (r.error) return '<div class="err">' + esc(r.error) + '</div>';
  let h = '<div class="run-sum"><span class="ok">' + r.passed + ' passed</span><span class="no">' + r.failed + ' failed</span>' + (r.errors.length ? '<span class="no">' + r.errors.length + ' script error' + (r.errors.length > 1 ? 's' : '') + '</span>' : '') + '<span class="muted">' + r.runs.length + ' requests · ' + r.iterations + ' iteration' + (r.iterations > 1 ? 's' : '') + '</span></div>';
  let it = -1;
  r.runs.forEach(x => {
    if (x.iteration !== it && r.iterations > 1) { it = x.iteration; h += '<h5 class="iter">Iteration ' + (it + 1) + '</h5>'; }
    h += '<div class="rrow"><div class="rline">' + (x.request ? '<span class="mb m-' + x.request.method + '">' + x.request.method + '</span> <b>' + esc(x.name) + '</b> <span class="muted url">' + esc(x.request.url) + '</span>' : '<b>' + esc(x.name) + '</b>') +
      (x.response ? ' <span class="code ' + codeClass(x.response.code) + '">' + x.response.code + '</span> <span class="muted">' + x.response.time + ' ms</span>' : x.skipped ? ' <span class="muted">skipped</span>' : '') + '</div>' +
      (x.netError ? '<div class="err sm">Error: ' + esc(x.netError) + (x.hint ? ' — ' + esc(x.hint) : '') + '</div>' : '') +
      (x.errors || []).map(e => '<div class="err sm">' + esc(e.msg) + '</div>').join('') + testsHtml(x.tests || [], false) +
      (x.logs || []).filter(l => l.where === 'runner').map(l => '<div class="log warn">' + esc(l.text) + '</div>').join('') + '</div>';
  });
  return h;
}
G.runReport = runReport;

W.envHtml = function () {
  const ws = this.ws(); const cur = this.ui.env;
  const isG = cur === 'globals'; const env = isG ? null : ws.environments.find(e => e.id === cur);
  let h = '<div class="modal" role="dialog" aria-modal="true" aria-label="Environments"><div class="modal-box wide"><div class="modal-h"><h3>Environments and globals</h3><button class="icon" data-act="envclose" aria-label="Close">×</button></div><div class="envs"><ul>' +
    ws.environments.map(e => '<li><button class="' + (cur === e.id ? 'on' : '') + '" data-envpick="' + esc(e.id) + '">' + esc(e.name) + (ws.activeEnv === e.id ? ' <span class="muted">(active)</span>' : '') + '</button></li>').join('') +
    '<li><button class="' + (isG ? 'on' : '') + '" data-envpick="globals">Globals</button></li></ul><button class="btn sm ghost" data-act="envnew">+ New environment</button></div><div class="env-ed">';
  if (isG) h += '<h4>Globals</h4><p class="note">Widest scope. Every collection can read these.</p>' + kvTable('glob', ws.globals, { k: 'Variable', v: 'Value' });
  else if (env) h += '<label class="envname">Name <input data-envname value="' + esc(env.name) + '" spellcheck="false"></label>' + kvTable('envv', env.values, { k: 'Variable', v: 'Value' }) + '<div class="row"><button class="btn sm" data-act="envuse">' + (ws.activeEnv === env.id ? 'Active' : 'Set as active') + '</button><button class="btn sm ghost danger" data-act="envdel">Delete environment</button></div>';
  else h += '<p class="empty">Choose an environment, or create one.</p>';
  return h + '</div></div></div>';
};

/* ---------------------------------------------------------------- actions */
W.rerender = function (focusSel) {
  const a = document.activeElement; let key = null, pos = null;
  if (a && this.root.contains(a)) { key = focusKey(a); try { pos = [a.selectionStart, a.selectionEnd]; } catch (e) { pos = null; } }
  this.render();
  const k = focusSel || key;
  if (k) { const el = this.root.querySelector(k); if (el) { el.focus(); if (pos && el.setSelectionRange && el.type !== 'checkbox' && el.type !== 'number') try { el.setSelectionRange(pos[0], pos[1]); } catch (e) {} } }
};
function focusKey(el) {
  const attrs = ['data-ex', 'data-exf', 'data-kv', 'data-i', 'data-f', 'data-pv', 'data-auth', 'data-ed', 'data-cf', 'data-rn', 'data-envname'];
  const parts = attrs.filter(x => el.hasAttribute(x)).map(x => '[' + x + '="' + String(el.getAttribute(x)).replace(/"/g, '\\"') + '"]');
  return parts.length ? parts.join('') : null;
}
W.kvList = function (name) {
  const ws = this.ws(); const it = this.item();
  if (name === 'headers') return it.headers;
  if (name === 'form') return it.body.form;
  if (name === 'cvars') return ws.collection.variables;
  if (name === 'glob') return ws.globals;
  if (name === 'envv') { const e = ws.environments.find(x => x.id === this.ui.env); return e ? e.values : []; }
  return null;
};
W.send = async function () {
  const it = this.item(); if (!it) return;
  this.ui.view = 'response';
  const btn = this.root.querySelector('[data-act="send"]'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const out = await PM.send(this.ws(), it.id, this.o.server());
  this.ui.outs[it.id] = out;
  if (out.tests.length && out.tests.some(t => !t.pass)) this.ui.resTab = 'tests';
  else if (out.netError || out.errors.length) this.ui.resTab = this.ui.resTab === 'console' ? 'console' : 'body';
  this.save(); this.rerender();
  this.o.onSend && this.o.onSend(out);
};
W.runAll = async function () {
  this.ui.view = 'runner';
  const r = await PM.run(this.ws(), { server: this.o.runServer ? this.o.runServer() : undefined });
  this.ui.run = r;
  if (r.ws) { const ws = this.ws(); ws.collection.variables = r.ws.collection.variables; ws.globals = r.ws.globals; ws.environments = r.ws.environments; }
  this.save(); this.rerender();
};
W.showRun = function (r) { this.ui.run = r; this.ui.view = 'runner'; this.rerender(); };

W.bind = function () {
  const root = this.root; const self = this;
  root.addEventListener('click', e => self.onClick(e));
  root.addEventListener('input', e => self.onInput(e));
  root.addEventListener('change', e => self.onChange(e));
  root.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (self.ui.sel !== 'coll') self.send(); return; }
    if (e.key === 'Escape' && self.ui.env) { self.ui.env = null; self.rerender(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('wb-item')) { e.preventDefault(); self.ui.sel = e.target.getAttribute('data-sel'); self.rerender('[data-sel="' + self.ui.sel + '"]'); return; }
    editorKeys(e);
  });
};
W.onClick = function (e) {
  const t = e.target.closest('button, li.wb-item, [data-envpick]'); if (!t) return;
  const ws = this.ws(); const ui = this.ui; const g = a => t.getAttribute(a);
  if (g('data-dup')) { e.stopPropagation(); const src = ws.collection.items.find(i => i.id === g('data-dup')); const cp = PM.newItem(Object.assign(PM.clone(src), { id: PM.uid('req'), name: src.name + ' copy' })); ws.collection.items.splice(ws.collection.items.indexOf(src) + 1, 0, cp); ui.sel = cp.id; this.save(); return this.rerender(); }
  if (g('data-del')) { e.stopPropagation(); const id = g('data-del'); if (ui.confirm !== id) { ui.confirm = id; t.textContent = '✓'; t.title = 'Click again to delete'; t.setAttribute('aria-label', 'Confirm delete'); return; } ws.collection.items = ws.collection.items.filter(i => i.id !== id); ui.confirm = null; if (ui.sel === id) ui.sel = ws.collection.items[0] ? ws.collection.items[0].id : 'coll'; this.save(); return this.rerender(); }
  if (t.classList.contains('wb-item')) { ui.sel = g('data-sel'); ui.confirm = null; return this.rerender(); }
  if (g('data-rtab')) { ui.reqTab = g('data-rtab'); return this.rerender(); }
  if (g('data-ctab')) { ui.collTab = g('data-ctab'); return this.rerender(); }
  if (g('data-restab')) { ui.resTab = g('data-restab'); return this.rerender(); }
  if (g('data-view')) { ui.view = g('data-view'); return this.rerender(); }
  if (g('data-kvdel')) { const l = this.kvList(g('data-kvdel')); if (g('data-kvdel') === 'query') { const it = this.item(); const rows = queryRows(it.url, it._qoff); rows.splice(Number(g('data-i')), 1); it._qoff = rows.filter(r => r.disabled); it.url = urlFromRows(it.url, rows); } else if (l) l.splice(Number(g('data-i')), 1); this.save(); return this.rerender(); }
  if (g('data-snip')) { const key = g('data-sk'); const list = key === 'pre' || key === 'cpre' ? PRE_SNIPPETS : SNIPPETS; const ta = this.root.querySelector('[data-ed="' + key + '"]'); if (ta) { const s = ta.selectionStart; const pre = s > 0 && ta.value[s - 1] !== '\n' ? '\n' : ''; ta.setRangeText(pre + list[Number(g('data-snip'))][1], s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); } return; }
  if (g('data-exdel')) { const it = ws.collection.items.find(i => i.id === g('data-exdel')); it.examples.splice(Number(g('data-k')), 1); this.save(); return this.rerender(); }
  if (g('data-envpick')) { ui.env = g('data-envpick'); return this.rerender(); }
  const act = g('data-act');
  if (act === 'send') return this.send();
  if (act === 'run') return this.runAll();
  if (act === 'add') { const it = PM.newItem({ name: 'New request', url: ws.collection.variables.some(v => v.key === 'baseUrl') ? '{{baseUrl}}/' : '' }); ws.collection.items.push(it); ui.sel = it.id; ui.reqTab = 'params'; this.save(); return this.rerender('.wb-name'); }
  if (act === 'selcoll') { ui.sel = 'coll'; return this.rerender(); }
  if (act === 'beautify') { const it = this.item(); const msg = this.root.querySelector('.bmsg'); const p = prettyJson((it.body.raw || '').replace(/\{\{[^}]+\}\}/g, m => '"' + m + '"').replace(/""\{\{/g, '"{{').replace(/\}\}""/g, '}}"')); if (/\{\{/.test(it.body.raw || '')) { try { JSON.parse((it.body.raw || '').replace(/"?\{\{[^}]+\}\}"?/g, '0')); if (msg) msg.textContent = 'Valid JSON (variables kept as they are).'; } catch (er) { if (msg) msg.textContent = 'Invalid JSON: ' + er.message; } return; } if (p === null) { if (msg) { try { JSON.parse(it.body.raw); } catch (er) { msg.textContent = 'Invalid JSON: ' + er.message; } } return; } it.body.raw = p; this.save(); return this.rerender(); }
  if (act === 'exadd') { const it = this.item(); const p = PM.parseUrl(it.url || ''); it.examples = it.examples || []; it.examples.push({ name: 'example ' + (it.examples.length + 1), method: it.method, path: (p.path || '/').replace(/\/+$/, '') || '/', code: 200, headers: { 'Content-Type': 'application/json' }, body: '{\n  \n}' }); this.save(); return this.rerender('[data-ex="' + (it.examples.length - 1) + '"][data-exf="name"]'); }
  if (act === 'saveex') { const it = this.item(); const out = ui.outs[it.id]; if (!out || !out.response) return; const p = PM.parseUrl(out.request.url); it.examples = it.examples || []; const name = it.name + ' – ' + out.response.code; it.examples.push({ name, method: out.request.method, path: p.path.replace(/\/+$/, '') || '/', code: out.response.code, headers: { 'Content-Type': out.response.headers['Content-Type'] || 'application/json' }, body: out.response.body }); this.save(); t.textContent = 'Saved'; t.disabled = true; this.o.onChange && this.o.onChange(); return; }
  if (act === 'envs') { ui.env = ws.activeEnv || (ws.environments[0] ? ws.environments[0].id : 'globals'); return this.rerender(); }
  if (act === 'envclose') { ui.env = null; return this.rerender(); }
  if (act === 'envnew') { const e = { id: PM.uid('env'), name: 'New environment', values: [] }; ws.environments.push(e); ui.env = e.id; this.save(); return this.rerender('[data-envname]'); }
  if (act === 'envuse') { ws.activeEnv = ui.env; this.save(); return this.rerender(); }
  if (act === 'envdel') { ws.environments = ws.environments.filter(e => e.id !== ui.env); if (ws.activeEnv === ui.env) ws.activeEnv = null; ui.env = ws.environments[0] ? ws.environments[0].id : 'globals'; this.save(); return this.rerender(); }
};
W.onInput = function (e) {
  const t = e.target; const g = a => t.getAttribute(a); const ws = this.ws(); const it = this.item();
  if (t.classList.contains('ed-ta')) {
    refreshEditor(t);
    const k = g('data-ed');
    if (k === 'body') it.body.raw = t.value; else if (k === 'pre' || k === 'tests') it[k] = t.value;
    else if (k && k.indexOf('exbody-') === 0) { const e = it.examples[Number(k.slice(7))]; if (e) e.body = t.value; } else if (k === 'cpre') ws.collection.pre = t.value; else if (k === 'ctests') ws.collection.tests = t.value; else if (k === 'rdata') ws.runner.data = t.value;
    return this.save();
  }
  if (g('data-f') === 'name' && it) { it.name = t.value; const li = this.root.querySelector('.wb-item.on .nm'); if (li) li.textContent = t.value; return this.save(); }
  if (g('data-f') === 'url' && it) { it.url = t.value; this.save(); if (this.ui.reqTab === 'params') { const p = this.root.querySelector('[data-panel="req"]'); if (p) p.innerHTML = this.reqPanel(); } return; }
  if (g('data-ex') !== null && it) { const e = it.examples[Number(g('data-ex'))]; if (e) { const f = g('data-exf'); e[f] = f === 'code' ? (Number(t.value) || 200) : t.value; } return this.save(); }
  if (g('data-cf') === 'name') { ws.collection.name = t.value; return this.save(); }
  if (g('data-pv')) { it.pathVars = it.pathVars || {}; it.pathVars[g('data-pv')] = t.value; return this.save(); }
  if (g('data-auth')) { const a = this.ui.sel === 'coll' ? ws.collection.auth : it.auth; a[g('data-auth')] = t.value; return this.save(); }
  if (g('data-envname')) { const env = ws.environments.find(x => x.id === this.ui.env); if (env) env.name = t.value; return this.save(); }
  if (g('data-rn') === 'iterations') { ws.runner.iterations = Math.max(1, Math.min(50, Number(t.value) || 1)); return this.save(); }
  if (g('data-kv')) {
    const name = g('data-kv'), i = Number(g('data-i')), f = g('data-f');
    if (f === 'on') return;
    if (name === 'query') {
      const rows = queryRows(it.url, it._qoff); const isNew = i >= rows.length;
      if (isNew) rows.push({ key: '', value: '' });
      rows[i][f] = t.value; it._qoff = rows.filter(r => r.disabled); it.url = urlFromRows(it.url, rows);
      const u = this.root.querySelector('[data-f="url"]'); if (u) u.value = it.url;
      this.save(); if (isNew) this.rerender(); return;
    }
    const l = this.kvList(name); if (!l) return;
    const isNew = i >= l.length; if (isNew) l.push({ key: '', value: '' });
    l[i][f] = t.value; this.save(); if (isNew) this.rerender();
  }
};
W.onChange = function (e) {
  const t = e.target; const g = a => t.getAttribute(a); const ws = this.ws(); const it = this.item();
  if (g('data-act') === 'env') { ws.activeEnv = t.value || null; this.save(); return; }
  if (g('data-ex') !== null && g('data-exf') === 'method' && it) { it.examples[Number(g('data-ex'))].method = t.value; return this.save(); }
  if (g('data-f') === 'method' && it) { it.method = t.value; this.save(); return this.rerender(); }
  if (g('data-auth') === 'type' || g('data-auth') === 'in') { const a = this.ui.sel === 'coll' ? ws.collection.auth : it.auth; a[g('data-auth')] = t.value; this.save(); return this.rerender(); }
  if (g('data-bmode')) { it.body.mode = g('data-bmode'); if (it.body.mode === 'raw' && !it.body.raw) it.body.raw = '{\n  \n}'; this.save(); return this.rerender(); }
  if (g('data-rsel')) { const all = ws.collection.items.map(i => i.id); let sel = ws.runner.selected && ws.runner.selected.length ? ws.runner.selected.slice() : all.slice(); const id = g('data-rsel'); if (t.checked) { if (sel.indexOf(id) < 0) sel.push(id); } else sel = sel.filter(x => x !== id); sel = all.filter(x => sel.indexOf(x) >= 0); ws.runner.selected = sel.length === all.length ? [] : sel; this.save(); return; }
  if (g('data-kv') && g('data-f') === 'on') {
    const name = g('data-kv'), i = Number(g('data-i'));
    if (name === 'query') { const rows = queryRows(it.url, it._qoff); rows[i].disabled = !t.checked; it._qoff = rows.filter(r => r.disabled); it.url = urlFromRows(it.url, rows); this.save(); return this.rerender(); }
    const l = this.kvList(name); if (l && l[i]) { l[i].disabled = !t.checked; this.save(); return this.rerender(); }
  }
};
G.Workbench = Workbench;
})(window);

/* Learning Paths · Playwright lab plugin (ported from Playwright Path; markup follows the design guide) */
(function (G) {
'use strict';
const RT = G.PWRT, esc = G.esc, hl = G.hl;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const LANG_NAME = { js: 'JavaScript', py: 'Python' };

/* The practice browser: tests run against an in-memory document; this view mirrors it into a
   Shadow DOM and forwards clicks, typing and hovering back, so the live site stays usable. */
function makeViewport(host, getEnv) {
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const vf = RT.createVirtualFrame(); const doc = vf.contentDocument; let raf = 0, alive = true;
  const pathOf = (node, base) => { const p = []; while (node && node !== base) { const par = node.parentNode; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.childNodes, node)); node = par; } return node === base ? p : null; };
  const at = (base, p) => p.reduce((n, i) => n && n.childNodes[i], base);
  const mbody = () => root.querySelector('.pw-body');
  const real = t => { const mb = mbody(); if (!mb || !t) return null; const p = pathOf(t, mb); return p ? at(doc.body, p) : null; };
  function paint() {
    raf = 0; if (!alive) return; const body = doc.body; if (!body) { root.innerHTML = ''; return; }
    const css = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n').replace(/\bbody\b/g, '.pw-body').replace(/\bhtml\b/g, ':host');
    const act = root.activeElement; const ap = act ? pathOf(act, mbody()) : null;
    const sel = act && typeof act.selectionStart === 'number' ? [act.selectionStart, act.selectionEnd] : null; const sc = host.scrollTop;
    root.innerHTML = '<style>:host{display:block}' + css + '.pw-body{min-height:100%}</style><div class="pw-body">' + body.innerHTML + '</div>';
    const mb = mbody(); const rs = body.querySelectorAll('input,textarea,select'), ms = mb.querySelectorAll('input,textarea,select');
    rs.forEach((r, i) => { const m = ms[i]; if (!m) return; if (r.type === 'checkbox' || r.type === 'radio') m.checked = r.checked; else m.value = r.value; m.disabled = r.disabled; });
    if (ap) { const el = at(mb, ap); if (el && el.focus) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
    host.scrollTop = sc;
  }
  const schedule = () => { if (!raf) raf = (G.requestAnimationFrame || (f => setTimeout(f, 16)))(paint); };
  const mo = new MutationObserver(schedule); mo.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
  const live = () => { const env = getEnv(); return env && env.doc === doc ? env : null; };
  root.addEventListener('submit', e => e.preventDefault(), true);
  root.addEventListener('click', e => {
    e.preventDefault(); const env = live(); if (!env) return; const t = real(e.target); if (!t) return;
    if (t.nodeType === 1) { env.focused = t; if (typeof t.click === 'function') t.click(); else env.fire(t, 'click', 'MouseEvent'); }
    env.afterAction(); schedule();
  });
  root.addEventListener('input', e => { const env = live(), t = real(e.target); if (!env || !t || /^(checkbox|radio)$/.test(e.target.type)) return; t.value = e.target.value; env.fire(t, 'input', 'Event'); });
  root.addEventListener('change', e => { const env = live(), t = real(e.target); if (!env || !t || /^(checkbox|radio)$/.test(e.target.type)) return; t.value = e.target.value; env.fire(t, 'change', 'Event'); env.afterAction(); schedule(); });
  root.addEventListener('keydown', e => {
    const env = live(), t = real(e.target); if (!env || !t) return; env.focused = t;
    env.fire(t, 'keydown', 'KeyboardEvent', { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey });
    if (e.key === 'Enter' && t.tagName === 'INPUT' && t.form) { e.preventDefault(); env.fire(t.form, 'submit', 'Event'); }
    env.afterAction(); schedule();
  });
  root.addEventListener('mouseover', e => { const env = live(), t = real(e.target); if (!env || !t || t.nodeType !== 1) return; env.hoverTo(t); env.afterAction(); schedule(); });
  host.addEventListener('mouseleave', () => { const env = live(); if (env && doc.body) { env.hoverTo(doc.body); schedule(); } });
  return { frame: vf, doc, paint, schedule, destroy() { alive = false; mo.disconnect(); } };
}

/* Code editor with line gutter and error lines */
function makeEditor(host, value, lang, onChange) {
  host.innerHTML = '<div class="pwg" aria-hidden="true"></div><div class="pwc"><pre aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Test code"></textarea></div>';
  const ta = $('textarea', host), pre = $('pre', host), gut = $('.pwg', host); let errs = new Set();
  const unit = lang === 'py' ? '    ' : '  ';
  ta.value = value;
  function paint() {
    pre.innerHTML = hl(ta.value, lang) + '\n';
    const n = ta.value.split('\n').length; gut.innerHTML = Array.from({ length: n }, (_, i) => '<div class="' + (errs.has(i + 1) ? 'err' : '') + '">' + (i + 1) + '</div>').join('');
    ta.style.height = '0px'; ta.style.height = Math.max(ta.scrollHeight, host.clientHeight - 2) + 'px';
    ta.style.width = '100%'; if (ta.scrollWidth > ta.clientWidth) ta.style.width = (ta.scrollWidth + 20) + 'px';
  }
  function insert(text) {
    ta.focus(); let ok = false; try { ok = document.execCommand('insertText', false, text); } catch (e) {}
    if (!ok) { const s = ta.selectionStart, e = ta.selectionEnd; ta.setRangeText(text, s, e, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  ta.addEventListener('input', () => { paint(); onChange(ta.value); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const s = ta.selectionStart, v = ta.value; const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (e.shiftKey) { if (v.startsWith(unit, ls)) { ta.setSelectionRange(ls, ls + unit.length); insert(''); } else if (v[ls] === ' ') { let k = 0; while (v[ls + k] === ' ' && k < unit.length) k++; ta.setSelectionRange(ls, ls + k); insert(''); } }
      else insert(unit);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const s = ta.selectionStart, v = ta.value; const ls = v.lastIndexOf('\n', s - 1) + 1; const line = v.slice(ls, s);
      let ind = (line.match(/^\s*/) || [''])[0]; if (/[:{([]\s*$/.test(line)) ind += unit;
      insert('\n' + ind);
    }
  });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paint()) : null; if (ro) ro.observe(host);
  paint();
  return { set(v) { ta.value = v; paint(); onChange(v); }, setErrors(s) { errs = s; paint(); }, destroy() { if (ro) ro.disconnect(); }, saveT: null };
}

/* ctx: { st, lang, setLang(l), save(), onSolved(), inline, md, chip, crumb, openRef(), refLabel, playground } */
function render(main, lab, ctx) {
  const ls = ctx.st; ls.code = ls.code || {}; const lang = ctx.lang;
  let code = ls.code[lang] != null ? ls.code[lang] : lab.starter[lang];
  let result = null, running = false, live = null, pump = null, traceTest = 0, panelTab = 'results';
  const inline = ctx.inline, md = ctx.md, chip = ctx.chip;
  const hasChecks = lab.checks.length > 0;
  const statusChip = () => !hasChecks ? chip('none', 'Playground') : ls.solved ? chip('strong', 'Solved') : ls.attempts ? chip('avg', 'Attempted') : chip('none', 'New');
  main.innerHTML = '<div class="pwlab">' +
    '<section class="card brief" id="brief" aria-label="Lab brief">' + ctx.crumb + '<h1>' + esc(lab.title) + '</h1><div class="metaline" id="labchips">' + statusChip() + (hasChecks ? '<span class="badge mono">' + lab.checks.length + ' checks</span>' : '') + '</div>' +
    '<div class="bd">' + md(lab.brief) + '</div>' +
    (lab.tasks.length ? '<div><div class="label">' + (hasChecks ? 'Tasks' : 'Practice sites') + '</div><ol class="bd">' + lab.tasks.map(t => '<li>' + inline(t) + '</li>').join('') + '</ol></div>' : '') +
    (hasChecks ? '<div><div class="label">Checks</div><ul class="checks" id="checks"></ul></div><p class="runmsg" id="runmsg" role="status"></p>' : '<p class="runmsg" id="runmsg" role="status"></p>') +
    (lab.hints.length ? '<div><div class="label">Hints</div><div id="hints" style="margin-top:6px"></div><button class="btn sm" data-lab="hint">Show hint 1 / ' + lab.hints.length + '</button></div>' : '') +
    '<details class="sm"><summary class="muted">' + (lang === 'py' ? 'Python notes' : 'JavaScript notes') + '</summary><div class="bd">' + (lang === 'py' ? md('Write pytest-style functions named `test_…`. Fixtures: `page`, `context`, `browser_name`, `base_url`, `api_request_context` (base URL `https://api.test`), `playwright`. Supported: classes, `@pytest.fixture` with `yield`, `autouse`, `@pytest.mark.parametrize`, lambdas, f-strings, comprehensions, `import re`. Not supported: `with` blocks, async code, nested comprehensions.') : md('Import `test` and `expect` from `@playwright/test`. Fixtures: `page`, `context`, `request`, `browser`, `browserName`, `baseURL`. Supported: `describe`, hooks, `test.use`, `test.extend`, `test.step`, `expect.soft`. Write plain JavaScript (no TypeScript types). Other imports are not available — define helpers in the file.')) + '</div></details>' +
    '<div class="foot">' + (lab.solution ? '<span id="cf-sol"><button class="link" data-lab="solution">Show solution</button></span>' : '') + '<span id="cf-reset"><button class="link" data-lab="reset">Reset code</button></span><button class="link" data-lab="ref">' + esc(ctx.refLabel) + '</button></div></section>' +
    '<section class="card pw-edcol" aria-label="Code"><div class="pw-bar"><span class="mono sm">' + (lang === 'py' ? 'test_' + lab.id.replace(/-/g, '_') + '.py' : lab.id + '.spec.js') + '</span><span class="spacer"></span><span class="pills" role="group" aria-label="Language">' + ['js', 'py'].map(l => '<button class="pill' + (lang === l ? ' on' : '') + '" data-lang="' + l + '" aria-pressed="' + (lang === l) + '">' + LANG_NAME[l] + '</button>').join('') + '</span><button class="btn primary" data-lab="run" title="Run tests (Ctrl+Enter)">Run tests</button></div><div class="pw-editor" id="pweditor"></div></section>' +
    '<section class="pw-right"><div class="card pw-browser"><div class="pw-chrome"><form class="pw-url" id="urlform"><label class="sr" for="pwurl">Address</label><input id="pwurl" spellcheck="false"></form><span class="chip chip-none" id="statetag">Live</span><button class="btn sm" data-lab="live" title="Reload the live site">Reload</button></div><div id="pwframe" class="pw-viewport" role="region" aria-label="Practice browser"></div></div>' +
    '<div class="card pw-panel"><div class="tabs" role="tablist">' + ['Results', 'Trace', 'Console'].map((t, i) => '<button role="tab" class="tab' + (i === 0 ? ' on' : '') + '" data-panel="' + t.toLowerCase() + '">' + t + '</button>').join('') + '</div><div class="pw-panelbody" id="pwpanel"></div></div></section></div>';
  const urlIn = $('#pwurl'), stateTag = $('#statetag'), msg = $('#runmsg');
  const say = (t, ok) => { if (msg) { msg.textContent = t; msg.className = 'runmsg' + (ok === true ? ' ok' : ok === false ? ' no' : ''); } };
  const vp = makeViewport($('#pwframe'), () => live); const frame = vp.frame;
  const ed = makeEditor($('#pweditor'), code, lang, v => { code = v; ls.code[lang] = v; clearTimeout(ed.saveT); ed.saveT = setTimeout(ctx.save, 600); });
  const setUrl = u => { urlIn.value = u; };
  function startLive(url) {
    stopLive();
    live = new RT.Env(frame, { onEvent: e => { if (e.type === 'nav') setUrl(e.url); if (e.type === 'log' && /auto-dismissed/.test(e.m)) say('The page opened a dialog; it was dismissed in the live preview.'); } });
    try { live.navigate(url || lab.site, false); } catch (e) { say(e.message, false); }
    pump = setInterval(() => { if (live) live.clock.advance(50); }, 50);
    stateTag.textContent = 'Live'; stateTag.className = 'chip chip-none'; vp.paint();
  }
  function stopLive() { if (pump) clearInterval(pump); pump = null; live = null; }
  $('#urlform').addEventListener('submit', e => { e.preventDefault(); let u = urlIn.value.trim(); if (!/^[a-z]+:/i.test(u)) u = 'https://' + u; if (live) { try { live.navigate(u, false); } catch (er) { say(er.message, false); } } else startLive(u); });
  startLive();
  function renderChecks() {
    const el = $('#checks'); if (!el) return;
    el.innerHTML = lab.checks.map(([label, fn]) => { let st = null; if (result) { try { st = !!fn(result); } catch (e) { st = false; } } return '<li class="' + (st === true ? 'ok' : st === false ? 'no' : '') + '"><span class="ck" aria-hidden="true">' + (st === true ? '✓' : st === false ? '✗' : '·') + '</span><span>' + esc(label) + (st === null ? '' : '<span class="sr">' + (st ? ' — passed' : ' — failing') + '</span>') + '</span></li>'; }).join('');
    $('#labchips').innerHTML = statusChip() + (hasChecks ? '<span class="badge mono">' + lab.checks.length + ' checks</span>' : '');
  }
  function renderPanel() {
    const P = $('#pwpanel'); $$('.pw-panel .tab').forEach(b => b.classList.toggle('on', b.dataset.panel === panelTab));
    if (running) { P.innerHTML = '<p class="empty">Running…</p>'; return; }
    if (!result) { P.innerHTML = '<p class="empty">Select <b>Run tests</b> (Ctrl+Enter) to execute your code. Results, a step-by-step trace and console output appear here.</p>'; return; }
    if (panelTab === 'results') {
      if (result.compileError) { P.innerHTML = '<div class="pw-test failed"><div class="pw-th">' + chip('weak', 'Could not run') + '</div><div class="err">' + (result.compileError.line ? '<b>Line ' + result.compileError.line + '</b>\n' : '') + esc(result.compileError.message) + '</div></div>'; return; }
      const pass = result.tests.filter(t => t.status === 'passed').length, fail = result.tests.filter(t => t.status === 'failed').length, skip = result.tests.filter(t => t.status === 'skipped').length;
      P.innerHTML = '<div class="run-sum"><span class="ok">' + pass + ' passed</span>' + (fail ? '<span class="no">' + fail + ' failed</span>' : '') + (skip ? '<span class="muted">' + skip + ' skipped</span>' : '') + '<span class="muted">' + LANG_NAME[result.lang] + '</span></div>' +
        result.tests.map(t => '<div class="pw-test ' + t.status + '"><div class="pw-th">' + chip(t.status === 'passed' ? 'strong' : t.status === 'failed' ? 'weak' : 'none', t.status === 'passed' ? 'Pass' : t.status === 'failed' ? 'Fail' : 'Skipped') + '<span>' + esc(t.name) + '</span><span class="spacer"></span><span class="mono sm muted">' + t.duration + ' ms virtual</span></div>' + t.errors.map(e => '<div class="err">' + (e.line ? '<b>Line ' + e.line + '</b>\n' : '') + esc(e.message) + '</div>').join('') + '</div>').join('') +
        result.warnings.map(w => '<p class="warn">' + esc(w) + '</p>').join('');
    } else if (panelTab === 'trace') {
      const tests = result.tests.filter(t => t.trace && t.trace.length);
      if (!tests.length) { P.innerHTML = '<p class="empty">No trace recorded.</p>'; return; }
      const t = tests[Math.min(traceTest, tests.length - 1)];
      P.innerHTML = (tests.length > 1 ? '<div class="row"><label class="sm muted" for="trsel">Test</label><select id="trsel">' + tests.map((x, i) => '<option value="' + i + '"' + (i === traceTest ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div>' : '') +
        '<p class="note">Select a step to see the page at that moment. Outlines show the element the step used.</p><ol class="pw-steps">' + t.trace.map((s, i) => '<li><button data-step="' + i + '" class="' + (s.failed ? 'fail' : '') + '"><span class="mono sm muted">' + s.t + ' ms</span><span>' + esc(s.title) + '</span></button></li>').join('') + '</ol>';
      const sel = $('#trsel'); if (sel) sel.addEventListener('change', () => { traceTest = +sel.value; renderPanel(); });
      $$('[data-step]', P).forEach(b => b.addEventListener('click', () => { $$('[data-step]', P).forEach(x => x.classList.remove('on')); b.classList.add('on'); const s = t.trace[+b.dataset.step]; stopLive(); try { frame.contentDocument.documentElement.innerHTML = s.html; vp.paint(); } catch (e) {} setUrl(s.url); stateTag.textContent = 'Trace step ' + (+b.dataset.step + 1); stateTag.className = 'chip chip-good'; }));
    } else {
      const logs = result.tests.flatMap(t => t.logs.map(l => ({ t: t.name, m: l.m })));
      P.innerHTML = logs.length ? logs.map(l => '<div class="log"><span class="muted">' + esc(l.t) + ' ›</span> ' + esc(l.m) + '</div>').join('') : '<p class="empty">No console output. Use ' + (lang === 'py' ? '<code>print()</code>' : '<code>console.log()</code>') + ' in your test.</p>';
    }
  }
  async function run() {
    if (running) return; running = true; stopLive(); const btn = $('[data-lab="run"]'); btn.disabled = true; btn.textContent = 'Running…'; renderPanel();
    stateTag.textContent = 'Running'; stateTag.className = 'chip chip-good';
    try { result = await RT.run({ lang, code, frame, onEvent: e => { if (e.type === 'nav') setUrl(e.url); } }); }
    catch (e) { result = { lang, code, tests: [], compileError: { message: String(e && e.message || e) }, warnings: [], calls: {}, actions: [], asserts: [], api: [], logs: [] }; }
    running = false; btn.disabled = false; btn.textContent = 'Run tests'; stateTag.textContent = 'After run'; stateTag.className = 'chip chip-none'; vp.paint();
    ls.attempts = (ls.attempts || 0) + 1;
    const errLines = new Set(); if (result.compileError && result.compileError.line) errLines.add(result.compileError.line); result.tests.forEach(t => t.errors.forEach(e => e.line && errLines.add(e.line)));
    ed.setErrors(errLines);
    if (hasChecks) {
      const failing = lab.checks.filter(([, fn]) => { try { return !fn(result); } catch (e) { return true; } }).length;
      if (!failing) { if (!ls.solved) { ls.solved = true; ls.solvedAt = Date.now(); } ctx.onSolved(); say('All checks pass — lab solved.' + (ls.sawSolution ? ' You viewed the solution; reset the code later and solve it unaided.' : ''), true); }
      else say(failing + ' of ' + lab.checks.length + ' checks failing. See Results for details.', false);
    }
    ctx.save(); renderChecks(); renderPanel(); ctx.refresh && ctx.refresh();
  }
  let hintsShown = ls.hints || 0;
  const showHints = () => { const h = $('#hints'); if (h) h.innerHTML = lab.hints.slice(0, hintsShown).map(x => '<p class="hint">' + inline(x) + '</p>').join(''); const b = $('[data-lab="hint"]'); if (b) { if (hintsShown >= lab.hints.length) b.remove(); else b.textContent = 'Show hint ' + (hintsShown + 1) + ' / ' + lab.hints.length; } };
  showHints();
  const root = main.querySelector('.pwlab');
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-lab],[data-panel],[data-lang]'); if (!b) return;
    if (b.dataset.panel) { panelTab = b.dataset.panel; renderPanel(); return; }
    if (b.dataset.lang) { if (b.dataset.lang !== lang) ctx.setLang(b.dataset.lang); return; }
    const a = b.dataset.lab;
    if (a === 'run') run();
    else if (a === 'live') startLive(lab.site);
    else if (a === 'ref') ctx.openRef();
    else if (a === 'hint') { hintsShown++; ls.hints = hintsShown; ctx.save(); showHints(); }
    else if (a === 'solution' || a === 'reset') { $('#cf-' + (a === 'solution' ? 'sol' : 'reset')).innerHTML = '<span class="confirm">' + (a === 'solution' ? 'Replace your code with the solution?' : 'Discard your code and restore the starter?') + ' <button class="btn sm danger" data-lab="' + a + '-yes">' + (a === 'solution' ? 'Show solution' : 'Reset code') + '</button><button class="link" data-lab="' + a + '-no">Cancel</button></span>'; }
    else if (a === 'solution-yes') { code = lab.solution[lang]; ls.code[lang] = code; ls.sawSolution = true; ed.set(code); ctx.save(); $('#cf-sol').innerHTML = '<button class="link" data-lab="solution">Show solution</button>'; say('Solution loaded. Run it and compare it with your approach.'); }
    else if (a === 'reset-yes') { code = lab.starter[lang]; ls.code[lang] = code; ed.set(code); ctx.save(); $('#cf-reset').innerHTML = '<button class="link" data-lab="reset">Reset code</button>'; }
    else if (a === 'solution-no') $('#cf-sol').innerHTML = '<button class="link" data-lab="solution">Show solution</button>';
    else if (a === 'reset-no') $('#cf-reset').innerHTML = '<button class="link" data-lab="reset">Reset code</button>';
  });
  renderChecks(); renderPanel();
  return { run, destroy() { stopLive(); vp.destroy(); ed.destroy(); clearTimeout(ed.saveT); ctx.save(); } };
}
G.PwLab = { render };
})(window);

/* Learning Paths — one app, several courses. Visual and interaction rules: CTFL Prep Design Guide. */
