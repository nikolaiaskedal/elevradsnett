# Elevrådsnett

Elevrådsnett er en sosial plattform for skoler, fylkesstyrer, lokallagsstyrer og EO Nasjonalt. Offentlig innhold leses uten innlogging; publisering skjer på vegne av nøyaktig én aktiv organisasjon. Meldinger sendes alltid mellom personer.

## Arkitektur

Appen er en ren Vite + React SPA med hash-routing (`#/utforsk`, `#/org/<id>` osv.), så den kan serveres som statiske filer uten omskrivinger på serveren.

- `index.html` og `app/`: inngangspunkt (`app/main.tsx`), globale stiler (`app/globals.css`) og fonter (`app/fonts/`).
- `components/elevradsnett-app.tsx`: appskallet (meny, routing, felles tilstand).
- `components/views/`: én fil per visning (hjem, utforsk, arrangementer, organisasjon, meldinger, profil, innlogging, administrasjon, informasjon).
- `components/shared/`: felles komponenter (innleggskort, innleggsdialog, knapper, ikoner, modal).
- `components/service-provider.tsx`: `ServiceProvider` og `useService()`. Komponenter henter og endrer data bare gjennom tjenesten.
- `lib/domain/`: delte typer, valideringsskjemaer (zod), visningsnavn, autorisasjonsregler og dokumentert feedrangering. Kan gjenbrukes av iOS og Android.
- `lib/services/`: tjenestekontrakten `ElevradsnettService`, `DemoElevradsnettService` (minnedata fra `lib/demo-data.ts`) og `SupabaseElevradsnettService`.
- `lib/supabase/`: vanlig Supabase-klient. Ingen hemmelige nøkler sendes til nettleseren.
- `supabase/migrations/`: versjonert PostgreSQL-modell, RLS, Storage-regler og transaksjonssikre funksjoner.
- `supabase/functions/`: serverfunksjoner for filvalidering og videre mediebehandling.
- `supabase/tests/`: sikkerhets- og invariantsjekker.

Designet grensesnittet følger ligger i `docs/design/elevradsnett.dc.html`. Kravspesifikasjonen ligger i `docs/KRAVSPEC.md`, rekkefølgen arbeidet gjøres i står i `docs/PROMPTPLAN.md`, og `docs/FUNKSJONSKART.md` viser status for hver knapp og kontroll.

### Demo eller Supabase

`createService()` velger `SupabaseElevradsnettService` når både `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` er satt, og ellers `DemoElevradsnettService`. Demoen bruker minnedata, slik at alle flyter kan prøves uten en tilkoblet Supabase-instans. Metoder som ennå ikke har en RPC i Supabase kaster `NotImplementedError` med navnet på operasjonen.

## Lokalt oppsett

1. Installer Node.js 22.13 eller nyere og kjør `npm install`.
2. Start demoen med `npm run dev`. Uten miljøvariabler brukes demodata.
3. For Supabase: kopier `.env.example` til `.env.local` og fyll inn prosjektets offentlige `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`. Service role-nøkkelen skal bare finnes i servermiljøet og skal aldri ha `VITE_`-prefiks.
4. Lokal database: `npx supabase db start` (krever Docker) kjører migrasjonene og `supabase/seed.sql`. `npm run test:db` kjører RLS-testene, og `npm run db:types` oppdaterer `lib/supabase/database.types.ts`.
5. Pilotprosjektet (Supabase Free, eu-north-1): `npx supabase link --project-ref <ref>` og `npx supabase db push`. Demodata (`seed.sql`) er merket `is_placeholder` og kan slettes samlet. Legg så `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` inn som GitHub Actions-variabler.

| Kommando | Hva den gjør |
| --- | --- |
| `npm run dev` | Utviklingsserver med hot reload |
| `npm run build` | Produksjonsbygg til `dist/` |
| `npm run preview` | Server `dist/` lokalt |
| `npm run lint` | oxlint |
| `npm run typecheck` | TypeScript uten utdata |
| `npm test` | Vitest |
| `npm run test:db` | RLS- og databasetester mot lokal Supabase |
| `npm run db:types` | Genererer TypeScript-typer fra lokal Supabase |

CI (`.github/workflows/ci.yml`) kjører lint, typecheck, test og bygg på alle pull requests, og i en egen jobb migrasjonene, RLS-testene og en sjekk av at TypeScript-typene er oppdatert mot lokal Supabase.

## Publisering

### GitHub Pages (piloten)

Workflowen `.github/workflows/static.yml` kjører test og `npm run build` og publiserer `dist/` til GitHub Pages ved hver merge til `main`. I repoets innstillinger må *Settings → Pages → Source* være satt til *GitHub Actions*. Når Supabase-prosjektet finnes, legges `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY` inn som Actions-variabler (*Settings → Secrets and variables → Actions → Variables*); uten dem bygges demoen. Navigasjonen skjer i `#/`-delen av adressen, så siden trenger ingen omskrivinger på serveren.

GitHub Pages kan ikke sette egne HTTP-headere. Når domenet er på plass, legges Cloudflare sin gratis proxy foran for sikkerhetsheadere (se `docs/PROMPTPLAN.md`).

### Cloudflare Pages (før full lansering)

`public/_headers` er klargjort for Cloudflare Pages og gir sikkerhetsheadere (CSP, `X-Frame-Options`, `Referrer-Policy` m.m.), `no-cache` på `index.html` og lang cache på hashede filer i `/assets/`. GitHub Pages ignorerer filen. Slik kobles repoet til når det er aktuelt:

1. I Cloudflare-dashbordet: *Workers & Pages → Create → Pages → Connect to Git*, og velg `nikolaiaskedal/elevradsnett`.
2. Produksjonsgren: `main`.
3. Byggeinnstillinger: *Framework preset* `None` (eller `Vite`), *Build command* `npm run build`, *Build output directory* `dist`.
4. Under *Settings → Variables and Secrets*: sett `NODE_VERSION` til `22`, og legg til `VITE_SUPABASE_URL` og `VITE_SUPABASE_ANON_KEY`. Variablene bakes inn ved bygg.
5. Hver pull request får da en forhåndsvisning på en egen `*.pages.dev`-adresse.

Uten `404.html` svarer Cloudflare Pages med `index.html` på ukjente stier. Legges en ny ekstern tjeneste til, må `Content-Security-Policy` i `_headers` utvides.

## Produksjonsoppsett

- Aktiver e-postbekreftelse og MFA-krav for superadministratorer i Supabase Auth.
- Konfigurer rate limiting i Edge Functions/API-gateway for innlogging, søk, kommentarer, meldinger og opplasting.
- Opprett planlagte jobber for valgvarsler: 14, 7 og 1 dag før, ukentlig etter fristen, og eskalering til relevant styreadministrator etter 7 dager.
- Bruk kun tidsbegrensede signed URLs for `private-message-attachments`.
- Koble en godkjent medietransformer til `process-media` for re-encoding, EXIF/GPS-fjerning, optimalisering og videominiatyrbilder før `processing_status` settes til `ready`.
- Legg inn e-postleverandør som databehandler og versjoner juridiske dokumenter før lansering.
- Gjennomfør DPIA og dokumenter rutiner for bilder/video av elever før produksjonslansering.

## Backup og gjenoppretting

Aktiver Supabase Point-in-Time Recovery for databasen. Ta daglig logisk eksport av skjema og data til kryptert lagring med en separat retention-policy. Inventarliste for Storage eksporteres samtidig, og offentlige/private objekter kopieres til en separat, tilgangsstyrt backup-bøtte. Kvartalsvis gjenopprettingstest gjøres i et isolert prosjekt: gjenopprett database, Storage og Auth-koblinger, kjør RLS-testene, kontroller signed URLs og dokumenter RTO/RPO.

## Sikkerhetsgrenser

Alle dynamiske roller leses fra databasen ved hver privilegerte operasjon. Ingen kan tildele seg selv høyere rolle. Organisasjonsavgrensning håndheves i RLS og RPC-er. Administratorer har ikke generell tilgang til private meldinger. Utkast, revisjonslogg, importdata og interne roller er aldri offentlig lesbare.
