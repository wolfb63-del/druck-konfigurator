'use strict';
/* Schritt-Leiste für Einsteiger: ① Drucker → ② Modell laden → ③ Für Orca speichern.
   Sichtbar nur in den neuen Oberflächen (css/ui-neu.css), im Original verborgen (hidden).
   Zustand: Schritt 1 gilt als erledigt (ein Drucker ist immer gewählt), Schritt 2 sobald ein Modell geladen
   ist, Schritt 3 nach dem Speichern der 3MF für genau dieses Modell. Aufgerufen aus update() (panel.js)
   und nach dem Export (export-ui.js). */
let stepsExportedFor = null;   // Projekt, für das zuletzt eine 3MF gespeichert wurde

function markExported() { stepsExportedFor = project; renderSteps(); }

function renderSteps() {
  const bar = document.getElementById('steps');
  if (!bar) return;
  const printer = typeof lastResult !== 'undefined' && lastResult ? lastResult.printer.label : '';
  const done = [true, !!project, !!project && stepsExportedFor === project];
  const text = [
    printer ? 'Drucker: ' + printer : 'Drucker wählen',
    project ? 'Modell: ' + project.name : 'Modell laden',
    done[2] ? '3MF gespeichert' : 'Für OrcaSlicer speichern'
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
      const p = document.querySelector('.printer-switch [aria-checked="true"]');
      if (p) p.focus();
    } else if (b.dataset.step === '3') {
      const cta = document.getElementById('export3mfCta');
      if (cta && !cta.disabled) cta.click(); else toast('Zuerst ein Modell laden (Schritt 2)');
    }
    // Schritt 2 öffnet die Dateiauswahl über data-action="open" (app.js)
  });
  renderSteps();
});
