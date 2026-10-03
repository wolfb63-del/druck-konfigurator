# Änderungen

Alle nennenswerten Änderungen am Druck-Konfigurator. Versionen folgen [SemVer](https://semver.org/lang/de/): Hauptversion bei grundlegenden Änderungen, Nebenversion bei neuen Funktionen, Patch bei Fehlerbehebungen.

## [Unreleased]

## [6.6.0] – 2026-10-03

### Neu
- **Objekt-Erkennung mit Vorauswahl:** Beim Laden schlägt das Tool die Objektart vor und begründet sie („Erkannt: … – …“): Farbwechsel nach Höhe (flache Platte mit mindestens 5 Wechseln → HueForge, sonst Mehrfarbig/Gravur; nur bei Projekten mit einem Teil), mehrere Slots (Mehrfarbig), deutliche Überhänge ab 10 % der Oberfläche (Freiform), dünne, hohle Wand bis 2,2 mm mittlere Dicke (Dünnwandiges Gehäuse). Ändert der Nutzer das Feld, bleibt seine Wahl bis zum nächsten Modell. Halterung, Präzision, wasserdicht, Funktionsteil und TPU-Arten bleiben seine Wahl.
- **Neue Objektart „HueForge / Bildplatte“:** 0,08 mm Schichten, 0,16 mm erste Schicht, 100 % Füllung mit Linien (rectilinear), obere/untere Schichten umgerechnet; Hinweis auf Farbwechsel und Reinigungsturm. Werte aus den HueForge-Anleitungen.
- **Filament nach Hersteller direkt beim Filament-Feld** (Hauptseite): „▾ Nach Hersteller wählen“ → Hersteller → Material legt ein eigenes Filament „Hersteller Material“ an und wählt es: Standardprofil des Typs (PLA, PETG, ABS, ASA, TPU, PLA-CF, PETG-CF) mit Düsen- und Betttemperatur aus der SpoolmanDB (häufigster Wert, Herstellerangabe, ungeprüft). Die übrigen Rechenwerte bleiben die des Standardprofils und sind für die Marke nicht getestet – das steht in den Notizen des Profils. Ein vorhandenes Profil wird nur gewählt, nie überschrieben.
- **Filament nach Hersteller wählen** (Dialog „Belegung eintragen“): unter jedem Slot **Aus Liste wählen** – Hersteller → Material → Farbe, 67 Hersteller und rund 4.700 Filamente (1,75 mm) aus der offenen [SpoolmanDB](https://github.com/Donkie/SpoolmanDB) (MIT-Lizenz, mitgeliefert, kein Abruf im Betrieb; die Liste lädt erst beim ersten Öffnen). Die Auswahl trägt Typ und Farbe des Slots ein, beides bleibt von Hand änderbar. Materialnamen wie „PLA+“ oder „ABS+MATTE“ werden den neun Typen des Tools zugeordnet; Unbekanntes (Holz, PVB, PEEK …) rechnet wie PLA, mit Hinweis. Die Temperaturen der Datenbank erscheinen nur als Herstellerangabe und fließen nicht in die Berechnung ein (bei Bereichsangaben die Mitte, bei vielen Herstellern fehlen sie). Neu erzeugen mit `node tools/make-filament-db.js`.
- **Reinigungslinie für die Düse** im Export-Dialog (Schalter, standardmäßig aus, je Drucker gemerkt): Der Start-G-Code der 3MF bekommt eine Doppelbahn (100 mm, Breite 1,2 × Düse) am Bettrand – **Auto** (Seite mit dem meisten Platz neben dem Objekt, Brim und Skirt eingerechnet), vorne, hinten, links oder rechts. Passt die Linie nicht, warnt der Dialog; wird trotzdem gespeichert, entfällt sie. Zieht der Start-G-Code schon eine Linie (z. B. beim Snapmaker U1), entsteht sie doppelt – der Dialog weist darauf hin.
- **Z-Offset je Drucker** im Export-Dialog: einmal eintragen (z. B. 0,25 mm beim Kobra S1), der Browser merkt ihn sich, jede 3MF startet in Orca mit diesem Wert. Leer = Wert der Vorlage (0); solange 0 mm gilt, warnt der Dialog, dass die erste Schicht sonst zu nah an der Platte liegen oder nicht haften kann.
- **Lightning-Füllung für Deko/Figur:** Objekt „Dekoration / Figur“ bekommt Lightning statt Gyroid (nicht bei hoher Belastung oder „Maximale Stabilität“). Orca-Gegenrechnung an einer Figur: 2 h 33 min → 1 h 57 min, 46 → 29 g.
- **Sprachwahl Deutsch/Englisch** (Knopf EN/DE in der Kopfzeile; ohne eigene Wahl nach der Browsersprache), die ganze Oberfläche: Menüs, Felder, Datenblatt samt Zusammenfassung, Hinweisen und Hilfetexten, Modell-Karte, Bohrlöcher, Lage, Stabilität, Export-Dialog und alle Dialoge; Zahlen im englischen Format. Orca-Begriffe wörtlich wie im englischen OrcaSlicer (aus Orcas Quellcode, per Test geprüft). Übersetzt wird an der Anzeige – Rechenkern und Export sind unverändert. Das Handbuch bleibt deutsch; rechtlich maßgeblich bleibt die deutsche Fassung.
- **Hell/Dunkel-Schalter** (Mond-/Sonnen-Knopf in der Kopfzeile): jede Ansicht gibt es hell und dunkel. Ohne eigene Wahl richtet sich die Seite nach der Einstellung von System bzw. Browser; Ausdruck/PDF bleibt hell.
- **Einsteiger-Hilfen** (in allen Ansichten): Schritt-Leiste „① Drucker → ② Modell laden → ③ Für OrcaSlicer speichern“ unter den Tabs, zeigt den aktuellen Schritt und springt per Klick dorthin; kurze Klartext-Hilfe unter Priorität, Belastung, Support und Stützreduzierung.
- **Datenschutz, Kontakt und Facebook-Link** in der Fußzeile und in der Hilfe. Die Datenschutzerklärung nennt Hosting bei GitHub Pages, lokale Verarbeitung der Modelle und Speicherung im Browser; keine Cookies, kein Tracking.
- **Fortschrittsbalken** während der Lage- und Stabilitätsrechnung (bei großen Modellen 2–3 s), in allen Ansichten; bei reduzierter Bewegung ruhend.
- **Oberfläche wählbar** (Menü **Ansicht** in der Kopfzeile; ein einmaliger Tipp beim ersten Start zeigt, wo): **Original**, **Verbesserte Lesbarkeit** (Standard: sichtbarer Fokus in der Kopfzeile, kräftigere Feldränder, keine Schrift unter 12 px, größere Klickfläche der „?“-Punkte, dunkleres Grün, Lade- und Fehlermeldungen werden vorgelesen) oder **Schlicht** (reduziert nach Apple-Prinzipien: helle Kopfzeile, Systemschrift, Flächen statt Linien, Pillen-Knöpfe; mit allen Lesbarkeits-Verbesserungen). In beiden neuen Stufen trägt die Kopfzeile das Logo „BW 3D-Druck“, der Browser-Tab ein 3D-Drucker-Symbol (`img/`). „Original“ stellt die bisherige Oberfläche unverändert wieder her; die Stile liegen getrennt in `css/ui-neu.css` und `css/ui-schlicht.css`.
- **Bohrlöcher verstärken auch bei 3MF-Projekten** (Orca, Bambu Studio, Makerworld): Der Kasten erscheint jetzt auch dort; angehakte Löcher bekommen in der übernommenen Datei einen Orca-Modifikator mit 100 % Füllung. Lage, Platten und Farben des Designers bleiben.

### Geändert
- **Kontakt:** Die E-Mail-Adresse steht als Text mit **Kopieren**-Knopf da statt als mailto-Link – der öffnete immer das Standard-Mailprogramm von Windows (oft Outlook), auch bei Nutzern, die im Browser mailen.
- **Einfache 3MF** ohne Orca-/Bambu-Projektdaten (z. B. aus Cura, PrusaSlicer, CAD) werden wie eine STL behandelt: nur die Form, mit Lage-Tasten und Lochverstärkung. Eine Bemalung aus PrusaSlicer geht dabei verloren.

### Behoben
- **Datenblatt und 3MF-Export stimmten bei Dateien mit Farbwechseln nach Höhe nicht überein:** Das Datenblatt zeigte die Schichthöhen des Tools (0,16 / 0,20 mm), der Export schrieb die der Datei (0,08 / 0,16 mm). Jetzt rechnet das Tool von Anfang an mit den Schichthöhen der Datei (Hinweis im Datenblatt), die Zeile „erste Schicht“ zeigt den tatsächlichen Wert.
- **Mehrfarbige Gravur (Farbwechsel nach Höhe) wurde beim Umstellen zerstört:** Das Tool setzte eigene Schichthöhen (0,2 / 0,16 mm statt 0,16 / 0,08 mm der Datei) und den gewählten Slot, die Wechsel blieben – mehrere Wechsel fielen in eine Schicht (0,72 / 0,80 / 0,88 mm), die Gravur ging verloren, die Farben stimmten nicht. Jetzt bleiben Schichthöhen und Slots der Datei, die Slots 1–4 tragen die Farben des Designers, obere/untere Schichten werden umgerechnet, „Alle Teile in den gewählten Slot“ ist bei solchen Dateien gesperrt. Mit der Orca-CLI an der BUHO-Datei geprüft: alle sieben Wechsel bei 0,72 / 0,80 / 0,88 / 1,20 / 1,36 / 1,52 / 1,92 mm, 36 Schichten à 0,08 mm (vorher 18 Schichten à 0,16 mm, Wechsel bei 0,84 / 1,00 / 1,32 / … verschoben).
- **Z-Offset kam in Orca nicht an:** Orca lädt beim Öffnen das Druckerprofil neu und übernimmt nur ausdrücklich als geändert markierte Werte – der Z-Offset wird jetzt so markiert.
- **Sehr große Modelle (über 1 Mio. Dreiecke) blockierten die Seite beim Laden ~20 s zusätzlich:** Die automatische Stabilitäts-Bewertung startet ab 300.000 Dreiecken nicht mehr von selbst („Stabilität: per Klick“), und ihr Zeitlimit greift jetzt auch in der Vorbereitung.
- **Große Modelle laden schneller:** Einlesen 3MF etwa 2–5×, Geometrie-Aufbereitung (verdeckte Innenflächen) etwa 2,5–3×, Bohrloch-Erkennung etwa 1,5× schneller (gemessen mit 1,25 Mio. Dreiecken, alt und neu abwechselnd). Ergebnisse unverändert (15 Teile aus 7 Dateien bitgleich verglichen).
- **Schritt-Leiste: „Drucker“ war immer abgehakt**, auch wenn nur der voreingestellte Kobra S1 aktiv war. Jetzt erst, wenn ein Drucker einmal angeklickt wurde (der Browser merkt es sich); ein Klick auf Schritt 1 hebt die Druckerwahl kurz hervor.
- **Slot-Wahl beim Speichern fehlte bei 3MF-Projekten:** Teile aus einer Makerworld-3MF bringen den Slot des Designers mit; der Dialog blendete die Wahl dann aus und die Datei landete ungefragt z. B. in Slot 4. Jetzt ist die Slot-Wahl immer da – mit „Alle Teile in den gewählten Slot“ (Standard bei einfarbigen Projekten) oder „Slots je Teil beibehalten“ (Standard, wenn die Teile verschiedene Slots haben).
- **Seite hing bei sehr detailreichen Modellen minutenlang** (z. B. feine Prägung neben großen Flächen): Stabilitäts- und Überhang-Analyse suchten in überfüllten Rasterzellen alle Dreiecke ab. Überfüllte Zellen bekommen jetzt ein feineres Unterraster – Ergebnisse unverändert (13 Teile aus 5 Dateien verglichen), Trommel-Segment mit 112.000 Dreiecken: Stabilität 161 s → 8 s, Geometrie 6,4 s → 1,6 s. Dauert die automatische Stabilitäts-Bewertung trotzdem länger als 4 s, bricht sie ab und lässt sich per Klick starten.
- **Hinweis „Die 3MF wurde von BambuStudio erstellt“** beim Öffnen umgestellter Makerworld-Projekte in Orca: Die Datei trägt jetzt die Orca-Kennung mit der Version der Vorlage – die Druckeinstellungen stammen ja aus der Orca-Vorlage. Die Herkunftsangabe des Designers bleibt erhalten.
- **Gespiegelte Objekte in 3MF** wurden mit nach innen zeigenden Flächen eingelesen: Löcher wurden dort nicht erkannt, Überhänge falsch bewertet.

## [6.5.0] – 2026-10-02

### Neu
- **Stabilitäts-Ansicht** in der 3D-Ansicht (Umschalter Überhang | Stabilität): Farbkarte für dünne Wände und schlanke Stellen in Z je Teil (grün / gelb / rot), mit Kurzbewertung. Schwellen hängen an der Linienbreite der gewählten Düse (bei 0,4 mm: dünn unter ≈ 1,7 mm, kritisch unter ≈ 0,8 mm).
- **Stabilitäts-Kennzahl in der Teileliste** (stabil / schwach / kritisch mit dünnster Wand bzw. „Z“), Teil für Teil im Hintergrund berechnet.
- **Stabilitäts-Hinweise mit Vorschlag** in der Modell-Karte (auch bei nur einem Teil) und im Datenblatt: Wand verstärken, liegende Lage, mehr Wände/Füllung. Dazu ein Hinweis, wenn der Ausrichtungsvorschlag ein kritisches Teil in Z schwächt.
- Alles nur als **Näherung aus der Geometrie**, keine Festigkeitsberechnung: Druckwerte, Slots und 3MF-Export bleiben unverändert.
- Prüfkörper zum Nachdrucken: `node tools/make-pruefkoerper.js` erzeugt `testdaten/stabilitaet-pruefkoerper.stl`.

### Behoben
- **Mehrfarbige 3MF aus Teilen** (ein Objekt, dessen Teile verschiedene Slots haben, z. B. Schild in Weiß + Relief in Schwarz): wurden im Tool zu einem Teil zusammengefasst, Farben/Slots waren nicht sichtbar, und die berechneten Filamentwerte landeten im Slot des Objekts statt in den tatsächlich gedruckten Slots. Jetzt erscheint jedes Teil einzeln mit Namen und Slot (Teileliste, 3D-Ansicht), der Slot lässt sich je Teil ändern, und der Export setzt ihn am Teil selbst. Gegen die Orca-CLI geprüft: Druck bleibt zweifarbig, ein umgestellter Slot kommt im G-Code an.

### Bekannte Einschränkungen
- Stabilität: Steht ein Teilstück im Loch eines anderen (z. B. Stift in einem Rohr), kann die Stelle schwächer erscheinen, als sie ist. Waagerechte Strukturen dünner als ≈ 0,2 mm werden in Z übersehen, als dünne Wand aber markiert.
- Die Schwellen sind Startwerte und noch nicht durch Testdrucke bestätigt.

## [6.4.1] – 2026-09-30

### Behoben
- Druckerauswahl ließ sich nicht öffnen, wenn ein eigener Drucker noch aus einer Entwicklungsversion im Browser gespeichert war (Fehler „undefined is not valid JSON“, betraf vor allem die lokal geöffnete Version). Alte Einträge werden jetzt beim Start automatisch umgewandelt, unbrauchbare verworfen.

## [6.4.0] – 2026-09-30

### Neu
- **Teile in der 3D-Ansicht wechseln:** Bei Projekten mit mehreren Teilen oben links eine Auswahl mit ◀ / ▶ – bisher ging das nur über die Teileliste im Einstellungs-Tab.

## [6.3.1] – 2026-09-29

### Geändert
- „Dein Drucker ist nicht dabei?“ in der Druckerauswahl deutlich sichtbarer: farbiger Kasten mit Knopf direkt unter dem Suchfeld statt kleinem grauem Text unter der Liste; findet die Suche nichts, verweist auch die leere Liste darauf.

## [6.3.0] – 2026-09-29

### Neu
- **Eigener Drucker:** Wer seinen Drucker nicht unter den rund 990 findet, klickt in der Auswahl auf „Eigenes Orca-Profil verwenden“. Eine Anleitung führt durch die Schritte (Drucker in OrcaSlicer anlegen → leeres Projekt → „Projekt speichern unter“ → Datei einlesen). Das Tool liest das Profil direkt aus der 3MF, der Drucker bleibt im Browser gespeichert. Gegen die Orca-CLI geprüft (`tests/verify-custom-printer.js`). Einschränkung: Filamentprofile werden nicht nach Materialtyp gewechselt. Alle eigenen Drucker stehen in der Auswahl unter „★ Eigene Drucker“ (wieder wählbar, entfernbar). Makerworld-Dateien werden hier erkannt und mit Hinweis auf „Modell öffnen“ abgelehnt – sie enthalten das Profil des Designers, nicht den gewählten Drucker.
- **Passgenauigkeit deutlicher sichtbar:** der Hinweis zur X-Y-Konturkompensation steht jetzt in der roten „Achtung“-Box statt versteckt bei den Hinweisen – bei „Präzisionsteil“ wie bisher, zusätzlich automatisch bei jedem Teil mit kleinen runden Löchern (⌀ bis 6 mm, z. B. Wellen/Stifte/Lager), unabhängig vom gewählten Objekttyp. Keine Zahnrad-Erkennung (zu unsicher/fehleranfällig), nur ein Hinweis anhand vorhandener Löcher – Kompensationswerte selbst bleiben Handarbeit in OrcaSlicer.

- **0,2-mm-Düse:** neu wählbar (bisher gab es nur 0,25 mm, die seltenere Größe – in den OrcaSlicer-Profilen haben 105 Drucker eine 0,2-mm-Variante, nur 30 eine 0,25-mm). Werte aus den Mittelwerten dieser 105 Orca-Profile: Schichthöhe 0,10 mm, erste Schicht 0,12 mm, Linienbreite 0,22 mm, Volumenstrom 0,12 × 0,4-mm-Wert. Damit sind auch die Katalog-Drucker mit 0,2-mm-Profil (z. B. Snapmaker U1 0,2) nicht mehr gesperrt. 0,25 mm bleibt. Hinweise zu feinen Düsen (Faserfilament, Druckzeit) gelten jetzt für beide.

### Behoben
- Hinweis „Anycubic bietet die 0,25-mm-Düse für den S1 als Messingdüse an“ entfernt – nicht belegbar, in OrcaSlicer gibt es 0,25 mm nur für den Kobra S1 Max.
- Test `verify-orca-printers.js` rechnete für jeden Drucker mit 0,4-mm-Düse, auch bei Druckern mit feinerer Düse – dadurch schlugen alle 0,2-/0,25-mm-Drucker scheinbar fehl. Jetzt mit der Düse des Druckers wie im Tool.
- Bereinigung der Orca-Einstellungen: `machine_max_junction_deviation` wird nicht mehr auf zwei Werte aufgefüllt und `thumbnails` bleibt Text – beides ließ die Orca-CLI ohne Fehlermeldung abstürzen (gefunden beim eigenen Drucker, betrifft die gemeinsame Funktion auch für Katalog-Drucker).

## [6.2.0] – 2026-09-27

### Geändert
- **Drucker-Verbindung im Profil-Menü besser erklärt:** deutlich, dass das nur mit Klipper/Moonraker geht (nicht mit Werksfirmware), mit Links zu den nötigen Fremd-Firmwares – Rinkhals beim Kobra S1, die Extended Firmware von paxx12 beim Snapmaker U1. Ohne Moonraker der Hinweis auf "Belegung eintragen" als Alternative. Handbuch und README korrigiert (U1 brauchte bisher fälschlich keine erwähnte Fremd-Firmware).

## [6.1.0] – 2026-09-27

### Geändert
- **3MF-Export deutlich sichtbarer:** eigener Aufruf-Kasten mit Beschreibung und Knopf direkt oben im Datenblatt (bisher nur im Menü versteckt). Im Export-Dialog eine kurze Schritt-für-Schritt-Anleitung (Slot wählen → speichern → in OrcaSlicer über "Projekt öffnen" laden).

## [6.0.0] – 2026-09-27

### Neu
- **Rund 990 Drucker von 63 Herstellern** aus den OrcaSlicer-Profilen: Auswahl „Anderer Drucker …“ mit Suche. Geschwindigkeiten, Beschleunigung und Volumenstrom werden auf das Orca-Profil des Druckers begrenzt; die 3MF enthält dessen Drucker-, Prozess- und Filamentprofile. Herstellerdaten werden erst bei Bedarf geladen.
- Warnung, wenn der Start-G-Code eines Herstellerprofils fest auf eine Temperatur heizt.
- Filamentprofile je Slot bringen ihre Werte in die 3MF mit (auch für die Orca-Kommandozeile).

### Geprüft
- Mit der OrcaSlicer-CLI: je ein Drucker pro Hersteller sowie eine Stichprobe von Mehrkopf-Druckern (Bambu, Prusa XL, IDEX) – Bettmitte, Düsentemperatur, Geschwindigkeit, G-Code-Art, Start-G-Code. `tests/verify-orca-printers.js`.

### Bekannte Einschränkung
- Bei einer kleinen Zahl älterer Anycubic-Profile mit „marlin“-Firmware (z. B. Kobra Max, Kobra Plus) bricht die Orca-Kommandozeile beim Slicen ab; Ursache nicht abschließend geklärt. Betroffen sind eher gleichnamige Modelle mit Klipper-Nachfolgeprofil, das funktioniert.

## [5.8.0] – 2026-09-27

### Neu
- **Online-Version** über GitHub Pages: https://wolfb63-del.github.io/druck-konfigurator/ (ohne Live-Abfrage vom Drucker; „Vom Drucker laden“ erklärt dort, warum).
- Dokumentation: läuft auch unter macOS und Linux (nicht getestet); Start der Live-Abfrage dort mit `python3 tools/serve.py`.
- **Kleine 3D-Vorschau** unter der Modell-Karte: zeigt das gewählte Teil in seiner aktuellen Lage auf dem Bett, Überhänge rot – Auswirkungen von Drehen und Lage-Vorschlag sofort sichtbar, ohne in die 3D-Ansicht zu wechseln.

## [5.7.0] – 2026-09-26

### Neu
- **Objektart „Wasserdicht / Behälter“:** mindestens 4 Wandlinien, 5/6 Deck-/Bodenschichten, +5 °C, Außenwand 30 % langsamer, in der 3MF „Lückenfüllung überall“ und „Vertikale Schalendicke sicherstellen“; Hinweise zu Vasenmodus und Epoxid. Mit der OrcaSlicer-CLI geprüft.

## [5.6.0] – 2026-09-26

### Neu
- **Haftungsausschluss:** beim ersten Start im Tool zu bestätigen (erscheint erneut, wenn er sich inhaltlich ändert), jederzeit über **? → Haftungsausschluss** und die Fußzeile erreichbar; ausführlich in der README.

### Behoben
- Export-Dialog: „unbekannt“ statt abgeschnittenem Slot-Text, kein doppeltes „2 Teile (2 Teile)“.

## [5.5.0] – 2026-09-26

### Geändert
- **Drei Spalten** auf breiten Bildschirmen: Auswahl | Modell (Teile, Lage, Bohrlöcher) | Datenblatt – alle Modell-Einstellungen ohne Scrollen sichtbar. Unter 1240 px steht das Modell unter der Auswahl.

## [5.4.1] – 2026-09-26

### Geändert
- **Rückzug bleibt beim Orca-Standard** (Filament- bzw. Druckerprofil) und wird nicht mehr überschrieben – er hängt von Filament, Temperatur und Extruder ab. Das Datenblatt zeigt „Orca-Standard“ mit dem S1-Testwert als Richtwert. Damit gilt beim U1 wieder dessen eigener Rückzug (z. B. 1,5 mm).
- Export-Dialog: Hinweis über der Slot-Auswahl nennt das gewählte Filament („Wähle den Slot, in dem dein PETG steckt“).

## [5.4.0] – 2026-09-26

### Neu
- **Beschleunigung** in der 3MF, wenn das Datenblatt eine vorgibt (TPU: 800 mm/s² für Wände, Füllung und Flächen; Fahrten und erste Schicht bleiben). Mit der OrcaSlicer-CLI geprüft – die Wände werden tatsächlich höchstens mit diesem Wert gedruckt.

### Geändert
- Slot-Auswahl zeigt den Filamenttyp nur noch, wenn er wirklich bekannt ist (live vom Drucker oder selbst eingetragen). Die Typen aus der Orca-Vorlage werden nicht mehr angezeigt – sie spiegeln nicht wider, was gerade im Drucker steckt.

### Behoben
- Bei vielen Teilen war der untere Teil der linken Spalte (Teileliste, Lage, Bohrlöcher) nicht erreichbar. Die Spalte hat jetzt eine eigene Laufleiste.

## [5.3.0] – 2026-09-26

### Neu
- **Lüfter erste Schicht, Rückzug und Z-Hop** landen jetzt in der 3MF – als Filamentwert je Slot, das Druckerprofil bleibt unverändert. Mit der OrcaSlicer-CLI geprüft, beim Rückzug auch in den tatsächlichen G-Code-Befehlen.

### Hinweis
- Beim Snapmaker U1 ersetzen die Rückzugswerte des Tools (0,6–0,8 mm, aus den Kobra-S1-Tests) die 1,5 mm aus dem U1-Druckerprofil. Bei Fäden am U1 den Rückzug in „Werte anpassen“ erhöhen.

## [5.2.0] – 2026-09-26

### Neu
- **Filament-Belegung von Hand eintragen** (Export-Dialog → „Belegung eintragen“): Typ und Farbe je Slot, bleibt gespeichert. Damit funktionieren Slot-Hinweise, Presets und mehrfarbige Projekte auch mit Originalfirmware, ohne Live-Abfrage.

### Geändert
- Start per Doppelklick auf `index.html` ist der Normalfall; Python wird nur noch für die Live-Abfrage (Rinkhals/Moonraker) gebraucht.

## [5.1.0] – 2026-09-26

### Neu
- **Bohrlöcher verstärken:** Das Tool erkennt runde Löcher (senkrecht und waagerecht) und schlägt sie mit Häkchen vor. Angehakte Löcher bekommen im 3MF einen Orca-Modifikator – Ring von 3 mm mit 100 % Füllung. Mit der OrcaSlicer-CLI geprüft.

### Geändert
- Anleitungen und Datenblatt nennen für beide Drucker OrcaSlicer.

## [5.0.0] – 2026-09-26

Erste veröffentlichte Version. Basis ist der Druck-Konfigurator v4 (eine HTML-Datei), jetzt als Werkzeug mit 3D-Ansicht und direktem Export für OrcaSlicer.

### Neu
- **Oberfläche:** Druckerumschaltung Kobra S1 / Snapmaker U1 im Kopf, Menüs Datei/Profile/Export, Registerkarten Einstellungen und 3D-Ansicht, aufklappbares Datenblatt.
- **3MF-Export für OrcaSlicer:** auf Basis gespeicherter Orca-Vorlagen je Drucker; berechnete Filament-, Prozess- und Stützwerte, Slot wählbar, Liste aller Änderungen. Werte bleiben beim Öffnen in der Orca-Oberfläche erhalten.
- **Filament-Belegung live vom Drucker** über Moonraker (nur lesend), Start über `Konfigurator starten.cmd`.
- **Import:** STL mit mehreren Körpern, mehrere Dateien, ZIP (z. B. Makerworld), 3MF.
- **Mehrere Teile:** Teileliste; Filament, Objektart, Priorität, Support und Slot je Teil; abweichende Werte als Orca-Objekt-Einstellung.
- **Lage auf dem Bett:** Vorschlag der besten Auflagefläche (Stützen auf dem Teil zählen dreifach), Fläche anklicken, 90°-Tasten.
- **Stützen:** alle Stützwerte in der 3MF; Abstand zum Teil = Schichthöhe, PETG +0,05 mm.
- **Makerworld-3MF umstellen:** Bambu-Einstellungen durch das eigene S1-/U1-Profil ersetzen, Platten, Farben und Bemalung behalten, jede Platte auf die Bettmitte.
- **Handbuch** (`HANDBUCH.md`, `docs/Handbuch.pdf`).

### Geprüft
- Gleiche Eingabe → gleiches Ergebnis wie v4 (47.920 Kombinationen, `tests/compare-v4.js`).
- Export gegen die echte OrcaSlicer-Kommandozeile: jeder Wert im G-Code, Slots, Temperaturbefehle, Lage und Höhe auf dem Bett, Stützen je Teil, Makerworld-Projekt auf S1 und U1 (`tests/verify-3mf.js`).
- Bedientest aller Funktionen im Browser (`tests/ui-smoke.js`).

### Bekannte Grenzen
- 3MF-Export nur mit 0,4-mm-Düse.
- U1-Werte sind nicht am U1 gegengetestet.
- Schichthöhe gilt in Orca für die ganze Platte.
