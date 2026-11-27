# ⚡ ÉlectroLab – simulateur de câblage électrotechnique

Application **web et mobile** (PWA installable, fonctionne hors connexion) pour apprendre et
pratiquer le câblage en électrotechnique : on pose les appareils, on **tire les fils de borne à
borne** au doigt ou à la souris, et le circuit est **simulé électriquement en temps réel**.

## Fonctionnalités

- **Câblage interactif** : touchez une borne puis une autre (ou glissez), repiquage sur une même
  borne, couleurs normalisées (marron/noir/gris phase, bleu neutre, vert-jaune terre…), annulation.
- **Vraie simulation électrique** (analyse nodale en régime sinusoïdal, réseau TT 230/400 V) :
  - court-circuit → le plus petit disjoncteur/fusible concerné déclenche (sélectivité) ;
  - défaut phase/terre → l'interrupteur différentiel 30 mA déclenche ;
  - surcharge → déclenchement thermique (disjoncteur, relais thermique) ;
  - bobine ou lampe sous-dimensionnée → grillée ; mauvais couplage moteur → surtension ;
  - sens de rotation et couplage étoile/triangle des moteurs calculés à partir des phases.
- **Multimètre** : mesure de la tension entre deux bornes quelconques.
- **35 composants** : alimentations mono/tri, transformateur, disjoncteurs, différentiel,
  fusibles, sectionneur, relais thermique, interrupteurs (simple, double, va-et-vient,
  permutateur), poussoirs, BP marche/arrêt, arrêt d'urgence, fin de course, contacteur,
  relais, relais temporisé, télérupteur, minuterie, détecteur, inverseur et moteur de volet,
  lampes, voyants, sonnerie, prises 2P+T, radiateur, moteurs mono et triphasé, borne.
- **Bibliothèque de 17 schémas** en mode *Exercice* (à câbler) ou *Solution* (câblé) :
  simple allumage, double allumage, va-et-vient, permutateur, télérupteur, minuterie,
  détecteur, prises protégées, sonnerie, volet roulant, chauffe-eau heures creuses,
  commande TBT 24 V, marche/arrêt auto-maintien, commande deux postes, démarrage direct,
  inversion du sens de marche, démarrage étoile-triangle.
- **Correction automatique** : « Vérifier » essaie le montage comme un examinateur
  (manœuvres + contrôles) et indique précisément ce qui ne fonctionne pas.
- Sauvegarde automatique, export/import de fichiers `.electrolab.json`.

## Utilisation

Aucune compilation : c'est un site statique (HTML/CSS/JavaScript modules).

```bash
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
npm test                      # vérifie que les 17 solutions passent leurs scénarios
```

### Sur téléphone

Une fois le site en ligne (voir ci-dessous), ouvrez-le sur le téléphone :
- **Android (Chrome)** : menu ⋮ → « Installer l'application » ;
- **iPhone (Safari)** : Partager → « Sur l'écran d'accueil ».

L'application s'ouvre alors en plein écran comme une application native et fonctionne hors ligne.

### Mise en ligne (GitHub Pages)

Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.
À activer une fois : *Settings → Pages → Source : GitHub Actions*.

## Structure

| Fichier | Rôle |
|---|---|
| `js/components.js` | Bibliothèque des composants (bornes, comportement, dessin) |
| `js/engine.js`, `js/solver.js` | Moteur de simulation (analyse nodale complexe) |
| `js/library.js` | Schémas, solutions et scénarios de vérification |
| `js/checker.js` | Correction automatique des exercices |
| `js/app.js` | Interface (plan de travail tactile, palette, inspecteur) |
| `sw.js`, `manifest.webmanifest` | Application installable / hors ligne |

### Ajouter un schéma

Ajoutez une entrée dans `SCHEMAS` (`js/library.js`) avec ses composants, ses fils
(`['Q1:Lout', 'S1:L', 'marron']`) et une fonction `test(t)` qui manœuvre (`t.set`, `t.press`,
`t.wait`) et contrôle (`t.check`, `t.out`, `t.connected`). Lancez `npm test`.
