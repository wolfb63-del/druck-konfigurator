'use strict';
/* Start und Bedienrahmen: Datei laden, Menüs, Tabs, Druckerumschaltung, Viewer-Bedienung. */

/* ================= DATEI LADEN (aus v4) ================= */
const input=$('file');
let dragDepth=0;
['dragenter','dragover','dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation()}));
document.addEventListener('dragenter',()=>{dragDepth++;document.body.classList.add('dragging')});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('dragging')}});
document.addEventListener('drop',e=>{
  dragDepth=0;document.body.classList.remove('dragging');
  const files=e.dataTransfer&&e.dataTransfer.files;if(files&&files.length)loadFiles([...files]);
});
input.addEventListener('change',()=>{if(input.files.length)loadFiles([...input.files])});
$('clear').addEventListener('click',()=>{input.value='';project=null;geom=null;$('fileinfo').textContent='Noch keine Datei geladen.';clearModel();update()});

const readBytes=file=>new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(new Uint8Array(r.result));r.onerror=()=>fail(r.error||Error('Lesefehler'));r.readAsArrayBuffer(file)});

// Eine oder mehrere Dateien (STL, 3MF, ZIP) → Projekt mit Teileliste
async function loadFiles(files){
  $('fileinfo').textContent='Lese '+(files.length===1?files[0].name:files.length+' Dateien')+' …';
  try{
    const entries=await Promise.all(files.map(async f=>({name:f.name,bytes:await readBytes(f)})));
    const imp=importModels(entries,fflate);
    // slot: 0-basiert oder null (= Slot aus dem Export-Dialog); 3MF-Teile behalten den Slot des Designers
    const parts=imp.parts.map((p,i)=>({id:i,name:p.name,origPos:p.pos,R:IDENTITY3,geom:makeGeom(p.name,p.pos),slot:p.extruder?p.extruder-1:null,plate:p.plate||1,objectId:p.objectId||null,instance:p.instance||0,input:null}));
    showProject({name:imp.name,parts,threemf:imp.threemf,notes:imp.notes});
  }catch(e){
    $('fileinfo').textContent='Modell konnte nicht gelesen werden: '+e.message+'. Bitte die Datei prüfen oder erneut exportieren.';
  }
}

function showProject(p){
  project=p;
  initPartInputs(p.parts);
  const n=p.parts.reduce((s,x)=>s+x.geom.n,0);
  $('fileinfo').innerHTML='<b>'+esc(p.name)+'</b><br>'+(p.parts.length>1?p.parts.length+' Teile · ':'')+n.toLocaleString('de-DE')+' Dreiecke'+
    (p.threemf&&p.threemf.plates.length>1?' · '+p.threemf.plates.length+' Platten':'')+
    (p.threemf&&p.threemf.settings&&p.threemf.settings.printer_settings_id?'<br><small>Ursprünglich für: '+esc(p.threemf.settings.printer_settings_id)+'</small>':'');
  const notes=$('importNotes');notes.textContent=p.notes.join(' ');notes.classList.toggle('hidden',!p.notes.length);
  $('partList').classList.toggle('hidden',p.parts.length<2);
  $('modelCard').classList.add('loaded');$('modelBadge').classList.remove('hidden');
  selectPart(0);
}

// Gewähltes Teil bestimmt Datenblatt, Überhanganalyse und 3D-Ansicht
function selectPart(i){
  project.selected=i;
  loadPartIntoForm(project.parts[i]);
  showModel(project.parts[i].geom);
}

// Teilewahl in der 3D-Ansicht (dort ist die Teileliste des Einstellungs-Tabs nicht sichtbar)
function renderPartSwitch3d(){
  const box=$('partSwitch3d'),multi=!!project&&project.parts.length>1;
  box.classList.toggle('hidden',!multi);
  if(!multi)return;
  const sel=$('partSelect3d');
  sel.innerHTML=project.parts.map((p,i)=>'<option value="'+i+'">'+(i+1)+'/'+project.parts.length+' · '+esc(p.name)+'</option>').join('');
  sel.value=String(project.selected);
}
$('partSelect3d').addEventListener('change',e=>selectPart(+e.target.value));
$('partSwitch3d').addEventListener('click',e=>{
  const b=e.target.closest('[data-part-step]');if(!b||!project)return;
  const n=project.parts.length;selectPart((project.selected+ +b.dataset.partStep+n)%n);
});

function renderPartList(){
  renderPartSwitch3d();
  const list=$('partList');
  if(!project||project.parts.length<2){list.innerHTML='';return}
  const th=+$('thresh').value,label={none:'ohne Stützen',few:'wenig Stützen',needed:'Stützen'};
  const slots=typeof slotChoices==='function'?slotChoices():[];
  list.innerHTML=project.parts.map((p,i)=>{
    const g=p.geom,lv=analyze(g,th).level,sel=i===project.selected;
    const sc=p.slot!=null&&slots[p.slot],col=sc&&/^#[0-9a-f]{6}$/i.test(sc.colour)?sc.colour:'#999999';
    const slot=p.slot!=null?'<span class="pslot" style="background:'+col+'"></span>Slot '+(p.slot+1)+' · ':'';
    const plate=project.threemf&&project.threemf.plates.length>1?'Platte '+p.plate+' · ':'';
    return '<li><button type="button" data-part="'+i+'"'+(sel?' aria-current="true"':'')+' title="'+esc(p.name)+'"><span class="pname">'+esc(p.name)+'</span>'+
      '<span class="pmeta">'+slot+plate+de(g.x,0)+'×'+de(g.y,0)+'×'+de(g.z,0)+' mm</span><span class="plevel '+lv+'">'+label[lv]+'</span></button></li>';
  }).join('');
}
$('partList').addEventListener('click',e=>{const b=e.target.closest('[data-part]');if(b&&+b.dataset.part!==project.selected){selectPart(+b.dataset.part);const nb=$('partList').querySelector('[data-part="'+b.dataset.part+'"]');if(nb)nb.focus()}});

function showModel(g){
  geom=g;
  const n=g.n;
  $('sx').textContent=de(g.x,1)+' mm';$('sy').textContent=de(g.y,1)+' mm';$('sz').textContent=de(g.z,1)+' mm';$('sv').textContent=de(g.vol/1000,1)+' cm³';
  $('info').textContent=g.name+'  —  '+de(g.x,1)+' × '+de(g.y,1)+' × '+de(g.z,1)+' mm  —  '+n.toLocaleString('de-DE')+' Dreiecke';
  $('ohBar').classList.remove('hidden');
  // Ohne Renderer bleibt der Hinweis „3D-Ansicht nicht verfügbar“ sichtbar (wie in v4).
  if(Viewer.show(g))$('viewerEmpty').classList.add('hidden');
  Viewer.colorize(+$('thresh').value);
  if(miniReady){$('miniView').classList.remove('hidden');MiniView.show(g);MiniView.colorize(+$('thresh').value)}
  update();
}
function clearModel(){
  Viewer.clear();
  if(miniReady){MiniView.clear();$('miniView').classList.add('hidden')}
  $('ohBar').classList.add('hidden');$('info').textContent='';
  document.querySelectorAll('.oh-info').forEach(el=>{el.textContent=''});
  $('modelCard').classList.remove('loaded');$('modelBadge').classList.add('hidden');
  $('partList').classList.add('hidden');$('partList').innerHTML='';$('importNotes').classList.add('hidden');
  $('viewerEmpty').classList.remove('hidden');
}

$('thresh').addEventListener('input',()=>{$('threshVal').textContent=$('thresh').value+'°';Viewer.colorize(+$('thresh').value);if(miniReady)MiniView.colorize(+$('thresh').value);update()});

/* ================= DRUCKER-UMSCHALTUNG ================= */
const printerButtons=[...document.querySelectorAll('.printer-switch [data-printer]')];
function syncPrinterSwitch(){
  printerButtons.forEach(b=>b.setAttribute('aria-checked',String(b.dataset.printer===$('printer').value)));
}
printerButtons.forEach(b=>b.addEventListener('click',()=>{
  // „Anderer Drucker“ öffnet immer die Auswahl (auch zum Wechseln des Modells)
  if(b.dataset.printer==='orca'){openPrinterPicker();return}
  if($('printer').value===b.dataset.printer)return;
  $('printer').value=b.dataset.printer;
  $('printer').dispatchEvent(new Event('change'));
  syncPrinterSwitch();
}));
// Pfeiltasten wechseln innerhalb der Radiogruppe
document.querySelector('.printer-switch').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
  const i=printerButtons.findIndex(b=>b.getAttribute('aria-checked')==='true');
  const next=printerButtons[(i+(e.key==='ArrowRight'?1:printerButtons.length-1))%printerButtons.length];
  next.click();next.focus();
});

/* ================= MENÜS ================= */
const menus=[...document.querySelectorAll('.menu')];
function closeMenus(except){
  menus.forEach(m=>{if(m===except)return;m.querySelector('.menu-list').classList.remove('open');m.querySelector('.menu-btn').setAttribute('aria-expanded','false')});
}
menus.forEach(m=>{
  const btn=m.querySelector('.menu-btn'),list=m.querySelector('.menu-list');
  btn.addEventListener('click',()=>{
    const open=!list.classList.contains('open');
    closeMenus(m);list.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));
    if(open){const first=list.querySelector('button:not(:disabled)');if(first)first.focus()}
  });
  list.addEventListener('keydown',e=>{
    const items=[...list.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus()}
    if(e.key==='ArrowUp'){e.preventDefault();items[(i+items.length-1)%items.length].focus()}
  });
  // Nach der Aktion schließen; die Aktion selbst hängt an der ID bzw. data-action.
  list.addEventListener('click',e=>{
    const item=e.target.closest('button');if(!item||item.disabled)return;
    closeMenus();btn.focus({preventScroll:true});
    if(item.dataset.toast)toast(item.dataset.toast);
    else if(item.id==='copyBtn')setTimeout(()=>toast(item.textContent),120);
  });
});
document.addEventListener('click',e=>{if(!e.target.closest('.menu'))closeMenus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus()});

/* data-action: gemeinsame Aktionen für Menü, Modellkarte und leere 3D-Ansicht */
const ACTIONS={
  open:()=>input.click(),
  profiles:()=>{renderMyList();$('profilesDlg').showModal()},
  help:()=>$('helpDlg').showModal(),
  disclaimer:()=>{if($('helpDlg').open)$('helpDlg').close();$('disclaimerDlg').showModal()}
};
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-action]');if(a&&ACTIONS[a.dataset.action])ACTIONS[a.dataset.action]();
  const c=e.target.closest('[data-click]');if(c)$(c.dataset.click).click();
  const x=e.target.closest('[data-close]');if(x)x.closest('dialog').close();
});
['profilesDlg','helpDlg'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()}));

/* Erklärungen (?): per Maus, Tastatur und Tippen erreichbar. Der Text steht im title-Attribut
   (so erzeugt vom Rechenkern); er wandert nach data-tip, damit kein doppelter Browser-Tooltip erscheint. */
function enhanceHelp(){
  document.querySelectorAll('.help[title]').forEach(el=>{
    el.dataset.tip=el.title;el.removeAttribute('title');
    el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Erklärung: '+el.dataset.tip);
  });
}
let tipOwner=null;
function showTip(el){
  const tip=$('tip');tipOwner=el;tip.textContent=el.dataset.tip;tip.hidden=false;
  el.setAttribute('aria-expanded','true');
  const r=el.getBoundingClientRect(),w=Math.min(320,window.innerWidth-16);
  tip.style.left=Math.max(8,Math.min(r.left-12,window.innerWidth-w-8))+'px';
  const below=r.bottom+8,h=tip.offsetHeight;
  tip.style.top=(below+h>window.innerHeight?r.top-h-8:below)+'px';
}
function hideTip(){if(!tipOwner)return;tipOwner.setAttribute('aria-expanded','false');tipOwner=null;$('tip').hidden=true}
document.addEventListener('mouseover',e=>{const h=e.target.closest('.help[data-tip]');if(h)showTip(h);else if(tipOwner&&!tipOwner.contains(document.activeElement)&&document.activeElement!==tipOwner)hideTip()});
document.addEventListener('focusin',e=>{const h=e.target.closest('.help[data-tip]');if(h)showTip(h);else hideTip()});
document.addEventListener('click',e=>{const h=e.target.closest('.help[data-tip]');if(h){e.preventDefault();tipOwner===h?hideTip():showTip(h)}});
document.addEventListener('keydown',e=>{
  const h=e.target.closest&&e.target.closest('.help[data-tip]');
  if(h&&(e.key==='Enter'||e.key===' ')){e.preventDefault();tipOwner===h?hideTip():showTip(h)}
  if(e.key==='Escape')hideTip();
});
document.addEventListener('scroll',hideTip,true);

let toastTimer=0;
function toast(text){
  const t=$('toast');t.textContent=text;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}

/* Drucken: alle Aufklappbereiche öffnen, danach Zustand wiederherstellen */
let foldState=[];
window.addEventListener('beforeprint',()=>{
  const folds=[...document.querySelectorAll('details.fold')];
  foldState=folds.map(d=>d.open);folds.forEach(d=>{d.open=true});
});
window.addEventListener('afterprint',()=>{document.querySelectorAll('details.fold').forEach((d,i)=>{d.open=foldState[i]??d.open})});

/* ================= TABS ================= */
const TAB_KEY='druckKonfigurator.tab';
const tabs={settings:[$('tabSettings'),$('viewSettings')],'3d':[$('tab3d'),$('view3d')]};
function setTab(name){
  Object.entries(tabs).forEach(([k,[btn,view]])=>{const on=k===name;btn.setAttribute('aria-selected',String(on));view.hidden=!on});
  document.body.dataset.tab=name;
  try{localStorage.setItem(TAB_KEY,name)}catch(e){/* nur Komfort */}
}
Object.entries(tabs).forEach(([k,[btn]])=>btn.addEventListener('click',()=>setTab(k)));
document.querySelector('.tabs').addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight'].includes(e.key)){const next=document.body.dataset.tab==='3d'?'settings':'3d';setTab(next);tabs[next][0].focus()}
});

/* ================= VIEWER-BEDIENUNG (aus 3dView) ================= */
function toggleButton(id,onChange){
  const b=$(id);
  b.addEventListener('click',()=>{const on=!b.classList.contains('active');b.classList.toggle('active',on);onChange(on)});
}
toggleButton('btnWireframe',on=>Viewer.setWireframe(on));
toggleButton('btnAxes',on=>Viewer.setAxes(on));
toggleButton('btnClip',on=>{Viewer.setClip(on);$('clipPanel').classList.toggle('hidden',!on)});
toggleButton('btnMeasure',on=>Viewer.setMeasure(on,text=>{$('measureLabel').textContent=text}));
['x','y','z'].forEach(axis=>{
  $('clipAxis'+axis.toUpperCase()).addEventListener('click',()=>{
    ['X','Y','Z'].forEach(k=>$('clipAxis'+k).classList.toggle('active',k===axis.toUpperCase()));
    $('clipSlider').value=0;Viewer.setClipAxis(axis);
  });
});
$('clipSlider').addEventListener('input',()=>Viewer.setClipFraction(Number($('clipSlider').value)/100));

/* ================= START (aus v4) ================= */
// Kleine 3D-Vorschau in der Modell-Spalte (fällt ohne WebGL einfach weg)
let miniReady=false;
if(MiniView.available()){try{MiniView.init($('miniView'));miniReady=true}catch(e){/* ohne Vorschau weiter */}}
if(Viewer.available()){
  try{Viewer.init($('stage'))}catch(e){$('viewerEmpty').textContent='3D-Ansicht konnte nicht gestartet werden. Die Analyse funktioniert trotzdem.'}
}else $('viewerEmpty').textContent='3D-Ansicht nicht verfügbar (three.js fehlt im Ordner vendor/). Die Analyse und alle Empfehlungen funktionieren trotzdem.';
loadStore();
if(store.last.printer&&PRINTERS[store.last.printer])$('printer').value=store.last.printer;
fillNozzleMaterialSelect();
fillMaterialSelect(store.last.material||'pla_hs');
if(store.last.nozD&&NOZ[nkey(store.last.nozD)])$('nozD').value=store.last.nozD;
if(store.last.nozM&&NOZZLE_MATERIALS[store.last.nozM]&&currentPrinter().nozzleOptions.includes(store.last.nozM))$('nozM').value=store.last.nozM;
if(!storageOK)persist();
syncPrinterSwitch();
try{if(localStorage.getItem(TAB_KEY)==='3d')setTab('3d')}catch(e){/* nur Komfort */}

/* Haftungsausschluss: beim ersten Start (und nach inhaltlicher Änderung, neue Versionsnummer) einmal bestätigen.
   Ist kein Speichern möglich, erscheint er bei jedem Start – lieber einmal zu oft als gar nicht. */
const DISCLAIMER_KEY='druckKonfigurator.disclaimer',DISCLAIMER_VERSION='1';
$('disclaimerOk').addEventListener('click',()=>{try{localStorage.setItem(DISCLAIMER_KEY,DISCLAIMER_VERSION)}catch(e){/* nicht speicherbar */}$('disclaimerDlg').close()});
{let seen=null;try{seen=localStorage.getItem(DISCLAIMER_KEY)}catch(e){/* nicht lesbar */}
 if(seen!==DISCLAIMER_VERSION)$('disclaimerDlg').showModal()}
update();
