/* ============================================================
   PCB Paint — KiCad footprint import
   Reads .kicad_mod files (KiCad 5 "module" and 6+ "footprint"
   S-expressions) into the same footprint shape as FP in model.js.
   KiCad works in mm with y down, so only a ×10 scale is needed.
   ============================================================ */

/* ---------------- S-expression reader ---------------- */
function parseSexpr(src){
  let i=0;const n=src.length;
  function list(){const out=[];
    for(;;){
      while(i<n&&/\s/.test(src[i]))i++;
      if(i>=n)throw new Error('Unexpected end of file');
      const c=src[i];
      if(c===')'){i++;return out}
      if(c==='('){i++;out.push(list());continue}
      if(c==='"'){i++;let s='';while(i<n&&src[i]!=='"'){if(src[i]==='\\'&&i+1<n){i++;s+=src[i]==='n'?'\n':src[i]}else s+=src[i];i++}i++;out.push(s);continue}
      let s='';while(i<n&&!/[\s()"]/.test(src[i]))s+=src[i++];out.push(s);
    }}
  while(i<n&&src[i]!=='(')i++;
  if(i>=n)throw new Error('No S-expression found');
  i++;return list();
}
const sxHead=e=>Array.isArray(e)?e[0]:null;
const sxAll=(e,k)=>e.filter(x=>sxHead(x)===k);
const sxGet=(e,k)=>e.find(x=>sxHead(x)===k);
const sxNums=(e,k)=>{const x=sxGet(e,k);return x?x.slice(1).map(Number):null};

/* ---------------- footprint conversion ---------------- */
const KI_SILK=new Set(['F.SilkS','F.Silkscreen']),KI_FAB=new Set(['F.Fab']),KI_CRT=new Set(['F.CrtYd','F.Courtyard']);
/* Turns one .kicad_mod source into {name, fp, notes}. Throws if it isn't a footprint. */
function kicadFootprint(src){
  const root=parseSexpr(src);
  if(root[0]!=='footprint'&&root[0]!=='module')throw new Error('Not a KiCad footprint');
  const name=String(root[1]||'Footprint'),U=v=>Math.round(v*1000)/100; // mm → board units, 0.01 resolution
  const notes=new Set(),pads=[],holes=[],used=new Map();
  const shapes={silk:[],fab:[],crt:[]};

  for(const p of sxAll(root,'pad')){
    const num=String(p[1]),type=p[2],shape=p[3];
    const at=sxNums(p,'at')||[0,0,0],size=sxNums(p,'size')||[1,1];
    const layers=(sxGet(p,'layers')||[]).slice(1).map(String);
    const ang=((at[2]||0)%360+360)%360;
    let w=size[0],h=size[1];
    if(Math.abs(ang%180-90)<0.01)[w,h]=[h,w];
    else if(ang%90>0.01){const r=ang*Math.PI/180,c=Math.abs(Math.cos(r)),s=Math.abs(Math.sin(r));[w,h]=[w*c+h*s,w*s+h*c];notes.add('angled pads became their bounding box')}
    const dr=sxGet(p,'drill');let drill=0;
    if(dr){const v=dr.slice(1).filter(x=>!Array.isArray(x));
      if(v[0]==='oval'){drill=Math.min(+v[1],+(v[2]??v[1]));if(+v[1]!==+(v[2]??v[1]))notes.add('slots became round holes')}
      else drill=+v[0]||0}
    if(type==='np_thru_hole'){if(drill)holes.push([U(at[0]),U(at[1]),U(drill)]);continue}
    const onTop=layers.some(l=>l==='F.Cu'||l==='*.Cu'||l==='F&B.Cu');
    if(type!=='thru_hole'&&!onTop){notes.add('bottom-side pads were skipped');continue}
    if(shape==='trapezoid'||shape==='custom')notes.add(shape+' pads became rectangles');
    let n=num||'MP';const k=used.get(n)||0;used.set(n,k+1);if(k)n+='.'+(k+1);
    const s=shape==='circle'||shape==='oval'?'c':'r';
    pads.push([U(at[0]),U(at[1]),U(w),U(h),s,n,type==='thru_hole'?U(drill):0]);
  }
  if(!pads.length)throw new Error('No copper pads in '+name);

  const width=e=>{const s=sxGet(e,'stroke');const w=s?sxNums(s,'width'):sxNums(e,'width');return w&&w[0]>0?w[0]:0.12};
  const bucket=e=>{const l=(sxGet(e,'layer')||[])[1];return KI_SILK.has(l)?shapes.silk:KI_FAB.has(l)?shapes.fab:KI_CRT.has(l)?shapes.crt:null};
  const arc=(c,r,a0,sweep)=>{const k=Math.max(4,Math.ceil(Math.abs(sweep)/10)),o=[];for(let i=0;i<=k;i++){const a=a0+sweep*i/k;o.push([c[0]+r*Math.cos(a),c[1]+r*Math.sin(a)])}return o};
  for(const e of root){
    const kind=sxHead(e);if(!kind||!kind.startsWith('fp_')||kind==='fp_text')continue;
    const B=bucket(e);if(!B)continue;
    const st=sxNums(e,'start'),en=sxNums(e,'end');let pts=null;
    if(kind==='fp_line'&&st&&en)pts=[st,en];
    else if(kind==='fp_rect'&&st&&en)pts=[st,[en[0],st[1]],en,[st[0],en[1]],st];
    else if(kind==='fp_circle'){const c=sxNums(e,'center')||st;if(c&&en)pts=arc(c,Math.hypot(en[0]-c[0],en[1]-c[1]),0,2*Math.PI)}
    else if(kind==='fp_poly'){const P=(sxGet(e,'pts')||[]).filter(x=>sxHead(x)==='xy').map(x=>[+x[1],+x[2]]);if(P.length>1)pts=P.concat([P[0]])}
    else if(kind==='fp_arc'&&st&&en){const mid=sxNums(e,'mid');
      if(mid){const c=circumcentre(st,mid,en);if(!c)pts=[st,mid,en];else{const a0=Math.atan2(st[1]-c[1],st[0]-c[0]),am=Math.atan2(mid[1]-c[1],mid[0]-c[0]),a1=Math.atan2(en[1]-c[1],en[0]-c[0]);
        const norm=a=>((a%(2*Math.PI))+2*Math.PI)%(2*Math.PI);let sw=norm(a1-a0);if(norm(am-a0)>sw)sw-=2*Math.PI;pts=arc(c,Math.hypot(st[0]-c[0],st[1]-c[1]),a0,sw)}}
      else{const ang=(sxNums(e,'angle')||[0])[0]*Math.PI/180;pts=arc(st,Math.hypot(en[0]-st[0],en[1]-st[1]),Math.atan2(en[1]-st[1],en[0]-st[0]),ang)}}
    if(pts)B.push({pts:pts.map(p=>[U(p[0]),U(p[1])]),width:U(width(e))});
  }

  // centre everything on the middle of the part so it rotates about its middle
  const box=P=>P.length?bboxOf(P):null;
  const padPts=pads.flatMap(([x,y,w,h])=>[[x-w/2,y-h/2],[x+w/2,y+h/2]]);
  const bodyBox=box(shapes.fab.flatMap(s=>s.pts))||box(shapes.crt.flatMap(s=>s.pts))||box(shapes.silk.flatMap(s=>s.pts))||box(padPts);
  const all=bboxOf(padPts.concat([[bodyBox.x0,bodyBox.y0],[bodyBox.x1,bodyBox.y1]]));
  const cx=Math.round((all.x0+all.x1)/2),cy=Math.round((all.y0+all.y1)/2);
  const mv=(x,y)=>[+(x-cx).toFixed(2),+(y-cy).toFixed(2)];
  for(const p of pads)[p[0],p[1]]=mv(p[0],p[1]);
  for(const hl of holes)[hl[0],hl[1]]=mv(hl[0],hl[1]);
  const bx=Math.max(Math.abs(bodyBox.x0-cx),Math.abs(bodyBox.x1-cx)),by=Math.max(Math.abs(bodyBox.y0-cy),Math.abs(bodyBox.y1-cy));
  const fp={label:name,pkg:'KiCad · '+pads.length+(pads.length===1?' pad':' pads'),prefix:guessPrefix(name),body:[+(2*bx).toFixed(2),+(2*by).toFixed(2)],pads,kicad:true};
  if(holes.length)fp.holes=holes;
  if(shapes.silk.length)fp.silk=shapes.silk.map(s=>({pts:s.pts.map(p=>mv(p[0],p[1])),width:s.width}));
  return{name,fp,notes:[...notes]};
}
function circumcentre(a,b,c){const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));if(Math.abs(d)<1e-9)return null;
  const A=a[0]*a[0]+a[1]*a[1],B=b[0]*b[0]+b[1]*b[1],C=c[0]*c[0]+c[1]*c[1];
  return[(A*(b[1]-c[1])+B*(c[1]-a[1])+C*(a[1]-b[1]))/d,(A*(c[0]-b[0])+B*(a[0]-c[0])+C*(b[0]-a[0]))/d]}
/* Reference prefix from the usual KiCad library naming. */
function guessPrefix(name){
  const rules=[[/^(R|RN|Resistor)[_\d]/i,'R'],[/^(C|CP|Capacitor)[_\d]/i,'C'],[/^LED/i,'LED'],[/^(D|Diode)[_\d]/i,'D'],[/^(L|Inductor)[_\d]/i,'L'],
    [/^(Crystal|Resonator|Oscillator)/i,'Y'],[/^(SW|Button)/i,'SW'],[/^(Pin|Conn|Jack|USB|Header|Socket|Terminal|JST|Molex|BarrelJack)/i,'J'],
    [/^(Potentiometer|Trimmer)/i,'RV'],[/^(Fuse|Polyfuse)/i,'F'],[/^(SOT|TO-)/i,'Q'],[/^(MountingHole)/i,'H'],[/^(TestPoint)/i,'TP'],[/^(Relay)/i,'K'],[/^(Buzzer|Speaker)/i,'BZ']];
  for(const[re,p]of rules)if(re.test(name))return p;
  return'U';
}
