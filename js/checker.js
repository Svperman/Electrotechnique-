// Vérification fonctionnelle d'un câblage : on rejoue un scénario (actions + contrôles)
// sur une copie du circuit et on vérifie le comportement attendu.
import { DEFS } from './components.js';
import { Engine } from './engine.js';

export function cloneCircuit(circ) {
  return JSON.parse(JSON.stringify({ components: circ.components, wires: circ.wires }, (k, v) => (k.startsWith('_') ? undefined : v)));
}

class Fail extends Error {}

export function runCheck(circuit, schema) {
  const circ = cloneCircuit(circuit);
  for (const c of circ.components) c.state = DEFS[c.type].init();
  const eng = new Engine(circ);
  eng.settle();
  const results = [];
  const find = (name) => {
    const c = circ.components.find((x) => x.label === name) || circ.components.find((x) => x.id === name);
    if (!c) throw new Fail(`Le composant « ${name} » est absent du schéma.`);
    return c;
  };
  const run = (s) => { for (let t = 0; t < s - 1e-9; t += 0.05) eng.step(0.05); };
  const parse = (n) => { const [a, sub] = n.split('.'); return [find(a), sub]; };
  const key = (k) => { const [a, t] = k.split(':'); return find(a).id + ':' + t; };
  const t = {
    set(n, v) { const [c, sub] = parse(n); DEFS[c.type].set(c, v, sub); eng.settle(); run(0.3); },
    hold(n) { t.set(n, true); },
    release(n) { t.set(n, false); },
    press(n) { t.set(n, true); t.set(n, false); },
    wait(s) { run(s); },
    out(n) { const [c, sub] = parse(n); return DEFS[c.type].out(c, sub); },
    check(cond, msg) {
      if (!cond) { results.push({ ok: false, msg }); throw new Fail(msg); }
      results.push({ ok: true, msg });
    },
    connected(a, b, msg) { t.check(eng.res.same(key(a), key(b)), msg); },
  };
  let ok = true;
  try {
    schema.test(t);
  } catch (e) {
    ok = false;
    if (!(e instanceof Fail)) results.push({ ok: false, msg: 'Erreur : ' + e.message });
    else if (!results.length || results[results.length - 1].ok) results.push({ ok: false, msg: e.message });
  }
  const faults = eng.events.filter((e) => e.level === 'danger');
  if (faults.length) {
    ok = false;
    results.push({ ok: false, msg: 'Défaut pendant l\'essai : ' + faults[0].text });
  }
  return { ok, results };
}
