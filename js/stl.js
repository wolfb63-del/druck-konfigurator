'use strict';
/* STL einlesen und Überhänge analysieren – aus v4, ohne DOM-Zugriffe. */
// STL-Datei → flaches Dreiecksarray (9 Werte je Dreieck)
function readSTL(buf){
  const bytes=new Uint8Array(buf), dv=new DataView(buf);
  let pos;
  const declared=bytes.length>=84?dv.getUint32(80,true):0;
  const binaryExpected=84+declared*50;
  const looksBinary=bytes.length>=84&&declared>0&&bytes.length>=binaryExpected;
  if(looksBinary){
    pos=new Float32Array(declared*9);
    for(let i=0,p=84;i<declared;i++,p+=50){for(let j=0;j<9;j++)pos[i*9+j]=dv.getFloat32(p+12+j*4,true)}
  }else{
    const text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    const re=/vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/gi;const arr=[];let m;
    while((m=re.exec(text)))arr.push(+m[1],+m[2],+m[3]);
    arr.length-=arr.length%9; pos=new Float32Array(arr);
  }
  if(!pos.length)throw Error('Keine gültigen Dreiecke gefunden');
  return pos;
}
function parseSTL(name,buf){return makeGeom(name,readSTL(buf))}

/* Blick senkrecht nach unten über ein XY-Raster – gemeinsam für Überhanganalyse und Ausrichtung.
   below(): 'inner' = auf gleicher Höhe liegt eine nach oben zeigende Fläche (Innenfläche zweier
   unverschmolzener Körper, z. B. Tinkercad-Export) → kein Überhang; 'part' = Material des Teils
   weiter unten; 'bed' = frei bis zum Bett. sample(): große Dreiecke an mehreren Punkten (≈ 2 mm). */
const PROBE_BED_TOL=0.2, PROBE_COPLANAR=0.05, PROBE_MAX_CELLS=96, PROBE_MAX_SUB=6;
/* Überfüllte Spalten (mehr als PROBE_SPLIT Dreiecke, z. B. feine Prägung neben großen Flächen; gemeldet
   2026-10-03, Trommel-Segment bis 19.000 je Spalte, 7 s) werden beim ersten Zugriff in k×k Unterspalten
   geteilt. Ein Dreieck, dessen XY-Hülle den Punkt enthält, steht auch in dessen Unterspalte (gleiche, monotone
   Zuordnung) – below() sieht also dieselben Kandidaten, das Ergebnis bleibt gleich. Dreiecke, die mehr als
   2×2 Unterspalten überdecken, stehen einmal in einer gemeinsamen Liste, die immer mitgeprüft wird: sonst
   würden große Flächen in jede Unterspalte kopiert (Testkästen auf der Seite: 7 Mio. Einträge, 7,6 s).
   Geteilt werden nur Ausreißer (über PROBE_SPLIT und über PROBE_SPLIT_X_MEDIAN × Median): sind alle Spalten
   gleich voll, bringt Teilen nichts und kostet nur Zeit (Testkästen: Median 150, Trommel: Median 15, max 19.107). */
const PROBE_SPLIT=256, PROBE_SPLIT_X_MEDIAN=16, PROBE_SUB_MAXK=32;
function makeDownProbe(pos){
  const n=pos.length/9;
  let mnx=Infinity,mny=Infinity,mnz=Infinity,mxx=-Infinity,mxy=-Infinity,mxz=-Infinity;
  for(let i=0;i<pos.length;i+=3){
    const x=pos[i],y=pos[i+1],z=pos[i+2];
    if(x<mnx)mnx=x;if(x>mxx)mxx=x;if(y<mny)mny=y;if(y>mxy)mxy=y;if(z<mnz)mnz=z;if(z>mxz)mxz=z;
  }
  const cells=Math.max(1,Math.min(PROBE_MAX_CELLS,Math.ceil(Math.sqrt(n/4))));
  const cw=Math.max((mxx-mnx)/cells,1e-6),ch=Math.max((mxy-mny)/cells,1e-6);
  const cellX=x=>Math.min(cells-1,Math.max(0,Math.floor((x-mnx)/cw))), cellY=y=>Math.min(cells-1,Math.max(0,Math.floor((y-mny)/ch)));
  const grid=Array.from({length:cells*cells},()=>[]);
  for(let i=0;i<n;i++){
    const o=i*9;
    const x0=cellX(Math.min(pos[o],pos[o+3],pos[o+6])),x1=cellX(Math.max(pos[o],pos[o+3],pos[o+6]));
    const y0=cellY(Math.min(pos[o+1],pos[o+4],pos[o+7])),y1=cellY(Math.max(pos[o+1],pos[o+4],pos[o+7]));
    for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++)grid[gy*cells+gx].push(i);
  }
  const sub=new Map(),lens=grid.map(l=>l.length).sort((a,b)=>a-b);
  const splitAt=Math.max(PROBE_SPLIT,PROBE_SPLIT_X_MEDIAN*lens[lens.length>>1]);
  function split(idx){
    const list=grid[idx],gx=idx%cells,gy=(idx-gx)/cells,k=Math.min(PROBE_SUB_MAXK,Math.max(2,Math.ceil(Math.sqrt(list.length/16))));
    const x0=mnx+gx*cw,y0=mny+gy*ch,sw=cw/k,sh=ch/k;
    const sx=x=>Math.min(k-1,Math.max(0,Math.floor((x-x0)/sw))),sy=y=>Math.min(k-1,Math.max(0,Math.floor((y-y0)/sh)));
    const lists=new Array(k*k),wide=[];
    for(const i of list){
      const o=i*9;
      const a0=sx(Math.min(pos[o],pos[o+3],pos[o+6])),a1=sx(Math.max(pos[o],pos[o+3],pos[o+6]));
      const b0=sy(Math.min(pos[o+1],pos[o+4],pos[o+7])),b1=sy(Math.max(pos[o+1],pos[o+4],pos[o+7]));
      if((a1-a0+1)*(b1-b0+1)>4){wide.push(i);continue}
      for(let a=a0;a<=a1;a++)for(let b=b0;b<=b1;b++)(lists[b*k+a]||(lists[b*k+a]=[])).push(i);
    }
    const s={sx,sy,k,lists,wide};sub.set(idx,s);return s;
  }
  const NONE=[];
  // Kandidaten für Punkt (px,py): gemeinsame Liste großer Dreiecke + Unterspalte, sonst die ganze Spalte
  const columns=(px,py)=>{
    const idx=cellY(py)*cells+cellX(px);
    if(grid[idx].length<=splitAt)return [grid[idx]];
    const s=sub.get(idx)||split(idx);
    return [s.wide,s.lists[s.sy(py)*s.k+s.sx(px)]||NONE];
  };
  const upFacing=o=>(pos[o+3]-pos[o])*(pos[o+7]-pos[o+1])-(pos[o+4]-pos[o+1])*(pos[o+6]-pos[o])>0;
  function below(px,py,pz,self){
    let res='bed';
    for(const list of columns(px,py))for(const j of list){
      if(j===self)continue;
      const o=j*9,x0=pos[o],y0=pos[o+1],x1=pos[o+3],y1=pos[o+4],x2=pos[o+6],y2=pos[o+7];
      const d=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2);
      if(!d)continue;
      const a=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/d,b=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/d,c=1-a-b;
      if(a<0||b<0||c<0)continue;
      const z=a*pos[o+2]+b*pos[o+5]+c*pos[o+8];
      if(Math.abs(z-pz)<=PROBE_COPLANAR){if(upFacing(o))return 'inner'}
      else if(z<pz&&z>mnz+PROBE_BED_TOL)res='part';
    }
    return res;
  }
  // Dreieck i in m² Teildreiecke zerlegen und deren Mittelpunkte prüfen; cb(ergebnis, teilfläche)
  function sample(i,area,cb){
    const o=i*9,m=Math.max(1,Math.min(PROBE_MAX_SUB,Math.ceil(Math.sqrt(area/4)))),w=area/(m*m);
    for(let a=0;a<m;a++)for(let b=0;a+b<m;b++)for(let flip=0;flip<(a+b<m-1?2:1);flip++){
      const fa=(a+(flip?2:1)/3)/m,fb=(b+(flip?2:1)/3)/m,fc=1-fa-fb;
      cb(below(fa*pos[o]+fb*pos[o+3]+fc*pos[o+6],fa*pos[o+1]+fb*pos[o+4]+fc*pos[o+7],fa*pos[o+2]+fb*pos[o+5]+fc*pos[o+8],i),w);
    }
  }
  return {mnz,mxz,below,sample};
}

// Dreiecke → Analyse-Grundlage (Maße, Winkel je Fläche, Bettkontakt); Bett = tiefster Punkt.
function makeGeom(name,pos){
  const n=pos.length/9;
  if(!n)throw Error('Keine gültigen Dreiecke gefunden');
  let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.length;i+=3){for(let k=0;k<3;k++){const v=pos[i+k];if(v<mn[k])mn[k]=v;if(v>mx[k])mx[k]=v}}
  // per-face data: overhang angle from vertical (90 = flat ceiling, 0 = wall, <0 = faces up), area, "on bed"
  const ang=new Float32Array(n), area=new Float32Array(n), bed=new Uint8Array(n);
  let vol=0,total=0;
  const bedTol=0.2; // everything within the first layer counts as resting on the bed
  for(let i=0;i<n;i++){
    const o=i*9;
    const ax=pos[o],ay=pos[o+1],az=pos[o+2],bx=pos[o+3],by=pos[o+4],bz=pos[o+5],cx=pos[o+6],cy=pos[o+7],cz=pos[o+8];
    const ux=bx-ax,uy=by-ay,uz=bz-az,wx=cx-ax,wy=cy-ay,wz=cz-az;
    const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx;
    const len=Math.hypot(nx,ny,nz);
    area[i]=len/2; total+=len/2;
    const z=len?nz/len:0;
    ang[i]=90-Math.acos(Math.max(-1,Math.min(1,-z)))*180/Math.PI;
    bed[i]=Math.max(az,bz,cz)<=mn[2]+bedTol?1:0;
    vol+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;
  }
  let bedArea=0;for(let i=0;i<n;i++)if(bed[i]&&ang[i]>80)bedArea+=area[i];
  // Anteil nach unten zeigender Flächen, der nur Innenfläche ist (zählt nicht als Überhang)
  const hidden=new Float32Array(n);
  if(n>1){const probe=makeDownProbe(pos);for(let i=0;i<n;i++){if(bed[i]||ang[i]<=0||!area[i])continue;let h=0;probe.sample(i,area[i],(r,w)=>{if(r==='inner')h+=w});hidden[i]=h/area[i]}}
  return {name,pos,n,ang,area,bed,hidden,total,bedArea,vol:Math.abs(vol),x:mx[0]-mn[0],y:mx[1]-mn[1],z:mx[2]-mn[2],mn,mx};
}

function analyze(geom,th){
  if(!geom)return null;
  let flagged=0,ceiling=0;
  for(let i=0;i<geom.n;i++){
    if(geom.bed[i])continue;
    const a=geom.ang[i];
    const ar=geom.area[i]*(1-(geom.hidden?geom.hidden[i]:0));
    if(a>th)flagged+=ar;
    if(a>80)ceiling+=ar;
  }
  const ratio=flagged/Math.max(1,geom.total);
  let level;
  if(flagged<30||ratio<0.002)level='none';
  else if(flagged<Math.max(300,0.03*geom.total))level='few';
  else level='needed';
  return {th,flagged,ceiling,ratio,level};
}
