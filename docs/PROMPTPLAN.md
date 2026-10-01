# Promptplan for Elevrådsnett

Planen deler `docs/KRAVSPEC.md` inn i prompter som sendes én om gangen, hver i en egen økt. Hver prompt avsluttes med at endringene merges til `main` (se `CLAUDE.md`) før neste prompt sendes. Punktnumre (§) viser til kravspesifikasjonen.

## Status

| Prompt | Status | Merget |
|---|---|---|
| 1. Fundament | Ferdig | PR #3, #4 |
| 2. Datamodell og Supabase-prosjekt | Ferdig, med to manuelle steg (se under) | PR #7, #10 |
| 3. Innlogging, profiler og offentlig lesing | Ferdig, med manuelle steg (se *Før prompt 4*) | PR #13 |
| 4. Medlemskap, roller og aktiv representasjon | Ferdig | se git-loggen |
| 5. Innlegg | Neste | – |
| 6.–8. Bilder, kommentarer m.m., feed og søk | Ikke startet | – |
| 9. Arrangementer og CV | Ferdig, med ett manuelt steg (se under) | se git-loggen |

Neste prompt som skal sendes er **prompt 5**. Prompt 9 er gjort før 5–8 etter ønske; se *Før neste prompt (etter prompt 9)*. Sjekk først at stegene 3–6 under *Før prompt 4* er gjort (e-postmal, OTP-innstillinger og GitHub-variablene).

## Utgangspunkt etter prompt 9 (1. oktober 2026)

Prompt 9 ble gjort før prompt 5–8. Den bygger bare på prompt 1–4.

- Interesse, påmelding, delegater og bekreftet oppmøte er fire adskilte ting (§8):
  - **Interesse** er personlig (`event_interests`, `set_event_interest`) og krever bare innlogging.
  - **Påmelding** gjelder organisasjonen (`register_for_event`), gjøres av skoleadministrator, innholdsansvarlig eller styreadministrator, og følger kapasitet (venteliste), frist og målgruppe.
  - **Delegater** meldes på av den samme (`add_event_delegate`), varsles i `notifications` og bekrefter eller takker nei selv (`respond_event_delegation`).
  - **Oppmøte** bekreftes bare av arrangøren etter start (`confirm_event_attendance`, `confirm_all_event_attendance`). Bare dette gir CV-oppføring.
- Styreadministrator i et styre eller EO oppretter, redigerer, publiserer, avlyser og avslutter arrangementer (`save_event`, `set_event_status`) og laster opp bilde (`set_event_image`, `public-content/<arrangør>/events/<id>/`). Utkast vises bare for arrangøren.
- CV: `#/person/<id>` viser offentlige verv, arrangementer med bekreftet oppmøte og én stjerne per Elevting (landsmøte hos EO nasjonalt). Profilen viser egne invitasjoner og CV. Skolens side viser deltakelse med årstall, hvem som representerte skolen og vervet deres.
- «Skal» fra designet er erstattet av påmelding på arrangementsiden. Arrangementer kan ikke tagges i innlegg ennå; det kommer med prompt 5.
- Varslene lagres i `notifications`, men vises ikke før prompt 11 (varsler og e-postsammendrag).
- Demoen har datoer relativt til i dag, og Ida har deltatt på forrige Elevting og vårsamlingen og er invitert til fylkessamlingen.
- Databasetestene ligger i `supabase/tests/arrangementer_cv.sql`.

### Før neste prompt (etter prompt 9, manuelt, ca. 5 minutter)

1. Kjør hele `supabase/migrations/202610090001_arrangementer_cv.sql` i SQL Editor i Supabase. Supabase-koblingen fra Claude krever bekreftelse for SQL med `delete` (inne i funksjonene), så den kunne ikke kjøres fra økten.
2. Til det er gjort, viser appen arrangementene via den gamle `list_public_events`, men oppretting, påmelding, delegater og CV gir feilmelding.

## Utgangspunkt etter prompt 4 (1. oktober 2026)

- Toppmenyen har en velger som viser hvem brukeren representerer og alle tilknytningene, med verv og om de gir publiseringsrett. Ved bytte hentes feeden for den nye representasjonen. Verv i deaktiverte organisasjoner vises merket og kan ikke velges.
- Offentlige verv (`memberships`) og interne rettigheter (`role_grants`) er adskilt. Verv tildeles og avsluttes med `assign_public_office` og `end_public_office`, rettigheter med `assign_role` og `revoke_role`. Hvem som kan tildele hva, står i `docs/RLS_MATRIX.md`. Innholdsansvarlig er bare synlig for administratorer og personen selv.
- Ingen kan gi seg selv rettigheter, og siste skole-, styre- eller superadministrator kan ikke fjernes før en etterfølger har fått rollen.
- Forespørsel om å bli skoleadministrator: eleven ber fra profilen, styreadministrator i lokallaget eller fylket godkjenner eller avslår under Administrasjon → Forespørsler.
- Administrasjonen viser organisasjonene serveren sier brukeren administrerer (`list_my_admin_organizations`). Oversikt (med revisjonslogg), Roller og verv og Forespørsler er ekte. Styreoverføring, Skoler, Moderering og CSV er fortsatt statiske (prompt 11–13).
- Alle endringer av verv, rettigheter og forespørsler logges i `audit_logs` og vises i revisjonsloggen med navn.
- Deaktiverte organisasjoner kan åpnes (`get_public_organization`) og er tydelig merket. `has_active_membership` krever nå aktiv organisasjon, så ingen kan publisere, kommentere eller stemme for en deaktivert organisasjon. Innlegg fra deaktiverte brukere vises med «Tidligere tillitsvalgt».
- Profilen viser egne verv og rettigheter, også tidligere, med «Gå av» og «Gi fra deg».
- Demoen: Ida er skoleadministrator på Elvebakken og styreadministrator i Oslo (og dermed i Oslo Sentrum lokallag). Frida Aas ved Oslo handelsgymnasium har en ventende forespørsel.
- Migrasjonen `202610030001_medlemskap_roller.sql` har ingen `drop`, og er kjørt i pilotprosjektet.
- Databasetestene for prompt 4 ligger i `supabase/tests/medlemskap_roller.sql`.

## Utgangspunkt etter prompt 3 (1. oktober 2026)

- Innlogging med sekssifret engangskode på e-post (Supabase Auth). Telefonnummer og Feide vises som «Kommer senere».
- Handlinger som krever innlogging åpner en innloggingsdialog over siden, og handlingen fullføres etter innlogging. Meldinger, Profil og Administrasjon viser innloggingen i stedet for siden.
- Nye brukere går gjennom onboarding (skole, navn og valgfri dato for neste valg). Profilen opprettes først da (`complete_onboarding`).
- Profilsiden: profilbilde (kodes om i nettleseren, så EXIF og GPS forsvinner), navn, skolebytte med historikk, representasjoner og utlogging.
- Alt offentlig kan leses uten innlogging via `list_public_organizations`, `get_post_cards` og `list_public_events`. Appen laster nå mot Supabase når variablene er satt. `listConversations` og noen handlinger (følge, støtte, rapportere, kontakte) kaster fortsatt `NotImplementedError` og gir en feilmelding; de kobles i senere prompter.
- Brukeren kan ikke lenger endre egen profil direkte i tabellen (`profiles_self_update` er fjernet). Alt går via RPC-er.
- `get_ranked_feed` feilet etter at `posts` fikk søkekolonnen i prompt 2. Den er rettet og returnerer nå bare innlegg og poeng.
- Demoen (uten Supabase-variabler) starter nå uten innlogging. Koden er `123456`; med `ida.halvorsen@example.invalid` blir du Ida, andre adresser går til onboarding.
- Migrasjonen `202610020001_innlogging_profiler.sql` er kjørt i pilotprosjektet (manuelt, steg 2 under *Før prompt 4*).

## Utgangspunkt etter prompt 2 (1. oktober 2026)

- Frontend: Vite + React SPA med én fil per visning i `components/views/`, og et tjenestelag med `DemoElevradsnettService` og `SupabaseElevradsnettService`. Appen kjører fortsatt på demodata.
- Databasen: migrasjonene i `supabase/migrations/` dekker alle tabellene i §18, og i tillegg det som manglet før piloten:
  - målgruppe etter skoleform på innlegg (`publish_post`, feeden)
  - endringshistorikk for innlegg (`edit_post`, `post_revisions`)
  - blokkering i meldinger (`user_blocks`)
  - forespørsel om å bli skoleadministrator (`request_school_admin`, `decide_school_admin_request`)
  - forespørsler om eksport og sletting av egne data (`request_personal_data`)
  - regelen om at fylkesstyreadministrator også får rettigheter i eget lokallag (`has_role`, `has_area_role`)
  - bildehierarki med lås (`resolve_organization_images`)
  - sanntid for meldinger, samtalemedlemskap og varsler
  - fulltekstsøk på norsk (`search`)
  - bare offentlige funksjoner kan kalles uten innlogging
- Ingen av funksjonene over har knapper i grensesnittet ennå. `docs/FUNKSJONSKART.md` viser hvilken prompt som kobler dem til.
- Tester: `npm run test:db` kjører RLS- og databasetestene i `supabase/tests/`. CI kjører dem mot lokal Supabase på alle PR-er og sjekker at `lib/supabase/database.types.ts` er oppdatert.
- Pilotprosjektet i Supabase finnes: `elevradsnett-pilot` (ref `ibipqyombdmtfvgthugz`, eu-north-1). Migrasjonene er kjørt, og 15 fylkesstyrer, 471 skoler, EO nasjonalt og de fem lokallagene er lastet inn.
- Gjenstår fra prompt 2, gjøres manuelt i SQL Editor i Supabase: den nye versjonen av `publish_post` (med skoleform) og `set_event_response`. Lim inn hele `supabase/manual/gjenstar_fra_prompt2.sql` og kjør den. Supabase-koblingen krever en bekreftelse for SQL med `drop`/`delete` som ikke kan gis fra en Claude-økt.
- Supabase-verdiene er ikke lagt inn som GitHub Actions-variabler. Det gjøres i prompt 3, når appen kan hente innlogging og data fra Supabase. Før det ville GitHub Pages-siden sluttet å virke.
- Kjent hull, egen oppgave: `has_role` og `can_view_post` ligger fortsatt i `public` og kan kalles uten innlogging, fordi RLS for offentlig lesing trenger dem. Hjelperne bør flyttes til et skjema som API-et ikke viser.
- Funksjonen for å kombinere skoler finnes ikke i koden.

## Hosting og tjenester

**Alt i piloten skal være gratis.** Funksjoner som koster penger å drive, bygges ikke før piloten. Står de i designet, vises de som deaktiverte med merket «Kommer senere», på samme måte som Feide-knappen. Listen over hva som kommer senere står under tabellen.

| Hva | Valg | Kostnad | Merknad |
|---|---|---|---|
| Frontend | GitHub Pages | Gratis | Allerede satt opp med `.github/workflows/static.yml`. Publiseres ved hver merge til `main`. Krever offentlig repo, og har ingen egne HTTP-headere eller testversjon per PR. Før full lansering byttes det til Cloudflare Pages (også gratis), siden GitHub sine vilkår ikke er ment for å drive en tjeneste. |
| Backend | Supabase Free, region eu-north-1 | Gratis | 500 MB database, 1 GB lagring, 50 000 aktive brukere per måned, ingen automatisk backup og pause etter en uke uten bruk. Den nattlige backupen holder prosjektet aktivt. Utvikling kjøres lokalt med Supabase CLI. |
| Innlogging | Supabase Auth med engangskode på e-post | Gratis | Innlogging med telefonnummer krever SMS, som koster per melding. Den kommer senere. |
| E-post | Gmail SMTP fra en egen Gmail-konto for tjenesten | Gratis | Krever ikke eget domene. Ca. 500 e-poster per døgn. Brukes som SMTP for Supabase Auth, siden Supabase sin innebygde e-post bare sender til medlemmer av Supabase-organisasjonen. Avsender blir Gmail-adressen. Har Elevorganisasjonen e-post på Google Workspace, kan en eksisterende `@elev.no`-postkasse brukes på samme måte, også uten DNS-endringer. Byttes til Resend med eget domene før full lansering. Oppsett: se *Før prompt 3* under. |
| Domene | Ingen i piloten: `nikolaiaskedal.github.io/elevradsnett` | Gratis | Innlogging, Turnstile og GitHub Pages fungerer uten eget domene. Underdomenet av `elev.no` (f.eks. `nett.elev.no`) settes opp før full lansering, sammen med Resend og Cloudflare Pages. |
| Spambeskyttelse | Cloudflare Turnstile | Gratis | Fungerer på alle vertsnavn, også `github.io`. |
| Feillogging | Sentry | Gratis | 5000 feil per måned. |
| Analyse | PostHog Cloud EU (Frankfurt) | Gratis opptil 1 mill. hendelser/mnd | Aktiveres først etter samtykke (§16), se prompt 17. |
| Backup | Nattlig `pg_dump` og kopi av Storage via GitHub Actions | Gratis | Erstatter backup som gratisplanen mangler. |
| MFA | TOTP (autentiseringsapp) i Supabase Auth | Gratis | MFA med SMS koster og brukes ikke. |

Alle tjenestene over er databehandlere og skal stå i personvernerklæringen (§16).

Grensene må overholdes i piloten. Spesielt e-post: engangskoder går foran varsler, og varsler på e-post samles i ett daglig sammendrag per bruker (prompt 11), så vi holder oss godt under grensen på ca. 500 per dag i Gmail (og 100 per dag i Resend etter piloten).

### Før prompt 3 (manuelt, ca. 15 minutter)

1. Kjør `supabase/manual/gjenstar_fra_prompt2.sql` i SQL Editor i Supabase.
2. Opprett en egen Gmail-konto for tjenesten, f.eks. `elevradsnett.pilot@gmail.com`. Bruk ikke en privat konto.
3. Slå på totrinnsbekreftelse på kontoen, og lag et appassord under *Google-konto → Sikkerhet → Appassord*.
4. I Supabase: *Authentication → Emails → SMTP Settings*. Slå på «Custom SMTP» og fyll inn vert `smtp.gmail.com`, port `465`, brukernavn = hele Gmail-adressen, passord = appassordet, avsendernavn `Elevrådsnett`.
5. I Supabase: *Authentication → URL Configuration*. Sett Site URL til `https://nikolaiaskedal.github.io/elevradsnett/` og legg samme adresse til under Redirect URLs.

Appassordet legges bare inn i Supabase, aldri i repoet eller i en `VITE_`-variabel.

### Før prompt 4 (manuelt, ca. 15 minutter)

Gjør stegene i denne rekkefølgen. Settes variablene i steg 5 før migrasjonen er kjørt, slutter GitHub Pages-siden å virke.

1. Gjør stegene 2–5 under *Før prompt 3* (Gmail SMTP og URL-oppsett) hvis de ikke er gjort.
2. ✅ Kjør hele `supabase/migrations/202610020001_innlogging_profiler.sql` i SQL Editor i Supabase. (Gjort.)
3. I Supabase: *Authentication → Emails → Templates*. For både «Magic Link» og «Confirm signup»: sett emnet til `Koden din til Elevrådsnett` og lim inn innholdet i `supabase/templates/engangskode.html`. Malen viser koden (`{{ .Token }}`), ikke en lenke.
4. I Supabase: *Authentication → Sign In / Providers → Email*. Sett «Email OTP Expiration» til `600` sekunder og «Email OTP Length» til `6`.
5. I GitHub: *Settings → Secrets and variables → Actions → Variables*. Legg til `VITE_SUPABASE_URL` = `https://ibipqyombdmtfvgthugz.supabase.co` og `VITE_SUPABASE_ANON_KEY` = den publiserbare nøkkelen (`sb_publishable_…`) fra *Project Settings → API Keys* i Supabase. Nøkkelen er offentlig og skal være synlig i nettleseren. Bruk aldri service role-nøkkelen.
6. Kjør «Deploy static content to Pages» på nytt under *Actions*, og test innlogging på `https://nikolaiaskedal.github.io/elevradsnett/`.

### Kommer senere (koster penger)

| Hva | Kostnad | Når |
|---|---|---|
| Innlogging med telefonnummer (engangskode på SMS via Twilio e.l.) | Ca. 0,5–1 kr per SMS | Når det finnes budsjett. Vises som «Kommer senere» i innloggingsdialogen fra prompt 3. |
| Eget domene, f.eks. `elevradsnett.no` | Ca. 150 kr/år | Ved full lansering, hvis underdomenet av `elev.no` ikke holder. `.no` registreres på Elevorganisasjonens organisasjonsnummer. |
| Resend med eget domene | Gratis opptil 100 per dag | Før full lansering, når underdomenet av `elev.no` er på plass. Erstatter Gmail SMTP fra piloten. |
| Supabase Pro med daglig backup | 25 USD/mnd | Før full lansering. |
| Mer lagring for video | Inngår i Pro, deretter per GB | Prompt 20. |
| Apple Developer Program | 99 USD/år | Prompt 18 og 21. Trengs for iOS-appen og push på iOS. |
| Google Play-konto | 25 USD én gang | Prompt 21. |
| Større e-postkvote i Resend | 20 USD/mnd | Bare hvis piloten viser at 100 per dag ikke holder. |

## Mobilapp

1. **Prompt 1:** Grunnmuren legges med en statisk Vite-app, hash-routing og et tjenestelag uten rolle- og tilgangslogikk i frontend (§20).
2. **Hver prompt:** Nye visninger sjekkes på 375px bredde.
3. **Prompt 15:** PWA, så pilotelevene kan installere appen fra nettleseren.
4. **Prompt 18, etter piloten:** Appen pakkes med Capacitor. Det skjer etter piloten fordi rettinger da kan rulles ut uten gjennomgang i appbutikkene. Det skjer før push-varsler fordi de krever en ekte app.

## Prompter

### Før piloten

1. ✅ **Fundament.** Ferdig. Full tekst står nederst.
2. ✅ **Datamodell og Supabase-prosjekt** (§2, §14, §17, §18). Ferdig, se *Status* øverst for det som gjenstår manuelt.
   - Migrasjoner for alt som mangler fra listen over.
   - Funksjon for bildehierarkiet (egen skole → lokallag → fylke → global), med lås.
   - Demodata med de fem lokallagene, alle fylkene og EO-logoen som standardbilde. Alt merket med `is_placeholder`.
   - Fylkene og skolene i piloten ligger i `supabase/pilot/` (471 skoler i 15 fylker fra medlemsregisteret 2025/2026). Disse er ekte data og merkes ikke med `is_placeholder`.
   - Pilotprosjektet opprettes i Supabase. TypeScript-typer genereres, og RLS-testene kjøres i CI mot lokal Supabase.
   - `docs/RLS_MATRIX.md` oppdateres.
3. ✅ **Innlogging, profiler og offentlig lesing** (§1, §3, §10). Ferdig, se *Før prompt 4* for det som gjenstår manuelt.
   - Supabase Auth med engangskode på e-post, sendt via Gmail SMTP (se *Før prompt 3*). E-postmalen viser en sekssifret kode (`{{ .Token }}`) som skrives inn i appen, ikke bare en lenke, så innloggingen ikke er avhengig av domene eller omdirigering.
   - Valget «Telefonnummer» i innloggingsdialogen deaktiveres og merkes «Kommer senere», på samme måte som Feide. Telefonnummer kan ikke lagres eller brukes til innlogging i piloten.
   - Innloggingsdialog som sender brukeren tilbake til handlingen de prøvde på (§7).
   - Onboarding: velge skole, navn og dato for neste valg.
   - Profilvisning og -redigering med profilbilde.
   - Skolebytte på egen hånd uten at historikken forsvinner.
   - Alle offentlige sider kan leses uten innlogging.
4. ✅ **Medlemskap, roller og aktiv representasjon** (§3, §4). Ferdig.
   - Velger som viser alle tilknytninger og hvilken som er aktiv. Feed og navigasjon oppdateres ved bytte.
   - Offentlige verv holdes adskilt fra interne rettigheter, og innholdsansvarlig skjules for andre.
   - Tildeling og tilbakekalling av roller.
   - Forespørsel om å bli skoleadministrator, som styreadministrator godkjenner.
   - Regelen om fylkesstyre og lokallag, og sperre mot å fjerne siste administrator.
   - Deaktivert bruker og skole vises tydelig.
   - Revisjonslogg for alle endringer.
5. **Innlegg** (§7)
   - Publiseringsdialogen viser avsenderorganisasjonen.
   - Målgruppe: offentlig, fylke, lokallag eller venneråd. I tillegg skoleform: vgs, ungdomsskole eller begge.
   - Utkast, forhåndsvisning, redigering merket «redigert» med historikk for administratorer, sletting og tagging av arrangementer.
   - XSS-rensing.
   - Venneråd: forespørsel og godkjenning mellom skoler.
6. **Bilder** (§11)
   - Opplasting til de fire lagringsområdene, med grenser for størrelse og filtype og kontroll av faktisk MIME-type i `process-media`.
   - Bildene kodes om i nettleseren, noe som fjerner EXIF og GPS, og serveren kontrollerer at det er gjort.
   - Behandlingsstatus vises.
   - Filer slettes når innholdet de hører til slettes.
   - Video kommer etter piloten (prompt 20) på grunn av lagringsgrensen.
7. **Kommentarer, reaksjoner, avstemninger, følging og deling** (§7)
   - Kommentarer skrives på vegne av den aktive organisasjonen og krever aktivt verv.
   - Bare antall reaksjoner vises offentlig.
   - Avstemninger gir én stemme per organisasjon, som kan endres før fristen. Resultatet vises etter stemme eller frist.
   - Følging.
   - Deling via Web Share API eller kopiert lenke, kun for offentlig innhold.
8. **Feed og søk** (§6)
   - Rangeringen fra planen, inkludert skoleform. Feeden beregnes på nytt ved bytte av skole eller representasjon.
   - Valg mellom anbefalt og kronologisk feed.
   - Fulltekstsøk på norsk etter skoler, styrer, personer, arrangementer og innlegg.
   - Filteret «Vis tidligere tillitsvalgte». Deaktiverte brukere og skoler skjules ellers.
9. ✅ **Arrangementer og CV** (§8). Ferdig, se *Før neste prompt (etter prompt 9)*.
   - Opprette og redigere arrangementer med status, kapasitet, frist og bilde.
   - Interesse, skolepåmelding, delegater og bekreftet deltakelse holdes adskilt. Delegatene varsles og bekrefter selv.
   - CV for personer, med verv, arrangementer og stjerner for Elevtinget.
   - CV for skoler.
10. **Meldinger** (§9)
    - Direktemeldinger, grupper og systemstyrte organisasjonsgrupper som synkroniseres fra vervene. Nye medlemmer ser bare meldinger fra de ble med.
    - Søk etter organisasjon viser kontaktpersoner og tilbud om å opprette en gruppe.
    - Sanntid, uleste meldinger, valgfri lest-status, demping og vedlegg via tidsbegrensede lenker.
    - Slette for egen visning, rapportere innhold valgt av brukeren, blokkere og forlate grupper.
11. **Varsler og styreoverføring** (§5)
    - Varsler i plattformen og på e-post, med egne innstillinger. Bygget slik at push kan kobles på senere.
    - Varsler på e-post samles i ett daglig sammendrag per bruker, så gratisgrensen for e-post holder (ca. 500 per dag i Gmail, 100 per dag i Resend etter piloten).
    - `pg_cron` sender påminnelser 14, 7 og 1 dag før, deretter ukentlig, og eskalerer etter 7 dager.
    - Overføringsveiviseren med aksept av ny rolle, aktiveringsdato og gjenopprettingsprosess.
    - Tester av rolleutløp.
12. **Adminpanel og moderering** (§12, §15)
    - Administrasjon av brukere (bytte skole, slette), organisasjoner med deaktivering og reaktivering, og innhold.
    - Modereringskø med alle handlingene i planen, inkludert klage.
    - Medier, placeholders (slette samlet eller enkeltvis), standardbilder med lås, statistikk og revisjonslogg avgrenset til eget område.
    - MFA med autentiseringsapp (TOTP) kreves for superadministratorer.
13. **CSV-import og -eksport** (§13)
    - Tom mal, eksport per fylke og forhåndsvisning.
    - Kontroll uten å endre databasen, med visning av nye, endrede og ugyldige rader.
    - Eksplisitt bekreftelse før import, oppdatering etter stabil ID, og importlogg.
14. **Juridiske sider og personvern** (§10, §16)
    - Personvernerklæring, vilkår, kontakt (teknisk@elev.no) og informasjon om informasjonskapsler.
    - Samtykkemodul med egne formål, «Godta» i oransje og «Avvis» i hvitt, tilbaketrekking og versjonering i `consent_records`. Banneret vises bare når en valgfri tjeneste er slått på i konfigurasjonen.
    - Deaktivere og reaktivere egen konto, eksport av egne data og forespørsel om sletting.
    - Dokumentasjon av behandlingsgrunnlag, databehandlere, rutiner ved personvernbrudd og bilderutiner, pluss en mal for personvernkonsekvensvurdering (DPIA).
15. **Mobilgjennomgang og PWA** (§19)
    - Alle visningene sjekkes på mobilbredde med meny nederst og store nok trykkflater.
    - Manifest, ikoner og et offline-skall, så appen kan installeres.
16. **Sikkerhet, tester og klargjøring for piloten** (§17, §19, §22)
    - Begrensning av antall forespørsler, Turnstile og beskyttelse mot opplisting av kontoer.
    - CSP som `<meta>`-tagg i `index.html`. GitHub Pages kan ikke sette egne headere, så HSTS, `frame-ancestors`/`X-Frame-Options` og `Permissions-Policy` kommer med Cloudflare Pages før full lansering (`public/_headers` er klar).
    - Tilgjengelighetstester med axe og Playwright, og ende-til-ende-tester av akseptansekriteriene i §22.
    - Nattlig backup og en dokumentert gjenopprettingstest.
    - Sentry, produksjonsoppsett på GitHub Pages (`nikolaiaskedal.github.io/elevradsnett`) og import av pilotskolene.
    - En sjekk av at piloten fortsatt er gratis: ingen tjeneste er på betalt plan, og bruken ligger under grensene i tabellen over.

### Under piloten

17. **Analyse** (§16)
    - PostHog Cloud EU koblet til samtykkemodulen fra prompt 14. Ingenting lastes før samtykke.
    - Et lite sett hendelser som måler bruken av kjernefunksjonene, uten meldingsinnhold eller sensitive profilopplysninger.
    - Personvernerklæringen og listen over informasjonskapsler oppdateres.

### Etter piloten

18. **Capacitor:** krever Apple Developer Program (99 USD/år). iOS og Android, lenker som åpner appen ved innlogging, oppstartsskjerm og ikoner, kamera og bildevelger, systemets delingsmeny og bygg i CI.
19. **Push-varsler:** lagring av enhetstokens, FCM/APNs via Edge Function og egne innstillinger for push.
20. **Video og rettinger fra piloten:** videoopplasting med miniatyrbilder og behandlingsstatus (§11), oppgradering av lagringsplan ved behov.
21. **Lansering i App Store og Play-butikken:** krever Google Play-konto (25 USD). TestFlight, intern testing i Play, personvernopplysninger i butikkene og forberedelse til appgjennomgangen.

Feide-innlogging og innlogging med telefonnummer planlegges senere og er ikke med her.

## Prompt 1

> Vi bygger Elevrådsnett etter `docs/KRAVSPEC.md`, og promptplanen ligger i `docs/PROMPTPLAN.md`. Denne første runden legger fundamentet. Ingen nye funksjoner og ingen visuelle endringer. Demoen skal fortsatt fungere med demodata.
>
> 1. **CLAUDE.md:** Utvid `CLAUDE.md` (behold regelen om å alltid merge) med faste regler for alt videre arbeid:
>    - Fargene: hvit bakgrunn, aksent #FF6340 med undertonene #FFB19F, #FFE0D9 og #FFEFEC, og navy #0A466E med #85A2B7, #CEDAE2 og #E7ECF0. Fargene skal brukes som CSS-variabler.
>    - Teksten i grensesnittet skal være på norsk.
>    - Ingen rolle- eller tilgangslogikk i frontend.
>    - RLS på alt.
>    - Hver visning skal sjekkes på mobilbredde (375px).
>    - Oppdater `docs/RLS_MATRIX.md` og `docs/FUNKSJONSKART.md` når noe endres.
>    - Kjør lint, typecheck, test og build før hver commit.
> 2. **Funksjonskart:** Gå gjennom `docs/design/elevradsnett.dc.html` og dagens app. Lag `docs/FUNKSJONSKART.md` som lister hver synlige knapp og kontroll per side, med status (fungerer, demo eller mangler) og hvilket punkt i kravspesifikasjonen og hvilken prompt i promptplanen som dekker den.
> 3. **Én byggekjede:**
>    - Fjern vinext, `@openai/sites-vite-plugin`, Cloudflare Workers/wrangler, `next.config.ts`, `.openai/` og Next-oppsettet i `app/`.
>    - Appen skal være en ren Vite + React SPA med hash-routing, basert på `vite.pages.config.ts`, med `npm run dev`, `build` og `preview`.
>    - Behold publiseringen til GitHub Pages via `.github/workflows/static.yml`, oppdatert til den nye byggekommandoen.
>    - Bytt miljøvariablene fra `NEXT_PUBLIC_` til `VITE_`, og legg de offentlige Supabase-verdiene inn som GitHub Actions-variabler når prosjektet finnes.
> 4. **Del opp** `components/elevradsnett-app.tsx` i én fil per visning under `components/views/`, og legg felles komponenter for seg.
> 5. **Tjenestelag:**
>    - Ingen komponent skal importere `lib/demo-data` direkte.
>    - Lag `DemoElevradsnettService` og en `ServiceProvider` med `useService()`.
>    - Utvid `ElevradsnettService` med alt UI-et leser og gjør i dag.
>    - Velg Supabase når `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` er satt, ellers demo. Metoder som ennå ikke har en RPC skal kaste en tydelig feil.
>    - Valideringsskjemaene (zod) skal ligge i `lib/domain/` så mobilappene kan bruke dem.
> 6. **Rydd:** Slett ubrukte komponenter i `components/ui`.
> 7. **CI:** Legg til scriptet `typecheck` og en workflow som kjører lint, typecheck og test på alle PR-er.
> 8. **Tester:** Legg til tester for demotjenesten.
>
> Sjekk i nettleseren på desktop og 375px at alle visningene fungerer som før. Merge til `main` når du er ferdig, slik `CLAUDE.md` sier.
