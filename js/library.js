// Bibliothèque de schémas : chaque schéma fournit les composants, le câblage de la solution
// et un scénario de vérification fonctionnelle.

const C = (id, type, x, y, props) => ({ id, type, x, y, props });

// Alimentation monophasée + disjoncteur de tête (commun à beaucoup de schémas)
const MONO = (In = 10) => [C('ALIM', 'alim_mono', 40, 40), C('Q1', 'disj_1pn', 60, 180, { In })];
const MONO_W = [['ALIM:L', 'Q1:Lin', 'marron'], ['ALIM:N', 'Q1:Nin', 'bleu']];

// Chaque manœuvre de la séquence doit inverser l'état de la lampe
const flips = (t, seq, lamp) => {
  let exp = t.out(lamp);
  for (const [s, v] of seq) {
    t.set(s, v); exp = !exp;
    t.check(t.out(lamp) === exp, `Manœuvrer ${s} doit changer l'état de la lampe ${lamp}.`);
  }
};

export const CATS = ['Habitat – éclairage', 'Habitat – prises & appareils', 'Commande industrielle', 'Moteurs'];

export const SCHEMAS = [
  // ------------------------------------------------------------------ HABITAT ÉCLAIRAGE
  {
    id: 'simple', cat: CATS[0], level: 1, title: 'Simple allumage',
    desc: 'Commander une lampe depuis un seul endroit avec un interrupteur simple allumage.',
    consigne: 'Alimentez le disjoncteur Q1, amenez la phase à la borne L de S1, reliez la borne 1 de S1 à la lampe (fil de retour) puis ramenez le neutre directement à la lampe. Le neutre ne passe jamais par l\'interrupteur.',
    components: [...MONO(10), C('S1', 'inter', 240, 360), C('H1', 'lampe', 400, 320)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:L', 'marron'], ['S1:1', 'H1:1', 'orange'], ['Q1:Nout', 'H1:2', 'bleu']],
    test(t) {
      t.set('S1', 0); t.check(!t.out('H1'), 'S1 ouvert : la lampe H1 doit être éteinte.');
      t.set('S1', 1); t.check(t.out('H1'), 'S1 fermé : la lampe H1 doit s\'allumer.');
      t.set('Q1', 0); t.check(!t.out('H1'), 'Q1 ouvert : le circuit doit être coupé (Q1 en tête du circuit).');
      t.set('Q1', 1); t.set('S1', 0); t.check(!t.out('H1'), 'S1 ouvert : la lampe doit s\'éteindre.');
    },
  },
  {
    id: 'double', cat: CATS[0], level: 1, title: 'Double allumage',
    desc: 'Commander deux lampes indépendamment avec un seul appareil double allumage.',
    consigne: 'La phase arrive sur la borne commune L. Chaque bouton commande une sortie (1 → H1, 2 → H2). Le neutre est distribué aux deux lampes.',
    components: [...MONO(10), C('S1', 'double', 230, 360), C('H1', 'lampe', 400, 320), C('H2', 'lampe', 520, 320)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:L', 'marron'], ['S1:1', 'H1:1', 'orange'], ['S1:2', 'H2:1', 'violet'], ['Q1:Nout', 'H1:2', 'bleu'], ['H1:2', 'H2:2', 'bleu']],
    test(t) {
      t.set('S1.a', 1); t.set('S1.b', 0); t.check(t.out('H1') && !t.out('H2'), 'Bouton 1 seul : seule H1 doit s\'allumer.');
      t.set('S1.a', 0); t.set('S1.b', 1); t.check(!t.out('H1') && t.out('H2'), 'Bouton 2 seul : seule H2 doit s\'allumer.');
      t.set('S1.a', 1); t.check(t.out('H1') && t.out('H2'), 'Les deux boutons : H1 et H2 allumées.');
      t.set('S1.a', 0); t.set('S1.b', 0); t.check(!t.out('H1') && !t.out('H2'), 'Tout éteint.');
    },
  },
  {
    id: 'vv', cat: CATS[0], level: 2, title: 'Va-et-vient',
    desc: 'Commander une lampe depuis deux endroits (couloir, escalier, chambre).',
    consigne: 'Phase sur la borne L (commun) de S1. Les bornes 1 et 2 de S1 sont reliées aux bornes 1 et 2 de S2 par deux « navettes ». Le commun L de S2 part vers la lampe (retour). Neutre direct à la lampe.',
    components: [...MONO(10), C('S1', 'va_et_vient', 200, 380), C('S2', 'va_et_vient', 520, 380), C('H1', 'lampe', 380, 180)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:L', 'marron'], ['S1:1', 'S2:1', 'noir'], ['S1:2', 'S2:2', 'gris'], ['S2:L', 'H1:1', 'orange'], ['Q1:Nout', 'H1:2', 'bleu']],
    test(t) { flips(t, [['S1', 1], ['S2', 1], ['S1', 0], ['S2', 0]], 'H1'); },
  },
  {
    id: 'perm', cat: CATS[0], level: 3, title: 'Va-et-vient avec permutateur',
    desc: 'Commander une lampe depuis trois endroits : deux va-et-vient et un permutateur entre eux.',
    consigne: 'Phase sur L de S1. Les navettes de S1 arrivent sur E1/E2 du permutateur S2, ses sorties S1/S2 repartent vers les bornes 1 et 2 du va-et-vient S3. Le commun L de S3 alimente la lampe.',
    components: [...MONO(10), C('S1', 'va_et_vient', 180, 420), C('S2', 'permutateur', 360, 380), C('S3', 'va_et_vient', 540, 420), C('H1', 'lampe', 380, 180)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:L', 'marron'], ['S1:1', 'S2:E1', 'noir'], ['S1:2', 'S2:E2', 'gris'], ['S2:S1', 'S3:1', 'noir'], ['S2:S2', 'S3:2', 'gris'], ['S3:L', 'H1:1', 'orange'], ['Q1:Nout', 'H1:2', 'bleu']],
    test(t) {
      flips(t, [['S1', 1], ['S2', 1], ['S3', 1], ['S1', 0], ['S2', 0], ['S3', 0]], 'H1');
    },
  },
  {
    id: 'telerupteur', cat: CATS[0], level: 2, title: 'Télérupteur (3 points de commande)',
    desc: 'Plusieurs boutons poussoirs en parallèle commandent un télérupteur : chaque impulsion change l\'état de la lampe.',
    consigne: 'Circuit de commande : phase → poussoirs S1, S2, S3 montés en parallèle → bobine A1 du télérupteur KL, A2 au neutre. Circuit de puissance : phase → contact 1-2 de KL → lampe → neutre.',
    components: [...MONO(10), C('KL', 'telerupteur', 260, 160), C('S1', 'poussoir', 220, 420), C('S2', 'poussoir', 340, 420), C('S3', 'poussoir', 460, 420), C('H1', 'lampe', 540, 180)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:1', 'marron'], ['S1:1', 'S2:1', 'marron'], ['S2:1', 'S3:1', 'marron'], ['S1:2', 'KL:A1', 'rouge'], ['S2:2', 'KL:A1', 'rouge'], ['S3:2', 'KL:A1', 'rouge'], ['KL:A2', 'Q1:Nout', 'bleu'],
      ['Q1:Lout', 'KL:1', 'marron'], ['KL:2', 'H1:1', 'orange'], ['H1:2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.check(!t.out('H1'), 'Au départ la lampe est éteinte.');
      t.press('S1'); t.check(t.out('H1'), 'Une impulsion sur S1 doit allumer la lampe.');
      t.press('S2'); t.check(!t.out('H1'), 'Une impulsion sur S2 doit éteindre la lampe.');
      t.press('S3'); t.check(t.out('H1'), 'Une impulsion sur S3 doit allumer la lampe.');
      t.wait(2); t.check(t.out('H1'), 'La lampe doit rester allumée après l\'impulsion.');
      t.press('S1'); t.check(!t.out('H1'), 'Nouvelle impulsion : la lampe s\'éteint.');
    },
  },
  {
    id: 'minuterie', cat: CATS[0], level: 2, title: 'Minuterie (cage d\'escalier)',
    desc: 'Les poussoirs lancent une minuterie qui allume l\'éclairage pendant une durée réglable.',
    consigne: 'La minuterie MN est alimentée en L et N. Les poussoirs (en parallèle) envoient la phase sur l\'entrée BP. La sortie S alimente les lampes, leur autre borne au neutre. Montage « 3 fils ».',
    components: [...MONO(10), C('MN', 'minuterie', 260, 160, { T: 10 }), C('S1', 'poussoir', 420, 380), C('S2', 'poussoir', 540, 380), C('H1', 'lampe', 220, 380)],
    wires: [...MONO_W, ['Q1:Lout', 'MN:L', 'marron'], ['Q1:Nout', 'MN:N', 'bleu'], ['Q1:Lout', 'S1:1', 'marron'], ['S1:1', 'S2:1', 'marron'], ['S1:2', 'MN:BP', 'rouge'], ['S2:2', 'MN:BP', 'rouge'], ['MN:S', 'H1:1', 'orange'], ['H1:2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.check(!t.out('H1'), 'Au repos la lampe est éteinte.');
      t.press('S1'); t.check(t.out('H1'), 'Un appui sur S1 doit allumer la lampe.');
      t.wait(5); t.check(t.out('H1'), 'La lampe reste allumée pendant la temporisation.');
      t.wait(7); t.check(!t.out('H1'), 'La lampe s\'éteint à la fin de la temporisation.');
      t.press('S2'); t.check(t.out('H1'), 'Un appui sur S2 doit relancer la minuterie.');
    },
  },
  {
    id: 'detecteur', cat: CATS[0], level: 1, title: 'Éclairage par détecteur de mouvement',
    desc: 'Un détecteur allume automatiquement la lampe lors d\'un passage.',
    consigne: 'Le détecteur B1 est alimenté (L et N). Sa sortie S alimente la lampe, l\'autre borne de la lampe au neutre. Touchez le détecteur pour simuler un passage.',
    components: [...MONO(10), C('B1', 'detecteur', 240, 160, { T: 8 }), C('H1', 'lampe', 420, 300)],
    wires: [...MONO_W, ['Q1:Lout', 'B1:L', 'marron'], ['Q1:Nout', 'B1:N', 'bleu'], ['B1:S', 'H1:1', 'orange'], ['H1:2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.check(!t.out('H1'), 'Sans mouvement la lampe est éteinte.');
      t.set('B1', 1); t.check(t.out('H1'), 'Un mouvement doit allumer la lampe.');
      t.wait(10); t.check(!t.out('H1'), 'La lampe s\'éteint après la temporisation.');
    },
  },
  // ------------------------------------------------------------------ HABITAT PRISES & APPAREILS
  {
    id: 'prises', cat: CATS[1], level: 1, title: 'Prises de courant protégées',
    desc: 'Interrupteur différentiel 30 mA + disjoncteur 16 A + deux prises 2P+T repiquées.',
    consigne: 'Alimentation → interrupteur différentiel ID → disjoncteur Q1 (16 A) → prise X1, puis repiquage de X1 vers X2. N\'oubliez pas le conducteur de protection (vert/jaune) sur chaque prise !',
    components: [C('ALIM', 'alim_mono', 40, 40), C('ID', 'diff', 40, 180), C('Q1', 'disj_1pn', 50, 360, { In: 16 }), C('X1', 'prise', 240, 440), C('X2', 'prise', 400, 440)],
    wires: [['ALIM:L', 'ID:Lin', 'marron'], ['ALIM:N', 'ID:Nin', 'bleu'], ['ID:Lout', 'Q1:Lin', 'marron'], ['ID:Nout', 'Q1:Nin', 'bleu'], ['Q1:Lout', 'X1:L', 'marron'], ['Q1:Nout', 'X1:N', 'bleu'], ['ALIM:PE', 'X1:PE', 'vj'],
      ['X1:L', 'X2:L', 'marron'], ['X1:N', 'X2:N', 'bleu'], ['X1:PE', 'X2:PE', 'vj']],
    test(t) {
      t.check(t.out('X1') && t.out('X2'), 'Les deux prises doivent être sous tension (230 V).');
      t.connected('X1:PE', 'ALIM:PE', 'La prise X1 doit être reliée à la terre (PE).');
      t.connected('X2:PE', 'ALIM:PE', 'La prise X2 doit être reliée à la terre (PE).');
      t.set('X1', 1); t.set('X2', 1); t.check(t.out('X1') && t.out('X2'), 'Appareils branchés : les prises restent alimentées.');
      t.set('Q1', 0); t.check(!t.out('X1') && !t.out('X2'), 'Q1 doit couper les prises.');
      t.set('Q1', 1); t.set('ID', 0); t.check(!t.out('X1') && !t.out('X2'), 'Le différentiel ID doit être en amont du circuit.');
    },
  },
  {
    id: 'sonnerie', cat: CATS[1], level: 1, title: 'Sonnerie avec bouton poussoir',
    desc: 'La sonnerie fonctionne tant que l\'on appuie sur le poussoir.',
    consigne: 'Phase → poussoir S1 → sonnerie B1 → neutre. Maintenez le poussoir pour faire sonner.',
    components: [...MONO(2), C('S1', 'poussoir', 240, 360), C('B1', 'sonnerie', 400, 320)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:1', 'marron'], ['S1:2', 'B1:1', 'orange'], ['B1:2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.check(!t.out('B1'), 'Au repos la sonnerie est silencieuse.');
      t.hold('S1'); t.check(t.out('B1'), 'Poussoir appuyé : la sonnerie doit fonctionner.');
      t.release('S1'); t.check(!t.out('B1'), 'Poussoir relâché : la sonnerie s\'arrête.');
    },
  },
  {
    id: 'volet', cat: CATS[1], level: 2, title: 'Volet roulant',
    desc: 'Commander la montée et la descente d\'un volet roulant avec un inverseur.',
    consigne: 'Phase sur L de l\'inverseur. Sortie ↑ vers la borne montée du moteur, sortie ↓ vers la borne descente. Neutre commun du moteur au neutre, et terre du moteur au PE.',
    components: [...MONO(10), C('S1', 'inv_volet', 220, 380), C('M1', 'volet', 420, 180)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:L', 'marron'], ['S1:UP', 'M1:UP', 'noir'], ['S1:DN', 'M1:DN', 'gris'], ['Q1:Nout', 'M1:N', 'bleu'], ['ALIM:PE', 'M1:PE', 'vj']],
    test(t) {
      t.set('S1', 'up'); t.check(t.out('M1') === 'montee', 'Touche ▲ : le volet doit monter.');
      t.set('S1', 'stop'); t.check(t.out('M1') === 'arret', 'Touche ■ : le volet doit s\'arrêter.');
      t.set('S1', 'down'); t.check(t.out('M1') === 'descente', 'Touche ▼ : le volet doit descendre.');
      t.set('S1', 'stop');
      t.connected('M1:PE', 'ALIM:PE', 'Le moteur doit être relié à la terre.');
    },
  },
  {
    id: 'chauffeeau', cat: CATS[1], level: 3, title: 'Chauffe-eau en heures creuses (contacteur J/N)',
    desc: 'Le signal heures creuses du compteur commande un contacteur qui alimente le chauffe-eau.',
    consigne: 'Commande (Q1 2 A) : phase → contact heures creuses S1 → bobine A1 de KM1, A2 au neutre. Puissance (Q2 20 A) : phase et neutre passent par les pôles 1-2 et 3-4 de KM1 jusqu\'au chauffe-eau R1, sans oublier la terre.',
    components: [C('ALIM', 'alim_mono', 40, 40), C('Q1', 'disj_1pn', 40, 180, { In: 2 }), C('Q2', 'disj_1pn', 160, 180, { In: 20 }), C('S1', 'inter', 300, 340), C('KM1', 'contacteur', 300, 480), C('R1', 'radiateur', 640, 520, { P: 2000 })],
    wires: [['ALIM:L', 'Q1:Lin', 'marron'], ['ALIM:N', 'Q1:Nin', 'bleu'], ['ALIM:L', 'Q2:Lin', 'marron'], ['ALIM:N', 'Q2:Nin', 'bleu'],
      ['Q1:Lout', 'S1:L', 'rouge'], ['S1:1', 'KM1:A1', 'rouge'], ['KM1:A2', 'Q1:Nout', 'bleu'],
      ['Q2:Lout', 'KM1:1', 'marron'], ['Q2:Nout', 'KM1:3', 'bleu'], ['KM1:2', 'R1:1', 'marron'], ['KM1:4', 'R1:2', 'bleu'], ['ALIM:PE', 'R1:PE', 'vj']],
    test(t) {
      t.set('S1', 0); t.check(!t.out('KM1') && !t.out('R1'), 'Heures pleines : KM1 et le chauffe-eau sont à l\'arrêt.');
      t.set('S1', 1); t.check(t.out('KM1'), 'Heures creuses : KM1 doit s\'enclencher.');
      t.check(t.out('R1'), 'Heures creuses : le chauffe-eau doit chauffer.');
      t.set('S1', 0); t.check(!t.out('R1'), 'Retour en heures pleines : le chauffe-eau s\'arrête.');
      t.connected('R1:PE', 'ALIM:PE', 'Le chauffe-eau doit être relié à la terre.');
    },
  },
  {
    id: 'tbt', cat: CATS[1], level: 3, title: 'Commande en très basse tension 24 V',
    desc: 'Un transformateur 230/24 V alimente le circuit de commande d\'un contacteur à bobine 24 V qui commande une lampe 230 V.',
    consigne: 'Q1 alimente le primaire P1-P2 du transformateur T1. Au secondaire : S1 → fusible F1 → interrupteur S1 → bobine A1 de KM1 (24 V), A2 → S2 du transfo. Puissance : Q2 → pôle 1-2 de KM1 → lampe H1 → neutre.',
    components: [C('ALIM', 'alim_mono', 40, 40), C('Q1', 'disj_1pn', 40, 180, { In: 2 }), C('Q2', 'disj_1pn', 140, 180, { In: 10 }), C('T1', 'transfo', 280, 180), C('F1', 'fusible', 240, 360, { In: 1 }), C('S1', 'inter', 320, 480), C('KM1', 'contacteur', 440, 600, { V: 24 }), C('H1', 'lampe', 800, 420)],
    wires: [['ALIM:L', 'Q1:Lin', 'marron'], ['ALIM:N', 'Q1:Nin', 'bleu'], ['ALIM:L', 'Q2:Lin', 'marron'], ['ALIM:N', 'Q2:Nin', 'bleu'],
      ['Q1:Lout', 'T1:P1', 'marron'], ['Q1:Nout', 'T1:P2', 'bleu'], ['T1:S1', 'F1:1', 'rouge'], ['F1:2', 'S1:L', 'rouge'], ['S1:1', 'KM1:A1', 'rouge'], ['KM1:A2', 'T1:S2', 'blanc'],
      ['Q2:Lout', 'KM1:1', 'marron'], ['KM1:2', 'H1:1', 'orange'], ['H1:2', 'Q2:Nout', 'bleu']],
    test(t) {
      t.set('S1', 0); t.check(!t.out('KM1') && !t.out('H1'), 'S1 ouvert : KM1 et H1 au repos.');
      t.set('S1', 1); t.check(t.out('KM1'), 'S1 fermé : KM1 (bobine 24 V) doit s\'enclencher.');
      t.check(t.out('H1'), 'KM1 enclenché : la lampe 230 V doit s\'allumer.');
      t.set('S1', 0); t.check(!t.out('H1'), 'S1 ouvert : la lampe s\'éteint.');
    },
  },
  // ------------------------------------------------------------------ COMMANDE INDUSTRIELLE
  {
    id: 'automaintien', cat: CATS[2], level: 2, title: 'Marche / arrêt avec auto-maintien',
    desc: 'Le grand classique : un BP marche, un BP arrêt et le contact d\'auto-maintien 13-14 du contacteur. Un voyant signale la marche.',
    consigne: 'Phase → S1 (arrêt, NF) → S2 (marche, NO) → A1 de KM1, A2 au neutre. Le contact 13-14 de KM1 est câblé en parallèle sur S2 (auto-maintien). Le voyant H1 est alimenté par le contact 33-34 de KM1.',
    components: [...MONO(2), C('S1', 'bp_nc', 220, 160), C('S2', 'bp_no', 220, 320), C('KM1', 'contacteur', 340, 480), C('H1', 'voyant', 700, 300)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:1', 'rouge'], ['S1:2', 'S2:3', 'rouge'], ['S2:4', 'KM1:A1', 'rouge'], ['S1:2', 'KM1:13', 'rouge'], ['KM1:14', 'KM1:A1', 'rouge'], ['KM1:A2', 'Q1:Nout', 'bleu'],
      ['Q1:Lout', 'KM1:33', 'rouge'], ['KM1:34', 'H1:X1', 'rouge'], ['H1:X2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.check(!t.out('KM1'), 'Au repos KM1 est ouvert.');
      t.press('S2'); t.check(t.out('KM1'), 'Une impulsion sur S2 (marche) doit enclencher KM1.');
      t.wait(1); t.check(t.out('KM1'), 'KM1 doit rester enclenché après avoir relâché S2 (auto-maintien 13-14).');
      t.check(t.out('H1'), 'Le voyant H1 doit signaler la marche.');
      t.press('S1'); t.check(!t.out('KM1'), 'Une impulsion sur S1 (arrêt) doit faire retomber KM1.');
      t.check(!t.out('H1'), 'Le voyant s\'éteint à l\'arrêt.');
    },
  },
  {
    id: 'deuxpostes', cat: CATS[2], level: 2, title: 'Commande depuis deux postes',
    desc: 'Deux boutons arrêt en série et deux boutons marche en parallèle commandent le même contacteur.',
    consigne: 'Les arrêts S1 et S3 (NF) sont en série. Les marches S2 et S4 (NO) sont en parallèle entre eux et avec le contact 13-14 de KM1. Voyant H1 par le contact 33-34.',
    components: [...MONO(2), C('S1', 'bp_nc', 220, 160), C('S3', 'bp_nc', 340, 160), C('S2', 'bp_no', 220, 320), C('S4', 'bp_no', 340, 320), C('KM1', 'contacteur', 440, 480), C('H1', 'voyant', 820, 300)],
    wires: [...MONO_W, ['Q1:Lout', 'S1:1', 'rouge'], ['S1:2', 'S3:1', 'rouge'], ['S3:2', 'S2:3', 'rouge'], ['S3:2', 'S4:3', 'rouge'], ['S2:4', 'KM1:A1', 'rouge'], ['S4:4', 'KM1:A1', 'rouge'],
      ['S3:2', 'KM1:13', 'rouge'], ['KM1:14', 'KM1:A1', 'rouge'], ['KM1:A2', 'Q1:Nout', 'bleu'], ['Q1:Lout', 'KM1:33', 'rouge'], ['KM1:34', 'H1:X1', 'rouge'], ['H1:X2', 'Q1:Nout', 'bleu']],
    test(t) {
      t.press('S2'); t.check(t.out('KM1'), 'S2 (marche poste 1) doit enclencher KM1.');
      t.press('S1'); t.check(!t.out('KM1'), 'S1 (arrêt poste 1) doit arrêter KM1.');
      t.press('S4'); t.check(t.out('KM1'), 'S4 (marche poste 2) doit enclencher KM1.');
      t.wait(1); t.check(t.out('KM1'), 'KM1 reste enclenché (auto-maintien).');
      t.press('S3'); t.check(!t.out('KM1'), 'S3 (arrêt poste 2) doit arrêter KM1.');
    },
  },
  // ------------------------------------------------------------------ MOTEURS
  {
    id: 'direct', cat: CATS[3], level: 3, title: 'Démarrage direct d\'un moteur triphasé',
    desc: 'Circuit de puissance (sectionneur, contacteur, relais thermique, moteur couplé en étoile) et circuit de commande marche/arrêt avec auto-maintien.',
    consigne: 'Puissance : L1-L2-L3 → sectionneur Q1 → pôles 1-2/3-4/5-6 de KM1 → relais thermique F1 → U1-V1-W1 du moteur. Moteur 230/400 V sur réseau 400 V : couplage étoile (barrettes W2-U2-V2). Commande : Q2 → 95-96 de F1 → S1 arrêt → S2 marche → A1 de KM1, avec auto-maintien 13-14. Terre du moteur au PE.',
    components: [C('ALIM', 'alim_tri', 40, 40), C('Q1', 'sect_3p', 40, 180, { In: 6 }), C('KM1', 'contacteur', 40, 360), C('F1', 'relais_thermique', 80, 580, { Ir: 2.5 }), C('M1', 'moteur_3', 80, 760, { Vn: 230, P: 1500 }),
      C('Q2', 'disj_1pn', 440, 180, { In: 2 }), C('S1', 'bp_nc', 560, 200), C('S2', 'bp_no', 560, 340)],
    wires: [['ALIM:L1', 'Q1:1', 'marron'], ['ALIM:L2', 'Q1:3', 'noir'], ['ALIM:L3', 'Q1:5', 'gris'], ['Q1:2', 'KM1:1', 'marron'], ['Q1:4', 'KM1:3', 'noir'], ['Q1:6', 'KM1:5', 'gris'],
      ['KM1:2', 'F1:1', 'marron'], ['KM1:4', 'F1:3', 'noir'], ['KM1:6', 'F1:5', 'gris'], ['F1:2', 'M1:U1', 'marron'], ['F1:4', 'M1:V1', 'noir'], ['F1:6', 'M1:W1', 'gris'],
      ['M1:W2', 'M1:U2', 'blanc'], ['M1:U2', 'M1:V2', 'blanc'], ['ALIM:PE', 'M1:PE', 'vj'],
      ['ALIM:L1', 'Q2:Lin', 'marron'], ['ALIM:N', 'Q2:Nin', 'bleu'], ['Q2:Lout', 'F1:95', 'rouge'], ['F1:96', 'S1:1', 'rouge'], ['S1:2', 'S2:3', 'rouge'], ['S2:4', 'KM1:A1', 'rouge'],
      ['S1:2', 'KM1:13', 'rouge'], ['KM1:14', 'KM1:A1', 'rouge'], ['KM1:A2', 'Q2:Nout', 'bleu']],
    test(t) {
      t.check(t.out('M1') === 'stop', 'Au repos le moteur est arrêté.');
      t.press('S2'); t.check(t.out('KM1'), 'S2 doit enclencher KM1.');
      t.check(t.out('M1') === 'avant' || t.out('M1') === 'arriere', 'Le moteur doit tourner (les 3 phases doivent arriver sur U1, V1, W1).');
      t.check(t.out('M1.couplage') === 'etoile', 'Moteur 230/400 V sur réseau 400 V : il doit être couplé en étoile.');
      t.wait(1); t.check(t.out('M1') !== 'stop', 'Le moteur doit continuer à tourner (auto-maintien).');
      t.press('S1'); t.check(t.out('M1') === 'stop', 'S1 doit arrêter le moteur.');
      t.press('S2'); t.set('M1', 1); t.wait(15);
      t.check(t.out('F1'), 'En surcharge, le relais thermique F1 doit déclencher (ses pôles doivent être dans le circuit du moteur).');
      t.check(t.out('M1') === 'stop', 'Le déclenchement de F1 (contact 95-96) doit arrêter le moteur.');
      t.connected('M1:PE', 'ALIM:PE', 'La carcasse du moteur doit être reliée à la terre (PE).');
    },
  },
  {
    id: 'inversion', cat: CATS[3], level: 4, title: 'Inversion du sens de marche',
    desc: 'Deux contacteurs KM1 (avant) et KM2 (arrière) inversent deux phases. Verrouillage électrique par contacts NF croisés.',
    consigne: 'KM1 alimente le moteur L1→U1, L2→V1, L3→W1. KM2 inverse L1 et L3. Commande : S1 arrêt commun, S2 marche avant → 21-22 de KM2 → A1 de KM1 ; S3 marche arrière → 21-22 de KM1 → A1 de KM2. Auto-maintien 13-14 sur chaque contacteur.',
    components: [C('ALIM', 'alim_tri', 40, 40), C('Q1', 'sect_3p', 40, 180, { In: 6 }), C('KM1', 'contacteur', 40, 360), C('KM2', 'contacteur', 360, 360), C('F1', 'relais_thermique', 160, 580, { Ir: 2.5 }), C('M1', 'moteur_3', 160, 760, { Vn: 230, P: 1500 }),
      C('Q2', 'disj_1pn', 720, 180, { In: 2 }), C('S1', 'bp_nc', 700, 600), C('S2', 'bp_no', 700, 760), C('S3', 'bp_no', 820, 760)],
    wires: [['ALIM:L1', 'Q1:1', 'marron'], ['ALIM:L2', 'Q1:3', 'noir'], ['ALIM:L3', 'Q1:5', 'gris'],
      ['Q1:2', 'KM1:1', 'marron'], ['Q1:4', 'KM1:3', 'noir'], ['Q1:6', 'KM1:5', 'gris'], ['Q1:2', 'KM2:1', 'marron'], ['Q1:4', 'KM2:3', 'noir'], ['Q1:6', 'KM2:5', 'gris'],
      ['KM1:2', 'F1:1', 'marron'], ['KM1:4', 'F1:3', 'noir'], ['KM1:6', 'F1:5', 'gris'], ['KM2:2', 'F1:5', 'marron'], ['KM2:4', 'F1:3', 'noir'], ['KM2:6', 'F1:1', 'gris'],
      ['F1:2', 'M1:U1', 'marron'], ['F1:4', 'M1:V1', 'noir'], ['F1:6', 'M1:W1', 'gris'], ['M1:W2', 'M1:U2', 'blanc'], ['M1:U2', 'M1:V2', 'blanc'], ['ALIM:PE', 'M1:PE', 'vj'],
      ['ALIM:L1', 'Q2:Lin', 'marron'], ['ALIM:N', 'Q2:Nin', 'bleu'], ['Q2:Lout', 'F1:95', 'rouge'], ['F1:96', 'S1:1', 'rouge'],
      ['S1:2', 'S2:3', 'rouge'], ['S2:4', 'KM2:21', 'rouge'], ['KM2:22', 'KM1:A1', 'rouge'], ['S1:2', 'KM1:13', 'rouge'], ['KM1:14', 'S2:4', 'rouge'],
      ['S1:2', 'S3:3', 'rouge'], ['S3:4', 'KM1:21', 'rouge'], ['KM1:22', 'KM2:A1', 'rouge'], ['S1:2', 'KM2:13', 'rouge'], ['KM2:14', 'S3:4', 'rouge'],
      ['KM1:A2', 'Q2:Nout', 'bleu'], ['KM2:A2', 'Q2:Nout', 'bleu']],
    test(t) {
      t.press('S2'); const av = t.out('M1');
      t.check(av === 'avant' || av === 'arriere', 'S2 doit démarrer le moteur.');
      t.check(t.out('KM1') && !t.out('KM2'), 'S2 doit enclencher KM1 uniquement.');
      t.press('S3'); t.check(t.out('M1') === av && !t.out('KM2'), 'Verrouillage : S3 ne doit pas enclencher KM2 tant que KM1 est fermé.');
      t.press('S1'); t.check(t.out('M1') === 'stop', 'S1 doit arrêter le moteur.');
      t.press('S3'); const ar = t.out('M1');
      t.check(t.out('KM2') && !t.out('KM1'), 'S3 doit enclencher KM2 uniquement.');
      t.check((ar === 'avant' || ar === 'arriere') && ar !== av, 'Avec KM2 le moteur doit tourner dans l\'autre sens (inversion de deux phases).');
      t.press('S2'); t.check(t.out('M1') === ar && !t.out('KM1'), 'Verrouillage : S2 ne doit pas enclencher KM1 tant que KM2 est fermé.');
      t.press('S1'); t.check(t.out('M1') === 'stop', 'S1 doit arrêter le moteur.');
    },
  },
  {
    id: 'etoiletriangle', cat: CATS[3], level: 5, title: 'Démarrage étoile-triangle',
    desc: 'Démarrage sous tension réduite : KM1 (ligne) + KM2 (étoile) puis, après la temporisation de KA1, KM2 retombe et KM3 (triangle) s\'enclenche.',
    consigne: 'Moteur 400/690 V. Puissance : KM1 → F1 → U1-V1-W1. KM3 relie U1→W2, V1→U2, W1→V2 (triangle). KM2 court-circuite W2-U2-V2 (point étoile). Commande : marche/arrêt avec auto-maintien sur KM1 ; KA1 (tempo travail) alimenté avec KM1 ; 15-16 de KA1 → 21-22 de KM3 → KM2 ; 15-18 de KA1 → 21-22 de KM2 → KM3.',
    components: [C('ALIM', 'alim_tri', 40, 40), C('Q1', 'sect_3p', 40, 180, { In: 10 }), C('KM1', 'contacteur', 40, 360), C('F1', 'relais_thermique', 80, 580, { Ir: 6 }), C('M1', 'moteur_3', 80, 760, { Vn: 400, P: 3000 }),
      C('KM3', 'contacteur', 380, 560), C('KM2', 'contacteur', 380, 800),
      C('Q2', 'disj_1pn', 760, 160, { In: 2 }), C('S1', 'bp_nc', 900, 160), C('S2', 'bp_no', 900, 320), C('KA1', 'relais_tempo', 760, 360, { delay: 3 })],
    wires: [['ALIM:L1', 'Q1:1', 'marron'], ['ALIM:L2', 'Q1:3', 'noir'], ['ALIM:L3', 'Q1:5', 'gris'], ['Q1:2', 'KM1:1', 'marron'], ['Q1:4', 'KM1:3', 'noir'], ['Q1:6', 'KM1:5', 'gris'],
      ['KM1:2', 'F1:1', 'marron'], ['KM1:4', 'F1:3', 'noir'], ['KM1:6', 'F1:5', 'gris'], ['F1:2', 'M1:U1', 'marron'], ['F1:4', 'M1:V1', 'noir'], ['F1:6', 'M1:W1', 'gris'],
      ['F1:2', 'KM3:1', 'marron'], ['F1:4', 'KM3:3', 'noir'], ['F1:6', 'KM3:5', 'gris'], ['KM3:2', 'M1:W2', 'marron'], ['KM3:4', 'M1:U2', 'noir'], ['KM3:6', 'M1:V2', 'gris'],
      ['M1:W2', 'KM2:1', 'marron'], ['M1:U2', 'KM2:3', 'noir'], ['M1:V2', 'KM2:5', 'gris'], ['KM2:2', 'KM2:4', 'blanc'], ['KM2:4', 'KM2:6', 'blanc'], ['ALIM:PE', 'M1:PE', 'vj'],
      ['ALIM:L1', 'Q2:Lin', 'marron'], ['ALIM:N', 'Q2:Nin', 'bleu'], ['Q2:Lout', 'F1:95', 'rouge'], ['F1:96', 'S1:1', 'rouge'], ['S1:2', 'S2:3', 'rouge'], ['S2:4', 'KM1:A1', 'rouge'],
      ['S1:2', 'KM1:13', 'rouge'], ['KM1:14', 'KM1:A1', 'rouge'], ['KM1:A1', 'KA1:A1', 'rouge'], ['KM1:14', 'KA1:15', 'rouge'],
      ['KA1:16', 'KM3:21', 'rouge'], ['KM3:22', 'KM2:A1', 'rouge'], ['KA1:18', 'KM2:21', 'rouge'], ['KM2:22', 'KM3:A1', 'rouge'],
      ['KM1:A2', 'Q2:Nout', 'bleu'], ['KM2:A2', 'Q2:Nout', 'bleu'], ['KM3:A2', 'Q2:Nout', 'bleu'], ['KA1:A2', 'Q2:Nout', 'bleu']],
    test(t) {
      t.check(t.out('M1') === 'stop', 'Au repos le moteur est arrêté.');
      t.press('S2');
      t.check(t.out('KM1') && t.out('KM2') && !t.out('KM3'), 'Démarrage : KM1 et KM2 (étoile) enclenchés, KM3 ouvert.');
      t.check(t.out('M1.couplage') === 'etoile', 'Au démarrage le moteur doit être couplé en étoile.');
      t.wait(4);
      t.check(t.out('KM1') && !t.out('KM2') && t.out('KM3'), 'Après la temporisation : KM2 retombe et KM3 (triangle) s\'enclenche.');
      t.check(t.out('M1.couplage') === 'triangle', 'En régime établi le moteur doit être couplé en triangle.');
      t.check(t.out('M1') === 'avant' || t.out('M1') === 'arriere', 'Le moteur doit tourner.');
      t.press('S1'); t.check(t.out('M1') === 'stop' && !t.out('KM1') && !t.out('KM3'), 'S1 doit tout arrêter.');
      t.connected('M1:PE', 'ALIM:PE', 'La carcasse du moteur doit être reliée à la terre.');
    },
  },
];
