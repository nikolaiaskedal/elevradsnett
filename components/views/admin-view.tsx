import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { HandoverPanel } from '@/components/shared/handover-panel';
import { Avatar, ConfirmButton, Status } from '@/components/shared/ui';
import { auditActionLabel, initialsOf, kindLabel, officeSuggestions, roleLabel } from '@/lib/domain/labels';
import { formatDate, formatRelative } from '@/lib/domain/time';
import type { AdminOrganization, AssignablePerson, AuditEntry, FriendConnection, InternalRole, OrganizationRoleEntry, SchoolAdminRequest } from '@/lib/domain/types';
import type { AdminDashboard, AdminUser, MfaStatus, ModerationAction, ModerationReport, TotpEnrollment } from '@/lib/domain/admin';
import { errorMessage, OFFICE_TITLE_MAX_LENGTH, REQUEST_TEXT_MAX_LENGTH } from '@/lib/domain/validation';

// Administrasjonen viser bare det serveren svarer: hvilke organisasjoner brukeren administrerer, og hvilke
// rettigheter som kan tildeles der. Oversikt, Roller og verv, Forespørsler og Venneråd er koblet til tjenestelaget.
// Styreoverføring og resten av adminpanelet er koblet til tjenestelaget. CSV kommer i prompt 13.

type Notify = (text:string)=>void;
type LoadResult<T> = { data:T|null; error:string; refresh:()=>void };
const adminTabs = [['overview','Oversikt'],['users','Brukere'],['roles','Roller og verv'],['requests','Forespørsler'],['friends','Venneråd'],['handover','Styreoverføring'],['schools','Organisasjoner'],['content','Innhold'],['media','Medier'],['moderation','Moderering'],['import','CSV']] as const;
type AdminTab = typeof adminTabs[number][0];

/** Henter data på nytt når nøkkelen endres. Feil vises i stedet for dataene. */
function useLoad<T>(load:()=>Promise<T>,key:string):LoadResult<T> {
  const [state,setState] = useState<{ key:string; data:T|null; error:string }>({ key:'', data:null, error:'' });
  const [version,setVersion] = useState(0);
  // load lages på nytt ved hver visning, så den leses fra en ref. Nøkkelen og versjonen bestemmer når det hentes.
  const loader = useRef(load);
  useEffect(()=>{ loader.current = load; });
  useEffect(()=>{
    let cancelled = false;
    loader.current().then(data=>{ if (!cancelled) setState({ key, data, error:'' }); }).catch(e=>{ if (!cancelled) setState({ key, data:null, error:errorMessage(e) }); });
    return ()=>{ cancelled = true; };
  },[key,version]);
  const current = state.key===key;
  return { data:current?state.data:null, error:current?state.error:'', refresh:()=>setVersion(v=>v+1) };
}

export function AdminView(){
  const service = useService();
  const { notify, go } = useApp();
  const mfa = useLoad(()=>service.getMfaStatus(),'mfa');
  const orgs = useLoad(()=>service.listAdminOrganizations(),'orgs');
  const requests = useLoad(()=>service.listSchoolAdminRequests(),'requests');
  const [orgId,setOrgId] = useState('');
  const [tab,setTab] = useState<AdminTab>('overview');
  const currentOrgId=orgId||orgs.data?.[0]?.id||'';
  const dashboard = useLoad(()=>currentOrgId?service.getAdminDashboard(currentOrgId):Promise.resolve(null as unknown as AdminDashboard),`dashboard:${currentOrgId}`);
  if (mfa.error) return <div className="page narrow"><h1>Administrasjon</h1><p className="form-error" role="alert">{mfa.error}</p><button className="btn" onClick={mfa.refresh}>Prøv igjen</button></div>;
  if (!mfa.data) return <div className="page narrow"><h1>Administrasjon</h1><p className="muted">Kontrollerer sikkerheten …</p></div>;
  if (mfa.data.required&&!mfa.data.verified) return <MfaGate status={mfa.data} onDone={()=>{ mfa.refresh(); orgs.refresh(); }} />;
  if (orgs.error) return <div className="page narrow"><h1>Administrasjon</h1><p className="form-error" role="alert">{orgs.error}</p><button className="btn" onClick={orgs.refresh}>Prøv igjen</button></div>;
  if (!orgs.data) return <div className="page narrow"><h1>Administrasjon</h1><p className="muted">Henter organisasjonene du administrerer …</p></div>;
  if (!orgs.data.length) return <div className="page narrow">
    <h1>Administrasjon</h1>
    <p className="muted" style={{ lineHeight:1.6 }}>Du har ingen administratorrettigheter. Skoleadministrator eller styreadministrator i elevrådet eller styret ditt kan gi deg det, eller du kan be styret om å bli skoleadministrator for skolen din.</p>
    <div className="actions"><button className="btn" onClick={()=>go({ view:'profile' })}>Gå til Verv og rettigheter</button></div>
  </div>;
  const org = orgs.data.find(o=>o.id===orgId) ?? orgs.data[0];
  const decidable = (requests.data ?? []).filter(r=>r.canDecide);
  // Venneråd styres av skoleadministrator (eller superadministrator), slik serveren har oppgitt rollen.
  const tabs = adminTabs.filter(([id])=>id!=='friends' || (org.type==='school' && org.myRole!=='board_admin'));
  const shownTab:AdminTab = tabs.some(([id])=>id===tab)?tab:'overview';
  return <div className="page">
    <div className="page-head split">
      <div className="grow"><h1>Administrasjon</h1><p className="muted">Rettigheter kontrolleres på nytt for hver serveroperasjon.</p></div>
      <Status tone="green">{roleLabel[org.myRole]}{org.myRole==='board_admin'&&org.type==='school'?' i området':''}</Status>
    </div>
    <OrganizationPicker orgs={orgs.data} value={org.id} onChange={setOrgId}/>
    {org.status!=='active'&&<p className="warn-box">{org.name} er deaktivert. Verv, innlegg og historikk er bevart, men ingen kan opptre på vegne av organisasjonen.</p>}
    <div className="segmented wide" role="tablist" aria-label="Administrasjon">
      {tabs.map(([id,label])=><button key={id} role="tab" id={`tab-${id}`} aria-selected={shownTab===id} aria-controls={`panel-${id}`} className={shownTab===id?'on':''} onClick={()=>setTab(id)}>
        {label}{id==='requests'&&decidable.length?<span className="nav-count" aria-label={`${decidable.length} venter`}>{decidable.length}</span>:null}
      </button>)}
    </div>
    <div role="tabpanel" id={`panel-${shownTab}`} aria-labelledby={`tab-${shownTab}`} className="stack">
      {shownTab==='overview'?<Overview key={org.id} org={org} pending={decidable.length} dashboard={dashboard} onTab={setTab}/>
      :shownTab==='users'?<Users dashboard={dashboard} org={org} onNotify={notify}/>
      :shownTab==='roles'?<Roles key={org.id} org={org} onNotify={notify}/>
      :shownTab==='requests'?<Requests requests={requests.data} error={requests.error} onChanged={()=>{ requests.refresh(); orgs.refresh(); }} onNotify={notify}/>
      :shownTab==='friends'?<Friends key={org.id} org={org} onNotify={notify}/>
      :shownTab==='handover'?<HandoverPanel key={org.id} org={org} onNotify={notify}/>:shownTab==='schools'?<Schools dashboard={dashboard} org={org} onNotify={notify}/>
      :shownTab==='content'?<Content dashboard={dashboard}/>:shownTab==='media'?<Media dashboard={dashboard} org={org} onNotify={notify}/>
      :shownTab==='moderation'?<Moderation org={org} onNotify={notify}/>:<CsvImport onNotify={notify}/>}
    </div>
  </div>;
}

/** Velger organisasjon blant dem serveren sier brukeren administrerer. Med mange (styre og superadministrator) kan listen filtreres. */
function OrganizationPicker({orgs,value,onChange}:{orgs:AdminOrganization[];value:string;onChange:(id:string)=>void}){
  const [filter,setFilter] = useState('');
  const shown = useMemo(()=>{
    const q = filter.trim().toLowerCase();
    const list = q?orgs.filter(o=>`${o.name} ${o.county}`.toLowerCase().includes(q)):orgs;
    return list.some(o=>o.id===value)?list:[...orgs.filter(o=>o.id===value),...list];
  },[orgs,filter,value]);
  if (orgs.length===1) return <p className="admin-org"><strong>{orgs[0].name}</strong> · {kindLabel[orgs[0].type]}, {orgs[0].county}</p>;
  return <div className="admin-picker">
    {orgs.length>8&&<label className="field"><span>Søk i organisasjonene</span><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Navn eller fylke"/></label>}
    <label className="field"><span>Organisasjon</span>
      <select value={value} onChange={e=>onChange(e.target.value)}>
        {shown.map(o=><option key={o.id} value={o.id}>{o.name} · {kindLabel[o.type]}{o.type==='national'?'':`, ${o.county}`}{o.status!=='active'?' (deaktivert)':''}</option>)}
      </select>
    </label>
  </div>;
}

function Overview({org,pending,dashboard,onTab}:{org:AdminOrganization;pending:number;dashboard:LoadResult<AdminDashboard>;onTab:(tab:AdminTab)=>void}){
  const service = useService();
  const roles = useLoad(()=>service.listOrganizationRoles(org.id),`roles:${org.id}`);
  const audit = useLoad(()=>service.listAuditLog(org.id),`audit:${org.id}`);
  const active = (roles.data ?? []).filter(r=>r.status==='active');
  const stats=dashboard.data?.stats;
  const metrics:[string,string,string][] = [
    [stats?String(stats.activeUsers):'–','Aktive brukere','I eget område'],
    [stats?String(stats.activeSchools):'–','Aktive skoler','I eget område'],
    [stats?String(stats.publishedPosts):'–','Publiserte innlegg','Aggregert, uten meldingsinnhold'],
    [stats?String(stats.openModerationCases):'–','Modereringssaker','Åpne eller påklaget'],
    [roles.data?String(active.filter(r=>r.kind==='office').length):'–','Aktive verv','I valgt organisasjon'],
    [String(pending),'Forespørsler','Venter på deg'],
  ];
  return <>
    {dashboard.error&&<p className="form-error" role="alert">{dashboard.error}</p>}
    <div className="metric-grid">{metrics.map(([n,l,s])=><div className="card metric" key={l}><strong>{n}</strong><span>{l}</span><small>{s}</small></div>)}</div>
    {!!pending&&<div className="row-card"><Status tone="coral">Viktig</Status><span className="grow"><strong>{pending===1?'Én forespørsel':`${pending} forespørsler`} om å bli skoleadministrator</strong><small>Skolene i området venter på svar</small></span><button className="btn small" onClick={()=>onTab('requests')}>Behandle</button></div>}
    <section className="card">
      <div className="card-head"><div><h2>Revisjonslogg</h2><p className="muted">Alle endringer av verv, rettigheter, forespørsler, innlegg og venneråd i {org.name}.</p></div></div>
      {audit.error&&<p className="form-error" role="alert">{audit.error}</p>}
      {!audit.data&&!audit.error&&<p className="muted">Henter …</p>}
      {audit.data&&!audit.data.length&&<p className="empty-note">Ingen endringer registrert ennå.</p>}
      {!!audit.data?.length&&<div className="list">{audit.data.map(a=><AuditRow key={a.id} entry={a}/>)}</div>}
    </section>
  </>;
}

function MfaGate({status,onDone}:{status:MfaStatus;onDone:()=>void}){
  const service=useService(); const [enrollment,setEnrollment]=useState<TotpEnrollment|null>(null); const [code,setCode]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{ setBusy(true);setError('');try{ const factorId=enrollment?.factorId??status.factorId;if(!factorId){setEnrollment(await service.enrollTotp());return;}await (enrollment?service.verifyTotp({factorId,code}):service.challengeTotp({factorId,code}));onDone();}catch(e){setError(errorMessage(e));}finally{setBusy(false);} };
  return <div className="page narrow"><h1>Bekreft administratorinnlogging</h1><section className="card stack"><Status tone="coral">Påkrevd for superadministrator</Status><p>Bruk en autentiseringsapp for å beskytte administrasjonen. Superadministratorrettigheter er sperret på serveren til denne økten har tofaktorinnlogging.</p>
    {enrollment&&<div className="mfa-enrollment">{enrollment.qrCode.startsWith('data:')&&<img src={enrollment.qrCode} alt="QR-kode til autentiseringsappen"/>}<p><strong>Oppsettsnøkkel:</strong> <code>{enrollment.secret}</code></p></div>}
    {(status.enrolled||enrollment)&&<label className="field"><span>Sekssifret kode</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="btn primary" disabled={busy} onClick={()=>void submit()}>{!status.enrolled&&!enrollment?'Koble til autentiseringsapp':'Bekreft kode'}</button></section></div>;
}

function AuditRow({entry}:{entry:AuditEntry}){
  const detail = typeof entry.details.title==='string'?entry.details.title:typeof entry.details.role==='string'?roleLabel[entry.details.role as InternalRole] ?? entry.details.role
    :typeof entry.details.school_name==='string'?entry.details.school_name:typeof entry.details.excerpt==='string'?entry.details.excerpt:'';
  return <div className="audit-row"><span aria-hidden="true"/><div>
    <strong>{entry.actorName || 'Systemet'} {auditActionLabel[entry.action] ?? entry.action}{detail?` «${detail}»`:''}{entry.subjectName&&entry.subjectName!==entry.actorName?` · ${entry.subjectName}`:''}</strong>
    <small>{formatRelative(entry.createdAt)}</small>
  </div></div>;
}

function Roles({org,onNotify}:{org:AdminOrganization;onNotify:Notify}){
  const service = useService();
  const { reload } = useApp();
  const roles = useLoad(()=>service.listOrganizationRoles(org.id),`roles:${org.id}`);
  const [adding,setAdding] = useState<'office'|'role'|null>(null);
  const [showHistory,setShowHistory] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const act = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); onNotify(done); roles.refresh(); reload(); return true; }
    catch (e) { setError(errorMessage(e)); return false; }
    finally { setBusy(false); }
  };
  const list = roles.data ?? [];
  const offices = list.filter(r=>r.kind==='office' && r.status==='active');
  const grants = list.filter(r=>r.kind==='role' && r.status==='active');
  const history = list.filter(r=>r.status!=='active');
  const usable = org.status==='active';
  return <>
    <section className="card">
      <div className="card-head">
        <div><h2>Offentlige verv</h2><p className="muted">Vises på profilen og på organisasjonssiden. Et verv gir rett til å kommentere og stemme for {org.name}.</p></div>
        {usable&&<button className="link" onClick={()=>setAdding(adding==='office'?null:'office')} aria-expanded={adding==='office'}>+ Gi verv</button>}
      </div>
      {adding==='office'&&<AssignForm org={org} mode="office" busy={busy} onCancel={()=>setAdding(null)}
        onSubmit={(person,value)=>act(()=>service.assignPublicOffice({ organizationId:org.id, userId:person.id, title:value }),`${person.name} er nå ${value.toLowerCase()}`).then(ok=>{ if (ok) setAdding(null); })}/>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {roles.error&&<p className="form-error" role="alert">{roles.error}</p>}
      {!roles.data&&!roles.error&&<p className="muted">Henter …</p>}
      {roles.data&&(offices.length?<div className="list">{offices.map(r=><RoleRow key={r.id} entry={r} busy={busy}
        onEnd={()=>void act(()=>service.endPublicOffice(r.id),'Vervet er avsluttet')}/>)}</div>:<p className="empty-note">Ingen aktive verv.</p>)}
    </section>
    <section className="card">
      <div className="card-head">
        <div><h2>Interne rettigheter</h2><p className="muted">Styrer hvem som kan publisere og administrere. Vises ikke offentlig; innholdsansvarlig ser bare administratorer og personen selv.</p></div>
        {usable&&!!org.grantableRoles.length&&<button className="link" onClick={()=>setAdding(adding==='role'?null:'role')} aria-expanded={adding==='role'}>+ Gi rettighet</button>}
      </div>
      {adding==='role'&&<AssignForm org={org} mode="role" busy={busy} onCancel={()=>setAdding(null)}
        onSubmit={(person,value)=>act(()=>service.assignRole({ organizationId:org.id, userId:person.id, role:value as InternalRole }),`${person.name} er nå ${roleLabel[value as InternalRole].toLowerCase()}`).then(ok=>{ if (ok) setAdding(null); })}/>}
      {roles.data&&(grants.length?<div className="list">{grants.map(r=><RoleRow key={r.id} entry={r} busy={busy}
        onEnd={()=>void act(()=>service.revokeRole(r.id),'Rettigheten er fjernet')}/>)}</div>:<p className="empty-note">Ingen har interne rettigheter. Uten skoleadministrator kan styreadministrator i området gi rollen.</p>)}
      <p className="muted" style={{ lineHeight:1.5 }}>Ingen kan gi seg selv rettigheter, og den siste administratoren kan ikke fjernes før en etterfølger har fått rollen.</p>
    </section>
    {!!history.length&&<section className="card">
      <div className="card-head"><div><h2>Historikk</h2><p className="muted">Avsluttede verv og rettigheter blir stående med sluttdato.</p></div>
        <button className="link" aria-expanded={showHistory} onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Skjul':`Vis ${history.length}`}</button></div>
      {showHistory&&<div className="list">{history.map(r=><RoleRow key={r.id} entry={r} busy={busy}/>)}</div>}
    </section>}
  </>;
}

const statusLabel:Record<OrganizationRoleEntry['status'],string> = { active:'Aktiv', invited:'Invitert', ended:'Avsluttet', revoked:'Fjernet' };

function RoleRow({entry,busy,onEnd}:{entry:OrganizationRoleEntry;busy:boolean;onEnd?:()=>void}){
  const what = entry.kind==='office'?entry.title || 'Medlem':entry.role?roleLabel[entry.role]:'';
  const since = `${formatDate(entry.startDate)}${entry.endDate?` – ${formatDate(entry.endDate)}`:''}`;
  return <div className="row-card role-row">
    <Avatar size="sm" tone="pale" initials={initialsOf(entry.userName)}/>
    <span className="grow"><strong>{entry.userName}</strong><small>{what} · {since}{entry.grantedByName?` · gitt av ${entry.grantedByName}`:''}</small></span>
    {!entry.userActive&&<Status tone="gray">Deaktivert bruker</Status>}
    {entry.status!=='active'&&<Status tone="gray">{statusLabel[entry.status]}</Status>}
    {entry.status==='active'&&onEnd&&entry.canChange&&<ConfirmButton label={entry.kind==='office'?'Avslutt':'Fjern'} confirmLabel={entry.kind==='office'?'Avslutt verv':'Fjern rettighet'}
      question={`${entry.kind==='office'?'Avslutte':'Fjerne'} ${what.toLowerCase()} for ${entry.userName}?`} disabled={busy} onConfirm={onEnd}/>}
  </div>;
}

/** Velg person og verv eller rettighet. Personsøket viser bare dem serveren lar administratoren velge. */
function AssignForm({org,mode,busy,onSubmit,onCancel}:{org:AdminOrganization;mode:'office'|'role';busy:boolean;onSubmit:(person:AssignablePerson,value:string)=>void;onCancel:()=>void}){
  const service = useService();
  const [query,setQuery] = useState('');
  const [hits,setHits] = useState<AssignablePerson[]|null>(null);
  const [person,setPerson] = useState<AssignablePerson|null>(null);
  const [value,setValue] = useState(mode==='role'?org.grantableRoles.find(r=>r==='content_manager') ?? org.grantableRoles[0] ?? '':'');
  const [error,setError] = useState('');
  useEffect(()=>{
    let cancelled = false;
    const timer = window.setTimeout(()=>{
      service.searchAssignablePeople({ organizationId:org.id, query })
        .then(list=>{ if (!cancelled) { setHits(list); setError(''); } })
        .catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    },200);
    return ()=>{ cancelled = true; window.clearTimeout(timer); };
  },[service,org.id,query]);
  const listId = `office-suggestions-${org.id}`;
  return <form className="assign-form" onSubmit={e=>{ e.preventDefault(); if (!person) { setError('Velg en person.'); return; } if (!value.trim()) { setError(mode==='office'?'Skriv inn vervet.':'Velg en rettighet.'); return; } onSubmit(person,value.trim()); }}>
    <label className="field"><span>Person</span>
      <input value={query} onChange={e=>{ setQuery(e.target.value); setPerson(null); }} placeholder={org.type==='school'?'Søk blant elevene ved skolen':'Søk etter navn'} autoComplete="off"/>
      <small>{org.type==='school'?'Bare elever som har valgt denne skolen, vises.':org.type==='national'?'Alle med aktiv profil kan velges.':'Elever ved skolene i området og dem som allerede har verv her.'}</small>
    </label>
    <div className="hits" role="group" aria-label="Personer">
      {(hits ?? []).map(p=><button type="button" key={p.id} className={`hit ${person?.id===p.id?'on':''}`} aria-pressed={person?.id===p.id} onClick={()=>setPerson(p)}>
        <Avatar size="sm" tone="pale" initials={initialsOf(p.name)}/>
        <span className="grow"><span className="name">{p.name}</span><span className="sub">{p.schoolName ?? 'Ingen skole'}</span></span>
        {person?.id===p.id&&<span className="tick" aria-hidden="true">✓</span>}
      </button>)}
      {hits&&!hits.length&&<p className="empty-note">Fant ingen. Personen må ha logget inn og valgt skole først.</p>}
    </div>
    {mode==='office'
      ?<label className="field"><span>Verv</span><input value={value} onChange={e=>setValue(e.target.value)} list={listId} maxLength={OFFICE_TITLE_MAX_LENGTH} placeholder={officeSuggestions[org.type][0]}/>
        <datalist id={listId}>{officeSuggestions[org.type].map(t=><option key={t} value={t}>{t}</option>)}</datalist></label>
      :<label className="field"><span>Rettighet</span><select value={value} onChange={e=>setValue(e.target.value)}>{org.grantableRoles.map(r=><option key={r} value={r}>{roleLabel[r]}</option>)}</select>
        <small>{value==='content_manager'?'Kan publisere, redigere og slette innlegg, og moderere kommentarer. Kan ikke tildele roller.':value==='school_admin'?'Kan administrere skolens side, gi verv og rettigheter og gjennomføre styreoverføring.':value==='board_admin'?'Administrerer styret og har myndighet over skolene i området.':'Full tilgang til hele Elevrådsnett.'}</small></label>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="actions"><button className="btn primary" disabled={busy}>{mode==='office'?'Gi verv':'Gi rettighet'}{person?` til ${person.name}`:''}</button><button type="button" className="btn" onClick={onCancel}>Avbryt</button></div>
  </form>;
}

function Requests({requests,error,onChanged,onNotify}:{requests:SchoolAdminRequest[]|null;error:string;onChanged:()=>void;onNotify:Notify}){
  const service = useService();
  const [busy,setBusy] = useState(false);
  const [failure,setFailure] = useState('');
  const [reasons,setReasons] = useState<Record<string,string>>({});
  const decide = async(r:SchoolAdminRequest,approve:boolean)=>{
    setBusy(true); setFailure('');
    try {
      await service.decideSchoolAdminRequest({ requestId:r.id, approve, reason:reasons[r.id]?.trim() || undefined });
      onNotify(approve?`${r.userName} er nå skoleadministrator for ${r.schoolName}`:'Forespørselen er avslått');
      onChanged();
    } catch (e) { setFailure(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const open = (requests ?? []).filter(r=>r.canDecide);
  return <section className="card">
    <div className="card-head"><div><h2>Forespørsler om å bli skoleadministrator</h2><p className="muted">Elever kan be om å bli administrator for egen skole. Styreadministrator i lokallaget eller fylket avgjør. Ingen kan godkjenne seg selv.</p></div></div>
    {(error || failure)&&<p className="form-error" role="alert">{error || failure}</p>}
    {!requests&&!error&&<p className="muted">Henter …</p>}
    {requests&&!open.length&&<p className="empty-note">Ingen forespørsler venter på deg.</p>}
    <div className="list">{open.map(r=><div className="request-row" key={r.id}>
      <div className="row-card">
        <Avatar size="sm" tone="pale" initials={initialsOf(r.userName)}/>
        <span className="grow"><strong>{r.userName}</strong><small>{r.schoolName} · {formatRelative(r.createdAt)}</small></span>
      </div>
      {r.message&&<p className="request-message">«{r.message}»</p>}
      <label className="field"><span>Begrunnelse (valgfritt)</span><input value={reasons[r.id] ?? ''} maxLength={REQUEST_TEXT_MAX_LENGTH} onChange={e=>setReasons(all=>({ ...all, [r.id]:e.target.value }))} placeholder="F.eks. bekreftet med rektor"/></label>
      <div className="actions"><button className="btn primary" disabled={busy} onClick={()=>void decide(r,true)}>Godkjenn</button><button className="btn" disabled={busy} onClick={()=>void decide(r,false)}>Avslå</button></div>
    </div>)}</div>
  </section>;
}

/** Venneråd (§7): gjensidig godkjente forbindelser mellom skoler. Innlegg til «Venneråd» når elevene ved vennerådene. */
function Friends({org,onNotify}:{org:AdminOrganization;onNotify:Notify}){
  const service = useService();
  const { organizations } = useApp();
  const connections = useLoad(()=>service.listFriendConnections(org.id),`friends:${org.id}`);
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const act = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); onNotify(done); connections.refresh(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const list = connections.data ?? [];
  const incoming = list.filter(c=>c.status==='pending' && c.direction==='incoming');
  const outgoing = list.filter(c=>c.status==='pending' && c.direction==='outgoing');
  const accepted = list.filter(c=>c.status==='accepted');
  const taken = new Set(list.map(c=>c.schoolId));
  const q = query.trim().toLowerCase();
  const hits = q.length<2?[]:organizations.filter(o=>o.type==='school' && o.status==='active' && o.id!==org.id && !taken.has(o.id)
    && `${o.name} ${o.schoolName ?? ''} ${o.county}`.toLowerCase().includes(q)).slice(0,8);
  const row = (c:FriendConnection,actions:React.ReactNode)=><div className="row-card" key={c.id}>
    <Avatar size="sm" tone="pale" initials={initialsOf(c.schoolName)}/>
    <span className="grow"><strong>{c.schoolName}</strong><small>{c.county} · {c.status==='accepted'?`venneråd siden ${formatDate(c.approvedAt ?? c.createdAt)}`:`sendt ${formatRelative(c.createdAt)}`}</small></span>
    {actions}
  </div>;
  return <>
    <section className="card">
      <div className="card-head"><div><h2>Venneråd</h2><p className="muted">Venneråd er en forbindelse begge skolene har godkjent. Innlegg {org.name} sender til «Venneråd», vises for elevene ved disse skolene.</p></div></div>
      {(connections.error || error)&&<p className="form-error" role="alert">{connections.error || error}</p>}
      {!connections.data&&!connections.error&&<p className="muted">Henter …</p>}
      {!!incoming.length&&<><h3 className="sub-head">Forespørsler til {org.name}</h3><div className="list">{incoming.map(c=>row(c,c.canDecide&&<span className="actions">
        <button className="btn small primary" disabled={busy} onClick={()=>void act(()=>service.decideFriendRequest({ connectionId:c.id, accept:true }),`${c.schoolName} er nå venneråd`)}>Godta</button>
        <button className="btn small" disabled={busy} onClick={()=>void act(()=>service.decideFriendRequest({ connectionId:c.id, accept:false }),'Forespørselen er avslått')}>Avslå</button>
      </span>))}</div></>}
      {connections.data&&(accepted.length?<div className="list">{accepted.map(c=>row(c,<ConfirmButton label="Avslutt" question={`Avslutte venneråd med ${c.schoolName}?`} confirmLabel="Avslutt venneråd" disabled={busy}
        onConfirm={()=>void act(()=>service.endFriendConnection(c.id),'Vennerådet er avsluttet')}/>))}</div>
        :<p className="empty-note">{org.name} har ingen venneråd ennå.</p>)}
      {!!outgoing.length&&<><h3 className="sub-head">Sendte forespørsler</h3><div className="list">{outgoing.map(c=>row(c,<button className="btn small" disabled={busy}
        onClick={()=>void act(()=>service.endFriendConnection(c.id),'Forespørselen er trukket tilbake')}>Trekk tilbake</button>))}</div></>}
    </section>
    {org.status==='active'&&<section className="card">
      <div className="card-head"><div><h2>Be om venneråd</h2><p className="muted">Skolen dere spør må godta før forbindelsen gjelder.</p></div></div>
      <label className="field"><span>Søk etter skole</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Navn eller fylke" autoComplete="off"/></label>
      <div className="friend-hits">
        {hits.map(o=><div className="row-card" key={o.id}>
          <Avatar size="sm" tone="pale" initials={o.initials}/>
          <span className="grow"><strong>{o.name}</strong><small>{o.county}</small></span>
          <button className="btn small" disabled={busy} onClick={()=>void act(()=>service.requestFriendSchool({ schoolId:org.id, targetSchoolId:o.id }),`Forespørselen er sendt til ${o.name}`).then(()=>setQuery(''))}>Send forespørsel</button>
        </div>)}
        {q.length>=2&&!hits.length&&<p className="empty-note">Fant ingen skoler som kan bli venneråd.</p>}
      </div>
    </section>}
  </>;
}

function Table({head,rows}:{head:string[];rows:React.ReactNode[][]}){
  return <div className="table" role="table"><div className="table-row head" role="row">{head.map(h=><span role="columnheader" key={h}>{h}</span>)}</div>{rows.map((r,i)=><div className="table-row" role="row" key={i}>{r.map((c,j)=><span role="cell" key={j}>{c}</span>)}</div>)}</div>;
}

function DashboardState({dashboard}:{dashboard:LoadResult<AdminDashboard>}){
  if (dashboard.error) return <p className="form-error" role="alert">{dashboard.error}</p>;
  if (!dashboard.data) return <p className="muted">Henter …</p>;
  return null;
}

function Users({dashboard,org,onNotify}:{dashboard:LoadResult<AdminDashboard>;org:AdminOrganization;onNotify:Notify}){
  const service=useService(); const [selected,setSelected]=useState<AdminUser|null>(null); const [action,setAction]=useState<'change_school'|'deactivate'|'delete'|'restore'>('change_school'); const [schoolId,setSchoolId]=useState(''); const [reason,setReason]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{if(!selected)return;setBusy(true);setError('');try{await service.manageAdminUser({scopeId:org.id,userId:selected.id,action,schoolId:action==='change_school'?schoolId:undefined,reason});onNotify('Brukeren er oppdatert');setSelected(null);setReason('');dashboard.refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <section className="card"><div className="card-head"><div><h2>Brukeradministrasjon</h2><p className="muted">Bytt skole, deaktiver, reaktiver eller slett personopplysninger. Historiske bidrag og revisjon beholdes.</p></div></div><DashboardState dashboard={dashboard}/>
    {!!dashboard.data?.users.length&&<div className="list">{dashboard.data.users.map(user=><div className="row-card" key={user.id}><Avatar size="sm" tone="pale" initials={initialsOf(user.name)}/><span className="grow"><strong>{user.name}</strong><small>{user.schoolName||'Ingen skole'}</small></span><Status tone={user.status==='active'?'green':'gray'}>{user.status==='active'?'Aktiv':'Deaktivert'}</Status><button className="btn small" onClick={()=>{setSelected(user);setAction(user.status==='active'?'change_school':'restore');setSchoolId(user.schoolId??'');}}>Administrer</button></div>)}</div>}
    {dashboard.data&&!dashboard.data.users.length&&<p className="empty-note">Ingen brukere i dette området.</p>}
    {selected&&<div className="admin-action"><h3>{selected.name}</h3><label className="field"><span>Handling</span><select value={action} onChange={e=>setAction(e.target.value as typeof action)}><option value="change_school">Bytt skole</option><option value="deactivate">Deaktiver</option>{selected.status!=='active'&&!selected.deactivatedByUser&&<option value="restore">Reaktiver</option>}<option value="delete">Slett personopplysninger</option></select></label>{action==='change_school'&&<label className="field"><span>Ny skole</span><select value={schoolId} onChange={e=>setSchoolId(e.target.value)}>{dashboard.data?.schools.filter(s=>s.status==='active').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}<label className="field"><span>Begrunnelse</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>{selected.deactivatedByUser&&<p className="warn-box">Brukeren deaktiverte profilen selv og kan ikke reaktiveres uten samtykke.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="actions"><button className="btn ghost" onClick={()=>setSelected(null)}>Avbryt</button><button className="btn primary" disabled={busy||reason.trim().length<3} onClick={()=>void submit()}>Utfør</button></div></div>}
  </section>;
}

function Schools({dashboard,org,onNotify}:{dashboard:LoadResult<AdminDashboard>;org:AdminOrganization;onNotify:Notify}){
  const service=useService();const [selected,setSelected]=useState<string|null>(null);const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const school=dashboard.data?.schools.find(s=>s.id===selected); const submit=async()=>{if(!school)return;setBusy(true);setError('');try{await service.setOrganizationStatus({scopeId:org.id,organizationId:school.id,status:school.status==='active'?'deactivated':'active',reason});onNotify(school.status==='active'?'Skolen er deaktivert':'Skolen er reaktivert');setSelected(null);setReason('');dashboard.refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <section className="card"><div className="card-head"><div><h2>Organisasjonsadministrasjon</h2><p className="muted">Deaktivering bevarer innlegg, verv og arrangementhistorikk.</p></div></div><DashboardState dashboard={dashboard}/>{dashboard.data&&<Table head={['Skole','Lokallag','Administratorer','Status']} rows={dashboard.data.schools.map(s=>[<button className="link" key="n" onClick={()=>setSelected(s.id)}>{s.name}</button>,s.localBoardName,String(s.administratorCount),<Status key="s" tone={s.status==='active'?'green':'gray'}>{s.status==='active'?'Aktiv':'Deaktivert'}</Status>])}/>} {school&&<div className="admin-action"><h3>{school.status==='active'?'Deaktiver':'Reaktiver'} {school.name}</h3><label className="field"><span>Begrunnelse</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>{error&&<p className="form-error">{error}</p>}<div className="actions"><button className="btn ghost" onClick={()=>setSelected(null)}>Avbryt</button><button className="btn primary" disabled={busy||reason.trim().length<3} onClick={()=>void submit()}>Bekreft</button></div></div>}</section>;
}

function Content({dashboard}:{dashboard:LoadResult<AdminDashboard>}){
  return <section className="card"><div className="card-head"><div><h2>Innhold</h2><p className="muted">Innlegg, kommentarer og arrangementer i eget område. Modereringshandlinger gjøres i modereringskøen.</p></div></div><DashboardState dashboard={dashboard}/><div className="list">{dashboard.data?.content.slice(0,100).map(item=><div className="row-card" key={`${item.type}-${item.id}`}><Status tone="gray">{{post:'Innlegg',comment:'Kommentar',event:'Arrangement'}[item.type]}</Status><span className="grow"><strong>{item.title}</strong><small>{item.organizationName} · {item.status}</small></span></div>)}</div></section>;
}

function Media({dashboard,org,onNotify}:{dashboard:LoadResult<AdminDashboard>;org:AdminOrganization;onNotify:Notify}){
  const service=useService();const [profile,setProfile]=useState('');const [cover,setCover]=useState('');const [locked,setLocked]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{if(dashboard.data){setProfile(dashboard.data.images.defaultProfilePath??'');setCover(dashboard.data.images.defaultCoverPath??'');setLocked(dashboard.data.images.locked);}},[dashboard.data]);
  const act=async(work:()=>Promise<unknown>,message:string)=>{setBusy(true);setError('');try{await work();onNotify(message);dashboard.refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <><section className="card"><div className="card-head"><div><h2>Standardbilder</h2><p className="muted">Egne bilder overstyrer arvede standarder. Bare superadministrator kan låse et arvet bilde.</p></div></div><DashboardState dashboard={dashboard}/>{dashboard.data&&<><div className="image-source-grid"><p><strong>Profilbilde</strong><small>{dashboard.data.images.profile.sourceName}</small></p><p><strong>Coverbilde</strong><small>{dashboard.data.images.cover.sourceName}</small></p></div><label className="field"><span>Sti til standard profilbilde</span><input value={profile} onChange={e=>setProfile(e.target.value)} placeholder="organisasjon/standard-profil.webp"/></label><label className="field"><span>Sti til standard coverbilde</span><input value={cover} onChange={e=>setCover(e.target.value)} placeholder="organisasjon/standard-cover.webp"/></label>{org.myRole==='super_admin'&&<label className="check"><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/> Lås standardbildet for underliggende skoler</label>}<button className="btn primary" disabled={busy} onClick={()=>void act(()=>service.setAdminImages({scopeId:org.id,organizationId:org.id,defaultProfilePath:profile,defaultCoverPath:cover,locked}),'Standardbildene er lagret')}>Lagre bilder</button></>}{error&&<p className="form-error" role="alert">{error}</p>}</section>
    <section className="card"><div className="card-head"><div><h2>Medier og placeholders</h2><p className="muted">Behandlingsstatus og tydelig merkede demoressurser i eget område.</p></div>{org.myRole==='super_admin'&&!!dashboard.data?.placeholders.length&&<ConfirmButton label="Slett alle" question="Slette alle placeholders i dette området?" confirmLabel="Slett alle" disabled={busy} onConfirm={()=>void act(async()=>{const n=await service.deleteAllPlaceholders(org.id);onNotify(`${n} placeholders er slettet`);},'')}/>}</div><div className="list">{dashboard.data?.media.map(m=><div className="row-card" key={`${m.type}-${m.id}`}><Status tone={m.processingStatus==='ready'?'green':m.processingStatus==='failed'?'coral':'gray'}>{m.processingStatus==='ready'?'Klar':m.processingStatus==='failed'?'Feilet':'Behandles'}</Status><span className="grow"><strong>{m.ownerName}</strong><small>{m.path}</small></span>{m.isPlaceholder&&<Status tone="blue">Placeholder</Status>}</div>)}</div>{!!dashboard.data?.placeholders.length&&<><h3 className="sub-head">Placeholders</h3><div className="list">{dashboard.data.placeholders.map(p=><div className="row-card" key={`${p.type}-${p.id}`}><span className="grow"><strong>{p.title}</strong><small>{p.organizationName}</small></span>{org.myRole==='super_admin'&&<ConfirmButton label="Slett" question={`Slette ${p.title}?`} confirmLabel="Slett" disabled={busy} onConfirm={()=>void act(()=>service.deletePlaceholder({scopeId:org.id,type:p.type,id:p.id}),'Placeholderen er slettet')}/>}</div>)}</div></>}</section></>;
}

const moderationLabels:Record<ModerationAction,string>={hide:'Skjul',delete:'Slett',warn:'Advar',restrict:'Begrens midlertidig',deactivate:'Deaktiver',restore:'Gjenopprett',no_action:'Ingen handling'};
function Moderation({org,onNotify}:{org:AdminOrganization;onNotify:Notify}){
  const service=useService();const reports=useLoad(()=>service.listModerationReports(org.id),`moderation:${org.id}`);const [selected,setSelected]=useState<ModerationReport|null>(null);const [action,setAction]=useState<ModerationAction>('hide');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const open=(reports.data??[]).filter(r=>['open','reviewing','appealed'].includes(r.status));
  const submit=async()=>{if(!selected)return;setBusy(true);setError('');try{await service.applyModerationAction({reportId:selected.id,action,reason});onNotify('Modereringssaken er behandlet');setSelected(null);setReason('');reports.refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
  return <section className="card"><div className="card-head"><div><h2>Modereringskø</h2><p className="muted">Private meldinger vises bare når konkret innhold er rapportert. Klager prioriteres for ny vurdering.</p></div><Status tone={open.length?'coral':'green'}>{open.length} åpne</Status></div>{reports.error&&<p className="form-error">{reports.error}</p>}{!reports.data&&!reports.error&&<p className="muted">Henter …</p>}<div className="list">{reports.data?.map(report=><div className="row-card" key={report.id}><Status tone={report.status==='appealed'?'coral':'gray'}>{report.status==='appealed'?'Klage':report.targetType}</Status><span className="grow"><strong>{report.category}</strong><small>{report.targetSummary} · {report.reporterName} · {formatRelative(report.createdAt)}</small></span><button className="btn ghost" onClick={()=>setSelected(report)}>Behandle</button></div>)}</div>{selected&&<div className="admin-action"><h3>{selected.category}</h3><blockquote>{selected.targetSummary}</blockquote>{selected.description&&<p>{selected.description}</p>}{selected.sharedMessageExcerpt&&<p className="note-box"><strong>Delt meldingsinnhold:</strong> {selected.sharedMessageExcerpt}</p>} {!!selected.actions.length&&<div className="list">{selected.actions.map(a=><p key={a.id}><strong>{moderationLabels[a.action]}:</strong> {a.reason}</p>)}</div>}<label className="field"><span>Handling</span><select value={action} onChange={e=>setAction(e.target.value as ModerationAction)}>{Object.entries(moderationLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Begrunnelse</span><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>{error&&<p className="form-error">{error}</p>}<div className="actions"><button className="btn ghost" onClick={()=>setSelected(null)}>Avbryt</button><button className="btn primary" disabled={busy||reason.trim().length<3} onClick={()=>void submit()}>Lagre vurdering</button></div></div>}</section>;
}

function CsvImport({onNotify}:{onNotify:Notify}){
  const [uploaded,setUploaded]=useState(false);
  return <section className="card"><div className="card-head"><div><h2>Import og eksport av skoler</h2><p className="muted">Skoler oppdateres etter stabil ekstern ID, ikke navn.</p></div><button className="link" onClick={()=>onNotify('Tom CSV-mal lastes ned')}>Last ned mal</button></div>
    <button className="upload-zone" onClick={()=>setUploaded(true)}><strong>Last opp UTF-8 CSV</strong><span>Filen valideres uten å endre databasen</span></button>
    {uploaded&&<div className="note-box"><div className="chips"><Status tone="green">24 nye</Status><Status tone="blue">6 endret</Status><Status tone="coral">2 ugyldige</Status></div><p>Forhåndsvisningen er klar. Ugyldige rader må rettes før import.</p><button className="btn primary" onClick={()=>onNotify('Importen krever eksplisitt bekreftelse')}>Gå til bekreftelse</button></div>}
  </section>;
}
