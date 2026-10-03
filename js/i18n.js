'use strict';
/* Sprachwahl Deutsch/Englisch (Phase 1: Oberfläche, Datenblatt-Bezeichnungen, Dialoge).
   Deutsch ist die Quellsprache und bleibt im Code; js/i18n-en.js ordnet ganzen deutschen Texten den
   englischen zu. Übersetzt wird nur an der Anzeige: Textknoten und die Attribute title/aria-label/
   placeholder, deren Text genau einem Eintrag entspricht – auch Texte, die die Seite später neu schreibt
   (MutationObserver). So bleiben engine.js und die deutschen Bezeichnungen als interne Schlüssel unberührt.
   Zusammengesetzte Sätze mit Zahlen folgen in Phase 2. Wird im <head> geladen (vor dem ersten Zeichnen). */
const LANG_KEY = 'druckKonfigurator.lang';
// data-tip: Hilfetexte der „?“-Punkte (app.js enhanceHelp verschiebt title dorthin; Prüfung 2026-10-03)
const I18N_ATTRS = ['title', 'aria-label', 'placeholder', 'data-tip'];
let uiLang = (() => {
  try { const l = localStorage.getItem(LANG_KEY); if (l === 'de' || l === 'en') return l; } catch (e) { /* ohne Speicher */ }
  return /^de\b/i.test((typeof navigator !== 'undefined' && navigator.language) || 'de') ? 'de' : 'en';
})();
document.documentElement.lang = uiLang;

// Text in der aktuellen Sprache; unbekannte Texte bleiben deutsch
const i18nHas = k => typeof I18N_EN !== 'undefined' && Object.prototype.hasOwnProperty.call(I18N_EN, k);
function tr(de) { return uiLang === 'en' && i18nHas(de) ? I18N_EN[de] : de; }
// Satzvorlage mit Platzhaltern {name}: Schlüssel ist die deutsche Vorlage, vars die eingesetzten Werte
function trf(de, vars) { return tr(de).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)); }
// Zahl im Format der Sprache (Deutsch: 4,2 und 27.073 – Englisch: 4.2 und 27,073)
function num(v, d) { return Number(v).toLocaleString(uiLang === 'en' ? 'en-US' : 'de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }); }

const I18N = (() => {
  // Je Textknoten bzw. Element+Attribut: deutsches Original und der zuletzt von hier geschriebene Wert.
  // Ändert die Seite den Text selbst, weicht er vom geschriebenen ab → neues Original.
  const textState = new WeakMap();         // Knoten → { de, written }
  const attrState = new WeakMap();         // Element → { attr: { de, written } }
  let observer = null;

  function textNode(n) {
    const v = n.nodeValue, st = textState.get(n);
    const de = st && v === st.written ? st.de : v;
    const key = de.replace(/\s+/g, ' ').trim();
    if (!key) return;
    let want = de;
    if (uiLang === 'en' && i18nHas(key)) {
      const en = I18N_EN[key];   // beginnt die Übersetzung mit einem Satzzeichen, entfällt der Leerraum davor (Fuge nach <b>)
      want = (/^[.,;:!?]/.test(en) ? '' : de.match(/^\s*/)[0]) + en + de.match(/\s*$/)[0];
    }
    if (want === de) { textState.delete(n); if (v !== de) n.nodeValue = de; return; }
    textState.set(n, { de, written: want });
    if (v !== want) n.nodeValue = want;
  }
  function attrs(el) {
    for (const a of I18N_ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const all = attrState.get(el) || {}, st = all[a], v = el.getAttribute(a);
      const de = st && v === st.written ? st.de : v, en = uiLang === 'en' && i18nHas(de.trim()) ? I18N_EN[de.trim()] : undefined;
      const want = en !== undefined ? en : de;
      if (want === de) delete all[a]; else { all[a] = { de, written: want }; attrState.set(el, all); }
      if (v !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    if (root.getAttribute('translate') === 'no') return;   // Nutzerdaten: Datei-, Teil-, Profilnamen
    attrs(root);
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  function apply(root) { if (typeof I18N_EN !== 'undefined') walk(root || document.body); }
  function observe() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') textNode(m.target);
        else attrs(m.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  }
  function setLang(l) {
    uiLang = l === 'en' ? 'en' : 'de';
    document.documentElement.lang = uiLang;
    try { localStorage.setItem(LANG_KEY, uiLang); } catch (e) { /* nur bis zum Neuladen */ }
    showLang();
    apply();
    if (typeof update === 'function') update();       // Datenblatt und Listen neu zeichnen
  }
  // Knopf zeigt die jeweils andere Sprache; seine Beschriftung ist bewusst nicht im Wörterbuch
  function showLang() {
    const b = document.getElementById('langBtn');
    if (!b) return;
    b.textContent = uiLang === 'en' ? 'DE' : 'EN';
    b.lang = uiLang === 'en' ? 'de' : 'en';
    b.setAttribute('aria-label', uiLang === 'en' ? 'Auf Deutsch umschalten' : 'Switch to English');
    b.title = b.getAttribute('aria-label');
  }
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('langBtn');
    if (b) b.addEventListener('click', () => setLang(uiLang === 'en' ? 'de' : 'en'));
    showLang();
    apply();
    observe();
  });
  return { apply, setLang, lang: () => uiLang, textNode, attrs };
})();
