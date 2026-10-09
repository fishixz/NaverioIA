import React,{useEffect,useState} from 'react';
import World from './World.jsx';
export default function App(){
 const [progress,setProgress]=useState(0),[opened,setOpened]=useState(false);
 useEffect(()=>{let start=performance.now(),raf=0;const animate=now=>{const elapsed=now-start;setProgress(Math.min(100,Math.round(elapsed/1900*100)));if(elapsed<1900){raf=requestAnimationFrame(animate)}else{setTimeout(()=>setOpened(true),400)}};raf=requestAnimationFrame(animate);return()=>cancelAnimationFrame(raf)},[]);
 return <div className="experience">
 <main className={'world-stage '+(opened?'is-open':'')}><World/></main>
 <div className={'opening-cover '+(opened?'is-open':'')} aria-hidden="true"><div className="cover-top"/><div className="cover-bottom"/></div>
 {!opened&&<div className={'loading '+(progress===100?'finished':'')} role="status" aria-label="Carregando mundo"><div className="loading-symbol">✳</div><div className="loading-name">navério<span>.</span></div><div className="loading-text">{progress===100?'Tudo pronto. Bem-vindo.':'Preparando meu pequeno mundo'}</div><div className="loading-track"><div style={{width:progress+'%'}}/></div><div className="loading-number">{progress}%</div></div>}

 </div>
}