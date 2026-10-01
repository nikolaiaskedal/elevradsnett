# Promptplan for Elevrådsnett

Planen deler `docs/KRAVSPEC.md` inn i prompter som sendes én om gangen, hver i en egen økt. Hver prompt avsluttes med en PR som merges før neste prompt sendes. Punktnumre (§) viser til kravspesifikasjonen.

## Utgangspunkt (oktober 2026)

- Frontend: en klikkbar prototype med demodata. Alle hovedsidene i designet finnes, men samlet i én stor fil (`components/elevradsnett-app.tsx`).
- Tjenestelaget (`lib/services/`) finnes, men brukes ikke av grensesnittet.
- Databasen: migrasjonene i `supabase/migrations/` dekker alle tabellene i §18, med RLS og de fleste transaksjonsfunksjonene. De er ikke kjørt mot noe Supabase-prosjekt ennå.
- Dette mangler i databasen:
  - målgruppe etter skoleform på innlegg
  - endringshistorikk for innlegg
  - blokkering i meldinger
  - forespørsel om å bli skoleadministrator
  - forespørsler om eksport og sletting av egne data
  - regelen om at fylkesstyreadministrator også får rettigheter i eget lokallag
  - sanntid
  - søk
- Funksjonen for å kombinere skoler finnes ikke i koden.

## Hosting og tjenester

| Hva | Valg | Kostnad | Merknad |
|---|---|---|---|
| Frontend | Cloudflare Pages | Gratis | Ubegrenset trafikk, testversjon per PR, sikkerhetsheadere via `_headers`. Gir `*.pages.dev` til eget domene er på plass. |
| Backend | Supabase Free, region eu-north-1 | Gratis | 500 MB database, 1 GB lagring, ingen automatisk backup og pause etter en uke uten bruk. Utvikling kjøres lokalt med Supabase CLI. Pro (25 USD/mnd) før full lansering. |
| E-post | Resend | Gratis | 100 e-poster per dag og 3000 per måned. Krever eget domene. Supabase sin innebygde e-post er bare til testing. |
| Domene | F.eks. elevradsnett.no via Domeneshop | Ca. 150 kr/år | `.no` registreres på Elevorganisasjonens organisasjonsnummer. Bør være på plass før prompt 3. |
| Spambeskyttelse | Cloudflare Turnstile | Gratis | |
| Feillogging | Sentry | Gratis | |
| Analyse | PostHog Cloud EU (Frankfurt) | Gratis opptil 1 mill. hendelser/mnd | Aktiveres først etter samtykke (§16), se prompt 17. |
| Backup | Nattlig `pg_dump` og kopi av Storage via GitHub Actions | Gratis | Erstatter backup som gratisplanen mangler. |

Alle tjenestene over er databehandlere og skal stå i personvernerklæringen (§16).

## Mobilapp

1. **Prompt 1:** Grunnmuren legges med en statisk Vite-app, hash-routing og et tjenestelag uten rolle- og tilgangslogikk i frontend (§20).
2. **Hver prompt:** Nye visninger sjekkes på 375px bredde.
3. **Prompt 15:** PWA, så pilotelevene kan installere appen fra nettleseren.
4. **Prompt 18, etter piloten:** Appen pakkes med Capacitor. Det skjer etter piloten fordi rettinger da kan rulles ut uten gjennomgang i appbutikkene. Det skjer før push-varsler fordi de krever en ekte app.

## Prompter

### Før piloten

1. **Fundament.** Full tekst står nederst.
2. **Datamodell og Supabase-prosjekt** (§2, §14, §17, §18)
   - Migrasjoner for alt som mangler fra listen over.
   - Funksjon for bildehierarkiet (egen skole → lokallag → fylke → global), med lås.
   - Demodata med de fem lokallagene, alle fylkene og EO-logoen som standardbilde. Alt merket med `is_placeholder`.
   - Pilotprosjektet opprettes i Supabase. TypeScript-typer genereres, og RLS-testene kjøres i CI mot lokal Supabase.
   - `docs/RLS_MATRIX.md` oppdateres.
3. **Innlogging, profiler og offentlig lesing** (§1, §3, §10)
   - Supabase Auth med e-postkode via Resend.
   - Innloggingsdialog som sender brukeren tilbake til handlingen de prøvde på (§7).
   - Onboarding: velge skole, navn og dato for neste valg.
   - Profilvisning og -redigering med profilbilde.
   - Skolebytte på egen hånd uten at historikken forsvinner.
   - Alle offentlige sider kan leses uten innlogging.
4. **Medlemskap, roller og aktiv representasjon** (§3, §4)
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
9. **Arrangementer og CV** (§8)
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
    - `pg_cron` sender påminnelser 14, 7 og 1 dag før, deretter ukentlig, og eskalerer etter 7 dager.
    - Overføringsveiviseren med aksept av ny rolle, aktiveringsdato og gjenopprettingsprosess.
    - Tester av rolleutløp.
12. **Adminpanel og moderering** (§12, §15)
    - Administrasjon av brukere (bytte skole, slette), organisasjoner med deaktivering og reaktivering, og innhold.
    - Modereringskø med alle handlingene i planen, inkludert klage.
    - Medier, placeholders (slette samlet eller enkeltvis), standardbilder med lås, statistikk og revisjonslogg avgrenset til eget område.
    - MFA kreves for superadministratorer.
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
    - CSP-headere.
    - Tilgjengelighetstester med axe og Playwright, og ende-til-ende-tester av akseptansekriteriene i §22.
    - Nattlig backup og en dokumentert gjenopprettingstest.
    - Sentry, produksjonsoppsett på Cloudflare Pages og import av pilotskolene.

### Under piloten

17. **Analyse** (§16)
    - PostHog Cloud EU koblet til samtykkemodulen fra prompt 14. Ingenting lastes før samtykke.
    - Et lite sett hendelser som måler bruken av kjernefunksjonene, uten meldingsinnhold eller sensitive profilopplysninger.
    - Personvernerklæringen og listen over informasjonskapsler oppdateres.

### Etter piloten

18. **Capacitor:** iOS og Android, lenker som åpner appen ved innlogging, oppstartsskjerm og ikoner, kamera og bildevelger, systemets delingsmeny og bygg i CI.
19. **Push-varsler:** lagring av enhetstokens, FCM/APNs via Edge Function og egne innstillinger for push.
20. **Video og rettinger fra piloten:** videoopplasting med miniatyrbilder og behandlingsstatus (§11), oppgradering av lagringsplan ved behov.
21. **Lansering i App Store og Play-butikken:** TestFlight, intern testing i Play, personvernopplysninger i butikkene og forberedelse til appgjennomgangen.

Feide-innlogging planlegges senere og er ikke med her.

## Prompt 1

> Vi bygger Elevrådsnett etter `docs/KRAVSPEC.md`, og promptplanen ligger i `docs/PROMPTPLAN.md`. Denne første runden legger fundamentet. Ingen nye funksjoner og ingen visuelle endringer. Demoen skal fortsatt fungere med demodata.
>
> 1. **CLAUDE.md:** Lag en `CLAUDE.md` med faste regler for alt videre arbeid:
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
>    - Legg til `public/_headers` og SPA-oppsett for Cloudflare Pages, og dokumenter i README hvordan repoet kobles til Cloudflare Pages.
>    - Bytt miljøvariablene fra `NEXT_PUBLIC_` til `VITE_`.
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
> Sjekk i nettleseren på desktop og 375px at alle visningene fungerer som før. Lag en PR.
