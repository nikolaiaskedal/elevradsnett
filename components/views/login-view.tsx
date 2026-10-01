import { useMemo, useState } from 'react';
import { useApp } from '@/components/app-context';
import { schoolPlace } from '@/components/format';
import { useService } from '@/components/service-provider';
import { Avatar, SearchField } from '@/components/shared/ui';
import type { Organization } from '@/lib/domain/types';
import { errorMessage } from '@/lib/domain/validation';

const leaderMonths:[string,number][] = [['Mai',5],['Juni',6],['August',8],['September',9],['Oktober',10],['Januar',1]];

export function LoginView({onFinish}:{onFinish:(name:string,school?:Organization)=>void}) {
  const service = useService();
  const { organizations, notify } = useApp();
  const [step,setStep] = useState(1);
  const [schoolQuery,setSchoolQuery] = useState('');
  const [schoolId,setSchoolId] = useState('');
  const [name,setName] = useState('');
  const [contactType,setContactType] = useState<'tlf'|'epost'>('tlf');
  const [contact,setContact] = useState('');
  const [month,setMonth] = useState('');
  const schools = useMemo(()=>organizations.filter(o=>o.type==='school'&&o.status==='active'),[organizations]);
  const q = schoolQuery.trim().toLowerCase();
  const hits = q?schools.filter(s=>`${s.schoolName ?? s.name} ${schoolPlace(s)}`.toLowerCase().includes(q)):schools.slice(0,5);
  const school = schools.find(s=>s.id===schoolId);
  const canNext = step===1?!!school:step===2?!!name.trim():true;
  const next=()=>{ if (canNext) { setStep(s=>Math.min(3,s+1)); window.scrollTo({ top:0 }); } };
  const back=()=>setStep(s=>Math.max(1,s-1));
  const finish=async()=>{
    try {
      if (school) await service.completeOnboarding({ schoolId:school.id, displayName:name.trim(), leaderMonth:leaderMonths.find(([m])=>m.toLowerCase()===month)?.[1] });
      onFinish(name.trim(),school);
    } catch (error) { notify(errorMessage(error)); }
  };
  return <div className="page narrow">
    <div className="progress" aria-hidden="true">{[1,2,3].map(n=><div key={n} className={n<=step?'on':''}/>)}</div>
    <p className="step-label">Steg {step} av 3 · {['Skole','Om deg','Elevrådsvalg'][step-1]}</p>
    {step===1&&<>
      <div className="card">
        <h1>Finn skolen din</h1>
        <p className="muted">Søk opp skolen du går på. Elevrådet ditt blir koblet til den.</p>
        <SearchField size="sm" value={schoolQuery} onChange={setSchoolQuery} label="Søk etter skole" placeholder="Søk etter skole"/>
        <div className="hits">
          {hits.map(s=><button key={s.id} className={`hit ${s.id===schoolId?'on':''}`} aria-pressed={s.id===schoolId} onClick={()=>setSchoolId(s.id)}>
            <Avatar initials={s.initials} size="sm"/>
            <span className="grow"><span className="name">{s.schoolName ?? s.name}</span><span className="sub">{schoolPlace(s)}</span></span>
            <span className="tick">{s.id===schoolId?'Valgt':''}</span>
          </button>)}
          {!hits.length&&<p className="empty-note">Fant ikke skolen. Be elevrådet ta kontakt med fylkeslaget, så legges den inn.</p>}
        </div>
        <button className="btn primary large wide" aria-disabled={!canNext} onClick={next}>Fortsett</button>
      </div>
      <div className="card cool">
        <div className="grow" style={{ minWidth:180 }}><strong>Logg inn med Feide</strong><p className="muted">Kommer senere</p></div>
        <button className="btn" disabled>Ikke tilgjengelig</button>
      </div>
    </>}
    {step===2&&<div className="card">
      <h1>Om deg</h1>
      <p className="muted">{school?`${school.schoolName ?? school.name} · ${schoolPlace(school)}`:'Ingen skole valgt'}</p>
      <label className="field"><span>Navn</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Fornavn og etternavn" autoComplete="name"/></label>
      <div className="field">
        <span>Logg inn med</span>
        <div className="toggle-pair" role="group" aria-label="Innloggingsmetode">
          <button className={contactType==='tlf'?'on':''} aria-pressed={contactType==='tlf'} onClick={()=>setContactType('tlf')}>Telefonnummer</button>
          <button className={contactType==='epost'?'on':''} aria-pressed={contactType==='epost'} onClick={()=>setContactType('epost')}>E-post</button>
        </div>
        <input value={contact} onChange={e=>setContact(e.target.value)} aria-label={contactType==='tlf'?'Telefonnummer':'E-post'} type={contactType==='tlf'?'tel':'email'} placeholder={contactType==='tlf'?'+47 400 00 000':'navn@skole.no'}/>
        <small>Vi sender en engangskode hit for å bekrefte at det er deg.</small>
      </div>
      <div className="actions"><button className="btn large" onClick={back}>Tilbake</button><button className="btn primary large grow" aria-disabled={!canNext} onClick={next}>Fortsett</button></div>
    </div>}
    {step===3&&<div className="card">
      <h1>Når velger elevrådet ny leder?</h1>
      <p className="muted">Valgfritt. Vi bruker det til å minne elevrådet på å oppdatere hvem som har tilgang.</p>
      <label className="field"><span>Måned</span><select value={month} onChange={e=>setMonth(e.target.value)}><option value="">Vet ikke ennå</option>{leaderMonths.map(([m])=><option key={m} value={m.toLowerCase()}>{m}</option>)}</select></label>
      <div className="summary-box">
        <strong>{name.trim()||'Du'} · {school?.schoolName ?? 'ingen skole'}</strong>
        <p>{contactType==='tlf'?'Telefon: ':'E-post: '}{contact.trim()||'ikke fylt ut'}{month?` · Nytt ledervalg i ${month}`:''}</p>
      </div>
      <div className="actions"><button className="btn large" onClick={back}>Tilbake</button><button className="btn primary large grow" onClick={()=>void finish()}>Fullfør innlogging</button></div>
      <button className="quiet" onClick={()=>void finish()}>Hopp over</button>
    </div>}
  </div>;
}
