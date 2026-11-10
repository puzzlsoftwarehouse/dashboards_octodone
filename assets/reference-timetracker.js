<script>
(() => {
'use strict';
/* ---------- API ----------
   Os dados vêm ao vivo da API GraphQL do Octodone pelo gateway dos embedded tools:
   aberta pelo menu do Octodone, a página recebe o cookie __Host-octo-embed da sessão de
   quem está logado e o gateway atende /__octodone/* com as permissões dessa pessoa. */
const API_URL = '/__octodone/graphql', SESSION_URL = '/__octodone/session';
const BRIDGE_HEADERS = { 'X-Octodone-Embed': '1' };
let COMPANY_ID = 1; // substituído pelo company_id da sessão
const PER_PAGE = 5000, PAGE_POOL = 3, USER_BATCH = 250, DEL_BATCH = 130;
const NO_AREA = 'Sem área';
const NO_CAREER = 'Sem carreira';

/* ---------- data model ----------
   Mesmas regras da query SQL do Looker:
   - work_date = date_trunc('day', start_date), em UTC
   - apóstrofos removidos de fullname, career_name, area_name e deliverable_name
   - hours_worked_num = SUM(duration) / 3600 (horas decimais)
   - deliverable_name = job_number || ' - ' || nome (fica vazio quando o deliverable não tem job)
   - pessoas removidas (u.deleted_at) e sessões deletadas (tws.deleted_at) ficam de fora */
const noQuote = s => (s || '').replace(/'/g, '');
const USERS = new Map(); // id -> pessoa, ou null quando a API não devolve (sem permissão)
const DELS = new Map();  // id -> deliverable_name
const RAWS = new Map();  // id da sessão -> [id, userId, deliverableId, epochSec, duration]
let S = [];
const delLabel = k => DELS.get(k) || (k ? '(sem job) Deliverable #' + k : 'Sem deliverable');
const dayKeyOf = ts => new Date(ts * 1000).toISOString().slice(0, 10);
const dayAdd = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MIN_DAY = '2025-01-01';
let MAX_DAY = new Date().toISOString().slice(0, 10);

class ApiError extends Error {}
async function call(url, init) {
  let r;
  try { r = await fetch(url, { credentials: 'same-origin', ...init, headers: { ...BRIDGE_HEADERS, ...(init && init.headers) } }); }
  catch (e) { throw new ApiError('Sem conexão com a API do Octodone.'); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    const why = j && j.detail ? ' (' + j.detail + ')' : '';
    if (r.status === 401 || r.status === 403) throw new ApiError('A sessão do Octodone expirou ou não tem acesso' + why + '. Reabra esta ferramenta pelo menu do Octodone.');
    throw new ApiError('A API do Octodone respondeu com erro ' + r.status + why + '.');
  }
  return j;
}
async function gql(query) {
  const j = await call(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!j || (j.errors && j.errors.length)) throw new ApiError('Erro na consulta à API do Octodone' + (j && j.errors ? ': ' + j.errors.map(e => e.message).join('; ') : '.'));
  return j.data;
}
let sessionReady = null;
const session = () => sessionReady || (sessionReady = call(SESSION_URL).then(s => { if (s && s.company_id) COMPANY_ID = s.company_id; return s; }).catch(e => { sessionReady = null; throw e; }));
async function pool(items, n, fn) { const q = items.slice(); await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); })); }
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

// Sessões do período, com um dia de folga em cada ponta para não depender do fuso que a API usa no filtro.
async function fetchSessions(from, to, progress) {
  const a = dayAdd(from, -1), b = dayAdd(to, 1);
  const q = page => `query { TaskWorkSession { all(perPage: ${PER_PAGE}, page: ${page}, startDate: "${a}T00:00:00", endDate: "${b}T23:59:59") { totalCount items { id userId deliverableId startDate duration deletedAt } } } }`;
  const add = items => { for (const it of items) { if (it.deletedAt) { RAWS.delete(it.id); continue; } RAWS.set(it.id, [it.id, it.userId, it.deliverableId || 0, Math.floor(Date.parse(it.startDate.replace(/\.\d+/, '')) / 1000), it.duration || 0]); } };
  const first = (await gql(q(1))).TaskWorkSession.all;
  const pages = Math.max(1, Math.ceil(first.totalCount / PER_PAGE));
  let done = 1; add(first.items); progress(done, pages);
  await pool(Array.from({ length: pages - 1 }, (_, i) => i + 2), PAGE_POOL, async p => { add((await gql(q(p))).TaskWorkSession.all.items); progress(++done, pages); });
}
// Pessoas e deliverables que ainda não conhecemos.
async function fetchMeta() {
  const uids = [...new Set([...RAWS.values()].map(r => r[1]))].filter(id => !USERS.has(id));
  await pool(chunks(uids, USER_BATCH), 2, async ids => {
    const d = await gql(`query { User { all(companyId: ${COMPANY_ID}, perPage: ${USER_BATCH}, includeArchived: true, includeEmptyUsers: true, userIds: [${ids}]) { items { id fullname username email deletedAt userRank(companyId: ${COMPANY_ID}) { career { name area { name } } } } } } }`);
    for (const u of d.User.all.items) {
      const c = u.userRank && u.userRank.career;
      USERS.set(u.id, { id: u.id, name: noQuote(u.fullname) || u.username || ('#' + u.id), username: u.username || '', email: u.email || '', area: c && c.area && c.area.name ? noQuote(c.area.name) : NO_AREA, career: c && c.name ? noQuote(c.name) : NO_CAREER, removed: !!u.deletedAt });
    }
    ids.forEach(id => { if (!USERS.has(id)) USERS.set(id, null); });
  });
  const dids = [...new Set([...RAWS.values()].map(r => r[2]))].filter(id => id && !DELS.has(id));
  await pool(chunks(dids, DEL_BATCH), 2, async ids => {
    const d = await gql(`query { Deliverable { all(companyId: ${COMPANY_ID}, perPage: ${DEL_BATCH}, deliverableIds: [${ids}]) { items { id name jobQuote { job { jobNumber } } } } } }`);
    for (const x of d.Deliverable.all.items) { const jn = x.jobQuote && x.jobQuote.job ? x.jobQuote.job.jobNumber : null; DELS.set(x.id, jn != null ? jn + ' - ' + noQuote(x.name) : ''); }
  });
}
function rebuild() {
  const out = [];
  for (const r of RAWS.values()) {
    const u = USERS.get(r[1]);
    if (!u || u.removed) continue;
    out.push({ id: r[0], u: r[1], user: u, d: r[2], dname: DELS.get(r[2]) ?? '', ts: r[3], dur: r[4], del: false, day: dayKeyOf(r[3]) });
  }
  S = out;
}

/* ---------- carregamento sob demanda ----------
   Só busca os dias que ainda não foram carregados; períodos maiores vão sendo somados. */
let loadedFrom = null, loadedTo = null, loadedAt = null, chain = Promise.resolve();
const loadbar = document.getElementById('loadbar'), loadmsg = document.getElementById('loadmsg'), page = document.querySelector('.page');
function busy(on, text, frac) {
  loadbar.classList.toggle('on', on); page.classList.toggle('busy', on);
  loadbar.firstElementChild.style.width = on ? Math.round((frac || 0.05) * 100) + '%' : '0';
  loadmsg.classList.toggle('on', on); loadmsg.classList.remove('err');
  if (on) loadmsg.querySelector('.tx').textContent = text;
  const rb = document.getElementById('reload'); rb.disabled = on; rb.classList.toggle('spin', on);
}
function fail(err) {
  busy(false); loadmsg.classList.add('on', 'err');
  loadmsg.querySelector('.tx').textContent = err instanceof ApiError ? err.message : 'Não foi possível carregar os dados: ' + err.message;
}
function ensure(from, to) {
  chain = chain.then(async () => {
    const need = [];
    if (loadedFrom === null) need.push([from, to]);
    else { if (from < loadedFrom) need.push([from, dayAdd(loadedFrom, -1)]); if (to > loadedTo) need.push([dayAdd(loadedTo, 1), to]); }
    if (!need.length) return false;
    const label = need.map(([a, b]) => longDate(a) + ' a ' + longDate(b)).join(' e ');
    busy(true, 'Carregando registros de ' + label + '…', 0.05);
    await session();
    for (const [a, b] of need) await fetchSessions(a, b, (d, n) => busy(true, `Carregando registros de ${label}… (${d}/${n})`, 0.05 + 0.8 * d / n));
    busy(true, 'Carregando pessoas e deliverables…', 0.9);
    await fetchMeta();
    loadedFrom = loadedFrom === null || from < loadedFrom ? from : loadedFrom;
    loadedTo = loadedTo === null || to > loadedTo ? to : loadedTo;
    loadedAt = new Date();
    rebuild(); busy(false); return true;
  }).catch(err => { fail(err); return false; });
  return chain;
}

/* ---------- formatters ---------- */
const pad = n => String(n).padStart(2, '0');
const hms = sec => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return pad(h) + ':' + pad(m) + ':' + pad(s); };
const nf = new Intl.NumberFormat('pt-BR');
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hShort = sec => nf1.format(sec / 3600) + ' h';
const hDec = sec => nf2.format(sec / 3600);
const longFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const longCache = new Map();
const longDate = day => { let v = longCache.get(day); if (!v) { v = longFmt.format(new Date(day + 'T00:00:00Z')); longCache.set(day, v); } return v; };
// Feriados nacionais (Lei 662/49, 6.802/80, 14.759/23) + Sexta-feira Santa, calculada pela Páscoa.
const FIXED_HOLIDAYS = { '01-01': 'Confraternização Universal', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
const holidayCache = new Map();
function holidaysOf(y) {
  let h = holidayCache.get(y); if (h) return h;
  h = new Map(Object.entries(FIXED_HOLIDAYS).filter(([md]) => md !== '11-20' || y >= 2024).map(([md, n]) => [y + '-' + md, n]));
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const easter = Date.UTC(y, Math.floor((hh + l - 7 * m + 114) / 31) - 1, (hh + l - 7 * m + 114) % 31 + 1);
  h.set(new Date(easter - 2 * 864e5).toISOString().slice(0, 10), 'Sexta-feira Santa');
  holidayCache.set(y, h); return h;
}
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const wdLabel = day => WEEKDAYS[new Date(day + 'T00:00:00Z').getUTCDay()] + (holidaysOf(+day.slice(0, 4)).has(day) ? ' (feriado)' : '');
// work_date + dia da semana; fim de semana e feriado nacional em vermelho.
const shortDate = day => day.slice(8, 10) + '/' + day.slice(5, 7) + '/' + day.slice(0, 4);
const dayCell = (day, label = longDate(day)) => {
  const wd = new Date(day + 'T00:00:00Z').getUTCDay(), hol = holidaysOf(+day.slice(0, 4)).get(day);
  const off = hol || wd === 0 || wd === 6;
  return `${esc(label)} <span class="wd${off ? ' off' : ''}"${hol ? ` title="Feriado: ${esc(hol)}"` : ''}>${WEEKDAYS[wd]}${hol ? ' · feriado' : ''}</span>`;
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stamp = () => document.querySelectorAll('[data-stamp]').forEach(e => e.textContent = loadedAt ? 'Dados ao vivo do Octodone · atualizados às ' + loadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Carregando dados do Octodone…');
stamp();

/* ---------- dimension definitions ---------- */
const DIMS = {
  del:   { label: 'Deliverable', key: s => s.d, opt: k => ({ label: delLabel(k), sub: k ? 'ID ' + k : '' }) },
  user:  { label: 'Pessoa', key: s => s.u, opt: k => { const u = USERS.get(k); return { label: u ? u.name : '#' + k, sub: u ? u.email : '' }; } },
  email: { label: 'E-mail', key: s => s.user.email, opt: k => ({ label: k || '(sem e-mail)' }) },
  area:  { label: 'Área', key: s => s.user.area, opt: k => ({ label: k }) },
  career: { label: 'Carreira', key: s => s.user.career, opt: k => ({ label: k }) },
};

/* ---------- multiselect ---------- */
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';
let openMs = null;
document.addEventListener('mousedown', e => { if (openMs && !openMs.el.contains(e.target)) openMs.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openMs) openMs.close(); });

class MultiSelect {
  constructor(host, { label, dim, showHours, getHours, onChange }) {
    this.sel = new Set(); this.dim = dim; this.showHours = showHours; this.getHours = getHours; this.onChange = onChange; this.label = label;
    this.el = document.createElement('div'); this.el.className = 'ms';
    this.el.innerHTML = `<span class="f-label">${esc(label)}</span><button type="button" class="ms-btn"><span class="v ph">Todos</span>${CHEV}</button>
      <div class="ms-pop"><div class="ms-search"><input type="search" placeholder="Buscar ${esc(label.toLowerCase())}…"></div>
      <div class="ms-tools"><span class="info"></span><span><button type="button" data-a="all">Selecionar visíveis</button><button type="button" data-a="none">Limpar</button></span></div>
      <div class="ms-list"></div></div>`;
    host.appendChild(this.el);
    this.btn = this.el.querySelector('.ms-btn'); this.pop = this.el.querySelector('.ms-pop');
    this.q = this.el.querySelector('input'); this.list = this.el.querySelector('.ms-list'); this.info = this.el.querySelector('.info');
    this.btn.addEventListener('click', () => this.el.classList.contains('open') ? this.close() : this.open());
    this.q.addEventListener('input', () => this.renderList());
    this.el.querySelector('[data-a=all]').addEventListener('click', () => { this.visible.forEach(o => this.sel.add(o.k)); this.changed(); });
    this.el.querySelector('[data-a=none]').addEventListener('click', () => { this.sel.clear(); this.changed(); });
    this.list.addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
      const k = this.keys[+cb.dataset.i]; cb.checked ? this.sel.add(k) : this.sel.delete(k); this.changed(false);
    });
  }
  open() {
    if (openMs && openMs !== this) openMs.close();
    openMs = this; this.el.classList.add('open');
    const r = this.el.getBoundingClientRect(); this.pop.classList.toggle('right', r.left + 360 > innerWidth);
    this.q.value = ''; this.renderList(); setTimeout(() => this.q.focus(), 0);
  }
  close() { this.el.classList.remove('open'); if (openMs === this) openMs = null; }
  options() {
    const hours = this.getHours(this.dim); // Map key -> seconds (in period)
    const keys = new Set(hours.keys()); this.sel.forEach(k => keys.add(k));
    const out = [];
    keys.forEach(k => { const o = DIMS[this.dim].opt(k); out.push({ k, label: o.label, sub: o.sub || '', sec: hours.get(k) || 0 }); });
    out.sort((a, b) => (this.sel.has(b.k) - this.sel.has(a.k)) || (b.sec - a.sec) || a.label.localeCompare(b.label, 'pt-BR'));
    return out;
  }
  renderList() {
    const q = this.q.value.trim().toLowerCase();
    const all = this.options();
    this.visible = q ? all.filter(o => (o.label + ' ' + o.sub).toLowerCase().includes(q)) : all;
    this.keys = this.visible.map(o => o.k);
    this.info.textContent = this.sel.size ? `${this.sel.size} selecionado(s)` : `${this.visible.length} opção(ões)`;
    if (!this.visible.length) { this.list.innerHTML = '<div class="ms-empty">Nenhum resultado</div>'; return; }
    this.list.innerHTML = this.visible.map((o, i) => `<label class="ms-opt"><input type="checkbox" data-i="${i}" ${this.sel.has(o.k) ? 'checked' : ''}>
      <span class="lb">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${this.showHours ? `<span class="hr" title="${hShort(o.sec)} no período">${hms(o.sec)}</span>` : ''}</label>`).join('');
  }
  updateButton() {
    const v = this.btn.querySelector('.v'); const old = this.btn.querySelector('.cnt'); if (old) old.remove();
    if (!this.sel.size) { v.textContent = 'Todos'; v.classList.add('ph'); return; }
    v.classList.remove('ph');
    const first = DIMS[this.dim].opt([...this.sel][0]).label;
    v.textContent = this.sel.size === 1 ? first : first + ' +' + (this.sel.size - 1);
    const c = document.createElement('span'); c.className = 'cnt'; c.textContent = this.sel.size; v.after(c);
  }
  changed(rerender = true) { this.updateButton(); if (rerender) this.renderList(); else this.info.textContent = this.sel.size ? `${this.sel.size} selecionado(s)` : `${this.visible.length} opção(ões)`; this.onChange(); }
  refresh() { if (this.el.classList.contains('open')) this.renderList(); }
}

/* ---------- table ---------- */
class Table {
  constructor(host, cols, defaultSort) {
    this.cols = cols; this.sort = defaultSort; this.page = 0; this.size = 100; this.rows = [];
    host.innerHTML = `<div class="tbl-wrap"><table><thead><tr></tr></thead><tbody></tbody></table></div>
      <div class="pager"><span class="info"></span><span class="ctl">Linhas <select>${[50, 100, 250, 500].map(n => `<option ${n === 100 ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button type="button" data-p="-1">‹ Anterior</button><span class="pg"></span><button type="button" data-p="1">Próxima ›</button></span></div>`;
    this.wrap = host.querySelector('.tbl-wrap'); this.thr = host.querySelector('thead tr'); this.tb = host.querySelector('tbody');
    this.info = host.querySelector('.info'); this.pg = host.querySelector('.pg');
    this.thr.innerHTML = cols.map((c, i) => `<th data-i="${i}" class="${c.num ? 'num' : ''}" title="Ordenar por ${esc(c.label)}">${esc(c.label)}<span class="ar"></span></th>`).join('');
    this.thr.addEventListener('click', e => {
      const th = e.target.closest('th'); if (!th) return; const c = this.cols[+th.dataset.i];
      this.sort = this.sort.key === c.key ? { key: c.key, dir: -this.sort.dir } : { key: c.key, dir: c.num ? -1 : 1 };
      this.apply(); this.page = 0; this.draw();
    });
    host.querySelector('select').addEventListener('change', e => { this.size = +e.target.value; this.page = 0; this.draw(); });
    host.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { this.page += +b.dataset.p; this.draw(); this.wrap.scrollTop = 0; }));
  }
  setRows(rows) { this.rows = rows; this.apply(); this.page = 0; this.draw(); }
  apply() {
    const c = this.cols.find(c => c.key === this.sort.key); const k = c.sortKey || c.key; const d = this.sort.dir;
    const coll = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    this.rows.sort((a, b) => { const x = a[k], y = b[k]; return d * (typeof x === 'number' && typeof y === 'number' ? x - y : coll.compare(String(x), String(y))); });
  }
  draw() {
    this.thr.querySelectorAll('th').forEach((th, i) => th.querySelector('.ar').textContent = this.cols[i].key === this.sort.key ? (this.sort.dir > 0 ? '▲' : '▼') : '');
    const n = this.rows.length, pages = Math.max(1, Math.ceil(n / this.size)); this.page = Math.min(Math.max(0, this.page), pages - 1);
    const a = this.page * this.size, b = Math.min(n, a + this.size);
    this.tb.innerHTML = n ? this.rows.slice(a, b).map(r => '<tr>' + this.cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.muted ? 'muted' : ''}">${c.html ? c.html(r) : esc(c.fmt ? c.fmt(r[c.key], r) : r[c.key])}</td>`).join('') + '</tr>').join('')
      : `<tr><td colspan="${this.cols.length}"><div class="empty">Nenhum registro para os filtros selecionados.</div></td></tr>`;
    this.info.textContent = n ? `Mostrando ${nf.format(a + 1)}–${nf.format(b)} de ${nf.format(n)} linhas` : '0 linhas';
    this.pg.textContent = `${this.page + 1} / ${pages}`;
    const [prev, next] = this.wrap.parentElement.querySelectorAll('[data-p]'); prev.disabled = this.page === 0; next.disabled = this.page >= pages - 1;
  }
}

/* ---------- charts setup ---------- */
Chart.defaults.color = '#9C9CA3';
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.font.size = 12;
Chart.defaults.borderColor = '#47474B';
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'].map(css);
const PRIMARY = css('--primary'), CARD = css('--card');
const tooltipBase = { backgroundColor: '#242425', borderColor: '#4A4A4E', borderWidth: 1, titleColor: '#F2F2F3', bodyColor: '#C9C9CE', padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4 };
const truncate = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

/* ---------- view factory ---------- */
const VIEWS = {};
function makeView(id, cfg) {
  const root = document.getElementById('view-' + id);
  const v = { id, root, cfg, from: cfg.defaultFrom, to: MAX_DAY, ms: {}, cache: null };
  const fhost = root.querySelector('[data-filters]');
  // period
  const pd = document.createElement('div'); pd.className = 'f-period';
  pd.innerHTML = `<span class="f-label">Período</span><div class="period"><input type="date" class="date" data-f min="${MIN_DAY}" max="${MAX_DAY}" value="${v.from}" aria-label="Data início"><span>até</span><input type="date" class="date" data-t min="${MIN_DAY}" max="${MAX_DAY}" value="${v.to}" aria-label="Data fim"></div>`;
  const [fi, ti] = pd.querySelectorAll('input');
  const onDate = () => { let f = fi.value || MIN_DAY, t = ti.value || MAX_DAY; if (f > t) [f, t] = [t, f]; v.from = f; v.to = t; v.cache = null; Object.values(v.ms).forEach(m => m.refresh()); update(v); ensure(f, t).then(changed => changed && refreshAll()); };
  fi.addEventListener('change', onDate); ti.addEventListener('change', onDate);
  // dimension filters
  const hoursFor = dim => {
    if (!v.cache) v.cache = {};
    if (!v.cache[dim]) { const m = new Map(), key = DIMS[dim].key; for (const s of S) if (s.day >= v.from && s.day <= v.to) { const k = key(s); m.set(k, (m.get(k) || 0) + s.dur); } v.cache[dim] = m; }
    return v.cache[dim];
  };
  cfg.filters.forEach(f => { v.ms[f.dim] = new MultiSelect(fhost, { label: f.label, dim: f.dim, showHours: f.hours, getHours: hoursFor, onChange: () => update(v) }); });
  if (cfg.periodAt != null) fhost.insertBefore(pd, fhost.children[cfg.periodAt] || null); else fhost.appendChild(pd);
  v.filtered = () => {
    const act = Object.entries(v.ms).filter(([, m]) => m.sel.size).map(([d, m]) => [DIMS[d].key, m.sel]);
    return S.filter(s => s.day >= v.from && s.day <= v.to && act.every(([key, set]) => set.has(key(s))));
  };
  v.kpi = root.querySelector('[data-kpi]');
  cfg.init && cfg.init(v);
  VIEWS[id] = v;
  return v;
}

function renderKpi(v, rows) {
  const tot = rows.reduce((a, s) => a + s.dur, 0);
  const people = new Set(rows.map(s => s.u)).size, days = new Set(rows.map(s => s.day)).size, dels = new Set(rows.map(s => s.d)).size;
  v.kpi.innerHTML = `<div><div class="lbl">Horas totais</div><div class="val">${hDec(tot)} h</div></div>
    <div class="meta"><span><b>${hms(tot)}</b> (HH:MM:SS)</span><span><b>${nf.format(rows.length)}</b> registros</span><span><b>${nf.format(people)}</b> pessoas</span><span><b>${nf.format(dels)}</b> deliverables</span><span><b>${nf.format(days)}</b> dias</span></div>`;
  return tot;
}

function update(v) {
  if (!v.root.classList.contains('active')) { v.dirty = true; return; } // charts need a visible box
  v.dirty = false; const rows = v.filtered(); renderKpi(v, rows); v.cfg.render(v, rows);
}
// Depois de cada carga: limpa os caches de todas as abas e redesenha a que está aberta.
function refreshAll() {
  stamp();
  Object.values(VIEWS).forEach(v => { v.cache = null; Object.values(v.ms).forEach(m => m.refresh()); update(v); });
}

const monthStart = MAX_DAY.slice(0, 8) + '01';

/* ---------- 1. Horas totais ---------- */
const COLS_TOT = [
  { key: 'name', label: 'Nome', html: r => esc(r.name) + (r.username ? `<span class="uname">${esc(r.username)}</span>` : '') },
  { key: 'email', label: 'Email', muted: true },
  { key: 'dateLabel', label: 'work_date', sortKey: 'day', html: r => dayCell(r.day) },
  { key: 'sec', label: 'hours_worked', num: true, fmt: hms },
];
const COLS_TOT_DEL = [
  { key: 'did', label: 'Deliverable ID', num: true },
  { key: 'dname', label: 'Deliverable Name' },
  { key: 'people', label: 'Pessoas', num: true },
  { key: 'sec', label: 'hours_worked', num: true, fmt: hms },
];
// deliverables das horas filtradas
function delRows(rows) {
  const dm = new Map();
  for (const s of rows) { let r = dm.get(s.d); if (!r) { r = { did: s.d, dname: s.dname, users: new Set(), sec: 0 }; dm.set(s.d, r); } r.users.add(s.u); r.sec += s.dur; }
  return [...dm.values()].map(r => ({ did: r.did, dname: r.dname, people: r.users.size, sec: r.sec }));
}
const vTot = makeView('tot', {
  defaultFrom: monthStart,
  filters: [{ dim: 'user', label: 'Pessoa (fullname)', hours: true }, { dim: 'email', label: 'E-mail', hours: true }, { dim: 'area', label: 'Área (area_name)', hours: true }, { dim: 'career', label: 'Carreira (career_name)', hours: true }],
  init(v) {
    v.table = new Table(v.root.querySelector('[data-table]'), COLS_TOT, { key: 'dateLabel', dir: -1 });
    v.delTable = new Table(v.root.querySelector('[data-deltable]'), COLS_TOT_DEL, { key: 'sec', dir: -1 });
    v.bar = new Chart(v.root.querySelector('[data-bar]'), { type: 'bar', data: { labels: [], datasets: [{ data: [], backgroundColor: PRIMARY, borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start', barPercentage: .78, categoryPercentage: .9 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        scales: { x: { position: 'top', grid: { color: '#424246' }, ticks: { callback: x => nf.format(x) + ' h' }, title: { display: true, text: 'Horas' } }, y: { grid: { display: false }, ticks: { color: '#C9C9CE', autoSkip: false, callback(i) { return truncate(this.getLabelForValue(i), 34); } } } },
        plugins: { legend: { display: false }, tooltip: { ...tooltipBase, displayColors: false, callbacks: { title: it => v.barData[it[0].dataIndex].name, label: it => { const p = v.barData[it.dataIndex]; return [p.email, p.career, 'Horas: ' + hDec(p.sec) + ' h (' + hms(p.sec) + ')']; } } } } } });
  },
  render(v, rows) {
    // table: per user + day
    const m = new Map();
    for (const s of rows) { const k = s.u + '|' + s.day; let r = m.get(k); if (!r) { r = { name: s.user.name, username: s.user.username, email: s.user.email, career: s.user.career, day: s.day, dateLabel: longDate(s.day), sec: 0 }; m.set(k, r); } r.sec += s.dur; }
    v.rows = [...m.values()]; v.table.setRows(v.rows);
    v.root.querySelector('[data-count]').textContent = nf.format(v.rows.length) + ' linhas';
    v.dels = delRows(rows); v.delTable.setRows(v.dels);
    v.root.querySelector('[data-delcount]').textContent = nf.format(v.dels.length) + ' deliverables';
    // per person
    const pp = new Map(); for (const s of rows) { let r = pp.get(s.u); if (!r) { r = { name: s.user.name, email: s.user.email, career: s.user.career, sec: 0 }; pp.set(s.u, r); } r.sec += s.dur; }
    const people = [...pp.values()].sort((a, b) => b.sec - a.sec); v.people = people;
    // bar
    v.barData = people;
    const box = v.root.querySelector('[data-barbox]'); box.style.height = Math.max(160, people.length * 24 + 60) + 'px';
    v.bar.data.labels = people.map(p => p.name); v.bar.data.datasets[0].data = people.map(p => +(p.sec / 3600).toFixed(2)); v.bar.resize(); v.bar.update();
    v.root.querySelector('[data-barsub]').textContent = nf.format(people.length) + ' pessoas';
  },
  exportData(v) {
    return [
      { name: 'Horas totais', cols: ['Nome', 'Username', 'Email', 'work_date', 'Dia da semana', 'hours_worked'], rows: v.table.rows.map(r => [r.name, r.username, r.email, r.day, wdLabel(r.day), hms(r.sec)]) },
      { name: 'Deliverables', cols: ['Deliverable ID', 'Deliverable Name', 'Pessoas', 'hours_worked'], rows: v.delTable.rows.map(r => [r.did, r.dname, r.people, hms(r.sec)]) },
      { name: 'Por pessoa', cols: ['Nome', 'Email', 'Carreira', 'hours_worked'], rows: v.people.map(p => [p.name, p.email, p.career, hms(p.sec)]) },
    ];
  },
});

/* ---------- 2. Horas por Projeto ---------- */
const PROJ_FILTERS = [{ dim: 'del', label: 'Deliverable (deliverable_name)', hours: true }, { dim: 'user', label: 'Pessoa (fullname)' }, { dim: 'email', label: 'E-mail' }, { dim: 'area', label: 'Área (area_name)' }, { dim: 'career', label: 'Carreira (career_name)' }];
const COLS_PROJ = [
  { key: 'name', label: 'Nome completo' },
  { key: 'username', label: 'Username', muted: true },
  { key: 'email', label: 'Email', muted: true },
  { key: 'dateLabel', label: 'Start_text', sortKey: 'day', html: r => dayCell(r.day) },
  { key: 'sec', label: 'hours_worked', num: true, fmt: hms },
  { key: 'did', label: 'Deliverable ID', num: true },
  { key: 'dname', label: 'Deliverable Name' },
];
makeView('proj', {
  defaultFrom: monthStart, filters: PROJ_FILTERS,
  init(v) {
    v.table = new Table(v.root.querySelector('[data-table]'), COLS_PROJ, { key: 'dateLabel', dir: -1 });
    v.delTable = new Table(v.root.querySelector('[data-deltable]'), COLS_TOT_DEL, { key: 'sec', dir: -1 });
  },
  render(v, rows) {
    v.delTable.setRows(delRows(rows));
    v.root.querySelector('[data-delcount]').textContent = nf.format(v.delTable.rows.length) + ' deliverables';
    const m = new Map();
    for (const s of rows) { const k = s.u + '|' + s.day + '|' + s.d; let r = m.get(k); if (!r) { r = { name: s.user.name, username: s.user.username, email: s.user.email, career: s.user.career, day: s.day, dateLabel: longDate(s.day), sec: 0, did: s.d, dname: s.dname }; m.set(k, r); } r.sec += s.dur; }
    v.table.setRows([...m.values()]);
    v.root.querySelector('[data-count]').textContent = nf.format(m.size) + ' linhas';
  },
  exportData(v) {
    return [
      { name: 'Horas por Projeto', cols: ['Nome completo', 'Username', 'Email', 'Start_text', 'Dia da semana', 'hours_worked', 'Deliverable ID', 'Deliverable Name'], rows: v.table.rows.map(r => [r.name, r.username, r.email, r.day, wdLabel(r.day), hms(r.sec), r.did, r.dname]) },
      { name: 'Deliverables', cols: ['Deliverable ID', 'Deliverable Name', 'Pessoas', 'hours_worked'], rows: v.delTable.rows.map(r => [r.did, r.dname, r.people, hms(r.sec)]) },
    ];
  },
});

/* ---------- 3. Horas por projeto detalhado ---------- */
const COLS_DET = [
  { key: 'name', label: 'Nome completo', html: r => esc(r.name) + (r.username ? `<span class="uname">${esc(r.username)}</span>` : '') },
  { key: 'email', label: 'Email', muted: true },
  { key: 'dateLabel', label: 'Start_text', sortKey: 'day', html: r => dayCell(r.day, shortDate(r.day)) },
  { key: 'dur', label: 'hours_worked', num: true, fmt: hms },
  { key: 'did', label: 'deliverable_id', num: true },
  { key: 'dname', label: 'Deliverable Name' },
];
makeView('det', {
  defaultFrom: monthStart, filters: PROJ_FILTERS,
  init(v) { v.table = new Table(v.root.querySelector('[data-table]'), COLS_DET, { key: 'name', dir: 1 }); },
  render(v, rows) {
    v.table.setRows(rows.map(s => ({ id: s.id, name: s.user.name, username: s.user.username, email: s.user.email, day: s.day, dateLabel: longDate(s.day), dur: s.dur, did: s.d, dname: s.dname })));
    v.root.querySelector('[data-count]').textContent = nf.format(rows.length) + ' registros';
  },
  exportData(v) { return [{ name: 'Detalhado', cols: ['Nome completo', 'Username', 'Email', 'Start_text', 'hours_worked', 'deliverable_id', 'Deliverable Name', 'ID do registro'], rows: v.table.rows.map(r => [r.name, r.username, r.email, r.day, hms(r.dur), r.did, r.dname, r.id]) }]; },
});

/* ---------- 4. Gráfico de horas por time/projeto ---------- */
function comboChart(canvas) {
  return new Chart(canvas, {
    data: { labels: [], datasets: [
      { type: 'bar', label: 'Total de registros', data: [], xAxisID: 'xr', backgroundColor: PRIMARY, borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: 'start', barPercentage: .72, categoryPercentage: .9, order: 2 },
      { type: 'line', label: 'Total de horas', data: [], xAxisID: 'xh', borderColor: SERIES[1], backgroundColor: SERIES[1], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: SERIES[1], pointBorderColor: CARD, pointBorderWidth: 2, order: 1 },
    ] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', axis: 'y', intersect: false },
      scales: {
        xr: { position: 'bottom', beginAtZero: true, grid: { color: '#424246' }, title: { display: true, text: 'Total de registros' }, ticks: { callback: x => nf.format(x) } },
        xh: { position: 'top', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Total de horas', color: SERIES[1] }, ticks: { color: SERIES[1], callback: x => nf.format(x) + ' h' } },
        y: { grid: { display: false }, ticks: { color: '#C9C9CE', autoSkip: false, callback(i) { return truncate(this.getLabelForValue(i), 40); } } },
      },
      plugins: { legend: { display: false }, tooltip: { ...tooltipBase, callbacks: { label: it => it.dataset.xAxisID === 'xh' ? ' Total de horas: ' + hms(it.raw * 3600) + ' (' + nf2.format(it.raw) + ' h)' : ' Total de registros: ' + nf.format(it.raw) } } } },
  });
}
makeView('chart', {
  defaultFrom: monthStart,
  periodAt: 2,
  filters: [{ dim: 'del', label: 'Deliverable', hours: true }, { dim: 'area', label: 'Área', hours: true }, { dim: 'career', label: 'Carreira', hours: true }, { dim: 'user', label: 'Nome', hours: true }, { dim: 'email', label: 'E-mail', hours: true }],
  init(v) { v.c1 = comboChart(v.root.querySelector('[data-combo1] canvas')); v.c2 = comboChart(v.root.querySelector('[data-combo2] canvas')); },
  render(v, rows) {
    const agg = (keyFn, labelFn) => { const m = new Map(); for (const s of rows) { const k = keyFn(s); let r = m.get(k); if (!r) { r = { label: labelFn(s), n: 0, sec: 0 }; m.set(k, r); } r.n++; r.sec += s.dur; } return [...m.values()].sort((a, b) => b.sec - a.sec); };
    v.byDel = agg(s => s.d, s => delLabel(s.d));
    v.byUser = agg(s => s.u, s => s.user.name);
    const fill = (chart, box, data) => {
      box.style.height = Math.max(180, data.length * 28 + 90) + 'px';
      chart.data.labels = data.map(r => r.label); chart.data.datasets[0].data = data.map(r => r.n); chart.data.datasets[1].data = data.map(r => +(r.sec / 3600).toFixed(2));
      chart.resize(); chart.update();
    };
    fill(v.c1, v.root.querySelector('[data-combo1]'), v.byDel);
    fill(v.c2, v.root.querySelector('[data-combo2]'), v.byUser);
  },
  exportData(v) {
    return [
      { name: 'Por deliverable', cols: ['deliverable_name', 'Total de registros', 'Total de horas (HH:MM:SS)', 'Total de horas (decimal)'], rows: v.byDel.map(r => [r.label, r.n, hms(r.sec), +(r.sec / 3600).toFixed(4)]) },
      { name: 'Por fullname', cols: ['fullname', 'Total de registros', 'Total de horas (HH:MM:SS)', 'Total de horas (decimal)'], rows: v.byUser.map(r => [r.label, r.n, hms(r.sec), +(r.sec / 3600).toFixed(4)]) },
    ];
  },
});

/* ---------- tabs ---------- */
let current = 'tot';
function show(id) {
  current = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  Object.values(VIEWS).forEach(v => v.root.classList.toggle('active', v.id === id));
  const v = VIEWS[id]; if (v.dirty !== false) update(v);
  try { localStorage.setItem('tt-tab', id); } catch (e) {}
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
let saved = null; try { saved = localStorage.getItem('tt-tab'); } catch (e) {}
show(VIEWS[saved] ? saved : 'tot');
ensure(monthStart, MAX_DAY).then(changed => changed && refreshAll());
document.getElementById('reload').addEventListener('click', () => {
  const from = loadedFrom || monthStart;
  MAX_DAY = new Date().toISOString().slice(0, 10);
  chain = chain.then(() => { RAWS.clear(); USERS.clear(); DELS.clear(); loadedFrom = loadedTo = null; });
  ensure(from, MAX_DAY).then(changed => changed && refreshAll());
});

/* ---------- export ---------- */
const toast = msg => { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => t.style.display = 'none', 2600); };
const fileBase = () => { const v = VIEWS[current]; const name = document.querySelector(`.tab[data-view="${current}"]`).textContent; return ('TimeTracker - ' + name + ' - ' + v.from + ' a ' + v.to).replace(/[\\/:*?"<>|]/g, '-'); };
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
document.getElementById('exp-csv').addEventListener('click', () => {
  const sheets = VIEWS[current].cfg.exportData(VIEWS[current]);
  const cell = x => { if (x === null || x === undefined) return ''; if (typeof x === 'number') return String(x).replace('.', ','); const s = String(x); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  let out;
  if (sheets.length === 1) out = [sheets[0].cols, ...sheets[0].rows].map(r => r.map(cell).join(';')).join('\r\n');
  else out = sheets.map(sh => [[sh.name], sh.cols, ...sh.rows].map(r => r.map(cell).join(';')).join('\r\n')).join('\r\n\r\n');
  download(new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' }), fileBase() + '.csv');
  toast('CSV exportado');
});
document.getElementById('exp-xlsx').addEventListener('click', () => {
  if (!window.XLSX) { toast('Biblioteca de planilha indisponível (sem internet?) — use o CSV'); return; }
  const sheets = VIEWS[current].cfg.exportData(VIEWS[current]);
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet([sh.cols, ...sh.rows]);
    ws['!cols'] = sh.cols.map((c, i) => ({ wch: Math.min(60, Math.max(c.length, ...sh.rows.slice(0, 300).map(r => String(r[i] ?? '').length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  });
  XLSX.writeFile(wb, fileBase() + '.xlsx');
  toast('Planilha exportada');
});
})();
</script>
