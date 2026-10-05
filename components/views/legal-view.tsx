import { legalPages, type LegalPage } from '@/components/routing';
import { ConsentSettings } from '@/components/shared/privacy';
import { CONTACT_EMAIL, LEGAL_UPDATED, LEGAL_VERSIONS } from '@/lib/domain/legal';

// Vilkår, personvernerklæring, informasjonskapsler og kontakt (§16). Endres teksten vesentlig, skal versjonen i
// lib/domain/legal.ts og legal_document_versions oppdateres, så brukerne godtar den nye versjonen.

const Mail = ()=><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
const Updated = ({version}:{version:string})=><p className="eyebrow">Sist oppdatert {LEGAL_UPDATED} · versjon {version}</p>;

export function LegalView({page,onPage}:{page:LegalPage;onPage:(p:LegalPage)=>void}){
  return <div className="page">
    <div className="page-head"><h1>Informasjon</h1></div>
    <div className="segmented" role="tablist" aria-label="Informasjon">{legalPages.map(([id,label])=><button key={id} role="tab" aria-selected={page===id} className={page===id?'on':''} onClick={()=>onPage(id)}>{label}</button>)}</div>
    <article className="card prose legal">
      {page==='privacy'?<Privacy onPage={onPage}/>:page==='terms'?<Terms onPage={onPage}/>:page==='cookies'?<Cookies/>:<Contact/>}
    </article>
    {page==='cookies'&&<ConsentSettings/>}
  </div>;
}

function Privacy({onPage}:{onPage:(p:LegalPage)=>void}){
  return <>
    <Updated version={LEGAL_VERSIONS.privacy}/>
    <h2>Personvernerklæring</h2>
    <p>Elevrådsnett er et nettverk for elevråd, lokallag, fylkeslag og Elevorganisasjonen. Her forklarer vi hvilke opplysninger om deg vi behandler, hvorfor, hvem som ser dem og hvilke rettigheter du har. Tjenesten er i en pilot, og vi tester den med et begrenset antall skoler.</p>

    <h3>Hvem er ansvarlig</h3>
    <p>Elevorganisasjonen er behandlingsansvarlig for Elevrådsnett. Spørsmål om personvern sender du til <Mail/>.</p>

    <h3>Hvilke opplysninger vi behandler</h3>
    <dl className="legal-list">
      <div><dt>Konto</dt><dd>E-postadressen du logger inn med, navnet ditt og profilbildet hvis du legger inn et.</dd></div>
      <div><dt>Skole</dt><dd>Skolen du går på, og tidligere skoler du har valgt i Elevrådsnett.</dd></div>
      <div><dt>Verv og rettigheter</dt><dd>Verv du har eller har hatt i et elevråd eller styre, og om du kan publisere eller administrere for organisasjonen. Hvem som ga deg vervet og når.</dd></div>
      <div><dt>Innhold</dt><dd>Innlegg, kommentarer, bilder, bildetekster og avstemninger du publiserer for elevrådet eller styret, og hvem som publiserte dem.</dd></div>
      <div><dt>Aktivitet</dt><dd>Hva du støtter og følger, arrangementer du er interessert i, påmeldinger, delegatinvitasjoner og bekreftet oppmøte.</dd></div>
      <div><dt>Meldinger</dt><dd>Meldinger og vedlegg du sender og mottar, og innstillinger som lest-status, demping og blokkering.</dd></div>
      <div><dt>Varsler</dt><dd>Varslene du får, og innstillingene for varsler på e-post og i Elevrådsnett.</dd></div>
      <div><dt>Rapporter</dt><dd>Innhold du rapporterer, og saker der innholdet ditt er rapportert.</dd></div>
      <div><dt>Logger</dt><dd>En revisjonslogg over endringer i verv, rettigheter og administrasjon, og tekniske logger hos leverandørene, som innlogginger og feil.</dd></div>
    </dl>
    <p>Vi ber ikke om fødselsdato, telefonnummer, adresse eller sensitive opplysninger som helse, religion eller politisk syn. Ikke skriv slike opplysninger om deg selv eller andre i innlegg eller meldinger.</p>

    <h3>Hvorfor vi behandler opplysningene</h3>
    <ul>
      <li>For å gi elevråd og styrer et sted å publisere, samarbeide og melde seg på arrangementer.</li>
      <li>For å vise hvem som representerer hvilken organisasjon, og hvem som har lov til å publisere og administrere.</li>
      <li>For å dokumentere verv og deltakelse på arrangementer i CV-en din.</li>
      <li>For å sende engangskoder, varsler og invitasjoner til nytt styre.</li>
      <li>For å holde tjenesten trygg: moderering, revisjonslogg og feilsøking.</li>
    </ul>
    <p>Grunnlaget er Elevorganisasjonens berettigede interesse i å støtte elevrådene og elevdemokratiet (personvernforordningen artikkel 6 nr. 1 bokstav f). Valgfrie tjenester, som bruksstatistikk, brukes bare hvis du samtykker (artikkel 6 nr. 1 bokstav a). Ingen slike tjenester er slått på i piloten.</p>

    <h3>Hvem som ser hva</h3>
    <ul>
      <li><strong>Alle, også uten innlogging:</strong> innlegg med målgruppen «Alle», sidene til elevråd og styrer, offentlige verv, CV-en din (verv og bekreftet deltakelse på arrangementer) og navnet ditt under innlegg du publiserer.</li>
      <li><strong>Innloggede:</strong> innlegg til fylket, lokallaget eller vennerådet når de hører til målgruppen.</li>
      <li><strong>Administratorer:</strong> brukerne ved skolene i sitt område, verv og rettigheter, og revisjonsloggen. Interne rettigheter vises bare for administratorene og deg.</li>
      <li><strong>Meldinger:</strong> bare de som er med i samtalen. Administratorer kan ikke lese meldinger. Rapporterer noen en melding, ser moderator bare den ene meldingen.</li>
    </ul>

    <h3>Leverandører</h3>
    <p>Disse leverandørene behandler opplysninger på vegne av Elevorganisasjonen, etter databehandleravtale:</p>
    <dl className="legal-list">
      <div><dt>Supabase</dt><dd>Database, innlogging og lagring av bilder og vedlegg. Serverne står i Stockholm i EU.</dd></div>
      <div><dt>GitHub Pages</dt><dd>Leverer selve nettsiden. GitHub ser IP-adressen din når siden lastes. GitHub er et selskap i USA.</dd></div>
      <div><dt>Google (Gmail)</dt><dd>Sender e-post med engangskoder, daglige sammendrag og invitasjoner. Meldingsinnhold sendes aldri på e-post.</dd></div>
    </dl>
    <p>Når opplysninger behandles av selskaper i USA, skjer det etter EUs standardavtaler eller EU–US Data Privacy Framework.</p>

    <h3>Hvor lenge vi lagrer opplysningene</h3>
    <dl className="legal-list">
      <div><dt>Konto, skole og verv</dt><dd>Så lenge du har profilen, og inntil 12 måneder etter at den er deaktivert.</dd></div>
      <div><dt>Historiske verv og CV</dt><dd>Til du ber om sletting.</dd></div>
      <div><dt>Innlegg og arrangementer</dt><dd>Til organisasjonen sletter dem. De tilhører organisasjonen, ikke deg som person.</dd></div>
      <div><dt>Meldinger</dt><dd>Til samtalen slettes eller du ber om sletting.</dd></div>
      <div><dt>Revisjonslogg</dt><dd>24 måneder.</dd></div>
      <div><dt>Modereringssaker</dt><dd>12 måneder etter avgjørelsen.</dd></div>
      <div><dt>Godkjente vilkår og samtykker</dt><dd>Så lenge de gjelder, og tre år etter.</dd></div>
    </dl>

    <h3>Rettighetene dine</h3>
    <ul>
      <li><strong>Innsyn:</strong> last ned alt vi har om deg under Profil → Personvern og konto.</li>
      <li><strong>Retting:</strong> endre navn, bilde og skole under Profil.</li>
      <li><strong>Deaktivering:</strong> du kan deaktivere profilen selv og aktivere den igjen senere.</li>
      <li><strong>Sletting:</strong> be om sletting under Profil. Navnet, e-postadressen, bildet og meldingene dine slettes. Innlegg du publiserte for elevrådet blir stående, men uten navnet ditt.</li>
      <li><strong>Protest:</strong> du kan protestere mot behandlingen ved å skrive til <Mail/>.</li>
      <li><strong>Klage:</strong> du kan klage til Datatilsynet hvis du mener vi behandler opplysningene dine feil.</li>
    </ul>

    <h3>Bilder</h3>
    <p>Når du laster opp et bilde, fjernes posisjon og annen informasjon i filen før den lagres. Legg bare ut bilder av andre når de vet om det og er med på det. Vil du ha fjernet et bilde av deg, kan du rapportere innlegget eller skrive til <Mail/>.</p>

    <h3>Informasjonskapsler</h3>
    <p>Elevrådsnett bruker bare lagring som trengs for at innloggingen og innstillingene dine skal virke. Se <button className="name-link" onClick={()=>onPage('cookies')}>Informasjonskapsler</button>.</p>

    <h3>Endringer</h3>
    <p>Endrer vi denne erklæringen vesentlig, får den en ny versjon, og du blir bedt om å lese og godta den neste gang du logger inn.</p>
  </>;
}

function Terms({onPage}:{onPage:(p:LegalPage)=>void}){
  return <>
    <Updated version={LEGAL_VERSIONS.terms}/>
    <h2>Vilkår for bruk</h2>
    <p>Vilkårene gjelder for alle som har profil i Elevrådsnett. Elevorganisasjonen driver tjenesten.</p>

    <h3>Hvem kan bruke Elevrådsnett</h3>
    <p>Elevrådsnett er for elever i ungdomsskolen og videregående skole, og for tillitsvalgte i lokallag, fylkeslag og Elevorganisasjonen. Du logger inn med din egen e-postadresse. Ikke del engangskoden med andre, og ikke la andre bruke profilen din.</p>

    <h3>Du publiserer for organisasjonen</h3>
    <p>Innlegg, kommentarer og stemmer gis på vegne av elevrådet eller styret du representerer, ikke deg som person. For å publisere må du ha et verv og ha fått publiseringsrett av en administrator. Elevrådsnett lagrer hvem som gjorde hva. Innlegg til «Alle» kan leses av hvem som helst, også uten innlogging.</p>

    <h3>Regler for innhold</h3>
    <ul>
      <li>Vær saklig og respektfull, også når du er uenig.</li>
      <li>Ikke trakasser, hets eller true noen, og ikke publiser diskriminerende innhold.</li>
      <li>Ikke del personopplysninger om andre, som telefonnummer, adresse eller helseopplysninger.</li>
      <li>Legg bare ut bilder av andre når de vet om det og er med på det.</li>
      <li>Ikke publiser reklame, spam eller ulovlig innhold, og ikke del andres innhold uten lov.</li>
    </ul>

    <h3>Meldinger</h3>
    <p>Meldinger er private mellom dem som er med i samtalen. Du kan blokkere personer og rapportere meldinger. Når du rapporterer en melding, deles bare den meldingen med moderator.</p>

    <h3>Moderering</h3>
    <p>Innhold som bryter reglene, kan skjules eller slettes. Ved alvorlige eller gjentatte brudd kan profilen få en advarsel, bli begrenset i sju dager eller bli deaktivert. Du kan klage på avgjørelsen, og saken vurderes da på nytt.</p>

    <h3>Verv og rettigheter</h3>
    <p>Rettigheter følger vervet. Når vervet slutter, eller elevrådet får nytt styre, avsluttes rettighetene. Vervene blir stående i CV-en din.</p>

    <h3>Pilot</h3>
    <p>Elevrådsnett er under utprøving. Funksjoner kan endres eller fjernes, og det kan oppstå feil. Vi tar ikke ansvar for tap av innhold, så ta vare på det som er viktig for dere også et annet sted. Si fra om feil til <Mail/>.</p>

    <h3>Avslutte</h3>
    <p>Du kan når som helst deaktivere profilen eller be om sletting under Profil. Les mer i <button className="name-link" onClick={()=>onPage('privacy')}>personvernerklæringen</button>.</p>

    <h3>Endringer i vilkårene</h3>
    <p>Endrer vi vilkårene vesentlig, får de en ny versjon, og du blir bedt om å godta dem neste gang du logger inn.</p>
  </>;
}

function Cookies(){
  return <>
    <Updated version={LEGAL_VERSIONS.cookies}/>
    <h2>Informasjonskapsler og lokal lagring</h2>
    <p>Elevrådsnett bruker ikke informasjonskapsler til sporing eller reklame. Vi lagrer bare det som trengs for at tjenesten skal virke, i nettleseren din. Det krever ikke samtykke, og derfor ser du ikke noe banner.</p>
    <dl className="legal-list">
      <div><dt>Innlogging</dt><dd>Holder deg innlogget (Supabase). Slettes når du logger ut.</dd></div>
      <div><dt>Visning av feeden</dt><dd>Husker om du valgte Anbefalt eller Nyeste.</dd></div>
      <div><dt>Personvernvalg</dt><dd>Husker hva du har valgt for valgfrie tjenester, når slike er slått på.</dd></div>
    </dl>
    <p>Hvis vi senere tar i bruk valgfrie tjenester, som bruksstatistikk, lastes de ikke før du har samtykket. Du kan når som helst endre eller trekke tilbake samtykket her.</p>
  </>;
}

function Contact(){
  return <>
    <h2>Kontakt</h2>
    <p>Spørsmål om tjenesten, personvern eller sikkerhet sender du til <Mail/>.</p>
    <h3>Rapporter innhold</h3>
    <p>Bruk «Rapporter» på innlegget eller meldingen. For meldinger deles bare meldingen du velger å rapportere.</p>
    <h3>Personvern</h3>
    <p>Du kan laste ned dataene dine, deaktivere profilen og be om sletting under Profil → Personvern og konto. Får du ikke det til, eller vil du ha innsyn i noe annet, skriv til <Mail/>.</p>
    <h3>Sikkerhet</h3>
    <p>Har du funnet en sikkerhetsfeil, eller tror du at noen har fått tilgang til opplysninger de ikke skulle hatt, skriv til <Mail/> med en gang.</p>
  </>;
}
