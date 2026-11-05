import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const CELL=1.4;
const world=(p:number[])=>new THREE.Vector3((p[0]-10)*CELL,0,(p[1]-8)*CELL);
const fleetColors=[0x069e91,0x4676d7,0xbd7c26,0x9967c8,0xd15d6e,0x5e9650];
export default function Scene(props:{running:boolean;blocked:boolean;paths:boolean;onSelect:(id:string)=>void;view:number;quality:boolean;snapshot?:any;dark?:boolean}){
 const host=useRef<HTMLDivElement>(null),live=useRef(props);live.current=props;
 useEffect(()=>{
  const dark=Boolean(live.current.dark);const el=host.current!;let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{el.innerHTML='<div class="fallback">3D 渲染不可用，请启用浏览器硬件加速。</div>';return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(dark?0x0b1b28:0xe3eaec);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;el.appendChild(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(39,1,.1,180);camera.position.set(dark?28:32,dark?31:35,dark?34:39);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.2;controls.minDistance=16;controls.maxDistance=70;
  scene.add(new THREE.HemisphereLight(0xffffff,dark?0x21405a:0x9ca6a8,2));const sun=new THREE.DirectionalLight(0xfff7e8,2.5);sun.position.set(-12,30,16);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-27,right:27,top:27,bottom:-27});scene.add(sun);
  const selectable:THREE.Object3D[]=[];
  function box(w:number,h:number,d:number,x:number,y:number,z:number,color:number,parent:THREE.Object3D=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.15}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function label(text:string,x:number,y:number,z:number,width=3,color=dark?'#94bacb':'#344e5b'){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d')!;ctx.font='600 42px sans-serif';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(text,256,60);const m=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));m.position.set(x,y,z);m.scale.set(width,width*96/512,1);scene.add(m);return m;}
  box(46,.3,30,0,-.2,0,dark?0x152e3e:0xcbd0cd);
  // Racks occupy exactly the blocked 2x2 grid footprint, with clearance inside it.
  for(let zone=0;zone<4;zone++)for(let row=0;row<3;row++){
   const p=world([3.5+zone*4,3.5+row*4]),id=`${'ABCD'[zone]}-${row+1}`;
   for(const dx of [-1.2,1.2])for(const dz of [-1.2,1.2])box(.09,3.2,.09,p.x+dx,1.6,p.z+dz,dark?0x4c8499:0x496476);
   for(let level=0;level<3;level++){box(2.5,.1,2.5,p.x,.25+level*1.03,p.z,dark?0x345767:0x8198a5);for(let x=0;x<2;x++)for(let z=0;z<2;z++){
    const carton=box(.96,.72,.96,p.x+(x-.5)*1.15,.66+level*1.03,p.z+(z-.5)*1.15,0xc6a174);carton.userData.id=id;selectable.push(carton);box(.07,.73,.97,carton.position.x,carton.position.y,carton.position.z,0xe1c8a5);
   }}label(id,p.x,3.6,p.z,1.6);
  }
  label('STORAGE / 货架区',0,.1,-12,6);
  box(6,.06,5,-19,.01,-3,0xbbb8a6);label('RECEIVING / 收货',-19,.2,-6,5);
  for(let i=0;i<6;i++)box(1,.8,1,-20.5+i%3*1.4,.43,-4+Math.floor(i/3)*1.5,0xbe986c);
  const dock=world([19,14]);box(3.8,.04,3.5,dock.x,.01,dock.z,0x85b8a9);label('OUTBOUND / 出库',dock.x,2.4,dock.z+2,4);
  box(5,.65,2,18,.33,dock.z,0x719291);for(let n=0;n<12;n++)box(.12,.06,1.8,15.8+n*.4,.69,dock.z,0xc4d1d0);
  label('PACK / 包装',18,.15,dock.z-2,4);
  const delivered=box(.8,.65,.8,16,.99,dock.z,0xe6ae62);delivered.visible=false;
  const robots:THREE.Group[]=[],cargos:THREE.Group[]=[],tags:THREE.Sprite[]=[];
  for(let i=0;i<6;i++){
   const p=world([1+i*3,16]);box(1.2,.025,1.2,p.x,.01,p.z,0x9cb5ba);label(`P${i+1}`,p.x,.08,p.z+1,1.1);
   const g=new THREE.Group();scene.add(g);g.position.copy(p);const body=box(.62,.28,.72,0,.2,0,0xe6eeee,g);body.userData.id=`AGV-0${i+1}`;selectable.push(body);box(.5,.08,.55,0,.38,0,0x345162,g);box(.63,.06,.04,0,.24,.37,fleetColors[i],g);
   // Circumscribed footprint < 1.05m even when turning; cell spacing is 1.4m.
   const cargo=new THREE.Group();g.add(cargo);box(.68,.07,.72,0,.46,0,0xa77a44,cargo);for(let n=0;n<4;n++)box(.28,.35,.3,(n%2-.5)*.32,.67,(Math.floor(n/2)-.5)*.34,0xe7ae60,cargo);cargo.visible=false;
   const ring=new THREE.Mesh(new THREE.RingGeometry(.49,.54,32),new THREE.MeshBasicMaterial({color:fleetColors[i],side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;g.add(ring);
   robots.push(g);cargos.push(cargo);tags.push(label(`AGV-0${i+1}`,p.x,1.2,p.z,1.7));
  }
  let routes:THREE.Object3D[]=[],warnings:THREE.Object3D[]=[],revision=-1,session='',playTime=0,frames:any[]=[],lastView=-1;
  const remove=(items:THREE.Object3D[])=>items.forEach(o=>{scene.remove(o);const m=o as THREE.Mesh;m.geometry?.dispose();(m.material as THREE.Material)?.dispose();});
  function routeLine(points:number[][],color:number,opacity:number){if(!points?.length)return;const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>world(p).setY(.065)));const l=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity}));scene.add(l);routes.push(l);}
  function ingest(s:any){
   if(s.sessionId!==session){session=s.sessionId;playTime=s.time;frames=[];}
   const incoming=s.frames?.length?s.frames:[{time:s.time,robots:s.robots.map((r:any)=>({...r,cargo:false}))}];
   const merged=new Map(frames.map(f=>[f.time,f]));incoming.forEach((f:any)=>merged.set(f.time,f));frames=Array.from(merged.values()).sort((a,b)=>a.time-b.time).filter(f=>f.time>=playTime-1);
   // After a long disconnect, align all devices to one authoritative frame. Never interpolate across a gap.
   if(frames.length&&playTime<frames[0].time)playTime=frames[0].time;
   remove(routes);routes=[];remove(warnings);warnings=[];
   for(const t of s.tasks.filter((t:any)=>['running','blocked'].includes(t.status))){const i=s.robots.findIndex((r:any)=>r.id===t.robotId);routeLine(t.oldRoute,0xd09244,.28);routeLine(t.route?.slice(t.index),fleetColors[i]||0x069e91,.9);}
   for(const p of s.obstacles){const v=world(p);warnings.push(box(.92,.65,.92,v.x,.33,v.z,0xe29043));}
   revision=s.revision;
  }
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=[0,0];
  const onDown=(e:PointerEvent)=>{down=[e.clientX,e.clientY];};
  const onUp=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const b=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(selectable)[0];if(hit)live.current.onSelect(hit.object.userData.id);};
  renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);
  const resize=new ResizeObserver(()=>{camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);});resize.observe(el);
  let request=0,last=performance.now();
  function animate(now:number){request=requestAnimationFrame(animate);const delta=Math.min(.1,(now-last)/1000);last=now;const s=live.current.snapshot;
   if(s){if(s.revision!==revision)ingest(s);const latest=frames.at(-1);const paused=!s.running&&s.tasks.some((t:any)=>['running','waiting','blocked'].includes(t.status));if(latest&&!paused)playTime=Math.min(latest.time,playTime+delta);
    let a=frames[0],b=a;for(const f of frames){if(f.time<=playTime)a=f;if(f.time>=playTime){b=f;break;}}
    if(a&&b){const span=b.time-a.time;const f=span===1?Math.max(0,Math.min(1,(playTime-a.time)/span)):0;
     robots.forEach((g,i)=>{const ar=a.robots[i],br=b.robots[i]||ar;if(!ar)return;const av=world(ar.position),bv=world(br.position);g.position.copy(av).lerp(bv,f);if(av.distanceTo(bv)>.01)g.rotation.y=Math.atan2(bv.x-av.x,bv.z-av.z);cargos[i].visible=Boolean(ar.cargo);tags[i].position.copy(g.position).add(new THREE.Vector3(0,1.35,0));});
    }delivered.visible=s.tasks.some((t:any)=>t.delivered);
    if(live.current.view%3===2){const i=s.robots.findIndex((r:any)=>r.state==='busy');if(i>=0){controls.target.lerp(robots[i].position,.05);camera.position.lerp(robots[i].position.clone().add(new THREE.Vector3(8,11,13)),.03);}}
   }
   routes.forEach(o=>o.visible=live.current.paths);if(lastView!==live.current.view){lastView=live.current.view;camera.position.set(lastView%3===1?0:dark?28:32,lastView%3===1?47:dark?31:35,lastView%3===1?.1:dark?34:39);controls.target.set(0,0,0);}
   renderer.shadowMap.enabled=live.current.quality;controls.update();renderer.render(scene,camera);
  }request=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(request);resize.disconnect();controls.dispose();scene.traverse(o=>{const m=o as THREE.Mesh;m.geometry?.dispose();const materials=Array.isArray(m.material)?m.material:[m.material];materials.filter(Boolean).forEach((mat:any)=>{mat.map?.dispose();mat.dispose();});});renderer.dispose();renderer.domElement.remove();};
 },[props.dark]);
 return <div className="scene" ref={host} aria-label="交互式三维仓库：同步时隙回放，路线颜色对应机器人，拖动旋转、滚轮缩放"/>;
}
