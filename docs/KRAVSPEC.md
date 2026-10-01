# Kravspesifikasjon for Elevrådsnett

Dette er den vedtatte planen for Elevrådsnett. Innholdet er uendret; bare skrivefeil og formatering er rettet. Promptene i `docs/PROMPTPLAN.md` viser til punktnumrene her.

Implementer Elevrådsnett som en sosial plattform der skoler, fylkesstyrer, lokallagsstyrer og Elevorganisasjonen kan publisere innhold, mens meldinger sendes mellom enkeltpersoner og grupper av enkeltpersoner. Vedlagt er en HTML-fil som viser designet til siden (`docs/design/elevradsnett.dc.html`). Det er slik det skal se ut. Men det er også ekstra funksjonalitet du må legge inn, og enkelte ting du må endre basert på planen under. Nye funksjoner skal følge samme visuelle stil, hvor bakgrunnen er hvit, #FF6340 er aksent, #FFB19F – #FFE0D9 – #FFEFEC er undertoner av aksenten som kan brukes. Og #0A466E brukes også, med #85A2B7 – #CEDAE2 – #E7ECF0 som aksent.

Behold dagens estetikk, responsive uttrykk og eksisterende sidestruktur i elevradsnett.html. Gjør eksisterende visuelle kontroller funksjonelle. Frontend og backend skal være tydelig separert slik at den samme backenden og datamodellen senere kan brukes av iPhone- og Android-apper.

Løsningen skal bruke Supabase til database, autentisering, fillagring, sanntidsoppdateringer og serverfunksjoner.

## 1. Faste produktbeslutninger

Følgende beslutninger skal legges til grunn:

- Det er ikke et separat skille mellom skole og elevråd i produktet.
- Skolens side representerer elevrådet, men navngis med skolens navn, for eksempel «Elvebakken vgs».
- Innlegg publiseres av skoler, fylkesstyrer, lokallagsstyrer eller sentralstyret (kalt EO Nasjonalt) – aldri som personlige innlegg.
- Systemet skal internt lagre hvilken bruker som utførte publiseringen.
- Offentlig vises organisasjonen som avsender, men med navnet på personen under slik som elevradsnett.html.
- Meldinger sendes kun mellom enkeltpersoner eller i grupper bestående av enkeltpersoner.
- En bruker kan være tilknyttet både en skole og et styre, men kan bare ha én aktiv representasjon om gangen, når de publiserer et innlegg, osv. Men begge vises på kontoen.
- Alle offentlige sider og alt publisert innhold kan leses uten innlogging.
- Meldinger, administrasjon, interne roller, revisjonslogger, utkast og andre private data er aldri offentlig tilgjengelige.
- Kontoopprettelse og valg av skole krever ikke administratorgodkjenning, men administrator kan endre skole og slette brukere.
- Valg av skole gir ikke automatisk rett til å publisere som skolen eller administrere siden.
- Det skal ikke implementeres alderskontroll eller aldersgrense.
- Funksjonen for å kombinere skoler skal fjernes helt.
- Deaktivering av skoler skal beholdes. Da skal brukeren bare dukke opp ved søk når man trykker «vis tidligere tillitsvalgte». Det skal være visuelt synlig på profilen at den er deaktivert. Den kan senere bli aktivert igjen om man får verv i nytt elevråd eller styre i EO.
- Styreadministrator i et fylkesstyre får også styreadministratorrettigheter for lokallaget vedkommende er tilknyttet. Dette gir ikke automatisk tilgang til andre lokallag.
- Dersom en bruker endrer skole, skal feed, fylke og lokallag oppdateres. Eksisterende administrator- og publiseringsrettigheter flyttes ikke automatisk.
- Selv om man bare kan representere en skole om gangen, skal man kunne bytte skole ved å starte på VGS eller bare bytte, uten at historikk fra tidligere skole er borte. Senere vil Feide-integrasjonen passe på at det oppdateres automatisk.

## 2. Organisasjonsmodell

Bruk én felles organisasjonsmodell med følgende organisasjonstyper:

- `national`: Elevorganisasjonen nasjonalt.
- `county_board`: fylkesstyre.
- `local_board`: lokallagsstyre.
- `school`: skolen og dens elevrådsside.

En skole skal:

- Tilhøre nøyaktig ett fylke.
- Kunne tilhøre null eller ett lokallag.
- Ha navn, slug, fylke, eventuelt lokallag, kontaktinformasjon, biografi, profilbilde, coverbilde og status – og om det er videregående eller ungdomsskole.
- Ha status som aktiv, deaktivert eller arkivert.
- Beholde innlegg, historiske verv og arrangementdeltakelse ved deaktivering.

Lokallagene som skal opprettes som standard er:

- Trondheim.
- Bergen.
- Oslo Vest.
- Oslo Sentrum.
- Oslo Øst.

EO-logoen skal brukes som standard profilbilde for:

- Elevrådsnett.
- Fylkesstyrer.
- Lokallag.

## 3. Brukere, tilknytninger og aktiv representasjon

En brukerprofil skal kunne ha:

- Navn.
- Profilbilde.
- E-post.
- Nåværende skole.
- Fylke og eventuelt lokallag utledet fra skolen.
- Offentlige verv.
- Administrative rettigheter.
- Historiske verv.
- Arrangementdeltakelse.
- Status som aktiv eller deaktivert.

En bruker kan ha flere organisatoriske tilknytninger, men grensesnittet skal alltid vise hvilken representasjon som er aktiv.

Eksempel:

- Elvebakken vgs.
- Fylkesstyret i Oslo.
- Oslo Vest lokallag.

Når brukeren bytter aktiv representasjon:

- Feed og navigasjon oppdateres til den valgte konteksten.
- Publiseringsdialogen viser tydelig hvilken organisasjon innlegget publiseres fra.
- Alle serveroperasjoner validerer at brukeren faktisk har rettighet i den valgte organisasjonen.
- Én handling kan aldri utføres på vegne av to organisasjoner samtidig.
- Personlige meldinger påvirkes ikke av aktiv representasjon.

Ved permanent skolebytte:

- Brukeren kan selv velge ny skole uten administratorgodkjenning.
- Feed og geografisk tilhørighet oppdateres.
- Historiske verv ved gammel skole beholdes med sluttdato.
- Brukeren får ikke administrator- eller publiseringsrettigheter ved ny skole før en autorisert administrator tildeler disse.
- Dersom brukeren er siste administrator ved gammel skole, må administratoroverføring gjennomføres før vervet kan avsluttes.

## 4. Roller og rettigheter

Skill mellom offentlige verv og tekniske rettigheter.

### Offentlige verv

Eksempler:

- Elevrådsleder.
- Nestleder.
- Elevrådsmedlem.
- Fylkesleder.
- Fylkesstyremedlem.
- Lokallagsleder.
- Lokallagsstyremedlem.
- Sentralstyremedlem.

Offentlige verv vises på brukerprofilen og den relevante organisasjonssiden.

### Interne rettigheter

- Superadministrator.
- Styreadministrator.
- Skoleadministrator.
- Innholdsansvarlig.

Rollen «innholdsansvarlig» skal ikke være synlig for vanlige eller ikke-innloggede brukere. Den skal bare være synlig for relevante administratorer og personen selv.

Alle roller og verv skal være knyttet til:

- Bruker.
- Organisasjon.
- Startdato.
- Sluttdato.
- Status.
- Hvem som tildelte rollen.
- Tidspunkt for tildeling og tilbakekalling.

### Superadministrator

Superadministrator kan:

- Administrere alle brukere og organisasjoner.
- Tildele og tilbakekalle alle administrative rettigheter.
- Administrere alle innlegg, kommentarer og arrangementer.
- Se aggregert statistikk.
- Administrere placeholders.
- Endre globale standardbilder og fylkesbilder.
- Deaktivere og reaktivere skoler.
- Importere og eksportere skoler via CSV.
- Gjenopprette administratortilgang dersom en skole mangler administrator.
- Se full revisjonslogg.
- Behandle modereringssaker og klager.

### Styreadministrator

Styreadministrator kan innenfor sitt geografiske område:

- Administrere fylkes- eller lokallagssiden.
- Publisere og administrere innlegg fra eget styre.
- Importere og eksportere skoler.
- Moderere offentlige innlegg og kommentarer fra skolene i sitt område.
- Tildele offentlige verv og rollen innholdsansvarlig.
- Opprette og administrere arrangementer.
- Velge standard profil- og coverbilde for skolene i området.
- Deaktivere skoler med begrunnelse.
- Starte administrativ gjenoppretting dersom en skole ikke gjennomfører styreoverføring.
- Se relevante revisjonslogger, men ikke private meldinger.

En fylkesstyreadministrator får også samme rettigheter for sitt registrerte lokallag. Vedkommende får ikke tilgang til andre lokallag i fylket.

### Skoleadministrator

Skoleadministrator kan:

- Administrere skolens side.
- Oppdatere biografi, kontaktinformasjon, profilbilde og coverbilde.
- Tildele og avslutte offentlige verv.
- Tildele eller fjerne rollen innholdsansvarlig.
- Invitere ny administrator.
- Gjennomføre styreoverføring.
- Administrere skolens innlegg og arrangementdeltakelse.

### Innholdsansvarlig

Innholdsansvarlig kan:

- Publisere, redigere og slette innlegg fra den aktuelle organisasjonen.
- Moderere kommentarer på organisasjonens egne innlegg.
- Tagge arrangementer.
- Opprette avstemninger.
- Laste opp bilder og videoer.

Innholdsansvarlig kan ikke tildele roller eller endre administratorer.

## 5. Overføring til nytt elevrådsstyre

Hver skole skal ha:

- Dato for neste valg eller forventet styreskifte.
- Nåværende styreperiode.
- Minst én aktiv skoleadministrator.
- Anbefaling om minst to administratorer.

Dato for neste styreskifte registreres ved første innlogging eller senere i administrasjonspanelet.

### Varsler

Systemet sender varsel til alle skoleadministratorer:

- 14 dager før.
- 7 dager før.
- Dagen før.
- Ukentlig etter datoen dersom overføringen ikke er fullført.

Varsler sendes i plattformen og på e-post. Senere skal samme system kunne brukes til pushvarsler i mobilappene.

### Overføringsveiviser

En administrator velger «Start styreoverføring» og:

- Bekrefter eller oppdaterer datoen for styreskiftet.
- Registrerer sluttdato for det gamle styret.
- Velger eksisterende brukere eller inviterer nye brukere.
- Tildeler nye offentlige verv.
- Velger minst én ny skoleadministrator.
- Velger eventuelle nye innholdsansvarlige.
- Angir datoen de nye rettighetene skal aktiveres.
- Ser en forhåndsvisning av alle endringene.
- Bekrefter overføringen.

Den nye administratoren må logge inn og akseptere rollen. Inntil rollen er akseptert, beholder den gamle administratoren nødvendig tilgang. Systemet skal ikke tillate at siste administrator fjerner seg selv uten at en etterfølger har akseptert.

En bruker kan spørre om å bli skoleadministrator og styreadministrator kan godkjenne.

På aktiveringsdatoen:

- Nye roller aktiveres.
- Gamle verv får sluttdato.
- Gamle administratorrettigheter avsluttes i henhold til overføringen.
- Historiske verv beholdes på CV-en.
- Alle endringer registreres i revisjonsloggen.

Hvis overføringen ikke er fullført innen 7 dager etter oppgitt dato, varsles relevant styreadministrator. Styreadministrator kan da gjennomføre en dokumentert gjenopprettingsprosess. Superadministrator er siste eskaleringsnivå.

Dersom valget utsettes, kan datoen endres.

## 6. Feed, søk og følging

Feeden skal vise:

- Innlegg fra organisasjoner brukeren følger.
- Innlegg fra brukerens skole, fylke og lokallag.
- Prioriterte innlegg fra EO og relevant fylkes-/lokallag.
- Nye og relevante innlegg fra andre skoler.

Første versjon skal bruke en enkel, dokumentert rangeringsmodell basert på:

- Prioriteringsstatus.
- Geografisk relevans.
- Om brukeren følger organisasjonen.
- Om det er samme skoleform: videregående eller ungdomsskole.
- Publiseringstidspunkt.
- Begrenset vekt på reaksjoner og kommentarer.

Meldinger, sensitiv profilinformasjon og privat aktivitet skal aldri brukes i rangeringen.

Brukeren skal kunne velge:

- Anbefalt feed.
- Kronologisk feed.

Når skole eller aktiv representasjon endres, skal feeden beregnes på nytt.

Søk skal dekke:

- Skoler.
- Fylkesstyrer.
- Lokallag.
- Personer.
- Arrangementer.
- Innlegg.

Deaktiverte personer og skoler skal ikke vises i vanlig søk. Tidligere tillitsvalgte kan finnes gjennom et eksplisitt filter.

## 7. Innlegg og offentlig aktivitet

Innlegg skal støtte:

- Tekst.
- Bilder.
- Video.
- Avstemninger.
- Tagging av arrangement.
- Redigering og sletting.
- Utkast.
- Forhåndsvisning.
- Målgruppe (videregående, ungdomsskole eller begge).
- Modereringsstatus.

Tillatte målgrupper:

- Offentlig.
- Skoler i eget fylke.
- Skoler i eget lokallag.
- Venneråd.

«Venneråd» skal implementeres som en gjensidig godkjent forbindelse mellom to skoler. Skoleadministratorer administrerer forbindelsene.

Alle synlighetsregler skal håndheves i databasen, ikke bare i grensesnittet.

Innlegg skal alltid ha:

- Avsenderorganisasjon.
- Brukeren som utførte publiseringen.
- Opprettelses- og endringstidspunkt.
- Publiseringsstatus.
- Målgruppe.
- Eventuell modereringsstatus.

Redigerte innlegg merkes som redigert. Administratorer skal kunne se endringshistorikk.

### Kommentarer, reaksjoner og avstemninger

- Offentlige kommentarer skrives på vegne av brukerens aktive skole eller styre.
- Systemet lagrer hvilken bruker som skrev kommentaren.
- Bare brukere med et aktivt verv i organisasjonen kan kommentere på dens vegne.
- Reaksjoner knyttes til innlogget bruker, men bare samlet antall vises offentlig.
- Avstemninger skal som standard tillate én stemme per representert organisasjon.
- En stemme kan endres frem til avstemningen avsluttes.
- Avstemninger kan ha sluttdato.
- Resultatet vises etter avgitt stemme eller når avstemningen er avsluttet.

Dersom en ikke-innlogget bruker prøver å reagere, kommentere, stemme, følge eller melde seg på et arrangement, skal det åpnes en innloggingsdialog. Etter innlogging skal brukeren returneres til den opprinnelige handlingen.

### Deling

Delingsknappen skal:

- Kunne kopiere en offentlig lenke.
- Bruke Web Share API der det støttes.
- Aldri gjøre privat eller avgrenset innhold offentlig.

## 8. Arrangementer og CV

Følgende må skilles:

- En persons interessemarkering.
- En skoles påmelding.
- Navngitte delegater.
- Bekreftet faktisk deltakelse.

Arrangementer skal ha:

- Arrangørorganisasjon.
- Tittel og beskrivelse.
- Start- og sluttid.
- Sted eller digital lenke.
- Påmeldingsfrist.
- Kapasitet.
- Målgruppe.
- Bilde.
- Status: utkast, publisert, avlyst eller avsluttet.

En skoleadministrator eller innholdsansvarlig kan melde på skolen og registrere delegater. Delegatene skal varsles og kunne bekrefte deltakelsen.

Bare bekreftet deltakelse legges permanent til brukerens og skolens CV.

Bruker-CV skal vise:

- Historiske og aktive verv.
- Bekreftede arrangementer.
- Én stjerne for hver bekreftede deltakelse på Elevtinget.

Skolens CV skal vise:

- Arrangementer skolen har deltatt på.
- Hvilke personer som representerte skolen.
- Årstall og eventuelt verv under arrangementet.

Tagging av et arrangement i et innlegg oppretter ikke automatisk bekreftet CV-deltakelse.

## 9. Meldinger

Meldinger skal alltid være personlige. Organisasjoner skal ikke være avsender eller mottaker.

Systemet skal støtte:

- Direktemeldinger mellom to personer.
- Vanlige gruppechatter.
- Systemadministrerte skole- og styregrupper.
- Søk etter personer.
- Søk etter skole, fylkesstyre eller lokallag for å finne tilknyttede personer eller starte en relevant gruppe.

Når en bruker velger en organisasjon i meldingssøk, skal løsningen vise offentlige kontaktpersoner og eventuelt tilby å opprette en gruppe med organisasjonens aktive medlemmer. Det skal ikke opprettes en organisasjonsinnboks.

### Systemadministrerte grupper

Hver skole og hvert styre kan ha en medlemsgruppe som oppdateres fra aktive verv:

- Nye medlemmer legges til når vervet starter.
- Tidligere medlemmer mister tilgang når vervet avsluttes.
- Nye medlemmer får som standard bare se meldinger fra tidspunktet de ble medlem.
- Meldingshistorikken beholdes for eksisterende medlemmer.
- Gruppeadministrator kan være organisasjonens administrator, men kan ikke lese meldinger uten å være medlem av gruppen.

Meldinger skal støtte:

- Ulest-status.
- Lest-status dersom dette aktiveres.
- Varsler og demping.
- Vedlegg.
- Sletting for egen visning.
- Rapportering.
- Blokkering.
- Mulighet til å forlate vanlige grupper.

Superadministratorer og styreadministratorer skal ikke kunne lese private meldinger gjennom adminpanelet. Eventuell håndtering av rapporterte meldinger skal begrenses til det konkrete innholdet som brukeren aktivt rapporterer.

## 10. Profiler og kontolivssyklus

Alle brukere kan:

- Endre eget profilbilde.
- Oppdatere tillatte profilopplysninger.
- Deaktivere egen profil.
- Be om eksport eller sletting av egne personopplysninger.

Ved deaktivering:

- Brukeren kan ikke publisere, kommentere, stemme eller sende meldinger.
- Brukeren fjernes fra aktive grupper.
- Brukeren skjules fra vanlig søk.
- Historiske verv kan finnes gjennom «Vis tidligere tillitsvalgte».
- Historiske innlegg forblir knyttet til organisasjonen.
- Revisjonslogg og nødvendig historikk beholdes i henhold til fastsatt lagringstid.

Reaktivering skjer når:

- Brukeren selv aktiverer profilen igjen.
- Brukeren aksepterer et nytt verv ved en skole, et styre eller EO.
- En autorisert administrator gjenoppretter profilen.

Dersom brukeren selv har bedt om deaktivering, skal ikke en administrator kunne gjøre profilen offentlig aktiv uten at brukeren aksepterer.

Deaktivering og permanent sletting skal være to forskjellige prosesser.

## 11. Bilder, videoer og fillagring

Definer separate lagringsområder for:

- Offentlige profilbilder.
- Offentlige coverbilder.
- Offentlige innlegg og arrangementer.
- Private meldingsvedlegg.

Implementer:

- Filstørrelsesgrenser.
- Tillatte filtyper.
- Kontroll av faktisk MIME-type.
- Bildeoptimalisering.
- Fjerning av EXIF- og GPS-data.
- Videominiatyrbilder og behandlingsstatus.
- Tidsbegrensede lenker for private vedlegg.
- Sletting av filer når tilknyttet innhold slettes.

Placeholders skal ha feltet `is_placeholder`. De skal bruke tydelig merkede AI-genererte illustrasjoner som ikke fremstiller identifiserbare virkelige elever. Superadministrator skal kunne finne og slette alle placeholders samlet eller enkeltvis.

## 12. Adminpanel

Adminpanelet skal inneholde:

- Brukeradministrasjon.
- Organisasjonsadministrasjon.
- Rolle- og vervadministrasjon.
- Styreoverføringer og forsinkede overføringer.
- Innlegg, kommentarer og arrangementer.
- Modereringskø.
- Medieadministrasjon.
- Placeholders.
- Skoleimport.
- Deaktiverte skoler.
- Revisjonslogg.
- Aggregert statistikk.

Statistikk kan omfatte:

- Aktive brukere og skoler.
- Nye brukere.
- Publiserte innlegg.
- Kommentarer og reaksjoner.
- Arrangementpåmeldinger.
- Fullførte styreoverføringer.
- Modereringssaker.

Privat meldingsinnhold skal ikke inngå. Bare nødvendige, aggregerte metadata kan brukes.

## 13. CSV-import og eksport

Bruk én UTF-8 CSV-rad per skole med minst:

- Stabil ekstern ID.
- Skolenavn.
- Slug.
- Organisasjonsnummer dersom tilgjengelig.
- Fylke.
- Lokallag dersom relevant.
- Kontakt-e-post.
- Aktiv/deaktivert status.
- Dato for neste styrevalg dersom kjent.

Adminpanelet skal støtte:

- Nedlasting av tom mal.
- Eksport filtrert per fylke.
- Opplasting med forhåndsvisning.
- Validering uten å endre databasen.
- Visning av nye, endrede og ugyldige rader.
- Eksplisitt bekreftelse før import.
- Importlogg og mulighet til å finne hvilke rader en import endret.

Import skal oppdatere skoler etter stabil ID, ikke bare navn.

## 14. Banner- og profilbildehierarki

Bruk følgende prioritet:

1. Eget bilde valgt for skolen.
2. Standard fra lokallaget.
3. Standard fra fylket.
4. Global standard.

Administratorgrensesnittet skal vise om bildet er eget eller arvet. En overordnet administrator kan angi standard, men skolens eget bilde skal overstyre standarden med mindre superadministrator eksplisitt låser bildet.

## 15. Moderering

Implementer rapportering av:

- Innlegg.
- Kommentarer.
- Profiler.
- Bilder og videoer.
- Meldinger, der rapportøren aktivt velger hvilket innhold som deles med moderator.

En modereringssak skal ha:

- Rapportør.
- Rapportert innhold.
- Kategori.
- Beskrivelse.
- Status.
- Ansvarlig moderator.
- Handling.
- Begrunnelse.
- Tidsstempler.

Støtt:

- Skjuling.
- Sletting.
- Advarsel.
- Midlertidig begrensning.
- Deaktivering.
- Gjenoppretting.
- Klage og ny vurdering.

## 16. Personvern og juridiske sider

Lag:

- Personvernerklæring.
- Vilkår.
- Kontakt.
- Cookie-/sporingsinformasjon.
- Innstillinger for personvern og samtykke.

Kontaktadressen skal være teknisk@elev.no.

Cookiebanner skal bare vises dersom valgfrie informasjonskapsler eller sporing faktisk brukes. Hvis løsningen bare bruker strengt nødvendige innloggingscookies, skal disse forklares uten unødvendig samtykkebanner.

Ved valgfri analyse eller sporing:

- Ingen slik teknologi aktiveres før samtykke.
- «Godta» og «Avvis» skal være like tilgjengelige, men godta skal være oransje og avvis skal være hvit.
- Formål skal kunne velges separat.
- Samtykke skal kunne trekkes tilbake.
- Samtykket og versjonen av informasjonen skal dokumenteres.

Definer og dokumenter:

- Behandlingsansvarlig.
- Databehandlere.
- Behandlingsgrunnlag.
- Datatyper og formål.
- Lagringstider.
- Retting, innsyn, eksport og sletting.
- Håndtering av personvernbrudd.
- Rutiner for bilder og videoer av elever.
- Vurdering av personvernkonsekvenser før produksjonslansering.

## 17. Supabase og sikkerhet

Bruk Supabase Auth for identitet, men hent dynamiske roller og organisasjonstilknytninger fra databasen. Ikke stol utelukkende på roller lagret i JWT, fordi de kan være utdaterte etter en rolleendring.

Krav:

- Row Level Security på alle eksponerte tabeller og views.
- RLS på alle Storage-objekter.
- Eksplisitte regler for lesing, oppretting, endring og sletting.
- Offentlig lesetilgang bare til publisert offentlig innhold.
- Meldinger kan bare leses av aktive samtalemedlemmer.
- Private filer leveres med tidsbegrensede lenker.
- Service-/secret-nøkler brukes bare server-side.
- MFA kreves for superadministratorer og anbefales for andre administratorer.
- Rate limiting på innlogging, meldinger, kommentarer, søk og opplasting.
- Server-side validering av alle rettigheter.
- Rensing av brukerinnhold mot XSS.
- Beskyttelse mot spam og kontoopplisting.
- Revisjonslogg for alle administrative handlinger.
- Backup og dokumentert gjenoppretting av både database og Storage.
- Ingen administrator kan tildele seg selv et høyere nivå.
- Siste administrator kan ikke fjernes uten en akseptert etterfølger.

Bruk transaksjonssikre serverfunksjoner for:

- Rolletildeling.
- Styreoverføring.
- Deaktivering av skole.
- Modereringshandlinger.
- Bekreftelse av arrangementdeltakelse.
- CSV-import.

## 18. Sentrale datatabeller

Datamodellen bør minst omfatte:

- `profiles`
- `organizations`
- `organization_relations`
- `memberships`
- `role_grants`
- `board_terms`
- `election_schedules`
- `handover_processes`
- `handover_invites`
- `posts`
- `post_media`
- `tags`
- `post_tags`
- `comments`
- `reactions`
- `follows`
- `organization_connections`
- `polls`
- `poll_options`
- `poll_votes`
- `events`
- `event_organization_registrations`
- `event_delegates`
- `conversations`
- `conversation_members`
- `messages`
- `message_attachments`
- `notifications`
- `notification_preferences`
- `moderation_reports`
- `moderation_actions`
- `audit_logs`
- `import_batches`
- `legal_document_versions`
- `consent_records`

Bruk fremmednøkler, unike begrensninger, tidsstempler og statuser som hindrer ugyldige kombinasjoner.

## 19. Brukeropplevelse og universell utforming

Behold eksisterende visuell stil, men implementer:

- Mobiltilpasset layout.
- Tastaturnavigasjon.
- Synlige fokusmarkeringer.
- Tilgjengelige navn på alle ikonknapper.
- Tilstrekkelig kontrast.
- Skjermleservennlige skjemaer og feilmeldinger.
- Lastetilstander.
- Tomme tilstander.
- Feiltilstander.
- Bekreftelse ved irreversible handlinger.
- Optimistiske oppdateringer bare når de kan rulles tilbake trygt.

## 20. Teknisk struktur

Frontend skal ikke inneholde direkte forretningslogikk for roller og tilgang.

Del løsningen i:

- UI-komponenter.
- Domene- og tjenestelag.
- Supabase-klient for vanlige brukeroperasjoner.
- Serverfunksjoner for privilegerte operasjoner.
- Felles typer og valideringsskjemaer.
- Et API-/tjenestegrensesnitt som senere kan brukes fra mobilapper.

Lever:

- Versjonerte database- og Storage-migrasjoner.
- Seed-data som er tydelig merket som demo/placeholders.
- Komplett RLS-matrise.
- Automatiserte rettighets- og sikkerhetstester.
- Tester av styreoverføring og rolleutløp.
- Dokumentasjon for lokalt oppsett og produksjonsoppsett.
- Miljøvariabeleksempel uten hemmelige nøkler.
- Backup- og gjenopprettingsrutine.
- Ingen hardkodede produksjonsbrukere, datoer, skoler eller innlegg.

## 21. Anbefalt implementeringsrekkefølge

1. Kartlegg og bevar dagens design og sider.
2. Opprett Supabase-migrasjoner og organisasjonsmodell.
3. Implementer innlogging, profiler og offentlige lesetilganger.
4. Implementer medlemskap, roller og aktiv representasjon.
5. Implementer styreoverføring og varsler.
6. Implementer innlegg, medier, kommentarer, avstemninger og følging.
7. Implementer feed og søk.
8. Implementer arrangementer og CV.
9. Implementer personlige meldinger og grupper.
10. Implementer adminpanel, CSV-import og moderering.
11. Implementer juridiske sider og personvernfunksjoner.
12. Fullfør RLS-, sikkerhets-, tilgjengelighets- og integrasjonstester.

## 22. Akseptansekriterier

Implementeringen er ikke ferdig før:

- Alle synlige hovedfunksjoner i prototypen enten fungerer eller er eksplisitt fjernet.
- Ingen bruker kan opptre som en organisasjon uten aktiv rettighet.
- En bruker kan bytte mellom skole og styre, men aldri publisere som begge samtidig.
- Feed oppdateres ved skole- eller representasjonsbytte.
- Offentlig innhold fungerer uten innlogging.
- Private meldinger er utilgjengelige for alle utenfor samtalen.
- Styreoverføring kan fullføres uten at skolen blir stående uten administrator.
- Forfalte styreoverføringer eskaleres til relevant styreadministrator.
- Historiske verv og arrangementdeltakelser bevares korrekt.
- Deaktivering av skole eller bruker ikke ødelegger historisk innhold.
- Alle rolle- og administrasjonshandlinger logges.
- RLS-testene dokumenterer at data ikke kan leses eller endres på tvers av rettighetsområder.
- Webløsningen fungerer på mobilbredde og er klargjort for en senere felles mobilbackend.
