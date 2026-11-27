// Bibliothèque des composants électrotechniques : bornes, comportement électrique et dessin SVG.
import { cabs, carg, cdiv } from './solver.js';

export const RINT = 0.05;   // impédance interne des sources (Ω)
const REARTH = 20;          // résistance de prise de terre (schéma TT)
const CL = 0.005;           // contact fermé (Ω)

export const DEFS = {};
export const CATEGORIES = [
  'Alimentation & protection',
  'Commande habitat',
  'Commande industrielle',
  'Contacteurs & relais',
  'Récepteurs',
  'Moteurs',
  'Divers',
];

// ---------- utilitaires ----------
export const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const T = (id, x, y, label = id, kind = '', dir) => ({ id, x, y, label, kind, dir });
const ln = (x1, y1, x2, y2, cls = 'sym') => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const rc = (x, y, w, h, cls, rx = 0, extra = '') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${extra}/>`;
const tx = (x, y, s, cls = 't', anchor = 'middle') => `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(s)}</text>`;
const ci = (x, y, r, cls, extra = '') => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r}" ${extra}/>`;
const body = (d, cls = '') => rc(0, 0, d.w, d.h, 'mod' + (cls ? ' ' + cls : ''), 8);
const lbl = (c, x, y, anchor = 'start') => tx(x, y, c.label, 'lbl', anchor);
const act = (name, inner) => `<g class="act" data-act="${name}">${inner}</g>`;

// Contact vertical (NO ou NC) entre y1 et y2
function cv(x, y1, y2, closed, nc = false) {
  const L = y2 - y1, a = y1 + L * 0.36, b = y2 - L * 0.36;
  let s = ln(x, y1, x, a) + ln(x, b, x, y2);
  if (nc) s += ln(x, a, x + 8, a);
  const ex = closed ? (nc ? x + 8 : x) : (nc ? x - 5 : x - 11);
  const ey = closed ? a : a + 3;
  s += `<line class="sym blade${closed ? ' on' : ''}" x1="${x}" y1="${b}" x2="${ex}" y2="${ey}"/>`;
  return s;
}
function coil(x, y1, y2, en, burnt, tempo = false) {
  const m = (y1 + y2) / 2;
  let s = ln(x, y1, x, m - 13) + ln(x, m + 13, x, y2);
  s += rc(x - 11, m - 13, 22, 26, 'coil' + (en ? ' on' : '') + (burnt ? ' burnt' : ''), 2);
  if (tempo) s += rc(x - 19, m - 13, 8, 26, 'coil' + (en ? ' on' : ''), 1);
  if (burnt) s += tx(x, m + 4, '✕', 'burntx');
  return s;
}
function lever(x, y, w, h, on, tripped) {
  const knobY = on ? y + 3 : y + h / 2;
  return act('lever',
    rc(x, y, w, h, 'slot', 4) +
    rc(x + 3, knobY, w - 6, h / 2 - 3, 'knob' + (on ? ' on' : ''), 3) +
    tx(x + w / 2, knobY + h / 4 + 2, on ? 'I' : 'O', 'kt')) +
    (tripped ? rc(x + w + 3, y + 2, 6, 12, 'tripflag', 1) : '');
}
function rocker(x, y, w, h, on, name = 'toggle', mark = '') {
  return act(name,
    rc(x, y, w, h, 'rocker', 5) +
    rc(x + 3, on ? y + 3 : y + h / 2, w - 6, h / 2 - 3, 'rocker-press' + (on ? ' on' : ''), 3) +
    (mark ? tx(x + w / 2, y + h / 2 + 4, mark, 'kt') : ''));
}

// Thermique (courbe simplifiée) : renvoie true si déclenchement
function heat(st, key, dt, I, In, k = 5) {
  const r = I / In;
  if (r > 1.13) st[key] = (st[key] || 0) + dt * (r * r - 1) / k;
  else st[key] = Math.max(0, (st[key] || 0) - dt * 0.3);
  if (st[key] >= 1) { st[key] = 0; return true; }
  return false;
}

// Bobine avec hystérésis. Renvoie true si l'état change.
function coilUpdate(c, res, eng, Vn, a = 'A1', b = 'A2') {
  const s = c.state;
  const v = res.vd(c, a, b);
  c._vc = v;
  if (s.burnt) return false;
  if (v > 1.6 * Vn) {
    s.burnt = true; s.en = false;
    eng.event('danger', `${c.label} : bobine grillée (${Math.round(v)} V sur une bobine ${Vn} V).`, c.id);
    return true;
  }
  if (!s.en && v >= 0.75 * Vn) { s.en = true; return true; }
  if (s.en && v < 0.5 * Vn) { s.en = false; return true; }
  return false;
}
const coilR = (Vn) => Vn * Vn / 8;

function def(d) {
  d.tmap = {};
  for (const t of d.terminals) {
    if (!t.dir) t.dir = t.y <= 0 ? 'up' : t.y >= d.h ? 'down' : t.x <= 0 ? 'left' : t.x >= d.w ? 'right' : 'up';
    t.inside = t.y > 0 && t.y < d.h && t.x > 0 && t.x < d.w;
    d.tmap[t.id] = t;
  }
  d.props = d.props || {};
  d.init = d.init || (() => ({}));
  DEFS[d.type] = d;
}

const VOLT_OPTS = [[230, '230 V'], [24, '24 V'], [12, '12 V']];

// ======================= ALIMENTATIONS =======================
def({
  type: 'alim_mono', name: 'Alimentation monophasée 230 V', short: 'Réseau 230 V', cat: CATEGORIES[0], prefix: 'ALIM', w: 160, h: 80, source: true,
  terminals: [T('L', 40, 80, 'L', 'l'), T('N', 80, 80, 'N', 'n'), T('PE', 120, 80, 'PE', 'pe')],
  init: () => ({ on: true, tripped: false }),
  stamp(c, x) {
    x.R('PE', 'GND', REARTH, 'pe');
    if (c.state.on && !c.state.tripped) { x.src('L', 230, 0, 'L'); x.src('N', 0, 0, 'N'); }
  },
  mag(c, r) {
    const I = Math.max(r.isrc(c, 'L'), r.isrc(c, 'N'));
    return I > 300 ? { In: 63, apply: (e) => { c.state.tripped = true; e.event('danger', `Court-circuit ! La protection générale de ${c.label} a déclenché. Corrigez le câblage puis réarmez l'alimentation.`, c.id); } } : null;
  },
  act(c, a, ph) {
    if (ph !== 'tap' || a !== 'main') return false;
    if (c.state.tripped) { c.state.tripped = false; c.state.on = true; } else c.state.on = !c.state.on;
    return true;
  },
  set(c, v) { c.state.on = !!v; c.state.tripped = false; },
  out: (c) => c.state.on && !c.state.tripped,
  draw(c, d) {
    const s = c.state;
    return body(d, 'src') + lbl(c, 10, 22) + tx(10, 40, '230 V ~ 50 Hz · TT', 'sub', 'start') +
      act('main', rc(110, 10, 40, 34, s.tripped ? 'mainsw trip' : s.on ? 'mainsw on' : 'mainsw', 6) +
        tx(130, 32, s.tripped ? '!' : s.on ? 'I' : 'O', 'kt big')) +
      ci(96, 18, 5, s.on && !s.tripped ? 'led on' : 'led');
  },
});

def({
  type: 'alim_tri', name: 'Réseau triphasé 400 V + N', short: 'Réseau 3~ 400 V', cat: CATEGORIES[0], prefix: 'ALIM', w: 220, h: 80, source: true,
  terminals: [T('L1', 40, 80, 'L1', 'l'), T('L2', 70, 80, 'L2', 'l'), T('L3', 100, 80, 'L3', 'l'), T('N', 140, 80, 'N', 'n'), T('PE', 180, 80, 'PE', 'pe')],
  init: () => ({ on: true, tripped: false }),
  stamp(c, x) {
    x.R('PE', 'GND', REARTH, 'pe');
    if (c.state.on && !c.state.tripped) {
      x.src('L1', 230, 0, 'L1'); x.src('L2', 230, -120, 'L2'); x.src('L3', 230, 120, 'L3'); x.src('N', 0, 0, 'N');
    }
  },
  mag(c, r) {
    const I = Math.max(r.isrc(c, 'L1'), r.isrc(c, 'L2'), r.isrc(c, 'L3'), r.isrc(c, 'N'));
    return I > 300 ? { In: 63, apply: (e) => { c.state.tripped = true; e.event('danger', `Court-circuit ! La protection générale de ${c.label} a déclenché. Corrigez le câblage puis réarmez.`, c.id); } } : null;
  },
  act: DEFS.alim_mono.act,
  set: DEFS.alim_mono.set,
  out: DEFS.alim_mono.out,
  draw(c, d) {
    const s = c.state;
    return body(d, 'src') + lbl(c, 10, 22) + tx(10, 40, '3 × 400 V + N ~ 50 Hz', 'sub', 'start') +
      act('main', rc(168, 10, 40, 34, s.tripped ? 'mainsw trip' : s.on ? 'mainsw on' : 'mainsw', 6) +
        tx(188, 32, s.tripped ? '!' : s.on ? 'I' : 'O', 'kt big')) +
      ci(154, 18, 5, s.on && !s.tripped ? 'led on' : 'led');
  },
});

def({
  type: 'transfo', name: 'Transformateur de commande', short: 'Transfo', cat: CATEGORIES[0], prefix: 'T', w: 120, h: 120,
  terminals: [T('P1', 30, 0, 'P1'), T('P2', 90, 0, 'P2'), T('S1', 30, 120, 'S1'), T('S2', 90, 120, 'S2')],
  props: { Vp: { label: 'Primaire', options: [[230, '230 V'], [400, '400 V']], def: 230 }, Vs: { label: 'Secondaire', options: [[24, '24 V'], [12, '12 V'], [48, '48 V']], def: 24 } },
  init: () => ({ burnt: false }),
  stamp(c, x) {
    if (c.state.burnt) return;
    const Vp = +c.props.Vp, Vs = +c.props.Vs;
    x.R('P1', 'P2', Vp * Vp / 10, 'mag');
    const s = x.node('s');
    x.xf('P1', 'P2', s, 'S2', Vs / Vp);
    x.R(s, 'S1', 0.3, 'sec');
  },
  mag(c, r) {
    if (c.state.burnt) return null;
    return r.ic(c, 'sec') > 40 ? { In: 4, apply: (e) => { c.state.burnt = true; e.event('danger', `${c.label} détruit : court-circuit au secondaire. Protégez le secondaire par un fusible !`, c.id); } } : null;
  },
  update(c, r) { c._v = r.vd(c, 'S1', 'S2'); return false; },
  act(c, a, ph) { if (ph === 'tap' && a === 'repair' && c.state.burnt) { c.state.burnt = false; return true; } return false; },
  out: (c) => (c._v || 0) > 5,
  draw(c, d) {
    const b = c.state.burnt;
    return body(d) + ln(30, 8, 30, 34) + ln(90, 8, 90, 34) + ln(30, 34, 90, 34) +
      ln(30, 112, 30, 86) + ln(90, 112, 90, 86) + ln(30, 86, 90, 86) +
      ci(60, 50, 14, 'wind') + ci(60, 70, 14, 'wind' + ((c._v || 0) > 5 ? ' on' : '')) +
      tx(104, 64, `${c.props.Vp}/${c.props.Vs} V`, 'sub', 'end') + lbl(c, 8, 64) +
      (b ? act('repair', tx(60, 64, 'HS – réparer', 'warnt')) : '');
  },
});

// ======================= PROTECTIONS =======================
function tripBreaker(c, e, why) {
  c.state.closed = false; c.state.tripped = true; c.state.h = 0;
  e.event('danger', `${c.label} a déclenché : ${why}.`, c.id);
}
const breakerAct = (c, a, ph) => {
  if (ph !== 'tap' || a !== 'lever') return false;
  if (c.state.closed) c.state.closed = false; else { c.state.closed = true; c.state.tripped = false; c.state.h = 0; }
  return true;
};

def({
  type: 'disj_1pn', name: 'Disjoncteur 1P+N', short: 'Disjoncteur', cat: CATEGORIES[0], prefix: 'Q', w: 80, h: 120,
  terminals: [T('Lin', 20, 0, '1', 'l'), T('Nin', 60, 0, 'N', 'n'), T('Lout', 20, 120, '2', 'l'), T('Nout', 60, 120, 'N', 'n')],
  props: { In: { label: 'Calibre', options: [[2, '2 A'], [10, '10 A'], [16, '16 A'], [20, '20 A'], [32, '32 A']], def: 16 } },
  init: () => ({ closed: true, tripped: false, h: 0 }),
  stamp(c, x) { if (c.state.closed) { x.R('Lin', 'Lout', CL, 'pL'); x.R('Nin', 'Nout', CL, 'pN'); } },
  mag(c, r) {
    if (!c.state.closed) return null;
    const In = +c.props.In;
    return Math.max(r.ic(c, 'pL'), r.ic(c, 'pN')) > 8 * In ? { In, apply: (e) => tripBreaker(c, e, 'court-circuit') } : null;
  },
  tick(c, dt, r, e) {
    if (!c.state.closed) return;
    if (heat(c.state, 'h', dt, Math.max(r.ic(c, 'pL'), r.ic(c, 'pN')), +c.props.In)) tripBreaker(c, e, 'surcharge (trop de courant)');
  },
  act: breakerAct,
  set(c, v) { c.state.closed = !!v; c.state.tripped = false; c.state.h = 0; },
  out: (c) => c.state.closed,
  draw(c, d) {
    return body(d, 'din') + lbl(c, 40, 34, 'middle') + ln(20, 8, 20, 40, 'sym thin') + ln(60, 8, 60, 40, 'sym thin') +
      lever(26, 42, 28, 44, c.state.closed, c.state.tripped) + tx(40, 102, 'C' + c.props.In, 'sub');
  },
});

def({
  type: 'diff', name: 'Interrupteur différentiel 30 mA', short: 'Différentiel', cat: CATEGORIES[0], prefix: 'ID', w: 100, h: 120,
  terminals: [T('Lin', 30, 0, '1', 'l'), T('Nin', 70, 0, 'N', 'n'), T('Lout', 30, 120, '2', 'l'), T('Nout', 70, 120, 'N', 'n')],
  props: { sens: { label: 'Sensibilité', options: [[0.03, '30 mA'], [0.3, '300 mA']], def: 0.03 } },
  init: () => ({ closed: true, tripped: false }),
  stamp(c, x) { if (c.state.closed) { x.R('Lin', 'Lout', CL, 'pL'); x.R('Nin', 'Nout', CL, 'pN'); } },
  update(c, r, e) {
    if (!c.state.closed) return false;
    const a = r.icx(c, 'pL'), b = r.icx(c, 'pN');
    const leak = Math.hypot(a[0] + b[0], a[1] + b[1]);
    if (leak > +c.props.sens) {
      c.state.closed = false; c.state.tripped = true;
      e.event('danger', `${c.label} a déclenché : fuite de courant vers la terre (${(leak * 1000).toFixed(0)} mA).`, c.id);
      return true;
    }
    return false;
  },
  act(c, a, ph) {
    if (ph !== 'tap') return false;
    if (a === 'test') { if (!c.state.closed) return false; c.state.closed = false; c.state.tripped = true; return true; }
    return breakerAct(c, a, ph);
  },
  set: DEFS.disj_1pn.set,
  out: (c) => c.state.closed,
  draw(c, d) {
    return body(d, 'din') + lbl(c, 50, 34, 'middle') + lever(30, 42, 28, 44, c.state.closed, c.state.tripped) +
      act('test', ci(80, 60, 9, 'testbtn') + tx(80, 64, 'T', 'kt')) +
      tx(50, 102, Math.round(c.props.sens * 1000) + ' mA', 'sub');
  },
});

def({
  type: 'disj_3p', name: 'Disjoncteur tripolaire (moteur)', short: 'Disj. 3P', cat: CATEGORIES[0], prefix: 'Q', w: 120, h: 120,
  terminals: [T('1', 20, 0, '1', 'l'), T('3', 60, 0, '3', 'l'), T('5', 100, 0, '5', 'l'), T('2', 20, 120), T('4', 60, 120), T('6', 100, 120)],
  props: { In: { label: 'Calibre', options: [[2, '2 A'], [4, '4 A'], [6, '6 A'], [10, '10 A'], [16, '16 A'], [25, '25 A']], def: 10 } },
  init: () => ({ closed: true, tripped: false, h: 0 }),
  stamp(c, x) { if (c.state.closed) { x.R('1', '2', CL, 'p1'); x.R('3', '4', CL, 'p2'); x.R('5', '6', CL, 'p3'); } },
  imax: (c, r) => Math.max(r.ic(c, 'p1'), r.ic(c, 'p2'), r.ic(c, 'p3')),
  mag(c, r) {
    if (!c.state.closed) return null;
    const In = +c.props.In;
    return DEFS.disj_3p.imax(c, r) > 8 * In ? { In, apply: (e) => tripBreaker(c, e, 'court-circuit') } : null;
  },
  tick(c, dt, r, e) {
    if (c.state.closed && heat(c.state, 'h', dt, DEFS.disj_3p.imax(c, r), +c.props.In)) tripBreaker(c, e, 'surcharge');
  },
  act: breakerAct,
  set: DEFS.disj_1pn.set,
  out: (c) => c.state.closed,
  draw(c, d) {
    return body(d, 'din') + lbl(c, 60, 34, 'middle') + lever(46, 42, 28, 44, c.state.closed, c.state.tripped) + tx(60, 102, 'C' + c.props.In, 'sub');
  },
});

const FUSE_OPTS = [[1, '1 A'], [2, '2 A'], [4, '4 A'], [6, '6 A'], [10, '10 A'], [16, '16 A'], [25, '25 A'], [32, '32 A']];
function blowFuse(c, i, e, why) {
  c.state.blown[i] = true;
  e.event('danger', `${c.label} : fusible ${c.state.blown.length > 1 ? 'n°' + (i + 1) + ' ' : ''}fondu (${why}).`, c.id);
}
def({
  type: 'fusible', name: 'Fusible (porte-fusible)', short: 'Fusible', cat: CATEGORIES[0], prefix: 'F', w: 60, h: 100,
  terminals: [T('1', 30, 0), T('2', 30, 100)],
  props: { In: { label: 'Calibre', options: FUSE_OPTS, def: 2 } },
  init: () => ({ closed: true, blown: [false], h: [0] }),
  stamp(c, x) { if (c.state.closed && !c.state.blown[0]) x.R('1', '2', CL, 'p0'); },
  mag(c, r) {
    if (!c.state.closed || c.state.blown[0]) return null;
    return r.ic(c, 'p0') > 6 * c.props.In ? { In: +c.props.In, apply: (e) => blowFuse(c, 0, e, 'court-circuit') } : null;
  },
  tick(c, dt, r, e) { if (c.state.closed && !c.state.blown[0] && heat(c.state.h, 0, dt, r.ic(c, 'p0'), +c.props.In, 3)) blowFuse(c, 0, e, 'surcharge'); },
  act(c, a, ph) {
    if (ph !== 'tap' || a !== 'lever') return false;
    if (c.state.blown[0]) c.state.blown[0] = false; else c.state.closed = !c.state.closed;
    return true;
  },
  set(c, v) { c.state.closed = !!v; c.state.blown = [false]; },
  out: (c) => c.state.closed && !c.state.blown[0],
  draw(c, d) {
    const s = c.state, ok = s.closed && !s.blown[0];
    return body(d, 'din') + ln(30, 8, 30, 30, 'sym thin') + ln(30, 70, 30, 92, 'sym thin') +
      act('lever', rc(18, 28, 24, 44, 'fuse' + (s.blown[0] ? ' blown' : '') + (s.closed ? '' : ' open'), 4) +
        (s.blown[0] ? tx(30, 55, '✕', 'burntx') : ln(30, 32, 30, 68, 'sym thin'))) +
      tx(8, 88, c.label, 'lbl small', 'start') + tx(52, 88, c.props.In + 'A', 'sub', 'end') + (ok ? '' : '');
  },
});

def({
  type: 'sect_3p', name: 'Sectionneur porte-fusibles 3P', short: 'Sectionneur', cat: CATEGORIES[0], prefix: 'Q', w: 120, h: 120,
  terminals: [T('1', 20, 0, '1', 'l'), T('3', 60, 0, '3', 'l'), T('5', 100, 0, '5', 'l'), T('2', 20, 120), T('4', 60, 120), T('6', 100, 120)],
  props: { In: { label: 'Fusibles', options: FUSE_OPTS, def: 6 } },
  init: () => ({ closed: true, blown: [false, false, false], h: [0, 0, 0] }),
  stamp(c, x) {
    if (!c.state.closed) return;
    [['1', '2'], ['3', '4'], ['5', '6']].forEach(([a, b], i) => { if (!c.state.blown[i]) x.R(a, b, CL, 'p' + i); });
  },
  mag(c, r) {
    if (!c.state.closed) return null;
    const In = +c.props.In;
    const hit = [0, 1, 2].filter((i) => !c.state.blown[i] && r.ic(c, 'p' + i) > 6 * In);
    return hit.length ? { In, apply: (e) => hit.forEach((i) => blowFuse(c, i, e, 'court-circuit')) } : null;
  },
  tick(c, dt, r, e) {
    if (!c.state.closed) return;
    for (let i = 0; i < 3; i++) if (!c.state.blown[i] && heat(c.state.h, i, dt, r.ic(c, 'p' + i), +c.props.In, 3)) blowFuse(c, i, e, 'surcharge');
  },
  act(c, a, ph) {
    if (ph !== 'tap' || a !== 'lever') return false;
    if (c.state.blown.some(Boolean)) c.state.blown = [false, false, false]; else c.state.closed = !c.state.closed;
    return true;
  },
  set(c, v) { c.state.closed = !!v; c.state.blown = [false, false, false]; },
  out: (c) => c.state.closed && !c.state.blown.some(Boolean),
  draw(c, d) {
    const s = c.state;
    let f = '';
    [20, 60, 100].forEach((x, i) => {
      f += ln(x, 8, x, 30, 'sym thin') + ln(x, 74, x, 112, 'sym thin') +
        rc(x - 9, 30, 18, 44, 'fuse' + (s.blown[i] ? ' blown' : '') + (s.closed ? '' : ' open'), 3) +
        (s.blown[i] ? tx(x, 57, '✕', 'burntx') : '');
    });
    return body(d, 'din') + act('lever', rc(6, 26, 108, 52, 'hit') + f) + lbl(c, 40, 94, 'middle') +
      tx(84, 94, s.closed ? c.props.In + ' A' : 'OUVERT', 'sub', 'middle');
  },
});

def({
  type: 'relais_thermique', name: 'Relais thermique', short: 'Relais therm.', cat: CATEGORIES[0], prefix: 'F', w: 200, h: 120,
  terminals: [T('1', 20, 0), T('3', 50, 0), T('5', 80, 0), T('95', 130, 0), T('97', 170, 0),
    T('2', 20, 120), T('4', 50, 120), T('6', 80, 120), T('96', 130, 120), T('98', 170, 120)],
  props: { Ir: { label: 'Réglage Ir', options: [[1, '1 A'], [1.6, '1,6 A'], [2.5, '2,5 A'], [4, '4 A'], [6, '6 A'], [10, '10 A']], def: 2.5 } },
  init: () => ({ tripped: false, h: 0 }),
  stamp(c, x) {
    x.R('1', '2', CL, 'p1'); x.R('3', '4', CL, 'p2'); x.R('5', '6', CL, 'p3');
    if (c.state.tripped) x.R('97', '98', CL); else x.R('95', '96', CL);
  },
  tick(c, dt, r, e) {
    if (c.state.tripped) return;
    const I = Math.max(r.ic(c, 'p1'), r.ic(c, 'p2'), r.ic(c, 'p3'));
    c._I = I;
    if (heat(c.state, 'h', dt, I, +c.props.Ir * 1.02, 4)) {
      c.state.tripped = true;
      e.event('warn', `${c.label} : relais thermique déclenché (surcharge du moteur : ${I.toFixed(1)} A pour Ir = ${c.props.Ir} A).`, c.id);
    }
  },
  act(c, a, ph) {
    if (ph !== 'tap') return false;
    if (a === 'reset') { c.state.tripped = false; c.state.h = 0; return true; }
    if (a === 'test') { c.state.tripped = true; return true; }
    return false;
  },
  set(c, v) { c.state.tripped = !!v; c.state.h = 0; },
  out: (c) => c.state.tripped,
  draw(c, d) {
    const t = c.state.tripped;
    let s = '';
    [20, 50, 80].forEach((x) => { s += ln(x, 26, x, 94) + `<path class="sym" d="M${x - 6} 52 h12 v16 h-12 z"/>`; });
    s += cv(130, 26, 94, !t, true) + cv(170, 26, 94, t);
    return body(d) + s + `<line class="sym dash" x1="14" y1="60" x2="182" y2="60"/>` +
      act('reset', rc(96, 34, 22, 16, 'resetbtn', 3) + tx(107, 46, 'R', 'kt')) +
      act('test', rc(96, 72, 22, 16, 'testsq', 3) + tx(107, 84, 'T', 'kt')) +
      tx(150, 112, c.label + '  Ir ' + c.props.Ir + 'A', 'lbl small', 'middle') + (t ? tx(107, 104, 'DÉCL.', 'warnt small') : '');
  },
});

// ======================= COMMANDE HABITAT =======================
def({
  type: 'inter', name: 'Interrupteur simple allumage', short: 'Interrupteur', cat: CATEGORIES[1], prefix: 'S', w: 80, h: 80,
  terminals: [T('L', 20, 80, 'L'), T('1', 60, 80, '1')],
  init: () => ({ on: false }),
  stamp(c, x) { if (c.state.on) x.R('L', '1', CL); },
  act(c, a, ph) { if (ph === 'tap' && a === 'toggle') { c.state.on = !c.state.on; return true; } return false; },
  set(c, v) { c.state.on = !!v; },
  out: (c) => c.state.on,
  draw(c, d) { return body(d) + lbl(c, 8, 18) + rc(16, 22, 48, 40, 'plate', 6) + rocker(26, 26, 28, 32, c.state.on, 'toggle', c.state.on ? 'I' : 'O'); },
});

def({
  type: 'va_et_vient', name: 'Interrupteur va-et-vient', short: 'Va-et-vient', cat: CATEGORIES[1], prefix: 'S', w: 100, h: 80,
  terminals: [T('1', 20, 80, '1'), T('L', 50, 80, 'L'), T('2', 80, 80, '2')],
  init: () => ({ pos: 0 }),
  stamp(c, x) { x.R('L', c.state.pos ? '2' : '1', CL); },
  act(c, a, ph) { if (ph === 'tap' && a === 'toggle') { c.state.pos = c.state.pos ? 0 : 1; return true; } return false; },
  set(c, v) { c.state.pos = v ? 1 : 0; },
  out: (c) => c.state.pos,
  draw(c, d) {
    const p = c.state.pos;
    return body(d) + lbl(c, 8, 18) + rc(24, 8, 52, 52, 'plate', 6) + rocker(36, 12, 28, 44, !p, 'toggle', p ? '▼' : '▲') +
      tx(92, 40, p ? 'L→2' : 'L→1', 'sub', 'end');
  },
});

def({
  type: 'permutateur', name: 'Permutateur', short: 'Permutateur', cat: CATEGORIES[1], prefix: 'S', w: 100, h: 100,
  terminals: [T('E1', 30, 0, 'E1'), T('E2', 70, 0, 'E2'), T('S1', 30, 100, 'S1'), T('S2', 70, 100, 'S2')],
  init: () => ({ pos: 0 }),
  stamp(c, x) {
    if (c.state.pos) { x.R('E1', 'S2', CL); x.R('E2', 'S1', CL); } else { x.R('E1', 'S1', CL); x.R('E2', 'S2', CL); }
  },
  act: DEFS.va_et_vient.act,
  set: DEFS.va_et_vient.set,
  out: (c) => c.state.pos,
  draw(c, d) {
    const p = c.state.pos;
    const links = p ? ln(30, 30, 70, 70, 'sym on') + ln(70, 30, 30, 70, 'sym on') : ln(30, 30, 30, 70, 'sym on') + ln(70, 30, 70, 70, 'sym on');
    return body(d) + links + act('toggle', rc(38, 34, 24, 32, 'rocker', 4) + tx(50, 55, '⇄', 'kt')) + lbl(c, 6, 54);
  },
});

def({
  type: 'double', name: 'Interrupteur double allumage', short: 'Double allumage', cat: CATEGORIES[1], prefix: 'S', w: 100, h: 80,
  terminals: [T('1', 20, 80, '1'), T('L', 50, 80, 'L'), T('2', 80, 80, '2')],
  init: () => ({ a: false, b: false }),
  stamp(c, x) { if (c.state.a) x.R('L', '1', CL); if (c.state.b) x.R('L', '2', CL); },
  act(c, a, ph) { if (ph === 'tap' && (a === 'a' || a === 'b')) { c.state[a] = !c.state[a]; return true; } return false; },
  set(c, v, sub) { if (sub === 'a' || sub === 'b') c.state[sub] = !!v; },
  out: (c, sub) => (sub ? c.state[sub] : c.state.a || c.state.b),
  draw(c, d) {
    return body(d) + lbl(c, 8, 18) + rc(16, 22, 68, 40, 'plate', 6) +
      rocker(22, 26, 26, 32, c.state.a, 'a', '1') + rocker(52, 26, 26, 32, c.state.b, 'b', '2');
  },
});

const pushAct = (c, a, ph) => {
  if (a !== 'push') return false;
  if (ph === 'down' && !c.state.pressed) { c.state.pressed = true; return true; }
  if (ph === 'up' && c.state.pressed) { c.state.pressed = false; return true; }
  return false;
};
def({
  type: 'poussoir', name: 'Bouton poussoir (habitat)', short: 'Poussoir', cat: CATEGORIES[1], prefix: 'S', w: 80, h: 80,
  terminals: [T('1', 20, 80, '1'), T('2', 60, 80, '2')],
  init: () => ({ pressed: false }),
  stamp(c, x) { if (c.state.pressed) x.R('1', '2', CL); },
  act: pushAct,
  set(c, v) { c.state.pressed = !!v; },
  out: (c) => c.state.pressed,
  draw(c, d) {
    const p = c.state.pressed;
    return body(d) + lbl(c, 8, 18) + rc(16, 22, 48, 40, 'plate', 6) +
      act('push', ci(40, 42, p ? 13 : 15, 'pbtn' + (p ? ' on' : '')) + ci(40, 42, 4, 'pdot'));
  },
});

def({
  type: 'detecteur', name: 'Détecteur de mouvement', short: 'Détecteur', cat: CATEGORIES[1], prefix: 'B', w: 120, h: 100,
  terminals: [T('L', 30, 0, 'L', 'l'), T('N', 90, 0, 'N', 'n'), T('S', 60, 100, 'S')],
  props: { T: { label: 'Temporisation', options: [[5, '5 s'], [8, '8 s'], [15, '15 s'], [30, '30 s']], def: 8 } },
  init: () => ({ motion: 0 }),
  stamp(c, x) { x.R('L', 'N', 50000); if (c._pow && c.state.motion > 0) x.R('L', 'S', CL); },
  update(c, r) { const p = r.vd(c, 'L', 'N') > 150; if (p !== !!c._pow) { c._pow = p; return true; } return false; },
  tick(c, dt) { if (c.state.motion > 0) c.state.motion = Math.max(0, c.state.motion - dt); },
  act(c, a, ph) { if (ph === 'tap' && a === 'motion') { c.state.motion = +c.props.T; return true; } return false; },
  set(c, v) { c.state.motion = v ? +c.props.T : 0; },
  out: (c) => c.state.motion > 0,
  draw(c, d) {
    const m = c.state.motion > 0;
    return body(d) + act('motion', `<path class="dome${m ? ' on' : ''}" d="M32 70 a28 28 0 0 1 56 0 z"/>` + ci(60, 58, 6, 'lens') +
      (m ? `<path class="waves" d="M24 46 q-8 12 0 24 M96 46 q8 12 0 24 M16 40 q-12 18 0 36 M104 40 q12 18 0 36"/>` : '')) +
      tx(60, 84, m ? `détection ${Math.ceil(c.state.motion)} s` : 'toucher = mouvement', 'sub') + lbl(c, 8, 94);
  },
});

def({
  type: 'minuterie', name: 'Minuterie d\'éclairage', short: 'Minuterie', cat: CATEGORIES[1], prefix: 'MN', w: 140, h: 120,
  terminals: [T('L', 30, 0, 'L', 'l'), T('N', 70, 0, 'N', 'n'), T('BP', 110, 0, 'BP'), T('S', 70, 120, 'S')],
  props: { T: { label: 'Durée', options: [[5, '5 s'], [10, '10 s'], [20, '20 s'], [60, '60 s']], def: 10 } },
  init: () => ({ t: 0, force: false }),
  stamp(c, x) {
    x.R('L', 'N', 50000);
    x.R('BP', 'N', 20000);
    if (c._pow && (c.state.t > 0 || c.state.force)) x.R('L', 'S', CL);
  },
  update(c, r) {
    let ch = false;
    const p = r.vd(c, 'L', 'N') > 150;
    if (p !== !!c._pow) { c._pow = p; ch = true; }
    if (r.vd(c, 'BP', 'N') > 150) { if (c.state.t <= 0) ch = true; c.state.t = +c.props.T; }
    return ch;
  },
  tick(c, dt) { if (c.state.t > 0) c.state.t = Math.max(0, c.state.t - dt); },
  act(c, a, ph) { if (ph === 'tap' && a === 'force') { c.state.force = !c.state.force; return true; } return false; },
  set(c, v) { c.state.force = !!v; },
  out: (c) => c.state.t > 0 || c.state.force,
  draw(c, d) {
    const s = c.state;
    return body(d) + rc(14, 30, 112, 34, 'screen', 4) +
      tx(70, 52, s.force ? 'MARCHE FORCÉE' : s.t > 0 ? `⏲ ${Math.ceil(s.t)} s` : 'repos', 'scr') +
      act('force', rc(40, 72, 60, 18, s.force ? 'smallbtn on' : 'smallbtn', 4) + tx(70, 85, 'Forcé', 'kt small')) + lbl(c, 10, 110);
  },
});

def({
  type: 'inv_volet', name: 'Inverseur de volet roulant', short: 'Inverseur volet', cat: CATEGORIES[1], prefix: 'S', w: 120, h: 90,
  terminals: [T('UP', 20, 90, '↑'), T('L', 60, 90, 'L'), T('DN', 100, 90, '↓')],
  init: () => ({ s: 'stop' }),
  stamp(c, x) { if (c.state.s === 'up') x.R('L', 'UP', CL); if (c.state.s === 'down') x.R('L', 'DN', CL); },
  act(c, a, ph) { if (ph === 'tap' && ['up', 'stop', 'down'].includes(a)) { c.state.s = a; return true; } return false; },
  set(c, v) { c.state.s = v; },
  out: (c) => c.state.s,
  draw(c, d) {
    const s = c.state.s;
    const b = (n, x, sym) => act(n, rc(x, 22, 30, 36, 'vbtn' + (s === n ? ' on' : ''), 4) + tx(x + 15, 45, sym, 'kt'));
    return body(d) + lbl(c, 8, 16) + b('up', 12, '▲') + b('stop', 45, '■') + b('down', 78, '▼');
  },
});

// ======================= COMMANDE INDUSTRIELLE =======================
def({
  type: 'bp_no', name: 'Bouton poussoir marche (NO)', short: 'BP marche', cat: CATEGORIES[2], prefix: 'S', w: 80, h: 100,
  terminals: [T('3', 40, 0, '13'), T('4', 40, 100, '14')],
  init: () => ({ pressed: false }),
  stamp(c, x) { if (c.state.pressed) x.R('3', '4', CL); },
  act: pushAct,
  set(c, v) { c.state.pressed = !!v; },
  out: (c) => c.state.pressed,
  draw(c, d) {
    const p = c.state.pressed;
    return body(d) + lbl(c, 6, 32) + ln(40, 8, 40, 24, 'sym thin') + ln(40, 78, 40, 92, 'sym thin') +
      act('push', rc(18, 28, 44, 44, 'bphead', 6) + ci(40, 50, p ? 14 : 16, 'bpg' + (p ? ' on' : '')) + tx(40, 55, 'I', 'kt light'));
  },
});

def({
  type: 'bp_nc', name: 'Bouton poussoir arrêt (NF)', short: 'BP arrêt', cat: CATEGORIES[2], prefix: 'S', w: 80, h: 100,
  terminals: [T('1', 40, 0, '11'), T('2', 40, 100, '12')],
  init: () => ({ pressed: false }),
  stamp(c, x) { if (!c.state.pressed) x.R('1', '2', CL); },
  act: pushAct,
  set(c, v) { c.state.pressed = !!v; },
  out: (c) => c.state.pressed,
  draw(c, d) {
    const p = c.state.pressed;
    return body(d) + lbl(c, 6, 32) + ln(40, 8, 40, 24, 'sym thin') + ln(40, 78, 40, 92, 'sym thin') +
      act('push', rc(18, 28, 44, 44, 'bphead', 6) + ci(40, 50, p ? 14 : 16, 'bpr' + (p ? ' on' : '')) + tx(40, 55, 'O', 'kt light'));
  },
});

def({
  type: 'au', name: 'Arrêt d\'urgence (coup de poing)', short: 'Arrêt urgence', cat: CATEGORIES[2], prefix: 'S', w: 100, h: 100,
  terminals: [T('1', 50, 0, '11'), T('2', 50, 100, '12')],
  init: () => ({ latched: false }),
  stamp(c, x) { if (!c.state.latched) x.R('1', '2', CL); },
  act(c, a, ph) { if (ph === 'tap' && a === 'push') { c.state.latched = !c.state.latched; return true; } return false; },
  set(c, v) { c.state.latched = !!v; },
  out: (c) => c.state.latched,
  draw(c, d) {
    const l = c.state.latched;
    return body(d) + lbl(c, 6, 22) + act('push', ci(50, 52, 30, 'aubase') + ci(50, 52, l ? 18 : 21, 'aumush' + (l ? ' on' : ''))) +
      tx(50, 92, l ? 'verrouillé' : 'STOP', 'sub');
  },
});

def({
  type: 'fdc', name: 'Fin de course (NF + NO)', short: 'Fin de course', cat: CATEGORIES[2], prefix: 'S', w: 100, h: 100,
  terminals: [T('1', 30, 0, '11'), T('2', 30, 100, '12'), T('3', 70, 0, '13'), T('4', 70, 100, '14')],
  init: () => ({ on: false }),
  stamp(c, x) { if (c.state.on) x.R('3', '4', CL); else x.R('1', '2', CL); },
  act(c, a, ph) { if (ph === 'tap' && a === 'lever') { c.state.on = !c.state.on; return true; } return false; },
  set(c, v) { c.state.on = !!v; },
  out: (c) => c.state.on,
  draw(c, d) {
    const o = c.state.on;
    return body(d) + cv(30, 26, 76, !o, true) + cv(70, 26, 76, o) +
      act('lever', rc(40, 36, 20, 30, 'hit') + `<line class="sym roller" x1="50" y1="64" x2="${o ? 50 : 60}" y2="${o ? 40 : 42}"/>` + ci(o ? 50 : 60, o ? 38 : 40, 5, 'pdot')) +
      tx(50, 92, c.label, 'lbl small', 'middle');
  },
});

// ======================= CONTACTEURS & RELAIS =======================
const COIL_OPTS = [[230, '230 V ~'], [24, '24 V ~'], [400, '400 V ~']];
function relayLike(type, name, short, prefix, poles) {
  const w = poles ? 280 : 180;
  const aux = poles ? [170, 200, 230, 260] : [70, 100, 130, 160];
  const terms = [T('A1', 20, 0, 'A1'), T('A2', 20, 140, 'A2')];
  if (poles) [['1', '2', 70], ['3', '4', 100], ['5', '6', 130]].forEach(([a, b, x]) => terms.push(T(a, x, 0), T(b, x, 140)));
  [['13', '14'], ['21', '22'], ['33', '34'], ['41', '42']].forEach(([a, b], i) => terms.push(T(a, aux[i], 0), T(b, aux[i], 140)));
  def({
    type, name, short, cat: CATEGORIES[3], prefix, w, h: 140,
    terminals: terms,
    props: { V: { label: 'Tension bobine', options: COIL_OPTS, def: 230 } },
    init: () => ({ en: false, burnt: false }),
    stamp(c, x) {
      if (!c.state.burnt) x.R('A1', 'A2', coilR(+c.props.V), 'coil');
      const e = c.state.en;
      if (e) {
        if (poles) { x.R('1', '2', CL, 'p1'); x.R('3', '4', CL, 'p2'); x.R('5', '6', CL, 'p3'); }
        x.R('13', '14', CL); x.R('33', '34', CL);
      } else { x.R('21', '22', CL); x.R('41', '42', CL); }
    },
    update(c, r, e) { return coilUpdate(c, r, e, +c.props.V); },
    act(c, a, ph) { if (ph === 'tap' && a === 'repair' && c.state.burnt) { c.state.burnt = false; return true; } return false; },
    out: (c) => c.state.en,
    draw(c, d) {
      const e = c.state.en;
      let s = coil(20, 26, 114, e, c.state.burnt) + tx(20, 132 - 6, '', 't');
      if (poles) [70, 100, 130].forEach((x) => { s += cv(x, 26, 114, e); });
      s += cv(aux[0], 26, 114, e) + cv(aux[1], 26, 114, !e, true) + cv(aux[2], 26, 114, e) + cv(aux[3], 26, 114, !e, true);
      s += `<line class="sym dash" x1="31" y1="70" x2="${w - 12}" y2="70"/>`;
      return body(d) + s + tx(20, 106, c.label, 'lbl small', 'middle') + tx(w - 8, 106, `${c.props.V} V`, 'sub', 'end') +
        (c.state.burnt ? act('repair', tx(w / 2, 106, 'bobine HS – remplacer', 'warnt small')) : '');
    },
  });
}
relayLike('contacteur', 'Contacteur tripolaire + auxiliaires', 'Contacteur', 'KM', true);
relayLike('relais', 'Relais auxiliaire (4 contacts)', 'Relais', 'KA', false);

def({
  type: 'relais_tempo', name: 'Relais temporisé', short: 'Relais tempo', cat: CATEGORIES[3], prefix: 'KA', w: 140, h: 140,
  terminals: [T('A1', 20, 0, 'A1'), T('A2', 20, 140, 'A2'), T('15', 90, 0, '15'), T('16', 70, 140, '16'), T('18', 110, 140, '18')],
  props: {
    V: { label: 'Tension bobine', options: COIL_OPTS, def: 230 },
    delay: { label: 'Temporisation', options: [[1, '1 s'], [2, '2 s'], [3, '3 s'], [5, '5 s'], [10, '10 s']], def: 3 },
    mode: { label: 'Type', options: [['travail', 'Travail (retard à l\'enclenchement)'], ['repos', 'Repos (retard au déclenchement)']], def: 'travail' },
  },
  init: () => ({ en: false, burnt: false, sw: false, t: 0 }),
  stamp(c, x) {
    if (!c.state.burnt) x.R('A1', 'A2', coilR(+c.props.V), 'coil');
    x.R('15', c.state.sw ? '18' : '16', CL);
  },
  update(c, r, e) {
    const ch = coilUpdate(c, r, e, +c.props.V);
    if (ch) {
      if (c.props.mode === 'repos') { if (c.state.en) { c.state.sw = true; c.state.t = 0; } }
      else if (!c.state.en) { c.state.sw = false; c.state.t = 0; }
    }
    return ch;
  },
  tick(c, dt) {
    const s = c.state, D = +c.props.delay;
    if (c.props.mode === 'repos') {
      if (!s.en && s.sw) { s.t += dt; if (s.t >= D - 1e-9) { s.sw = false; s.t = 0; } }
    } else if (s.en && !s.sw) { s.t += dt; if (s.t >= D - 1e-9) { s.sw = true; s.t = 0; } }
  },
  act: DEFS.relais.act,
  out: (c, sub) => (sub === 'coil' ? c.state.en : c.state.sw),
  draw(c, d) {
    const s = c.state;
    const ex = s.sw ? 108 : 72;
    const sym = ln(90, 26, 90, 58) + `<line class="sym blade on" x1="90" y1="58" x2="${ex}" y2="88"/>` +
      ln(70, 88, 70, 114) + ln(110, 88, 110, 114) + ln(66, 88, 74, 88) + ln(106, 88, 114, 88) +
      `<path class="sym thin" d="M84 40 a8 8 0 0 1 12 0"/>`;
    const timing = (s.en && !s.sw && c.props.mode !== 'repos') || (!s.en && s.sw && c.props.mode === 'repos');
    return body(d) + coil(20, 26, 114, s.en, s.burnt, true) + sym +
      tx(20, 128 - 2, '', 't') + tx(128, 38, c.props.delay + ' s', 'sub', 'end') +
      (timing ? tx(128, 54, '⏱ ' + (c.props.delay - s.t).toFixed(1), 'scr dark', 'end') : '') +
      tx(46, 128, c.label, 'lbl small', 'middle');
  },
});

def({
  type: 'telerupteur', name: 'Télérupteur', short: 'Télérupteur', cat: CATEGORIES[3], prefix: 'KL', w: 120, h: 120,
  terminals: [T('A1', 20, 0, 'A1'), T('A2', 20, 120, 'A2'), T('1', 90, 0, '1'), T('2', 90, 120, '2')],
  props: { V: { label: 'Tension bobine', options: COIL_OPTS, def: 230 } },
  init: () => ({ en: false, burnt: false, on: false }),
  stamp(c, x) { if (!c.state.burnt) x.R('A1', 'A2', coilR(+c.props.V), 'coil'); if (c.state.on) x.R('1', '2', CL); },
  update(c, r, e) {
    const was = c.state.en;
    const ch = coilUpdate(c, r, e, +c.props.V);
    if (ch && !was && c.state.en) c.state.on = !c.state.on;
    return ch;
  },
  act(c, a, ph) {
    if (ph !== 'tap') return false;
    if (a === 'lever') { c.state.on = !c.state.on; return true; }
    return DEFS.relais.act(c, a, ph);
  },
  out: (c) => c.state.on,
  draw(c, d) {
    return body(d) + coil(20, 26, 94, c.state.en, c.state.burnt) + cv(90, 26, 94, c.state.on) +
      `<line class="sym dash" x1="31" y1="60" x2="82" y2="60"/>` +
      act('lever', rc(44, 30, 24, 18, c.state.on ? 'smallbtn on' : 'smallbtn', 3) + tx(56, 43, '⇅', 'kt small')) +
      tx(60, 110, c.label, 'lbl small', 'middle');
  },
});

// ======================= RÉCEPTEURS =======================
def({
  type: 'lampe', name: 'Lampe', short: 'Lampe', cat: CATEGORIES[4], prefix: 'H', w: 80, h: 100,
  terminals: [T('1', 20, 100, '1'), T('2', 60, 100, '2')],
  props: { V: { label: 'Tension', options: VOLT_OPTS, def: 230 }, P: { label: 'Puissance', options: [[25, '25 W'], [60, '60 W'], [100, '100 W']], def: 60 } },
  init: () => ({ burnt: false }),
  stamp(c, x) { if (!c.state.burnt) x.R('1', '2', c.props.V * c.props.V / c.props.P); },
  update(c, r, e) {
    const [ta, tb] = DEFS[c.type].terminals;
    const v = r.vd(c, ta.id, tb.id);
    c._b = Math.min(1.4, (v / c.props.V) ** 2);
    if (!c.state.burnt && v > 1.4 * c.props.V) {
      c.state.burnt = true; c._b = 0;
      e.event('danger', `${c.label} : lampe grillée (${Math.round(v)} V sur une lampe ${c.props.V} V).`, c.id);
      return true;
    }
    return false;
  },
  act(c, a, ph) { if (ph === 'tap' && a === 'repair' && c.state.burnt) { c.state.burnt = false; return true; } return false; },
  out: (c) => !c.state.burnt && (c._b || 0) > 0.5,
  draw(c, d) {
    const b = c.state.burnt ? 0 : Math.min(1, c._b || 0);
    return body(d) + lbl(c, 8, 18) +
      (b > 0.03 ? ci(40, 46, 44, 'glow', `style="opacity:${b.toFixed(2)}"`) : '') +
      ln(20, 92, 20, 70, 'sym thin') + ln(60, 92, 60, 70, 'sym thin') + ln(20, 70, 30, 62, 'sym thin') + ln(60, 70, 50, 62, 'sym thin') +
      ci(40, 44, 21, 'bulb' + (c.state.burnt ? ' burnt' : ''), b > 0.03 ? `style="fill:rgba(255,${200 + Math.round(40 * b)},${Math.round(90 * b)},${(0.25 + 0.75 * b).toFixed(2)})"` : '') +
      ln(25, 29, 55, 59, 'sym thin') + ln(55, 29, 25, 59, 'sym thin') + tx(74, 18, c.props.V + 'V', 'sub', 'end') +
      (c.state.burnt ? act('repair', tx(40, 84, 'grillée', 'warnt small')) : '');
  },
});

const VOY_COL = { vert: '#22c55e', rouge: '#ef4444', orange: '#f59e0b', blanc: '#f8fafc', bleu: '#3b82f6' };
def({
  type: 'voyant', name: 'Voyant lumineux', short: 'Voyant', cat: CATEGORIES[4], prefix: 'H', w: 60, h: 110,
  terminals: [T('X1', 30, 0, 'X1'), T('X2', 30, 110, 'X2')],
  props: { V: { label: 'Tension', options: VOLT_OPTS, def: 230 }, col: { label: 'Couleur', options: [['vert', 'Vert'], ['rouge', 'Rouge'], ['orange', 'Orange'], ['blanc', 'Blanc'], ['bleu', 'Bleu']], def: 'vert' } },
  init: () => ({ burnt: false }),
  stamp(c, x) { if (!c.state.burnt) x.R('X1', 'X2', c.props.V * c.props.V / 1.5); },
  update: DEFS.lampe.update,
  act: DEFS.lampe.act,
  out: DEFS.lampe.out,
  draw(c, d) {
    const b = c.state.burnt ? 0 : Math.min(1, c._b || 0);
    const col = VOY_COL[c.props.col] || '#22c55e';
    return body(d) + ln(30, 8, 30, 34, 'sym thin') + ln(30, 70, 30, 102, 'sym thin') +
      (b > 0.1 ? ci(30, 52, 30, 'glow2', `style="fill:${col};opacity:${(0.45 * b).toFixed(2)}"`) : '') +
      ci(30, 52, 16, 'voy', `style="fill:${col};opacity:${(0.25 + 0.75 * b).toFixed(2)}"`) + ln(19, 41, 41, 63, 'sym thin') + ln(41, 41, 19, 63, 'sym thin') +
      tx(30, 86, c.label, 'lbl small', 'middle');
  },
});

def({
  type: 'sonnerie', name: 'Sonnerie', short: 'Sonnerie', cat: CATEGORIES[4], prefix: 'B', w: 80, h: 100,
  terminals: [T('1', 20, 100, '1'), T('2', 60, 100, '2')],
  props: { V: { label: 'Tension', options: VOLT_OPTS, def: 230 } },
  init: () => ({ burnt: false }),
  stamp(c, x) { if (!c.state.burnt) x.R('1', '2', c.props.V * c.props.V / 8); },
  update: DEFS.lampe.update,
  act: DEFS.lampe.act,
  out: DEFS.lampe.out,
  draw(c, d) {
    const on = !c.state.burnt && (c._b || 0) > 0.5;
    return body(d) + lbl(c, 8, 18) + `<path class="bell${on ? ' on' : ''}" d="M24 66 h32 l-4 -6 v-16 a12 12 0 0 0 -24 0 v16 z"/>` + ci(40, 70, 4, 'pdot') +
      (on ? `<path class="waves" d="M16 36 q-6 10 0 20 M64 36 q6 10 0 20 M10 30 q-10 16 0 32 M70 30 q10 16 0 32"/>` : '') +
      ln(20, 92, 20, 80, 'sym thin') + ln(60, 92, 60, 80, 'sym thin');
  },
});

def({
  type: 'prise', name: 'Prise de courant 2P+T', short: 'Prise 2P+T', cat: CATEGORIES[4], prefix: 'X', w: 120, h: 100, earth: 'PE',
  terminals: [T('L', 30, 100, 'L', 'l'), T('N', 60, 100, 'N', 'n'), T('PE', 90, 100, 'PE', 'pe')],
  props: { P: { label: 'Appareil branché', options: [[500, '500 W'], [1000, '1000 W'], [2000, '2000 W'], [3500, '3500 W']], def: 1000 } },
  init: () => ({ plugged: false }),
  stamp(c, x) { if (c.state.plugged) x.R('L', 'N', 230 * 230 / c.props.P); },
  update(c, r) { c._v = r.vd(c, 'L', 'N'); return false; },
  act(c, a, ph) { if (ph === 'tap' && a === 'plug') { c.state.plugged = !c.state.plugged; return true; } return false; },
  set(c, v) { c.state.plugged = !!v; },
  out: (c) => (c._v || 0) > 180,
  draw(c, d) {
    const p = c.state.plugged, v = c._v || 0;
    return body(d) + lbl(c, 8, 18) + tx(112, 18, v > 5 ? Math.round(v) + ' V' : '0 V', v > 180 ? 'sub ok' : 'sub', 'end') +
      act('plug', ci(60, 50, 28, 'socket') + ci(48, 52, 4, 'hole') + ci(72, 52, 4, 'hole') + rc(57, 26, 6, 9, 'pin', 2) +
        (p ? ci(60, 50, 22, 'plug') + tx(60, 54, c.props.P + 'W', 'kt light small') : '')) +
      tx(60, 90, p ? (v > 180 ? 'appareil en marche' : 'appareil branché') : 'toucher = brancher', 'sub');
  },
});

def({
  type: 'radiateur', name: 'Radiateur / résistance chauffante', short: 'Radiateur', cat: CATEGORIES[4], prefix: 'R', w: 140, h: 100, earth: 'PE',
  terminals: [T('1', 30, 100, '1'), T('2', 70, 100, '2'), T('PE', 110, 100, 'PE', 'pe')],
  props: { V: { label: 'Tension', options: [[230, '230 V'], [400, '400 V']], def: 230 }, P: { label: 'Puissance', options: [[1000, '1000 W'], [2000, '2000 W'], [3000, '3000 W']], def: 2000 } },
  init: () => ({}),
  stamp(c, x) { x.R('1', '2', c.props.V * c.props.V / c.props.P); },
  update(c, r) { c._b = (r.vd(c, '1', '2') / c.props.V) ** 2; return false; },
  out: (c) => (c._b || 0) > 0.5,
  draw(c, d) {
    const b = Math.min(1, c._b || 0);
    let f = '';
    for (let i = 0; i < 6; i++) f += rc(18 + i * 18, 26, 12, 50, 'fin', 4, b > 0.05 ? `style="fill:rgb(${150 + Math.round(105 * b)},${90 - Math.round(50 * b)},${60 - Math.round(40 * b)})"` : '');
    return body(d) + lbl(c, 8, 18) + tx(132, 18, `${c.props.P} W`, 'sub', 'end') + f;
  },
});

// ======================= MOTEURS =======================
function motorEval(c, r) {
  const Vn = +c.props.Vn;
  const vs = [r.vdx(c, 'U1', 'U2'), r.vdx(c, 'V1', 'V2'), r.vdx(c, 'W1', 'W2')];
  const m = vs.map(cabs);
  const mx = Math.max(...m), mn = Math.min(...m);
  if (c.state.burnt) return { st: 'hs', m };
  if (mx < 0.2 * Vn) return { st: 'stop', m };
  if (mn > 0.45 * Vn && mx / mn < 1.3) {
    const ang = carg(cdiv(vs[1], vs[0]));
    const avg = (m[0] + m[1] + m[2]) / 3;
    return { st: 'run', dir: ang < 0 ? 'avant' : 'arriere', coupling: avg < 300 ? 'etoile' : 'triangle', avg, m };
  }
  return { st: 'defaut', m };
}
def({
  type: 'moteur_3', name: 'Moteur asynchrone triphasé', short: 'Moteur 3~', cat: CATEGORIES[5], prefix: 'M', w: 200, h: 220, earth: 'PE',
  terminals: [T('U1', 50, 40), T('V1', 100, 40), T('W1', 150, 40), T('W2', 50, 90), T('U2', 100, 90), T('V2', 150, 90), T('PE', 180, 190, 'PE', 'pe')],
  props: {
    Vn: { label: 'Plaque signalétique', options: [[230, '230 V Δ / 400 V Y'], [400, '400 V Δ / 690 V Y']], def: 230 },
    P: { label: 'Puissance', options: [[750, '0,75 kW'], [1500, '1,5 kW'], [3000, '3 kW']], def: 1500 },
  },
  init: () => ({ surcharge: false, burnt: false, ov: 0 }),
  stamp(c, x) {
    if (c.state.burnt) return;
    const R = 3 * c.props.Vn * c.props.Vn / c.props.P / (c.state.surcharge ? 2 : 1);
    x.R('U1', 'U2', R, 'wu'); x.R('V1', 'V2', R, 'wv'); x.R('W1', 'W2', R, 'ww');
  },
  update(c, r) { c._m = motorEval(c, r); return false; },
  tick(c, dt, r, e) {
    const m = c._m;
    if (!m || c.state.burnt) return;
    if (Math.max(...m.m) > 1.25 * c.props.Vn) {
      c.state.ov += dt;
      if (c.state.ov > 3) {
        c.state.burnt = true;
        e.event('danger', `${c.label} grillé : surtension sur les enroulements (${Math.round(Math.max(...m.m))} V pour ${c.props.Vn} V). Vérifiez le couplage étoile / triangle !`, c.id);
      }
    } else c.state.ov = 0;
    if (m.st === 'defaut' && !c._warned) { c._warned = true; e.event('warn', `${c.label} : alimentation déséquilibrée ou phase manquante – le moteur ne peut pas démarrer.`, c.id); }
    if (m.st !== 'defaut') c._warned = false;
  },
  act(c, a, ph) {
    if (ph !== 'tap') return false;
    if (a === 'load') { c.state.surcharge = !c.state.surcharge; return true; }
    if (a === 'repair' && c.state.burnt) { c.state.burnt = false; c.state.ov = 0; return true; }
    return false;
  },
  set(c, v) { c.state.surcharge = !!v; },
  out(c, sub) {
    const m = c._m || { st: 'stop' };
    if (sub === 'couplage') return m.st === 'run' ? m.coupling : null;
    return m.st === 'run' ? m.dir : m.st;
  },
  draw(c, d) {
    const m = c._m || { st: 'stop' };
    const run = m.st === 'run';
    const spin = run ? (m.dir === 'avant' ? 'spin' : 'spin rev') : '';
    const label = { stop: 'Arrêt', defaut: '⚠ Défaut alim.', hs: '✕ Grillé', run: m.dir === 'avant' ? 'Marche AV ↻' : 'Marche AR ↺' }[m.st];
    const coup = run ? (m.coupling === 'etoile' ? 'Couplage étoile Y' : 'Couplage triangle Δ') + ` · ${Math.round(m.avg)} V` : '';
    return body(d, 'motor') + lbl(c, 8, 16) + tx(192, 16, `${c.props.P / 1000} kW`, 'sub', 'end') + rc(24, 22, 152, 98, 'plateb', 6) +
      ci(64, 166, 32, 'mframe' + (m.st === 'hs' ? ' burnt' : '')) +
      `<g class="${spin}"><path class="rotor" d="M64 140 l6 22 -6 4 -6 -4 z M64 192 l-6 -22 6 -4 6 4 z M38 166 l22 -6 4 6 -4 6 z M90 166 l-22 6 -4 -6 4 -6 z"/></g>` +
      ci(64, 166, 6, 'pdot') + tx(64, 213, 'M 3~', 'sub') +
      tx(104, 146, label, run ? 'st ok' : m.st === 'stop' ? 'st' : 'st bad', 'start') + tx(104, 162, coup, 'sub', 'start') +
      act(m.st === 'hs' ? 'repair' : 'load', rc(104, 170, 60, 18, c.state.surcharge ? 'smallbtn warn' : 'smallbtn', 4) +
        tx(134, 183, m.st === 'hs' ? 'Remplacer' : c.state.surcharge ? 'Surcharge !' : 'Charge OK', 'kt small'));
  },
});

def({
  type: 'moteur_1', name: 'Moteur monophasé', short: 'Moteur 1~', cat: CATEGORIES[5], prefix: 'M', w: 120, h: 120, earth: 'PE',
  terminals: [T('1', 30, 0, '1'), T('2', 60, 0, '2'), T('PE', 90, 0, 'PE', 'pe')],
  props: { V: { label: 'Tension', options: [[230, '230 V'], [24, '24 V']], def: 230 }, P: { label: 'Puissance', options: [[370, '0,37 kW'], [750, '0,75 kW']], def: 750 } },
  init: () => ({}),
  stamp(c, x) { x.R('1', '2', c.props.V * c.props.V / c.props.P, 'w'); },
  update(c, r) { c._v = r.vd(c, '1', '2'); return false; },
  out: (c) => (c._v || 0) > 0.7 * c.props.V,
  draw(c, d) {
    const run = (c._v || 0) > 0.7 * c.props.V;
    return body(d, 'motor') + ci(60, 64, 28, 'mframe') +
      `<g class="${run ? 'spin' : ''}"><path class="rotor" d="M60 40 l6 20 -6 4 -6 -4 z M60 88 l-6 -20 6 -4 6 4 z M36 64 l20 -6 4 6 -4 6 z M84 64 l-20 6 -4 -6 4 -6 z"/></g>` +
      ci(60, 64, 5, 'pdot') + tx(8, 112, c.label, 'lbl small', 'start') + tx(112, 112, run ? 'Marche' : 'Arrêt', run ? 'st ok' : 'st', 'end');
  },
});

def({
  type: 'volet', name: 'Moteur de volet roulant', short: 'Volet roulant', cat: CATEGORIES[5], prefix: 'M', w: 140, h: 150, earth: 'PE',
  terminals: [T('N', 30, 0, 'N', 'n'), T('UP', 60, 0, '↑'), T('DN', 90, 0, '↓'), T('PE', 120, 0, 'PE', 'pe')],
  init: () => ({ pos: 50 }),
  stamp(c, x) {
    if (c.state.pos < 100) x.R('UP', 'N', 230 * 230 / 150, 'up');
    if (c.state.pos > 0) x.R('DN', 'N', 230 * 230 / 150, 'dn');
  },
  update(c, r) {
    const u = r.vd(c, 'UP', 'N') > 150, dn = r.vd(c, 'DN', 'N') > 150;
    c._s = u && dn ? 'conflit' : u ? 'montee' : dn ? 'descente' : 'arret';
    return false;
  },
  tick(c, dt, r, e) {
    const s = c.state;
    if (c._s === 'montee') s.pos = Math.min(100, s.pos + dt * 20);
    if (c._s === 'descente') s.pos = Math.max(0, s.pos - dt * 20);
    if (c._s === 'conflit' && !c._warned) { c._warned = true; e.event('danger', `${c.label} : montée ET descente alimentées en même temps ! Risque de destruction du moteur.`, c.id); }
    if (c._s !== 'conflit') c._warned = false;
  },
  out: (c) => c._s || 'arret',
  draw(c, d) {
    const p = c.state.pos;
    const hgt = Math.round(84 * (1 - p / 100));
    let slats = '';
    for (let y = 30; y < 30 + hgt; y += 7) slats += rc(20, y, 100, Math.min(6, 30 + hgt - y), 'slat');
    const s = c._s || 'arret';
    return body(d) + rc(16, 26, 108, 92, 'window', 3) + slats +
      tx(70, 136, { montee: '▲ montée', descente: '▼ descente', arret: `arrêt · ouvert ${Math.round(p)} %`, conflit: '⚠ conflit' }[s], s === 'conflit' ? 'st bad' : 'st', 'middle') +
      tx(8, 148 - 2, '', 't') + lbl(c, 132, 136, 'end');
  },
});

// ======================= DIVERS =======================
def({
  type: 'bornier', name: 'Borne de connexion (4 points)', short: 'Borne', cat: CATEGORIES[6], prefix: 'X', w: 100, h: 40,
  terminals: [T('a', 30, 0, ''), T('b', 70, 0, ''), T('c', 30, 40, ''), T('d', 70, 40, '')],
  stamp(c, x) { x.link('a', 'b'); x.link('a', 'c'); x.link('a', 'd'); },
  draw(c, d) { return body(d, 'borne') + rc(22, 16, 56, 8, 'bar', 3) + tx(92, 24, c.label, 'sub', 'end'); },
});

// Instancie un composant
let uidN = 0;
export function makeComp(type, x, y, id, label, props) {
  const d = DEFS[type];
  const p = {};
  for (const [k, v] of Object.entries(d.props)) p[k] = v.def;
  Object.assign(p, props || {});
  return { id: id || 'c' + Date.now().toString(36) + (uidN++).toString(36), type, x, y, label: label || d.prefix, props: p, state: d.init() };
}
