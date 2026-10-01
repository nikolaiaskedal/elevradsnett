import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { Avatar, Status } from '@/components/shared/ui';
import type { Representation } from '@/lib/domain/types';

const repState = (rep:Representation)=>rep.organizationStatus!=='active'?'Deaktivert':rep.canPublish?'Kan publisere':'Kan kommentere og stemme';

/**
 * Viser hvilken organisasjon brukeren opptrer på vegne av, og lar brukeren bytte (§3).
 * Alle tilknytninger vises; verv i deaktiverte organisasjoner kan ikke velges. Serveren sjekker byttet.
 */
export function RepresentationSwitcher() {
  const { signedIn, representations, activeRep, switchRepresentation, go } = useApp();
  const [open,setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    if (!open) return;
    const outside = (e:MouseEvent)=>{ if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e:KeyboardEvent)=>{ if (e.key==='Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{ document.removeEventListener('mousedown',outside); document.removeEventListener('keydown',escape); };
  },[open]);

  if (!signedIn || !representations.length) return null;
  const choose = (rep:Representation)=>{ setOpen(false); if (rep.id!==activeRep?.id) switchRepresentation(rep); };
  return <div className="rep-switch" ref={wrap}>
    <button ref={button} className="rep-switch-button" aria-haspopup="true" aria-expanded={open} onClick={()=>setOpen(v=>!v)}
      aria-label={activeRep?`Du representerer ${activeRep.name}. Bytt representasjon`:'Velg hvem du representerer'}>
      <Avatar initials={activeRep?.initials ?? '?'} size="sm" tone={activeRep?.type==='school'?'navy':'coral'} orgType={activeRep?.type}/>
      <span className="rep-switch-text"><small>Representerer</small><strong>{activeRep?.name ?? 'Ingen valgt'}</strong></span>
      <span className="caret" aria-hidden="true"/>
    </button>
    {open&&<div className="rep-switch-panel">
      <p className="eyebrow">Opptre på vegne av</p>
      <ul>
        {representations.map(rep=>{
          const on = rep.id===activeRep?.id;
          const disabled = rep.organizationStatus!=='active';
          return <li key={rep.id}>
            <button className={`rep-option ${on?'on':''}`} disabled={disabled} aria-current={on?'true':undefined} onClick={()=>choose(rep)}>
              <Avatar initials={rep.initials} size="sm" tone={on?'coral':disabled?'pale':'navy'} orgType={rep.type}/>
              <span className="grow"><strong>{rep.name}</strong><small>{rep.publicRole} · {repState(rep)}</small></span>
              {on&&<Status tone="coral">Aktiv</Status>}
              {disabled&&<Status tone="gray">Deaktivert</Status>}
            </button>
          </li>;
        })}
      </ul>
      <p className="rep-switch-note">Én representasjon er aktiv om gangen. Meldinger er alltid personlige.</p>
      <button className="link" onClick={()=>{ setOpen(false); go({ view:'profile' }); }}>Se verv og roller</button>
    </div>}
  </div>;
}
