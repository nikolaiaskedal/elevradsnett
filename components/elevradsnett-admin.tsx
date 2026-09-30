'use client';

import { useState } from 'react';
import { Avatar, Status } from '@/components/elevradsnett-ui';
import type { Representation } from '@/lib/domain/types';

export type LegalPage = 'privacy'|'terms'|'cookies'|'contact';
export const legalPages:[LegalPage,string][] = [['privacy','Personvern'],['terms','Vilkår'],['cookies','Informasjonskapsler'],['contact','Kontakt']];

type Notify = (text:string)=>void;
const adminTabs = [['overview','Oversikt'],['handover','Styreoverføring'],['roles','Roller og verv'],['schools','Skoler'],['moderation','Moderering'],['import','CSV']] as const;
type AdminTab = typeof adminTabs[number][0];

export function AdminPanel({activeRep,onNotify}:{activeRep:Representation;onNotify:Notify}){
  const [tab,setTab]=useState<AdminTab>('overview');
  return <div className="page">
    <div className="page-head split">
      <div><h1>Administrasjon</h1><p className="muted">{activeRep.name} · Rettigheter kontrolleres på nytt for hver serveroperasjon.</p></div>
      <Status tone="green">Skoleadministrator</Status>
    </div>
    <div className="segmented wide" role="tablist" aria-label="Administrasjon">
      {adminTabs.map(([id,label])=><button key={id} role="tab" id={`tab-${id}`} aria-selected={tab===id} aria-controls={`panel-${id}`} className={tab===id?'on':''} onClick={()=>setTab(id)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="stack">
      {tab==='overview'?<Overview/>:tab==='handover'?<Handover onNotify={onNotify}/>:tab==='roles'?<Roles onNotify={onNotify}/>:tab==='schools'?<Schools onNotify={onNotify}/>:tab==='moderation'?<Moderation onNotify={onNotify}/>:<CsvImport onNotify={onNotify}/>}
    </div>
  </div>;
}

function Overview(){
  return <>
    <div className="metric-grid">{[['12','Aktive medlemmer','+2 siste måned'],['8','Publiserte innlegg','3 utkast'],['4','Arrangementer','2 kommende'],['46','Dager til styreskifte','25. oktober']].map(([n,l,s])=><div className="card metric" key={l}><strong>{n}</strong><span>{l}</span><small>{s}</small></div>)}</div>
    <div className="two-col">
      <section className="card"><h2>Oppgaver</h2><div className="list">{[['Inviter ny skoleadministrator','Anbefalt før styreskiftet',true],['Bekreft delegater','Elevrådskurs i Oslo',false],['Gjennomgå to rapporter','Moderering',false]].map(([t,s,important])=><div className="row-card" key={String(t)}><Status tone={important?'coral':'blue'}>{important?'Viktig':'Åpen'}</Status><span className="grow"><strong>{t}</strong><small>{s}</small></span></div>)}</div></section>
      <section className="card"><h2>Nylige handlinger</h2><div className="list">{['Ida oppdaterte skolens biografi','Sivert publiserte et innlegg','Rania aksepterte et offentlig verv','Ida registrerte valgdato'].map((text,i)=><div className="audit-row" key={text}><span aria-hidden="true"/><div><strong>{text}</strong><small>{i===0?'for 12 min siden':`${i+1} dager siden`}</small></div></div>)}</div></section>
    </div>
  </>;
}

function Handover({onNotify}:{onNotify:Notify}){
  const [step,setStep]=useState(1);
  const steps=['Dato','Nytt styre','Rettigheter','Forhåndsvisning'];
  return <section className="card">
    <div className="progress" aria-hidden="true">{steps.map((s,i)=><div key={s} className={step>=i+1?'on':''}/>)}</div>
    <p className="step-label">Steg {step} av 4 · {steps[step-1]}</p>
    {step===1?<><h2>Bekreft styreskiftet</h2><p className="muted">Nåværende administrator beholder nødvendig tilgang til minst én etterfølger har akseptert.</p><label className="field"><span>Dato for styreskifte</span><input type="date" defaultValue="2026-10-25"/></label><label className="field"><span>Sluttdato for gammelt styre</span><input type="date" defaultValue="2026-10-24"/></label></>
    :step===2?<><h2>Velg det nye styret</h2><div className="list">{['Sivert Aune · foreslått leder','Rania Osman · foreslått nestleder','Maja Solheim · foreslått medlem'].map(x=><label className="row-card" key={x}><input type="checkbox" defaultChecked/><Avatar size="sm" tone="pale" initials={x.split(' ').map(v=>v[0]).slice(0,2).join('')}/><span className="grow">{x}</span></label>)}</div><button className="btn ghost" onClick={()=>onNotify('Invitasjon til ny bruker er åpnet')}>+ Inviter ny bruker</button></>
    :step===3?<><h2>Fordel tekniske rettigheter</h2><label className="field"><span>Ny skoleadministrator</span><select defaultValue="sivert"><option value="sivert">Sivert Aune</option><option value="rania">Rania Osman</option></select></label><div className="list"><label className="row-card"><input type="checkbox" defaultChecked/><span className="grow">Behold Ida som administrator frem til Sivert har akseptert</span></label><label className="row-card"><input type="checkbox"/><span className="grow">Gi Rania rollen innholdsansvarlig</span></label></div></>
    :<><h2>Kontroller overføringen</h2><div className="note-box"><p><strong>25. oktober:</strong> Nytt styre aktiveres</p><p><strong>Sivert Aune:</strong> Elevrådsleder og skoleadministrator</p><p><strong>Ida Halvorsen:</strong> Verv avsluttes etter akseptert etterfølger</p><p><strong>Revisjonslogg:</strong> Alle endringer registreres</p></div></>}
    <div className="actions"><button className="btn ghost" disabled={step===1} onClick={()=>setStep(v=>Math.max(1,v-1))}>Tilbake</button><button className="btn primary grow" onClick={()=>step<4?setStep(v=>v+1):onNotify('Overføringen er sendt til godkjenning')}>{step<4?'Neste':'Send invitasjoner'}</button></div>
  </section>;
}

function Table({head,rows}:{head:string[];rows:React.ReactNode[][]}){
  return <div className="table" role="table"><div className="table-row head" role="row">{head.map(h=><span role="columnheader" key={h}>{h}</span>)}</div>{rows.map((r,i)=><div className="table-row" role="row" key={i}>{r.map((c,j)=><span role="cell" key={j}>{c}</span>)}</div>)}</div>;
}

function Roles({onNotify}:{onNotify:Notify}){
  return <section className="card"><div className="card-head"><div><h2>Roller og offentlige verv</h2><p className="muted">Tekniske rettigheter og offentlige verv administreres separat.</p></div><button className="link" onClick={()=>onNotify('Skjema for ny rolle er åpnet')}>+ Tildel rolle</button></div>
    <Table head={['Person','Offentlig verv','Intern rettighet','Status']} rows={[['Ida Halvorsen','Elevrådsleder','Skoleadministrator'],['Sivert Aune','Nestleder','Innholdsansvarlig'],['Rania Osman','Skolemiljøansvarlig','Ingen']].map(r=>[<span className="cell-person" key="p"><Avatar size="sm" tone="pale" initials={r[0].split(' ').map(v=>v[0]).join('')}/><strong>{r[0]}</strong></span>,r[1],r[2],<Status key="s" tone="green">Aktiv</Status>])}/>
  </section>;
}

function Schools({onNotify}:{onNotify:Notify}){
  return <section className="card"><div className="card-head"><div><h2>Skoleadministrasjon</h2><p className="muted">Deaktivering bevarer innlegg, verv og arrangementhistorikk.</p></div></div>
    <Table head={['Skole','Lokallag','Administratorer','Status']} rows={[['Elvebakken vgs','Oslo Sentrum','2','Aktiv'],['Oslo handelsgymnasium','Oslo Sentrum','1','Aktiv'],['Fagerborg skole','Oslo Vest','0','Deaktivert']].map(r=>[<button className="link" key="n" onClick={()=>onNotify(`Åpnet ${r[0]}`)}>{r[0]}</button>,r[1],r[2],<Status key="s" tone={r[3]==='Aktiv'?'green':'gray'}>{r[3]}</Status>])}/>
  </section>;
}

function Moderation({onNotify}:{onNotify:Notify}){
  return <section className="card"><div className="card-head"><div><h2>Modereringskø</h2><p className="muted">Private meldinger vises bare når konkret innhold er rapportert.</p></div><Status tone="coral">2 åpne</Status></div>
    <div className="list">{[['Innlegg','Upassende språk','Kuben vgs elevråd'],['Profil','Feilaktig verv','Tidligere tillitsvalgt']].map(r=><div className="row-card" key={r[1]}><Status tone="gray">{r[0]}</Status><span className="grow"><strong>{r[1]}</strong><small>{r[2]} · rapportert i går</small></span><button className="btn ghost" onClick={()=>onNotify('Modereringssaken er åpnet')}>Behandle</button></div>)}</div>
  </section>;
}

function CsvImport({onNotify}:{onNotify:Notify}){
  const [uploaded,setUploaded]=useState(false);
  return <section className="card"><div className="card-head"><div><h2>Import og eksport av skoler</h2><p className="muted">Skoler oppdateres etter stabil ekstern ID, ikke navn.</p></div><button className="link" onClick={()=>onNotify('Tom CSV-mal lastes ned')}>Last ned mal</button></div>
    <button className="upload-zone" onClick={()=>setUploaded(true)}><strong>Last opp UTF-8 CSV</strong><span>Filen valideres uten å endre databasen</span></button>
    {uploaded&&<div className="note-box"><div className="chips"><Status tone="green">24 nye</Status><Status tone="blue">6 endret</Status><Status tone="coral">2 ugyldige</Status></div><p>Forhåndsvisningen er klar. Ugyldige rader må rettes før import.</p><button className="btn primary" onClick={()=>onNotify('Importen krever eksplisitt bekreftelse')}>Gå til bekreftelse</button></div>}
  </section>;
}

export function LegalView({page,onPage}:{page:LegalPage;onPage:(p:LegalPage)=>void}){
  return <div className="page">
    <div className="page-head"><h1>Informasjon</h1></div>
    <div className="segmented" role="tablist" aria-label="Informasjon">{legalPages.map(([id,label])=><button key={id} role="tab" aria-selected={page===id} className={page===id?'on':''} onClick={()=>onPage(id)}>{label}</button>)}</div>
    <article className="card prose">
      {page==='privacy'?<><p className="eyebrow">Sist oppdatert 9. september 2026</p><h2>Personvernerklæring</h2><p>Elevorganisasjonen er behandlingsansvarlig for Elevrådsnett. Vi behandler kontoopplysninger, skole- og vervstilknytning, offentlig aktivitet, arrangementsdeltakelse og nødvendige tekniske logger for å levere og sikre tjenesten.</p><h3>Dine rettigheter</h3><p>Du kan be om innsyn, retting, eksport, deaktivering eller sletting. Historiske verv og nødvendig revisjonshistorikk kan beholdes når vi har et dokumentert rettslig grunnlag.</p><h3>Private meldinger</h3><p>Meldinger er bare tilgjengelige for aktive samtalemedlemmer. Administratorer kan ikke lese meldinger, med mindre en bruker aktivt rapporterer konkret innhold.</p></>
      :page==='terms'?<><h2>Vilkår for bruk</h2><p>Bruk Elevrådsnett med respekt for andre. Innlegg og kommentarer publiseres på vegne av organisasjonen du aktivt representerer. Misbruk kan føre til begrensning eller deaktivering.</p><h3>Publisering</h3><p>Du må ha et aktivt verv og eksplisitt publiseringsrett i organisasjonen. Elevrådsnett lagrer hvem som utførte handlingen.</p></>
      :page==='cookies'?<><h2>Informasjonskapsler og sporing</h2><p>Tjenesten bruker bare strengt nødvendig lokal lagring og innloggingsdata for autentisering, sikkerhet og sesjon. Derfor vises ikke et unødvendig samtykkebanner.</p><p>Valgfri analyse er ikke aktivert. Dersom dette tas i bruk senere, vil den være avslått frem til du velger formål og gir samtykke.</p></>
      :<><h2>Kontakt</h2><p>Spørsmål om tjenesten, personvern eller sikkerhet kan sendes til <a href="mailto:teknisk@elev.no">teknisk@elev.no</a>.</p><h3>Rapporter innhold</h3><p>Bruk rapporteringsvalget på innlegget, profilen eller mediet. For meldinger deles bare innholdet du aktivt velger.</p></>}
    </article>
  </div>;
}
