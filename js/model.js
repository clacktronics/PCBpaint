/* ============================================================
   PCB Paint — document model
   Units: 1 board unit = 0.1 mm
   ============================================================ */
const PALETTE=['#FF6B4A','#3D7BFD','#A35BFF','#12B5A5','#FFB020','#FF5DA2','#7CC243','#0EA5C6','#E0569B','#8C6D3F','#5B6CFF','#D9480F'];
/* Pads: [dx, dy, w, h, shape, number]. Through-hole footprints have a drill (units) and their pads exist on both copper layers. */
const FP={
  soic8:{label:'NE555',pkg:'SOIC-8',prefix:'U',body:[56,80],pads:[[-42,-30,22,10,'r',1],[-42,-10,22,10,'r',2],[-42,10,22,10,'r',3],[-42,30,22,10,'r',4],[42,30,22,10,'r',5],[42,10,22,10,'r',6],[42,-10,22,10,'r',7],[42,-30,22,10,'r',8]]},
  r0805:{label:'Resistor',pkg:'0805',prefix:'R',body:[16,22],pads:[[0,-20,14,12,'r',1],[0,20,14,12,'r',2]]},
  c0805:{label:'Capacitor',pkg:'0805',prefix:'C',body:[16,14],pads:[[0,-15,14,12,'r',1],[0,15,14,12,'r',2]]},
  c1206:{label:'Big cap',pkg:'1206',prefix:'C',body:[20,20],pads:[[0,-20,16,14,'r',1],[0,20,16,14,'r',2]]},
  led5:{label:'LED',pkg:'5 mm',prefix:'LED',body:[40,40],round:true,drill:9,pads:[[-15,0,16,16,'r',1],[15,0,16,16,'c',2]]},
  hdr2:{label:'Header',pkg:'2-pin',prefix:'J',body:[28,58],drill:10,pads:[[0,-15,18,18,'r',1],[0,15,18,18,'c',2]]},
  pot:{label:'Pot',pkg:'9 mm',prefix:'RV',body:[56,56],round:true,drill:10,pads:[[-20,36,18,18,'c',1],[0,36,18,18,'c',2],[20,36,18,18,'c',3]]},
  jack:{label:'Jack',pkg:'3.5 mm',prefix:'J',body:[36,36],round:true,drill:12,pads:[[0,-26,20,20,'c',1],[0,8,20,20,'c',2],[0,26,20,20,'c',3]]},
  button:{label:'Button',pkg:'6 mm',prefix:'SW',body:[30,40],drill:11,pads:[[-22,-16,19,19,'c',1],[22,-16,19,19,'c',2],[-22,16,19,19,'c',3],[22,16,19,19,'c',4]]}
};
const VIA_SIZES=[{d:6,drill:3,label:'0.6 / 0.3 mm'},{d:8,drill:4,label:'0.8 / 0.4 mm'},{d:10,drill:5,label:'1.0 / 0.5 mm'},{d:14,drill:7,label:'1.4 / 0.7 mm'}];
/* Fab presets, all in mm. */
const PRESETS={
  jlcpcb:{label:'JLCPCB',note:'2-layer standard service',minWidth:0.127,minGap:0.127,minDrill:0.3,minRing:0.13,edge:0.3},
  pcbway:{label:'PCBWay',note:'2-layer standard service',minWidth:0.1,minGap:0.1,minDrill:0.2,minRing:0.15,edge:0.25},
  mill:{label:'Home milling',note:'V-bit or 0.4 mm end mill',minWidth:0.4,minGap:0.4,minDrill:0.6,minRing:0.4,edge:0.5},
  laser:{label:'Laser ablation',note:'fibre laser on copper-clad',minWidth:0.25,minGap:0.2,minDrill:0.6,minRing:0.3,edge:0.5}
};
const EDGE_GAP=5;     // pours stay 0.5 mm off the board edge
const SPOKE=5;        // thermal spoke width, 0.5 mm

function seed(){
  return {
    v:2, name:'little-blinker', seq:100,
    board:{x:60,y:70,w:460,h:270,r:26},
    rules:{gap:2.5,preset:'jlcpcb'},
    nets:[{id:'n1',name:'VCC',color:PALETTE[0]},{id:'n2',name:'GND',color:PALETTE[1]},{id:'n3',name:'DISCHARGE',color:PALETTE[2]},{id:'n4',name:'TRIG · THRES',color:PALETTE[3]},{id:'n5',name:'OUT',color:PALETTE[4]}],
    parts:[
      {id:'p1',ref:'U1',fp:'soic8',x:300,y:200,rot:0},{id:'p2',ref:'J1',fp:'hdr2',x:110,y:125,rot:0},
      {id:'p3',ref:'C3',fp:'c0805',x:200,y:125,rot:0},{id:'p4',ref:'R1',fp:'r0805',x:410,y:130,rot:0},
      {id:'p5',ref:'R2',fp:'r0805',x:410,y:210,rot:0},{id:'p6',ref:'C1',fp:'c1206',x:470,y:250,rot:0},
      {id:'p7',ref:'C2',fp:'c0805',x:357,y:280,rot:90},{id:'p8',ref:'R3',fp:'r0805',x:190,y:300,rot:90},
      {id:'p9',ref:'LED1',fp:'led5',x:125,y:300,rot:0}
    ],
    traces:[
      {id:'t1',net:'n1',width:8,layer:'top',pts:[[110,110],[410,110]]},
      {id:'t2',net:'n1',width:6,layer:'top',pts:[[342,110],[342,170]]},
      {id:'t3',net:'n2',width:8,layer:'top',pts:[[110,140],[230,140],[230,170],[258,170]]},
      {id:'t4',net:'n2',width:8,layer:'top',pts:[[110,140],[110,300]]},
      {id:'t5',net:'n3',width:5,layer:'top',pts:[[342,190],[410,190]]},
      {id:'t6',net:'n3',width:5,layer:'top',pts:[[410,150],[410,190]]}
    ],
    vias:[],pours:[],silk:[]
  };
}
/* Bring any saved board up to the current shape. */
function migrate(d){
  d.v=2;d.seq=d.seq||100;d.nets=d.nets||[];d.parts=d.parts||[];d.traces=d.traces||[];
  for(const t of d.traces)t.layer=t.layer||'top';
  d.vias=d.vias||[];d.pours=d.pours||[];d.silk=d.silk||[];
  d.rules=Object.assign({gap:2.5,preset:'jlcpcb'},d.rules||{});
  d.board=d.board||{x:60,y:70,w:460,h:270,r:26};
  return d;
}

/* ---------------- parts and pads ---------------- */
function rotP(dx,dy,rot){switch(((rot%360)+360)%360){case 90:return[-dy,dx];case 180:return[-dx,-dy];case 270:return[dy,-dx];default:return[dx,dy]}}
function padsOf(part){const f=FP[part.fp];const sw=part.rot%180!==0;return f.pads.map(([dx,dy,w,h,s,n])=>{const[rx,ry]=rotP(dx,dy,part.rot);const W=sw?h:w,H=sw?w:h,x=part.x+rx,y=part.y+ry;return{key:part.id+':'+n,part,n,x,y,w:W,h:H,s,tht:!!f.drill,drill:f.drill||0,x0:x-W/2,y0:y-H/2,x1:x+W/2,y1:y+H/2}})}
function allPads(){return S.parts.flatMap(padsOf)}
const padOn=(pd,layer)=>pd.tht||layer==='top';
function bodyOf(part){const f=FP[part.fp];const sw=part.rot%180!==0;const w=sw?f.body[1]:f.body[0],h=sw?f.body[0]:f.body[1];return{x0:part.x-w/2,y0:part.y-h/2,x1:part.x+w/2,y1:part.y+h/2,round:f.round,w,h}}
function partBox(part){const b=bodyOf(part);let r={x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1};for(const p of padsOf(part)){r.x0=Math.min(r.x0,p.x0);r.y0=Math.min(r.y0,p.y0);r.x1=Math.max(r.x1,p.x1);r.y1=Math.max(r.y1,p.y1)}return r}
const viaRect=v=>({x0:v.x-v.d/2,y0:v.y-v.d/2,x1:v.x+v.d/2,y1:v.y+v.d/2});
const netById=id=>S.nets.find(n=>n.id===id);
const netName=id=>(netById(id)||{name:'?'}).name;
const netColor=id=>(netById(id)||{color:'#888'}).color;

/* ---------------- board outline ---------------- */
function boardOutline(B=S.board){return B.poly&&B.poly.length>=3?B.poly.map(p=>p.slice()):roundRectPoly(B.x,B.y,B.w,B.h,B.r)}
function setBoardFromPoly(P){const b=bboxOf(P);S.board={x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0,r:0,poly:P}}
/* Silkscreen: footprint outlines, reference designators and free silk, as stroked polylines. */
function silkStrokes(){
  const out=[];
  for(const p of S.parts){const b=bodyOf(p);const P=b.round?circlePoly(p.x,p.y,b.w/2):[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];out.push({pts:P.concat([P[0]]),width:1.5});
    const bx=partBox(p);for(const pl of textStrokes(p.ref,p.x,bx.y0-3,REF_SIZE,'middle'))out.push({pts:pl,width:textStrokeWidth(REF_SIZE)})}
  for(const s of S.silk){if(s.kind==='line')out.push({pts:s.pts,width:s.width});else for(const pl of textStrokes(s.text,s.x,s.y,s.size))out.push({pts:pl,width:textStrokeWidth(s.size),item:s})}
  return out;
}
const REF_SIZE=9;

/* ---------------- nets ----------------
   Pads have no stored net: a pad belongs to whatever trace or via touches it.
   Pours never claim pads; they keep clear of every pad not already on their net. */
function padNets(traces=S.traces,vias=S.vias){
  const map={},conf=new Set(),pads=allPads();
  const claim=(k,n)=>{if(map[k]&&map[k]!==n)conf.add(k);else map[k]=n};
  for(const t of traces)for(const pd of pads)if(padOn(pd,t.layer)&&polyRectDist(t.pts,pd)<=t.width/2-0.3)claim(pd.key,t.net);
  for(const v of vias)for(const pd of pads)if(pointRectDist([v.x,v.y],pd)<=v.d/2-0.3)claim(pd.key,v.net);
  return{map,conf};
}

/* ---------------- pours ----------------
   A pour is stored as a seed point; its copper is worked out by flood fill on a
   0.1 mm grid, so it always follows the board around it. */
let pourCache={key:null,fills:[]},boardCache={key:null};
function pourFills(){
  if(!S.pours.length)return[];
  if(typeof UI!=='undefined'&&UI.drag&&pourCache.key)return pourCache.fills;
  const key=JSON.stringify([S.board,S.parts,S.traces,S.vias,S.pours,S.rules.gap]);
  if(key!==pourCache.key)pourCache={key,fills:computePours()};
  return pourCache.fills;
}
function boardMask(){
  const key=JSON.stringify(S.board);if(boardCache.key===key)return boardCache;
  const P=boardOutline(),bb=bboxOf(P);const ox=Math.floor(bb.x0),oy=Math.floor(bb.y0),W=Math.ceil(bb.x1)-ox,H=Math.ceil(bb.y1)-oy;
  const mask=new Uint8Array(W*H);
  for(let j=0;j<H;j++){const y=oy+j+0.5;const xs=[];for(let i=0,k=P.length-1;i<P.length;k=i++){const a=P[i],b=P[k];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))}xs.sort((a,b)=>a-b);
    for(let q=0;q+1<xs.length;q+=2){const i0=Math.max(0,Math.ceil(xs[q]-ox-0.5)),i1=Math.min(W-1,Math.floor(xs[q+1]-ox-0.5));for(let i=i0;i<=i1;i++)mask[j*W+i]=1}}
  const g={ox,oy,W,H,mask};
  for(let i=0;i<P.length;i++)stamp(g,mask,P[i],P[(i+1)%P.length],EDGE_GAP,0);
  boardCache={key,ox,oy,W,H,mask};return boardCache;
}
/* Set grid cells within r of segment a-b (or of rect) to val. */
function stamp(g,arr,a,b,r,val){const{ox,oy,W,H}=g;const i0=Math.max(0,Math.floor(Math.min(a[0],b[0])-r-ox)),i1=Math.min(W-1,Math.ceil(Math.max(a[0],b[0])+r-ox)),j0=Math.max(0,Math.floor(Math.min(a[1],b[1])-r-oy)),j1=Math.min(H-1,Math.ceil(Math.max(a[1],b[1])+r-oy));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*W+i;if(arr[k]===val)continue;if(segDist([ox+i+0.5,oy+j+0.5],a,b)<=r)arr[k]=val}}
function stampRect(g,arr,rc,r,val,test){const{ox,oy,W,H}=g;const i0=Math.max(0,Math.floor(rc.x0-r-ox)),i1=Math.min(W-1,Math.ceil(rc.x1+r-ox)),j0=Math.max(0,Math.floor(rc.y0-r-oy)),j1=Math.min(H-1,Math.ceil(rc.y1+r-oy));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*W+i;if(arr[k]===val)continue;const c=[ox+i+0.5,oy+j+0.5];if(test?test(c):pointRectDist(c,rc)<=r)arr[k]=val}}
function computePours(){
  const{map}=padNets(),fills=[];
  for(const po of S.pours)fills.push(fillPour(po,map,fills));
  return fills;
}
function fillPour(po,map,earlier){
  const bm=boardMask(),{ox,oy,W,H}=bm,g=S.rules.gap+1,net=po.net,layer=po.layer;
  const blk=new Uint8Array(W*H);for(let k=0;k<W*H;k++)blk[k]=bm.mask[k]?0:1;
  const pads=allPads().filter(pd=>padOn(pd,layer));
  for(const t of S.traces){if(t.layer!==layer||t.net===net)continue;const r=t.width/2+g;if(t.pts.length===1)stamp(bm,blk,t.pts[0],t.pts[0],r,1);for(let i=0;i<t.pts.length-1;i++)stamp(bm,blk,t.pts[i],t.pts[i+1],r,1)}
  for(const pd of pads)if(map[pd.key]!==net)stampRect(bm,blk,pd,g,1);
  for(const v of S.vias)if(v.net!==net)stamp(bm,blk,[v.x,v.y],[v.x,v.y],v.d/2+g,1);
  for(const f of earlier){if(f.layer!==layer||f.net===net)continue;for(let k=0;k<W*H;k++)if(f.grid[k])blk[k]=1;for(const L of f.loops)for(let i=0;i<L.length;i++)stamp(bm,blk,L[i],L[(i+1)%L.length],g,1)}
  const empty={id:po.id,net,layer,ox,oy,W,H,grid:new Uint8Array(W*H),loops:[],island:false,empty:true,area:0};
  const si=Math.floor(po.seed[0]-ox),sj=Math.floor(po.seed[1]-oy);
  if(si<0||sj<0||si>=W||sj>=H||blk[sj*W+si])return empty;
  // flood
  const R=new Uint8Array(W*H),st=[sj*W+si];R[sj*W+si]=1;
  while(st.length){const k=st.pop(),i=k%W,j=(k-i)/W;if(i>0&&!R[k-1]&&!blk[k-1]){R[k-1]=1;st.push(k-1)}if(i<W-1&&!R[k+1]&&!blk[k+1]){R[k+1]=1;st.push(k+1)}if(j>0&&!R[k-W]&&!blk[k-W]){R[k-W]=1;st.push(k-W)}if(j<H-1&&!R[k+W]&&!blk[k+W]){R[k+W]=1;st.push(k+W)}}
  const cell=p=>{const i=Math.floor(p[0]-ox),j=Math.floor(p[1]-oy);return i>=0&&j>=0&&i<W&&j<H?j*W+i:-1};
  const mine=pads.filter(pd=>map[pd.key]===net);
  // thermal relief: clear a ring round same-net pads, leaving four spokes
  if(po.thermal!==false)for(const pd of mine)stampRect(bm,R,pd,g,0,c=>{const d=pointRectDist(c,pd);return d>0&&d<=g&&Math.abs(c[0]-pd.x)>SPOKE/2&&Math.abs(c[1]-pd.y)>SPOKE/2});
  openGrid(R,W,H);
  dropSpecks(R,W,H,25);
  let area=0;for(let k=0;k<W*H;k++)area+=R[k];
  if(!area)return empty;
  // island = touches no copper of its own net
  let touches=mine.some(pd=>{const k=cell([pd.x,pd.y]);return k>=0&&R[k]})||S.vias.some(v=>v.net===net&&R[cell([v.x,v.y])]);
  if(!touches)for(const t of S.traces){if(t.layer!==layer||t.net!==net)continue;if(resample(t.pts,2).some(p=>{const k=cell(p);return k>=0&&R[k]})){touches=true;break}}
  const loops=traceLoops(R,W,H).map(L=>rdpRing(L.map(([x,y])=>[x+ox,y+oy]),0.7)).filter(L=>L.length>=3);
  return{id:po.id,net,layer,ox,oy,W,H,grid:R,loops,island:!touches,empty:false,area};
}
function pourAt(p,layer){for(const f of pourFills()){if(f.layer!==layer||f.empty)continue;const i=Math.floor(p[0]-f.ox),j=Math.floor(p[1]-f.oy);if(i>=0&&j>=0&&i<f.W&&j<f.H&&f.grid[j*f.W+i])return f}return null}
/* Morphological opening with a 3×3 square: removes slivers thinner than 0.3 mm. */
function openGrid(R,W,H){const T=new Uint8Array(W*H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){let v=1;for(let dj=-1;dj<=1&&v;dj++)for(let di=-1;di<=1;di++){const x=i+di,y=j+dj;if(x<0||y<0||x>=W||y>=H||!R[y*W+x]){v=0;break}}T[j*W+i]=v}
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){if(!R[j*W+i])continue;let v=0;for(let dj=-1;dj<=1&&!v;dj++)for(let di=-1;di<=1;di++){const x=i+di,y=j+dj;if(x>=0&&y>=0&&x<W&&y<H&&T[y*W+x]){v=1;break}}R[j*W+i]=v}}
function dropSpecks(R,W,H,min){const seen=new Uint8Array(W*H);for(let s=0;s<W*H;s++){if(!R[s]||seen[s])continue;const comp=[s],st=[s];seen[s]=1;while(st.length){const k=st.pop(),i=k%W;for(const n of[i>0?k-1:-1,i<W-1?k+1:-1,k-W,k+W])if(n>=0&&n<W*H&&R[n]&&!seen[n]){seen[n]=1;st.push(n);comp.push(n)}}if(comp.length<min)for(const k of comp)R[k]=0}}
/* Boundary loops of a binary grid, in grid corner coordinates. Filled cells lie to the
   right of travel, so outer loops come out with positive area and holes negative. */
function traceLoops(R,W,H){
  const V=W+1,out=new Map();
  const add=(x0,y0,x1,y1)=>{const a=y0*V+x0;let l=out.get(a);if(!l)out.set(a,l=[]);l.push(y1*V+x1)};
  const f=(i,j)=>i>=0&&j>=0&&i<W&&j<H&&R[j*W+i];
  for(let j=0;j<H;j++)for(let i=0;i<W;i++)if(R[j*W+i]){if(!f(i,j-1))add(i,j,i+1,j);if(!f(i+1,j))add(i+1,j,i+1,j+1);if(!f(i,j+1))add(i+1,j+1,i,j+1);if(!f(i-1,j))add(i,j+1,i,j)}
  const loops=[],X=v=>v%V,Y=v=>(v-v%V)/V;
  for(const[start,l]of out)while(l.length){
    let a=start,b=l.pop();const pts=[[X(a),Y(a)]];
    while(b!==start){pts.push([X(b),Y(b)]);const lb=out.get(b);let ix=0;
      if(lb.length>1){const rx=-(Y(b)-Y(a)),ry=X(b)-X(a);ix=Math.max(0,lb.findIndex(c=>X(c)-X(b)===rx&&Y(c)-Y(b)===ry))}
      a=b;b=lb.splice(ix,1)[0]}
    // keep corners only
    const c=pts.filter((p,i)=>{const q=pts[(i+pts.length-1)%pts.length],r=pts[(i+1)%pts.length];return(p[0]-q[0])*(r[1]-p[1])-(p[1]-q[1])*(r[0]-p[0])!==0});
    if(c.length>=3)loops.push(c);
  }
  return loops;
}

/* ---------------- connectivity ----------------
   Groups each net's copper into connected pieces. */
function netPieces(){
  const nets=padNets(),pads=allPads(),fills=pourFills().filter(f=>!f.empty),items=[];
  for(const t of S.traces)items.push({k:'t',o:t,net:t.net});
  for(const v of S.vias)items.push({k:'v',o:v,net:v.net});
  for(const pd of pads)if(nets.map[pd.key])items.push({k:'p',o:pd,net:nets.map[pd.key]});
  for(const f of fills)items.push({k:'f',o:f,net:f.net});
  const par=items.map((_,i)=>i),find=i=>par[i]===i?i:(par[i]=find(par[i]));
  const inFill=(f,p)=>{const i=Math.floor(p[0]-f.ox),j=Math.floor(p[1]-f.oy);return i>=0&&j>=0&&i<f.W&&j<f.H&&f.grid[j*f.W+i]};
  const touch=(A,B)=>{const a=A.o,b=B.o;
    if(A.k==='t'&&B.k==='t')return a.layer===b.layer&&polyDist(a.pts,b.pts)<=(a.width+b.width)/2;
    if(A.k==='t'&&B.k==='v')return closestPoly([b.x,b.y],a.pts).d<=a.width/2+b.d/2;
    if(A.k==='t'&&B.k==='p')return padOn(b,a.layer)&&polyRectDist(a.pts,b)<=a.width/2;
    if(A.k==='t'&&B.k==='f')return a.layer===b.layer&&resample(a.pts,2).some(p=>inFill(b,p));
    if(A.k==='v'&&B.k==='v')return hyp([a.x,a.y],[b.x,b.y])<=(a.d+b.d)/2;
    if(A.k==='v'&&B.k==='p')return pointRectDist([a.x,a.y],b)<=a.d/2;
    if(A.k==='v'&&B.k==='f')return inFill(b,[a.x,a.y]);
    if(A.k==='p'&&B.k==='f')return padOn(a,b.layer)&&inFill(b,[a.x,a.y]);
    return false};
  const order={t:0,v:1,p:2,f:3};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){if(items[i].net!==items[j].net)continue;let A=items[i],B=items[j];if(order[A.k]>order[B.k])[A,B]=[B,A];if(touch(A,B))par[find(i)]=find(j)}
  const groups={};items.forEach((it,i)=>{const r=find(i),g=(groups[it.net]=groups[it.net]||{});(g[r]=g[r]||[]).push(it)});
  return Object.fromEntries(Object.entries(groups).map(([n,g])=>[n,Object.values(g)]));
}
