// node tests/run-tests.mjs — vérifie que chaque solution de la bibliothèque passe son scénario
// et qu'un exercice non câblé échoue.
import { SCHEMAS } from '../js/library.js';
import { makeComp, DEFS } from '../js/components.js';
import { runCheck } from '../js/checker.js';
import { Engine } from '../js/engine.js';

export function buildCircuit(s, withWires) {
  const components = s.components.map((c) => makeComp(c.type, c.x, c.y, c.id, c.id, c.props));
  const wires = withWires ? s.wires.map(([a, b, color], i) => ({ id: 'w' + i, a, b, color })) : [];
  return { components, wires };
}

let fail = 0;
for (const s of SCHEMAS) {
  const circ = buildCircuit(s, true);
  // validité des bornes
  for (const w of circ.wires) for (const k of [w.a, w.b]) {
    const [cid, tid] = k.split(':');
    const c = circ.components.find((x) => x.id === cid);
    if (!c || !DEFS[c.type].tmap[tid]) { console.log(`✗ ${s.id}: borne inconnue ${k}`); fail++; }
  }
  const r = runCheck(circ, s);
  const empty = runCheck(buildCircuit(s, false), s);
  const ok = r.ok && !empty.ok;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${s.id.padEnd(16)} solution:${r.ok ? 'OK' : 'ÉCHEC'}  vide:${empty.ok ? 'PASSE (!)' : 'échoue'}`);
  if (!r.ok) for (const x of r.results) console.log('    ', x.ok ? '·' : '✗', x.msg);
}

// Courts-circuits et défauts
{
  const circ = { components: [makeComp('alim_mono', 0, 0, 'A', 'A'), makeComp('disj_1pn', 0, 0, 'Q', 'Q', { In: 16 })],
    wires: [{ a: 'A:L', b: 'Q:Lin' }, { a: 'A:N', b: 'Q:Nin' }, { a: 'Q:Lout', b: 'Q:Nout' }] };
  const e = new Engine(circ); e.settle();
  const ok = !circ.components[1].state.closed && circ.components[0].state.on && !circ.components[0].state.tripped;
  console.log(`${ok ? '✓' : '✗'} court-circuit → Q déclenche (sélectivité)`); if (!ok) fail++;
}
{
  const circ = { components: [makeComp('alim_mono', 0, 0, 'A', 'A'), makeComp('diff', 0, 0, 'ID', 'ID')],
    wires: [{ a: 'A:L', b: 'ID:Lin' }, { a: 'A:N', b: 'ID:Nin' }, { a: 'ID:Lout', b: 'A:PE' }] };
  const e = new Engine(circ); e.settle();
  const ok = !circ.components[1].state.closed;
  console.log(`${ok ? '✓' : '✗'} défaut phase/terre → différentiel déclenche`); if (!ok) fail++;
}
{
  const circ = { components: [makeComp('alim_mono', 0, 0, 'A', 'A'), makeComp('lampe', 0, 0, 'H', 'H', { V: 24 })],
    wires: [{ a: 'A:L', b: 'H:1' }, { a: 'A:N', b: 'H:2' }] };
  const e = new Engine(circ); e.settle();
  const ok = circ.components[1].state.burnt;
  console.log(`${ok ? '✓' : '✗'} lampe 24 V sur 230 V → grillée`); if (!ok) fail++;
}
console.log(fail ? `\n${fail} échec(s)` : '\nTous les tests passent.');
process.exit(fail ? 1 : 0);
