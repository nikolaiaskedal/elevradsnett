# RLS-matrise

| Område | Anonym | Innlogget bruker | Organisasjonsadministrator | Superadministrator |
|---|---|---|---|---|
| Organisasjoner | Aktive, offentlige felt. Én aktiv eller deaktivert organisasjon via `get_public_organization`, så deaktiverte sider vises med historikken. Tall (følgere, elevråd, tillitsvalgte) og prioriterte saker via `list_public_organizations` | Aktive + relevant inaktiv historikk | Oppdatere eget område. Status, type, geografi, placeholder og bildelås kan bare superadministrator endre (trigger) | Alle |
| Bildehierarki | Arvet bilde og kilde via `resolve_organization_images` | Som anonym | Sette standardbilder for eget område. Eget bilde kan ikke endres når det er låst | Låse bilder |
| Profiler | Kun `public_profiles` uten e-post/roller | Lese egen profil. Opprettes av `complete_onboarding`. Endres bare via `update_profile` (navn), `set_avatar` (bilde i egen mappe) og `change_school`; ingen direkte oppdatering. Økt og representasjoner med publiseringsrett via `get_my_session` | Lese relevante profiler i området. Kan bare endre navn og bilde direkte; status, skole, e-post og representasjon stoppes av triggeren `guard_profile_update` | Alle |
| Skolehistorikk (`profile_school_history`) | Ingen | Lese egen, også via `get_my_school_history`. Skrives bare av `complete_onboarding` og `change_school` | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Medlemskap/verv | Ingen (offentlige verv via `get_public_officers`) | Egne, også avsluttede, via `get_my_roles`. Kan gå av selv (`end_public_office`) | Lese verv i egen organisasjon og i skolene i området via `list_organization_roles`. Gi og avslutte verv via `assign_public_office` og `end_public_office`. Gi seg selv verv bare i egen organisasjon, ikke via områderetten | Alle |
| Interne roller | Ingen | Egne via `get_my_roles` (også innholdsansvarlig). Kan gi fra seg egen rolle (`revoke_role`), men ikke som siste administrator | Via `list_organization_roles`; innholdsansvarlig er bare synlig for administratorer og personen selv. Tildele og tilbakekalle via `assign_role` og `revoke_role` etter tabellen under | Alle, og eneste som kan gi styreadministrator og superadministrator |
| Aktiv representasjon | Ingen | Velge blant egne aktive verv i aktive organisasjoner via `set_active_representation`. Verv i deaktiverte organisasjoner vises i `get_my_session` med `organization_status`, men gir ikke publiseringsrett eller representasjon (`has_active_membership` krever aktiv organisasjon) | Som bruker | Som bruker |
| Administrerte organisasjoner | Ingen | Ingen | `list_my_admin_organizations`: egne organisasjoner, eget lokallag (fylkesstyreregelen) og skolene i området, med rettighetene som kan tildeles | Alle |
| Personsøk for tildeling | Ingen | Ingen | `list_assignable_people`: bare navn og skole, avgrenset til skolen, lokallaget, fylket eller (EO) alle. Ingen e-post | Alle |
| Innlegg | Publisert + offentlig + synlig. Innleggskort med navn og offentlig verv for avsender, tall og kommentarer via `get_post_cards` | Offentlig og tillatte fylke/lokallag/venneråd. Feeden skjuler innlegg rettet mot annen skoleform | Egne utkast og moderering. Redigere via `edit_post` | Alle |
| Endringshistorikk for innlegg (`post_revisions`) | Ingen | Ingen | Lese for egen organisasjon (innholdsansvarlig og opp). Skrives bare av trigger | Alle |
| Kommentarer | Synlige kommentarer til lesbare innlegg | Lese + skrive med aktivt verv | Moderere eget/område | Alle |
| Reaksjoner/avstemning | Aggregerte resultater via sikre spørringer | Egen reaksjon; én organisasjonsstemme | Som bruker | Alle |
| Arrangementer | Publiserte, avlyste og avsluttede via `list_events` (og `list_public_events`), med aggregerte tall. Lenken til digitale møter vises ikke | Personlig interesse via `set_event_interest` (tabellen `event_interests`, bare egne rader). Lenken til digitale møter når brukeren deltar. Egne delegatinvitasjoner via `get_event_participation`, svar via `respond_event_delegation` | Arrangør (styreadministrator i et aktivt styre eller EO, `can_organize_events`): opprette og endre via `save_event`, bilde via `set_event_image`, avlyse/avslutte via `set_event_status`, se utkast, se alle påmeldinger og delegater, bekrefte oppmøte via `confirm_event_attendance` og `confirm_all_event_attendance`. Påmelding (`register_for_event`) og delegater (`list_delegate_candidates`, `add_event_delegate`, `remove_event_delegate`) for egen organisasjon: skoleadministrator, innholdsansvarlig eller styreadministrator (`can_register_for`), innenfor målgruppen (`event_audience_allows`) | Alle |
| CV | Personens offentlige verv og arrangementer med bekreftet oppmøte via `get_person_cv` (ingen interne rettigheter, ingen CV for deaktiverte). Skolens deltakelse via `get_organization_cv` (deaktiverte personer uten navn) | Som anonym, pluss egne invitasjoner og egen CV selv om profilen er deaktivert | Som bruker. Organisasjonen kan ikke bekrefte eget oppmøte; det gjør arrangøren | Alle |
| Prioriterte saker | Aktive organisasjoners saker | Som anonym | Opprette/endre for egen organisasjon (innholdsansvarlig og opp) | Alle |
| Offentlige tillitsvalgte | Navn og offentlig verv via `get_public_officers` | Som anonym | Som anonym; verv endres via medlemskap | Alle |
| Valgplan | Ingen | Kan foreslå dato for neste valg én gang via `complete_onboarding`; overskriver aldri en eksisterende plan | Endre egen organisasjons plan | Alle |
| Samtaler/meldinger | Ingen | Kun aktivt medlemskap og egen historikkgrense. Meldinger fra blokkerte skjules, og direktemeldinger kan ikke sendes når en part har blokkert | Ingen ekstra lesetilgang | Ingen ekstra lesetilgang |
| Blokkeringer (`user_blocks`) | Ingen | Lese, opprette og fjerne egne. Den blokkerte ser ingenting | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Forespørsel om skoleadministrator | Ingen | Egne, via `request_school_admin` for egen skole, `cancel_school_admin_request` og `list_school_admin_requests` | Styreadministrator i området (`is_area_board_admin`) ser ventende forespørsler i `list_school_admin_requests` og avgjør via `decide_school_admin_request`. Søkeren kan ikke godkjenne seg selv. Godkjenning krever at søkeren fortsatt går på skolen og at skolen er aktiv; avslag går alltid | Alle |
| Eksport/sletting av egne data | Ingen | Lese egne, opprette via `request_personal_data` (én åpen per type) | Ingen ekstra tilgang | Lese og behandle alle |
| Søk (`search`) | Aktive organisasjoner, aktive personer (bare navn og offentlige verv), publiserte arrangementer og lesbare innlegg | Som anonym, pluss innlegg brukeren kan lese | Som bruker | Som bruker |
| Private vedlegg | Ingen | Signed URL for aktivt samtalemedlem | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Moderering | Ingen | Egne rapporter | Konkrete saker i området | Alle saker |
| Revisjonslogg/import | Ingen | Ingen | `list_audit_log` for egen organisasjon og skolene i området, med navn på den som endret og den det gjaldt / egen import | Alle |
| Varsler/samtykker | Ingen | Egne | Ingen ekstra tilgang | Ingen ekstra tilgang |

## Styreadministratorens område

- `has_role` gir styreadministrator i et fylkesstyre de samme styrerettighetene i lokallaget til egen skole, hvis lokallaget ligger i fylket. Andre lokallag i fylket gir ingen tilgang.
- `has_area_role` gir styreadministrator myndighet over skolene i lokallaget eller fylket (brukes av `deactivate_school` og forespørsler om skoleadministrator).

## Hvem kan tildele hva (prompt 4)

`can_grant_role` avgjør, og `role_fits_organization` sjekker at rollen passer organisasjonstypen. Ingen kan tildele seg selv en rettighet (`self escalation is not allowed`). På en skole må personen gå på skolen.

| Rettighet | Passer for | Tildeles og tilbakekalles av |
|---|---|---|
| Superadministrator | EO nasjonalt | Superadministrator |
| Styreadministrator | EO nasjonalt, fylkesstyre, lokallag | Superadministrator |
| Skoleadministrator | Skole | Skoleadministrator ved skolen, styreadministrator i området (også via forespørsel), superadministrator |
| Innholdsansvarlig | Alle | Administrator i organisasjonen (`has_area_role`), superadministrator |

Siste administrator (skole-, styre- eller superadministrator) kan ikke fjernes, verken av seg selv eller andre, før en etterfølger har fått rollen (`last administrator`). `revoke_role` låser alle aktive tildelinger av rollen før sjekken, så to samtidige tilbakekallinger ikke kan fjerne begge de siste.

Alle tildelinger og avslutninger lagrer hvem som gjorde det og når (`granted_by`, `granted_at`, `revoked_by`, `revoked_at`, `end_date`) og logges i `audit_logs` (`office.assigned`, `office.ended`, `role.assigned`, `role.revoked`, `school_admin.requested`, `.approved`, `.rejected`, `.cancelled`). Bytte av aktiv representasjon er ikke en endring av rettigheter og logges ikke.

## Arrangementer og CV (prompt 9)

Arrangementer har ingen skrive-policy: alt går via `security definer`-funksjonene i `202610090001_arrangementer_cv.sql`, som sjekker rettighetene selv og logger i `audit_logs` (`event.created`, `.updated`, `.published`, `.cancelled`, `.completed`, `.image_changed`, `.registered`, `.waitlisted`, `.unregistered`, `.delegate_added`, `.delegate_removed`, `.delegate_confirmed`, `.delegate_declined`, `.attendance_confirmed`).

- **Interesse** er personlig (`event_interests`). Den gamle tabellen `event_organization_interests` skrives ikke lenger; markeringene ble flyttet til personen som gjorde dem.
- **Påmelding** (`event_organization_registrations`) gjelder organisasjonen. Når kapasiteten er nådd, havner nye på venteliste, og avmelding gir plassen til den første på listen.
- **Delegater** (`event_delegates`) varsles i `notifications` og må bekrefte selv. Vervet personen hadde lagres på delegaten.
- **Bekreftet oppmøte** settes bare av arrangøren, etter start, og bare for delegater som har bekreftet selv. Bare oppmøte gir CV-oppføring. Versjonen fra prompt 1 lot organisasjonen bekrefte eget oppmøte; den er erstattet.
- Arrangøren kan lese påmeldinger og delegater til egne arrangementer (`event_registrations_organizer_read`, `event_delegates_organizer_read`).
- Anon kan kalle `list_events`, `get_person_cv`, `get_organization_cv` og `get_event_participation` (svarer tomt uten innlogging). Alle andre nye funksjoner krever innlogging.

## Funksjonstilgang

Supabase gir i utgangspunktet alle roller tilgang til å kalle funksjonene i `public`. Migrasjonen `202610010002_function_grants.sql` tar den tilgangen fra `anon`. Ikke-innloggede kan bare kalle `get_public_officers`, `get_event_engagement`, `resolve_organization_images`, `search`, `list_public_organizations`, `get_post_cards`, `list_public_events` og `get_my_session` (som da bare svarer «anonymous»), pluss `can_view_post` og `has_role`, som RLS-reglene for offentlig lesing trenger. Nye funksjoner må få `grant execute` eksplisitt. Fra prompt 4 kan anon også kalle `get_public_organization`; alle de andre nye funksjonene krever innlogging. `is_blocked_between` svarer bare for partene selv.

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
