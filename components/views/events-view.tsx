import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { byDate, categoryLabel } from '@/components/format';
import { useService } from '@/components/service-provider';
import { EventForm } from '@/components/shared/event-form';
import { InterestButton } from '@/components/shared/interest-button';
import { Status } from '@/components/shared/ui';
import { isPastEvent } from '@/lib/domain/events';
import type { Event, EventOrganizer } from '@/lib/domain/types';

/** Merke for utkast og avlyste arrangementer. Publiserte og avsluttede trenger ikke merke. */
export function EventStatusTag({event:e}:{event:Event}) {
  if (e.status==='draft') return <Status tone="blue">Utkast</Status>;
  if (e.status==='cancelled') return <Status tone="coral">Avlyst</Status>;
  return null;
}

export function EventVisual({event:e,onOpen}:{event:Event;onOpen?:()=>void}) {
  const content = <>
    {e.imageUrl?<img src={e.imageUrl} alt=""/>:e.imageAlt&&<span className="media-label">{e.imageAlt}</span>}
    <span className="event-badge">{categoryLabel[e.category]}</span>
  </>;
  return onOpen?<button className="event-visual" onClick={onOpen} aria-label={`Åpne ${e.title}`}>{content}</button>:<div className="event-visual">{content}</div>;
}

/** Organisasjonene brukeren kan arrangere for. Serveren avgjør; tom liste betyr ingen knapp. */
export function useEventOrganizers() {
  const service = useService();
  const { signedIn, currentUser } = useApp();
  const [organizers,setOrganizers] = useState<EventOrganizer[]>([]);
  useEffect(()=>{
    if (!signedIn) return;
    let cancelled = false;
    service.listEventOrganizers().then(list=>{ if (!cancelled) setOrganizers(list); }).catch(()=>{ if (!cancelled) setOrganizers([]); });
    return ()=>{ cancelled = true; };
  },[service,signedIn,currentUser?.id]);
  return signedIn?organizers:[];
}

export function EventsView() {
  const { events, go, notify, reloadEvents } = useApp();
  const organizers = useEventOrganizers();
  const [creating,setCreating] = useState(false);
  const [showPast,setShowPast] = useState(false);
  const upcoming = events.filter(e=>!isPastEvent(e)).sort(byDate);
  const past = events.filter(e=>isPastEvent(e)).sort((a,b)=>b.startsAt.localeCompare(a.startsAt));
  const card = (e:Event)=><article className="event-card" key={e.id}>
    <EventVisual event={e} onOpen={()=>go({ view:'event', id:e.id })}/>
    <div className="event-body">
      <p className="event-date">{e.start}{e.end?` · ${e.end}`:''}</p>
      <h2 className="event-title">{e.title} <EventStatusTag event={e}/></h2>
      <p className="event-meta">{e.host} · {e.place}</p>
      {e.summary&&<p className="event-desc">{e.summary}</p>}
      <div className="event-buttons"><InterestButton event={e}/><button className="btn" onClick={()=>go({ view:'event', id:e.id })}>{isPastEvent(e)?'Detaljer':'Påmelding og detaljer'}</button></div>
    </div>
  </article>;
  return <div className="page">
    <div className="page-head split">
      <div className="grow"><h1>Arrangementer</h1><p className="muted">Kurs, samlinger og møter for elevråd</p></div>
      {!!organizers.length&&<button className="btn primary" onClick={()=>setCreating(true)}>Nytt arrangement</button>}
    </div>
    {upcoming.map(card)}
    {!upcoming.length&&<p className="empty-note">Ingen kommende arrangementer.</p>}
    {!!past.length&&<section className="stack">
      <div className="card-head"><h2>Tidligere arrangementer</h2><button className="link" aria-expanded={showPast} onClick={()=>setShowPast(v=>!v)}>{showPast?'Skjul':`Vis ${past.length}`}</button></div>
      {showPast&&past.map(card)}
    </section>}
    {creating&&<EventForm open organizers={organizers} onClose={()=>setCreating(false)}
      onSaved={(id,published)=>{ setCreating(false); notify(published?'Arrangementet er publisert':'Utkastet er lagret'); void reloadEvents().then(()=>go({ view:'event', id })); }}/>}
  </div>;
}
