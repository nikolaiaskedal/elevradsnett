import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { Avatar, ConfirmButton, Status } from '@/components/shared/ui';
import { initialsOf, officeSuggestions } from '@/lib/domain/labels';
import { handoverInviteStatusLabel, handoverRoleLabel, handoverStatusLabel, inviteSummary, type Handover, type HandoverOverview, type HandoverRole } from '@/lib/domain/notifications';
import type { AdminOrganization, AssignablePerson } from '@/lib/domain/types';
import { formatDate } from '@/lib/domain/time';
import { errorMessage, isoDate, OFFICE_TITLE_MAX_LENGTH, startHandoverSchema, type HandoverInviteInput } from '@/lib/domain/validation';

// Styreoverføring (§5). Veiviseren viser bare det serveren svarer: canManage (skoleadministrator gjennomfører) og
// canRecover (styret i området kan gjenopprette når overføringen er forsinket). Serveren sjekker alt på nytt.

type Notify = (text:string)=>void;
type Pick = { key:string; userId?:string; email?:string; name:string; publicTitle:string; adminRole:HandoverRole|'' };

const todayIso = ()=>isoDate(new Date());
const plusDays = (iso:string,days:number)=>{ const [y,m,d] = iso.split('-').map(Number); return isoDate(new Date(y,m-1,d+days)); };
const daysUntil = (iso:string)=>Math.round((Date.parse(iso)-Date.parse(todayIso()))/86400000);

export function HandoverPanel({org,onNotify}:{org:AdminOrganization;onNotify:Notify}){
  const service = useService();
  const [overview,setOverview] = useState<HandoverOverview|null>(null);
  const [error,setError] = useState('');
  const [version,setVersion] = useState(0);
  const [wizard,setWizard] = useState(false);
  useEffect(()=>{
    if (org.type!=='school') return;
    let cancelled = false;
    service.getHandoverOverview(org.id).then(o=>{ if (!cancelled) { setOverview(o); setError(''); } }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,org.id,org.type,version]);
  const refresh = ()=>setVersion(v=>v+1);
  if (org.type!=='school') return <section className="card"><h2>Styreoverføring</h2>
    <p className="muted" style={{ lineHeight:1.6 }}>Veiviseren gjelder elevråd. Nye styremedlemmer i {org.name} får verv og rettigheter under Roller og verv.</p></section>;
  if (error) return <section className="card"><p className="form-error" role="alert">{error}</p><button className="btn" onClick={refresh}>Prøv igjen</button></section>;
  if (!overview) return <section className="card"><p className="muted">Henter styreoverføringen …</p></section>;
  const open = overview.handover && (overview.handover.status==='awaiting_acceptance' || overview.handover.status==='scheduled') ? overview.handover : null;
  if (wizard && !open) return <Wizard overview={overview} recovery={!overview.canManage} onCancel={()=>setWizard(false)} onDone={()=>{ setWizard(false); refresh(); onNotify('Invitasjonene er sendt'); }}/>;
  return <>
    <Summary overview={overview} onChanged={refresh} onNotify={onNotify}/>
    {open?<OpenHandover handover={open} onChanged={refresh} onNotify={onNotify}/>
      :<section className="card">
        <div className="card-head"><div><h2>{overview.canManage?'Start styreoverføring':'Gjenoppretting'}</h2>
          <p className="muted">{overview.canManage
            ?'Velg det nye styret, fordel verv og rettigheter og send invitasjoner. De nye må logge inn og godta før rollene aktiveres.'
            :overview.canRecover
              ?`Overføringen i ${overview.name} er ikke fullført. Som styreadministrator i området kan du gjennomføre den, med begrunnelse.`
              :`Skoleadministratorene i ${overview.name} gjennomfører overføringen. Styret i området kan gjenopprette den når den er minst sju dager forsinket.`}</p></div></div>
        {(overview.canManage || overview.canRecover)&&<div className="actions"><button className="btn primary" onClick={()=>setWizard(true)}>{overview.canManage?'Start styreoverføring':'Start gjenoppretting'}</button></div>}
        {overview.handover?.status==='completed'&&<p className="muted">Forrige overføring ble fullført {formatDate(overview.handover.completedAt ?? overview.handover.activationDate)}.</p>}
      </section>}
  </>;
}

/** Dato for neste styreskifte, styreperioden og antall administratorer. */
function Summary({overview,onChanged,onNotify}:{overview:HandoverOverview;onChanged:()=>void;onNotify:Notify}){
  const service = useService();
  const [editing,setEditing] = useState(false);
  const [date,setDate] = useState(overview.expectedHandoverOn ?? '');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const days = overview.expectedHandoverOn?daysUntil(overview.expectedHandoverOn):null;
  const save = async()=>{
    setBusy(true); setError('');
    try { await service.setElectionDate({ organizationId:overview.organizationId, date }); onNotify('Datoen for styreskiftet er lagret'); setEditing(false); onChanged(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <section className="card">
    <div className="card-head"><div><h2>Styreskifte i {overview.name}</h2><p className="muted">Skoleadministratorene får påminnelse 14, 7 og 1 dag før, og deretter hver uke til overføringen er fullført.</p></div></div>
    <div className="metric-grid">
      <div className="card metric"><strong>{overview.expectedHandoverOn?formatDate(overview.expectedHandoverOn):'Ikke satt'}</strong><span>Neste styreskifte</span>
        <small>{days===null?'Sett datoen under':overview.overdueDays>0?`${overview.overdueDays} dager forsinket`:days===0?'I dag':days>0?`Om ${days} dager`:'Passert'}</small></div>
      <div className="card metric"><strong>{overview.termStartsOn?formatDate(overview.termStartsOn):'Ukjent'}</strong><span>Styreperioden startet</span><small>Nåværende styre</small></div>
      <div className="card metric"><strong>{overview.adminCount}</strong><span>Skoleadministratorer</span><small>Minst to anbefales</small></div>
    </div>
    {overview.adminCount<2&&<p className="warn-box">{overview.adminCount===0?`${overview.name} har ingen skoleadministrator.`:'Skolen har bare én skoleadministrator.'} Minst to anbefales, så noen alltid kan gjennomføre overføringen.</p>}
    {overview.overdueDays>=7&&<p className="warn-box">Overføringen er {overview.overdueDays} dager forsinket. Styret i området er varslet og kan starte en gjenoppretting.</p>}
    {editing
      ?<form className="assign-form" onSubmit={e=>{ e.preventDefault(); void save(); }}>
        <label className="field"><span>Ny dato for styreskiftet</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/><small>Er valget utsatt, setter du bare en ny dato.</small></label>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <div className="actions"><button className="btn primary" disabled={busy || !date}>Lagre datoen</button><button type="button" className="btn" onClick={()=>setEditing(false)}>Avbryt</button></div>
      </form>
      :<div className="actions"><button className="btn" onClick={()=>setEditing(true)}>{overview.expectedHandoverOn?'Endre datoen':'Sett datoen'}</button></div>}
  </section>;
}

/** En overføring som venter på svar eller aktivering. */
function OpenHandover({handover,onChanged,onNotify}:{handover:Handover;onChanged:()=>void;onNotify:Notify}){
  const service = useService();
  const { reload } = useApp();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [dates,setDates] = useState<{ activationDate:string; oldBoardEndsOn:string }|null>(null);
  const act = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); onNotify(done); setDates(null); onChanged(); reload(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const accepted = handover.invites.some(i=>i.adminRole==='school_admin' && i.status==='accepted');
  return <section className="card">
    <div className="card-head"><div><h2>Styreoverføring {handover.recovery?'(gjenoppretting)':''}</h2>
      <p className="muted">Startet av {handover.startedByName || 'en administrator'}. Nye roller aktiveres {formatDate(handover.activationDate)}, og det gamle styret avsluttes {formatDate(handover.oldBoardEndsOn)}.</p></div>
      <Status tone={handover.status==='scheduled'?'green':'coral'}>{handoverStatusLabel[handover.status]}</Status></div>
    {handover.recoveryReason&&<p className="note-box">Begrunnelse: {handover.recoveryReason}</p>}
    {!accepted&&<p className="warn-box">Nåværende administratorer beholder tilgangen til minst én ny skoleadministrator har godtatt.</p>}
    <div className="list">{handover.invites.map(i=><div className="row-card" key={i.id}>
      <Avatar size="sm" tone="pale" initials={initialsOf(i.name)}/>
      <span className="grow"><strong>{i.name}</strong><small>{inviteSummary(i)}{i.email?` · invitert på e-post (${i.email})`:''}</small></span>
      <Status tone={i.status==='accepted'?'green':i.status==='pending'?'blue':'gray'}>{handoverInviteStatusLabel[i.status]}</Status>
    </div>)}</div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {dates
      ?<form className="assign-form" onSubmit={e=>{ e.preventDefault(); void act(()=>service.rescheduleHandover({ handoverId:handover.id, ...dates }),'Datoene er endret'); }}>
        <div className="form-grid">
          <label className="field"><span>Sluttdato for gammelt styre</span><input type="date" value={dates.oldBoardEndsOn} onChange={e=>setDates({ ...dates, oldBoardEndsOn:e.target.value })} required/></label>
          <label className="field"><span>Aktivering av nye roller</span><input type="date" value={dates.activationDate} min={todayIso()} onChange={e=>setDates({ ...dates, activationDate:e.target.value })} required/></label>
        </div>
        <div className="actions"><button className="btn primary" disabled={busy}>Lagre datoene</button><button type="button" className="btn" onClick={()=>setDates(null)}>Avbryt</button></div>
      </form>
      :<div className="actions">
        {handover.status==='scheduled'&&handover.activationDate>todayIso()&&<ConfirmButton label="Aktiver nå" question="Aktivere det nye styret i dag?" confirmLabel="Aktiver nå" disabled={busy}
          onConfirm={()=>void act(()=>service.activateHandoverNow(handover.id),'Det nye styret er aktivert')}/>}
        <button className="btn small" disabled={busy} onClick={()=>setDates({ activationDate:handover.activationDate, oldBoardEndsOn:handover.oldBoardEndsOn })}>Endre datoene</button>
        <ConfirmButton label="Avlys" question="Avlyse overføringen? Invitasjonene slutter å gjelde." confirmLabel="Avlys overføringen" disabled={busy}
          onConfirm={()=>void act(()=>service.cancelHandover(handover.id),'Overføringen er avlyst')}/>
      </div>}
  </section>;
}

const steps = ['Dato','Nytt styre','Rettigheter','Forhåndsvisning'];

/** Veiviseren (§5): dato, nytt styre, rettigheter og forhåndsvisning før invitasjonene sendes. */
function Wizard({overview,recovery,onCancel,onDone}:{overview:HandoverOverview;recovery:boolean;onCancel:()=>void;onDone:()=>void}){
  const service = useService();
  const [step,setStep] = useState(1);
  const start = overview.expectedHandoverOn ?? todayIso();
  const [handoverOn,setHandoverOn] = useState(start);
  const [activationDate,setActivationDate] = useState(start<todayIso()?todayIso():start);
  const [oldBoardEndsOn,setOldBoardEndsOn] = useState(start<todayIso()?todayIso():plusDays(start,-1)<todayIso()?todayIso():plusDays(start,-1));
  const [reason,setReason] = useState('');
  const [picks,setPicks] = useState<Pick[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const invites:HandoverInviteInput[] = picks.map(p=>({ userId:p.userId, email:p.email, name:p.email?p.name:undefined, publicTitle:p.publicTitle.trim() || undefined, adminRole:p.adminRole || undefined }));
  const input = { organizationId:overview.organizationId, handoverOn, activationDate, oldBoardEndsOn, invites, recoveryReason:recovery?reason:undefined };
  /** Hvert steg sjekkes med det samme skjemaet som serveren bruker, men bare feltene steget gjelder. */
  const check = (s:number)=>{
    const result = startHandoverSchema.safeParse(input);
    if (result.success) return '';
    const fields:Record<number,string[]> = { 1:['handoverOn','activationDate','oldBoardEndsOn','recoveryReason'], 2:['invites'], 3:['invites'] };
    const issue = result.error.issues.find(i=>s===4 || (fields[s] ?? []).includes(String(i.path[0])));
    if (s===2 && issue?.message==='Velg minst én ny skoleadministrator.') return '';
    return issue?.message ?? '';
  };
  const next = ()=>{
    const problem = check(step);
    setError(problem);
    if (!problem) setStep(s=>s+1);
  };
  const submit = async()=>{
    setBusy(true); setError('');
    try { await service.startHandover(input); onDone(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const update = (key:string,change:Partial<Pick>)=>setPicks(all=>all.map(p=>p.key===key?{ ...p, ...change }:p));
  const add = (pick:Pick)=>setPicks(all=>all.some(p=>p.key===pick.key)?all:[...all,pick]);
  const ending = overview.members.flatMap(m=>{
    const kept = picks.find(p=>p.userId===m.userId);
    const offices = m.offices.filter(o=>o.toLowerCase()!==kept?.publicTitle.trim().toLowerCase());
    const roles = m.roles.filter(r=>r!==kept?.adminRole);
    return offices.length || roles.length ? [{ name:m.name, what:[...offices,...roles.map(r=>handoverRoleLabel[r].toLowerCase())].join(' og ') }] : [];
  });
  return <section className="card">
    <div className="progress" aria-hidden="true">{steps.map((s,i)=><div key={s} className={step>=i+1?'on':''}/>)}</div>
    <p className="step-label">Steg {step} av 4 · {steps[step-1]}</p>
    {step===1&&<>
      <h2>{recovery?'Gjenopprett styreoverføringen':'Bekreft styreskiftet'}</h2>
      <p className="muted">Nåværende administratorer beholder nødvendig tilgang til minst én ny skoleadministrator har godtatt.</p>
      <div className="form-grid">
        <label className="field"><span>Dato for styreskiftet</span><input type="date" value={handoverOn} onChange={e=>setHandoverOn(e.target.value)} required/></label>
        <label className="field"><span>Sluttdato for gammelt styre</span><input type="date" value={oldBoardEndsOn} onChange={e=>setOldBoardEndsOn(e.target.value)} required/></label>
        <label className="field"><span>Nye roller aktiveres</span><input type="date" value={activationDate} min={todayIso()} onChange={e=>setActivationDate(e.target.value)} required/></label>
      </div>
      {recovery&&<label className="field"><span>Begrunnelse for gjenopprettingen</span>
        <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} maxLength={1000} placeholder="F.eks. valget er holdt, men skolen har ikke fullført overføringen"/>
        <small>Begrunnelsen lagres i revisjonsloggen og vises for skolens administratorer.</small></label>}
    </>}
    {step===2&&<PickPeople overview={overview} picks={picks} onAdd={add} onRemove={key=>setPicks(all=>all.filter(p=>p.key!==key))} onUpdate={update}/>}
    {step===3&&<>
      <h2>Fordel rettigheter</h2>
      <p className="muted">Minst én må bli skoleadministrator. Innholdsansvarlig kan publisere for elevrådet, men ikke gi roller.</p>
      <div className="list">{picks.map(p=><div className="row-card wrap" key={p.key}>
        <Avatar size="sm" tone="pale" initials={initialsOf(p.name)}/>
        <span className="grow"><strong>{p.name}</strong><small>{p.publicTitle || 'Uten verv'}</small></span>
        <label className="field compact"><span className="sr-only">Rettighet for {p.name}</span>
          <select value={p.adminRole} onChange={e=>update(p.key,{ adminRole:e.target.value as Pick['adminRole'] })}>
            <option value="">Ingen rettighet</option><option value="school_admin">Skoleadministrator</option><option value="content_manager">Innholdsansvarlig</option>
          </select></label>
      </div>)}</div>
    </>}
    {step===4&&<>
      <h2>Kontroller overføringen</h2>
      <div className="note-box">
        <p><strong>{formatDate(activationDate)}:</strong> nye verv og rettigheter aktiveres, når minst én ny skoleadministrator har godtatt.</p>
        {picks.map(p=><p key={p.key}><strong>{p.name}:</strong> {inviteSummary({ publicTitle:p.publicTitle.trim() || undefined, adminRole:p.adminRole || undefined })}{p.email?` (invitasjon på e-post til ${p.email})`:''}</p>)}
        {ending.map(e=><p key={e.name}><strong>{e.name}:</strong> {e.what} avsluttes {formatDate(oldBoardEndsOn)}</p>)}
        <p><strong>Revisjonslogg:</strong> alle endringer registreres. Historiske verv blir stående på CV-en.</p>
      </div>
    </>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="actions">
      {step===1?<button className="btn ghost" onClick={onCancel}>Avbryt</button>:<button className="btn ghost" onClick={()=>{ setError(''); setStep(s=>s-1); }}>Tilbake</button>}
      {step<4?<button className="btn primary grow" onClick={next}>Neste</button>
        :<button className="btn primary grow" disabled={busy} onClick={()=>void submit()}>Send invitasjoner</button>}
    </div>
  </section>;
}

/** Velg det nye styret blant elevene ved skolen, eller inviter en ny bruker på e-post. */
function PickPeople({overview,picks,onAdd,onRemove,onUpdate}:{overview:HandoverOverview;picks:Pick[];onAdd:(p:Pick)=>void;onRemove:(key:string)=>void;onUpdate:(key:string,change:Partial<Pick>)=>void}){
  const service = useService();
  const [query,setQuery] = useState('');
  const [hits,setHits] = useState<AssignablePerson[]>([]);
  const [inviting,setInviting] = useState(false);
  const [guest,setGuest] = useState({ name:'', email:'' });
  useEffect(()=>{
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.searchAssignablePeople({ organizationId:overview.organizationId, query }).then(list=>{ if (!cancelled) setHits(list); }).catch(()=>{ if (!cancelled) setHits([]); });
    },200);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[service,overview.organizationId,query]);
  const chosen = new Set(picks.map(p=>p.key));
  const listId = `handover-titles-${overview.organizationId}`;
  return <>
    <h2>Velg det nye styret</h2>
    <p className="muted">Gjenvalgte beholder vervet sitt. De som ikke er med, får sluttdato på vervet.</p>
    <datalist id={listId}>{officeSuggestions.school.map(t=><option key={t} value={t}>{t}</option>)}</datalist>
    {!!picks.length&&<div className="list">{picks.map(p=><div className="row-card wrap" key={p.key}>
      <Avatar size="sm" tone="pale" initials={initialsOf(p.name)}/>
      <span className="grow"><strong>{p.name}</strong><small>{p.email?`Ny bruker · ${p.email}`:'Elev ved skolen'}</small></span>
      <label className="field compact"><span className="sr-only">Verv for {p.name}</span>
        <input value={p.publicTitle} list={listId} maxLength={OFFICE_TITLE_MAX_LENGTH} placeholder="Verv, f.eks. Nestleder" onChange={e=>onUpdate(p.key,{ publicTitle:e.target.value })}/></label>
      <button className="btn small" onClick={()=>onRemove(p.key)} aria-label={`Fjern ${p.name}`}>Fjern</button>
    </div>)}</div>}
    {!!overview.members.filter(m=>!chosen.has(m.userId)).length&&<>
      <h3 className="sub-head">Dagens styre</h3>
      <div className="chips">{overview.members.filter(m=>!chosen.has(m.userId)).map(m=><button key={m.userId} className="chip" onClick={()=>onAdd({ key:m.userId, userId:m.userId, name:m.name, publicTitle:m.offices[0] ?? '', adminRole:'' })}>+ {m.name}{m.offices[0]?` (${m.offices[0]})`:''}</button>)}</div>
    </>}
    <label className="field"><span>Søk blant elevene ved skolen</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Navn" autoComplete="off"/></label>
    <div className="hits" role="group" aria-label="Elever">
      {hits.filter(h=>!chosen.has(h.id)).slice(0,8).map(h=><button type="button" key={h.id} className="hit" onClick={()=>onAdd({ key:h.id, userId:h.id, name:h.name, publicTitle:'', adminRole:'' })}>
        <Avatar size="sm" tone="pale" initials={initialsOf(h.name)}/><span className="grow"><span className="name">{h.name}</span><span className="sub">{h.schoolName ?? ''}</span></span><span aria-hidden="true">+</span>
      </button>)}
    </div>
    {inviting
      ?<form className="assign-form" onSubmit={e=>{ e.preventDefault(); const email = guest.email.trim().toLowerCase(); if (!email) return; onAdd({ key:email, email, name:guest.name.trim() || email, publicTitle:'', adminRole:'' }); setGuest({ name:'', email:'' }); setInviting(false); }}>
        <div className="form-grid">
          <label className="field"><span>Navn</span><input value={guest.name} onChange={e=>setGuest({ ...guest, name:e.target.value })} maxLength={120}/></label>
          <label className="field"><span>E-post</span><input type="email" value={guest.email} onChange={e=>setGuest({ ...guest, email:e.target.value })} required/></label>
        </div>
        <small className="muted">Personen får en e-post og godtar etter å ha logget inn med adressen og valgt skolen.</small>
        <div className="actions"><button className="btn primary">Legg til</button><button type="button" className="btn" onClick={()=>setInviting(false)}>Avbryt</button></div>
      </form>
      :<button className="btn ghost" onClick={()=>setInviting(true)}>+ Inviter ny bruker</button>}
  </>;
}
