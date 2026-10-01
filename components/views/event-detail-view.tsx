import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { eventFacts, formatNumber, kindLabel } from '@/components/format';
import { useService } from '@/components/service-provider';
import { EventForm } from '@/components/shared/event-form';
import { prepareEventImage } from '@/components/shared/image';
import { InterestButton } from '@/components/shared/interest-button';
import { NotFound } from '@/components/shared/not-found';
import { Avatar, ConfirmButton, Status } from '@/components/shared/ui';
import { EventStatusTag, useEventOrganizers } from '@/components/views/events-view';
import { isOpenEvent, isRegistrationOpen } from '@/lib/domain/events';
import { delegateStatusLabel, initialsOf, registrationStatusLabel } from '@/lib/domain/labels';
import type { DelegateCandidate, DelegateStatus, Event, EventAttendanceEntry, EventDelegate, EventParticipation, EventRegistrationEntry } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

const delegateTone:Record<DelegateStatus,'blue'|'green'|'gray'|'coral'> = { invited:'blue', confirmed:'green', declined:'gray', attended:'green', absent:'gray' };

export function EventDetailView({id}:{id:string}) {
  const service = useService();
  const { events, org, go, signedIn, notify, reloadEvents, requireLogin } = useApp();
  const e = events.find(x=>x.id===id);
  const [participation,setParticipation] = useState<EventParticipation|null>(null);
  const [version,setVersion] = useState(0);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [editing,setEditing] = useState(false);
  const organizers = useEventOrganizers();
  const exists = !!e;
  useEffect(()=>{
    if (!exists || !signedIn) return;
    let cancelled = false;
    service.getEventParticipation(id).then(p=>{ if (!cancelled) setParticipation(p); }).catch(err=>{ if (!cancelled) setError(errorMessage(err)); });
    return ()=>{ cancelled = true; };
  },[service,id,exists,signedIn,version]);
  if (!e) return <NotFound/>;
  const host = org(e.hostId);
  const mine = signedIn?participation:null;
  /** Utfører en handling, viser feilen i siden, og henter påmelding og arrangementer på nytt. */
  const act = async(work:()=>Promise<unknown>,done?:string)=>{
    setBusy(true); setError('');
    try { await work(); if (done) notify(done); setVersion(v=>v+1); await reloadEvents(); return true; }
    catch (err) { setError(errorMessage(err)); return false; }
    finally { setBusy(false); }
  };
  return <div className="page" style={{ gap:16 }}>
    <button className="back-btn" onClick={()=>go({ view:'events' })}>← Alle arrangementer</button>
    <div className="detail">
      <div className="hero-ph">{e.imageUrl?<img className="hero-img" src={e.imageUrl} alt=""/>:e.imageAlt&&<span className="media-label">{e.imageAlt}</span>}</div>
      <div className="detail-body">
        <p className="event-date">{e.start}</p>
        <h1>{e.title} <EventStatusTag event={e}/></h1>
        {e.status==='cancelled'&&<p className="warn-box">Arrangementet er avlyst.</p>}
        {e.status==='draft'&&<p className="warn-box">Dette er et utkast. Bare arrangøren ser det.</p>}
        <div className="facts">{eventFacts(e).map(f=><div className="fact" key={f.label}><p className="label">{f.label}</p><p className="value">{f.value}</p></div>)}</div>
        <p className="detail-long">{e.description}</p>
        {e.digitalUrl&&<p className="event-link"><strong>Lenke til møtet:</strong> <a href={e.digitalUrl} target="_blank" rel="noopener noreferrer">{e.digitalUrl}</a></p>}
        <div className="actions" style={{ marginTop:22 }}><InterestButton event={e} large/></div>
        <p className="muted" style={{ marginTop:14 }}>{formatNumber(e.registered)} {e.registered===1?'organisasjon er':'organisasjoner er'} påmeldt{e.capacity?` av ${formatNumber(e.capacity)} plasser`:''} · {formatNumber(e.interested)} {e.interested===1?'person er':'personer er'} interessert</p>
        <p className="muted" style={{ marginTop:4 }}>Målgruppe: {e.audience}</p>
        {error&&<p className="form-error" role="alert" style={{ marginTop:14 }}>{error}</p>}

        {e.canEdit&&<OrganizerTools event={e} busy={busy} act={act} onEdit={()=>setEditing(true)}/>}
        {!!mine?.invitations.length&&<Invitations event={e} invitations={mine.invitations} busy={busy} act={act}/>}
        {isOpenEvent(e)&&<Registration event={e} entries={mine?.organizations ?? []} signedIn={signedIn} busy={busy} act={act}
          onLogin={()=>requireLogin('Logg inn for å melde på elevrådet.')}/>}
        {mine?.attendance&&<Attendance event={e} entries={mine.attendance} busy={busy} act={act}/>}

        {host&&<div className="detail-section">
          <h2>Arrangør</h2>
          <div className="host-row">
            <Avatar initials={host.initials} tone="coral" size="lg"/>
            <div><button className="name-link" onClick={()=>go({ view:'organization', id:host.id })}>{host.name}</button><p className="sub">{kindLabel[host.type]}{host.type!=='school'?' · verifisert':''}</p></div>
          </div>
        </div>}
      </div>
    </div>
    {editing&&<EventForm open event={e} organizers={organizers} onClose={()=>setEditing(false)}
      onSaved={(_,published)=>{ setEditing(false); void act(async()=>{},published?'Arrangementet er lagret':'Utkastet er lagret'); }}/>}
  </div>;
}

type Act = (work:()=>Promise<unknown>,done?:string)=>Promise<boolean>;

/** Bare for arrangøren (canEdit fra serveren): redigere, bilde, avlyse og avslutte. */
function OrganizerTools({event:e,busy,act,onEdit}:{event:Event;busy:boolean;act:Act;onEdit:()=>void}) {
  const service = useService();
  const file = useRef<HTMLInputElement>(null);
  const locked = e.status==='cancelled' || e.status==='completed';
  const started = new Date(e.startsAt)<=new Date();
  const pick = async(f?:File)=>{
    if (!f) return;
    await act(async()=>service.setEventImage(e.id,await prepareEventImage(f)),'Bildet er oppdatert');
    if (file.current) file.current.value = '';
  };
  return <div className="detail-section">
    <h2>Administrer arrangementet</h2>
    <p className="muted" style={{ lineHeight:1.5 }}>Du kan endre arrangementet fordi du er styreadministrator i {e.host}.</p>
    {!locked&&<div className="actions" style={{ marginTop:12 }}>
      <button className="btn" disabled={busy} onClick={onEdit}>{e.status==='draft'?'Rediger og publiser':'Rediger'}</button>
      <input ref={file} id="event-image" className="sr-only" type="file" accept="image/*" disabled={busy} onChange={x=>void pick(x.target.files?.[0])}/>
      <label htmlFor="event-image" className="btn" aria-disabled={busy}>{e.imageUrl?'Bytt bilde':'Legg til bilde'}</label>
      {e.imageUrl&&<button className="btn" disabled={busy} onClick={()=>void act(()=>service.setEventImage(e.id,null),'Bildet er fjernet')}>Fjern bilde</button>}
      {e.status==='published'&&started&&<ConfirmButton label="Marker som avsluttet" question="Avslutte arrangementet?" confirmLabel="Avslutt" disabled={busy}
        onConfirm={()=>void act(()=>service.setEventStatus({ eventId:e.id, status:'completed' }),'Arrangementet er avsluttet')}/>}
      <ConfirmButton label="Avlys" question="Avlyse arrangementet? Delegatene blir varslet." confirmLabel="Avlys" disabled={busy}
        onConfirm={()=>void act(()=>service.setEventStatus({ eventId:e.id, status:'cancelled' }),'Arrangementet er avlyst')}/>
    </div>}
    {locked&&<p className="muted" style={{ marginTop:8 }}>{e.status==='cancelled'?'Avlyste':'Avsluttede'} arrangementer kan ikke endres.</p>}
  </div>;
}

/** Delegaten bekrefter eller takker nei selv (§8). */
function Invitations({event:e,invitations,busy,act}:{event:Event;invitations:EventParticipation['invitations'];busy:boolean;act:Act}) {
  const service = useService();
  const open = isOpenEvent(e);
  return <div className="detail-section">
    <h2>Du er delegat</h2>
    <div className="list" style={{ gap:10 }}>{invitations.map(i=><div className="row-card wrap" key={i.delegateId}>
      <span className="grow"><strong>{i.organizationName}</strong><small>{i.officeTitle?`${i.officeTitle} · `:''}{i.status==='invited'?'Bekreft om du kommer':'Du har svart'}</small></span>
      <Status tone={delegateTone[i.status]}>{delegateStatusLabel[i.status]}</Status>
      {open&&i.status!=='confirmed'&&<button className="btn small primary" disabled={busy} onClick={()=>void act(()=>service.respondToDelegation({ delegateId:i.delegateId, accept:true }),'Du har bekreftet at du kommer')}>Jeg kommer</button>}
      {open&&i.status!=='declined'&&<button className="btn small" disabled={busy} onClick={()=>void act(()=>service.respondToDelegation({ delegateId:i.delegateId, accept:false }),'Du har takket nei')}>Kan ikke</button>}
    </div>)}</div>
    <p className="muted" style={{ marginTop:8, lineHeight:1.5 }}>Arrangementet kommer på CV-en din når arrangøren har bekreftet at du møtte.</p>
  </div>;
}

/** Påmelding av organisasjonene brukeren kan melde på, med delegater. Serveren sier hvilke det er. */
function Registration({event:e,entries,signedIn,busy,act,onLogin}:{event:Event;entries:EventRegistrationEntry[];signedIn:boolean;busy:boolean;act:Act;onLogin:()=>void}) {
  const service = useService();
  const { notify } = useApp();
  const open = isRegistrationOpen(e);
  return <div className="detail-section">
    <h2>Påmelding</h2>
    <p className="muted" style={{ lineHeight:1.5 }}>Skoleadministrator eller innholdsansvarlig melder på elevrådet og velger delegater.{e.seatsPerOrganization?` Hver organisasjon kan sende ${e.seatsPerOrganization}.`:''}{e.deadline?` Frist ${e.deadline}.`:''}</p>
    {!signedIn&&<div className="actions" style={{ marginTop:10 }}><button className="btn" onClick={onLogin}>Logg inn for å melde på</button></div>}
    {signedIn&&!entries.length&&<p className="empty-note" style={{ marginTop:8 }}>Du kan ikke melde på noen organisasjon. Spør skoleadministratoren i elevrådet ditt.</p>}
    <div className="list" style={{ gap:12, marginTop:10 }}>{entries.map(r=><div className="registration" key={r.organizationId}>
      <div className="row-card wrap">
        <span className="grow"><strong>{r.organizationName}</strong><small>{!r.allowed?'Utenfor målgruppen':r.status&&r.status!=='cancelled'?registrationStatusLabel[r.status]:open?'Ikke påmeldt':'Påmeldingen er stengt'}</small></span>
        {r.status==='registered'&&<Status tone="green">Påmeldt</Status>}
        {r.status==='waitlisted'&&<Status tone="blue">Venteliste</Status>}
        {r.allowed&&open&&(!r.status||r.status==='cancelled')&&<button className="btn small primary" disabled={busy}
          onClick={()=>void act(async()=>{
            const status = await service.registerForEvent({ eventId:e.id, organizationId:r.organizationId, registered:true });
            notify(status==='waitlisted'?`Arrangementet er fullt. ${r.organizationName} står på venteliste.`:`${r.organizationName} er påmeldt`);
          })}>Meld på</button>}
        {(r.status==='registered'||r.status==='waitlisted')&&<ConfirmButton label="Meld av" question={`Melde av ${r.organizationName}? Delegatene fjernes.`} confirmLabel="Meld av" disabled={busy}
          onConfirm={()=>void act(()=>service.registerForEvent({ eventId:e.id, organizationId:r.organizationId, registered:false }),`${r.organizationName} er meldt av`)}/>}
      </div>
      {r.registrationId&&(r.status==='registered'||r.status==='waitlisted')&&<Delegates event={e} entry={r} busy={busy} act={act}/>}
    </div>)}</div>
  </div>;
}

function Delegates({event:e,entry,busy,act}:{event:Event;entry:EventRegistrationEntry;busy:boolean;act:Act}) {
  const service = useService();
  const [adding,setAdding] = useState(false);
  const used = entry.delegates.filter(d=>d.status!=='declined').length;
  const full = !!e.seatsPerOrganization && used>=e.seatsPerOrganization;
  return <div className="delegates">
    <p className="chip-label">Delegater{e.seatsPerOrganization?` (${used} av ${e.seatsPerOrganization})`:''}</p>
    {entry.delegates.length?<ul className="history-list">{entry.delegates.map(d=><li key={d.id} className="role-item">
      <span className="grow"><strong>{d.name}</strong><span className="sub">{d.officeTitle ?? 'Uten verv'}</span></span>
      <Status tone={delegateTone[d.status]}>{delegateStatusLabel[d.status]}</Status>
      <ConfirmButton label="Fjern" question={`Fjerne ${d.name}?`} confirmLabel="Fjern" disabled={busy} onConfirm={()=>void act(()=>service.removeEventDelegate(d.id),'Delegaten er fjernet')}/>
    </li>)}</ul>:<p className="muted">Ingen delegater ennå.</p>}
    {!adding&&!full&&<div className="actions" style={{ marginTop:8 }}><button className="link" onClick={()=>setAdding(true)}>+ Legg til delegat</button></div>}
    {adding&&<DelegatePicker registrationId={entry.registrationId!} busy={busy} onCancel={()=>setAdding(false)}
      onPick={c=>void act(()=>service.addEventDelegate({ registrationId:entry.registrationId!, userId:c.id }),`${c.name} er meldt på og får beskjed`).then(ok=>{ if (ok) setAdding(false); })}/>}
  </div>;
}

/** Søk blant personene serveren lar organisasjonen melde på (elever ved skolen, eller med verv i styret). */
function DelegatePicker({registrationId,busy,onPick,onCancel}:{registrationId:string;busy:boolean;onPick:(c:DelegateCandidate)=>void;onCancel:()=>void}) {
  const service = useService();
  const [query,setQuery] = useState('');
  const [hits,setHits] = useState<DelegateCandidate[]|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.searchDelegateCandidates({ registrationId, query }).then(list=>{ if (!cancelled) { setHits(list); setError(''); } }).catch(err=>{ if (!cancelled) setError(errorMessage(err)); });
    },200);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[service,registrationId,query]);
  return <div className="assign-form">
    <label className="field"><span>Delegat</span><input value={query} onChange={x=>setQuery(x.target.value)} placeholder="Søk etter navn" autoComplete="off"/>
      <small>Personen får beskjed og må bekrefte selv.</small></label>
    <div className="hits" role="group" aria-label="Personer">
      {(hits ?? []).map(c=><button type="button" key={c.id} className="hit" disabled={busy} onClick={()=>onPick(c)}>
        <Avatar size="sm" tone="pale" initials={initialsOf(c.name)}/>
        <span className="grow"><span className="name">{c.name}</span><span className="sub">{c.officeTitle ?? 'Uten verv'}</span></span>
      </button>)}
      {hits&&!hits.length&&<p className="empty-note">Fant ingen. Personen må ha valgt skolen eller ha verv i organisasjonen.</p>}
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="actions"><button className="btn" onClick={onCancel}>Avbryt</button></div>
  </div>;
}

/** Arrangøren bekrefter faktisk oppmøte etter start. Bare dette gir CV-oppføring (§8). */
function Attendance({event:e,entries,busy,act}:{event:Event;entries:EventAttendanceEntry[];busy:boolean;act:Act}) {
  const service = useService();
  const started = new Date(e.startsAt)<=new Date() && (e.status==='published'||e.status==='completed');
  const pending = entries.flatMap(r=>r.delegates).filter(d=>d.status==='confirmed').length;
  const row = (d:EventDelegate)=><li key={d.id} className="role-item">
    <span className="grow"><strong>{d.name}</strong><span className="sub">{d.officeTitle?`${d.officeTitle} · `:''}{delegateStatusLabel[d.status]}</span></span>
    {started&&['confirmed','attended','absent'].includes(d.status)&&<>
      <button className={`btn small ${d.status==='attended'?'on':''}`} aria-pressed={d.status==='attended'} disabled={busy}
        onClick={()=>void act(()=>service.confirmAttendance({ delegateId:d.id, attended:true }))}>Møtte</button>
      <button className={`btn small ${d.status==='absent'?'on':''}`} aria-pressed={d.status==='absent'} disabled={busy}
        onClick={()=>void act(()=>service.confirmAttendance({ delegateId:d.id, attended:false }))}>Møtte ikke</button>
    </>}
  </li>;
  return <div className="detail-section">
    <div className="card-head"><h2>Påmeldte og oppmøte</h2>
      {started&&!!pending&&<button className="btn small" disabled={busy} onClick={()=>void act(()=>service.confirmAllAttendance(e.id),'Oppmøtet er bekreftet')}>Bekreft alle som har sagt ja ({pending})</button>}
    </div>
    <p className="muted" style={{ lineHeight:1.5 }}>{started?'Bekreft hvem som faktisk møtte. Bare bekreftet oppmøte kommer på CV-en til personen og skolen.':'Oppmøte kan bekreftes når arrangementet har startet.'}</p>
    {!entries.length&&<p className="empty-note">Ingen påmeldte ennå.</p>}
    <div className="list" style={{ gap:12, marginTop:10 }}>{entries.map(r=><div key={r.registrationId}>
      <p className="chip-label">{r.organizationName} · {registrationStatusLabel[r.status]}</p>
      {r.delegates.length?<ul className="history-list">{r.delegates.map(row)}</ul>:<p className="muted">Ingen delegater.</p>}
    </div>)}</div>
  </div>;
}
