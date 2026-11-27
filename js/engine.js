// Moteur de simulation : construit le réseau électrique à partir des composants et des fils,
// le résout en régime sinusoïdal (analyse nodale modifiée, phaseurs complexes) puis fait évoluer
// l'état des composants (bobines, protections, temporisations...) jusqu'à stabilité.
import { DEFS, RINT } from './components.js';
import { solveComplex } from './solver.js';

const LEAK = 1e-9; // fuite vers la terre pour éviter les nœuds flottants

export class Engine {
  constructor(circuit) {
    this.circuit = circuit;
    this.time = 0;
    this.events = [];
    this.seq = 0;
    this.res = null;
    this.unstable = false;
  }

  event(level, text, cid) {
    this.events.push({ id: ++this.seq, t: this.time, level, text, cid });
    if (this.events.length > 300) this.events.shift();
  }

  build() {
    const comps = this.circuit.components;
    const parent = new Map();
    const find = (k) => {
      let p = parent.get(k);
      if (p === undefined) { parent.set(k, k); return k; }
      if (p === k) return k;
      const r = find(p);
      parent.set(k, r);
      return r;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    find('GND');
    for (const c of comps) for (const t of DEFS[c.type].terminals) find(c.id + ':' + t.id);
    for (const w of this.circuit.wires) if (parent.has(w.a) && parent.has(w.b)) union(w.a, w.b);

    const conds = [], injs = [], xfs = [];
    const srcs = new Map(), named = new Map();
    for (const c of comps) {
      const d = DEFS[c.type];
      if (!d.stamp) continue;
      const K = (x) => (x === 'GND' ? 'GND' : x.includes('#') ? x : c.id + ':' + x);
      const ctx = {
        R: (a, b, ohm, name) => {
          const o = { a: K(a), b: K(b), g: 1 / ohm };
          conds.push(o);
          if (name) named.set(c.id + '.' + name, o);
        },
        src: (a, mag, deg, name) => {
          const k = K(a), rad = deg * Math.PI / 180;
          const vr = mag * Math.cos(rad), vi = mag * Math.sin(rad);
          injs.push({ a: k, re: vr / RINT, im: vi / RINT });
          conds.push({ a: k, b: 'GND', g: 1 / RINT });
          srcs.set(c.id + '.' + name, { k, vr, vi });
        },
        link: (a, b) => union(K(a), K(b)),
        node: (n) => { const k = c.id + '#' + n; find(k); return k; },
        xf: (p1, p2, s1, s2, r) => xfs.push({ p1: K(p1), p2: K(p2), s1: K(s1), s2: K(s2), r }),
      };
      d.stamp(c, ctx);
    }

    const idx = new Map();
    idx.set(find('GND'), 0);
    let n = 0;
    const ix = (k) => {
      const r = find(k);
      let i = idx.get(r);
      if (i === undefined) { i = ++n; idx.set(r, i); }
      return i;
    };
    for (const o of conds) { o.ia = ix(o.a); o.ib = ix(o.b); }
    for (const j of injs) j.ia = ix(j.a);
    for (const x of xfs) { x.i1 = ix(x.p1); x.i2 = ix(x.p2); x.i3 = ix(x.s1); x.i4 = ix(x.s2); }

    const N = n + xfs.length;
    const Are = new Float64Array(N * N), Aim = new Float64Array(N * N);
    const bre = new Float64Array(N), bim = new Float64Array(N);
    for (let i = 0; i < n; i++) Are[i * N + i] += LEAK;
    for (const o of conds) {
      const a = o.ia - 1, b = o.ib - 1, g = o.g;
      if (a === b) continue;
      if (a >= 0) Are[a * N + a] += g;
      if (b >= 0) Are[b * N + b] += g;
      if (a >= 0 && b >= 0) { Are[a * N + b] -= g; Are[b * N + a] -= g; }
    }
    for (const j of injs) { const a = j.ia - 1; if (a >= 0) { bre[a] += j.re; bim[a] += j.im; } }
    xfs.forEach((x, j) => {
      const k = n + j;
      const put = (row, col, val) => { if (row >= 0 && col >= 0) Are[row * N + col] += val; };
      const p1 = x.i1 - 1, p2 = x.i2 - 1, s1 = x.i3 - 1, s2 = x.i4 - 1;
      put(s1, k, 1); put(s2, k, -1); put(p1, k, -x.r); put(p2, k, x.r);
      put(k, s1, 1); put(k, s2, -1); put(k, p1, -x.r); put(k, p2, x.r);
      Are[k * N + k] += 1e-12;
    });
    const [xr, xi] = N ? solveComplex(N, Are, Aim, bre, bim) : [new Float64Array(0), new Float64Array(0)];

    const V = (i) => (i ? [xr[i - 1], xi[i - 1]] : [0, 0]);
    const vk = (k) => { const i = idx.get(find(k)); return i === undefined ? [0, 0] : V(i); };
    const res = {
      v: vk,
      vt: (c, t) => vk(c.id + ':' + t),
      vdx: (c, a, b) => { const p = vk(c.id + ':' + a), q = vk(c.id + ':' + b); return [p[0] - q[0], p[1] - q[1]]; },
      vd: (c, a, b) => Math.hypot(...res.vdx(c, a, b)),
      icx: (c, name) => {
        const o = named.get(c.id + '.' + name);
        if (!o) return [0, 0];
        const p = V(o.ia), q = V(o.ib);
        return [(p[0] - q[0]) * o.g, (p[1] - q[1]) * o.g];
      },
      ic: (c, name) => Math.hypot(...res.icx(c, name)),
      isrc: (c, name) => {
        const s = srcs.get(c.id + '.' + name);
        if (!s) return 0;
        const p = vk(s.k);
        return Math.hypot(s.vr - p[0], s.vi - p[1]) / RINT;
      },
      same: (a, b) => find(a) === find(b),
    };

    // Contrôle des terres : les masses métalliques doivent être reliées au PE d'une alimentation
    const pes = comps.filter((c) => DEFS[c.type].source).map((c) => c.id + ':PE');
    for (const c of comps) {
      const d = DEFS[c.type];
      if (d.earth) c._noEarth = !pes.some((p) => res.same(p, c.id + ':' + d.earth));
    }
    return res;
  }

  settle() {
    const comps = this.circuit.components;
    for (let iter = 0; iter < 40; iter++) {
      const res = this.build();
      this.res = res;
      // Protections contre les courts-circuits : la plus petite protection concernée déclenche (sélectivité)
      let best = null;
      for (const c of comps) {
        const d = DEFS[c.type];
        if (!d.mag) continue;
        const m = d.mag(c, res);
        if (m && (!best || m.In < best.In)) best = m;
      }
      if (best) { best.apply(this); continue; }
      let changed = false;
      for (const c of comps) {
        const d = DEFS[c.type];
        if (d.update && d.update(c, res, this)) changed = true;
      }
      if (!changed) { this.unstable = false; return true; }
    }
    if (!this.unstable) this.event('warn', 'Circuit instable : un relais « bat » (il s\'alimente et se coupe lui-même en boucle).');
    this.unstable = true;
    return false;
  }

  step(dt) {
    this.time += dt;
    if (this.res) {
      for (const c of this.circuit.components) {
        const d = DEFS[c.type];
        if (d.tick) d.tick(c, dt, this.res, this);
      }
    }
    this.settle();
  }
}
