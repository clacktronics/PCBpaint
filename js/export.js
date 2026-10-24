/* ============================================================
   PCB Paint — fabrication output
   Gerber RS-274X (with X2 file attributes), Excellon drill, SVG, zip.
   Board units are 0.1 mm. Gerber y points up, so it is flipped,
   with the origin at the bottom-left corner of the board outline.
   ============================================================ */
const APP_VERSION='0.2';
function fabOrigin(){const b=bboxOf(boardOutline());return{x:b.x0,y:b.y1}}
const toMM=(p,o)=>[(p[0]-o.x)/10,(o.y-p[1])/10];

/* ---------------- Gerber writer ---------------- */
function gerber(fileFunction,polarity,draw){
  const o=fabOrigin(),aps=new Map(),body=[];let cur=null;
  const c=v=>String(Math.round(v*1e6));
  const xy=p=>{const[x,y]=toMM(p,o);return`X${c(x)}Y${c(y)}`};
  const mm=v=>(v/10).toFixed(6);
  const ap=(shape,w,h)=>{const def=shape==='C'?`C,${mm(w)}`:`${shape},${mm(w)}X${mm(h)}`;if(!aps.has(def))aps.set(def,10+aps.size);return aps.get(def)};
  const use=d=>{if(cur!==d){body.push(`D${d}*`);cur=d}};
  const G={
    flash(shape,w,h,p){use(ap(shape,w,h));body.push(xy(p)+'D03*')},
    pad(pd,grow=0){const w=pd.w+2*grow,h=pd.h+2*grow;G.flash(pd.s==='c'?(Math.abs(w-h)<0.01?'C':'O'):'R',w,h,[pd.x,pd.y])},
    line(pts,width){if(pts.length===1)return G.flash('C',width,width,pts[0]);use(ap('C',width,width));body.push(xy(pts[0])+'D02*');for(let i=1;i<pts.length;i++)body.push(xy(pts[i])+'D01*')},
    region(P){body.push('G36*',xy(P[0])+'D02*');for(let i=1;i<P.length;i++)body.push(xy(P[i])+'D01*');body.push(xy(P[0])+'D01*','G37*')},
    dark(on){body.push(on?'%LPD*%':'%LPC*%')}
  };
  draw(G);
  const head=['%TF.GenerationSoftware,Clacktronics,PCB Paint,'+APP_VERSION+'*%',`%TF.CreationDate,${new Date().toISOString().slice(0,19)}Z*%`,
    `%TF.FileFunction,${fileFunction}*%`,`%TF.FilePolarity,${polarity}*%`,
    '%FSLAX46Y46*%','%MOMM*%','%LPD*%','G01*'];
  for(const[def,d]of aps)head.push(`%ADD${d}${def}*%`);
  return head.concat(body,['M02*']).join('\n')+'\n';
}
/* Copper for one layer: pours first (largest loops first, holes cleared), then traces, pads and vias on top. */
function copperGerber(layer){
  const L=layer==='top'?'Copper,L1,Top':'Copper,L2,Bot';
  return gerber(L,'Positive',G=>{
    const loops=pourFills().filter(f=>f.layer===layer&&!f.empty).flatMap(f=>f.loops).map(P=>({P,a:polyArea(P)})).sort((a,b)=>Math.abs(b.a)-Math.abs(a.a));
    if(loops.length){for(const l of loops){G.dark(l.a>0);G.region(l.P)}G.dark(true)}
    for(const t of S.traces)if(t.layer===layer)G.line(t.pts,t.width);
    for(const pd of allPads())if(padOn(pd,layer))G.pad(pd);
    for(const v of S.vias)G.flash('C',v.d,v.d,[v.x,v.y]);
  });
}
const MASK_GROW=0.5; // 0.05 mm solder mask expansion
function maskGerber(layer){return gerber(layer==='top'?'Soldermask,Top':'Soldermask,Bot','Negative',G=>{for(const pd of allPads())if(padOn(pd,layer))G.pad(pd,MASK_GROW)})}
function pasteGerber(){return gerber('Paste,Top','Positive',G=>{for(const pd of allPads())if(!pd.tht)G.pad(pd)})}
/* Silk is trimmed off pads by clearing each pad (plus a little) after drawing. */
function silkGerber(){return gerber('Legend,Top','Positive',G=>{for(const s of silkStrokes())G.line(s.pts,Math.max(1.5,s.width));G.dark(false);for(const pd of allPads())G.pad(pd,1);G.dark(true)})}
function outlineGerber(){return gerber('Profile,NP','Positive',G=>{const P=boardOutline();G.line(P.concat([P[0]]),1)})}
function drillFile(plated=true){
  const o=fabOrigin(),holes=[];
  if(plated){for(const pd of allPads())if(pd.tht)holes.push({d:pd.drill,p:[pd.x,pd.y]});
    for(const v of S.vias)holes.push({d:v.drill,p:[v.x,v.y]})}
  else for(const hl of allHoles())holes.push({d:hl.d,p:[hl.x,hl.y]});
  const sizes=[...new Set(holes.map(h=>h.d))].sort((a,b)=>a-b);
  const out=['M48','; DRILL file {PCB Paint '+APP_VERSION+'}','; FORMAT={-:-/ absolute / metric / decimal}','; #@! TF.FileFunction,'+(plated?'Plated,1,2,PTH':'NonPlated,1,2,NPTH'),'FMAT,2','METRIC'];
  sizes.forEach((d,i)=>out.push(`T${i+1}C${(d/10).toFixed(3)}`));
  out.push('%');
  sizes.forEach((d,i)=>{out.push(`T${i+1}`);for(const h of holes)if(h.d===d){const[x,y]=toMM(h.p,o);out.push(`X${x.toFixed(3)}Y${y.toFixed(3)}`)}});
  out.push('M30');return out.join('\n')+'\n';
}
function fabFiles(){
  const n=(S.name||'board').replace(/[^\w-]+/g,'-');
  return[{name:n+'-F_Cu.gtl',data:copperGerber('top')},{name:n+'-B_Cu.gbl',data:copperGerber('bottom')},
    {name:n+'-F_Mask.gts',data:maskGerber('top')},{name:n+'-B_Mask.gbs',data:maskGerber('bottom')},
    {name:n+'-F_Paste.gtp',data:pasteGerber()},{name:n+'-F_Silkscreen.gto',data:silkGerber()},
    {name:n+'-Edge_Cuts.gm1',data:outlineGerber()},{name:n+'-PTH.drl',data:drillFile()}].concat(allHoles().length?[{name:n+'-NPTH.drl',data:drillFile(false)}]:[]);
}

/* ---------------- SVG (1:1 in mm) ---------------- */
function copperSVG(layer,mirror){
  const P=boardOutline(),b=bboxOf(P),w=b.x1-b.x0,h=b.y1-b.y0,d=P=>'M'+P.map(p=>p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' L');
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${w/10}mm" height="${h/10}mm" viewBox="${b.x0} ${b.y0} ${w} ${h}"><g${mirror?` transform="translate(${b.x0+b.x1} 0) scale(-1 1)"`:''}>`;
  s+=`<path d="${d(P)}Z" fill="#fff" stroke="#000" stroke-width="0.5"/>`;
  for(const f of pourFills())if(f.layer===layer&&!f.empty)s+=`<path d="${f.loops.map(L=>d(L)+'Z').join('')}" fill="#000" fill-rule="evenodd"/>`;
  s+='<g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">'+S.traces.filter(t=>t.layer===layer).map(t=>`<path d="${d(t.pts)}" stroke-width="${t.width}"/>`).join('')+'</g>';
  const pads=allPads().filter(pd=>padOn(pd,layer));
  s+='<g fill="#000">'+pads.map(pd=>padShape(pd.x,pd.y,pd.w,pd.h,pd.s,'')).join('')+S.vias.map(v=>`<circle cx="${v.x}" cy="${v.y}" r="${v.d/2}"/>`).join('')+'</g>';
  s+='<g fill="#fff">'+pads.filter(pd=>pd.tht).map(pd=>`<circle cx="${pd.x}" cy="${pd.y}" r="${pd.drill/2}"/>`).join('')+S.vias.map(v=>`<circle cx="${v.x}" cy="${v.y}" r="${v.drill/2}"/>`).join('')+allHoles().map(hl=>`<circle cx="${hl.x}" cy="${hl.y}" r="${hl.d/2}"/>`).join('')+'</g></g></svg>';
  return s;
}

/* ---------------- zip (stored, no compression) ---------------- */
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u8){let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
function makeZip(files){
  const enc=new TextEncoder(),parts=[],central=[];let off=0;
  const d=new Date(),time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  for(const f of files){
    const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(10,time,true);h.setUint16(12,date,true);h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);
    parts.push(new Uint8Array(h.buffer),name,data);
    const c=new DataView(new ArrayBuffer(46));c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(12,time,true);c.setUint16(14,date,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer),name);off+=30+name.length+data.length;
  }
  const size=central.reduce((s,a)=>s+a.length,0),e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,off,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)],{type:'application/zip'});
}
