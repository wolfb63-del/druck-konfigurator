# CLAUDE.md – Druck-Konfigurator

## Projekt
Browser-Tool, das Startwerte für OrcaSlicer berechnet und als OrcaSlicer-Projekt (3MF)
exportiert. Funktionen: Überhang- und Stabilitätsanalyse, Lage-Vorschlag, Einstellungen
je Teil, Bohrloch-Verstärkung, Makerworld-Umstellung, rund 990 Drucker aus den
Orca-Profilen (Kobra S1 und Snapmaker U1 mit eigenen Vorlagen).
Online: https://wolfb63-del.github.io/druck-konfigurator/ (GitHub Pages, jeder Push ist sofort live).

## Technik
- Reines HTML/CSS/JavaScript, kein Build-Schritt. Einbindung per <script src>, muss auch
  über file:// (Doppelklick auf index.html) laufen. Keine ES-Module, keine neuen
  Abhängigkeiten ohne Rückfrage.
- Rechenlogik ohne DOM bauen, damit sie in Node testbar ist (wie holes.js, fragility.js).
- Oberfläche und Texte auf Deutsch. Antworten an den Nutzer auf Deutsch.
- Mitgelieferte Bibliotheken (three.js, fflate): siehe THIRD_PARTY_NOTICES.md.

## Wichtige Dateien (Auswahl)
- js/stl.js Geometrie und Überhanganalyse, js/orient.js Lagebewertung,
  js/viewer.js und js/miniview.js Einfärbung, js/app.js Teileliste und Ablauf,
  js/panel.js Datenblatt, js/fragility.js Fragilitätsanalyse, js/fragility-ui.js Anzeige.
- js/export3mf.js und js/engine.js: nicht ändern, außer der Auftrag verlangt es
  ausdrücklich. engine.js wird von Tests ohne die übrigen Dateien geladen.
- templates/ Orca-Vorlagen, tools/ Erzeugungsskripte (z. B. make-pruefkoerper.js),
  docs/ Handbuch-PDF und Bilder.

## Tests (Node)
node tests/compare-v4.js, import.js, orient.js, export-project.js, holes.js, fragility.js
- tests/ui-smoke.js läuft im Browser (Anleitung im Kopf der Datei).
- verify-3mf.js, verify-orca-printers.js, verify-custom-printer.js brauchen die
  OrcaSlicer-CLI und dauern lange: nur auf ausdrückliche Anfrage ausführen.
- Vor jeder Änderung die Tests laufen lassen, danach erneut. Bestehende Tests nicht
  abschwächen, um Fehler zu verdecken.
- Bekannt offen: Bedientests "Haftungsausschluss beim ersten Start" (schlägt fehl) und
  "Als Text kopieren" (wackelig). Nur auf ausdrücklichen Auftrag angehen.

## Regeln für Änderungen an Analyse und Geometrie
- Jeder Befund eines Prüf-Agenten bekommt einen eigenen Regressionstest mit unabhängig
  berechnetem Sollwert (aus der Konstruktion des Prüfkörpers, nicht aus der Ausgabe des Codes).
- Bekannte Grenzen einer Heuristik als Kommentar im Code und im HANDBUCH festhalten.
- Geometrie-Änderungen laufen durch den Prüf-Agenten, bevor sie committet werden.
- Regressionstest für Mehrteile-Projekte: 9_Teile_KobraS1_Slot3.3mf (Teile, Slots und
  Platten unverändert, Analyse nur für das gewählte Teil). Die Datei gehört nicht ins Repo
  (öffentlich, evtl. fremde Modell-Lizenz). Pfad über die Variable FRAG3MF=<Pfad>,
  testdaten/ steht in der .gitignore. Fehlt die Datei, wird der Test übersprungen und das in
  der Abschlussmeldung genannt. Pfad nie raten. Testdateien nie committen.
- Nach jedem Schritt Rechenzeit bei großen Netzen (rund 190.000 Dreiecke) nennen.

## Dokumentation
- Jede nennenswerte Änderung in CHANGELOG.md unter [Unreleased] (Neu / Geändert / Behoben,
  SemVer, deutsch, im Stil der bestehenden Einträge).
- Neue Funktionen im HANDBUCH.md und in der README (Testliste) ergänzen.
  Handbuch-PDF neu erzeugen mit: node tools/build-handbuch.js
- Haftungsausschluss nicht ohne Rückfrage ändern (löst eine erneute Bestätigung aus).

## Git und Veröffentlichung
- Vor Beginn git status prüfen. Offene fremde Änderungen nicht mitcommitten, nachfragen.
- Größere Funktionen auf eigenem Branch, getrennte Commits mit klaren Nachrichten.
- Nie pushen ohne meine ausdrückliche Freigabe (GitHub Pages ist sofort live).

## Sicherheit bei Befehlen
- Prozesse nur gezielt über die PID beenden, die du selbst gestartet hast.
  Nie über Fenstertitel, Programmnamen oder Filter, die fremde Programme treffen können.
- Keine breit wirkenden oder zerstörerischen Befehle (taskkill, rm -rf, git reset --hard,
  git clean) ohne vorherige Rückfrage mit dem genauen Befehl.

## Format der Abschlussmeldung
Vor jedem Commit ausdrücklich auflisten: neue und geänderte Tests, geänderte Dateien,
nicht angefasste Dateien (mindestens export3mf.js, engine.js), Ergebnis des
Mehrteile-Regressionstests und Rechenzeit, offene Punkte und bekannte Grenzen.
