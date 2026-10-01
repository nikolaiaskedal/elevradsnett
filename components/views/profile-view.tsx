import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { PersonCvSections } from '@/components/shared/cv';
import { prepareAvatar } from '@/components/shared/image';
import { SchoolPicker } from '@/components/shared/login-flow';
import { Avatar, ConfirmButton, Status } from '@/components/shared/ui';
import { delegateStatusLabel, roleLabel } from '@/lib/domain/labels';
import { formatDate } from '@/lib/domain/time';
import type { MyRole, PersonCv, SchoolAdminRequest, SchoolHistoryEntry } from '@/lib/domain/types';
import { errorMessage, REQUEST_TEXT_MAX_LENGTH } from '@/lib/domain/validation';

const monthYear = (iso:string)=>new Date(iso).toLocaleDateString('nb-NO',{ month:'long', year:'numeric' });
const requestStatus:Record<SchoolAdminRequest['status'],[string,'blue'|'green'|'gray'|'coral']> = {
  pending:['Venter på styret','blue'], approved:['Godkjent','green'], rejected:['Avslått','coral'], cancelled:['Trukket','gray'],
};

/** Egen profil. Vises bare innlogget (se elevradsnett-app). */
export function ProfileView() {
  const service = useService();
  const { currentUser, representations, organizations, org, go, activeRep, notify, reload, signOut, switchRepresentation } = useApp();
  const user = currentUser!;
  const school = user.schoolId?org(user.schoolId):undefined;
  const [editing,setEditing] = useState(false);
  const [name,setName] = useState(user.name);
  const [changing,setChanging] = useState(false);
  const [newSchool,setNewSchool] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [history,setHistory] = useState<SchoolHistoryEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(()=>{
    let cancelled = false;
    service.listSchoolHistory().then(list=>{ if (!cancelled) setHistory(list); }).catch(()=>{});
    return ()=>{ cancelled = true; };
  },[service,user.schoolId]);

  const act = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); notify(done); reload(); return true; }
    catch (e) { setError(errorMessage(e)); return false; }
    finally { setBusy(false); }
  };
  const saveName = async()=>{ if (await act(()=>service.updateProfile({ displayName:name }),'Profilen er oppdatert')) setEditing(false); };
  const pickAvatar = async(file?:File)=>{
    if (!file) return;
    await act(async()=>service.setAvatar(await prepareAvatar(file)),'Profilbildet er oppdatert');
    if (fileInput.current) fileInput.current.value = '';
  };
  const target = organizations.find(o=>o.id===newSchool);
  const changeSchool = async()=>{
    if (!target) { setError('Velg den nye skolen.'); return; }
    if (await act(()=>service.changeSchool({ schoolId:target.id }),`Du er nå registrert ved ${target.schoolName ?? target.name}`)) { setChanging(false); setNewSchool(''); }
  };

  return <div className="page" style={{ gap:16 }}>
    <div className="profile-card">
      <div className="avatar-edit">
        <Avatar initials={user.initials} size="xl" src={user.avatarUrl}/>
        <input ref={fileInput} id="avatar-file" className="sr-only" type="file" accept="image/*" onChange={e=>void pickAvatar(e.target.files?.[0])} disabled={busy}/>
        <label htmlFor="avatar-file" className="btn small" aria-disabled={busy}>{user.avatarUrl?'Bytt bilde':'Legg til bilde'}</label>
        {user.avatarUrl&&<button className="quiet small-quiet" disabled={busy} onClick={()=>void act(()=>service.removeAvatar(),'Profilbildet er fjernet')}>Fjern</button>}
      </div>
      <div className="names">
        {editing
          ?<form className="name-form" onSubmit={e=>{ e.preventDefault(); void saveName(); }}>
            <label className="field"><span>Navn</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" maxLength={120} autoFocus/></label>
            <div className="actions"><button className="btn primary" disabled={busy}>Lagre</button><button type="button" className="btn" onClick={()=>{ setEditing(false); setName(user.name); setError(''); }}>Avbryt</button></div>
          </form>
          :<h1>{user.name}</h1>}
        {activeRep&&<p className="role">{activeRep.publicRole}</p>}
        <p className="school">{school?`${school.schoolName ?? school.name} · ${school.county}`:'Ingen skole valgt'}</p>
      </div>
      <div className="actions">
        {!editing&&<button className="btn large" onClick={()=>{ setEditing(true); setName(user.name); }}>Rediger profil</button>}
        {school&&<button className="btn ghost large" onClick={()=>go({ view:'organization', id:school.id })}>Åpne elevrådets side</button>}
      </div>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}

    <section className="section-card">
      <h2>Skole</h2>
      <p className="muted" style={{ marginTop:4, lineHeight:1.5 }}>Skolen bestemmer fylke, lokallag og hva du ser i feeden. Har du byttet skole eller begynt på videregående, kan du endre det selv.</p>
      {!changing&&<div className="actions" style={{ marginTop:12 }}><button className="btn" onClick={()=>{ setChanging(true); setError(''); }}>Bytt skole</button></div>}
      {changing&&<div className="change-school">
        <SchoolPicker schools={organizations} value={newSchool} onChange={setNewSchool} exclude={user.schoolId}/>
        <p className="warn-box">Verv og rettigheter ved {school?.schoolName ?? school?.name ?? 'gammel skole'} avsluttes og blir stående i historikken din. Du får ikke publiserings- eller administratorrett ved ny skole før en administrator der gir deg det.</p>
        <div className="actions"><button className="btn primary" disabled={busy||!target} onClick={()=>void changeSchool()}>{target?`Bytt til ${target.schoolName ?? target.name}`:'Velg ny skole'}</button><button className="btn" onClick={()=>{ setChanging(false); setNewSchool(''); setError(''); }}>Avbryt</button></div>
      </div>}
      {!!history.length&&<>
        <p className="chip-label">Skolehistorikk</p>
        <ul className="history-list">
          {history.map(h=><li key={`${h.schoolId}-${h.startedAt}`}><strong>{h.schoolName}</strong><span className="sub">{h.county} · {monthYear(h.startedAt)} – {h.endedAt?monthYear(h.endedAt):'nå'}</span></li>)}
        </ul>
      </>}
    </section>

    <section className="section-card">
      <h2>Representerer</h2>
      {representations.length?<div className="list" style={{ gap:10 }}>
        {representations.map(rep=>{ const o=org(rep.organizationId); const on=rep.id===activeRep?.id; const inactive=rep.organizationStatus!=='active'; return <div className={`rep-row ${on?'on':''}`} key={rep.id}>
          <button className="rep-main" onClick={()=>go({ view:'organization', id:rep.organizationId })}>
            <Avatar initials={rep.initials} size="lg" tone={on?'coral':inactive?'pale':'navy'}/>
            <span className="grow"><span className="rep-name">{rep.name}</span><span className="sub">{rep.publicRole}{o?.contactEmail?` · ${o.contactEmail}`:''}{inactive?' · organisasjonen er deaktivert':rep.canPublish?'':' · kan ikke publisere'}</span></span>
          </button>
          {on?<Status tone="coral">Aktiv</Status>:inactive?<Status tone="gray">Deaktivert</Status>:<button className="btn small" onClick={()=>switchRepresentation(rep)}>Bruk</button>}
        </div>; })}
      </div>:<p className="muted" style={{ marginTop:4, lineHeight:1.5 }}>Du har ingen verv ennå. Når elevrådet eller et styre gir deg et verv, kan du publisere og kommentere på vegne av det.</p>}
      <p className="muted" style={{ marginTop:10, lineHeight:1.5 }}>Én representasjon er aktiv om gangen og bestemmer hvem du publiserer og kommenterer som. Meldinger er alltid personlige.</p>
    </section>

    <RolesSection schoolId={user.schoolId} schoolName={school?.schoolName ?? school?.name}/>

    <CvSection userId={user.id}/>

    <section className="section-card">
      <h2>Innlogging</h2>
      <dl className="facts">
        <div><dt>E-post</dt><dd>{user.email}</dd></div>
        <div><dt>Telefonnummer</dt><dd><span className="later-tag">Kommer senere</span></dd></div>
        <div><dt>Feide</dt><dd><span className="later-tag">Kommer senere</span></dd></div>
      </dl>
      <div className="actions" style={{ marginTop:12 }}><button className="btn" onClick={signOut}>Logg ut</button></div>
    </section>
  </div>;
}

/** Egne verv og interne rettigheter, også tidligere, og forespørsel om å bli skoleadministrator (§3, §4). */
function RolesSection({schoolId,schoolName}:{schoolId:string|null;schoolName?:string}) {
  const service = useService();
  const { notify, reload } = useApp();
  const [roles,setRoles] = useState<MyRole[]|null>(null);
  const [requests,setRequests] = useState<SchoolAdminRequest[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [asking,setAsking] = useState(false);
  const [message,setMessage] = useState('');
  const [version,setVersion] = useState(0);

  useEffect(()=>{
    let cancelled = false;
    Promise.all([service.listMyRoles(),service.listSchoolAdminRequests()])
      .then(([r,q])=>{ if (!cancelled) { setRoles(r); setRequests(q.filter(x=>x.mine)); setError(''); } })
      .catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,schoolId,version]);

  const act = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); notify(done); setVersion(v=>v+1); reload(); return true; }
    catch (e) { setError(errorMessage(e)); return false; }
    finally { setBusy(false); }
  };
  const activeRoles = roles?.filter(r=>r.kind==='role' && r.status==='active') ?? [];
  const activeOffices = roles?.filter(r=>r.kind==='office' && r.status==='active') ?? [];
  const former = roles?.filter(r=>r.status!=='active') ?? [];
  const isSchoolAdmin = activeRoles.some(r=>r.role==='school_admin' && r.organizationId===schoolId);
  const pending = requests.find(r=>r.status==='pending' && r.schoolId===schoolId);
  const period = (r:MyRole)=>`${monthYear(r.startDate)} – ${r.endDate?monthYear(r.endDate):'nå'}`;

  return <section className="section-card">
    <h2>Verv og rettigheter</h2>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!roles&&!error&&<p className="muted" style={{ marginTop:4 }}>Henter verv …</p>}
    {roles&&<>
      <p className="chip-label">Offentlige verv</p>
      {activeOffices.length?<ul className="history-list">
        {activeOffices.map(r=><li key={r.id} className="role-item">
          <span className="grow"><strong>{r.title || 'Medlem'}</strong><span className="sub">{r.organizationName} · {period(r)}{r.organizationStatus!=='active'?' · organisasjonen er deaktivert':''}</span></span>
          <ConfirmButton label="Gå av" question={`Gå av som ${r.title || 'medlem'}?`} confirmLabel="Gå av" disabled={busy} onConfirm={()=>void act(()=>service.endPublicOffice(r.id),'Vervet er avsluttet')}/>
        </li>)}
      </ul>:<p className="muted">Ingen aktive verv.</p>}
      <p className="chip-label">Interne rettigheter</p>
      {activeRoles.length?<ul className="history-list">
        {activeRoles.map(r=><li key={r.id} className="role-item">
          <span className="grow"><strong>{r.role?roleLabel[r.role]:''}</strong><span className="sub">{r.organizationName} · fra {monthYear(r.startDate)}</span></span>
          <ConfirmButton label="Gi fra deg" question={`Gi fra deg ${r.role?roleLabel[r.role].toLowerCase():'rettigheten'}?`} confirmLabel="Gi fra deg" disabled={busy} onConfirm={()=>void act(()=>service.revokeRole(r.id),'Rettigheten er fjernet')}/>
        </li>)}
      </ul>:<p className="muted">Ingen interne rettigheter.</p>}
      <p className="muted" style={{ marginTop:8, lineHeight:1.5 }}>Interne rettigheter vises ikke offentlig. Bare du og administratorene i organisasjonen ser dem.</p>
      {!!former.length&&<>
        <p className="chip-label">Tidligere verv og rettigheter</p>
        <ul className="history-list">
          {former.map(r=><li key={r.id}><strong>{r.kind==='office'?r.title || 'Medlem':r.role?roleLabel[r.role]:''}</strong><span className="sub">{r.organizationName} · {period(r)}</span></li>)}
        </ul>
      </>}
    </>}
    {schoolId&&roles&&!isSchoolAdmin&&<div className="request-box">
      <p className="chip-label">Skoleadministrator</p>
      {pending?<div className="row-card">
        <Status tone="blue">Venter på styret</Status>
        <span className="grow"><strong>Du har bedt om å bli skoleadministrator for {pending.schoolName}</strong><small>Styreadministrator i fylket eller lokallaget avgjør forespørselen.</small></span>
        <ConfirmButton label="Trekk" question="Trekke forespørselen?" confirmLabel="Trekk" disabled={busy} onConfirm={()=>void act(()=>service.cancelSchoolAdminRequest(pending.id),'Forespørselen er trukket')}/>
      </div>
      :asking?<form className="name-form" onSubmit={e=>{ e.preventDefault(); void act(()=>service.requestSchoolAdmin({ schoolId, message:message.trim() || undefined }),'Forespørselen er sendt').then(ok=>{ if (ok) { setAsking(false); setMessage(''); } }); }}>
        <label className="field"><span>Melding til styret (valgfritt)</span><textarea className="input" rows={3} value={message} onChange={e=>setMessage(e.target.value)} maxLength={REQUEST_TEXT_MAX_LENGTH} placeholder="F.eks. hvilket verv du har i elevrådet"/></label>
        <div className="actions"><button className="btn primary" disabled={busy}>Send forespørsel</button><button type="button" className="btn" onClick={()=>{ setAsking(false); setMessage(''); }}>Avbryt</button></div>
      </form>
      :<><p className="muted" style={{ lineHeight:1.5 }}>Skoleadministrator kan oppdatere siden til {schoolName ?? 'skolen'}, gi verv og gi publiseringsrett. Har ingen administrator gitt deg det, kan du be styret om det.</p>
        <div className="actions" style={{ marginTop:10 }}><button className="btn" onClick={()=>setAsking(true)}>Be om å bli skoleadministrator</button></div></>}
      {requests.filter(r=>r!==pending).slice(0,3).map(r=><p key={r.id} className="sub" style={{ marginTop:8 }}>
        <Status tone={requestStatus[r.status][1]}>{requestStatus[r.status][0]}</Status> {r.schoolName} · {monthYear(r.createdAt)}{r.decisionReason?` · «${r.decisionReason}»`:''}
      </p>)}
    </div>}
  </section>;
}

/** Delegatinvitasjoner og egen CV (§8). Offentlige verv står i seksjonen over, så de gjentas ikke her. */
function CvSection({userId}:{userId:string}) {
  const service = useService();
  const { go, notify } = useApp();
  const [cv,setCv] = useState<PersonCv|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    let cancelled = false;
    service.getPersonCv(userId).then(c=>{ if (!cancelled) { setCv(c); setError(''); } }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,userId,version]);
  const respond = async(delegateId:string,accept:boolean)=>{
    setBusy(true); setError('');
    try { await service.respondToDelegation({ delegateId, accept }); notify(accept?'Du har bekreftet at du kommer':'Du har takket nei'); setVersion(v=>v+1); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!!cv?.invitations.length&&<section className="section-card warm">
      <h2>Du er meldt på som delegat</h2>
      <div className="list" style={{ gap:10 }}>{cv.invitations.map(i=><div className="row-card wrap" key={i.delegateId}>
        <span className="grow"><button className="name-link" onClick={()=>go({ view:'event', id:i.eventId })}>{i.title}</button><small>{formatDate(i.startsAt)} · for {i.organizationName} · {delegateStatusLabel[i.status]}</small></span>
        {i.status!=='confirmed'&&<button className="btn small primary" disabled={busy} onClick={()=>void respond(i.delegateId,true)}>Jeg kommer</button>}
        <button className="btn small" disabled={busy} onClick={()=>void respond(i.delegateId,false)}>Kan ikke</button>
      </div>)}</div>
    </section>}
    {cv&&<PersonCvSections cv={cv} showOffices={false}/>}
    {cv&&<div className="actions"><button className="btn ghost" onClick={()=>go({ view:'person', id:userId })}>Se CV-en slik andre ser den</button></div>}
  </>;
}
