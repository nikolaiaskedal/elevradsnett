# Personvernkonsekvensvurdering (DPIA) – mal

Elevrådsnett behandler opplysninger om mindreårige, offentliggjør navn og verv, og har private meldinger. Det tilsier en DPIA (art. 35) før tjenesten tas i bruk med ekte brukere. Malen er fylt ut med det som følger av løsningen. Feltene merket **Fylles ut** må Elevorganisasjonen gjøre.

## 1. Beskrivelse av behandlingen

- **Behandlingsansvarlig:** Elevorganisasjonen.
- **Formål:** se `docs/PRIVACY_AND_RETENTION.md`.
- **Registrerte:** elever i ungdomsskole og videregående (fra ca. 12–13 år), tillitsvalgte i lokallag, fylkeslag og Elevorganisasjonen.
- **Omfang i piloten:** **Fylles ut** (antall skoler og brukere).
- **Opplysninger:** se datatypene i `docs/PRIVACY_AND_RETENTION.md`. Ingen særlige kategorier.
- **Systemer og leverandører:** Supabase (EU), GitHub Pages, Gmail SMTP.
- **Dataflyt:** nettleser → Supabase (RPC-er med RLS) → e-post via Gmail. Bilder kodes om i nettleseren og kontrolleres av `process-media`.

## 2. Nødvendighet og forholdsmessighet

- **Grunnlag:** berettiget interesse (art. 6 nr. 1 f). **Fylles ut:** interesseavveiing: Elevorganisasjonens interesse, elevenes forventninger, og hvorfor ulempene ikke veier tyngre.
- **Dataminimering:** bare e-post og navn kreves. Ingen fødselsdato eller telefonnummer. Profilbilde er valgfritt.
- **Åpenhet:** personvernerklæring og vilkår med versjon. Brukeren godtar dem i onboarding og på nytt ved endringer.
- **Rettigheter:** eksport, retting, deaktivering og sletting i appen (se tabellen i `PRIVACY_AND_RETENTION.md`).
- **Lagringstid:** fastsatt, men automatisk sletting er ikke bygget ennå.

## 3. Risikoer for de registrerte

| Risiko | Sannsynlighet | Konsekvens | Tiltak i løsningen | Gjenstår |
|---|---|---|---|---|
| Uvedkommende leser private meldinger | Lav | Høy | RLS på alle tabeller, meldinger bare via RPC-er, databasetester for tilgang | Uavhengig gjennomgang av RLS |
| En elev opptrer som en organisasjon uten rett | Lav | Middels | Rettigheter håndheves på serveren, revisjonslogg | – |
| Trakassering eller hets i innlegg og meldinger | Middels | Høy | Rapportering, modereringskø, blokkering, begrensning | **Fylles ut:** hvem moderer, og hvor raskt |
| Bilder av elever uten samtykke | Middels | Middels | Regler i vilkårene, rapportering, EXIF/GPS fjernes | Rutine for rask fjerning |
| Navn og verv er offentlige og kan søkes opp | Høy | Lav–middels | Bare offentlige verv vises; deaktiverte brukere skjules | Vurder om CV-en skal være offentlig for de yngste |
| Kontoovertakelse via e-post | Lav | Middels | Engangskode med kort levetid, ingen passord | Turnstile og grenser for forsøk (prompt 16) |
| Tap av data | Middels | Middels | – | Nattlig backup (prompt 16). Gratisplanen har ingen backup |
| Overføring til USA (GitHub, Google, Supabase Inc.) | Middels | Lav–middels | Data lagres i EU (Supabase) | Databehandleravtaler, vurdering av overføringsgrunnlag |
| Feil som ikke oppdages | Middels | Middels | – | Feillogging (Sentry, prompt 16) |

## 4. Tiltak før piloten

- [ ] Databehandleravtale med Supabase
- [ ] Avklare e-post (Workspace med DPA eller annen løsning)
- [ ] Bekrefte behandlingsgrunnlaget og interesseavveiingen
- [ ] Aldersgrense og eventuell informasjon til foresatte
- [ ] Nattlig backup og gjenopprettingstest
- [ ] Feillogging
- [ ] Ansvarlig for moderering og for personvernhenvendelser

## 5. Konklusjon

**Fylles ut:** restrisiko, om behandlingen kan starte, og om Datatilsynet må konsulteres (art. 36). Dato og hvem som har godkjent.
