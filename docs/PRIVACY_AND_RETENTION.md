# Personvern og lagring

Dokumentasjon av behandlingen i Elevrådsnett (KRAVSPEC §16). Teksten brukerne ser, står i `components/views/legal-view.tsx`, med versjon i `lib/domain/legal.ts`. Rutinen ved personvernbrudd står i `docs/PERSONVERNBRUDD.md`, og malen for personvernkonsekvensvurdering i `docs/DPIA.md`.

## Behandlingsansvarlig

Elevorganisasjonen. Kontakt: teknisk@elev.no.

## Formål og behandlingsgrunnlag

| Formål | Grunnlag |
|---|---|
| Gi elevråd og styrer et sted å publisere, samarbeide og melde seg på arrangementer | Berettiget interesse, art. 6 nr. 1 f |
| Vise hvem som representerer hvilken organisasjon, og hvem som kan publisere og administrere | Berettiget interesse, art. 6 nr. 1 f |
| CV med verv og bekreftet deltakelse | Berettiget interesse, art. 6 nr. 1 f |
| Engangskoder, varsler, sammendrag og invitasjoner på e-post | Berettiget interesse, art. 6 nr. 1 f |
| Moderering, revisjonslogg og feilsøking | Berettiget interesse, art. 6 nr. 1 f |
| Valgfri bruksstatistikk (ikke slått på i piloten) | Samtykke, art. 6 nr. 1 a |

Interesseavveiingen skal dokumenteres i DPIA-en. Godkjenning av vilkårene (`legal_acceptances`) er ikke samtykke som behandlingsgrunnlag, bare dokumentasjon av at brukeren har fått informasjonen.

## Datatyper

| Kategori | Opplysninger | Tabeller |
|---|---|---|
| Konto | E-post, navn, profilbilde, status | `auth.users`, `profiles` |
| Skole | Nåværende og tidligere skoler | `profiles`, `profile_school_history` |
| Verv og rettigheter | Verv, rettigheter, hvem som ga dem, forespørsler om å bli administrator | `memberships`, `role_grants`, `school_admin_requests`, `handover_invites` |
| Innhold | Innlegg, revisjoner, kommentarer, bilder, avstemninger | `posts`, `post_revisions`, `comments`, `post_media`, `poll_votes` |
| Aktivitet | Støtte, følging, interesse, påmelding, delegater, oppmøte | `reactions`, `follows`, `event_interests`, `event_delegates` |
| Meldinger | Meldinger, vedlegg, medlemskap, lest-status, blokkering | `messages`, `message_attachments`, `conversation_members`, `message_settings`, `user_blocks`, `message_hidden` |
| Varsler | Varsler og innstillinger | `notifications`, `notification_preferences` |
| Trygghet | Rapporter, modereringshandlinger, begrensninger, revisjonslogg | `moderation_reports`, `moderation_actions`, `profile_restrictions`, `audit_logs` |
| Personvern | Godkjente vilkår, samtykker, forespørsler om sletting og eksport | `legal_acceptances`, `consent_records`, `data_subject_requests` |

Ingen særlige kategorier (art. 9) samles inn. Fødselsdato, telefonnummer og adresse lagres ikke.

## Databehandlere

| Leverandør | Hva | Hvor | Status |
|---|---|---|---|
| Supabase | Database, innlogging, fillagring, Edge Functions | Stockholm (eu-north-1). Supabase Inc. er i USA | Databehandleravtale (DPA) må signeres i Supabase-dashbordet før piloten |
| GitHub (Pages) | Leverer nettsiden, ser IP-adresser | USA | Vurderes i DPIA. Byttes til Cloudflare Pages før full lansering |
| Google (Gmail SMTP) | Sender engangskoder, sammendrag og invitasjoner | USA/EU | Bruk Google Workspace med databehandleravtale, eller dokumenter vurderingen. Byttes til Resend før full lansering |

Nye leverandører (Sentry, Turnstile, PostHog) legges til her og i personvernerklæringen før de slås på.

## Lagringstid

| Data | Lagring | Gjennomføres i dag |
|---|---|---|
| Konto, skole og aktive verv | Kontoens levetid + 12 måneder etter deaktivering | Nei, manuelt via sletting |
| Historiske verv og CV | Til brukeren ber om sletting | Ja (sletting) |
| Innlegg og arrangementer | Til organisasjonen sletter dem | Ja |
| Private meldinger | Til samtalen slettes eller brukeren ber om sletting | Ja (sletting) |
| Revisjonslogg | 24 måneder | Nei, må legges i nattjobben |
| Modereringssaker | 12 måneder etter avgjørelse | Nei, må legges i nattjobben |
| Importlogger | 24 måneder | Nei |
| Godkjente vilkår og samtykker | Så lenge de gjelder + 3 år | Nei |

Automatisk sletting etter lagringstid er ikke bygget. Det bør gjøres i `run_daily_jobs` før full lansering.

## Rettighetene og hvordan de oppfylles

| Rettighet | I appen | Serverfunksjon |
|---|---|---|
| Innsyn og dataportabilitet | Profil → Personvern og konto → Last ned dataene mine (JSON) | `export_my_data` |
| Retting | Profil: navn, bilde og skole | `update_profile`, `set_avatar`, `change_school` |
| Deaktivering | Profil → Deaktiver profilen, og Aktiver profilen igjen | `deactivate_my_account`, `reactivate_my_account` |
| Sletting | Profil → Be om sletting. Superadministrator gjennomfører under Administrasjon → Personvern | `request_personal_data`, `decide_data_subject_request`, `erase_personal_data` |
| Protest, klage | E-post til teknisk@elev.no, klage til Datatilsynet | – |

Sletting fjerner navn, e-post (også i `auth.users` og identiteter), profilbilde, meldingsinnhold og vedlegg, varsler, følging, reaksjoner, skolehistorikk, godkjenninger og samtykker, og avslutter verv og økter. Innlegg og kommentarer er organisasjonens innhold og blir stående med «Slettet bruker». Revisjonsloggen beholder bruker-id-en uten navn. Filene slettes av `process-media` via `storage_deletions`.

Svarfrist: én måned (art. 12). Superadministrator bør sjekke Administrasjon → Personvern ukentlig.

## Bilder og video av elever

- Bilder kodes om i nettleseren, og serveren kontrollerer at EXIF, XMP og GPS er fjernet (`process-media`).
- Vilkårene sier at bilder av andre bare skal legges ut når de vet om det og er med på det.
- Den som er avbildet, kan rapportere innlegget eller skrive til teknisk@elev.no. Bildet fjernes uten unødig opphold.
- Eksempelinnholdet (placeholder) har ingen bilder av virkelige personer. AI-genererte bilder skal ikke vise identifiserbare personer.
- Video er ikke tillatt i piloten (prompt 20).

## Åpne spørsmål for Elevorganisasjonen

Må avklares før piloten med ekte brukere:

1. Bekreft behandlingsgrunnlaget (berettiget interesse) og dokumenter interesseavveiingen i DPIA-en.
2. Aldersgrense og informasjon til foresatte: ungdomsskoleelever kan være 12–13 år. Skal det være en nedre grense, og skal skolene eller foresatte informeres?
3. Signer databehandleravtale med Supabase, og avklar Gmail (Workspace med DPA, eller annen løsning).
4. Hvem er kontaktperson for personvern og svarer på henvendelser til teknisk@elev.no?
5. Godkjenn teksten i personvernerklæringen og vilkårene.
