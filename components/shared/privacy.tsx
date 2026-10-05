import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-context';
import { useService } from '@/components/service-provider';
import { ConfirmButton, Logo, Status } from '@/components/shared/ui';
import { consentChoice, enabledPurposes, LEGAL_VERSIONS, needsConsent } from '@/lib/domain/legal';
import { dataRequestStatusLabel, type PrivacyStatus } from '@/lib/domain/privacy';
import { formatDate } from '@/lib/domain/time';
import { errorMessage } from '@/lib/domain/validation';

// Personvern i grensesnittet (§10, §16): godkjenning av vilkår, samtykke til valgfrie tjenester, og egen konto
// (nedlasting av data, deaktivering og sletting). Serveren avgjør alt; her vises bare det den svarer.

// ---- Samtykke til valgfrie tjenester. Valget huskes i nettleseren og lagres på serveren med versjonen. ----
const CONSENT_KEY = 'elevradsnett.consent';
const CONSENT_ID_KEY = 'elevradsnett.consentId';
type StoredConsent = { version:string; purposes:Record<string,boolean> };

function storedConsent():StoredConsent|null {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? 'null') as StoredConsent|null;
    return value && typeof value.version==='string' && value.purposes && typeof value.purposes==='object'?value:null;
  } catch { return null; }
}
/** Tilfeldig id for nettleseren, så valget kan dokumenteres uten innlogging. */
function browserId() {
  try {
    let id = window.localStorage.getItem(CONSENT_ID_KEY);
    if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(CONSENT_ID_KEY,id); }
    return id;
  } catch { return crypto.randomUUID(); }
}
/** Lagrer valget lokalt og på serveren. Andre deler av appen kan lytte på hendelsen og laste eller stoppe tjenesten. */
function useSaveConsent() {
  const service = useService();
  return async(accepted:string[],signedIn:boolean)=>{
    const purposes = consentChoice(accepted);
    await service.recordConsent({ version:LEGAL_VERSIONS.cookies, purposes, anonymousId:signedIn?undefined:browserId() });
    try { window.localStorage.setItem(CONSENT_KEY,JSON.stringify({ version:LEGAL_VERSIONS.cookies, purposes })); } catch { /* Ingen lagring tilgjengelig */ }
    window.dispatchEvent(new CustomEvent('elevradsnett:consent',{ detail:purposes }));
  };
}

/** Vises bare når en valgfri tjeneste er slått på og brukeren ikke har valgt. Godta og Avvis er like store (§16). */
export function ConsentBanner({signedIn,onSettings}:{signedIn:boolean;onSettings:()=>void}) {
  const save = useSaveConsent();
  const [open,setOpen] = useState(()=>needsConsent(storedConsent()));
  const [error,setError] = useState('');
  if (!open) return null;
  const choose = async(accepted:string[])=>{
    try { await save(accepted,signedIn); setOpen(false); } catch (e) { setError(errorMessage(e)); }
  };
  const purposes = enabledPurposes();
  return <section className="consent-banner" aria-labelledby="consent-title">
    <div className="consent-inner">
      <div className="grow">
        <h2 id="consent-title">Valgfrie tjenester</h2>
        <p>Vil du la oss bruke {purposes.map(p=>p.label.toLowerCase()).join(' og ')}? Ingenting lastes før du har valgt. Du kan endre valget når som helst.</p>
        {error&&<p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="consent-actions">
        <button className="btn primary" onClick={()=>void choose(purposes.map(p=>p.id))}>Godta</button>
        <button className="btn" onClick={()=>void choose([])}>Avvis</button>
        <button className="quiet" onClick={onSettings}>Velg selv</button>
      </div>
    </div>
  </section>;
}

/** Personvernvalg på siden om informasjonskapsler: velg per formål, eller trekk tilbake. */
export function ConsentSettings() {
  const { signedIn, notify } = useApp();
  const save = useSaveConsent();
  const purposes = enabledPurposes();
  const [accepted,setAccepted] = useState<string[]>(()=>Object.entries(storedConsent()?.purposes ?? {}).filter(([,v])=>v).map(([k])=>k));
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const store = async(next:string[],done:string)=>{
    setBusy(true); setError('');
    try { await save(next,signedIn); setAccepted(next); notify(done); } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  return <section className="section-card">
    <h2>Dine valg</h2>
    {!purposes.length?<p className="muted" style={{ lineHeight:1.6 }}>Ingen valgfrie tjenester er slått på. Elevrådsnett bruker bare det som trengs for at tjenesten skal virke, så du har ingenting å velge.</p>
    :<form className="stack" onSubmit={e=>{ e.preventDefault(); void store(accepted,'Valgene er lagret'); }}>
      {purposes.map(p=><div className="check-row" key={p.id}>
        <input type="checkbox" id={`consent-${p.id}`} checked={accepted.includes(p.id)} onChange={e=>setAccepted(a=>e.target.checked?[...a,p.id]:a.filter(x=>x!==p.id))}/>
        <label htmlFor={`consent-${p.id}`}><strong>{p.label}</strong><span className="muted">{p.description} Leverandør: {p.provider}.</span></label>
      </div>)}
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>Lagre valgene</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>void store([],'Samtykket er trukket tilbake')}>Trekk tilbake alt</button>
      </div>
    </form>}
  </section>;
}

// ---- Godkjenning av vilkår ----

/** Hovedpunktene i vilkårene og personvernerklæringen. Vises i onboarding og når vilkårene er endret. */
export function TermsSummary() {
  return <ul className="terms-summary">
    <li>Elevorganisasjonen er ansvarlig for Elevrådsnett.</li>
    <li>Du publiserer og kommenterer for elevrådet eller styret, og navnet ditt vises sammen med det. Innlegg til «Alle» kan leses av hvem som helst.</li>
    <li>Vervene dine og bekreftet deltakelse på arrangementer vises i en offentlig CV.</li>
    <li>Meldinger er private. Administratorer kan ikke lese dem.</li>
    <li>Du kan laste ned dataene dine, deaktivere profilen og be om sletting under Profil.</li>
  </ul>;
}

/** Lenker til vilkårene og personvernerklæringen. */
export function TermsLinks({onOpen}:{onOpen:(page:'terms'|'privacy')=>void}) {
  return <>Les <button type="button" className="name-link" onClick={()=>onOpen('terms')}>vilkårene</button> og <button type="button" className="name-link" onClick={()=>onOpen('privacy')}>personvernerklæringen</button></>;
}

/** Vises i stedet for appen når brukeren ikke har godtatt gjeldende vilkår. Vilkårene kan leses først. */
export function TermsGate({updated,onAccepted,onSignOut,onOpen}:{updated:boolean;onAccepted:()=>void;onSignOut:()=>void;onOpen:(page:'terms'|'privacy')=>void}) {
  const service = useService();
  const [checked,setChecked] = useState(false);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const accept = async()=>{
    if (!checked) { setError('Kryss av for at du har lest og godtar vilkårene.'); return; }
    setBusy(true); setError('');
    try { await service.acceptTerms({ termsVersion:LEGAL_VERSIONS.terms, privacyVersion:LEGAL_VERSIONS.privacy }); onAccepted(); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return <div className="page narrow">
    <form className="card" onSubmit={e=>{ e.preventDefault(); void accept(); }} noValidate>
      <Logo/>
      <div><h1>{updated?'Vilkårene er oppdatert':'Vilkår og personvern'}</h1><p className="muted">{updated?'Les gjennom endringene og godta dem for å fortsette.':'Før du bruker Elevrådsnett, må du lese og godta vilkårene.'}</p></div>
      <TermsSummary/>
      <p><TermsLinks onOpen={onOpen}/> i sin helhet.</p>
      <div className="check-row">
        <input type="checkbox" id="terms-accept" checked={checked} onChange={e=>{ setChecked(e.target.checked); setError(''); }}/>
        <label htmlFor="terms-accept">Jeg har lest og godtar vilkårene og personvernerklæringen.</label>
      </div>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <button className="btn primary large wide" disabled={busy}>{busy?'Lagrer …':'Godta og fortsett'}</button>
      <button type="button" className="quiet" onClick={onSignOut}>Logg ut</button>
    </form>
  </div>;
}

// ---- Egen konto: nedlasting, sletting og deaktivering ----

/** Lagrer dataene som en JSON-fil på enheten. */
function downloadJson(data:unknown) {
  const blob = new Blob([JSON.stringify(data,null,2)],{ type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `elevradsnett-mine-data-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function usePrivacy() {
  const service = useService();
  const [privacy,setPrivacy] = useState<PrivacyStatus|null>(null);
  const [error,setError] = useState('');
  const [version,setVersion] = useState(0);
  useEffect(()=>{
    let cancelled = false;
    service.getPrivacyStatus().then(p=>{ if (!cancelled) { setPrivacy(p); setError(''); } }).catch(e=>{ if (!cancelled) setError(errorMessage(e)); });
    return ()=>{ cancelled = true; };
  },[service,version]);
  return { privacy, error, refresh:()=>setVersion(v=>v+1) };
}

/** Last ned egne data og be om sletting. Brukes både for aktive og deaktiverte profiler. */
function DataControls({privacy,onChanged,busy,run}:{privacy:PrivacyStatus;onChanged:()=>void;busy:boolean;run:(work:()=>Promise<unknown>,done:string)=>Promise<boolean>}) {
  const service = useService();
  const open = privacy.requests.find(r=>r.status==='pending' || r.status==='processing');
  const last = privacy.requests.find(r=>r!==open);
  return <>
    <p className="chip-label">Dataene dine</p>
    <p className="muted" style={{ lineHeight:1.6 }}>Last ned alt Elevrådsnett har lagret om deg: profil, skoler, verv, innlegg, kommentarer, meldinger du har sendt, varsler og valg. Filen er i JSON-format.</p>
    <div className="actions" style={{ marginTop:10 }}><button className="btn" disabled={busy} onClick={()=>void run(async()=>downloadJson(await service.exportMyData()),'Dataene er lastet ned')}>Last ned dataene mine</button></div>

    <p className="chip-label">Slette personopplysningene</p>
    {open?<div className="row-card wrap">
      <Status tone="blue">{dataRequestStatusLabel[open.status]}</Status>
      <span className="grow"><strong>Du har bedt om sletting {formatDate(open.createdAt)}</strong><small>Elevorganisasjonen gjennomfører slettingen og sier fra på e-post.</small></span>
      {open.status==='pending'&&<ConfirmButton label="Trekk" question="Trekke forespørselen?" confirmLabel="Trekk" disabled={busy} onConfirm={()=>void run(()=>service.cancelDataRequest(open.id),'Forespørselen er trukket').then(onChanged)}/>}
    </div>
    :<>
      <p className="muted" style={{ lineHeight:1.6 }}>Navnet, e-postadressen, bildet, meldingene og resten av opplysningene om deg slettes. Innlegg du publiserte for elevrådet blir stående, men med «Slettet bruker» som avsender. Slettingen kan ikke angres.</p>
      <div className="actions" style={{ marginTop:10 }}><ConfirmButton label="Be om sletting" question="Be om at personopplysningene dine slettes?" confirmLabel="Be om sletting" disabled={busy} onConfirm={()=>void run(()=>service.requestDeletion(),'Forespørselen er sendt').then(onChanged)}/></div>
      {last&&<p className="sub" style={{ marginTop:8 }}><Status tone="gray">{dataRequestStatusLabel[last.status]}</Status> Forespørsel {formatDate(last.createdAt)}{last.notes?` · «${last.notes}»`:''}</p>}
    </>}
  </>;
}

/** Profil → Personvern og konto. */
export function PrivacySection() {
  const service = useService();
  const { go, notify, reload } = useApp();
  const { privacy, error:loadError, refresh } = usePrivacy();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const run = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); notify(done); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  return <section className="section-card">
    <h2>Personvern og konto</h2>
    {(error || loadError)&&<p className="form-error" role="alert">{error || loadError}</p>}
    {privacy&&<>
      <p className="muted" style={{ lineHeight:1.6 }}>
        {privacy.acceptedAt?`Du godtok vilkårene og personvernerklæringen ${formatDate(privacy.acceptedAt)}. `:''}
        <button className="name-link" onClick={()=>go({ view:'legal', page:'privacy' })}>Les personvernerklæringen</button>
      </p>
      <DataControls privacy={privacy} onChanged={refresh} busy={busy} run={run}/>
      <p className="chip-label">Deaktivere profilen</p>
      <p className="muted" style={{ lineHeight:1.6 }}>Profilen skjules fra søk, og du kan ikke publisere, kommentere eller sende meldinger. Vervene og rettighetene dine avsluttes og blir stående i historikken. Du kan aktivere profilen igjen når du vil, men vervene må gis på nytt.</p>
      <div className="actions" style={{ marginTop:10 }}><ConfirmButton label="Deaktiver profilen" question="Deaktivere profilen og avslutte alle verv?" confirmLabel="Deaktiver" disabled={busy}
        onConfirm={()=>void run(()=>service.deactivateAccount(),'Profilen er deaktivert').then(ok=>{ if (ok) reload(); })}/></div>
    </>}
    {!privacy&&!loadError&&<p className="muted">Henter …</p>}
    {loadError&&<button className="btn" onClick={()=>{ setError(''); refresh(); }}>Prøv igjen</button>}
  </section>;
}

/** Profilsiden for en deaktivert profil: aktivere igjen, laste ned data og be om sletting. */
export function DeactivatedProfile() {
  const service = useService();
  const { notify, reload, signOut } = useApp();
  const { privacy, error:loadError, refresh } = usePrivacy();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const run = async(work:()=>Promise<unknown>,done:string)=>{
    setBusy(true); setError('');
    try { await work(); notify(done); return true; } catch (e) { setError(errorMessage(e)); return false; } finally { setBusy(false); }
  };
  return <div className="page narrow">
    <h1>Profil</h1>
    {(error || loadError)&&<p className="form-error" role="alert">{error || loadError}</p>}
    <section className="section-card">
      <h2>Profilen din er deaktivert</h2>
      {privacy?.deactivatedByUser?<>
        <p className="muted" style={{ lineHeight:1.6 }}>Du deaktiverte profilen selv. Aktiverer du den igjen, kan du publisere og sende meldinger når et elevråd eller styre gir deg et verv.</p>
        <div className="actions" style={{ marginTop:12 }}><button className="btn primary" disabled={busy} onClick={()=>void run(()=>service.reactivateAccount(),'Profilen er aktivert igjen').then(ok=>{ if (ok) reload(); })}>Aktiver profilen igjen</button></div>
      </>:privacy&&<p className="muted" style={{ lineHeight:1.6 }}>En administrator har deaktivert profilen. Du kan fortsatt lese alt som er offentlig. Ta kontakt med <a href="mailto:teknisk@elev.no">teknisk@elev.no</a> hvis du mener dette er feil.</p>}
    </section>
    {privacy&&<section className="section-card"><h2>Personvern</h2><DataControls privacy={privacy} onChanged={refresh} busy={busy} run={run}/></section>}
    <div className="actions"><button className="btn" onClick={signOut}>Logg ut</button></div>
  </div>;
}
