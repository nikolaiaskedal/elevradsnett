import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { prepareAvatar } from '@/components/shared/image';
import { SchoolPicker } from '@/components/shared/login-flow';
import { Avatar, Status } from '@/components/shared/ui';
import type { Representation, SchoolHistoryEntry } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

const systemRoles = ['Elevrådsleder','Elevrådsmedlem','Fylkesstyremedlem','Sentralstyremedlem','Administrator'];
const monthYear = (iso:string)=>new Date(iso).toLocaleDateString('nb-NO',{ month:'long', year:'numeric' });

/** Egen profil. Vises bare innlogget (se elevradsnett-app). */
export function ProfileView({onSwitch}:{onSwitch:(rep:Representation)=>void}) {
  const service = useService();
  const { currentUser, representations, organizations, org, go, activeRep, notify, reload, signOut } = useApp();
  const user = currentUser!;
  const school = user.schoolId?org(user.schoolId):undefined;
  const held = new Set(representations.map(r=>r.publicRole));
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
        {representations.map(rep=>{ const o=org(rep.organizationId); const on=rep.id===activeRep?.id; return <div className={`rep-row ${on?'on':''}`} key={rep.id}>
          <button className="rep-main" onClick={()=>go({ view:'organization', id:rep.organizationId })}>
            <Avatar initials={rep.initials} size="lg" tone={on?'coral':'navy'}/>
            <span className="grow"><span className="rep-name">{rep.name}</span><span className="sub">{rep.publicRole} · {o?.contactEmail ?? o?.county}{rep.canPublish?'':' · kan ikke publisere'}</span></span>
          </button>
          {on?<Status tone="coral">Aktiv</Status>:<button className="btn small" onClick={()=>onSwitch(rep)}>Bruk</button>}
        </div>; })}
      </div>:<p className="muted" style={{ marginTop:4, lineHeight:1.5 }}>Du har ingen verv ennå. Når elevrådet eller et styre gir deg et verv, kan du publisere og kommentere på vegne av det.</p>}
      <p className="chip-label">Roller i systemet</p>
      <div className="chips">
        {systemRoles.map(role=><span key={role} className={`chip ${held.has(role)?'on':''}`}>{role}</span>)}
        {representations.filter(r=>r.type!=='school').map(r=><span key={r.id} className="chip navy">{r.publicRole} i {r.name}</span>)}
      </div>
      <p className="muted" style={{ marginTop:10, lineHeight:1.5 }}>Én representasjon er aktiv om gangen og bestemmer hvem du publiserer og kommenterer som. Meldinger er alltid personlige.</p>
    </section>

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
