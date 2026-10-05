import { useEffect, useMemo, useState } from 'react';
import { schoolPlace } from '@/components/format';
import { useService } from '@/components/service-provider';
import { TermsSummary } from '@/components/shared/privacy';
import { Avatar, SearchField } from '@/components/shared/ui';
import { LEGAL_VERSIONS } from '@/lib/domain/legal';
import type { Organization, Session } from '@/lib/domain/types';
import { emailSchema, errorMessage, isoDate, loginCodeSchema, LOGIN_CODE_LENGTH, MAX_ELECTION_DAYS_AHEAD } from '@/lib/domain/validation';

const RESEND_SECONDS = 60;

/**
 * Innlogging med engangskode på e-post, og onboarding for nye brukere.
 * Telefonnummer og Feide vises, men er deaktivert til de kommer (se docs/PROMPTPLAN.md).
 */
export function LoginFlow({schools,reason,onDone,headingLevel=1,headingId}:{schools:Organization[];reason?:string;onDone:(session:Session)=>void;headingLevel?:1|2;headingId?:string}) {
  const service = useService();
  const [stage,setStage] = useState<'email'|'code'|'onboarding'>('email');
  const [email,setEmail] = useState('');
  const [code,setCode] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [wait,setWait] = useState(0);
  const Heading = headingLevel===1?'h1':'h2';

  useEffect(()=>{
    if (wait<=0) return;
    const timer = window.setTimeout(()=>setWait(w=>w-1),1000);
    return ()=>window.clearTimeout(timer);
  },[wait]);

  const sendCode = async()=>{
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { setError(errorMessage(parsed.error)); return; }
    setBusy(true); setError('');
    try {
      await service.requestLoginCode({ email:parsed.data });
      setEmail(parsed.data); setCode(''); setStage('code'); setWait(RESEND_SECONDS);
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  const verify = async()=>{
    const parsed = loginCodeSchema.safeParse(code);
    if (!parsed.success) { setError(errorMessage(parsed.error)); return; }
    setBusy(true); setError('');
    try {
      const session = await service.verifyLoginCode({ email, code:parsed.data });
      if (session.status==='onboarding') setStage('onboarding'); else onDone(session);
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  if (stage==='onboarding') return <OnboardingFlow schools={schools} email={email} onDone={onDone} headingLevel={headingLevel} headingId={headingId}/>;

  return <div className="login-flow">
    {stage==='email'&&<form className="card" onSubmit={e=>{ e.preventDefault(); void sendCode(); }} noValidate>
      <div>
        <Heading id={headingId}>Logg inn</Heading>
        <p className="muted">{reason ?? 'Logg inn for å følge, kommentere og representere elevrådet ditt. Alt som er offentlig kan du lese uten å logge inn.'}</p>
      </div>
      <div className="field">
        <span id="login-method">Logg inn med</span>
        <div className="toggle-pair" role="group" aria-labelledby="login-method">
          <button type="button" className="on" aria-pressed="true">E-post</button>
          <button type="button" disabled aria-describedby="phone-later">Telefonnummer <span id="phone-later" className="later-tag">Kommer senere</span></button>
        </div>
      </div>
      <label className="field">
        <span>E-post</span>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="navn@skole.no" aria-invalid={!!error} aria-describedby="login-help"/>
        <small id="login-help">Vi sender en kode på seks sifre til e-posten. Har du ikke konto, lager vi en når du har skrevet inn koden.</small>
      </label>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="btn primary large wide" disabled={busy}>{busy?'Sender …':'Send kode'}</button>
      {service.demoLoginHint&&<p className="note-box">{service.demoLoginHint}</p>}
    </form>}
    {stage==='code'&&<form className="card" onSubmit={e=>{ e.preventDefault(); void verify(); }} noValidate>
      <div>
        <Heading id={headingId}>Skriv inn koden</Heading>
        <p className="muted">Vi har sendt en kode til <strong>{email}</strong>. Den kan ta et minutt å komme frem. Sjekk søppelposten hvis du ikke finner den.</p>
      </div>
      <label className="field">
        <span>Engangskode</span>
        <input className="code-input" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,LOGIN_CODE_LENGTH))} inputMode="numeric" autoComplete="one-time-code" maxLength={LOGIN_CODE_LENGTH} placeholder="000000" aria-invalid={!!error} autoFocus/>
      </label>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="btn primary large wide" disabled={busy}>{busy?'Sjekker …':'Logg inn'}</button>
      <div className="actions">
        <button type="button" className="quiet" disabled={wait>0||busy} onClick={()=>void sendCode()}>{wait>0?`Send ny kode om ${wait} s`:'Send ny kode'}</button>
        <button type="button" className="quiet" onClick={()=>{ setStage('email'); setError(''); }}>Bruk en annen e-post</button>
      </div>
      {service.demoLoginHint&&<p className="note-box">{service.demoLoginHint}</p>}
    </form>}
    {stage==='email'&&<div className="card cool">
      <div className="grow" style={{ minWidth:180 }}><strong>Logg inn med Feide</strong><p className="muted">Kommer senere</p></div>
      <button className="btn" disabled>Ikke tilgjengelig</button>
    </div>}
  </div>;
}

/** Søk og velg skole. Brukes i onboarding og ved skolebytte. */
export function SchoolPicker({schools,value,onChange,exclude}:{schools:Organization[];value:string;onChange:(id:string)=>void;exclude?:string|null}) {
  const [query,setQuery] = useState('');
  const active = useMemo(()=>schools.filter(o=>o.type==='school'&&o.status==='active'&&o.id!==exclude),[schools,exclude]);
  const q = query.trim().toLowerCase();
  const chosen = active.find(s=>s.id===value);
  const hits = q?active.filter(s=>`${s.schoolName ?? s.name} ${schoolPlace(s)}`.toLowerCase().includes(q)).slice(0,8):chosen?[chosen]:[];
  return <>
    <SearchField size="sm" value={query} onChange={setQuery} label="Søk etter skole" placeholder="Søk etter skole eller sted"/>
    <div className="hits">
      {hits.map(s=><button type="button" key={s.id} className={`hit ${s.id===value?'on':''}`} aria-pressed={s.id===value} onClick={()=>onChange(s.id)}>
        <Avatar initials={s.initials} size="sm"/>
        <span className="grow"><span className="name">{s.schoolName ?? s.name}</span><span className="sub">{schoolPlace(s)}</span></span>
        <span className="tick">{s.id===value?'Valgt':''}</span>
      </button>)}
      {q&&!hits.length&&<p className="empty-note">Fant ikke skolen. Be elevrådet ta kontakt med fylkeslaget, så legges den inn.</p>}
      {!q&&!hits.length&&<p className="empty-note">Skriv navnet på skolen, for eksempel «Elvebakken».</p>}
    </div>
  </>;
}

/** Nye brukere: skole, navn og dato for neste valg. Profilen opprettes når dette er fullført. */
export function OnboardingFlow({schools,email,onDone,onSignOut,headingLevel=1,headingId}:{schools:Organization[];email:string;onDone:(session:Session)=>void;onSignOut?:()=>void;headingLevel?:1|2;headingId?:string}) {
  const service = useService();
  const [step,setStep] = useState(1);
  const [schoolId,setSchoolId] = useState('');
  const [name,setName] = useState('');
  const [election,setElection] = useState('');
  const [accepted,setAccepted] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const Heading = headingLevel===1?'h1':'h2';
  const school = schools.find(s=>s.id===schoolId);
  const today = new Date();
  const latest = new Date(today.getFullYear(),today.getMonth(),today.getDate()+MAX_ELECTION_DAYS_AHEAD);
  const next = ()=>{
    if (step===1 && !school) { setError('Velg skolen din.'); return; }
    if (step===2 && name.trim().length<2) { setError('Navnet må ha minst to tegn.'); return; }
    setError(''); setStep(s=>Math.min(3,s+1));
  };
  const finish = async(withElection:boolean)=>{
    if (!school) return;
    if (!accepted) { setError('Kryss av for at du har lest og godtar vilkårene og personvernerklæringen.'); return; }
    setBusy(true); setError('');
    try {
      await service.completeOnboarding({ schoolId:school.id, displayName:name.trim(), nextElection:withElection&&election?election:undefined });
      // Feiler godkjenningen, spør appen om den igjen etter innlogging.
      await service.acceptTerms({ termsVersion:LEGAL_VERSIONS.terms, privacyVersion:LEGAL_VERSIONS.privacy }).catch(()=>{});
      onDone(await service.getSession());
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return <div className="login-flow">
    <div className="progress" aria-hidden="true">{[1,2,3].map(n=><div key={n} className={n<=step?'on':''}/>)}</div>
    <p className="step-label">Steg {step} av 3 · {['Skole','Om deg','Neste valg'][step-1]}</p>
    <form className="card" onSubmit={e=>{ e.preventDefault(); if (step<3) next(); else void finish(true); }} noValidate>
      {step===1&&<>
        <div><Heading id={headingId}>Finn skolen din</Heading><p className="muted">Du er logget inn som {email}. Velg skolen du går på. Det gir deg ikke rett til å publisere for elevrådet; den får du av en administrator.</p></div>
        <SchoolPicker schools={schools} value={schoolId} onChange={id=>{ setSchoolId(id); setError(''); }}/>
      </>}
      {step===2&&<>
        <div><Heading id={headingId}>Om deg</Heading><p className="muted">{school?`${school.schoolName ?? school.name} · ${schoolPlace(school)}`:''}</p></div>
        <label className="field"><span>Navn</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Fornavn og etternavn" autoComplete="name" maxLength={120}/><small>Navnet vises under innlegg du publiserer for elevrådet.</small></label>
      </>}
      {step===3&&<>
        <div><Heading id={headingId}>Når er neste elevrådsvalg?</Heading><p className="muted">Valgfritt. Vi bruker datoen til å minne elevrådet på å gi det nye styret tilgang i tide.</p></div>
        <label className="field"><span>Dato for neste valg</span><input type="date" value={election} min={isoDate(today)} max={isoDate(latest)} onChange={e=>setElection(e.target.value)}/></label>
        <div className="summary-box"><strong>{name.trim()} · {school?.schoolName ?? school?.name}</strong><p>E-post: {email}{election?` · Neste valg ${new Date(`${election}T12:00:00`).toLocaleDateString('nb-NO',{ day:'numeric', month:'long', year:'numeric' })}`:''}</p></div>
        <div className="terms-box">
          <strong>Vilkår og personvern</strong>
          <TermsSummary/>
          <p>Les <a href="#/info/terms" target="_blank" rel="noopener">vilkårene</a> og <a href="#/info/privacy" target="_blank" rel="noopener">personvernerklæringen</a> (åpnes i ny fane).</p>
          <div className="check-row">
            <input type="checkbox" id="onboarding-terms" checked={accepted} onChange={e=>{ setAccepted(e.target.checked); setError(''); }}/>
            <label htmlFor="onboarding-terms">Jeg har lest og godtar vilkårene og personvernerklæringen.</label>
          </div>
        </div>
      </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        {step>1&&<button type="button" className="btn large" onClick={()=>{ setError(''); setStep(s=>s-1); }}>Tilbake</button>}
        <button className="btn primary large grow" disabled={busy}>{step<3?'Fortsett':busy?'Lagrer …':'Fullfør'}</button>
      </div>
      {step===3&&<button type="button" className="quiet" disabled={busy} onClick={()=>void finish(false)}>Hopp over</button>}
      {step===1&&onSignOut&&<button type="button" className="quiet" onClick={onSignOut}>Logg ut</button>}
    </form>
  </div>;
}
