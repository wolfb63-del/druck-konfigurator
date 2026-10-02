'use strict';
/* Bedientest wie ein Nutzer: klickt sich durch alle Funktionen der laufenden Seite.
   In die Seite laden (Konsole oder Testwerkzeug):
     await new Promise(r=>{const s=document.createElement('script');s.src='tests/ui-smoke.js?'+Date.now();s.onload=r;document.head.appendChild(s)});
     await runSmoke()
   Downloads werden abgefangen und inhaltlich geprüft; confirm/alert/print sind Attrappen. */
async function runSmoke(opts={}){
  const log=[],fail=[];
  const ok=(cond,msg)=>{(cond?log:fail).push((cond?'ok   ':'FEHL ')+msg)};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const sel=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new Event('change',{bubbles:true}))};
  const errors=[];window.addEventListener('error',e=>errors.push(e.message));

  // Attrappen
  const downloads=[];const origClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){if(this.download){downloads.push({name:this.download,href:this.href});return}return origClick.call(this)};
  const origRevoke=URL.revokeObjectURL;URL.revokeObjectURL=()=>{}; // Downloads bleiben lesbar
  const alerts=[];window.alert=m=>alerts.push(m);window.confirm=()=>true;
  let printed=0;window.print=()=>{window.dispatchEvent(new Event('beforeprint'));printed++;window.dispatchEvent(new Event('afterprint'))};
  const blobText=async d=>(await fetch(d.href)).text();
  const blobBytes=async d=>new Uint8Array(await (await fetch(d.href)).arrayBuffer());
  const menuClick=id=>{const b=$(id);b.closest('.menu').querySelector('.menu-btn').click();b.click()};

  // Testmodell als echte Datei über Drag&Drop
  function stlFile(name,boxes){
    const tris=[];for(const [x0,y0,z0,x1,y1,z1] of boxes){const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].forEach(t=>tris.push(t.map(i=>v[i])))}
    const buf=new ArrayBuffer(84+tris.length*50),dv=new DataView(buf);dv.setUint32(80,tris.length,true);
    tris.forEach((t,i)=>t.flat().forEach((c,j)=>dv.setFloat32(84+i*50+12+j*4,c,true)));
    return new File([buf],name);
  }
  async function dropFile(...files){const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));document.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));await wait(150)}

  // Ohne Live-Abfrage beginnen: die Prüfungen bis Abschnitt 13 erwarten die Slots der Vorlage
  const savedHosts=store.settings.printerHosts;store.settings.printerHosts={};slotState={printer:null,live:null,note:''};

  /* 0) Haftungsausschluss beim ersten Start (Test lädt mit leerem Speicher) */
  ok($('disclaimerDlg').open,'Haftungsausschluss beim ersten Start sichtbar');
  $('disclaimerOk').click();
  ok(!$('disclaimerDlg').open&&localStorage.getItem('druckKonfigurator.disclaimer')==='1','„Verstanden“ schließt und merkt es sich');
  document.querySelector('.footnote [data-action="disclaimer"]').click();
  ok($('disclaimerDlg').open,'Haftungsausschluss über die Fußzeile erreichbar');$('disclaimerDlg').close();

  /* 1) Startzustand */
  ok(document.body.dataset.printer==='kobra_s1','Start: Kobra S1 aktiv');
  ok($('title').textContent.includes('Anycubic PLA High Speed'),'Start: PLA High Speed gewählt');
  ok($('matBadge').textContent==='Getestet','Start: Badge „Getestet“');
  ok($('export3mf').disabled&&$('export3mfNote').textContent.includes('Modell'),'3MF-Menüpunkt ohne Modell gesperrt mit Grund');

  /* 2) Druckerwechsel */
  document.querySelector('.printer-switch [data-printer="snapmaker_u1"]').click();await wait(50);
  ok(document.body.dataset.printer==='snapmaker_u1','Umschalten auf U1 färbt um');
  ok([...$('nozM').options].map(o=>o.value).join()==='steel_stainless,steel_hardened','U1: Düsenmaterialien Edelstahl/gehärtet');
  ok($('matBadge').textContent==='Allgemeiner Startwert','U1: getestetes Profil gilt als allgemein');
  ok($('warning').innerHTML.includes('Snapmaker U1'),'U1: Warnhinweis „nicht gegengetestet“');
  ok($('orderedTitle').textContent.includes('OrcaSlicer'),'U1: Slicer-Reihenfolge OrcaSlicer');
  const sw=document.querySelector('.printer-switch');sw.querySelector('[aria-checked="true"]').focus();
  sw.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await wait(30);
  ok(document.body.dataset.printer==='kobra_s1','Pfeiltaste wechselt Drucker zurück');

  /* 3) Alle Auswahloptionen durchspielen */
  let combos=0;
  for(const m of [...$('material').options].map(o=>o.value))for(const o of [...$('object').options].map(o=>o.value)){sel('material',m);sel('object',o);combos++}
  for(const id of ['goal','load','support','supportLevel'])for(const v of [...$(id).options].map(o=>o.value)){sel(id,v);combos++}
  ok(errors.length===0,combos+' Auswahlkombinationen ohne Fehler');
  sel('material','pla_hs');sel('object','general');sel('goal','balanced');sel('load','medium');sel('support','auto');sel('supportLevel','balanced');
  sel('supportLevel','minimal');ok($('thresh').value==='55','Stützreduzierung „Minimal“ setzt Überhangwinkel 55°');sel('supportLevel','balanced');
  sel('material','pla_cf');ok($('danger').textContent==='' ,'PLA-CF mit gehärteter Düse: keine Gefahrenwarnung');
  sel('nozM','brass');ok($('danger').textContent.includes('schleift'),'PLA-CF mit Messing: Gefahrenwarnung');
  sel('nozM','steel_hardened');sel('material','pla_hs');

  /* 4) Düsengrößen */
  for(const d of ['0.2','0.25','0.6','0.8']){sel('nozD',d);ok($('warning').innerHTML.includes('Umgerechnet'),'Düse '+d+': Umrechnungshinweis')}
  sel('nozD','0.4');

  /* 5) Modell laden */
  await dropFile(new File(['x'],'test.obj'));ok($('fileinfo').textContent.includes('nur STL, 3MF oder ZIP'),'Falsches Format wird abgelehnt');
  await dropFile(new File(['x'],'teil.3mf'));ok($('fileinfo').textContent.includes('konnte nicht gelesen'),'Kaputte 3MF: verständliche Fehlermeldung');
  // Mehrere Teile: zwei STLs plus ZIP mit einer STL mit zwei getrennten Körpern
  const zipBytes=fflate.zipSync({'set/doppel.stl':new Uint8Array(await stlFile('d.stl',[[0,0,0,10,10,10],[30,0,0,40,10,4]]).arrayBuffer())});
  await dropFile(stlFile('a.stl',[[0,0,0,20,20,20]]),stlFile('b.stl',[[0,0,0,5,5,30]]),new File([zipBytes],'paket.zip'));await wait(150);
  const items=[...$('partList').querySelectorAll('[data-part]')];
  ok(!$('partList').classList.contains('hidden')&&items.length===4,'Mehrere Dateien + ZIP: Teileliste mit '+items.length+' Teilen');
  ok(items[2]&&items[2].textContent.includes('doppel.stl · Teil 1'),'Körper einer STL als eigene Teile');
  ok(items[0].getAttribute('aria-current')==='true'&&geom.name==='a.stl','Erstes Teil ist gewählt');
  items[1].click();await wait(50);
  ok(geom.name==='b.stl'&&$('partList').querySelector('[data-part="1"]').getAttribute('aria-current')==='true','Klick wählt Teil 2');
  ok($('summary').textContent.includes('30'),'Datenblatt zeigt Maße von Teil 2');
  // Werte je Teil: Teil 2 bekommt PETG, Halterung und Slot 2 – Teil 1 behält seine Auswahl
  ok(!$('partScope').classList.contains('hidden')&&$('partScopeName').textContent==='b.stl','Formular zeigt, für welches Teil es gilt');
  sel('material','petg');sel('object','holder');
  $('partSlot').value='1';$('partSlot').dispatchEvent(new Event('change'));
  $('partList').querySelector('[data-part="0"]').click();await wait(50);
  ok($('material').value==='pla_hs'&&$('object').value==='general','Teil 1 behält eigene Auswahl ('+$('material').value+'/'+$('object').value+')');
  $('partList').querySelector('[data-part="1"]').click();await wait(50);
  ok($('material').value==='petg'&&$('object').value==='holder'&&$('partSlot').value==='1','Teil 2: PETG, Halterung, Slot 2 gemerkt');
  ok($('partList').querySelector('[data-part="1"]').textContent.includes('Slot 2'),'Teileliste zeigt Slot von Teil 2');
  for(let t=0;t<50&&$('partList').querySelector('.pstab.wait');t++)await wait(100);
  ok([...$('partList').querySelectorAll('.pstab')].length===items.length&&!$('partList').querySelector('.pstab.wait,.pstab.err'),'Teileliste: Stabilitäts-Kennzahl für jedes Teil');
  const lastBefore=JSON.parse(JSON.stringify(store.last));
  menuClick('export3mf');await wait(50);
  ok(!$('partPlan').classList.contains('hidden')&&$('partPlanTable').querySelectorAll('tbody tr').length===4,'Export-Dialog: Tabelle mit 4 Teilen');
  ok(/PETG/.test($('partPlanTable').textContent)&&$('slotLegend').textContent.includes('Standard'),'Tabelle zeigt PETG-Teil, Standard-Slot beschriftet');
  $('export3mfSave').click();await wait(100);
  store.last=lastBefore;persist(); // gemerkten Slot nicht verstellen, spätere Prüfungen hängen daran
  const fm=downloads.filter(d=>d.name.endsWith('.3mf')).pop();
  {const z=fflate.unzipSync(await blobBytes(fm));const msx=fflate.strFromU8(z['Metadata/model_settings.config']);
   ok((msx.match(/<object id=/g)||[]).length===4&&Object.keys(z).filter(k=>k.startsWith('3D/Objects/')).length===4,'3MF mit 4 Objekten ('+fm.name+')');
   ok((msx.match(/key="extruder" value="2"/g)||[]).length===1&&/_2Slots\.3mf$/.test(fm.name),'Teil 2 auf Slot 2, Dateiname nennt 2 Slots');
   const ps=JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config']));
   ok(ps.filament_type[1]==='PETG'&&/key="wall_loops"/.test(msx),'Slot 2 = PETG, eigene Werte als Objekt-Einstellung')}
  $('clear').click();await wait(50);
  ok($('partList').classList.contains('hidden')&&!project,'Leeren entfernt die Teileliste');
  /* Makerworld-3MF: zwei Objekte auf zwei Platten, für Bambu eingestellt → S1-Einstellungen, Platten bleiben */
  { const u8=s=>fflate.strToU8(s);
    const cubeXml=(id,s)=>{const b=[[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];const f=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
      return '<object id="'+id+'" type="model"><mesh><vertices>'+b.map(v=>'<vertex x="'+v[0]+'" y="'+v[1]+'" z="'+v[2]+'"/>').join('')+'</vertices><triangles>'+f.map(t=>'<triangle v1="'+t[0]+'" v2="'+t[1]+'" v3="'+t[2]+'"/>').join('')+'</triangles></mesh></object>'};
    const zipBytes2=fflate.zipSync({'_rels/.rels':u8('<Relationships><Relationship Target="/3D/3dmodel.model" Id="rel-1"/></Relationships>'),
      '3D/3dmodel.model':u8('<?xml version="1.0"?><model unit="millimeter" xmlns:p="x"><resources>'+cubeXml(1,20)+cubeXml(2,10)+'</resources><build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 128 128 0"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 435.2 128 0"/></build></model>'),
      'Metadata/model_settings.config':u8('<?xml version="1.0"?><config><object id="1"><metadata key="name" value="Gross"/><metadata key="extruder" value="2"/><metadata key="enable_support" value="1"/><part id="1" subtype="normal_part"></part></object><object id="2"><metadata key="name" value="Klein"/><metadata key="extruder" value="1"/><part id="2" subtype="normal_part"></part></object>'+
        '<plate><metadata key="plater_id" value="1"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate><plate><metadata key="plater_id" value="2"/><model_instance><metadata key="object_id" value="2"/></model_instance></plate></config>'),
      'Metadata/project_settings.config':u8('{"printer_settings_id":"Bambu Lab X1 Carbon 0.4 nozzle"}'),'Metadata/plate_1.gcode':u8('; alt')});
    await dropFile(new File([zipBytes2],'makerworld.3mf'));await wait(300);
    ok(project&&project.threemf&&project.parts.length===2&&project.parts[0].slot===1,'Makerworld-3MF geladen: 2 Teile, Slot des Designers übernommen');
    ok($('orientInfo').textContent.includes('bleibt erhalten')&&document.querySelector('.orient-tools [data-orient="x"]').disabled,'3MF: Lage bleibt, Drehen gesperrt');
    menuClick('export3mf');await wait(50);
    ok($('exportSub').textContent.includes('Bambu Lab X1 Carbon')&&document.querySelector('#exportDlg fieldset.slots').classList.contains('hidden'),'Dialog: Bambu-Einstellungen werden ersetzt, kein Standard-Slot nötig');
    $('export3mfSave').click();await wait(150);
    const fz=downloads.filter(d=>d.name.endsWith('.3mf')).pop(),z=fflate.unzipSync(await blobBytes(fz));
    const ps=JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config'])),msx=fflate.strFromU8(z['Metadata/model_settings.config']),root=fflate.strFromU8(z['3D/3dmodel.model']);
    ok(ps.printer_settings_id===exportTemplate('kobra_s1','0.4').printerPreset&&!z['Metadata/plate_1.gcode'],'Export: S1-Druckerprofil, alter G-Code entfernt');
    ok(/<object id="1">[\s\S]*?key="extruder" value="2"/.test(msx)&&!/key="enable_support" value="1"/.test(msx),'Export: Slot bleibt, Stützen-Vorgabe des Designers durch eigene Analyse ersetzt');
    ok(/transform="1 0 0 0 1 0 0 0 1 115 115 0"/.test(root)&&/transform="1 0 0 0 1 0 0 0 1 420 120 0"/.test(root),'Export: beide Platten auf die S1-Bettmitte gerückt');
    $('clear').click();await wait(50);}
  /* Bohrlöcher: Platte mit Loch Ø 5 → Vorschlag mit Häkchen, angehakt → Modifikator in der 3MF */
  { const tris=[],h=6,r=2.5,n=32,sq=a=>{const c=Math.cos(a),s=Math.sin(a),k=20/Math.max(Math.abs(c),Math.abs(s));return [20+k*c,20+k*s]},ci=a=>[20+r*Math.cos(a),20+r*Math.sin(a)];
    for(let i=0;i<n;i++){const a=2*Math.PI*i/n,b=2*Math.PI*(i+1)/n,[oa,ob,ia,ib]=[sq(a),sq(b),ci(a),ci(b)];
      tris.push([[...ia,h],[...oa,h],[...ob,h]],[[...ia,h],[...ob,h],[...ib,h]],[[...ia,0],[...ob,0],[...oa,0]],[[...ia,0],[...ib,0],[...ob,0]],[[...oa,0],[...ob,0],[...ob,h]],[[...oa,0],[...ob,h],[...oa,h]],[[...ia,0],[...ib,h],[...ib,0]],[[...ia,0],[...ia,h],[...ib,h]])}
    const buf=new ArrayBuffer(84+tris.length*50),dv=new DataView(buf);dv.setUint32(80,tris.length,true);tris.forEach((t,i)=>t.flat().forEach((c,j)=>dv.setFloat32(84+i*50+12+j*4,c,true)));
    await dropFile(new File([buf],'lochplatte.stl'));await wait(300);
    const cbs=[...$('holeList').querySelectorAll('[data-hole]')];
    ok(!$('holeBox').classList.contains('hidden')&&cbs.length===1&&!cbs[0].checked&&/Ø 5,0 mm/.test($('holeList').textContent),'Bohrloch vorgeschlagen, Häkchen nicht gesetzt ('+$('holeList').textContent.trim().slice(0,40)+')');
    menuClick('export3mf');await wait(50);$('export3mfSave').click();await wait(100);
    let z=fflate.unzipSync(await blobBytes(downloads.filter(d=>d.name.endsWith('.3mf')).pop()));
    ok(!/modifier_part/.test(fflate.strFromU8(z['Metadata/model_settings.config'])),'Ohne Häkchen: kein Modifikator');
    cbs[0].click();await wait(30);
    menuClick('export3mf');await wait(50);$('export3mfSave').click();await wait(100);
    z=fflate.unzipSync(await blobBytes(downloads.filter(d=>d.name.endsWith('.3mf')).pop()));
    const msh=fflate.strFromU8(z['Metadata/model_settings.config']);
    ok(/modifier_part/.test(msh)&&/sparse_infill_density" value="100%"/.test(msh),'Mit Häkchen: Modifikator mit 100 % Füllung');
    document.querySelector('.orient-tools [data-orient="x"]').click();await wait(80);
    ok(!project.parts[0].holes.length&&$('holeList').querySelectorAll('[data-hole]').length===1,'Nach Drehung neu erkannt, Auswahl zurückgesetzt');
    $('clear').click();await wait(50);}
  sel('material','pla_hs');sel('object','general'); // Ausgangslage für die folgenden Prüfungen

  /* Ausrichtung: Pilz steht auf dem Stiel → Vorschlag Hut aufs Bett */
  await dropFile(stlFile('pilz.stl',[[15,15,0,25,25,20],[0,0,20,40,40,25]]));await wait(300);
  ok(!$('orientBox').classList.contains('hidden')&&/Stützen/.test($('orientInfo').textContent),'Ausrichtung: aktuelle Lage bewertet ('+$('orientInfo').textContent+')');
  ok(!$('orientSuggest').classList.contains('hidden'),'Ausrichtung: Vorschlag angezeigt');
  ok(!$('miniView').classList.contains('hidden')&&$('miniView').querySelector('canvas')&&$('miniView').clientHeight>100,'Kleine 3D-Vorschau in der Modell-Spalte sichtbar');
  $('orientSuggest').querySelector('[data-orient="apply"]').click();await wait(300);
  ok(Math.abs(geom.z-25)<1e-3&&analyze(geom,45).level==='none'&&$('orientSuggest').classList.contains('hidden'),'Vorschlag übernommen: keine Stützen mehr ('+$('orientInfo').textContent+')');
  document.querySelector('.orient-tools [data-orient="x"]').click();await wait(50);
  ok(Math.abs(geom.z-40)<1e-3,'↻ X: 90° gedreht (Höhe '+de(geom.z,1)+')');
  document.querySelector('.orient-tools [data-orient="reset"]').click();await wait(50);
  ok(Math.abs(geom.z-25)<1e-3&&Math.abs(geom.bedArea-100)<1,'Original: Lage aus der Datei');
  { let cb=null;const orig=Viewer.setPick;Viewer.setPick=(on,f)=>{cb=f};
    document.querySelector('.orient-tools [data-orient="pick"]').click();await wait(30);
    ok(document.body.dataset.tab==='3d'&&typeof cb==='function','Fläche aufs Bett: 3D-Ansicht mit Auswahlmodus');
    // oberste Fläche des Huts (z = 25, Normale nach oben) anklicken
    const top=[...Array(geom.n).keys()].find(i=>geom.ang[i]<-80&&geom.pos[i*9+2]>24.9);cb(top);await wait(50);
    Viewer.setPick=orig;
    ok(Math.abs(geom.bedArea-1600)<1,'Angeklickte Fläche liegt auf dem Bett (Auflage '+de(geom.bedArea,0)+' mm²)');
    setTab('settings');}
  $('clear').click();await wait(50);
  await dropFile(stlFile('pilz.stl',[[15,15,0,25,25,20],[0,0,20,40,40,25]]));
  ok($('fileinfo').textContent.includes('pilz.stl')&&$('modelCard').classList.contains('loaded'),'STL per Drag&Drop geladen');
  ok(!$('modelBadge').classList.contains('hidden'),'Tab-Badge „Modell“ sichtbar');
  ok($('supportGuide').textContent.includes('Baumstützen'),'Überhang erkannt → Baumstützen');
  ok(!$('export3mf').disabled,'3MF-Menüpunkt mit Modell und 0,4-mm-Düse frei');
  sel('nozD','0.6');ok($('export3mf').disabled&&$('export3mfNote').textContent.includes('0,4'),'3MF bei 0,6-mm-Düse gesperrt mit Grund');sel('nozD','0.4');

  /* 6) 3D-Ansicht */
  $('tab3d').click();await wait(80);
  ok(!$('view3d').hidden&&$('viewSettings').hidden,'Tab 3D-Ansicht zeigt Viewer');
  ok($('info').textContent.includes('40,0 × 40,0 × 25,0'),'Viewer-Info mit Maßen');
  ['btnWireframe','btnAxes','btnClip','btnMeasure'].forEach(id=>$(id).click());
  ok(!$('clipPanel').classList.contains('hidden'),'Schnitt-Panel sichtbar');
  $('clipAxisZ').click();$('clipSlider').value=40;$('clipSlider').dispatchEvent(new Event('input'));
  ok($('measureLabel').textContent.includes('Punkt'),'Messen aktiv mit Anleitung');
  $('thresh').value=60;$('thresh').dispatchEvent(new Event('input'));ok($('threshVal').textContent==='60°','Überhangwinkel-Regler');
  $('thresh').value=45;$('thresh').dispatchEvent(new Event('input'));
  document.querySelector('#viewMode [data-view=stability]').click();await wait(400);
  ok(!$('ohStability').classList.contains('hidden')&&$('ohOverhang').classList.contains('hidden'),'Stabilität: Legende statt Überhangregler');
  ok(/^(Stabil|Schwache Stellen|Kritisch)/.test($('stabInfo').textContent)&&/unverändert/.test($('stabInfo').textContent),'Stabilität: Kennzeile mit Hinweis');
  document.querySelector('#viewMode [data-view=overhang]').click();
  ok(!$('ohOverhang').classList.contains('hidden'),'zurück zur Überhang-Ansicht');
  ['btnWireframe','btnAxes','btnClip','btnMeasure'].forEach(id=>$(id).click());
  $('tabSettings').click();

  /* 7) Hilfe und Erklärungen */
  const help=document.querySelector('.spec .help');help.click();
  ok(!$('tip').hidden&&$('tip').textContent.length>20,'Erklärung per Klick');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));ok($('tip').hidden,'Escape schließt Erklärung');
  document.querySelector('[data-action="help"]').click();ok($('helpDlg').open,'Hilfe-Dialog');$('helpDlg').close();

  /* 8) Profile: Werte anpassen */
  menuClick('editMat');ok($('editor').open,'Editor „Werte anpassen“ öffnet');
  $('ed_nozzle_1').value='219';$('edSave').click();
  ok($('matBadge').textContent==='Eigene Werte'&&$('material').selectedOptions[0].textContent.startsWith('★'),'Eigene Werte gespeichert (★, Badge)');
  ok(document.querySelector('.spec-cell .v').textContent==='219 °C','Kennwert zeigt 219 °C');
  menuClick('editMat');$('ed_maxVol').value='abc';$('edSave').click();
  ok(alerts.some(a=>a.includes('Volumengeschwindigkeit'))&&$('editor').open,'Ungültige Eingabe wird abgelehnt');
  $('edCancel').click();
  document.querySelector('[data-action="profiles"]').click();
  ok($('profilesDlg').open&&$('myList').textContent.includes('Anycubic PLA High Speed'),'Meine Profile listet Überschreibung');$('profilesDlg').close();

  /* 9) Neues Filament */
  menuClick('newMat');$('ed_kind').value='petg';$('ed_kind').dispatchEvent(new Event('change'));
  ok($('ed_bed').value==='75','Neues Filament übernimmt PETG-Vorlage');
  $('ed_name').value='Test-PETG Blau';$('edSave').click();
  ok($('title').textContent.includes('Test-PETG Blau'),'Neues Filament angelegt und gewählt');
  const newId=$('material').value;

  /* 10) Profile exportieren / importieren */
  menuClick('exportBtn');await wait(50);
  const prof=downloads.find(d=>d.name.includes('meine-profile'));
  const profJson=prof&&JSON.parse(await blobText(prof));
  ok(profJson&&profJson.profiles[newId]&&profJson.profiles.pla_hs.nozzle[1]===219,'Profil-Export enthält beide eigenen Profile');
  ok($('toast').textContent.includes('Profile'),'Toast nach Export');
  $('editMat').click();$('edDelete').click();
  ok(!$('material').querySelector('option[value="'+newId+'"]'),'Eigenes Filament gelöscht');
  const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(profJson)],'p.json',{type:'application/json'}));
  $('importFile').files=dt.files;$('importFile').dispatchEvent(new Event('change'));await wait(200);
  ok(!!$('material').querySelector('option[value="'+newId+'"]'),'Import stellt gelöschtes Filament wieder her');
  sel('material','pla_hs');$('editMat').click();$('edReset').click();
  ok($('matBadge').textContent==='Getestet','Zurücksetzen auf Standard');

  /* 11) Düsen-Umrechnung */
  menuClick('settingsBtn');$('st_off').value='99';$('edSave').click();
  ok(alerts.some(a=>a.includes('gültige Werte')),'Düsen-Umrechnung: ungültiger Wert abgelehnt');
  $('st_off').value='6';$('edSave').click();sel('nozM','brass');
  ok($('warning').innerHTML.includes('6 °C'),'Düsen-Umrechnung wirkt (−6 °C bei Messing)');
  menuClick('settingsBtn');$('stReset').click();$('edSave').click();sel('nozM','steel_hardened');

  /* 12) Export-Menü: JSON, Text, Drucken */
  menuClick('orcaFilBtn');menuClick('orcaProcBtn');await wait(50);
  const fil=downloads.find(d=>d.name.endsWith('filament.json')),proc=downloads.find(d=>d.name.endsWith('process.json'));
  const filJ=fil&&JSON.parse(await blobText(fil)),procJ=proc&&JSON.parse(await blobText(proc));
  ok(filJ&&filJ.nozzle_temperature[0]==='215','Filament-JSON: 215 °C');
  ok(procJ&&procJ.inherits.includes('Kobra S1'),'Process-JSON erbt vom Kobra-S1-Preset');
  menuClick('copyBtn');await wait(300);ok(/Kopier/.test($('toast').textContent),'Als Text kopieren meldet Ergebnis ('+$('toast').textContent+')');
  document.querySelectorAll('details.fold').forEach(d=>{d.open=false});
  let openDuringPrint=0;window.addEventListener('beforeprint',()=>{setTimeout(()=>{},0)},{once:true});
  const origPrint=window.print;window.print=()=>{window.dispatchEvent(new Event('beforeprint'));openDuringPrint=[...document.querySelectorAll('details.fold')].filter(d=>d.open).length;window.dispatchEvent(new Event('afterprint'))};
  menuClick('printBtn');
  ok(openDuringPrint===document.querySelectorAll('details.fold').length,'Drucken öffnet alle Bereiche');
  ok([...document.querySelectorAll('details.fold')].every(d=>!d.open),'… und stellt sie danach wieder her');
  window.print=origPrint;

  /* 13) 3MF-Export */
  menuClick('export3mf');ok($('exportDlg').open,'3MF-Dialog öffnet');
  ok(document.querySelectorAll('input[name="slot"]').length===4,'4 Slots aus der Vorlage');
  ok(/Slot, in dem dein PLA steckt/.test($('slotHint').textContent),'Hinweis nennt das gewählte Filament ('+$('slotHint').textContent.slice(0,45)+')');
  document.querySelector('input[name="slot"][value="2"]').click();await wait(30);
  ok($('changesTitle').textContent.match(/\d+ Werte/),'Änderungsliste: '+$('changesTitle').textContent);
  ok($('slotWarn').classList.contains('hidden'),'Slot 3 (PLA) passt zu PLA: kein Hinweis');
  $('export3mfSave').click();await wait(100);
  const f3=downloads.filter(d=>d.name.endsWith('.3mf')).pop();
  ok(f3&&f3.name==='pilz_KobraS1_Slot3.3mf','Dateiname '+(f3&&f3.name));
  if(f3){const z=fflate.unzipSync(await blobBytes(f3));const ps=JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config']));
    ok(ps.nozzle_temperature[2]==='215'&&ps.nozzle_temperature[0]==='205','3MF: Temperatur nur in Slot 3');
    ok(fflate.strFromU8(z['Metadata/model_settings.config']).includes('key="extruder" value="3"'),'3MF: Modell auf Slot 3');
    ok(ps.enable_support==='1','3MF: Stützen aktiviert (Pilz)')}
  ok($('toast').textContent.includes('3MF gespeichert'),'Toast nach 3MF-Export');
  document.querySelector('.printer-switch [data-printer="snapmaker_u1"]').click();sel('material','pla_hs');
  menuClick('export3mf');document.querySelector('input[name="slot"][value="3"]').click();await wait(30);
  // Die Vorlage sagt nichts über die echte Belegung → kein Hinweis und kein Filamenttyp in der Liste
  ok($('slotWarn').classList.contains('hidden')&&!/PLA|PETG/.test($('slotList').textContent),'U1 ohne bekannte Belegung: kein Vorlagen-Typ, kein Hinweis');
  $('exportDlg').close();
  menuClick('export3mf');ok(document.querySelector('input[name="slot"]:checked').value==='0','U1: zuletzt gespeicherter Slot noch nicht gesetzt → Slot 1');$('exportDlg').close();

  /* 13b) Drucker-Verbindung und Live-Belegung (nur lesende Abfragen); Hosts via runSmoke({hosts}) */
  /* Belegung von Hand eintragen (Originalfirmware): Slot 2 = PETG schwarz → Dialog, 3MF, Teileliste */
  { if(!geom)await dropFile(stlFile('pilz.stl',[[15,15,0,25,25,20],[0,0,20,40,40,25]]));
    menuClick('export3mf');await wait(50);
    $('slotEditBtn').click();
    ok(!$('slotEdit').classList.contains('hidden')&&document.querySelectorAll('[data-slot-type]').length===4,'Eintragen: 4 Slots zum Ausfüllen');
    const t=document.querySelector('[data-slot-type="1"]');t.value='PETG';document.querySelector('[data-slot-colour="1"]').value='#101010';
    document.querySelector('[data-slot-type="3"]').value='';
    $('slotEditSave').click();await wait(50);
    ok(/Von Hand eingetragen/.test($('slotSource').textContent)&&/Slot 2 · PETG/.test($('slotList').textContent)&&/Slot 4 · leer/.test($('slotList').textContent),'Eintragen: Dialog zeigt die eigene Belegung');
    document.querySelector('input[name="slot"][value="0"]').click();await wait(30);
    $('export3mfSave').click();await wait(100);
    const zz=fflate.unzipSync(await blobBytes(downloads.filter(d=>d.name.endsWith('.3mf')).pop()));
    const pz=JSON.parse(fflate.strFromU8(zz['Metadata/project_settings.config']));
    ok(pz.filament_type[1]==='PETG'&&pz.filament_colour[1]==='#101010'&&/PETG/.test(pz.filament_settings_id[1]),'Eintragen: 3MF hat Slot 2 = PETG schwarz mit PETG-Preset');
    loadStore();ok(store.settings.manualSlots&&store.settings.manualSlots[$('printer').value][1].type==='PETG','Eintragen: bleibt gespeichert');
    menuClick('export3mf');await wait(50);$('slotEditBtn').click();$('slotEditReset').click();await wait(50);
    ok(/unbekannt/.test($('slotSource').textContent)&&!(store.settings.manualSlots||{})[$('printer').value]&&!/PLA|PETG/.test($('slotList').textContent),'Eingabe löschen: Belegung wieder unbekannt, keine Typen aus der Vorlage');
    $('exportDlg').close();}

  /* Anderer Drucker aus den Orca-Profilen: Auswahl, Datenblatt, Export mit dessen Profil, zurück zum S1 */
  { document.querySelector('.printer-switch [data-printer="orca"]').click();
    ok($('pickerDlg').open&&$('pickVendor').options.length>50,'Druckerauswahl öffnet ('+$('pickVendor').options.length+' Hersteller)');
    $('pickVendor').value='Creality';$('pickVendor').dispatchEvent(new Event('change'));
    $('pickSearch').value='Ender-3 V3 SE';$('pickSearch').dispatchEvent(new Event('input'));
    const pick=$('pickList').querySelector('[data-pick="Creality Ender-3 V3 SE 0.4 nozzle"]');
    ok(!!pick,'Suche findet den Ender-3 V3 SE mit 0,4-mm-Düse');
    pick.click();for(let i=0;i<50&&document.body.dataset.printer!=='orca';i++)await wait(100);
    ok(document.body.dataset.printer==='orca'&&$('printerOrcaLabel').textContent.includes('Ender-3 V3 SE')&&!$('pickerDlg').open,'Ender-3 V3 SE aktiv, Kopfzeile zeigt ihn');
    ok(/allgemeine Startwerte/.test($('warning').textContent)&&lastResult.sp_outer<=60,'Datenblatt: Hinweis + Außenwand auf Orca-Profil begrenzt ('+lastResult.sp_outer+' mm/s)');
    if(!geom)await dropFile(stlFile('pilz.stl',[[15,15,0,25,25,20],[0,0,20,40,40,25]]));
    menuClick('export3mf');await wait(60);$('export3mfSave').click();await wait(150);
    const fo=downloads.filter(d=>d.name.endsWith('.3mf')).pop(),zo=fflate.unzipSync(await blobBytes(fo)),po=JSON.parse(fflate.strFromU8(zo['Metadata/project_settings.config']));
    ok(po.printer_settings_id==='Creality Ender-3 V3 SE 0.4 nozzle'&&/Ender3V3SE/.test(po.print_settings_id)&&JSON.stringify(po.printable_area).includes('220x220'),'3MF mit Ender-Druckerprofil, Prozessprofil und 220er Bett ('+fo.name+')');
    document.querySelector('.printer-switch [data-printer="kobra_s1"]').click();await wait(80);
    ok(document.body.dataset.printer==='kobra_s1','Zurück zum Kobra S1');}

  if(opts.hosts){
    sel('material','petg');
    document.querySelector('[data-action="link"]').click();ok($('linkDlg').open,'Dialog Drucker-Verbindung');
    $('host_kobra_s1').value='kein host!';$('linkSave').click();ok($('linkDlg').open&&$('linkRes_kobra_s1').textContent.includes('Ungültig'),'Ungültige Adresse abgelehnt');
    $('host_kobra_s1').value=opts.hosts.kobra_s1;$('host_snapmaker_u1').value=opts.hosts.snapmaker_u1;
    await testLink('kobra_s1');await testLink('snapmaker_u1');
    ok($('linkRes_kobra_s1').classList.contains('good'),'Test S1: '+$('linkRes_kobra_s1').textContent);
    ok($('linkRes_snapmaker_u1').classList.contains('good'),'Test U1: '+$('linkRes_snapmaker_u1').textContent);
    $('linkSave').click();ok(store.settings.printerHosts.kobra_s1===opts.hosts.kobra_s1,'IPs gespeichert');
    for(const pid of ['kobra_s1','snapmaker_u1']){
      document.querySelector('.printer-switch [data-printer="'+pid+'"]').click();
      if(!geom)await dropFile(stlFile('pilz.stl',[[15,15,0,25,25,20],[0,0,20,40,40,25]]));
      menuClick('export3mf');for(let i=0;i<180&&!document.querySelector('.slot-source.live, .slot-source.fallback');i++)await wait(100);
      ok(document.querySelector('.slot-source.live'),pid+': '+$('slotSource').textContent);
      const checked=document.querySelector('input[name="slot"]:checked').closest('.slot').textContent;
      ok(/PETG/.test(checked),pid+': PETG-Slot vorausgewählt ('+checked.replace(/\s+/g,' ').trim()+')');
      $('export3mfSave').click();await wait(100);
      const f=downloads.filter(d=>d.name.endsWith('.3mf')).pop();
      const z=fflate.unzipSync(await blobBytes(f)),ps=JSON.parse(fflate.strFromU8(z['Metadata/project_settings.config']));
      ok(ps.filament_type.some(t=>t!=='PLA'),pid+': echte Slot-Typen in der 3MF ('+ps.filament_type.join(',')+')');
    }
    document.querySelector('.printer-switch [data-printer="kobra_s1"]').click(); // S1 bekommt eine Adresse, die nie antwortet
    store.settings.printerHosts={kobra_s1:'10.255.255.1',snapmaker_u1:''};slotState={printer:null,live:null,note:''};
    menuClick('export3mf');for(let i=0;i<180&&!document.querySelector('.slot-source.fallback');i++)await wait(100);
    ok(document.querySelector('.slot-source.fallback')&&/antwortet nicht|nicht erreichbar/.test($('slotSource').textContent),'Drucker nicht erreichbar → Vorlage mit Hinweis ('+$('slotSource').textContent+')');
    $('exportDlg').close();store.settings.printerHosts=opts.hosts;persist();
  }

  /* 14) Modell entfernen */
  menuClick('clear');ok(!$('modelCard').classList.contains('loaded')&&$('export3mf').disabled,'Modell entfernen setzt alles zurück');

  HTMLAnchorElement.prototype.click=origClick;URL.revokeObjectURL=origRevoke;
  ok(errors.length===0,'keine JavaScript-Fehler ('+errors.join(' | ')+')');
  if(!opts.hosts){store.settings.printerHosts=savedHosts;persist()}
  return {ok:log.length,fail,log};
}
