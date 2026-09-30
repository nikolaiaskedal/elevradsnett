'use client';

import { useEffect, useRef } from 'react';

export type Tone = 'navy'|'coral'|'pale';

export function Logo(){
  return <span className="brand" aria-label="Elevrådsnett"><span className="brand-mark"><span/></span><span className="brand-word">elevråds<strong>nett</strong></span></span>;
}

export function Avatar({initials,tone='navy',size='md'}:{initials:string;tone?:Tone;size?:'sm'|'md'|'lg'|'xl'}){
  return <span className={`avatar ${tone} ${size}`} aria-hidden="true">{initials}</span>;
}

export function Status({children,tone='blue'}:{children:React.ReactNode;tone?:'blue'|'coral'|'green'|'gray'}){
  return <span className={`status ${tone}`}>{children}</span>;
}

export function SearchField({value,onChange,onSubmit,placeholder,label,size='md',buttonLabel}:{value:string;onChange:(v:string)=>void;onSubmit?:()=>void;placeholder:string;label:string;size?:'sm'|'md'|'lg';buttonLabel?:string}){
  return <form className={`search-field ${size}`} role="search" onSubmit={e=>{e.preventDefault();onSubmit?.()}}>
    <span className="search-ring" aria-hidden="true"/>
    <input value={value} onChange={e=>onChange(e.target.value)} aria-label={label} placeholder={placeholder}/>
    {buttonLabel&&<button className="btn primary">{buttonLabel}</button>}
  </form>;
}

export function Modal({open,onClose,labelledBy,children,width=580}:{open:boolean;onClose:()=>void;labelledBy:string;children:React.ReactNode;width?:number}){
  const panel=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose});
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.querySelector<HTMLElement>('textarea,input,select')?.focus();
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current()};
    document.addEventListener('keydown',onKey);
    document.body.style.overflow='hidden';
    return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow='';previous?.focus()};
  },[open]);
  if(!open)return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{maxWidth:width}}>{children}</div>
  </div>;
}

const icon={width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,'aria-hidden':true};
export function SupportIcon(){return <svg {...icon}><path d="M3.5 20.5 9 8.5l6.5 6.5-12 5.5Z"/><path d="M13 3.5v2"/><path d="M18.5 5.5 17 7"/><path d="M20.5 11h-2"/><path d="M16.5 11.5c1-2.5 3-3 5-2.5"/></svg>}
export function CommentIcon(){return <svg {...icon}><path d="M20 12.5c0 3.9-3.6 7-8 7-1 0-2-.15-2.9-.44L4.5 20.5l1.2-3.4C4.6 15.85 4 14.25 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z"/></svg>}
export function ShareIcon(){return <svg {...icon}><path d="M13 4.5 20 11l-7 6.5v-3.7c-4.6 0-7.3 1.3-8.6 4 0-5.6 2.9-8.8 8.6-9.1V4.5Z"/></svg>}
