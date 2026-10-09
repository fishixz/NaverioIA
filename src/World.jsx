import React,{useMemo,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import {MapControls,ContactShadows} from '@react-three/drei';
import * as THREE from 'three';
const greens=['#7fb89d','#91c7a5','#aecfa8','#6da98f'];
function Tree({position,scale=1,tint=0}){return <group position={position} scale={scale}><mesh castShadow position={[0,.57,0]}><cylinderGeometry args={[.14,.2,1.14,8]}/><meshStandardMaterial color="#a88c70"/></mesh><mesh castShadow position={[0,1.36,0]}><icosahedronGeometry args={[.88,1]}/><meshStandardMaterial color={greens[tint%4]} roughness={.9}/></mesh><mesh castShadow position={[.35,1.45,.2]}><icosahedronGeometry args={[.58,1]}/><meshStandardMaterial color={greens[(tint+1)%4]}/></mesh></group>}
function Bush({position,scale=1}){return <mesh castShadow position={position} scale={[scale*1.2,scale*.6,scale]}><icosahedronGeometry args={[.54,1]}/><meshStandardMaterial color="#7eb998" roughness={1}/></mesh>}
function Flower({position,color}){return <group position={position}><mesh position={[0,.12,0]}><cylinderGeometry args={[.014,.014,.24,5]}/><meshStandardMaterial color="#438b68"/></mesh>{[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*1.256)*.07,.25,Math.cos(i*1.256)*.07]}><sphereGeometry args={[.056,8,8]}/><meshStandardMaterial color={color}/></mesh>)}<mesh position={[0,.25,0]}><sphereGeometry args={[.043,8,8]}/><meshStandardMaterial color="#f2c76d"/></mesh></group>}
function Naverio({destination,onPosition}) {
 const root=useRef(),head=useRef(),leftFoot=useRef(),rightFoot=useRef();
 const movement=useRef({x:0,z:0,targetX:1.8,targetZ:1.4,restUntil:0,seed:0});
 useFrame(({clock},delta)=>{
  if(!root.current)return;
  const t=clock.elapsedTime,d=Math.min(delta,.065),v=movement.current;
  if(destination&&destination.id!==v.seed){v.seed=destination.id;v.targetX=destination.x;v.targetZ=destination.z;v.restUntil=0}
  const dx=v.targetX-v.x,dz=v.targetZ-v.z,dist=Math.hypot(dx,dz);
  if(dist<.25){
   if(v.restUntil===0)v.restUntil=t+1.3+Math.random()*3.5;
   if(t>v.restUntil){
    const angle=Math.random()*Math.PI*2,radius=1+Math.random()*8.5;
    v.targetX=Math.cos(angle)*radius;v.targetZ=Math.sin(angle)*radius;v.restUntil=0;
   }
  } else {
   const speed=Math.min(dist*1.3,.85),step=Math.min(dist,speed*d);
   v.x+=dx/dist*step;v.z+=dz/dist*step;
   const heading=Math.atan2(dx,dz);
   root.current.rotation.y=THREE.MathUtils.lerp(root.current.rotation.y,heading,.075);
  }
  const moving=dist>.25&&v.restUntil===0;
  root.current.position.set(v.x,.24+(moving?Math.abs(Math.sin(t*8))*.034:Math.sin(t*1.5)*.012),v.z);
  if(leftFoot.current)leftFoot.current.rotation.x=moving?Math.sin(t*8)*.37:0;
  if(rightFoot.current)rightFoot.current.rotation.x=moving?-Math.sin(t*8)*.37:0;
  if(head.current)head.current.rotation.z=Math.sin(t*.65)*.035;
  if(onPosition&&Math.floor(t*2)!==Math.floor((t-d)*2))onPosition({x:v.x,z:v.z});
 });
 return <group ref={root} scale={.68} position={[0,.24,0]}>
 <group ref={head}>
 <mesh castShadow position={[0,.65,0]} scale={[.8,.84,.77]}><sphereGeometry args={[.65,28,20]}/><meshStandardMaterial color="#edddc8" roughness={.94}/></mesh>
 <mesh castShadow position={[0,1.2,.025]} scale={[1,.9,.84]}><sphereGeometry args={[.68,28,20]}/><meshStandardMaterial color="#fff0d8" roughness={.9}/></mesh>
 {[-1,1].map(s=><group key={s}><mesh castShadow position={[s*.47,1.77,-.04]} rotation={[0,0,-s*.22]} scale={[.8,1.32,.72]}><sphereGeometry args={[.26,18,14]}/><meshStandardMaterial color="#fff0d8"/></mesh><mesh position={[s*.47,1.77,.15]} rotation={[0,0,-s*.22]} scale={[.6,1,.46]}><sphereGeometry args={[.24,18,14]}/><meshStandardMaterial color="#e7aea6"/></mesh><mesh position={[s*.27,1.22,.55]} scale={[1,1,.6]}><sphereGeometry args={[.105,18,14]}/><meshStandardMaterial color="#343b3e"/></mesh><mesh position={[s*.25,1.26,.62]}><sphereGeometry args={[.03,10,8]}/><meshBasicMaterial color="#fff"/></mesh><mesh position={[s*.42,1.03,.5]} scale={[1,.6,.5]}><sphereGeometry args={[.1,14,10]}/><meshStandardMaterial color="#efb4ad"/></mesh></group>)}
 <mesh position={[0,1.07,.607]}><sphereGeometry args={[.09,14,10]}/><meshStandardMaterial color="#bc8b81"/></mesh>
 </group>
 <group ref={leftFoot} position={[-.31,.2,0]}><mesh castShadow position={[0,-.05,.12]} scale={[1.15,.58,1.2]}><sphereGeometry args={[.25,16,12]}/><meshStandardMaterial color="#e6cfb5"/></mesh></group>
 <group ref={rightFoot} position={[.31,.2,0]}><mesh castShadow position={[0,-.05,.12]} scale={[1.15,.58,1.2]}><sphereGeometry args={[.25,16,12]}/><meshStandardMaterial color="#e6cfb5"/></mesh></group>
 </group>
}
function Landscape(){const scene=useMemo(()=>{let trees=[],flowers=[],bushes=[];for(let i=0;i<58;i++){const a=i*2.399,r=6.8+(i%9)*1.46;trees.push({x:Math.cos(a)*r,z:Math.sin(a)*r,scale:.7+(i%5)*.13,tint:i})}for(let i=0;i<160;i++){let a=i*2.4,r=3.3+(i%24)*.65;flowers.push({x:Math.cos(a)*r,z:Math.sin(a)*r,c:i%3===0?'#f6dbb8':i%3===1?'#e6b7b4':'#f5edd9'})}for(let i=0;i<65;i++){let a=i*2.36,r=5+(i%17)*.82;bushes.push({x:Math.sin(a)*r,z:Math.cos(a)*r})}return {trees,flowers,bushes}},[]);return <group><mesh receiveShadow position={[0,-.57,0]}><cylinderGeometry args={[20.2,19.8,1.35,96]}/><meshStandardMaterial color="#b0a085" roughness={1}/></mesh><mesh receiveShadow position={[0,.04,0]}><cylinderGeometry args={[20.3,20.2,.34,96]}/><meshStandardMaterial color="#a3cbb1" roughness={1}/></mesh><mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,.16,0]}><circleGeometry args={[3.4,48]}/><meshStandardMaterial color="#d6c6a7" roughness={1}/></mesh>{scene.trees.map((v,i)=><Tree key={i} position={[v.x,.16,v.z]} scale={v.scale} tint={v.tint}/>)}{scene.flowers.map((v,i)=><Flower key={i} position={[v.x,.16,v.z]} color={v.c}/>)}{scene.bushes.map((v,i)=><Bush key={i} position={[v.x,.42,v.z]} scale={.7+(i%4)*.14}/>)}</group>}
export default function World(){
 const [destination,setDestination]=React.useState(null);
 const next=React.useRef(0);
 return <Canvas shadows camera={{position:[9,11.5,18],fov:39,near:.1,far:110}} dpr={[1,1.7]} gl={{antialias:true}}>
 <color attach="background" args={['#b9dad7']}/><fog attach="fog" args={['#b9dad7',34,85]}/>
 <ambientLight intensity={1.7}/><hemisphereLight intensity={.8} color="#f3f7eb" groundColor="#8bb299"/>
 <directionalLight castShadow position={[-7,14,7]} intensity={2} color="#fff2db" shadow-mapSize={[1024,1024]} shadow-camera-left={-23} shadow-camera-right={23} shadow-camera-top={23} shadow-camera-bottom={-23}/>
 <group onDoubleClick={e=>{e.stopPropagation();const x=e.point.x,z=e.point.z;if(Math.hypot(x,z)<17){next.current++;setDestination({x,z,id:next.current})}}}><Landscape/></group>
 <Naverio destination={destination}/>
 <ContactShadows position={[0,.16,0]} opacity={.13} scale={5} blur={2.8}/>
 <MapControls makeDefault enableRotate={false} enableZoom={false} enablePan screenSpacePanning panSpeed={.9} enableDamping dampingFactor={.08} target={[0,0,0]}/>
 </Canvas>
}