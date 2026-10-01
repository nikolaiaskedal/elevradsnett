# RLS-matrise

| Område | Anonym | Innlogget bruker | Organisasjonsadministrator | Superadministrator |
|---|---|---|---|---|
| Organisasjoner | Aktive, offentlige felt. Tall (følgere, elevråd, tillitsvalgte) og prioriterte saker via `list_public_organizations` | Aktive + relevant inaktiv historikk | Oppdatere eget område. Status, type, geografi, placeholder og bildelås kan bare superadministrator endre (trigger) | Alle |
| Bildehierarki | Arvet bilde og kilde via `resolve_organization_images` | Som anonym | Sette standardbilder for eget område. Eget bilde kan ikke endres når det er låst | Låse bilder |
| Profiler | Kun `public_profiles` uten e-post/roller | Lese egen profil. Opprettes av `complete_onboarding`. Endres bare via `update_profile` (navn), `set_avatar` (bilde i egen mappe) og `change_school`; ingen direkte oppdatering. Økt og representasjoner med publiseringsrett via `get_my_session` | Lese relevante profiler i området. Kan bare endre navn og bilde direkte; status, skole, e-post og representasjon stoppes av triggeren `guard_profile_update` | Alle |
| Skolehistorikk (`profile_school_history`) | Ingen | Lese egen, også via `get_my_school_history`. Skrives bare av `complete_onboarding` og `change_school` | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Medlemskap/verv | Ingen | Egne | Egne organisasjoner | Alle |
| Interne roller | Ingen | Egne | Relevante brukere; innholdsansvarlig er privat | Alle |
| Innlegg | Publisert + offentlig + synlig. Innleggskort med navn og offentlig verv for avsender, tall og kommentarer via `get_post_cards` | Offentlig og tillatte fylke/lokallag/venneråd. Feeden skjuler innlegg rettet mot annen skoleform | Egne utkast og moderering. Redigere via `edit_post` | Alle |
| Endringshistorikk for innlegg (`post_revisions`) | Ingen | Ingen | Lese for egen organisasjon (innholdsansvarlig og opp). Skrives bare av trigger | Alle |
| Kommentarer | Synlige kommentarer til lesbare innlegg | Lese + skrive med aktivt verv | Moderere eget/område | Alle |
| Reaksjoner/avstemning | Aggregerte resultater via sikre spørringer | Egen reaksjon; én organisasjonsstemme | Som bruker | Alle |
| Arrangementer | Publiserte + aggregerte tall via `get_event_engagement` og `list_public_events` | Interesse («Interessert») for egen organisasjon via `set_event_response` | Påmelding («Skal») og delegater for egen organisasjon | Alle |
| Prioriterte saker | Aktive organisasjoners saker | Som anonym | Opprette/endre for egen organisasjon (innholdsansvarlig og opp) | Alle |
| Offentlige tillitsvalgte | Navn og offentlig verv via `get_public_officers` | Som anonym | Som anonym; verv endres via medlemskap | Alle |
| Valgplan | Ingen | Kan foreslå dato for neste valg én gang via `complete_onboarding`; overskriver aldri en eksisterende plan | Endre egen organisasjons plan | Alle |
| Samtaler/meldinger | Ingen | Kun aktivt medlemskap og egen historikkgrense. Meldinger fra blokkerte skjules, og direktemeldinger kan ikke sendes når en part har blokkert | Ingen ekstra lesetilgang | Ingen ekstra lesetilgang |
| Blokkeringer (`user_blocks`) | Ingen | Lese, opprette og fjerne egne. Den blokkerte ser ingenting | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Forespørsel om skoleadministrator | Ingen | Egne, via `request_school_admin` for egen skole | Styreadministrator i området leser og avgjør via `decide_school_admin_request`. Søkeren kan ikke godkjenne seg selv | Alle |
| Eksport/sletting av egne data | Ingen | Lese egne, opprette via `request_personal_data` (én åpen per type) | Ingen ekstra tilgang | Lese og behandle alle |
| Søk (`search`) | Aktive organisasjoner, aktive personer (bare navn og offentlige verv), publiserte arrangementer og lesbare innlegg | Som anonym, pluss innlegg brukeren kan lese | Som bruker | Som bruker |
| Private vedlegg | Ingen | Signed URL for aktivt samtalemedlem | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Moderering | Ingen | Egne rapporter | Konkrete saker i området | Alle saker |
| Revisjonslogg/import | Ingen | Ingen | Relevant område / egen import | Alle |
| Varsler/samtykker | Ingen | Egne | Ingen ekstra tilgang | Ingen ekstra tilgang |

## Styreadministratorens område

- `has_role` gir styreadministrator i et fylkesstyre de samme styrerettighetene i lokallaget til egen skole, hvis lokallaget ligger i fylket. Andre lokallag i fylket gir ingen tilgang.
- `has_area_role` gir styreadministrator myndighet over skolene i lokallaget eller fylket (brukes av `deactivate_school` og forespørsler om skoleadministrator).

## Funksjonstilgang

Supabase gir i utgangspunktet alle roller tilgang til å kalle funksjonene i `public`. Migrasjonen `202610010002_function_grants.sql` tar den tilgangen fra `anon`. Ikke-innloggede kan bare kalle `get_public_officers`, `get_event_engagement`, `resolve_organization_images`, `search`, `list_public_organizations`, `get_post_cards`, `list_public_events` og `get_my_session` (som da bare svarer «anonymous»), pluss `can_view_post` og `has_role`, som RLS-reglene for offentlig lesing trenger. Nye funksjoner må få `grant execute` eksplisitt. `is_blocked_between` svarer bare for partene selv.

## Innlogging og profilbilder

- Innlogging skjer med engangskode på e-post i Supabase Auth. Profilen finnes ikke før onboarding er fullført; da svarer `get_my_session` «onboarding».
- `profiles_self_update` er fjernet (prompt 3). Den lot brukeren endre alle kolonner i egen profil, også status og skole.
- Profilbilder ligger i `public-avatars/<bruker-id>/`. Brukeren kan laste opp og slette bare i egen mappe (`own_avatar_upload`, `own_avatar_delete`), og `set_avatar` godtar bare en fil som finnes i egen mappe.
- Skolebytte (`change_school`) avslutter verv og rettigheter ved gammel skole med sluttdato, gir ingen rettigheter ved ny skole, og stopper siste skoleadministrator.

## Sanntid

`messages`, `conversation_members` og `notifications` er med i publikasjonen `supabase_realtime`. Sanntid følger de samme RLS-reglene som vanlig lesing.

## Tester

`npm run test:db` kjører `supabase/tests/` mot lokal Supabase. CI kjører dem på alle pull requests. Testene sjekker blant annet at alle tabeller i `public` har tvunget RLS.

Alle basetabeller har `ENABLE ROW LEVEL SECURITY` og `FORCE ROW LEVEL SECURITY`. Service role brukes bare i kontrollerte serverfunksjoner og planlagte jobber.
