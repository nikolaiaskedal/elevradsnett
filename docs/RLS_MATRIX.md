# RLS-matrise

| Område | Anonym | Innlogget bruker | Organisasjonsadministrator | Superadministrator |
|---|---|---|---|---|
| Organisasjoner | Aktive, offentlige felt | Aktive + relevant inaktiv historikk | Oppdatere eget område. Status, type, geografi, placeholder og bildelås kan bare superadministrator endre (trigger) | Alle |
| Bildehierarki | Arvet bilde og kilde via `resolve_organization_images` | Som anonym | Sette standardbilder for eget område. Eget bilde kan ikke endres når det er låst | Låse bilder |
| Profiler | Kun `public_profiles` uten e-post/roller | Egen full profil | Relevante profiler i området | Alle |
| Medlemskap/verv | Ingen | Egne | Egne organisasjoner | Alle |
| Interne roller | Ingen | Egne | Relevante brukere; innholdsansvarlig er privat | Alle |
| Innlegg | Publisert + offentlig + synlig | Offentlig og tillatte fylke/lokallag/venneråd. Feeden skjuler innlegg rettet mot annen skoleform | Egne utkast og moderering. Redigere via `edit_post` | Alle |
| Endringshistorikk for innlegg (`post_revisions`) | Ingen | Ingen | Lese for egen organisasjon (innholdsansvarlig og opp). Skrives bare av trigger | Alle |
| Kommentarer | Synlige kommentarer til lesbare innlegg | Lese + skrive med aktivt verv | Moderere eget/område | Alle |
| Reaksjoner/avstemning | Aggregerte resultater via sikre spørringer | Egen reaksjon; én organisasjonsstemme | Som bruker | Alle |
| Arrangementer | Publiserte + aggregerte tall via `get_event_engagement` | Interesse («Interessert») for egen organisasjon via `set_event_response` | Påmelding («Skal») og delegater for egen organisasjon | Alle |
| Prioriterte saker | Aktive organisasjoners saker | Som anonym | Opprette/endre for egen organisasjon (innholdsansvarlig og opp) | Alle |
| Offentlige tillitsvalgte | Navn og offentlig verv via `get_public_officers` | Som anonym | Som anonym; verv endres via medlemskap | Alle |
| Valgplan | Ingen | Kan foreslå valgmåned én gang via `complete_onboarding` | Endre egen organisasjons plan | Alle |
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

## Sanntid

`messages`, `conversation_members` og `notifications` er med i publikasjonen `supabase_realtime`. Sanntid følger de samme RLS-reglene som vanlig lesing.

## Tester

`npm run test:db` kjører `supabase/tests/` mot lokal Supabase. CI kjører dem på alle pull requests. Testene sjekker blant annet at alle tabeller i `public` har tvunget RLS.

Alle basetabeller har `ENABLE ROW LEVEL SECURITY` og `FORCE ROW LEVEL SECURITY`. Service role brukes bare i kontrollerte serverfunksjoner og planlagte jobber.
