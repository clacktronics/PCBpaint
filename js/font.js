/* ============================================================
   PCB Paint — single-stroke font for silkscreen
   Glyphs sit on a 4 × 6 grid (y down, 6 = baseline). Each glyph is
   polylines separated by "|", each point two digits "xy".
   The same strokes are drawn on screen and written to Gerber.
   ============================================================ */
const GLYPHS={
  A:'0602204246|0444',B:'06003041423303|334445361606',C:'4130100105163645',D:'00062644422000',
  E:'40000646|0333',F:'400006|0333',G:'41301001051636454323',H:'0006|4046|0343',
  I:'1030|2026|1636',J:'4045361605',K:'0006|4004|1346',L:'000646',
  M:'0600234046',N:'06004640',O:'103041453616050110',P:'06003041423303',
  Q:'103041453616050110|2446',R:'06003041423303|2346',S:'413010010213334445361605',T:'0040|2026',
  U:'000516364540',V:'002640',W:'0016233640',X:'0046|4006',
  Y:'0023|4023|2326',Z:'00400646',
  0:'103041453616050110|4105',1:'112026|1636',2:'01103041420646',3:'01103041423313|334445361605',
  4:'36300444',5:'400003334445361605',6:'30100105163645443303',7:'004016',
  8:'13020110304142331304051636454433',9:'43130201103041453616',
  '-':'0333','+':'0343|2125','.':'2526',',':'2516',':':'2122|2526','/':'4006','_':'0646',
  '=':'0242|0444','(':'30121436',')':'10323416','!':'2024|2526','?':'01103041422324|2526',
  '#':'1016|3036|0242|0444','%':'0640|0111|3545',"'":'2022','"':'1012|3032','*':'2125|0442|0244',
  '<':'410345','>':'014305','·':'2324','&':'4614051302203121031605164446',' ':''
};
const GLYPH_CACHE={};
function glyph(ch){
  ch=ch.toUpperCase();if(!(ch in GLYPHS))ch='?';
  if(!GLYPH_CACHE[ch])GLYPH_CACHE[ch]=GLYPHS[ch]?GLYPHS[ch].split('|').map(s=>{const o=[];for(let i=0;i<s.length;i+=2)o.push([+s[i],+s[i+1]]);return o}):[];
  return GLYPH_CACHE[ch];
}
const textStrokeWidth=size=>Math.max(1.5,size*0.15);
function textWidth(text,size){const s=size/6;return Math.max(0,String(text).length*6*s-2*s)}
/* Polylines for `text` with cap height `size`, baseline at y.
   anchor: 'start' puts x at the left, 'middle' centres on x. */
function textStrokes(text,x,y,size,anchor='start'){
  const s=size/6,out=[];let cx=anchor==='middle'?x-textWidth(text,size)/2:x;
  for(const ch of String(text)){for(const pl of glyph(ch))out.push(pl.map(([gx,gy])=>[cx+gx*s,y-(6-gy)*s]));cx+=6*s}
  return out;
}
