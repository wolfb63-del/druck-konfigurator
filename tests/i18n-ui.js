'use strict';
/* Prüft die englischen Texte der Oberflächen-Dateien (js/i18n-en-ui.js) ohne Browser:
   a) Jede Vorlage/jeder Text, den der Code an tr()/trf()/die lokalen Helfer (A_TF, P_TF, F_TF, E_TF, S_TF, K_TF,
      C_TF, L_TF, O_TF, H_TF) übergibt, hat einen Eintrag in I18N_EN (i18n-en.js + i18n-en-ui.js). Gesammelt
      wird per Quelltext-Suche; dazu feste Texte, die der Übersetzer (MutationObserver) an der Anzeige ersetzt.
   b) Platzhalter deutsch = englisch.
   c) Keine doppelten Schlüssel zwischen i18n-en.js und i18n-en-ui.js (und keine innerhalb von i18n-en-ui.js).
   d) Stichproben: trf/num und die Regeln für import.js-/fragility.js-Texte in beiden Sprachen.
   Aufruf mit --missing listet die fehlenden Schlüssel (Arbeitshilfe). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) pass++; else { fail++; console.log('FEHLER ' + name + (detail !== undefined ? ': ' + detail : '')); } }

const mem = { 'druckKonfigurator.lang': 'de' };
const ctx = vm.createContext({ console, document: { documentElement: {}, body: { nodeType: 1, tagName: 'BODY', hasAttribute: () => false, getAttribute: () => null, firstChild: null }, addEventListener: () => {}, getElementById: () => null },
  navigator: { language: 'de-DE' }, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } });
const SRC = ['i18n-en.js', 'i18n-en-ui.js', 'i18n-en-muster.js', 'i18n.js'].map(f => read('js/' + f)).join('\n');
vm.runInContext(SRC + '\n;globalThis.I18N = I18N; globalThis.tr = tr; globalThis.trf = trf; globalThis.num = fmtNum; globalThis.EN = I18N_EN; globalThis.uiRules = uiRules;', ctx);
const EN = ctx.EN, UI = ctx;

// ---- Quelltext-Suche: Argumente von tr()/trf()/X_TF() ----
const FILES = ['app', 'panel', 'fragility-ui', 'export-ui', 'filament-ui', 'part-settings', 'printer-picker', 'custom-printer-ui', 'printer-link', 'viewer', 'orient-ui', 'holes-ui'];
function literalsOfCalls(code) {
  const out = new Set(), re = /(?:\b[A-Z]_TF|\btrf|\btr)\(/g;
  let m;
  while ((m = re.exec(code))) {
    let i = m.index + m[0].length, depth = 0, q = null;
    const start = i;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) break;
    }
    for (const l of code.slice(start, i).matchAll(/'((?:[^'\\]|\\.)*)'/g)) out.add(vm.runInContext("'" + l[1] + "'", vm.createContext({})));
  }
  return out;
}
const used = new Set();
for (const f of FILES) for (const k of literalsOfCalls(read('js/' + f + '.js'))) used.add(k);
// Funktionsnamen selbst sind keine Texte (Definition „const A_TF=(s,v)=>…“ liefert nur s)
['s', 'de'].forEach(k => used.delete(k));

// Feste Texte, die der Übersetzer (MutationObserver) an der Anzeige ersetzt, ohne dass der Code tr() aufruft
const STATIC = [
  'Noch keine Datei geladen.', 'Profile als Datei gespeichert', 'Filament-JSON gespeichert', 'Process-JSON gespeichert',
  '3D-Ansicht konnte nicht gestartet werden. Die Analyse funktioniert trotzdem.',
  '3D-Ansicht nicht verfügbar (three.js fehlt im Ordner vendor/). Die Analyse und alle Empfehlungen funktionieren trotzdem.',
  'Kopiert', 'Kopieren nicht möglich', 'Als Text kopieren', 'Gespeichert ✓', 'Achtung:', 'Getestet', 'Allgemeiner Startwert', 'Eigene Werte',
  'Stützstrukturen', 'Typ', 'Schwellenwinkel', 'Nur auf Druckplatte', 'Kleine Überhänge entfernen', 'Druckbasis/Raft', 'Oberer Z-Abstand', 'Unterer Z-Abstand',
  'Wände um Stützstrukturen', 'Abstand Grundmuster', 'Obere Schnittstellenschichten', 'Untere Schnittstellenschichten', 'Oberer Schnittstellenabstand',
  'Stützen/Objekt XY-Abstand', 'Stützen/Objekt Abstand erste Schicht', 'Stützspitze', 'Ast-Dichte', 'Astabstand', 'Stützast-Durchmesser',
  'Aktivieren, nur kritische Bereiche', 'Baum (automatisch)', 'zunächst aktivieren', '0 Schichten', 'Ein', 'Aus',
  'nur mit gehärteter Düse', 'z. B. ab 225 °C weniger Fäden, Brim bei kleinen Teilen nötig …', 'Abbrechen', 'Auf Standard zurücksetzen', 'Löschen',
  'Als neues Filament speichern', 'Speichern', 'Stahl (gehärtet oder Edelstahl) im Vergleich zu Messing', 'Temperaturaufschlag Stahl', 'Volumenstrom-Faktor Stahl', '× Messing',
  'Stahl leitet Wärme schlechter als Messing. Üblich sind 5–10 °C mehr und etwas weniger Durchsatz. Beispiel: Profil mit Stahl ermittelt, du druckst mit Messing → Temperatur −5 °C, Volumenstrom ÷ 0,9.',
  'Stabilität ?', 'Sehr detailreiches Modell – Stabilität in der Modell-Karte per Klick berechnen',
  'Stabilität wird berechnet – sehr detailreiches Modell, das kann länger dauern …', 'Stabilität wird berechnet …', 'Stabilität: per Klick', 'Stabilität …',
  'zuerst ein Modell laden', 'Slot wählen und speichern', 'öffnet den Dialog zur Slot-Wahl', 'Einstellung', 'Vorlage', 'Neu', 'Filament-Slot',
  'Standard-Slot (für Teile ohne eigenen Slot)', 'Teil', 'Slot', 'Filament', 'Eigene Werte', 'Standard', 'wie beim Export gewählt',
  'Belegung gespeichert', 'Eigene Belegung gelöscht', 'Ungültige Adresse', 'Drucker-Verbindung gespeichert',
  'Diese Düsengröße kann das Tool nicht umrechnen', 'Entfernen', 'Aus der Liste entfernen', 'Kein Drucker gefunden.', 'Lade Profil …',
  'Ersten Punkt anklicken …', 'Zweiten Punkt anklicken …', 'Auswählen', 'Als neues Filament speichern'
];
// Editor-Felder (js/panel.js FIELDS) und Anzeigenamen aus data.js
{
  const code = read('js/panel.js'), m = /const FIELDS=\[([\s\S]*?)\n\];/.exec(code);
  if (m) { const F = vm.runInContext('[' + m[1] + ']', vm.createContext({})); for (const g of F) { STATIC.push(g[0]); for (const f of g[1]) { STATIC.push(f[1]); } } }
  STATIC.push('Qualität', 'Ausgewogen', 'Schnell');
  const dctx = vm.createContext({});
  for (const f of ['util', 'data']) vm.runInContext(read('js/' + f + '.js'), dctx);
  const labels = vm.runInContext('Object.values(KIND_LABEL).concat(Object.values(NOZZLE_MATERIALS).map(x => x.label), Object.values(STATUS).map(x => x[1]))', dctx);
  STATIC.push(...labels);
}
const SKIP_STATIC = /^(PLA|PETG|ABS|ASA|Slot|Filament)$/;   // Eigennamen/Fachwörter, die in beiden Sprachen gleich sind (oder schon geprüft)
const missing = [...used, ...STATIC.filter(k => !SKIP_STATIC.test(k))].filter(k => !Object.prototype.hasOwnProperty.call(EN, k));
if (process.argv.includes('--missing')) { console.log([...new Set(missing)].map(k => JSON.stringify(k)).join('\n')); process.exit(0); }

// a) Vollständigkeit
check('Vorlagen im Code gefunden (' + used.size + ')', used.size >= 100, String(used.size));
check('Alle Vorlagen und festen Texte haben einen englischen Eintrag', missing.length === 0, [...new Set(missing)].join(' | '));

// b) Platzhalter gleich
{
  const ph = t => (t.match(/\{\w+\}/g) || []).sort().join();
  const bad = Object.keys(EN).filter(k => /\{\w+\}/.test(k) && ph(k) !== ph(EN[k]));
  check('Platzhalter deutsch = englisch', bad.length === 0, bad.join(' | '));
  const unused = [...used].filter(k => /\{\w+\}/.test(k)).length;
  check('Vorlagen mit Platzhaltern vorhanden', unused >= 40, String(unused));
  const empty = Object.entries(EN).filter(([k, v]) => !v || !String(v).trim()).map(([k]) => k);
  check('keine leeren Übersetzungen', empty.length === 0, empty.join(' | '));
}

// c) doppelte Schlüssel
{
  const keysOf = src => [...src.replace(/\/\/[^\n]*/g, '').matchAll(/(?:^|[{,]\s*)'((?:[^'\\]|\\.)*)'\s*:/gm)].map(m => vm.runInContext("'" + m[1] + "'", vm.createContext({})));
  const a = keysOf(read('js/i18n-en.js')), b = keysOf(read('js/i18n-en-ui.js'));
  const A = new Set(a), seen = new Set();
  check('i18n-en-ui.js: Schlüssel gefunden', b.length > 100, String(b.length));
  check('keine doppelten Schlüssel zwischen i18n-en.js und i18n-en-ui.js', b.filter(k => A.has(k)).length === 0, b.filter(k => A.has(k)).join(' | '));
  check('keine doppelten Schlüssel in i18n-en-ui.js', b.filter(k => seen.has(k) || !seen.add(k)).length === 0, b.filter(k => seen.has(k)).join(' | '));
}

// d) Stichproben
{
  const run = (lang, code) => { ctx.I18N.setLang(lang); return vm.runInContext(code, ctx); };
  const cases = [
    ["trf('{n} Dreiecke', { n: num(22604, 0) })", '22.604 Dreiecke', '22,604 triangles'],
    ["trf('{n} Teile', { n: 9 }) + ' · ' + trf('{n} Platten', { n: 4 })", '9 Teile · 4 Platten', '9 parts · 4 plates'],
    ["trf('Slot {n}', { n: 3 }) + ' · ' + trf('Platte {n}', { n: 3 })", 'Slot 3 · Platte 3', 'Slot 3 · Plate 3'],
    ["trf('Ursprünglich für: {name}', { name: 'Bambu Lab A1' })", 'Ursprünglich für: Bambu Lab A1', 'Originally for: Bambu Lab A1'],
    ["trf('Live vom Drucker ({host}) · Stand {time}', { host: '192.168.1.5', time: '14:05' })", 'Live vom Drucker (192.168.1.5) · Stand 14:05', 'Live from the printer (192.168.1.5) · as of 14:05'],
    ["trf('Größer als das Bett ({w} × {d} mm): {list}. Bitte drehen oder in Orca skalieren/teilen.', { w: num(180, 0), d: num(180, 0), list: 'Teil A' })", 'Größer als das Bett (180 × 180 mm): Teil A. Bitte drehen oder in Orca skalieren/teilen.', 'Larger than the bed (180 × 180 mm): Teil A. Please rotate it or scale/split it in Orca.'],
    ["trf('Über {th}°: ca. {mm2} mm² ({pct} % der Oberfläche, Bodenfläche ausgenommen).', { th: 45, mm2: num(1234, 0), pct: num(4.25, 1) })", 'Über 45°: ca. 1.234 mm² (4,3 % der Oberfläche, Bodenfläche ausgenommen).', 'Above 45°: approx. 1,234 mm² (4.3 % of the surface, bottom face excluded).'],
    ["trf('Filament von {n} Teilen passend zur Belegung wählen', { n: 3 })", 'Filament von 3 Teilen passend zur Belegung wählen', 'Set the filament of 3 parts to match the slot assignment']
  ];
  for (const [code, de, en] of cases) {
    check('DE: ' + de.slice(0, 40), run('de', code) === de, run('de', code));
    check('EN: ' + en.slice(0, 40), run('en', code) === en, run('en', code));
  }
  // Regeln für Meldungen aus import.js / fragility.js (Sollwerte von Hand aus den deutschen Sätzen übersetzt)
  const rules = [
    ['import', '3 Modifier/Hilfskörper ausgelassen (werden nicht gedruckt).', '3 modifiers/helper bodies skipped (not printed).'],
    ['import', 'Einfache 3MF ohne Orca-/Bambu-Projektdaten: nur die Form wird übernommen, wie bei einer STL.', 'Plain 3MF without Orca/Bambu project data: only the shape is imported, as with an STL.'],
    ['import', 'Die 3MF „a.3mf“ wird verwendet, 2 weitere Datei(en) ignoriert.', 'The 3MF “a.3mf” is used, 2 other file(s) ignored.'],
    ['import', 'x.txt: nur STL, 3MF oder ZIP.', 'x.txt: only STL, 3MF or ZIP.'],
    ['import', 'keine druckbaren Objekte in m.3mf', 'no printable objects in m.3mf'],
    ['import', 'Keine gültigen Dreiecke gefunden', 'No valid triangles found'],
    ['fragility', 'Dünne Wände (dünnste ≈ 0,8 mm): unter 1,6 mm (4 Linienbreiten) passen nur wenige Linien nebeneinander, mehr Wände bringen dort kaum etwas. Falls möglich die Wand im Modell auf mindestens 1,6 mm verstärken.',
      'Thin walls (thinnest ≈ 0.8 mm): below 1.6 mm (4 line widths) only a few lines fit side by side, so more walls add little there. If possible, thicken the wall in the model to at least 1.6 mm.'],
    ['fragility', 'Schwach in Z bei 12,3 mm Höhe (schmaler Querschnitt, 40 mm Material darüber): Bruchgefahr zwischen den Schichten. Am wirksamsten ist meist eine Lage, in der diese Stelle liegt statt steht. Sonst als Näherung: mehr Wände (z. B. 4) und mehr Füllung (z. B. 30–40 %) vergrößern den tragenden Querschnitt.',
      'Weak in Z at 12.3 mm height (narrow cross-section, 40 mm of material above): risk of breaking between layers. Most effective is usually an orientation where this spot lies flat instead of standing. Otherwise, as an approximation: more walls (e.g. 4) and more infill (e.g. 30–40 %) enlarge the load-bearing cross-section.'],
    ['fragility', 'Näherung aus der Geometrie, keine Festigkeitsberechnung. Die Druckeinstellungen im Tool und im 3MF bleiben unverändert – bei Bedarf selbst in OrcaSlicer anpassen.',
      'Approximation from the geometry, not a strength calculation. The print settings in the tool and in the 3MF stay unchanged – adjust them yourself in OrcaSlicer if needed.'],
    ['fragility', 'Achtung Stabilität: In dieser Lage stünde eine schmale Stelle aufrecht (direkt über dem Bett) – das Teil wird in Z schwächer und kann eher zwischen den Schichten brechen. Weniger Stützen gegen Festigkeit abwägen; bei Funktionsteilen ggf. die aktuelle Lage behalten. (Näherung)',
      'Strength warning: in this orientation a narrow spot would stand upright (directly above the bed) – the part gets weaker in Z and is more likely to break between layers. Weigh fewer supports against strength; for functional parts, consider keeping the current orientation. (approximation)']
  ];
  for (const [set, de, en] of rules) {
    ctx.I18N.setLang('de');
    check('Regel ' + set + ' DE unverändert: ' + de.slice(0, 30), vm.runInContext('uiRules(' + JSON.stringify(de) + ',' + JSON.stringify(set) + ')', ctx) === de);
    ctx.I18N.setLang('en');
    const got = vm.runInContext('uiRules(' + JSON.stringify(de) + ',' + JSON.stringify(set) + ')', ctx);
    check('Regel ' + set + ' EN: ' + de.slice(0, 30), got === en, got);
  }
  ctx.I18N.setLang('de');
}

// e) Anzeige-Fehlerquellen im Quelltext
{
  // Befund 2026-10-03: i18n.js hatte num() und util.js const num – alle Skripte teilen einen globalen
  // Bereich, ein doppelter Name bricht im Browser das spätere Skript ab. Keine doppelten Namen in js/*.js.
  const dup = {};
  for (const file of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js')))
    for (const m of read('js/' + file).matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) (dup[m[1]] = dup[m[1]] || []).push(file);
  const twice = Object.entries(dup).filter(([, v]) => v.length > 1).map(([k, v]) => k + ' (' + v.join(', ') + ')');
  check('Keine doppelten globalen Namen in js/*.js', twice.length === 0, twice.join(' | '));
  for (const f of ['app', 'panel', 'export-ui', 'printer-picker', 'fragility-ui', 'holes-ui', 'orient-ui']) {
    const code = read('js/' + f + '.js');
    check(f + '.js: Zahlenformat über fmtNum, nicht num()', /fmtNum\(/.test(code) && !/[^.\w]num\([^)]*,\s*\d\)/.test(code));
  }
}

console.log(pass + '/' + (pass + fail) + ' bestanden');
process.exit(fail ? 1 : 0);
