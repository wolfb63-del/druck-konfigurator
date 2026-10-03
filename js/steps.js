'use strict';
/* Schritt-Leiste für Einsteiger: ① Drucker → ② Modell laden → ③ Für Orca speichern.
   Sichtbar nur in den neuen Oberflächen (css/ui-neu.css), im Original verborgen (hidden).
   Zustand: Schritt 1 erst, wenn der Drucker einmal aktiv gewählt wurde (Klick in der Druckerwahl, auch auf
   den schon markierten; vom Browser gemerkt) – vorher war er wegen des voreingestellten Kobra S1 immer
   abgehakt, auch wenn niemand gewählt hatte (gemeldet 2026-10-03). Schritt 2 sobald ein Modell geladen ist,
   Schritt 3 nach dem Speichern der 3MF für genau dieses Modell. Aufgerufen aus update() (panel.js) und nach
   dem Export (export-ui.js). Erzwungen wird nichts: Modell laden geht auch ohne Schritt 1. */
const STEPS_PRINTER_KEY = 'druckKonfigurator.printerChosen';
let stepsExportedFor = null;   // Projekt, für das zuletzt eine 3MF gespeichert wurde
let stepsPrinterChosen = (() => { try { return localStorage.getItem(STEPS_PRINTER_KEY) === '1'; } catch (e) { return false; } })();

function markExported() { stepsExportedFor = project; renderSteps(); }
function markPrinterChosen() {
  if (!stepsPrinterChosen) { stepsPrinterChosen = true; try { localStorage.setItem(STEPS_PRINTER_KEY, '1'); } catch (e) { /* nur bis zum Neuladen */ } }
  renderSteps();
}

function renderSteps() {
  const bar = document.getElementById('steps');
  if (!bar) return;
  const printer = typeof lastResult !== 'undefined' && lastResult ? lastResult.printer.label : '';
  const done = [stepsPrinterChosen, !!project, !!project && stepsExportedFor === project];
  const T = s => typeof tr === 'function' ? tr(s) : s;   // Sprachwahl (js/i18n.js)
  const text = [
    stepsPrinterChosen && printer ? T('Drucker') + ': ' + printer : T('Drucker wählen'),
    project ? T('Modell') + ': ' + project.name : T('Modell laden'),
    T(done[2] ? '3MF gespeichert' : 'Für OrcaSlicer speichern')
  ];
  const current = done.indexOf(false);
  bar.querySelectorAll('[data-step]').forEach((b, i) => {
    b.classList.toggle('done', done[i]);
    b.classList.toggle('current', i === current);
    if (i === current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.querySelector('.step-n').textContent = done[i] ? '✓' : String(i + 1);
    b.querySelector('.step-t').textContent = text[i];
    b.title = text[i];
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('steps');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    if (b.dataset.step === '1') {
      // Druckerwahl kurz hervorheben (css/ui-gemeinsam.css), Fokus auf den markierten Drucker
      const sw = document.querySelector('.printer-switch'), p = document.querySelector('.printer-switch [aria-checked="true"]');
      if (sw) { sw.classList.remove('steps-pulse'); void sw.offsetWidth; sw.classList.add('steps-pulse'); setTimeout(() => sw.classList.remove('steps-pulse'), 1600); }
      if (p) p.focus();
    } else if (b.dataset.step === '3') {
      const cta = document.getElementById('export3mfCta');
      if (cta && !cta.disabled) cta.click(); else toast('Zuerst ein Modell laden (Schritt 2)');
    }
    // Schritt 2 öffnet die Dateiauswahl über data-action="open" (app.js)
  });
  const sw = document.querySelector('.printer-switch');
  if (sw) sw.addEventListener('click', e => { if (e.target.closest('[data-printer]')) markPrinterChosen(); });
  renderSteps();
});
