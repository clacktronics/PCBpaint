/* ============================================================
   PCB Paint — app: state, rendering and interaction
   Units: 1 board unit = 0.1 mm
   ============================================================ */
const LS='pcbpaint-v1';
function load(){try{const s=localStorage.getItem(LS);return s?migrate(JSON.parse(s)):null}catch(e){return null}}
function save(){let ok=true;try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){ok=false}document.getElementById('fSaved').textContent=ok?'Saved in this browser':'Couldn’t autosave — use Save .json'}

let S=load()||seed();
const UI={tool:'brush',view:'top',layer:'top',width:6,corners:'round',tidy:true,snap:true,shove:true,
  thermal:true,via:1,grid:true,eraseMode:'whole',silkW:2,silkT:14,
  selNet:S.nets[0]?S.nets[0].id:null,arming:null,armRot:0,partQuery:'',
  vb:null,cursor:null,hover:null,drag:null,preview:null,marks:[],marksUntil:0,outline:null,text:null};
const ERASE_R=5,GRID=5;
const hist=[],fut=[];
function snapshot(){hist.push(JSON.stringify(S));if(hist.length>150)hist.shift();fut.length=0}
function undo(){if(!hist.length)return toast('Nothing to undo');fut.push(JSON.stringify(S));S=JSON.parse(hist.pop());fixSel();changed()}
function redo(){if(!fut.length)return toast('Nothing to redo');hist.push(JSON.stringify(S));S=JSON.parse(fut.pop());fixSel();changed()}
function fixSel(){if(!S.nets.find(n=>n.id===UI.selNet))UI.selNet=S.nets[0]?S.nets[0].id:null}
const otherLayer=l=>l==='top'?'bottom':'top';
const round2=p=>[+p[0].toFixed(2),+p[1].toFixed(2)];
const snapGrid=p=>[Math.round(p[0]/GRID)*GRID,Math.round(p[1]/GRID)*GRID];

/* ---------------- picking ---------------- */
function whatsAt(p,layer=UI.layer){const nets=padNets();
  for(const pd of allPads())if(padOn(pd,layer)&&inRect(p,pd,2)){const pn=nets.map[pd.key]||null;return{pad:pd,padNet:pn,net:pn}}
  for(const v of S.vias)if(hyp(p,[v.x,v.y])<=v.d/2+2)return{via:v,net:v.net};
  for(let i=S.traces.length-1;i>=0;i--){const t=S.traces[i];if(t.layer===layer&&closestPoly(p,t.pts).d<=t.width/2+2)return{trace:t,net:t.net}}
  const f=pourAt(p,layer);if(f)return{pour:f,net:f.net};
  return{}}
function partAt(p){for(let i=S.parts.length-1;i>=0;i--)if(inRect(p,partBox(S.parts[i]),2))return S.parts[i];return null}
function silkAt(p){for(let i=S.silk.length-1;i>=0;i--){const s=S.silk[i];if(s.kind==='line'){if(closestPoly(p,s.pts).d<=s.width/2+3)return s}else if(p[0]>=s.x-2&&p[0]<=s.x+textWidth(s.text,s.size)+2&&p[1]>=s.y-s.size-2&&p[1]<=s.y+2)return s}return null}

function addNet(name){snapshot();const used=new Set(S.nets.map(n=>n.color.toUpperCase()));let color=PALETTE.find(c=>!used.has(c.toUpperCase()));if(!color){const h=Math.floor(Math.random()*360);color=hslHex(h,75,55)}
  const n={id:'n'+(S.seq++),name:name||('NET '+(S.nets.length+1)),color};S.nets.push(n);selectNet(n.id);changed();return n}
function hslHex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return'#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')}
/* Selecting a net brings back its remembered brush size, if it has one. */
function selectNet(id){UI.selNet=id;const n=netById(id);if(n&&n.width)setWidth(n.width,true);syncNetW()}

/* ---------------- stroke pipeline ---------------- */
function tidy(raw){
  if(!UI.tidy)return rdp(raw,0.8);
  if(UI.corners==='free')return chaikin(rdp(raw,2),2,0.25);
  let P=octi(rdp(raw,4));
  if(UI.corners==='round')P=chaikin(P,2,0.2);
  return P;
}
/* Pads and vias on the layer that belong to another net. */
function foreignObstacles(net,layer,nets){const o=[];
  for(const pd of allPads())if(padOn(pd,layer)){const n=nets.map[pd.key];if(n&&n!==net)o.push({x0:pd.x0,y0:pd.y0,x1:pd.x1,y1:pd.y1,label:pd.part.ref,what:'pad',net:n})}
  for(const v of S.vias)if(v.net!==net)o.push(Object.assign(viaRect(v),{label:'a via',what:'via',net:v.net}));
  return o}
function trimAtPads(P,obs,w){if(P.length<2||!obs.length)return{pts:P};const R=resample(P,2);for(let i=1;i<R.length;i++){for(const ob of obs){if(pointRectDist(R[i],ob)<w/2+S.rules.gap){const keep=R.slice(0,Math.max(1,i-1)+1);return{pts:rdp(keep,0.5),cut:true,ob}}}}return{pts:P}}
function trimAtCross(P,foreign,w){for(let k=0;k<P.length-1;k++){let best=null;for(const t of foreign)for(let j=0;j<t.pts.length-1;j++){const X=segInt(P[k],P[k+1],t.pts[j],t.pts[j+1]);if(X&&(!best||X.t<best.t))best={t:X.t,p:X.p,tr:t}}
  if(best){let path=P.slice(0,k+1).map(p=>p.slice());path.push(best.p);path=trimEnd(path,w/2+best.tr.width/2+S.rules.gap);return{pts:path,cut:true,t:best.tr}}}return{pts:P}}

/* Shove: push the victim's free points out of the aggressor's keep-out,
   then relax nearby points so it bends smoothly. Pads and vias never move. */
function shoveTrace(vpts,vw,apts,aw,fixedRects){
  if(apts.length<2||vpts.length<2)return null;
  const req=aw/2+vw/2+S.rules.gap;
  if(polyDist(vpts,apts)>=req-0.05)return null;
  let P=resample(vpts,2.5);
  const fixed=P.map((p,i)=>i===0||i===P.length-1||fixedRects.some(r=>inRect(p,r,0)));
  const pushPass=()=>{let any=false;for(let i=1;i<P.length-1;i++){if(fixed[i])continue;const c=closestPoly(P[i],apts);if(c.d<req){let nx=P[i][0]-c.q[0],ny=P[i][1]-c.q[1],L=Math.hypot(nx,ny);if(L<1e-3){const a=P[i-1],b=P[i+1];nx=-(b[1]-a[1]);ny=b[0]-a[0];L=Math.hypot(nx,ny)||1}const k=(req-c.d)+0.35;P[i]=[P[i][0]+nx/L*k,P[i][1]+ny/L*k];any=true}}return any};
  if(!pushPass())return null;
  for(let it=0;it<8;it++){
    for(let s=0;s<2;s++){const Q=P.map(p=>p.slice());for(let i=1;i<P.length-1;i++){if(fixed[i])continue;if(closestPoly(P[i],apts).d<req*3)Q[i]=[P[i][0]*0.5+(P[i-1][0]+P[i+1][0])*0.25,P[i][1]*0.5+(P[i-1][1]+P[i+1][1])*0.25]}P=Q}
    pushPass();
  }
  return rdp(P,0.6);
}

function computeEffect(raw,net,w,final,layer){
  let pts=final?tidy(raw):(raw.length>2?rdp(raw,0.8):raw.map(p=>p.slice()));
  let note='';
  const nets=padNets();
  const r=trimAtPads(pts,foreignObstacles(net,layer,nets),w);
  if(r.cut){pts=r.pts;note=`Stopped short of ${r.ob.label} — that ${r.ob.what} is on ${netName(r.ob.net)}`}
  const foreign=S.traces.filter(t=>t.net!==net&&t.layer===layer);
  const c=trimAtCross(pts,foreign,w);
  if(c.cut){pts=c.pts;note=`Can't cross ${netName(c.t.net)} on one side — go around it, or press Alt to hop over with a via`}
  const victims=new Map();
  if(UI.shove&&pts.length>=2&&pathLen(pts)>1){
    const fixedRects=allPads().filter(pd=>padOn(pd,layer)).concat(S.vias.map(viaRect));
    for(const t of foreign){const res=shoveTrace(t.pts,t.width,pts,w,fixedRects);if(res)victims.set(t.id,res)}
    for(const[id,vp]of[...victims]){const vt=S.traces.find(t=>t.id===id);for(const t of S.traces){if(t.id===id||t.layer!==layer||t.net===vt.net||t.net===net)continue;const cur=victims.get(t.id)||t.pts;const res=shoveTrace(cur,t.width,vp,vt.width,fixedRects);if(res)victims.set(t.id,res)}}
  }
  return{pts,victims,note};
}

/* ---------------- rendering ---------------- */
const svg=document.getElementById('svg');
let rafPending=false;
function schedule(){if(!rafPending){rafPending=true;requestAnimationFrame(()=>{rafPending=false;render()})}}
const dPath=P=>P.length?'M'+P.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L'):'';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function unitsPerPx(){const r=svg.getBoundingClientRect();return r.width?Math.max(UI.vb.w/r.width,UI.vb.h/r.height):1}
function fitVB(){const b=bboxOf(boardOutline()),m=Math.max(20,(b.x1-b.x0)*0.04);return{x:b.x0-m,y:b.y0-m,w:b.x1-b.x0+2*m,h:b.y1-b.y0+2*m}}

function copperSVG_(layer,active,nets){
  const pv=UI.preview,drawing=UI.drag&&UI.drag.type==='stroke'&&UI.drag.layer===layer,victims=drawing&&pv?pv.victims:new Map();
  let h=`<g opacity="${active?1:0.3}">`;
  for(const f of pourFills())if(f.layer===layer&&!f.empty){const c=netColor(f.net);h+=`<path d="${f.loops.map(L=>dPath(L)+'Z').join('')}" fill="${c}" fill-opacity="${active?0.3:0.45}" fill-rule="evenodd" stroke="${c}" stroke-width="0.8"${f.island?' stroke-dasharray="3 2"':''}/>`}
  h+='<g fill="none" stroke-linecap="round" stroke-linejoin="round">';
  for(const t of S.traces){if(t.layer!==layer)continue;
    if(victims.has(t.id)){h+=`<path d="${dPath(t.pts)}" stroke="${netColor(t.net)}" stroke-width="${t.width}" opacity=".18" stroke-dasharray="2 3"/>`;h+=`<path d="${dPath(victims.get(t.id))}" stroke="${netColor(t.net)}" stroke-width="${t.width}"/>`}
    else h+=`<path d="${dPath(t.pts)}" stroke="${netColor(t.net)}" stroke-width="${t.width}"/>`}
  if(drawing&&pv){const d=UI.drag;h+=`<path d="${dPath(pv.pts)}" stroke="${netColor(d.net)}" stroke-width="${d.width}" opacity=".9"/>`;
    if(d.raw.length>1)h+=`<path d="${dPath(d.raw)}" stroke="#FFFFFF" stroke-width="1" opacity=".35"/>`}
  return h+'</g></g>';
}
function silkSVG_(op){let h=`<g fill="none" stroke="#F2F5F1" stroke-linecap="round" stroke-linejoin="round" opacity="${op}">`;for(const s of silkStrokes())h+=`<path d="${dPath(s.pts)}" stroke-width="${s.width}"/>`;
  const d=UI.drag;if(d&&d.type==='silk'&&d.raw.length>1)h+=`<path d="${dPath(d.raw)}" stroke-width="${UI.silkW}"/>`;return h+'</g>'}

function render(){
  if(!UI.vb)UI.vb=fitVB();
  const vb=UI.vb;svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const nets=padNets(previewTraces()),upx=unitsPerPx(),P=boardOutline(),dB=dPath(P)+'Z';
  let h=`<defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#2A4A3D" stroke-width="2.4"/></pattern></defs>`;
  h+=`<path d="${dB}" transform="translate(4 7)" fill="#0E1A15" opacity=".22"/>`;
  h+=`<path d="${dB}" fill="#1E3B30" stroke="#0E1F18" stroke-width="2"/>`;
  h+=`<path d="${dB}" fill="url(#hatch)" opacity=".35"/>`;
  const L=UI.layer,silkOnTop=UI.view==='silk';
  h+=copperSVG_(otherLayer(L),false,nets);
  if(!silkOnTop)h+=silkSVG_(0.9);
  h+=copperSVG_(L,true,nets);
  // pads
  for(const pd of allPads()){const n=nets.map[pd.key];const st=nets.conf.has(pd.key)?'#FF3B30':(n?netColor(n):'#8A9099');const sw=nets.conf.has(pd.key)?3:1.6;const op=padOn(pd,L)?1:0.35;
    h+=pd.s==='c'?`<circle cx="${pd.x}" cy="${pd.y}" r="${pd.w/2}" fill="#E8C27A" stroke="${st}" stroke-width="${sw}" opacity="${op}"/>`
      :`<rect x="${pd.x0}" y="${pd.y0}" width="${pd.w}" height="${pd.h}" rx="2" fill="#E8C27A" stroke="${st}" stroke-width="${sw}" opacity="${op}"/>`;
    if(pd.tht)h+=`<circle cx="${pd.x}" cy="${pd.y}" r="${pd.drill/2}" fill="#0E1F18"/>`}
  for(const v of S.vias)h+=`<circle cx="${v.x}" cy="${v.y}" r="${v.d/2}" fill="#E8C27A" stroke="${netColor(v.net)}" stroke-width="1.2"/><circle cx="${v.x}" cy="${v.y}" r="${v.drill/2}" fill="#0E1F18"/>`;
  if(silkOnTop)h+=silkSVG_(1);
  // check marks
  if(UI.marks.length&&performance.now()<UI.marksUntil){for(const m of UI.marks)h+=`<circle cx="${m[0]}" cy="${m[1]}" r="9" fill="none" stroke="#FF3B30" stroke-width="2"/><circle cx="${m[0]}" cy="${m[1]}" r="14" fill="none" stroke="#FF3B30" stroke-width="1" opacity=".5"/>`}
  // ghost part
  if(UI.arming&&UI.cursor){const c=UI.grid?snapGrid(UI.cursor):UI.cursor.map(Math.round);const g={id:'ghost',ref:'',fp:UI.arming,x:c[0],y:c[1],rot:UI.armRot};h+='<g opacity=".6">';const b=bodyOf(g);h+=b.round?`<circle cx="${g.x}" cy="${g.y}" r="${b.w/2}" fill="none" stroke="#fff" stroke-dasharray="3 2"/>`:`<rect x="${b.x0}" y="${b.y0}" width="${b.w}" height="${b.h}" fill="none" stroke="#fff" stroke-dasharray="3 2"/>`;for(const pd of padsOf(g))h+=pd.s==='c'?`<circle cx="${pd.x}" cy="${pd.y}" r="${pd.w/2}" fill="#E8C27A"/>`:`<rect x="${pd.x0}" y="${pd.y0}" width="${pd.w}" height="${pd.h}" fill="#E8C27A"/>`;h+='</g>'}
  // board shape editing
  if(UI.tool==='shape'){const hr=6*upx;
    if(UI.outline){const O=UI.outline,c=UI.cursor?snapGrid(UI.cursor):null;h+=`<path d="${dPath(c?O.concat([c]):O)}" fill="none" stroke="#FF6B4A" stroke-width="${2*upx}" stroke-dasharray="${6*upx} ${4*upx}"/>`;O.forEach((q,i)=>h+=`<circle cx="${q[0]}" cy="${q[1]}" r="${(i?4:7)*upx}" fill="${i?'#fff':'#FF6B4A'}" stroke="#16191D" stroke-width="${1.5*upx}"/>`)}
    else for(const hd of shapeHandles())h+=`<circle cx="${hd.p[0]}" cy="${hd.p[1]}" r="${hd.kind==='m'?hr*0.6:hr}" fill="#fff" fill-opacity="${hd.kind==='m'?0.6:1}" stroke="#16191D" stroke-width="${1.5*upx}"/>`}
  // cursors
  const c=UI.cursor;
  if(c&&!UI.arming){
    const drawing=UI.drag&&UI.drag.type==='stroke';
    if(['brush','pour','via'].includes(UI.tool)){const net=drawing?UI.drag.net:((UI.hover&&UI.hover.net)||UI.selNet);const col=net?netColor(net):'#fff';
      if(UI.tool==='brush'){const r=Math.max(3,UI.width/2);h+=`<circle cx="${c[0]}" cy="${c[1]}" r="${r+2}" fill="${col}" fill-opacity=".18" stroke="#fff" stroke-width="1.2"/><circle cx="${c[0]}" cy="${c[1]}" r="1.4" fill="#fff"/>`}
      if(UI.tool==='via'){const v=VIA_SIZES[UI.via];h+=`<circle cx="${c[0]}" cy="${c[1]}" r="${v.d/2}" fill="${col}" fill-opacity=".5" stroke="#fff" stroke-width="1"/>`}
      if(net&&!drawing){const lbl=netName(net)+((UI.hover&&UI.hover.net)?' (picked up)':'')+(UI.tool==='brush'?'':UI.tool==='pour'?' · pour':' · via');const r=UI.tool==='brush'?Math.max(3,UI.width/2):6;const s=Math.max(1,upx*1.6);const tw=lbl.length*4.6+20;
        h+=`<g transform="translate(${c[0]+r+6} ${c[1]-8*s}) scale(${s})"><rect width="${tw}" height="16" rx="5" fill="#16191D"/><circle cx="8" cy="8" r="3" fill="${col}"/><text x="14" y="11" fill="#fff" font-size="7.5" font-family="Bricolage Grotesque, sans-serif" font-weight="700">${esc(lbl)}</text></g>`}}
    else if(UI.tool==='silk')h+=`<circle cx="${c[0]}" cy="${c[1]}" r="${UI.silkW/2+1.5}" fill="#F2F5F1" fill-opacity=".3" stroke="#fff" stroke-width="1"/>`;
    else if(UI.tool==='erase'&&UI.eraseMode==='bit')h+=`<circle cx="${c[0]}" cy="${c[1]}" r="${ERASE_R}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2 1.5"/>`;
  }
  svg.innerHTML=h;
  renderChrome(nets);
}
function previewTraces(){const pv=UI.preview;if(!pv||!UI.drag||UI.drag.type!=='stroke')return S.traces;const arr=S.traces.map(t=>pv.victims.has(t.id)?{...t,pts:pv.victims.get(t.id)}:t);if(pv.pts.length>1)arr.push({id:'_p',net:UI.drag.net,width:UI.drag.width,layer:UI.drag.layer,pts:pv.pts});return arr}

const TOOL_NAMES={brush:'Brush',move:'Move',pour:'Pour',via:'Via',erase:'Eraser',silk:'Silk',shape:'Shape'};
function renderChrome(nets){
  const n=netById(UI.selNet);
  document.getElementById('curNet').innerHTML=n?`<span class="dot" style="background:${n.color}"></span>${TOOL_NAMES[UI.tool]} · ${esc(n.name)} <span class="mono" style="font-weight:400;color:#5A626D">${UI.layer}</span>`:'No net yet — press N';
  const fit=fitVB();document.getElementById('zLbl').textContent=Math.round(fit.w/UI.vb.w*100)+'%';
  const conf=nets.conf.size;
  document.getElementById('status').innerHTML=conf?`<span class="warn" style="color:#FF8A80">●</span> ${conf} pad${conf>1?'s':''} touched by two nets`:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7CC243" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"/></svg> ${S.traces.length} strokes · ${S.nets.length} nets`;
  const bb=bboxOf(boardOutline());
  document.getElementById('fName').textContent=(S.name||'untitled')+'.pcbp';
  document.getElementById('fBoard').textContent=`Board ${((bb.x1-bb.x0)/10).toFixed(1).replace(/\.0$/,'')} × ${((bb.y1-bb.y0)/10).toFixed(1).replace(/\.0$/,'')} mm`;
  document.getElementById('fCounts').textContent=`${S.parts.length} parts · ${S.traces.length} strokes · ${S.vias.length} vias · ${S.pours.length} pours`;
  if(UI.cursor)document.getElementById('fCursor').textContent=`Cursor ${((UI.cursor[0]-bb.x0)/10).toFixed(1)}, ${((UI.cursor[1]-bb.y0)/10).toFixed(1)} mm`;
  // live pot stats
  const counts={};for(const k in nets.map)counts[nets.map[k]]=(counts[nets.map[k]]||0)+1;
  document.querySelectorAll('.pot').forEach(el=>{const id=el.dataset.id;const st=el.querySelector('.pstat');const strokes=S.traces.filter(t=>t.net===id).length,vias=S.vias.filter(v=>v.net===id).length,pours=S.pours.filter(f=>f.net===id).length;
    st.textContent=`${counts[id]||0} pads · ${strokes} stroke${strokes===1?'':'s'}`+(vias?` · ${vias} via${vias>1?'s':''}`:'')+(pours?` · ${pours} pour${pours>1?'s':''}`:'');el.classList.toggle('sel',id===UI.selNet)});
}

function renderPots(){
  const box=document.getElementById('pots');
  box.innerHTML=S.nets.map((n,i)=>`<div class="pot" data-id="${n.id}" draggable="true">
    <span class="pkey">${i<9?i+1:''}</span>
    <label class="swatch" style="background:${n.color}" title="Change colour"><input type="color" value="${n.color}" aria-label="Colour for ${esc(n.name)}"></label>
    <span class="pinfo"><input class="pname" value="${esc(n.name)}" aria-label="Net name" spellcheck="false"><span class="pstat"></span></span>
    <button class="pdel" aria-label="Delete ${esc(n.name)}">×</button></div>`).join('')||'<p style="margin:0;font-size:13px;color:#5A626D">No nets yet. Add one, or just start painting.</p>';
  schedule();
}
function renderParts(){
  const q=UI.partQuery.trim().toLowerCase();
  const list=Object.entries(FP).filter(([k,f])=>!q||(f.label+' '+f.pkg+' '+f.prefix+' '+k).toLowerCase().includes(q));
  document.getElementById('parts').innerHTML=list.map(([k,f])=>{
    const xs=f.pads.map(p=>[p[0]-p[2]/2,p[0]+p[2]/2]).flat().concat([-f.body[0]/2,f.body[0]/2]),ys=f.pads.map(p=>[p[1]-p[3]/2,p[1]+p[3]/2]).flat().concat([-f.body[1]/2,f.body[1]/2]);
    const x0=Math.min(...xs)-3,x1=Math.max(...xs)+3,y0=Math.min(...ys)-3,y1=Math.max(...ys)+3;
    const body=f.round?`<circle cx="0" cy="0" r="${f.body[0]/2}" fill="none" stroke="#5A626D" stroke-width="1.6"/>`:`<rect x="${-f.body[0]/2}" y="${-f.body[1]/2}" width="${f.body[0]}" height="${f.body[1]}" fill="none" stroke="#5A626D" stroke-width="1.6"/>`;
    const pads=f.pads.map(([x,y,w,hh,s])=>s==='c'?`<circle cx="${x}" cy="${y}" r="${w/2}" fill="#D7A748"/>`:`<rect x="${x-w/2}" y="${y-hh/2}" width="${w}" height="${hh}" fill="#D7A748"/>`).join('');
    return`<button data-fp="${k}" aria-pressed="${UI.arming===k}"><svg width="48" height="36" viewBox="${x0} ${y0} ${x1-x0} ${y1-y0}" aria-hidden="true">${body}${pads}</svg><b>${f.label}</b><small>${f.pkg}</small></button>`}).join('')||'<p style="margin:0;font-size:13px;color:#5A626D;grid-column:1/-1">No parts match.</p>';
}
function changed(){save();renderPots();renderParts();syncShapeOpts();syncNetW();schedule()}

/* ---------------- interaction ---------------- */
function toB(e){const pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const m=svg.getScreenCTM();if(!m)return[0,0];const q=pt.matrixTransform(m.inverse());return[q.x,q.y]}
function toScreen(p){const pt=svg.createSVGPoint();pt.x=p[0];pt.y=p[1];const q=pt.matrixTransform(svg.getScreenCTM());const r=svg.getBoundingClientRect();return[q.x-r.left,q.y-r.top]}
let spaceDown=false;

svg.addEventListener('pointerdown',e=>{
  const p=toB(e);
  if(UI.text)commitText();
  if(e.button===1||(e.button===0&&spaceDown)){e.preventDefault();startPan(e);return}
  if(e.button!==0)return;
  svg.setPointerCapture(e.pointerId);
  if(UI.arming){placePart(p,e.shiftKey);return}
  switch(UI.tool){
    case'brush':startStroke(p,e.altKey);break;
    case'erase':snapshot();UI.drag={type:'erase',changed:false};eraseAt(p,true);break;
    case'move':{const part=partAt(p),s=!part&&silkAt(p);if(part)startMove(part,p);else if(s)startSilkMove(s,p);else startPan(e);break}
    case'pour':pourClick(p);break;
    case'via':placeVia(p);break;
    case'silk':UI.drag={type:'silk',raw:[p]};break;
    case'shape':shapeDown(p,e);break;
  }
  schedule();
});
svg.addEventListener('pointermove',e=>{
  const p=toB(e);UI.cursor=p;const d=UI.drag;
  if(d&&d.type==='stroke'){const l=d.raw[d.raw.length-1];if(hyp(p,l)>1.2){d.raw.push(p);UI.preview=computeEffect(d.raw,d.net,d.width,false,d.layer)}}
  else if(d&&d.type==='silk'){if(hyp(p,d.raw[d.raw.length-1])>1.2)d.raw.push(p)}
  else if(d&&d.type==='erase')eraseAt(p,false);
  else if(d&&d.type==='move')moveTo(p);
  else if(d&&d.type==='silkmove')silkMoveTo(p);
  else if(d&&d.type==='handle')handleTo(p);
  else if(d&&d.type==='pan')panTo(e);
  else UI.hover=['brush','pour','via'].includes(UI.tool)?whatsAt(p):null;
  schedule();
});
svg.addEventListener('pointerleave',()=>{if(!UI.drag){UI.cursor=null;schedule()}});
svg.addEventListener('dblclick',e=>{if(UI.tool==='shape'&&UI.outline){e.preventDefault();finishOutline()}});
function endDrag(){
  const d=UI.drag;if(!d)return;UI.drag=null;
  if(d.type==='stroke')commitStroke(d);
  else if(d.type==='silk')finishSilk(d);
  else if(d.type==='erase'){if(!d.changed)hist.pop();else changed()}
  else if(d.type==='move'||d.type==='silkmove'||d.type==='handle'){if(!d.moved)hist.pop();else changed()}
  svg.style.cursor='';UI.preview=null;schedule();
}
window.addEventListener('pointerup',endDrag);
window.addEventListener('pointercancel',endDrag);

/* brush */
function startStroke(p,alt){
  const info=whatsAt(p);
  let net=info.net||UI.selNet,grouped=false;
  if(alt&&!info.net){net=addNet().id;grouped=true;toast(`New net ${netName(net)} — name it in Paint pots`)}
  else if(!net){net=addNet().id;grouped=true}
  if(info.net&&info.net!==UI.selNet)flashPot(info.net);
  selectNet(net);
  let start=p;
  if(UI.snap&&info.pad&&(!info.padNet||info.padNet===net))start=[info.pad.x,info.pad.y];
  else if(info.via)start=[info.via.x,info.via.y];
  UI.drag={type:'stroke',net,raw:[start],width:UI.width,layer:UI.layer,grouped};
  UI.preview={pts:[start],victims:new Map(),note:''};
}
/* Tidy, check and store a stroke. Returns the committed points, or null. */
function commitStroke(d){
  const raw=d.raw.slice();
  if(raw.length<2||pathLen(raw)<3)return null;
  const end=whatsAt(raw[raw.length-1],d.layer);
  if(UI.snap&&end.pad&&(!end.padNet||end.padNet===d.net))raw[raw.length-1]=[end.pad.x,end.pad.y];
  else if(end.via&&end.via.net===d.net)raw[raw.length-1]=[end.via.x,end.via.y];
  const eff=computeEffect(raw,d.net,d.width,true,d.layer);
  if(eff.pts.length<2||pathLen(eff.pts)<3){toast(eff.note||'Stroke too short');return null}
  if(!d.grouped)snapshot();d.grouped=true;
  for(const[id,pts]of eff.victims){const t=S.traces.find(t=>t.id===id);if(t)t.pts=pts}
  S.traces.push({id:'t'+(S.seq++),net:d.net,width:d.width,layer:d.layer,pts:eff.pts.map(round2)});
  if(eff.note)toast(eff.note);
  else if(eff.victims.size){const names=[...new Set([...eff.victims.keys()].map(id=>netName(S.traces.find(t=>t.id===id).net)))];toast(`Nudged ${names.join(', ')} out of the way`)}
  changed();
  return{pts:eff.pts,cut:!!eff.note};
}
/* Alt while painting: finish this stroke, drop a via and carry on on the other side. */
function hopLayer(){
  const d=UI.drag;if(!d||d.type!=='stroke')return;
  const res=commitStroke(d);
  if(res&&res.cut){UI.drag=null;UI.preview=null;schedule();return}
  const at=res?res.pts[res.pts.length-1]:d.raw[d.raw.length-1];
  const vs=VIA_SIZES[UI.via],ok=viaClear(at,d.net,vs.d);
  if(!ok.ok){toast(ok.why);UI.drag=null;UI.preview=null;schedule();return}
  if(!d.grouped)snapshot();
  if(!S.vias.some(v=>hyp([v.x,v.y],at)<1))S.vias.push({id:'v'+(S.seq++),net:d.net,x:+at[0].toFixed(2),y:+at[1].toFixed(2),d:vs.d,drill:vs.drill});
  UI.layer=otherLayer(UI.layer);UI.view=UI.layer;syncLayerButtons();
  UI.drag={type:'stroke',net:d.net,raw:[at.slice()],width:d.width,layer:UI.layer,grouped:true};
  UI.preview={pts:[at],victims:new Map(),note:''};
  changed();toast(`Via dropped — now painting on ${UI.layer} copper`);
}

/* vias */
function viaClear(p,net,dd){
  const g=S.rules.gap,nets=padNets();
  if(!pointInPoly(p,boardOutline()))return{ok:false,why:'Vias have to go on the board'};
  for(const pd of allPads()){const n=nets.map[pd.key];if(pointRectDist(p,pd)<dd/2+g&&(pd.tht||(n&&n!==net)))return{ok:false,why:`Too close to ${pd.part.ref} for a via`}}
  for(const v of S.vias)if(hyp(p,[v.x,v.y])<(v.d+dd)/2+g&&hyp(p,[v.x,v.y])>=1)return{ok:false,why:'Too close to another via'};
  for(const t of S.traces)if(t.net!==net&&closestPoly(p,t.pts).d<t.width/2+dd/2+g)return{ok:false,why:`Too close to ${netName(t.net)} for a via`};
  return{ok:true};
}
function placeVia(p){
  const info=whatsAt(p);
  if(info.via)return toast('There’s already a via here');
  let at=p;if(info.trace)at=closestPoly(p,info.trace.pts).q;
  let net=info.net||UI.selNet;
  const vs=VIA_SIZES[UI.via],ok=viaClear(at,net,vs.d);
  if(!ok.ok)return toast(ok.why);
  if(!net)net=addNet().id;else snapshot();
  if(info.net&&info.net!==UI.selNet)flashPot(info.net);
  selectNet(net);
  S.vias.push({id:'v'+(S.seq++),net,x:+at[0].toFixed(2),y:+at[1].toFixed(2),d:vs.d,drill:vs.drill});
  changed();toast(`Via on ${netName(net)} — it joins top and bottom copper`);
}

/* pour */
function pourClick(p){
  if(!pointInPoly(p,boardOutline()))return toast('Click inside the board to pour');
  const ex=pourAt(p,UI.layer);if(ex)return toast(`That’s already ${netName(ex.net)} pour — the Eraser removes it`);
  const info=whatsAt(p);let net=info.net||UI.selNet;
  if(!net)net=addNet().id;else snapshot();
  if(info.net&&info.net!==UI.selNet)flashPot(info.net);
  selectNet(net);
  const po={id:'f'+(S.seq++),net,layer:UI.layer,seed:p.map(v=>Math.round(v)),thermal:UI.thermal};
  S.pours.push(po);
  const f=pourFills().find(x=>x.id===po.id),name=netName(net);
  if(!f||f.empty){S=JSON.parse(hist.pop());fixSel();changed();return toast('No room to pour there — it’s too close to other copper')}
  changed();
  toast(f.island?`Poured ${name}, but it isn’t touching any ${name} copper yet`:`Poured ${name} — it keeps clear of other nets and refills as you edit`);
}

/* eraser */
function cutAround(pts,p,r){const runs=[];let cur=[];for(const q of resample(pts,1)){if(hyp(q,p)>r)cur.push(q);else{if(cur.length)runs.push(cur);cur=[]}}if(cur.length)runs.push(cur);return runs.filter(u=>u.length>=2&&pathLen(u)>=2).map(u=>rdp(u,0.3).map(round2))}
function eraseAt(p,first){
  const d=UI.drag,bit=UI.eraseMode==='bit';let hit=false;
  const cut=(list,isHit,rad)=>{const out=[];for(const t of list){if(!isHit(t)){out.push(t);continue}hit=true;if(!bit)continue;cutAround(t.pts,p,rad(t)).forEach((pts,i)=>out.push({...t,id:i?(t.id[0]+(S.seq++)):t.id,pts}))}return out};
  if(UI.view==='silk'){
    const tx=silkAt(p);if(tx&&tx.kind==='text'){S.silk=S.silk.filter(s=>s!==tx);hit=true}
    S.silk=cut(S.silk,s=>s.kind==='line'&&closestPoly(p,s.pts).d<=s.width/2+(bit?ERASE_R:3),s=>s.width/2+ERASE_R);
  }else{
    S.traces=cut(S.traces,t=>t.layer===UI.layer&&closestPoly(p,t.pts).d<=t.width/2+(bit?ERASE_R:3),t=>t.width/2+ERASE_R);
    const nv=S.vias.filter(v=>hyp(p,[v.x,v.y])>v.d/2+2);if(nv.length!==S.vias.length){S.vias=nv;hit=true}
    if(first&&!hit){const f=pourAt(p,UI.layer);if(f){S.pours=S.pours.filter(x=>x.id!==f.id);hit=true;toast(`Removed the ${netName(f.net)} pour`)}}
  }
  if(hit){d.changed=true;save();renderChrome(padNets())}
}

/* move */
function attachedPoints(part){const pads=padsOf(part),out=[];S.traces.forEach(t=>t.pts.forEach((q,i)=>{if(pads.some(pd=>padOn(pd,t.layer)&&inRect(q,pd,1)))out.push([t.id,i,q.slice()])}));return out}
function startMove(part,p){snapshot();UI.drag={type:'move',part:S.parts.find(x=>x.id===part.id),start:p,ox:part.x,oy:part.y,attach:attachedPoints(part),moved:false};svg.style.cursor='grabbing'}
function moveTo(p){const d=UI.drag;let x=d.ox+Math.round(p[0]-d.start[0]),y=d.oy+Math.round(p[1]-d.start[1]);if(UI.grid)[x,y]=snapGrid([x,y]);const dx=x-d.ox,dy=y-d.oy;d.part.x=x;d.part.y=y;for(const[id,i,o]of d.attach){const t=S.traces.find(t=>t.id===id);if(t&&t.pts[i])t.pts[i]=[o[0]+dx,o[1]+dy]}d.moved=d.moved||dx!==0||dy!==0}
/* Rotating a part carries the trace ends sitting on its pads with it. */
function rotatePart(part){snapshot();const att=attachedPoints(part);for(const[id,i,o]of att){const t=S.traces.find(t=>t.id===id);const[rx,ry]=rotP(o[0]-part.x,o[1]-part.y,90);t.pts[i]=[part.x+rx,part.y+ry]}part.rot=(part.rot+90)%360;changed()}
function startSilkMove(item,p){snapshot();UI.drag={type:'silkmove',item,start:p,orig:JSON.parse(JSON.stringify(item)),moved:false};svg.style.cursor='grabbing'}
function silkMoveTo(p){const d=UI.drag,dx=Math.round(p[0]-d.start[0]),dy=Math.round(p[1]-d.start[1]);if(d.item.kind==='text'){d.item.x=d.orig.x+dx;d.item.y=d.orig.y+dy}else d.item.pts=d.orig.pts.map(q=>[q[0]+dx,q[1]+dy]);d.moved=d.moved||dx!==0||dy!==0}
function startPan(e){UI.drag={type:'pan',cx:e.clientX,cy:e.clientY,vx:UI.vb.x,vy:UI.vb.y}}
function panTo(e){const d=UI.drag;const s=unitsPerPx();UI.vb.x=d.vx-(e.clientX-d.cx)*s;UI.vb.y=d.vy-(e.clientY-d.cy)*s}
function placePart(p,keep){const f=FP[UI.arming];snapshot();const used=S.parts.filter(x=>x.ref.startsWith(f.prefix)&&/^\d+$/.test(x.ref.slice(f.prefix.length))).map(x=>parseInt(x.ref.slice(f.prefix.length)));const ref=f.prefix+(Math.max(0,...used)+1);
  const q=UI.grid?snapGrid(p):p.map(Math.round);
  S.parts.push({id:'p'+(S.seq++),ref,fp:UI.arming,x:q[0],y:q[1],rot:UI.armRot});toast(`Placed ${ref}${keep?' — shift-click to keep placing':''}`);if(!keep)UI.arming=null;changed()}
function zoomAt(f,cx,cy){const vb=UI.vb;const nw=Math.max(60,Math.min(4000,vb.w*f));const k=nw/vb.w;if(cx==null){cx=vb.x+vb.w/2;cy=vb.y+vb.h/2}vb.x=cx-(cx-vb.x)*k;vb.y=cy-(cy-vb.y)*k;vb.w=nw;vb.h=vb.h*k;schedule()}
svg.addEventListener('wheel',e=>{e.preventDefault();const p=toB(e);zoomAt(e.deltaY>0?1.12:1/1.12,p[0],p[1])},{passive:false});

/* silk */
function finishSilk(d){
  const raw=d.raw;
  if(raw.length<2||pathLen(raw)<3)return openText(raw[0]);
  snapshot();S.silk.push({id:'s'+(S.seq++),kind:'line',width:UI.silkW,pts:chaikin(rdp(raw,1.2),2,0.25).map(round2)});changed();
}
const textIn=document.getElementById('textIn');
function openText(p){UI.text={p};const[sx,sy]=toScreen(p);textIn.style.left=Math.max(8,sx)+'px';textIn.style.top=Math.max(8,sy-40)+'px';textIn.value='';textIn.hidden=false;setTimeout(()=>textIn.focus(),0)}
function commitText(){if(!UI.text)return;const t=textIn.value.trim(),p=UI.text.p;closeText();if(!t)return;snapshot();S.silk.push({id:'s'+(S.seq++),kind:'text',x:Math.round(p[0]),y:Math.round(p[1]),size:UI.silkT,text:t});changed();toast('Text added — the Move tool can drag it')}
function closeText(){UI.text=null;textIn.hidden=true}
textIn.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitText()}else if(e.key==='Escape'){closeText()}e.stopPropagation()});
textIn.addEventListener('blur',()=>setTimeout(commitText,0));

/* board shape */
function shapeHandles(){const B=S.board;
  if(B.poly)return B.poly.map((q,i)=>({kind:'v',i,p:q})).concat(B.poly.map((q,i)=>{const r=B.poly[(i+1)%B.poly.length];return{kind:'m',i,p:[(q[0]+r[0])/2,(q[1]+r[1])/2]}}));
  const o=[];for(const sy of[-1,0,1])for(const sx of[-1,0,1])if(sx||sy)o.push({kind:'r',sx,sy,p:[B.x+B.w*(sx+1)/2,B.y+B.h*(sy+1)/2]});return o}
function shapeDown(p,e){
  const upx=unitsPerPx();
  if(UI.outline){const q=snapGrid(p);if(UI.outline.length>=3&&hyp(q,UI.outline[0])<=10*upx)return finishOutline();const l=UI.outline[UI.outline.length-1];if(!l||hyp(l,q)>=1)UI.outline.push(q);syncShapeOpts();return}
  let h=shapeHandles().find(h=>hyp(p,h.p)<=9*upx);
  if(!h)return startPan(e);
  snapshot();
  if(h.kind==='v'&&e.altKey){if(S.board.poly.length>3){S.board.poly.splice(h.i,1);setBoardFromPoly(S.board.poly);changed()}else{hist.pop();toast('A board needs at least three corners')}return}
  const inserted=h.kind==='m';
  if(inserted){S.board.poly.splice(h.i+1,0,snapGrid(h.p));h={kind:'v',i:h.i+1}}
  UI.drag={type:'handle',h,orig:JSON.parse(JSON.stringify(S.board)),moved:inserted};
}
function handleTo(p){const d=UI.drag,h=d.h,q=snapGrid(p);
  if(h.kind==='v'){S.board.poly[h.i]=q;setBoardFromPoly(S.board.poly)}
  else{const o=d.orig;let x0=o.x,y0=o.y,x1=o.x+o.w,y1=o.y+o.h;if(h.sx<0)x0=Math.min(q[0],x1-50);if(h.sx>0)x1=Math.max(q[0],x0+50);if(h.sy<0)y0=Math.min(q[1],y1-50);if(h.sy>0)y1=Math.max(q[1],y0+50);S.board={...o,x:x0,y:y0,w:x1-x0,h:y1-y0}}
  d.moved=true;syncShapeOpts()}
function finishOutline(){const O=UI.outline.filter((q,i,a)=>!i||hyp(q,a[i-1])>=1);UI.outline=null;
  if(O.length>1&&hyp(O[0],O[O.length-1])<1)O.pop();
  if(O.length<3){syncShapeOpts();schedule();return toast('An outline needs at least three corners')}
  if(polyArea(O)<0)O.reverse();
  snapshot();setBoardFromPoly(O);changed();toast('New board shape — drag corners to adjust')}
function syncShapeOpts(){
  const B=S.board,poly=!!B.poly;
  for(const[id,v]of[['nBW',B.w],['nBH',B.h]]){const el=document.getElementById(id);if(document.activeElement!==el)el.value=(v/10).toFixed(1).replace(/\.0$/,'');el.disabled=poly}
  const r=document.getElementById('rBR');r.value=B.r||0;r.disabled=poly;document.getElementById('brLbl').textContent=((B.r||0)/10).toFixed(1)+' mm';
  document.getElementById('bRectOutline').hidden=!poly||UI.tool!=='shape';document.getElementById('bDrawOutline').textContent=UI.outline?'Finish shape':'Draw any shape';
  document.getElementById('shapeHint').textContent=UI.outline?'Click to add corners · click the first corner or press Enter to finish · Esc cancels':poly?'Drag corners · drag a small dot to add a corner · Alt-click a corner to remove it':'Drag the white handles to resize';
}

function flashPot(id){requestAnimationFrame(()=>{const el=document.querySelector(`.pot[data-id="${id}"]`);if(el)el.animate([{transform:'scale(1.04)'},{transform:'scale(1)'}],{duration:220})})}
let toastT;function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2800)}

/* ---------------- tools and layers ---------------- */
function setTool(t){
  UI.tool=t;UI.arming=null;if(t!=='shape')UI.outline=null;closeText();
  if(t==='silk')UI.view='silk';else if(t==='shape')UI.view='shape';else if(['brush','pour','via'].includes(t)||UI.view==='shape')UI.view=UI.layer;
  document.querySelectorAll('nav.tools button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===t));
  svg.className.baseVal=t;svg.style.cursor='';
  document.querySelectorAll('#opts .grp').forEach(g=>g.hidden=!g.dataset.tools.split(' ').includes(t));
  document.getElementById('eraseHint').textContent=(UI.view==='silk'?'Erasing silkscreen. ':`Erasing ${UI.layer} copper. `)+(UI.eraseMode==='bit'?'Drag across a stroke to cut a piece out.':'Click or drag over strokes and vias · click inside a pour to remove it.');
  syncLayerButtons();syncShapeOpts();renderParts();schedule();
}
function setView(v){if(v==='top'||v==='bottom'){UI.layer=v;UI.view=v;setTool(['silk','shape'].includes(UI.tool)?'brush':UI.tool)}
  else if(v==='silk'&&['erase','move'].includes(UI.tool)){UI.view='silk';setTool(UI.tool)}else setTool(v)}
function syncLayerButtons(){document.querySelectorAll('.layers button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===UI.view))}
document.querySelectorAll('nav.tools button').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
document.querySelectorAll('.layers button').forEach(b=>b.onclick=()=>setView(b.dataset.view));

/* pots */
const pots=document.getElementById('pots');
function deleteNet(id){const n=netById(id);const used=S.traces.filter(t=>t.net===id).length+S.vias.filter(v=>v.net===id).length+S.pours.filter(f=>f.net===id).length;
  if(used&&!confirm(`Delete ${n.name} and its ${used} stroke${used>1?'s':''}, vias and pours?`))return;
  snapshot();S.traces=S.traces.filter(t=>t.net!==id);S.vias=S.vias.filter(v=>v.net!==id);S.pours=S.pours.filter(f=>f.net!==id);S.nets=S.nets.filter(x=>x.id!==id);fixSel();changed()}
/* Merge: drag one pot onto another. Its copper takes the target's net. */
function mergeNets(from,to){if(from===to)return;const a=netById(from),b=netById(to);if(!a||!b)return;
  if(!confirm(`Merge ${a.name} into ${b.name}? Everything painted ${a.name} becomes ${b.name}.`))return;
  snapshot();for(const t of S.traces)if(t.net===from)t.net=to;for(const v of S.vias)if(v.net===from)v.net=to;for(const f of S.pours)if(f.net===from)f.net=to;S.nets=S.nets.filter(n=>n.id!==from);selectNet(to);changed();toast(`${a.name} merged into ${b.name}`)}
pots.addEventListener('click',e=>{const row=e.target.closest('.pot');if(!row)return;const id=row.dataset.id;
  if(e.target.closest('.pdel'))return deleteNet(id);
  selectNet(id);if(!['brush','pour','via'].includes(UI.tool))setTool('brush');schedule()});
pots.addEventListener('focusin',e=>{const row=e.target.closest('.pot');if(row&&e.target.classList.contains('pname')){selectNet(row.dataset.id);schedule()}});
pots.addEventListener('change',e=>{const row=e.target.closest('.pot');if(!row)return;const n=netById(row.dataset.id);
  if(e.target.classList.contains('pname')){const v=e.target.value.trim()||n.name;if(v!==n.name){snapshot();n.name=v;changed()}else e.target.value=n.name}
  if(e.target.type==='color'){n.color=e.target.value;if(row._colorSnap){hist.push(row._colorSnap);fut.length=0;row._colorSnap=null}changed()}});
pots.addEventListener('input',e=>{if(e.target.type==='color'){const row=e.target.closest('.pot');const n=netById(row.dataset.id);if(!row._colorSnap)row._colorSnap=JSON.stringify(S);n.color=e.target.value;row.querySelector('.swatch').style.background=n.color;schedule()}});
pots.addEventListener('keydown',e=>{if(e.target.classList.contains('pname')&&e.key==='Enter')e.target.blur()});
pots.addEventListener('pointerdown',e=>{const row=e.target.closest('.pot');if(row)row.draggable=!e.target.closest('input,button')});
pots.addEventListener('dragstart',e=>{const row=e.target.closest('.pot');if(!row)return;e.dataTransfer.setData('text/x-pcbp-net',row.dataset.id);e.dataTransfer.effectAllowed='move'});
pots.addEventListener('dragover',e=>{const row=e.target.closest('.pot');if(!row||!e.dataTransfer.types.includes('text/x-pcbp-net'))return;e.preventDefault();pots.querySelectorAll('.drop').forEach(x=>x!==row&&x.classList.remove('drop'));row.classList.add('drop')});
pots.addEventListener('dragleave',e=>{const row=e.target.closest('.pot');if(row&&!row.contains(e.relatedTarget))row.classList.remove('drop')});
pots.addEventListener('drop',e=>{const row=e.target.closest('.pot');pots.querySelectorAll('.drop').forEach(x=>x.classList.remove('drop'));if(!row)return;e.preventDefault();mergeNets(e.dataTransfer.getData('text/x-pcbp-net'),row.dataset.id)});
function newNetUI(){const n=addNet();requestAnimationFrame(()=>{const inp=document.querySelector(`.pot[data-id="${n.id}"] .pname`);if(inp){inp.focus();inp.select()}});toast(`${n.name} added — type a name, then paint`)}
document.getElementById('bNewNet').onclick=newNetUI;

/* parts */
document.getElementById('parts').addEventListener('click',e=>{const b=e.target.closest('button[data-fp]');if(!b)return;UI.arming=UI.arming===b.dataset.fp?null:b.dataset.fp;UI.armRot=0;renderParts();if(UI.arming)toast('Click the board to place · R rotates · Esc cancels');schedule()});
document.getElementById('partSearch').addEventListener('input',e=>{UI.partQuery=e.target.value;renderParts()});

/* options */
/* Sliders that change the document take one undo snapshot per drag. */
function liveEdit(el,apply){el.addEventListener('input',()=>{if(!el._snap){snapshot();el._snap=true}apply(el)});el.addEventListener('change',()=>{el._snap=false;changed()})}
const wLbl=()=>document.getElementById('wLbl').textContent=(UI.width/10).toFixed(2)+' mm';
function setWidth(w,fromNet){UI.width=Math.max(2,Math.min(20,w));document.getElementById('rWidth').value=UI.width;wLbl();if(!fromNet){const n=netById(UI.selNet);if(n&&n.width){n.width=UI.width;save()}}schedule()}
function syncNetW(){const n=netById(UI.selNet);const c=document.getElementById('cNetW');c.checked=!!(n&&n.width);c.disabled=!n}
document.getElementById('rWidth').oninput=e=>setWidth(+e.target.value);
document.getElementById('cNetW').onchange=e=>{const n=netById(UI.selNet);if(!n)return;snapshot();if(e.target.checked)n.width=UI.width;else delete n.width;changed()};
const gapLbl=()=>{document.getElementById('rClear').value=S.rules.gap;document.getElementById('cLbl').textContent=(S.rules.gap/10).toFixed(2)+' mm'};
liveEdit(document.getElementById('rClear'),el=>{S.rules.gap=+el.value;gapLbl();schedule()});
document.getElementById('segCorners').onclick=e=>{const b=e.target.closest('button');if(!b)return;UI.corners=b.dataset.c;document.querySelectorAll('#segCorners button').forEach(x=>x.setAttribute('aria-pressed',x===b))};
document.getElementById('segErase').onclick=e=>{const b=e.target.closest('button');if(!b)return;UI.eraseMode=b.dataset.e;document.querySelectorAll('#segErase button').forEach(x=>x.setAttribute('aria-pressed',x===b));setTool('erase')};
document.getElementById('cTidy').onchange=e=>UI.tidy=e.target.checked;
document.getElementById('cSnap').onchange=e=>UI.snap=e.target.checked;
document.getElementById('cShove').onchange=e=>UI.shove=e.target.checked;
document.getElementById('cThermal').onchange=e=>UI.thermal=e.target.checked;
document.getElementById('cGrid').onchange=e=>UI.grid=e.target.checked;
const sVia=document.getElementById('sVia');sVia.innerHTML=VIA_SIZES.map((v,i)=>`<option value="${i}">${v.label}</option>`).join('');sVia.value=UI.via;sVia.onchange=e=>{UI.via=+e.target.value;schedule()};
const silkLbls=()=>{document.getElementById('swLbl').textContent=(UI.silkW/10).toFixed(2)+' mm';document.getElementById('stLbl').textContent=(UI.silkT/10).toFixed(1)+' mm'};
document.getElementById('rSilkW').oninput=e=>{UI.silkW=+e.target.value;silkLbls();schedule()};
document.getElementById('rSilkT').oninput=e=>{UI.silkT=+e.target.value;silkLbls()};
for(const[id,k]of[['nBW','w'],['nBH','h']])document.getElementById(id).addEventListener('change',e=>{const v=Math.round(+e.target.value*10);if(!(v>=50&&v<=5000)||S.board.poly)return syncShapeOpts();snapshot();S.board[k]=v;S.board.r=Math.min(S.board.r||0,S.board.w/2,S.board.h/2);changed()});
liveEdit(document.getElementById('rBR'),el=>{S.board.r=Math.min(+el.value,S.board.w/2,S.board.h/2);syncShapeOpts();schedule()});
document.getElementById('bDrawOutline').onclick=()=>{if(UI.outline)return finishOutline();UI.outline=[];syncShapeOpts();toast('Click corners on the canvas to draw the board')};
document.getElementById('bRectOutline').onclick=()=>{snapshot();const B=S.board;S.board={x:B.x,y:B.y,w:B.w,h:B.h,r:20};changed()};

/* header */
document.getElementById('bUndo').onclick=undo;
document.getElementById('bRedo').onclick=redo;
document.getElementById('bReset').onclick=()=>{if(!confirm('Reset to the demo board? Your current board will be replaced.'))return;snapshot();S=seed();fixSel();UI.vb=fitVB();changed();toast('Demo board restored (Undo brings yours back)')};
document.getElementById('bNew').onclick=()=>{if(!confirm('Start a new, empty board? (Undo brings this one back.)'))return;snapshot();S=migrate({name:'untitled',board:{x:60,y:70,w:500,h:300,r:20},nets:[]});fixSel();UI.vb=fitVB();changed();toast('Fresh board — pick parts from the drawer')};
document.getElementById('bSave').onclick=()=>download(JSON.stringify(S,null,1),(S.name||'board')+'.pcbp.json','application/json');
document.getElementById('bLoad').onclick=()=>document.getElementById('fileIn').click();
document.getElementById('fileIn').onchange=e=>{const f=e.target.files[0];if(!f)return;f.text().then(t=>{try{const d=JSON.parse(t);if(!d.parts||!d.traces||!d.nets)throw 0;snapshot();S=migrate(d);fixSel();UI.vb=fitVB();changed();toast('Opened '+f.name)}catch(err){toast('That file is not a PCB Paint board')}});e.target.value=''};
document.getElementById('zIn').onclick=()=>zoomAt(1/1.25);
document.getElementById('zOut').onclick=()=>zoomAt(1.25);
document.getElementById('zFit').onclick=()=>{UI.vb=fitVB();schedule()};
document.getElementById('bCheck').onclick=runCheck;
document.getElementById('bMake').onclick=openMake;
document.getElementById('tipX').onclick=()=>{document.getElementById('tip').hidden=true;try{localStorage.setItem('pcbpaint-tip','off')}catch(e){}};
try{if(localStorage.getItem('pcbpaint-tip')==='off')document.getElementById('tip').hidden=true}catch(e){}

function download(data,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}

/* ---------------- check board ---------------- */
function collectIssues(){
  const issues=[],add=(text,pts,info)=>{if(pts.length)issues.push({text,pts,info})};
  const g=S.rules.gap,nets=padNets(),pads=allPads(),pre=PRESETS[S.rules.preset]||PRESETS.jlcpcb,P=boardOutline(),fills=pourFills();
  const plural=(n,w)=>`${n} ${w}${n>1?'s':''}`;
  let m=[];
  for(let i=0;i<S.traces.length;i++)for(let j=i+1;j<S.traces.length;j++){const a=S.traces[i],b=S.traces[j];if(a.net===b.net||a.layer!==b.layer)continue;const need=a.width/2+b.width/2+g-0.3;
    for(let s=0;s<a.pts.length-1;s++){let hit=false;for(let k=0;k<b.pts.length-1;k++){if(segSegDist(a.pts[s],a.pts[s+1],b.pts[k],b.pts[k+1])<need){m.push(closestSeg(b.pts[k],a.pts[s],a.pts[s+1]).q);hit=true;break}}if(hit)break}}
  add(`${plural(m.length,'spot')} where different nets are too close`,m);
  m=[];for(const t of S.traces)for(const pd of pads){if(!padOn(pd,t.layer))continue;const pn=nets.map[pd.key];if(pn===t.net)continue;if(polyRectDist(t.pts,pd)<t.width/2+g-0.3)m.push([pd.x,pd.y])}
  add(`${plural(m.length,'trace')} too close to a pad that isn’t theirs`,m);
  m=[];for(const v of S.vias){for(const t of S.traces)if(t.net!==v.net&&closestPoly([v.x,v.y],t.pts).d<t.width/2+v.d/2+g-0.3){m.push([v.x,v.y]);break}}
  add(`${plural(m.length,'via')} too close to another net`,m);
  m=[...nets.conf].map(k=>pads.find(p=>p.key===k)).filter(Boolean).map(pd=>[pd.x,pd.y]);
  add(`${plural(m.length,'pad')} touched by two nets`,m);
  const where=it=>it.k==='t'?it.o.pts[0]:it.k==='v'?[it.o.x,it.o.y]:it.k==='p'?[it.o.x,it.o.y]:(S.pours.find(p=>p.id===it.o.id)||{seed:[0,0]}).seed;
  for(const[net,groups]of Object.entries(netPieces())){if(groups.length<2)continue;const sorted=groups.slice().sort((a,b)=>b.length-a.length);add(`${netName(net)} is in ${groups.length} pieces`,sorted.slice(1).map(gr=>where(gr[0])))}
  const edge=pre.edge*10;m=[];
  for(const t of S.traces){const bad=resample(t.pts,3).find(p=>!pointInPoly(p,P)||distToRing(p,P)<t.width/2+edge);if(bad)m.push(bad)}
  for(const pd of pads)if(!pointInPoly([pd.x,pd.y],P)||distToRing([pd.x,pd.y],P)<Math.max(pd.w,pd.h)/2+edge)m.push([pd.x,pd.y]);
  add(`${plural(m.length,'thing')} off or too near the board edge (${pre.edge} mm for ${pre.label})`,m);
  m=S.traces.filter(t=>t.width/10<pre.minWidth-1e-9).map(t=>t.pts[0]);
  add(`${plural(m.length,'trace')} thinner than ${pre.label}’s ${pre.minWidth} mm`,m);
  if(g/10<pre.minGap-1e-9)issues.push({text:`Gap ${(g/10).toFixed(2)} mm is below ${pre.label}’s ${pre.minGap} mm`,pts:[]});
  m=S.vias.filter(v=>v.drill/10<pre.minDrill-1e-9||(v.d-v.drill)/20<pre.minRing-1e-9).map(v=>[v.x,v.y]);
  add(`${plural(m.length,'via')} too small for ${pre.label} (drill ${pre.minDrill} mm, ring ${pre.minRing} mm)`,m);
  m=pads.filter(pd=>pd.tht&&(pd.drill/10<pre.minDrill-1e-9||(Math.min(pd.w,pd.h)-pd.drill)/20<pre.minRing-1e-9)).map(pd=>[pd.x,pd.y]);
  add(`${plural(m.length,'pad')} with holes too small for ${pre.label}`,m);
  m=[];for(const f of fills){const po=S.pours.find(p=>p.id===f.id);if(f.empty||f.island)m.push(po.seed)}
  add(`${plural(m.length,'pour')} not connected to anything`,m);
  m=[];for(const s of S.silk){const st=s.kind==='line'?[{pts:s.pts,width:s.width}]:textStrokes(s.text,s.x,s.y,s.size).map(pts=>({pts,width:textStrokeWidth(s.size)}));if(st.some(l=>pads.some(pd=>polyRectDist(l.pts,pd)<l.width/2)))m.push(s.kind==='line'?s.pts[0]:[s.x,s.y])}
  add(`${plural(m.length,'silkscreen mark')} over pads — trimmed off when you Make it`,m,true);
  return issues;
}
function runCheck(){
  const issues=collectIssues(),real=issues.filter(i=>!i.info);
  UI.marks=issues.flatMap(i=>i.pts);UI.marksUntil=performance.now()+5000;schedule();setTimeout(schedule,5050);
  const box=document.getElementById('checks');box.hidden=false;
  box.innerHTML=`<button class="x" aria-label="Close" onclick="this.parentNode.hidden=true">×</button>`+(issues.length?`<h3>${real.length?`${real.length} thing${real.length>1?'s':''} to look at`:'Nearly there'}</h3><ul>${issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul>`:`<h3 class="ok">All clear</h3>Every net keeps its distance and nothing is in pieces.`);
  toast(real.length?`${real.length} problem${real.length>1?'s':''} — circled in red`:'All clear — every net keeps its distance');
}

/* ---------------- make it ---------------- */
const dlg=document.getElementById('makeDlg');
function openMake(){
  document.getElementById('dName').value=S.name||'board';
  document.getElementById('presets').innerHTML=Object.entries(PRESETS).map(([k,p])=>`<label><input type="radio" name="preset" value="${k}"${S.rules.preset===k?' checked':''}><b>${p.label}</b><span>${p.note}</span><small>trace ${p.minWidth} · gap ${p.minGap} · drill ${p.minDrill} mm</small></label>`).join('');
  updateMakeCheck();dlg.showModal();
}
function updateMakeCheck(){const issues=collectIssues().filter(i=>!i.info),pre=PRESETS[S.rules.preset];
  document.getElementById('dCheck').innerHTML=issues.length?`<b class="warn">${issues.length} thing${issues.length>1?'s':''} to look at first</b> (you can still download)<ul>${issues.map(i=>`<li>${esc(i.text)}</li>`).join('')}</ul>`:`<b style="color:#2F7D1E">Ready for ${pre.label}.</b> Nothing too close, too thin or in pieces.`}
document.getElementById('presets').addEventListener('change',e=>{S.rules.preset=e.target.value;save();updateMakeCheck()});
document.getElementById('dName').addEventListener('change',e=>{const v=e.target.value.trim();if(v&&v!==S.name){snapshot();S.name=v;changed()}});
document.getElementById('bGerber').onclick=()=>{const v=document.getElementById('dName').value.trim();if(v)S.name=v;save();const files=fabFiles();download(makeZip(files),(S.name||'board').replace(/[^\w-]+/g,'-')+'-gerbers.zip');toast(`Downloaded ${files.length} files for ${PRESETS[S.rules.preset].label}`)};
document.getElementById('bSvgTop').onclick=()=>{download(copperSVG('top',false),(S.name||'board')+'-top-copper.svg','image/svg+xml');toast('Top copper downloaded as SVG (1:1, mm)')};
document.getElementById('bSvgBot').onclick=()=>{download(copperSVG('bottom',true),(S.name||'board')+'-bottom-copper.svg','image/svg+xml');toast('Bottom copper downloaded, mirrored for printing face-down')};

/* keyboard */
document.addEventListener('keydown',e=>{
  if(e.key==='Alt'&&UI.drag&&UI.drag.type==='stroke'){e.preventDefault();hopLayer();schedule();return}
  if(e.target.matches('input,textarea,select')||dlg.open)return;
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();redo();return}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(k===' '){spaceDown=true;svg.style.cursor='grab';e.preventDefault();return}
  const tools={b:'brush',v:'move',g:'pour',x:'via',e:'erase',s:'silk',o:'shape'};
  if(tools[k])setTool(tools[k]);
  else if(k==='l')setView(otherLayer(UI.layer));
  else if(k==='n'){e.preventDefault();newNetUI()}
  else if(k==='[')setWidth(UI.width-1);else if(k===']')setWidth(UI.width+1);
  else if(k==='escape'){UI.arming=null;UI.outline=null;document.getElementById('checks').hidden=true;renderParts();syncShapeOpts();schedule()}
  else if(k==='enter'&&UI.outline){finishOutline()}
  else if(k==='r'){if(UI.arming){UI.armRot=(UI.armRot+90)%360;schedule()}else if(UI.cursor){const part=partAt(UI.cursor);if(part)rotatePart(part)}}
  else if((k==='delete'||k==='backspace')&&UI.tool==='move'&&UI.cursor){const part=partAt(UI.cursor);if(part){snapshot();S.parts=S.parts.filter(p=>p!==part);changed();toast(`Removed ${part.ref}`)}}
  else if(/^[1-9]$/.test(k)){const n=S.nets[+k-1];if(n){selectNet(n.id);if(!['brush','pour','via'].includes(UI.tool))setTool('brush');schedule()}}
});
document.addEventListener('keyup',e=>{if(e.key===' '){spaceDown=false;svg.style.cursor=''}});
window.addEventListener('resize',schedule);

wLbl();gapLbl();silkLbls();renderPots();setTool('brush');syncNetW();render();
