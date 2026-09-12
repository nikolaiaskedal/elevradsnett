# Elevrådsnett

Elevrådsnett er en sosial plattform for skoler, fylkesstyrer, lokallagsstyrer og EO Nasjonalt. Offentlig innhold leses uten innlogging; publisering skjer på vegne av nøyaktig én aktiv organisasjon. Meldinger sendes alltid mellom personer.

## Arkitektur

- `app/` og `components/`: tilgjengelig og responsivt webgrensesnitt.
- `lib/domain/`: delte typer, autorisasjonsregler og dokumentert feedrangering.
- `lib/services/`: API-kontrakt som kan gjenbrukes av iOS og Android.
- `lib/supabase/`: vanlig Supabase-klient. Ingen hemmelige nøkler sendes til nettleseren.
- `supabase/migrations/`: versjonert PostgreSQL-modell, RLS, Storage-regler og transaksjonssikre funksjoner.
- `supabase/functions/`: serverfunksjoner for filvalidering og videre mediebehandling.
- `supabase/tests/`: sikkerhets- og invariantsjekker.

Demoen i grensesnittet bruker minnedata slik at alle flyter kan prøves uten en tilkoblet Supabase-instans. Produksjonsadapteren ligger bak samme tjenestekontrakt.

## Lokalt oppsett

1. Installer Node.js 22.13 eller nyere og kjør `npm install`.
2. Kopier `.env.example` til `.env.local` og fyll inn prosjektets offentlige Supabase URL og anon-nøkkel. Service role-nøkkelen skal bare finnes i servermiljøet.
3. Knytt Supabase CLI til et eget prosjekt og kjør `supabase db push`.
4. Last demodata med `supabase db reset` bare i lokalt miljø.
5. Start med `npm run dev`.

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
