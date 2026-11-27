// Interface ÉlectroLab : plan de travail, câblage tactile/souris, palette, inspecteur, bibliothèque.
import { DEFS, CATEGORIES, makeComp, esc } from './components.js';
import { Engine } from './engine.js';
import { SCHEMAS, CATS } from './library.js';
import { runCheck } from './checker.js';

const WCOL = { marron: '#8b4a1c', bleu: '#1f6fd1', vj: '#2e9e3a', noir: '#161616', rouge: '#d42a2a', gris: '#8a8f98', orange: '#f07c1a', violet: '#8a3ec9', blanc: '#f2f2f2' };
const WNAME = { auto: 'Automatique (selon la borne)', marron: 'Marron – phase', noir: 'Noir – phase / navette', gris: 'Gris – phase', bleu: 'Bleu – neutre', vj: 'Vert/jaune – terre', rouge: 'Rouge – commande', orange: 'Orange – retour lampe', violet: 'Violet', blanc: 'Blanc' };
const STORE = 'electrolab:v1';

const $ = (s) => document.querySelector(s);
const svg = $('#svg'), vp = $('#vp'), Lc = $('#lcomps'), Lw = $('#lwires'), Lt = $('#lterms'), Lo = $('#lover');
const NS = 'http://www.w3.org/2000/svg';
const mobile = () => matchMedia('(max-width: 860px)').matches;

let circuit = { components: [], wires: [] };
let eng = new Engine(circuit);
let view = { x: 40, y: 20, k: 1 };
let tool = 'wire', color = 'auto';
let sel = null, pending = null, probes = [null, null];
let schema = null, mode = null, lastCheck = null;
let undoStack = [];
let lastEv = 0;
let G = null;
const ptrs = new Map();

// ------------------------------------------------------------ utilitaires
const compById = (id) => circuit.components.find((c) => c.id === id);
function tpos(key) {
  const i = key.indexOf(':');
  const c = compById(key.slice(0, i));
  if (!c) return null;
  const t = DEFS[c.type].tmap[key.slice(i + 1)];
  if (!t) return null;
  return { x: c.x + t.x, y: c.y + t.y, dir: t.dir, kind: t.kind, c, t };
}
const termName = (key) => { const p = tpos(key); return p ? `${p.c.label}:${p.t.label || p.t.id}` : key; };
const strip = (k, v) => (k.startsWith('_') ? undefined : v);
const snapshot = () => JSON.stringify({ components: circuit.components, wires: circuit.wires }, strip);
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function pushUndo(snap = snapshot()) { undoStack.push(snap); if (undoStack.length > 60) undoStack.shift(); }
function undo() {
  const s = undoStack.pop();
  if (!s) return toast('Rien à annuler.');
  const o = JSON.parse(s);
  circuit.components = o.components; circuit.wires = o.wires;
  sel = null; pending = null;
  changed();
}
function changed() { eng.settle(); render(); renderInspector(); save(); }

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ circuit: JSON.parse(snapshot()), schema: schema && schema.id, mode, view })); } catch (e) { /* stockage indisponible */ }
}
function restore() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!o || !o.circuit) return false;
    circuit.components = o.circuit.components.filter((c) => DEFS[c.type]);
    circuit.wires = o.circuit.wires;
    schema = SCHEMAS.find((s) => s.id === o.schema) || null;
    mode = schema ? o.mode : null;
    if (o.view) view = o.view;
    return true;
  } catch (e) { return false; }
}

// ------------------------------------------------------------ vue
function applyView() { vp.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); }
function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k }; }
function zoomAt(cx, cy, f) {
  const r = svg.getBoundingClientRect();
  const k = Math.min(3, Math.max(0.25, view.k * f));
  const wx = (cx - r.left - view.x) / view.k, wy = (cy - r.top - view.y) / view.k;
  view.k = k; view.x = cx - r.left - wx * k; view.y = cy - r.top - wy * k;
  applyView();
}
function fit() {
  const cs = circuit.components;
  const r = svg.getBoundingClientRect();
  if (!cs.length) { view = { x: 40, y: 20, k: 1 }; applyView(); return; }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of cs) { const d = DEFS[c.type]; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + d.w); y1 = Math.max(y1, c.y + d.h); }
  const pad = 50;
    y1 += 60; // les fils pendent sous les composants
  const k = Math.min(1.3, Math.max(0.25, Math.min(r.width / (x1 - x0 + pad * 2), (r.height - (mobile() ? 70 : 0)) / (y1 - y0 + pad * 2))));
  view.k = k;
  view.x = (r.width - (x1 - x0) * k) / 2 - x0 * k;
  view.y = (r.height - (mobile() ? 70 : 0) - (y1 - y0) * k) / 2 - y0 * k;
  applyView();
}

// ------------------------------------------------------------ rendu
const cache = new Map();
let wiresHtml = '', overHtml = '';
const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function wpath(p1, p2) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const s = Math.min(110, 22 + dist * 0.3), sag = Math.min(60, dist * 0.12);
  const a = DV[p1.dir] || DV.down, b = DV[p2.dir] || DV.down;
  return `M${p1.x} ${p1.y} C${p1.x + a[0] * s} ${p1.y + a[1] * s + sag} ${p2.x + b[0] * s} ${p2.y + b[1] * s + sag} ${p2.x} ${p2.y}`;
}
function termLabel(t, d) {
  if (!t.label) return '';
  let x = t.x, y = t.y, a = 'middle';
  if (t.inside) y += 21;
  else if (t.y <= 0) y += 19;
  else if (t.y >= d.h) y -= 11;
  else if (t.x <= 0) { x += 13; y += 4; a = 'start'; } else { x -= 13; y += 4; a = 'end'; }
  return `<text class="tl" x="${x}" y="${y}" text-anchor="${a}">${esc(t.label)}</text>`;
}
function renderComps() {
  const seen = new Set();
  const wired = new Set();
  for (const w of circuit.wires) { wired.add(w.a); wired.add(w.b); }
  for (const c of circuit.components) {
    seen.add(c.id);
    let e = cache.get(c.id);
    if (!e) {
      e = { g: document.createElementNS(NS, 'g'), gt: document.createElementNS(NS, 'g'), html: '', th: '', tr: '' };
      e.g.dataset.c = c.id;
      e.g.setAttribute('role', 'group');
      cache.set(c.id, e); Lc.append(e.g); Lt.append(e.gt);
    }
    const d = DEFS[c.type];
    let html = d.draw(c, d);
    if (c._noEarth) html += `<g><title>Masse non reliée à la terre (PE)</title><circle class="noearthb" cx="${d.w - 2}" cy="-2" r="10"/><text class="noearth" x="${d.w - 2}" y="2" text-anchor="middle">PE!</text></g>`;
    const aria = `${c.label} – ${d.name}`;
    if (e.g.getAttribute('aria-label') !== aria) e.g.setAttribute('aria-label', aria);
    if (html !== e.html) { e.g.innerHTML = html; e.html = html; }
    const cls = 'comp' + (sel && sel.kind === 'comp' && sel.id === c.id ? ' sel' : '');
    if (e.g.getAttribute('class') !== cls) e.g.setAttribute('class', cls);
    const tr = `translate(${c.x},${c.y})`;
    if (e.tr !== tr) { e.g.setAttribute('transform', tr); e.gt.setAttribute('transform', tr); e.tr = tr; }
    let th = '';
    for (const t of d.terminals) {
      const k = c.id + ':' + t.id;
      const tc = 'term' + (t.kind ? ' k-' + t.kind : '') + (wired.has(k) ? ' wired' : '') + (pending === k ? ' pending' : '');
      th += `<g class="${tc}" data-t="${k}" role="button" aria-label="Borne ${esc(t.label || t.id)} de ${esc(c.label)}" transform="translate(${t.x},${t.y})"><circle class="thit" r="14"/>${t.kind ? '<circle class="ring" r="9.5"/>' : ''}<circle class="screw" r="6.5"/><line class="slotl" x1="-3.5" y1="-3.5" x2="3.5" y2="3.5"/></g>` + termLabel(t, d);
    }
    if (th !== e.th) { e.gt.innerHTML = th; e.th = th; }
  }
  for (const [id, e] of cache) if (!seen.has(id)) { e.g.remove(); e.gt.remove(); cache.delete(id); }
}
function renderWires() {
  let h = '';
  const res = eng.res;
  for (const w of circuit.wires) {
    const p1 = tpos(w.a), p2 = tpos(w.b);
    if (!p1 || !p2) continue;
    const d = wpath(p1, p2);
    const live = res && Math.hypot(...res.v(w.a)) > 10;
    const s = sel && sel.kind === 'wire' && sel.id === w.id;
    h += `<g class="${s ? 'wsel' : ''}" data-w="${w.id}"><path class="wire-h" d="${d}"/><path class="wire" d="${d}" stroke="${WCOL[w.color] || '#888'}"/>` +
      (w.color === 'vj' ? `<path class="wire-vj" d="${d}"/>` : '') + (live ? `<path class="wire-live" d="${d}"/>` : '') + `<path class="wire-hit" d="${d}"/></g>`;
  }
  if (h !== wiresHtml) { Lw.innerHTML = h; wiresHtml = h; }
}
let temp = null;
function renderOver() {
  let h = '';
  if (temp) h += `<path class="tmp" d="${temp}"/>`;
  probes.forEach((k, i) => {
    const p = k && tpos(k);
    if (p) h += `<circle class="probe" cx="${p.x}" cy="${p.y}" r="11" fill="${i ? '#111' : '#e11d48'}" opacity=".85"/><text x="${p.x}" y="${p.y - 15}" text-anchor="middle" style="font:800 11px system-ui;fill:${i ? '#e5e7eb' : '#fda4af'}">${i ? 'COM' : 'V'}</text>`;
  });
  if (h !== overHtml) { Lo.innerHTML = h; overHtml = h; }
}
function render() { renderComps(); renderWires(); renderOver(); updateMeter(); updateSelbar(); }

// ------------------------------------------------------------ messages
function toast(text, level = 'info', ms = 4500) {
  const box = $('#toasts');
  const d = document.createElement('div');
  d.className = 'toast ' + level; d.textContent = text;
  box.append(d);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => d.remove(), ms);
}
function logLine(text, level) {
  const d = document.createElement('div');
  d.className = level;
  d.innerHTML = `<span class="t">${new Date().toLocaleTimeString('fr-FR')}</span>${esc(text)}`;
  $('#log').prepend(d);
  while ($('#log').children.length > 80) $('#log').lastChild.remove();
}
function flushEvents() {
  for (const ev of eng.events) {
    if (ev.id <= lastEv) continue;
    lastEv = ev.id;
    toast(ev.text, ev.level, ev.level === 'danger' ? 7000 : 5000);
    logLine(ev.text, ev.level);
    if (ev.level === 'danger' && navigator.vibrate) try { navigator.vibrate(120); } catch (e) { /* */ }
  }
}
let hintT = 0;
function hint(text) {
  const h = $('#hint');
  if (!text) { h.classList.remove('show'); return; }
  h.textContent = text; h.classList.add('show');
  clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.remove('show'), 3500);
}

// ------------------------------------------------------------ actions circuit
function nextLabel(prefix) {
  let n = 0;
  const re = new RegExp('^' + prefix + '(\\d*)$');
  for (const c of circuit.components) { const m = c.label.match(re); if (m) n = Math.max(n, +(m[1] || 1)); }
  if (prefix === 'ALIM' && n === 0) return 'ALIM';
  return prefix + (n + 1);
}
function addComp(type, x, y) {
  pushUndo();
  const d = DEFS[type];
  const c = makeComp(type, Math.round(x / 10) * 10, Math.round(y / 10) * 10, null, nextLabel(d.prefix));
  circuit.components.push(c);
  sel = { kind: 'comp', id: c.id };
  changed();
  return c;
}
function addAtCenter(type) {
  const r = svg.getBoundingClientRect();
  const d = DEFS[type];
  const w = toWorld(r.left + r.width / 2, r.top + r.height / 2.4);
  let x = w.x - d.w / 2, y = w.y - d.h / 2;
  while (circuit.components.some((c) => Math.abs(c.x - x) < 15 && Math.abs(c.y - y) < 15)) { x += 30; y += 30; }
  addComp(type, x, y);
  hint(`${d.name} ajouté – glissez-le pour le placer`);
}
function autoColor(a, b) {
  if (color !== 'auto') return color;
  const ka = tpos(a).kind, kb = tpos(b).kind;
  if (ka === 'pe' || kb === 'pe') return 'vj';
  if (ka === 'n' || kb === 'n') return 'bleu';
  if (ka === 'l' || kb === 'l') return 'marron';
  return 'noir';
}
function addWire(a, b) {
  if (a === b) return;
  if (circuit.wires.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))) { hint('Ces deux bornes sont déjà reliées.'); return; }
  pushUndo();
  const col = autoColor(a, b);
  circuit.wires.push({ id: uid('w'), a, b, color: col });
  hint(`Fil ${termName(a)} → ${termName(b)}`);
  if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* */ }
  changed();
}
function delSel() {
  if (!sel) return;
  pushUndo();
  if (sel.kind === 'wire') circuit.wires = circuit.wires.filter((w) => w.id !== sel.id);
  else {
    const id = sel.id;
    circuit.components = circuit.components.filter((c) => c.id !== id);
    circuit.wires = circuit.wires.filter((w) => !w.a.startsWith(id + ':') && !w.b.startsWith(id + ':'));
    probes = probes.map((p) => (p && p.startsWith(id + ':') ? null : p));
  }
  sel = null;
  changed();
}
function doAct(c, a, phase) {
  const d = DEFS[c.type];
  if (d.act && d.act(c, a, phase, eng)) { eng.settle(); render(); if (sel && sel.id === c.id) renderInspector(); save(); }
}
function select(s) { sel = s; render(); renderInspector(); }

// ------------------------------------------------------------ multimètre
function setProbe(k) {
  if (!probes[0] || probes[1]) probes = [k, null];
  else if (k !== probes[0]) probes[1] = k;
  render();
}
function updateMeter() {
  const m = $('#meter');
  m.hidden = tool !== 'measure';
  if (m.hidden) return;
  const [a, b] = probes;
  $('#mhint').textContent = !a ? 'Touchez la 1ʳᵉ borne (pointe rouge)' : !b ? 'Touchez la 2ᵉ borne (pointe noire)' : `${termName(a)} ↔ ${termName(b)}`;
  let v = '— — —';
  if (a && b && eng.res) {
    const p = eng.res.v(a), q = eng.res.v(b);
    const x = Math.hypot(p[0] - q[0], p[1] - q[1]);
    v = x < 0.05 ? '0.0' : x.toFixed(x < 100 ? 1 : 0);
  }
  $('#mval').textContent = v;
}

// ------------------------------------------------------------ interactions plan de travail
function nearestTerm(cx, cy, exclude) {
  const w = toWorld(cx, cy);
  const R = 26 / view.k;
  let best = null, bd = R;
  for (const c of circuit.components) {
    for (const t of DEFS[c.type].terminals) {
      const k = c.id + ':' + t.id;
      if (k === exclude) continue;
      const dd = Math.hypot(c.x + t.x - w.x, c.y + t.y - w.y);
      if (dd < bd) { bd = dd; best = k; }
    }
  }
  return best;
}
function endGesture() {
  if (!G) return;
  if (G.type === 'act') doAct(G.c, G.a, 'up');
  if (G.type === 'move' && G.moved) { pushUndo(G.snap); save(); }
  G = null; temp = null; renderOver();
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

svg.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button === 2) return;
  try { svg.setPointerCapture(e.pointerId); } catch (er) { /* */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    endGesture();
    const [a, b] = [...ptrs.values()];
    G = { type: 'pinch', d0: dist(a, b) || 1, k0: view.k, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vx: view.x, vy: view.y };
    return;
  }
  if (ptrs.size > 2) return;
  const start = { x: e.clientX, y: e.clientY };
  if (e.button === 1) { G = { type: 'pan', start, vx: view.x, vy: view.y, moved: true }; return; }
  const tEl = e.target.closest('[data-t]'), aEl = e.target.closest('[data-act]'), wEl = e.target.closest('[data-w]'), cEl = e.target.closest('[data-c]');
  if (tEl) { G = { type: 'term', key: tEl.dataset.t, start, moved: false }; return; }
  if (aEl && cEl) { const c = compById(cEl.dataset.c); G = { type: 'act', c, a: aEl.dataset.act, start, moved: false }; doAct(c, G.a, 'down'); return; }
  if (wEl) { G = { type: 'wire', id: wEl.dataset.w, start, vx: view.x, vy: view.y, moved: false }; return; }
  if (cEl) {
    const c = compById(cEl.dataset.c);
    const w = toWorld(e.clientX, e.clientY);
    G = { type: 'move', c, off: { x: w.x - c.x, y: w.y - c.y }, start, moved: false, snap: snapshot() };
    return;
  }
  G = { type: 'pan', start, vx: view.x, vy: view.y, moved: false };
});

svg.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!G) {
    if (pending && tool === 'wire' && e.pointerType === 'mouse') {
      const tg = nearestTerm(e.clientX, e.clientY, pending);
      temp = wpath(tpos(pending), tg ? tpos(tg) : { ...toWorld(e.clientX, e.clientY), dir: 'down' });
      renderOver();
    }
    return;
  }
  if (G.type === 'pinch') {
    const v = [...ptrs.values()];
    if (v.length < 2) return;
    const [a, b] = v;
    const r = svg.getBoundingClientRect();
    const k = Math.min(3, Math.max(0.25, G.k0 * dist(a, b) / G.d0));
    const wx = (G.m0.x - r.left - G.vx) / G.k0, wy = (G.m0.y - r.top - G.vy) / G.k0;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    view.k = k; view.x = m.x - r.left - wx * k; view.y = m.y - r.top - wy * k;
    applyView();
    return;
  }
  const dx = e.clientX - G.start.x, dy = e.clientY - G.start.y;
  if (!G.moved && Math.hypot(dx, dy) > 6) G.moved = true;
  if (!G.moved) return;
  if (G.type === 'pan' || G.type === 'wire') { view.x = G.vx + dx; view.y = G.vy + dy; applyView(); }
  else if (G.type === 'move') {
    const w = toWorld(e.clientX, e.clientY);
    G.c.x = Math.round((w.x - G.off.x) / 10) * 10;
    G.c.y = Math.round((w.y - G.off.y) / 10) * 10;
    renderComps(); renderWires(); renderOver();
  } else if (G.type === 'term' && tool === 'wire') {
    const tg = nearestTerm(e.clientX, e.clientY, G.key);
    temp = wpath(tpos(G.key), tg ? tpos(tg) : { ...toWorld(e.clientX, e.clientY), dir: 'down' });
    for (const el of Lt.querySelectorAll('.term.hot')) el.classList.remove('hot');
    if (tg) { const el = Lt.querySelector(`[data-t="${CSS.escape(tg)}"]`); if (el) el.classList.add('hot'); }
    renderOver();
  }
});

function pointerEnd(e) {
  ptrs.delete(e.pointerId);
  if (!G) return;
  if (G.type === 'pinch') { if (ptrs.size < 2) G = null; return; }
  const g = G; G = null;
  temp = null;
  for (const el of Lt.querySelectorAll('.term.hot')) el.classList.remove('hot');
  if (e.type === 'pointercancel') { if (g.type === 'act') doAct(g.c, g.a, 'up'); renderOver(); return; }
  switch (g.type) {
    case 'term':
      if (tool === 'measure') { if (!g.moved) setProbe(g.key); break; }
      if (g.moved) { const tg = nearestTerm(e.clientX, e.clientY, g.key); if (tg) addWire(g.key, tg); pending = null; }
      else if (pending && pending !== g.key) { const p = pending; pending = null; addWire(p, g.key); }
      else if (pending === g.key) pending = null;
      else { pending = g.key; hint(`Borne ${termName(g.key)} : touchez une 2ᵉ borne pour tirer le fil`); }
      render();
      break;
    case 'act':
      doAct(g.c, g.a, 'up');
      if (!g.moved) doAct(g.c, g.a, 'tap');
      break;
    case 'wire':
      if (!g.moved) select({ kind: 'wire', id: g.id });
      break;
    case 'move':
      if (g.moved) { pushUndo(g.snap); eng.settle(); render(); save(); } else select({ kind: 'comp', id: g.c.id });
      break;
    case 'pan':
      if (!g.moved) { pending = null; select(null); }
      else save();
      break;
  }
  renderOver();
}
svg.addEventListener('pointerup', pointerEnd);
svg.addEventListener('pointercancel', pointerEnd);
svg.addEventListener('contextmenu', (e) => e.preventDefault());
svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input,select,textarea')) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); delSel(); }
  else if (e.key === 'Escape') { pending = null; temp = null; select(null); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

// ------------------------------------------------------------ barre de sélection flottante
const selbar = document.createElement('div');
selbar.className = 'selbar';
selbar.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:14px;display:none;gap:6px;background:#0b1220ee;border:1px solid #2f3a50;border-radius:14px;padding:6px;z-index:5;box-shadow:0 6px 20px #0008';
$('#stage').append(selbar);
function updateSelbar() {
  const has = !!sel;
  selbar.style.display = has ? 'flex' : 'none';
  $('#fabAdd').style.visibility = has ? 'hidden' : '';
  if (!has) return;
  const key = sel.kind + sel.id;
  if (selbar.dataset.k === key) return;
  selbar.dataset.k = key;
  let h = '';
  if (sel.kind === 'wire') {
    h += ['marron', 'noir', 'gris', 'bleu', 'vj', 'rouge', 'orange'].map((c) => `<button data-wc="${c}" title="${WNAME[c]}" style="width:28px;height:28px;border-radius:50%;border:2px solid #fff3;background:${c === 'vj' ? 'repeating-linear-gradient(45deg,#2e9e3a 0 6px,#f2d21b 6px 12px)' : WCOL[c]}"></button>`).join('');
  } else {
    h += `<button class="sbtn" data-sa="props">⚙ Propriétés</button><button class="sbtn" data-sa="dup">⧉ Dupliquer</button>`;
  }
  h += `<button class="sbtn danger" data-sa="del">🗑 Supprimer</button><button class="sbtn" data-sa="close">✕</button>`;
  selbar.innerHTML = h;
}
selbar.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.wc) { const w = circuit.wires.find((x) => x.id === sel.id); if (w) { pushUndo(); w.color = b.dataset.wc; changed(); } return; }
  const a = b.dataset.sa;
  if (a === 'del') delSel();
  else if (a === 'close') select(null);
  else if (a === 'props') { openSheet('inspector'); }
  else if (a === 'dup') {
    const c = compById(sel.id);
    if (!c) return;
    const n = addComp(c.type, c.x + 40, c.y + 40);
    n.props = { ...c.props };
    changed();
  }
});

// ------------------------------------------------------------ inspecteur
function renderInspector() {
  const box = $('#insp');
  if (sel && sel.kind === 'comp') {
    const c = compById(sel.id);
    if (!c) { sel = null; return renderInspector(); }
    const d = DEFS[c.type];
    let h = `<h3>${esc(c.label)}</h3><div class="muted">${esc(d.name)}</div>`;
    h += `<label>Repère</label><input type="text" id="iLabel" value="${esc(c.label)}" maxlength="10">`;
    for (const [k, p] of Object.entries(d.props)) {
      h += `<label>${esc(p.label)}</label><select data-prop="${k}">` + p.options.map(([v, n]) => `<option value="${esc(v)}"${String(c.props[k]) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
    }
    const info = compInfo(c);
    if (info.length) h += '<div class="kv">' + info.map(([a, b]) => `<b>${esc(a)}</b><span>${esc(b)}</span>`).join('') + '</div>';
    h += `<div class="row"><button class="sbtn" data-i="dup">⧉ Dupliquer</button><button class="sbtn" data-i="unwire">✂ Retirer ses fils</button><button class="sbtn danger" data-i="del">🗑 Supprimer</button></div>`;
    h += `<p class="muted" style="margin-top:14px">${esc(compHelp(c))}</p>`;
    box.innerHTML = h;
    return;
  }
  if (sel && sel.kind === 'wire') {
    const w = circuit.wires.find((x) => x.id === sel.id);
    if (!w) { sel = null; return renderInspector(); }
    box.innerHTML = `<h3>Fil</h3><div class="muted">${esc(termName(w.a))} → ${esc(termName(w.b))}</div><label>Couleur</label><div class="wcolors">` +
      Object.keys(WCOL).map((c) => `<button data-wc="${c}" title="${esc(WNAME[c])}" class="${w.color === c ? 'active' : ''}" style="background:${c === 'vj' ? 'repeating-linear-gradient(45deg,#2e9e3a 0 6px,#f2d21b 6px 12px)' : WCOL[c]}"></button>`).join('') +
      `</div><div class="row"><button class="sbtn danger" data-i="del">🗑 Supprimer le fil</button></div>`;
    return;
  }
  if (schema) {
    let h = `<h3>${esc(schema.title)}</h3><div class="muted">${'★'.repeat(schema.level)}${'☆'.repeat(5 - schema.level)} · ${esc(schema.cat)}</div>`;
    h += `<p>${esc(schema.desc)}</p><p><b>Consigne :</b> ${esc(schema.consigne)}</p>`;
    h += `<div class="row"><button class="pbtn ok" data-i="check">✔ Vérifier mon câblage</button></div>`;
    h += `<div class="row">${mode === 'ex' ? '<button class="sbtn" data-i="sol">👁 Voir la solution</button>' : '<button class="sbtn" data-i="ex">✎ Refaire en exercice</button>'}<button class="sbtn" data-i="restart">⟲ Recommencer</button></div>`;
    if (lastCheck) {
      h += `<div class="verdict ${lastCheck.ok ? 'ok' : 'ko'}">${lastCheck.ok ? '🎉 Bravo ! Le câblage fonctionne.' : 'Le câblage ne fonctionne pas encore.'}</div><div class="results">` +
        lastCheck.results.map((r) => `<div class="${r.ok ? 'ok' : 'ko'}">${esc(r.msg)}</div>`).join('') + '</div>';
    }
    box.innerHTML = h;
    return;
  }
  box.innerHTML = `<h3>Atelier libre</h3><p class="muted">Ajoutez des composants depuis la palette, puis reliez les bornes : touchez une borne, puis une autre (ou glissez de l'une à l'autre). Touchez les boutons, interrupteurs et leviers pour les manœuvrer : le circuit est simulé en temps réel.</p>
    <div class="row"><button class="pbtn" data-i="lib">📚 Ouvrir un schéma</button><button class="sbtn" data-i="help">❓ Aide</button></div>
    <div class="kv"><b>Composants</b><span>${circuit.components.length}</span><b>Fils</b><span>${circuit.wires.length}</span></div>`;
}
function compInfo(c) {
  const r = eng.res, out = [];
  if (!r) return out;
  const d = DEFS[c.type];
  const v2 = (a, b) => Math.round(r.vd(c, a, b)) + ' V';
  if (d.tmap.A1 && d.tmap.A2) out.push(['Tension bobine', v2('A1', 'A2')], ['État', c.state.burnt ? 'bobine grillée' : c.state.en ? 'enclenché' : 'repos']);
  if (c.type === 'lampe' || c.type === 'sonnerie') out.push(['Tension', v2('1', '2')]);
  if (c.type === 'voyant') out.push(['Tension', v2('X1', 'X2')]);
  if (c.type === 'prise') out.push(['Tension L-N', v2('L', 'N')], ['Terre', c._noEarth ? 'NON raccordée ⚠' : 'raccordée']);
  if (c.type === 'radiateur') out.push(['Tension', v2('1', '2')], ['Terre', c._noEarth ? 'NON raccordée ⚠' : 'raccordée']);
  if (c.type === 'moteur_3' && c._m) {
    out.push(['U1-U2', Math.round(c._m.m[0]) + ' V'], ['V1-V2', Math.round(c._m.m[1]) + ' V'], ['W1-W2', Math.round(c._m.m[2]) + ' V']);
    out.push(['Terre', c._noEarth ? 'NON raccordée ⚠' : 'raccordée']);
  }
  if (c.type === 'disj_1pn') out.push(['Courant', Math.max(r.ic(c, 'pL'), r.ic(c, 'pN')).toFixed(2) + ' A']);
  if (c.type === 'relais_thermique') out.push(['Courant', (c._I || 0).toFixed(2) + ' A']);
  if (c.type === 'transfo') out.push(['Primaire', v2('P1', 'P2')], ['Secondaire', v2('S1', 'S2')]);
  return out;
}
function compHelp(c) {
  const h = {
    alim_mono: 'Source 230 V (phase L, neutre N, terre PE). Touchez le bouton I/O pour couper ; après un court-circuit, touchez-le pour réarmer.',
    alim_tri: 'Réseau triphasé 400 V entre phases, 230 V entre phase et neutre.',
    disj_1pn: 'Protège contre les surcharges et courts-circuits. Touchez le levier pour l\'ouvrir/le réarmer.',
    diff: 'Coupe si un courant de fuite vers la terre dépasse la sensibilité (protection des personnes). T = bouton test.',
    contacteur: 'Bobine A1-A2. Pôles de puissance 1-2, 3-4, 5-6 ; auxiliaires 13-14 et 33-34 (NO), 21-22 et 41-42 (NF).',
    relais: 'Relais de commande : 13-14, 33-34 (NO) ; 21-22, 41-42 (NF).',
    relais_tempo: 'Contact inverseur temporisé : 15 commun, 16 repos (NF), 18 travail (NO).',
    telerupteur: 'Chaque impulsion sur la bobine A1-A2 inverse l\'état du contact 1-2. Bouton ⇅ = commande manuelle.',
    relais_thermique: 'Pôles 1-2, 3-4, 5-6 en série avec le moteur. 95-96 (NF) s\'ouvre en surcharge, 97-98 (NO) se ferme. R = réarmement, T = test.',
    moteur_3: 'Plaque à bornes : U1 V1 W1 / W2 U2 V2. Étoile : relier W2-U2-V2. Triangle : U1-W2, V1-U2, W1-V2. Bouton « Charge » = simuler une surcharge mécanique.',
    prise: 'Touchez la prise pour brancher / débrancher un appareil.',
    minuterie: 'L/N = alimentation, BP = entrée poussoirs (phase), S = sortie lampes.',
    detecteur: 'Touchez le dôme pour simuler un passage.',
    transfo: 'Transformateur de sécurité. Protégez le secondaire par un fusible.',
    bornier: 'Les 4 points sont reliés entre eux.',
  };
  return h[c.type] || 'Touchez les éléments interactifs pour manœuvrer le composant.';
}
$('#insp').addEventListener('change', (e) => {
  const c = sel && sel.kind === 'comp' && compById(sel.id);
  if (!c) return;
  if (e.target.id === 'iLabel') { pushUndo(); c.label = e.target.value.trim() || c.label; changed(); }
  else if (e.target.dataset.prop) {
    pushUndo();
    const p = DEFS[c.type].props[e.target.dataset.prop];
    const v = p.options.find(([x]) => String(x) === e.target.value)[0];
    c.props[e.target.dataset.prop] = v;
    changed();
  }
});
$('#insp').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.wc) { const w = circuit.wires.find((x) => x.id === sel.id); if (w) { pushUndo(); w.color = b.dataset.wc; changed(); } return; }
  const a = b.dataset.i;
  if (a === 'del') delSel();
  else if (a === 'dup') selbar.querySelector('[data-sa=dup]')?.click();
  else if (a === 'unwire') { pushUndo(); circuit.wires = circuit.wires.filter((w) => !w.a.startsWith(sel.id + ':') && !w.b.startsWith(sel.id + ':')); changed(); }
  else if (a === 'check') check();
  else if (a === 'sol') { if (confirm('Afficher la solution ? Votre câblage sera remplacé.')) loadSchema(schema, true); }
  else if (a === 'ex') loadSchema(schema, false);
  else if (a === 'restart') { if (confirm('Effacer votre câblage et recommencer ?')) loadSchema(schema, mode === 'sol'); }
  else if (a === 'lib') openLibrary();
  else if (a === 'help') openHelp();
});
$('#btnClearLog').onclick = () => { $('#log').innerHTML = ''; };

// ------------------------------------------------------------ exercices
function check() {
  if (!schema) return;
  lastCheck = runCheck(circuit, schema);
  renderInspector();
  toast(lastCheck.ok ? '🎉 Bravo ! Le câblage est correct.' : '✘ ' + (lastCheck.results.find((r) => !r.ok) || {}).msg, lastCheck.ok ? 'ok' : 'danger', 7000);
  if (mobile()) openSheet('inspector');
}
function loadSchema(s, withWires) {
  schema = s; mode = s ? (withWires ? 'sol' : 'ex') : null; lastCheck = null;
  circuit.components = s ? s.components.map((c) => makeComp(c.type, c.x, c.y, c.id, c.id, c.props)) : [];
  circuit.wires = s && withWires ? s.wires.map(([a, b, col], i) => ({ id: 'w' + i, a, b, color: col })) : [];
  eng = new Engine(circuit); lastEv = 0;
  $('#toasts').innerHTML = '';
  sel = null; pending = null; probes = [null, null]; undoStack = [];
  updateExbar();
  eng.settle(); render(); renderInspector(); fit(); save();
  if (s) toast(withWires ? `Solution : ${s.title}. Manœuvrez les appareils pour voir le fonctionnement.` : `Exercice : ${s.title}. Câblez puis appuyez sur « Vérifier ».`, 'info', 6000);
}
function updateExbar() {
  $('#exbar').hidden = !schema;
  if (!schema) return;
  $('#exTitle').textContent = schema.title;
  $('#exMode').textContent = mode === 'sol' ? 'Solution' : 'Exercice';
  $('#exMode').className = 'tag' + (mode === 'sol' ? ' sol' : '');
}
$('#btnCheck').onclick = check;
$('#btnConsigne').onclick = () => {
  select(null);
  if (mobile()) openSheet('inspector');
  else dialog(`<div class="dhead"><h2>${esc(schema.title)}</h2><button class="ibtn" data-x>✕</button></div><div class="dbody"><p>${esc(schema.desc)}</p><p><b>Consigne :</b> ${esc(schema.consigne)}</p></div>`);
};

// ------------------------------------------------------------ palette
function buildPalette() {
  const list = $('#plist');
  let h = '';
  for (const cat of CATEGORIES) {
    const items = Object.values(DEFS).filter((d) => d.cat === cat);
    if (!items.length) continue;
    h += `<div class="pcat" data-cat>${esc(cat)}</div><div class="pgrid">`;
    for (const d of items) {
      const c = makeComp(d.type, 0, 0, 'pv', d.prefix);
      let terms = '';
      for (const t of d.terminals) terms += `<circle cx="${t.x}" cy="${t.y}" r="6" fill="#d1d5db" stroke="#4b5563" stroke-width="1.5"/>`;
      h += `<div class="pitem" role="button" tabindex="0" aria-label="Ajouter : ${esc(d.name)}" data-type="${d.type}" data-name="${esc((d.name + ' ' + d.short).toLowerCase())}" title="${esc(d.name)}"><svg aria-hidden="true" viewBox="-10 -10 ${d.w + 20} ${d.h + 20}" preserveAspectRatio="xMidYMid meet">${d.draw(c, d)}${terms}</svg><span>${esc(d.short)}</span></div>`;
    }
    h += '</div>';
  }
  list.innerHTML = h;
}
$('#psearch').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  for (const it of document.querySelectorAll('.pitem')) it.hidden = q && !it.dataset.name.includes(q);
  for (const g of document.querySelectorAll('.pgrid')) g.previousElementSibling.hidden = g.hidden = ![...g.children].some((x) => !x.hidden);
});
$('#plist').addEventListener('keydown', (e) => {
  const it = e.target.closest('.pitem');
  if (it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); addAtCenter(it.dataset.type); }
});
let pal = null;
$('#plist').addEventListener('pointerdown', (e) => {
  const it = e.target.closest('.pitem');
  if (!it) return;
  pal = { type: it.dataset.type, x: e.clientX, y: e.clientY, c: null, id: e.pointerId };
});
window.addEventListener('pointermove', (e) => {
  if (!pal || e.pointerId !== pal.id) return;
  if (mobile()) return;
  const r = svg.getBoundingClientRect();
  const inside = e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
  if (!pal.c && inside && Math.hypot(e.clientX - pal.x, e.clientY - pal.y) > 10) {
    const d = DEFS[pal.type];
    const w = toWorld(e.clientX, e.clientY);
    pal.c = addComp(pal.type, w.x - d.w / 2, w.y - d.h / 2);
  } else if (pal.c) {
    const d = DEFS[pal.type];
    const w = toWorld(e.clientX, e.clientY);
    pal.c.x = Math.round((w.x - d.w / 2) / 10) * 10; pal.c.y = Math.round((w.y - d.h / 2) / 10) * 10;
    renderComps(); renderWires();
  }
});
window.addEventListener('pointerup', (e) => {
  if (!pal || e.pointerId !== pal.id) return;
  const p = pal; pal = null;
  if (p.c) { eng.settle(); render(); save(); return; }
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) {
    addAtCenter(p.type);
    if (mobile()) closeSheets();
  }
});

// ------------------------------------------------------------ feuilles mobiles, menus, dialogues
function openSheet(id) { closeSheets(); $('#' + id).classList.add('open'); }
function closeSheets() { for (const el of document.querySelectorAll('.palette,.inspector')) el.classList.remove('open'); }
for (const b of document.querySelectorAll('[data-close]')) b.onclick = closeSheets;
$('#fabAdd').onclick = () => openSheet('palette');
$('#fabInfo').onclick = () => { if ($('#inspector').classList.contains('open')) closeSheets(); else openSheet('inspector'); };

const dlg = $('#dlg');
function dialog(html) {
  $('#dlgBody').innerHTML = html;
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', (e) => {
  if (e.target === dlg || e.target.closest('[data-x]')) dlg.close();
  const b = e.target.closest('[data-load]');
  if (b) {
    dlg.close();
    if (b.dataset.load === 'free') { loadSchema(null, false); return; }
    loadSchema(SCHEMAS.find((s) => s.id === b.dataset.load), b.dataset.sol === '1');
    if (mobile()) closeSheets();
  }
});

function openLibrary() {
  let h = `<div class="dhead"><h2>📚 Bibliothèque de schémas</h2><button class="ibtn" data-x>✕</button></div><div class="dbody">
    <p class="muted">Choisissez un schéma. <b>Exercice</b> : les appareils sont posés, à vous de les câbler puis de vérifier. <b>Solution</b> : le schéma est câblé et fonctionne, manœuvrez-le pour comprendre.</p>
    <div class="lgrid"><div class="lcard"><h4>🛠 Atelier libre</h4><p>Plan de travail vierge : créez vos propres montages avec tous les composants.</p><div class="row"><button class="pbtn" data-load="free">Ouvrir</button></div></div></div>`;
  for (const cat of CATS) {
    h += `<div class="lcat">${esc(cat)}</div><div class="lgrid">`;
    for (const s of SCHEMAS.filter((x) => x.cat === cat)) {
      h += `<div class="lcard"><h4>${esc(s.title)}</h4><div class="stars">${'★'.repeat(s.level)}${'☆'.repeat(5 - s.level)}</div><p>${esc(s.desc)}</p>
        <div class="row"><button class="pbtn" data-load="${s.id}">✎ Exercice</button><button class="sbtn" data-load="${s.id}" data-sol="1">👁 Solution</button></div></div>`;
    }
    h += '</div>';
  }
  dialog(h + '</div>');
}
function openHelp() {
  dialog(`<div class="dhead"><h2>❓ Aide</h2><button class="ibtn" data-x>✕</button></div><div class="dbody help">
  <h3>Câbler</h3><ul><li>Touchez une <b>borne</b> (vis), puis une autre : le fil est tiré. Sur ordinateur vous pouvez aussi glisser d'une borne à l'autre.</li>
  <li>Plusieurs fils peuvent arriver sur la même borne (repiquage).</li>
  <li>Choisissez la couleur du fil en haut (<b>A</b> = automatique : bleu pour le neutre, vert/jaune pour la terre, marron pour la phase).</li>
  <li>Touchez un fil pour le sélectionner, changer sa couleur ou le supprimer.</li></ul>
  <h3>Manœuvrer</h3><ul><li>Touchez les interrupteurs, leviers de disjoncteurs, prises, boutons… Les boutons poussoirs restent enfoncés tant que vous appuyez.</li>
  <li>Les fils sous tension sont animés. Les défauts (court-circuit, fuite à la terre, surtension, surcharge) déclenchent les protections comme dans la réalité.</li></ul>
  <h3>Mesurer</h3><ul><li>Outil <b>📟 Mesurer</b> : touchez deux bornes pour lire la tension entre elles avec le multimètre.</li></ul>
  <h3>Se déplacer</h3><ul><li>Glissez le fond pour vous déplacer, pincez (ou molette) pour zoomer, ⤢ pour recentrer.</li>
  <li>Glissez un composant pour le déplacer ; touchez-le pour voir ses propriétés (calibre, tension de bobine, temporisation…).</li></ul>
  <h3>Exercices</h3><ul><li>Ouvrez un schéma de la bibliothèque, câblez-le, puis <b>✔ Vérifier</b> : l'application essaie votre montage comme un examinateur et indique ce qui ne va pas.</li></ul>
  <h3>Installer sur téléphone</h3><ul><li>Android (Chrome) : menu ⋮ → « Installer l'application ». iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil ». L'application fonctionne ensuite hors connexion.</li></ul>
  <h3>Vie privée</h3><p>Aucun compte, aucun cookie, aucun traceur : votre montage reste sur votre appareil. <a href="legal.html" style="color:#7cc4fd">Mentions légales, confidentialité et conditions d'utilisation</a>.</p>
  </div>`);
}

// menu principal
const menu = $('#menu');
$('#btnMenu').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#menu,#btnMenu')) menu.hidden = true; });
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#mInstall').hidden = false; });
menu.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  menu.hidden = true;
  const m = b.dataset.m;
  if (m === 'new') { if (!circuit.components.length || confirm('Effacer le plan de travail ?')) loadSchema(null, false); }
  else if (m === 'lib') openLibrary();
  else if (m === 'help') openHelp();
  else if (m === 'clearwires') { if (confirm('Retirer tous les fils ?')) { pushUndo(); circuit.wires = []; changed(); } }
  else if (m === 'reset') { pushUndo(); for (const c of circuit.components) c.state = DEFS[c.type].init(); changed(); toast('États réinitialisés.'); }
  else if (m === 'save') {
    const blob = new Blob([JSON.stringify({ app: 'electrolab', v: 1, schema: schema && schema.id, mode, circuit: JSON.parse(snapshot()) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (schema ? schema.id : 'montage') + '.electrolab.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } else if (m === 'open') $('#fileIn').click();
  else if (m === 'install' && installEvt) { installEvt.prompt(); installEvt = null; $('#mInstall').hidden = true; }
});
$('#fileIn').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    const cs = o.circuit || o;
    if (!Array.isArray(cs.components) || !Array.isArray(cs.wires)) throw new Error('format');
    pushUndo();
    circuit.components = cs.components.filter((c) => DEFS[c.type]);
    circuit.wires = cs.wires;
    schema = SCHEMAS.find((s) => s.id === o.schema) || null; mode = schema ? o.mode || 'ex' : null;
    updateExbar(); changed(); fit();
    toast('Montage chargé.', 'ok');
  } catch (er) { toast('Fichier illisible.', 'danger'); }
  e.target.value = '';
});

// outils & couleurs
for (const b of document.querySelectorAll('#tools button')) {
  b.onclick = () => {
    tool = b.dataset.tool;
    for (const x of document.querySelectorAll('#tools button')) x.classList.toggle('active', x === b);
    pending = null; temp = null;
    if (tool === 'measure') hint('Multimètre : touchez deux bornes pour mesurer la tension');
    render();
  };
}
function buildColors() {
  const box = $('#colors');
  box.innerHTML = `<button class="auto active" data-col="auto" title="${WNAME.auto}" aria-label="Couleur du fil : ${WNAME.auto}" aria-pressed="true">A</button>` +
    ['marron', 'noir', 'gris', 'bleu', 'vj', 'rouge', 'orange', 'violet', 'blanc'].map((c) => `<button data-col="${c}" title="${esc(WNAME[c])}" aria-label="Couleur du fil : ${esc(WNAME[c])}" aria-pressed="false" style="background:${c === 'vj' ? 'repeating-linear-gradient(45deg,#2e9e3a 0 5px,#f2d21b 5px 10px)' : WCOL[c]}"></button>`).join('');
  box.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    color = b.dataset.col;
    for (const x of box.children) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }
    hint('Couleur du fil : ' + WNAME[color]);
  };
}
$('#mclear').onclick = () => { probes = [null, null]; render(); };
$('#btnUndo').onclick = undo;
$('#btnLib').onclick = openLibrary;
$('#zIn').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); };
$('#zOut').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); };
$('#zFit').onclick = fit;

// ------------------------------------------------------------ démarrage
buildPalette();
buildColors();
const had = restore();
eng = new Engine(circuit);
applyView();
updateExbar();
eng.settle();
render();
renderInspector();
if (!had) loadSchema(SCHEMAS.find((s) => s.id === 'vv'), true);
if (!had) setTimeout(openLibrary, 400);

let lastT = performance.now();
setInterval(() => {
  if (document.hidden) { lastT = performance.now(); return; }
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastT) / 1000);
  lastT = now;
  eng.step(dt);
  render();
  flushEvents();
  if (sel && sel.kind === 'comp' && !document.activeElement.closest('#insp')) {
    const kv = $('#insp .kv');
    if (kv) { const c = compById(sel.id); if (c) kv.innerHTML = compInfo(c).map(([a, b]) => `<b>${esc(a)}</b><span>${esc(b)}</span>`).join(''); }
  }
}, 100);
window.addEventListener('resize', () => applyView());
window.addEventListener('beforeunload', save);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
