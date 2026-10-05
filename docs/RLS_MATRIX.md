# RLS-matrise

| Område | Anonym | Innlogget bruker | Organisasjonsadministrator | Superadministrator |
|---|---|---|---|---|
| Organisasjoner | Aktive, offentlige felt. Én aktiv eller deaktivert organisasjon via `get_public_organization`, så deaktiverte sider vises med historikken. Tall (følgere, elevråd, tillitsvalgte) og prioriterte saker via `list_public_organizations` | Aktive + relevant inaktiv historikk | Områdeavgrenset liste og statistikk via `get_admin_dashboard`; deaktivering/reaktivering via `set_organization_status`. Geografi og placeholdermerking er fortsatt superadministratorfelt | Alle, samt bildelås |
| Bildehierarki | Arvet bilde og kilde via `resolve_organization_images` | Som anonym | Sette standardbilder for eget område. Eget bilde kan ikke endres når det er låst | Låse bilder |
| Profiler | Kun `public_profiles` uten e-post/roller | Lese egen profil. Opprettes av `complete_onboarding`. Endres bare via sikre RPC-er; ingen direkte oppdatering | Områdeavgrenset administrasjon via `admin_manage_user`: skolebytte, deaktivering, reaktivering og anonymisering/sletting. Kan ikke administrere seg selv eller reaktivere en profil brukeren selv deaktiverte | Alle |
| Skolehistorikk (`profile_school_history`) | Ingen | Lese egen, også via `get_my_school_history`. Skrives bare av `complete_onboarding` og `change_school` | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Medlemskap/verv | Ingen (offentlige verv via `get_public_officers`) | Egne, også avsluttede, via `get_my_roles`. Kan gå av selv (`end_public_office`) | Lese verv i egen organisasjon og i skolene i området via `list_organization_roles`. Gi og avslutte verv via `assign_public_office` og `end_public_office`. Gi seg selv verv bare i egen organisasjon, ikke via områderetten | Alle |
| Interne roller | Ingen | Egne via `get_my_roles` (også innholdsansvarlig). Kan gi fra seg egen rolle (`revoke_role`), men ikke som siste administrator | Via `list_organization_roles`; innholdsansvarlig er bare synlig for administratorer og personen selv. Tildele og tilbakekalle via `assign_role` og `revoke_role` etter tabellen under | Alle, og eneste som kan gi styreadministrator og superadministrator |
| Aktiv representasjon | Ingen | Velge blant egne aktive verv i aktive organisasjoner via `set_active_representation`. Verv i deaktiverte organisasjoner vises i `get_my_session` med `organization_status`, men gir ikke publiseringsrett eller representasjon (`has_active_membership` krever aktiv organisasjon) | Som bruker | Som bruker |
| Administrerte organisasjoner | Ingen | Ingen | `list_my_admin_organizations`: egne organisasjoner, eget lokallag (fylkesstyreregelen) og skolene i området, med rettighetene som kan tildeles | Alle |
| Personsøk for tildeling | Ingen | Ingen | `list_assignable_people`: bare navn og skole, avgrenset til skolen, lokallaget, fylket eller (EO) alle. Ingen e-post | Alle |
| Innlegg | Publisert + offentlig + synlig + ikke slettet. Innleggskort med navn og offentlig verv for avsender, tall, kommentarer, skoleform og arrangement via `list_post_cards` (`can_manage` er alltid usann) | Offentlig og tillatte fylke/lokallag/venneråd (`can_view_post`). Medlemmer av avsenderen ser alle innleggene dens, og elevene ved en skole ser skolens innlegg til venneråd. Feeden skjuler innlegg rettet mot annen skoleform | Innholdsansvarlig og opp: opprette (krever også aktivt verv), utkast, publisere utkast, redigere og slette via `create_post`, `update_post` og `delete_post`; lese utkast via `list_post_drafts`. `can_manage` i `list_post_cards` sier hvem som får knappene. Målgruppen må passe avsenderen (`audience_fits_organization`), og tekst renses (`clean_text`) | Alle |
| Endringshistorikk for innlegg (`post_revisions`) | Ingen | Ingen | Lese for egen organisasjon (innholdsansvarlig og opp), også med navn via `get_post_history`. Skrives bare av trigger | Alle |
| Venneråd (`organization_connections`) | Ingen | Ingen | Skoleadministrator: lese skolens forbindelser (RLS og `list_friend_connections`), be om (`request_friend_school`), godta eller avslå innkommende (`decide_friend_request`), avslutte eller trekke tilbake (`end_friend_connection`). Ingen direkte skriving i tabellen (`insert`, `update` og `delete` er tatt fra `authenticated`), så ingen side kan godkjenne alene. Én forbindelse per skolepar. Alt logges for begge skolene (`friend.*`) | Alle |
| Kommentarer | Synlige kommentarer til lesbare innlegg | Lese + skrive med aktivt verv (teksten renses i `add_comment`) | Moderere eget/område | Alle |
| Reaksjoner/avstemning | Aggregerte resultater via sikre spørringer | Egen reaksjon; én organisasjonsstemme | Som bruker | Alle |
| Arrangementer | Publiserte, avlyste og avsluttede via `list_events` (og `list_public_events`), med aggregerte tall. Lenken til digitale møter vises ikke | Personlig interesse via `set_event_interest` (tabellen `event_interests`, bare egne rader). Lenken til digitale møter når brukeren deltar. Egne delegatinvitasjoner via `get_event_participation`, svar via `respond_event_delegation` | Arrangør (styreadministrator i et aktivt styre eller EO, `can_organize_events`): opprette og endre via `save_event`, bilde via `set_event_image`, avlyse/avslutte via `set_event_status`, se utkast, se alle påmeldinger og delegater, bekrefte oppmøte via `confirm_event_attendance` og `confirm_all_event_attendance`. Påmelding (`register_for_event`) og delegater (`list_delegate_candidates`, `add_event_delegate`, `remove_event_delegate`) for egen organisasjon: skoleadministrator, innholdsansvarlig eller styreadministrator (`can_register_for`), innenfor målgruppen (`event_audience_allows`) | Alle |
| CV | Personens offentlige verv og arrangementer med bekreftet oppmøte via `get_person_cv` (ingen interne rettigheter, ingen CV for deaktiverte). Skolens deltakelse via `get_organization_cv` (deaktiverte personer uten navn) | Som anonym, pluss egne invitasjoner og egen CV selv om profilen er deaktivert | Som bruker. Organisasjonen kan ikke bekrefte eget oppmøte; det gjør arrangøren | Alle |
| Prioriterte saker | Aktive organisasjoners saker | Som anonym | Opprette/endre for egen organisasjon (innholdsansvarlig og opp) | Alle |
| Offentlige tillitsvalgte | Navn og offentlig verv via `get_public_officers` | Som anonym | Som anonym; verv endres via medlemskap | Alle |
| Valgplan (`election_schedules`) | Ingen | Kan foreslå dato for neste valg én gang via `complete_onboarding`; overskriver aldri en eksisterende plan | Skoleadministrator og styreadministrator i området: lese, og endre via `set_election_date`. Ingen direkte skriving (prompt 11) | Alle |
| Styreoverføring (`handover_processes`, `handover_invites`, `board_terms`) | Avsluttede og aktive styreperioder | Egne invitasjoner (også til e-postadressen før profilen fantes) via `list_my_handover_invites`, og svar via `respond_handover_invite`. Godta krever at brukeren går på skolen | Skoleadministrator: oversikt (`get_handover_overview`), starte (`start_handover`), endre datoer, avlyse og aktivere nå (`reschedule_handover`, `cancel_handover`, `complete_handover`). Styreadministrator i området: oversikt, endre og avlyse, og starte gjenoppretting med begrunnelse når overføringen er minst sju dager forsinket eller skolen mangler skoleadministrator. Ingen direkte skriving i tabellene. Aktivering (`activate_handover`) kan ikke kalles av klienter | Alle, også gjenoppretting |
| Påminnelser (`handover_reminders`) | Ingen | Ingen | Lese for eget område. Skrives bare av `run_handover_reminders` (pg_cron) | Alle |
| Samtaler/meldinger | Ingen | Kun aktivt medlemskap og egen historikkgrense (`is_conversation_member`, `can_view_message`). I systemstyrte grupper kreves i tillegg aktivt verv i en aktiv organisasjon. Meldinger fra blokkerte og meldinger slettet for egen visning skjules. Lesing via `list_my_conversations`, `get_conversation_messages` og `list_conversation_members`. Ingen direkte skriving i tabellene: alt går via RPC-ene under | Ingen ekstra lesetilgang, heller ikke i den systemstyrte gruppen uten eget verv | Ingen ekstra lesetilgang |
| Blokkeringer (`user_blocks`) | Ingen | Lese, opprette og fjerne egne, også via `block_user`, `unblock_user` og `list_my_blocks`. Den blokkerte ser ingenting | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Skjulte meldinger (`message_hidden`), meldingsinnstillinger (`message_settings`) | Ingen | Lese egne. Skrives bare via `hide_message` og `set_read_receipts` | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Forespørsel om skoleadministrator | Ingen | Egne, via `request_school_admin` for egen skole, `cancel_school_admin_request` og `list_school_admin_requests` | Styreadministrator i området (`is_area_board_admin`) ser ventende forespørsler i `list_school_admin_requests` og avgjør via `decide_school_admin_request`. Søkeren kan ikke godkjenne seg selv. Godkjenning krever at søkeren fortsatt går på skolen og at skolen er aktiv; avslag går alltid | Alle |
| Eksport/sletting av egne data | Ingen | Lese egne, opprette via `request_personal_data` (én åpen per type) | Ingen ekstra tilgang | Lese og behandle alle |
| Søk (`search_directory`, og `search` fra prompt 2) | Aktive organisasjoner, aktive personer (bare navn, skole og offentlige verv), publiserte arrangementer og lesbare innlegg. Med filteret også deaktiverte skoler og tidligere tillitsvalgte (avsluttede verv), men aldri personer som har deaktivert kontoen selv | Som anonym, pluss innlegg brukeren kan lese | Som bruker | Som bruker |
| Feed (`list_posts`, `get_ranked_feed`) | Offentlige innlegg, nyeste først | Innleggene brukeren kan lese, rangert for aktiv representasjon eller skolen. Rangeringen bruker bare offentlige egenskaper ved innlegget og brukerens skole, representasjon og følging (`docs/FEED.md`) | Som bruker | Som bruker |
| Private vedlegg | Ingen | Laste opp til `private-message-attachments/<samtale>/<egen id>/` som aktivt medlem. Lese (signed URL) bare når meldingen vedlegget hører til kan leses, så nye medlemmer ikke ser vedlegg fra før de ble med | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Moderering | Ingen | Egne rapporter. Rapport om en melding via `report_message`: bare den ene meldingen lagres i rapporten (`shared_message_excerpt`). Rapportør eller rapportert person kan klage via `appeal_moderation_report` | `list_moderation_queue` viser bare konkrete saker i området. `apply_moderation_action` utfører og logger skjuling, sletting, advarsel, tidsbegrensning, deaktivering, gjenoppretting eller ingen handling | Alle saker; meldingssaker krever superadministrator |
| Midlertidige begrensninger (`profile_restrictions`) | Ingen | Bare egne aktive/historiske begrensninger | Opprettes bare av `apply_moderation_action` | Alle |
| Placeholders | Ingen ekstra | Ingen ekstra | Ingen sletting | Superadministrator med AAL2 kan slette enkeltvis eller samlet via RPC; lagringsstier returneres til adapteren for sletting i Storage |
| Eksempelinnhold (`placeholder_content`) | Ingen | Ser eksempelbrukere, -innlegg og -arrangementer som annet offentlig innhold, og eksempelsamtalene de er medlem av. Ingen tilgang til tabellen (RLS uten policyer) | Ingen ekstra tilgang | `get_placeholder_content_status` og `set_placeholder_content` (av/på). Eksempelbrukerne er utestengt i Auth og har e-post på `.invalid`, så de kan ikke logge inn |
| Revisjonslogg/import | Ingen | Ingen | `list_audit_log` for egen organisasjon og skolene i området, med navn på den som endret og den det gjaldt; alle nye admin- og modereringshandlinger logges med mål og begrunnelse / egen import | Alle |
| MFA | Ikke relevant | TOTP er valgfritt | Anbefalt | Superadministratorrollen i `has_role` krever `super_admin_session_ok()`. I piloten er `super_admin_mfa_required()` false, så e-postinnlogging (AAL1) er nok og `admin_mfa_required()` gir false. Før lansering settes den til true, og da kreves `aal2` |
| Varsler (`notifications`) | Ingen | Lese egne via `list_notifications` (og RLS, også i sanntid). Merke som lest via `mark_notifications_read`. Ingen direkte skriving: varsler lages av serverfunksjoner og triggere, og `prepare_notification` følger innstillingene, slår sammen uleste og dropper varsler til deaktiverte | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Varselinnstillinger (`notification_preferences`) | Ingen | Lese og endre egne via `get_notification_preferences` og `set_notification_preferences`. Ingen direkte skriving | Ingen ekstra tilgang | Ingen ekstra tilgang |
| E-postsammendrag | Ingen | Ingen | Ingen | Ingen. `pending_email_digests`, `mark_email_digest_sent`, `pending_handover_invite_emails` og `mark_handover_invite_emailed` kan bare kalles med service role (Edge-funksjonen `send-digest`) |
| Samtykker | Ingen | Egne | Ingen ekstra tilgang | Ingen ekstra tilgang |

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

Supabase gir i utgangspunktet alle roller tilgang til å kalle funksjonene i `public`. Migrasjonen `202610010002_function_grants.sql` tar den tilgangen fra `anon`. Ikke-innloggede kan bare kalle `get_public_officers`, `get_event_engagement`, `resolve_organization_images`, `search`, `list_public_organizations`, `get_post_cards`, `list_public_events` og `get_my_session` (som da bare svarer «anonymous»), pluss `can_view_post` og `has_role`, som RLS-reglene for offentlig lesing trenger. Nye funksjoner må få `grant execute` eksplisitt. Fra prompt 4 kan anon også kalle `get_public_organization`, fra prompt 5 `list_post_cards`, og fra prompt 6–7 `list_posts` og `get_organization_images`; alle de andre nye funksjonene krever innlogging. `is_blocked_between` svarer bare for partene selv. Meldingsfunksjonene fra prompt 10 krever innlogging, og `sync_managed_conversation`, `sync_my_managed_conversations` og `check_conversation_rate_limit` kan bare kalles av andre databasefunksjoner.

## Innlegg (prompt 5)

- `create_post` og `update_post` erstatter `publish_post` og `edit_post`, som er beholdt som innganger til de nye, så alle veier renser tekst og sjekker målgruppe. `get_post_cards` er erstattet av `list_post_cards` (ny returtype) i klientene.
- Utkast er bare synlige for innholdsansvarlig og opp i organisasjonen. Å publisere et utkast krever aktivt verv, som et nytt innlegg. Å publisere er ikke en redigering og gir ingen historikk.
- Sletting er myk (`status='deleted'`, `deleted_at`). `can_view_post` viser ikke slettede innlegg, og de kan ikke endres. Logges som `post.deleted` med utdrag.
- Synlighet: «Lokallaget» fra et lokallag når skolene i lokallaget. «Venneråd» når elevene ved avsenderskolen og ved skoler med godkjent venneråd.
- `check_post_content` og `log_friend_event` er interne og kan ikke kalles av `anon` eller `authenticated`. Anon kan kalle `list_post_cards`; resten krever innlogging.

## Bilder (prompt 6)

Bildene kodes om i nettleseren (EXIF og GPS forsvinner), og edge-funksjonen `process-media` kontrollerer hver fil med service role: filtype ut fra innholdet, størrelse, maks 4096 px og ingen EXIF-, XMP-, IPTC- eller tekstmetadata. Bare den som lastet opp filen kan be om kontroll. Avviste filer slettes.

| Tabell eller RPC | Hvem | Regler |
|---|---|---|
| `media_checks` | Bare `process-media` (service role, via `record_media_check`) | RLS uten policyer: klientene kan verken lese eller skrive |
| `storage_deletions` | Bare databasen og `process-media` (`pending_storage_deletions`, `mark_storage_deleted`) | Filer fra slettede innlegg, byttede organisasjonsbilder og avviste filer. Slettes fra Storage av `process-media` (`action:'cleanup'`) |
| `set_avatar`, `set_event_image` | Som før | Krever nå en godkjent kontroll (`media_ready`) |
| `add_post_media` | Innholdsansvarlig og opp i organisasjonen | Stien må ligge under `<organisasjon>/posts/<innlegg>/` i `public-content`, maks fire bilder. Status «pending» til kontrollen er ferdig |
| `post_media` (lesing) | Alle som kan se innlegget | Bilder som ikke er klare, ser bare de som kan endre innlegget. Kan ikke skrives direkte |
| `set_organization_image` | Skole- og styreadministrator for organisasjonen | Profilbilde i `public-avatars/<organisasjon>/profile/`, coverbilde i `public-covers/<organisasjon>/cover/`. Kontrollert fil. Låst bilde kan bare endres av superadministrator. Logges |
| `get_organization_images` | Alle, også uten innlogging | Bildene etter hierarkiet (eget → lokallag → fylke → global) med kilde, og `can_change` |
| `organizations` (bildefeltene) | Ingen direkte | `guard_organization_update` avviser endringer i bildefeltene utenom `set_organization_image` |

Lagringsområdene tar bare bilder (WebP, JPEG og PNG): profilbilder maks 5 MB, cover og innhold maks 10 MB. Video kommer etter piloten (prompt 20). Filer i de offentlige områdene har tilfeldige navn, men kan leses av alle som kjenner adressen; bilder i avgrensede innlegg er derfor ikke hemmelige for den som får lenken direkte.

## Kommentarer, reaksjoner, avstemninger og følging (prompt 7)

| Tabell eller RPC | Hvem | Regler |
|---|---|---|
| `add_comment` | Aktiv bruker med aktivt verv i organisasjonen det kommenteres for | Innlegget må være synlig. Teksten renses. Maks 10 kommentarer i minuttet. Brukeren som skrev lagres. `comments` kan ikke skrives direkte |
| `reactions` | Aktiv bruker, via `set_post_support` | Innlegget må være synlig. Hver bruker leser bare egne rader; bare antallet er offentlig (i `list_posts`). Tidligere kunne alle lese hvem som hadde reagert |
| `set_follow` | Aktiv bruker | Bare aktive organisasjoner. `follows` kan ikke skrives direkte |
| `add_post_poll` | Innholdsansvarlig og opp i organisasjonen | Bare på utkast, én per innlegg, 2–10 svaralternativer, frist innen ett år |
| `cast_organization_vote` | Aktiv bruker med aktivt verv i organisasjonen | Én stemme per organisasjon, kan endres til fristen. Innlegget må være synlig. Stemmene leses bare av egen organisasjon |
| `list_posts` | Alle, også uten innlogging | Erstatter `list_post_cards`. Stemmetall bare etter egen organisasjons stemme (aktiv representasjon) eller etter fristen |
| `report_post` | Aktiv bruker som kan se innlegget | Én åpen rapport per innlegg og bruker. Går til modereringskøen (prompt 12) |

Deling (§7): appen deler bare offentlige innlegg. Lenken (`#/innlegg/<id>`) viser innlegget via `list_posts`, så den som ikke har tilgang, får «fant ikke».

## Meldinger (prompt 10)

Meldinger går alltid mellom personer, og ingen administrator kan lese en samtale uten å være med i den (§9, §17).

| RPC | Hvem | Regler |
|---|---|---|
| `start_direct_conversation` | Aktiv bruker | Én direktesamtale per par (`direct_key`). Ikke med seg selv, deaktiverte eller når en av partene har blokkert den andre |
| `create_group_conversation` | Aktiv bruker | 1–80 tegn i navnet, 1–99 andre aktive personer som ikke er blokkert. Oppretteren blir gruppeadministrator |
| `create_organization_group` | Aktiv bruker | Vanlig gruppe med personene med aktivt, offentlig verv i en aktiv organisasjon (`list_organization_contacts`). Ingen organisasjonsinnboks |
| `add_conversation_members` | Gruppeadministrator i en vanlig gruppe | Nye medlemmer får historikkgrense fra nå. Maks 100 medlemmer |
| `leave_conversation` | Medlem av en vanlig gruppe | Systemstyrte grupper og direktesamtaler kan ikke forlates. Forlater siste administrator, blir den som har vært med lengst administrator |
| `send_message` | Aktivt medlem | Tekst (maks 5000 tegn) og/eller inntil fem vedlegg som ligger i egen mappe i samtalen. Stoppes ved blokkering i direktesamtaler. Maks 30 meldinger i minuttet |
| `mark_conversation_read`, `set_conversation_muted`, `hide_message` | Aktivt medlem | Gjelder bare brukerens egen visning |
| `report_message` | Aktiv bruker som kan se meldingen | Ikke egne meldinger, én åpen rapport per melding |
| `search_message_recipients` | Aktiv bruker | Personer (bare navn og skole) og aktive organisasjoner, fra to tegn. Blokkerte personer vises ikke |

Nye samtaler er begrenset til 30 per bruker per døgn (`check_conversation_rate_limit`).

**Systemstyrte grupper.** Hver organisasjon med aktive verv får én gruppe (`kind='managed'`). `sync_managed_conversation` kjøres av en trigger på `memberships` og når samtalelisten hentes: nye medlemmer legges til med historikkgrense fra da, og den som ikke lenger har aktivt verv, tas ut. `is_conversation_member` krever i tillegg aktivt verv, så tilgangen forsvinner samme dag som vervet slutter. Synkroniseringsfunksjonene kan ikke kalles av brukere.

## Innlogging og profilbilder

- Innlogging skjer med engangskode på e-post i Supabase Auth. Profilen finnes ikke før onboarding er fullført; da svarer `get_my_session` «onboarding».
- `profiles_self_update` er fjernet (prompt 3). Den lot brukeren endre alle kolonner i egen profil, også status og skole.
- Profilbilder ligger i `public-avatars/<bruker-id>/`. Brukeren kan laste opp og slette bare i egen mappe (`own_avatar_upload`, `own_avatar_delete`), og `set_avatar` godtar bare en fil som finnes i egen mappe.
- Den første superadministratoren kan ikke tildeles i appen (`assign_role` stopper selvtildeling). Prosjekteieren kjører `supabase/manual/gjor_meg_til_superadmin.sql` i SQL Editor; den krever en eksisterende aktiv profil, er idempotent og logger `role.bootstrapped`.
- Skolebytte (`change_school`) avslutter verv og rettigheter ved gammel skole med sluttdato, gir ingen rettigheter ved ny skole, og stopper siste skoleadministrator.

## Personvern (prompt 14)

| Tabell eller RPC | Hvem | Regler |
|---|---|---|
| `legal_document_versions` | Alle | Lese publiserte versjoner. Skrives bare i migrasjoner. `current_legal_version` gir gjeldende versjon |
| `legal_acceptances` | Innlogget | Lese egne godkjenninger. Skrives bare av `accept_terms`, som avviser andre enn gjeldende versjon. Profilen må finnes (aktiv eller deaktivert) |
| `consent_records` | Innlogget, anonym via RPC | Lese egne (`consent_own_read`). Direkte skriving er fjernet (`consent_own_all`). `record_consent` lagrer valget med versjon og merker tidligere valg som trukket tilbake. Uten innlogging kreves en tilfeldig nettleser-id, og maks ti valg per id i timen |
| `deactivate_my_account` | Innlogget, aktiv profil | Deaktiverer egen profil, avslutter verv og rettigheter, tar brukeren ut av vanlige grupper. Stoppes hvis brukeren er siste administrator i en organisasjon |
| `reactivate_my_account` | Deaktivert profil | Bare når brukeren deaktiverte profilen selv (`deactivated_by_user`). Verv gis ikke tilbake |
| `get_my_privacy`, `export_my_data` | Innlogget, også deaktivert | Egne data. Eksporten logges som en fullført forespørsel i `data_subject_requests` og i revisjonsloggen |
| `request_personal_data`, `cancel_personal_data_request` | Innlogget, også deaktivert | Be om sletting, og trekke en ventende forespørsel. Én åpen forespørsel per type |
| `list_data_subject_requests`, `decide_data_subject_request` | Superadministrator | Se og behandle forespørsler om sletting. Kan ikke behandle egen. Avslag krever begrunnelse |
| `erase_personal_data`, `end_all_roles`, `holds_last_admin_role` | Ingen (bare serverfunksjoner) | Sletter navn, e-post (også i `auth.users`), bilde, meldingsinnhold, vedlegg, varsler, følging, reaksjoner og samtykker; avslutter verv; logger `privacy.erased`. Innlegg og kommentarer blir stående med «Slettet bruker». Brukes også av «Slett» i `admin_manage_user` |

## Sanntid

`messages`, `conversation_members` og `notifications` er med i publikasjonen `supabase_realtime`. Sanntid følger de samme RLS-reglene som vanlig lesing. Appen lytter på nye meldinger og egne samtalemedlemskap, og henter samtalelisten på nytt via RPC når noe endres.

## Tester

`npm run test:db` kjører `supabase/tests/` mot lokal Supabase. CI kjører dem på alle pull requests. Testene sjekker blant annet at alle tabeller i `public` har tvunget RLS.

Alle basetabeller har `ENABLE ROW LEVEL SECURITY` og `FORCE ROW LEVEL SECURITY`. Service role brukes bare i kontrollerte serverfunksjoner og planlagte jobber.
