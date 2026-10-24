/* ============================================================
   PCB Paint — geometry helpers
   Points are [x, y] in board units (1 unit = 0.1 mm), y grows down.
   ============================================================ */
const hyp=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function closestSeg(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;let t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));const q=[a[0]+dx*t,a[1]+dy*t];return{d:hyp(p,q),q,t}}
const segDist=(p,a,b)=>closestSeg(p,a,b).d;
function closestPoly(p,P){if(P.length===1)return{d:hyp(p,P[0]),q:P[0]};let best={d:Infinity};for(let i=0;i<P.length-1;i++){const c=closestSeg(p,P[i],P[i+1]);if(c.d<best.d)best=c}return best}
function segInt(a,b,c,d){const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]];const den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-9)return null;const t=((c[0]-a[0])*s[1]-(c[1]-a[1])*s[0])/den,u=((c[0]-a[0])*r[1]-(c[1]-a[1])*r[0])/den;if(t>=0&&t<=1&&u>=0&&u<=1)return{p:[a[0]+t*r[0],a[1]+t*r[1]],t};return null}
function segSegDist(a,b,c,d){if(segInt(a,b,c,d))return 0;return Math.min(segDist(a,c,d),segDist(b,c,d),segDist(c,a,b),segDist(d,a,b))}
function polyDist(A,B){if(A.length===1&&B.length===1)return hyp(A[0],B[0]);if(A.length===1)return closestPoly(A[0],B).d;if(B.length===1)return closestPoly(B[0],A).d;let m=Infinity;for(let i=0;i<A.length-1;i++)for(let j=0;j<B.length-1;j++){const d=segSegDist(A[i],A[i+1],B[j],B[j+1]);if(d<m)m=d}return m}
function pointRectDist(p,r){const dx=Math.max(r.x0-p[0],0,p[0]-r.x1),dy=Math.max(r.y0-p[1],0,p[1]-r.y1);return Math.hypot(dx,dy)}
const inRect=(p,r,m=0)=>p[0]>=r.x0-m&&p[0]<=r.x1+m&&p[1]>=r.y0-m&&p[1]<=r.y1+m;
function segRectDist(a,b,r){if(inRect(a,r)||inRect(b,r))return 0;const C=[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]];for(let i=0;i<4;i++)if(segInt(a,b,C[i],C[(i+1)%4]))return 0;return Math.min(pointRectDist(a,r),pointRectDist(b,r),...C.map(c=>segDist(c,a,b)))}
function polyRectDist(P,r){if(P.length===1)return pointRectDist(P[0],r);let m=Infinity;for(let i=0;i<P.length-1;i++)m=Math.min(m,segRectDist(P[i],P[i+1],r));return m}
function rdp(P,eps){if(P.length<3)return P.map(p=>p.slice());let dm=0,ix=0;const a=P[0],b=P[P.length-1];for(let i=1;i<P.length-1;i++){const d=segDist(P[i],a,b);if(d>dm){dm=d;ix=i}}if(dm>eps){const l=rdp(P.slice(0,ix+1),eps),r=rdp(P.slice(ix),eps);return l.slice(0,-1).concat(r)}return[a.slice(),b.slice()]}
function resample(P,step){if(P.length<2)return P.map(p=>p.slice());const o=[P[0].slice()];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L=hyp(a,b),n=Math.max(1,Math.ceil(L/step));for(let k=1;k<=n;k++)o.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n])}return o}
function chaikin(P,it,r){for(let k=0;k<it;k++){if(P.length<3)return P;const Q=[P[0]];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];if(i>0)Q.push([a[0]+(b[0]-a[0])*r,a[1]+(b[1]-a[1])*r]);if(i<P.length-2)Q.push([a[0]+(b[0]-a[0])*(1-r),a[1]+(b[1]-a[1])*(1-r)])}Q.push(P[P.length-1]);P=Q}return P}
function mergeCollinear(P){const o=[P[0]];for(let i=1;i<P.length;i++){const p=P[i];if(hyp(p,o[o.length-1])<1)continue;if(o.length>=2){const a=o[o.length-2],b=o[o.length-1];const cr=(b[0]-a[0])*(p[1]-b[1])-(b[1]-a[1])*(p[0]-b[0]);if(Math.abs(cr)<1e-6*Math.max(1,hyp(a,b)*hyp(b,p))+0.5&&((b[0]-a[0])*(p[0]-b[0])+(b[1]-a[1])*(p[1]-b[1]))>0){o[o.length-1]=p;continue}}o.push(p)}return o}
function octi(P){const o=[P[0]];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],dx=b[0]-a[0],dy=b[1]-a[1],ax=Math.abs(dx),ay=Math.abs(dy);if(ax<2||ay<2||Math.abs(ax-ay)<2){o.push(b);continue}const d=Math.min(ax,ay);const m=ax>ay?[a[0]+Math.sign(dx)*(ax-d),a[1]]:[a[0],a[1]+Math.sign(dy)*(ay-d)];o.push(m,b)}return mergeCollinear(o)}
function pathLen(P){let L=0;for(let i=0;i<P.length-1;i++)L+=hyp(P[i],P[i+1]);return L}
function trimEnd(P,len){let rem=len;const Q=P.map(p=>p.slice());while(Q.length>1&&rem>0){const a=Q[Q.length-2],b=Q[Q.length-1],L=hyp(a,b);if(L<=rem){Q.pop();rem-=L}else{const t=(L-rem)/L;Q[Q.length-1]=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];rem=0}}return Q}

/* ---------------- polygons (closed, last point not repeated) ---------------- */
function polyArea(P){let a=0;for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];a+=p[0]*q[1]-q[0]*p[1]}return a/2}
function pointInPoly(p,P){let ins=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])ins=!ins}return ins}
function distToRing(p,P){let m=Infinity;for(let i=0;i<P.length;i++)m=Math.min(m,segDist(p,P[i],P[(i+1)%P.length]));return m}
function bboxOf(P){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of P){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1])}return{x0,y0,x1,y1}}
/* Rounded rectangle as a polygon, clockwise on screen. */
function roundRectPoly(x,y,w,h,r,seg=8){r=Math.max(0,Math.min(r,w/2,h/2));if(r<0.5)return[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];const o=[];const C=[[x+w-r,y+r,-90],[x+w-r,y+h-r,0],[x+r,y+h-r,90],[x+r,y+r,180]];for(const[cx,cy,a0]of C)for(let k=0;k<=seg;k++){const a=(a0+90*k/seg)*Math.PI/180;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return o}
function circlePoly(cx,cy,r,seg=40){const o=[];for(let k=0;k<seg;k++){const a=2*Math.PI*k/seg;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)])}return o}
/* RDP for a closed ring: split at the point farthest from the first. */
function rdpRing(P,eps){if(P.length<4)return P;let m=0,ix=0;for(let i=1;i<P.length;i++){const d=hyp(P[0],P[i]);if(d>m){m=d;ix=i}}const a=rdp(P.slice(0,ix+1),eps),b=rdp(P.slice(ix).concat([P[0]]),eps);return a.slice(0,-1).concat(b.slice(0,-1))}
