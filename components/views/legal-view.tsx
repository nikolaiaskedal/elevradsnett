import { legalPages, type LegalPage } from '@/components/routing';

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
