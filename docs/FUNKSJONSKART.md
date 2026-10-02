# Funksjonskart

Alle synlige knapper og kontroller i appen, per side, sammenholdt med designet i `docs/design/elevradsnett.dc.html`. Oppdateres når en kontroll legges til, endres eller kobles til Supabase.

**Status**

- **Fungerer**: gjør det den skal, enten uten server (navigasjon, filtrering i data som allerede er lastet, lokale skjemasteg) eller via en tjenestemetode som er koblet til Supabase.
- **Demo**: går gjennom `ElevradsnettService` og virker mot `DemoElevradsnettService`, men er ikke ferdig mot Supabase. Kolonnen *Supabase* viser om metoden har en RPC eller tabelltilgang (`ja`) eller kaster `NotImplementedError` (`nei`).
- **Mangler**: knappen vises, men gjør ingenting reelt (bare en melding, deaktivert eller statiske data).

Fra prompt 3 laster appen mot Supabase: økt, organisasjoner, innlegg (fra prompt 5 via `list_post_cards`, fra prompt 7 via `list_posts` med bilder og egen stemme), arrangementer og tillitsvalgte hentes via RPC-er som også virker uten innlogging (§1). Fra prompt 10 er Meldinger koblet til Supabase (`supabase-messaging.ts`, migrasjonen `202610100001_meldinger.sql`).amp; Fra prompt 8 er feeden rangert på serveren og søket gjort på serveren (`202610120001_feed_sok.sql`). Fra prompt 11 er Varsler og Styreoverføring koblet til Supabase (`supabase-varsler.ts`, `202610120002_varsler_overforing.sql`).

**Uten innlogging** kan alt offentlig leses. Kontroller som endrer noe (støtte, kommentere, følge, stemme, interesse for arrangementer, nytt innlegg, rapportere, kontakte) åpner innloggingsdialogen, og handlingen gjøres når brukeren er logget inn. Meldinger, Profil og Administrasjon viser innloggingen i stedet for siden.

**Kravpunkt** viser til punktnumrene (§) i `docs/KRAVSPEC.md`. §19 (brukeropplevelse og universell utforming) gjelder i tillegg alle kontroller.

**I designet** sier om kontrollen finnes i designfila (`ja`), bare i appen (`app`).

## Felles (alle sider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logo (EO-merket + «elevrådsnett») | Går til Hjem | Fungerer | – | – | ja | §19 |
| Meny: Hjem, Arrangementer, Profil | Navigasjon | Fungerer | – | – | ja | §19 |
| Meny: Logg inn | Vises bare uten innlogging | Fungerer | `getSession` | ja | ja | §1, §3 |
| Meny: Varsler med antall uleste | Vises bare innlogget. Tallet er uleste varsler, og oppdateres i sanntid | Fungerer | `listNotifications`, `subscribeToNotifications` | ja (`list_notifications`, sanntid på `notifications`) | app | §5 |
| Meny: Meldinger med antall uleste | Navigasjon; tallet summerer uleste meldinger i samtaler som ikke er dempet. Oppdateres i sanntid | Fungerer | `listConversations`, `subscribeToMessages` | ja (`list_my_conversations`, sanntid på `messages`) | ja | §9 |
| Velger for aktiv representasjon (toppmeny) | Viser hvem brukeren representerer og alle tilknytninger med verv og om de kan publisere. Bytter aktiv representasjon; feeden hentes på nytt for den. Verv i deaktiverte organisasjoner vises merket og kan ikke velges. På mobil vises bare initialene | Fungerer | `switchRepresentation`, `listFeed` | ja (`set_active_representation`) | app | §3, §22 |
| Nytt innlegg (toppmeny) | Åpner innleggsdialogen. Uten innlogging: innloggingsdialogen først. Uten verv: melding om at verv trengs | Fungerer | – | – | ja | §7 |
| Innloggingsdialog | Åpnes av handlinger som krever innlogging, og fullfører handlingen etterpå. Lukk (×) avbryter | Fungerer | `requestLoginCode`, `verifyLoginCode` | ja | app | §1, §7 |
| Varsel om deaktivert profil | Vises øverst når profilen er deaktivert | Fungerer | `getSession` | ja | app | §10 |
| Bunnmeny: Personvern, Vilkår, Informasjonskapsler, Kontakt | Åpner informasjonssidene | Fungerer | – | – | app | §16 |
| Bunnmeny: Administrasjon | Åpner administrasjonen | Fungerer | – | – | app | §12 |
| Lastefeil og Prøv igjen | Viser feilmeldingen hvis data ikke kan lastes, og laster på nytt | Fungerer | alle lesemetoder | – | app | §19 |

## Innleggsdialog (Nytt innlegg, utkast og redigering)

All tekst renses for HTML, styretegn og usynlige retningstegn før lagring, både i klienten (`cleanText`) og i databasen (`clean_text`). Målgruppen må passe avsenderen, og et tagget arrangement må være publisert; serveren sjekker begge (`check_post_content`).

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Lukk (×), Avbryt, Esc, klikk utenfor | Lukker dialogen | Fungerer | – | – | ja | §7 |
| Avsender | Viser organisasjonen innlegget publiseres for (aktiv representasjon, eller eieren av innlegget som redigeres) og hvem som publiserer | Fungerer | `getSession` | ja | ja | §3, §7 |
| Utkast (antall) | Viser lagrede utkast for organisasjonen. Vises bare med publiseringsrett | Fungerer | `listDrafts` | ja (`list_post_drafts`) | app | §7 |
| Utkast: Fortsett | Henter utkastet inn i dialogen | Fungerer | – | – | app | §7 |
| Utkast: Slett | Sletter utkastet etter bekreftelse | Fungerer | `deletePost` | ja (`delete_post`) | app | §7, §19 |
| Skriv / Forhåndsvis | Viser innlegget slik det blir seende ut i feeden, med renset tekst, målgruppe og arrangement | Fungerer | – | – | app | §7 |
| Tekstfelt | Innleggstekst, maks 6000 tegn | Fungerer | – | – | ja | §7 |
| Legg til poll / fjern | Viser spørsmål, svaralternativer og sluttdato (standard om 14 dager). Skjult ved redigering | Fungerer | `publishPost` | ja (`add_post_poll`) | ja | §7 |
| Spørsmål, svaralternativ og «+ Legg til svaralternativ» | Minst to og maks ti alternativer. Tomme felt hoppes over | Fungerer | `publishPost` | ja (`add_post_poll`) | ja | §7 |
| Avsluttes (dato) | Sluttdato for avstemningen, fra i morgen og innen ett år | Fungerer | `publishPost` | ja | app | §7 |
| Legg til bilde / Fjern / bildetekst | Inntil fire bilder. Kodes om i nettleseren (maks 2048 px, WebP eller JPEG, EXIF og GPS fjernes), lastes opp til `public-content/<org>/posts/<innlegg>/` og kontrolleres av `process-media` før innlegget publiseres. Bildetekst for skjermlesere | Fungerer | `publishPost` | ja (`add_post_media`, `process-media`) | ja | §7, §11 |
| Behandlingsstatus | Viser hvert steg mens innlegget lagres, bildene lastes opp og kontrolleres, og publiseres. Avvises et bilde, slettes det nye innlegget og årsaken vises | Fungerer | `publishPost` | ja | app | §11 |
| Tagg arrangement | Kobler innlegget til et publisert arrangement, som vises på kortet | Fungerer | `publishPost`, `saveDraft`, `editPost` | ja | app | §7, §8 |
| Synlig for | Målgrupper som passer avsenderen: skole (alle, fylket, lokallaget hvis skolen har et, venneråd), lokallag (alle, fylket, lokallaget), fylkesstyre (alle, fylket), EO (alle) | Fungerer | `publishPost` | ja (`audience_fits_organization`) | app | §7 |
| Skoleform | Vgs og ungdomsskole, videregående eller ungdomsskole. Feeden skjuler innlegg rettet mot en annen skoleform | Fungerer | `publishPost` | ja | app | §6, §7 |
| Lagre utkast | Lagrer nytt utkast eller oppdaterer det åpne. Deaktivert med poll eller bilde (de publiseres direkte) | Fungerer | `saveDraft` | ja (`create_post`, `update_post`) | app | §7 |
| Publiser | Publiserer som aktiv representasjon, eller publiserer det åpne utkastet. Med poll eller bilder lagres innlegget først som utkast. Deaktivert uten publiseringsrett | Fungerer | `publishPost` | ja (`create_post`, `update_post`, `add_post_poll`, `add_post_media`) | ja | §3, §7 |
| Lagre endringer (redigering) | Lagrer endringer i et publisert innlegg. Forrige versjon lagres, og innlegget merkes «redigert» | Fungerer | `editPost` | ja (`update_post`) | app | §7 |
| Varsel om manglende publiseringsrett | Vises når aktiv representasjon ikke kan publisere (serveren regner ut retten i `get_my_session`) | Fungerer | `getSession` | ja | app | §3, §4 |

## Innleggskort (Hjem og organisasjonssider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Avatar og organisasjonsnavn | Åpner organisasjonssiden. Styrer i EO (nasjonalt, fylkeslag, lokallag) har EO-logoen som standard profilbilde; elevråd viser initialer | Fungerer | – | – | ja | §7 |
| Navn under avsender, tidspunkt, «redigert» | Personen som publiserte. Er profilen deaktivert, står det «Tidligere tillitsvalgt». Tidspunktet åpner innlegget (`#/innlegg/<id>`). Redigerte innlegg merkes | Fungerer | `listFeed` | ja | ja | §1, §7, §10 |
| ··· (flere valg) | Åpner menyen. Vises også på organisasjonssider | Fungerer | – | – | ja | §7 |
| Meny: Del innlegget | Bare offentlige innlegg. Deler lenken til innlegget via systemdeling (Web Share API), ellers kopieres lenken | Fungerer | – | – | app | §7 (Deling) |
| Meny: Rapporter innlegg | Dialog med kategori og valgfri beskrivelse. Én åpen rapport per innlegg. Går til modereringskøen (prompt 12) | Fungerer | `reportPost` | ja (`report_post`) | app | §15 |
| Meny: Rediger innlegg | Åpner innleggsdialogen med innlegget. Vises bare når serveren sier at brukeren kan endre det (`can_manage`) | Fungerer | `editPost` | ja (`update_post`) | app | §7 |
| Meny: Vis endringshistorikk | Tidligere versjoner med dato, hvem som endret, målgruppe og skoleform. Bare for redigerte innlegg og administratorer | Fungerer | `listPostHistory` | ja (`get_post_history`) | app | §7 |
| Meny: Slett innlegg | Sletter innlegget etter bekreftelse. Bare med `can_manage` | Fungerer | `deletePost` | ja (`delete_post`) | app | §7, §19 |
| Målgruppe og skoleform | Merke når innlegget ikke er for alle | Fungerer | `listFeed` | ja | app | §7 |
| Bilder | Bildene i innlegget med bildetekst. Bilder som ikke er ferdig kontrollert eller er avvist, vises med status bare for dem som kan endre innlegget | Fungerer | `listFeed` | ja (`list_posts`) | ja | §7, §11 |
| Støtt (tommel) med antall | Gir eller fjerner støtte. Bare antallet er offentlig; ingen kan se hvem som har støttet | Fungerer | `setPostSupport` | ja (`set_post_support`) | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarer med antall | Viser og skjuler kommentarer | Fungerer | – | – | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarfelt og Send | Kommenterer som aktiv representasjon; krever aktivt verv. Teksten renses, maks 10 i minuttet. Uten innlogging: knappen «Logg inn for å kommentere». Uten verv: forklaring | Fungerer | `addComment` | ja (`add_comment`) | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Del (pil) | Som «Del innlegget». Vises bare på offentlige innlegg | Fungerer | – | – | app | §7 (Deling) |
| Avstemningsalternativ | Stemmer på vegne av aktiv organisasjon (én stemme per organisasjon), kan endres til fristen. Resultatet vises etter egen stemme eller etter fristen. Avsluttede avstemninger kan ikke endres | Fungerer | `vote` | ja (`cast_organization_vote`, `list_posts`) | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Koblet arrangement | Åpner arrangementet | Fungerer | – | – | ja | §8 |

## Hjem (`#/`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt og Søk | Går til Utforsk med søket | Fungerer | – | – | ja | §6 |
| Nettverk: Se alle | Går til Utforsk | Fungerer | – | – | ja | §6 |
| Nettverk: organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Nettverk: Følg / Følger | Følger eller slutter å følge elevråd. Antallet kommer fra serveren | Fungerer | `setFollow` | ja (`set_follow`) | ja | §6 |
| Nettverk: Åpne (fylkeslag og EO) | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Arrangementer: Se alle | Går til Arrangementer | Fungerer | – | – | ja | §8 |
| Arrangementer: kort | Åpner arrangementet | Fungerer | – | – | ja | §8 |
| Sortering: Anbefalt / Nyeste | Vises innlogget. Anbefalt er rangert av serveren (`docs/FEED.md`), Nyeste er kronologisk. Valget huskes i nettleseren | Fungerer | `listFeed` | ja (`list_posts`, `get_ranked_feed`) | app | §6 |
| Filter: Alle / fylket | Filtrerer feeden på brukerens fylke | Fungerer | – | – | ja | §6 |
| Feed | Viser innlegg. Uten innlogging: offentlige innlegg, nyeste først. Innlogget: feeden for aktiv representasjon, ellers for skolen brukeren går på, beregnet på nytt ved bytte av skole eller representasjon | Fungerer | `listFeed` | ja (`list_posts`) | ja | §1, §6 |

## Utforsk (`#/utforsk`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt | Fulltekstsøk på norsk på serveren fra to tegn: skoler, fylkeslag, lokallag og EO, personer, arrangementer og innlegg, gruppert | Fungerer | `search` | ja (`search_directory`) | ja | §6 |
| Vis tidligere tillitsvalgte og deaktiverte skoler | Tar med deaktiverte skoler og personer med avsluttede verv. De merkes; deaktiverte personer kan ikke åpnes | Fungerer | `search` | ja (`search_directory`) | app | §1, §6 |
| Treff | Åpner skolen, styret, personen, arrangementet eller innlegget | Fungerer | – | – | app | §6 |
| Elevråd: navn og Se side | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Elevråd: Følg / Følger | Følger eller slutter å følge. Antallet kommer fra serveren | Fungerer | `setFollow` | ja (`set_follow`) | ja | §6 |
| Fylkeslag og EO: navn og Åpne | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Nye innlegg: utdrag | Åpner innlegget | Fungerer | – | – | ja | §6 |

## Arrangementer (`#/arrangementer`)

Interesse, påmelding av organisasjonen, delegater og bekreftet oppmøte er fire adskilte ting (§8, prompt 9). «Skal» fra designet er erstattet av påmelding på arrangementsiden, siden påmelding gjelder organisasjonen og krever rettighet.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Liste over arrangementer | Kommende arrangementer, også uten innlogging. Utkast vises bare for arrangøren, merket «Utkast». Avlyste merkes «Avlyst» | Fungerer | `listEvents` | ja (`list_events`) | ja | §1, §8 |
| Tidligere arrangementer, Vis / Skjul | Avsluttede og passerte arrangementer | Fungerer | `listEvents` | ja | app | §8 |
| Nytt arrangement | Vises bare når serveren sier at brukeren kan arrangere (styreadministrator i et styre eller EO). Åpner skjemaet | Fungerer | `listEventOrganizers` | ja (`list_my_event_organizers`) | app | §4, §8 |
| Skjema: arrangør, tittel, ingress, beskrivelse, type, målgruppe, start, slutt, sted, lenke, frist, pris, kapasitet, plasser per organisasjon | Validering i `eventInputSchema` og i databasen | Fungerer | `saveEvent` | ja (`save_event`) | app | §8 |
| Skjema: Lagre som utkast / Publiser / Avbryt | Lagrer som utkast eller publiserer | Fungerer | `saveEvent` | ja (`save_event`) | app | §8 |
| Bilde | Bilde eller plassholder, åpner arrangementet | Fungerer | – | – | ja | §8, §11 |
| Interessert | Personlig interesse. Krever bare innlogging, ikke verv | Fungerer | `setEventInterest` | ja (`set_event_interest`) | ja | §8 |
| Påmelding og detaljer | Åpner arrangementet | Fungerer | – | – | ja | §8 |

## Arrangement (`#/arrangementer/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Alle arrangementer | Tilbake til listen | Fungerer | – | – | ja | §8 |
| Fakta, beskrivelse, tall | Dato, sted, plasser/pris/frist, antall påmeldte organisasjoner og interesserte personer, målgruppe | Fungerer | `listEvents` | ja | ja | §8 |
| Lenke til møtet | Vises bare for arrangøren og deltakerne | Fungerer | `listEvents` | ja (`list_events`) | app | §8, §17 |
| Interessert | Som i listen | Fungerer | `setEventInterest` | ja | ja | §8 |
| Administrer: Rediger / Rediger og publiser | Åpner skjemaet. Vises bare når serveren svarer `canEdit` | Fungerer | `saveEvent` | ja | app | §8 |
| Administrer: Legg til / Bytt / Fjern bilde | Bildet kodes om i nettleseren (EXIF og GPS fjernes) og lastes opp under arrangøren i `public-content` | Fungerer | `setEventImage` | ja (`set_event_image`) | app | §8, §11 |
| Administrer: Avlys | Avlyser etter bekreftelse og varsler delegatene | Fungerer | `setEventStatus` | ja (`set_event_status`) | app | §8, §19 |
| Administrer: Marker som avsluttet | Etter start, etter bekreftelse | Fungerer | `setEventStatus` | ja | app | §8 |
| Du er delegat: Jeg kommer / Kan ikke | Delegaten svarer selv frem til start | Fungerer | `getEventParticipation`, `respondToDelegation` | ja (`get_event_participation`, `respond_event_delegation`) | app | §8 |
| Påmelding: Meld på / Meld av | For organisasjonene serveren sier brukeren kan melde på (skoleadministrator, innholdsansvarlig, styreadministrator). Fullt gir venteliste; avmelding gir plassen til den første på ventelisten og fjerner delegatene | Fungerer | `registerForEvent` | ja (`register_for_event`) | app | §8 |
| Påmelding: Logg inn for å melde på | Uten innlogging | Fungerer | – | – | app | §1 |
| Delegater: + Legg til delegat, søk, Fjern | Elever ved skolen eller personer med verv i styret. Grense per organisasjon. Delegaten varsles | Fungerer | `searchDelegateCandidates`, `addEventDelegate`, `removeEventDelegate` | ja (`list_delegate_candidates`, `add_event_delegate`, `remove_event_delegate`) | app | §8 |
| Påmeldte og oppmøte: Møtte / Møtte ikke, Bekreft alle som har sagt ja | Bare for arrangøren, etter start. Bare dette gir CV-oppføring | Fungerer | `confirmAttendance`, `confirmAllAttendance` | ja (`confirm_event_attendance`, `confirm_all_event_attendance`) | app | §8, §22 |
| Arrangør | Åpner arrangørens side | Fungerer | – | – | ja | §8 |

## Person (`#/person/<id>`)

Offentlig CV (§8). Kan leses uten innlogging. Deaktiverte personer har ingen offentlig side.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Navn, skole og stjerner | Én stjerne per bekreftet deltakelse på Elevtinget | Fungerer | `getPersonCv` | ja (`get_person_cv`) | app | §8 |
| Verv | Aktive og tidligere offentlige verv. Interne rettigheter vises aldri. Organisasjonen kan åpnes | Fungerer | `getPersonCv` | ja | app | §4, §8 |
| Arrangementer | Arrangementer med bekreftet oppmøte, for hvilken organisasjon og i hvilket verv | Fungerer | `getPersonCv` | ja | app | §8 |
| Til profilen din | Vises på egen side | Fungerer | – | – | app | §8 |

## Organisasjon (`#/org/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Nytt innlegg som … | Åpner innleggsdialogen (egen organisasjon med publiseringsrett). Skjules for deaktiverte organisasjoner | Fungerer | – | – | ja | §2, §6 |
| Deaktivert-merke og forklaring | Deaktiverte organisasjoner kan åpnes fra gamle innlegg og lenker. Historikken vises, men ikke kontakt- eller publiseringsknapper | Fungerer | `getOrganization` | ja (`get_public_organization`) | app | §1, §2 |
| Kontakt EO / fylkesstyret / lokallaget, Foreslå samarbeid | Går til Meldinger og viser organisasjonens kontaktpersoner og tilbud om en gruppe. Det opprettes ingen organisasjonsinnboks. Uten innlogging: innloggingen først | Fungerer | `listOrganizationContacts` | ja (`list_organization_contacts`) | ja | §9 |
| Prioriterte saker, tillitsvalgte, statistikk | Visning, også uten innlogging | Fungerer | `listOrganizations`, `listPublicOfficers` | ja (`list_public_organizations`, `get_public_officers`) | ja | §1, §2, §4 |
| Kommende arrangementer | Åpner arrangementet. Utkast og passerte arrangementer vises ikke | Fungerer | – | – | ja | §8 |
| Deltakelse på arrangementer (skolens CV) | Arrangementer organisasjonen har deltatt på, med årstall, hvem som representerte den og vervet de hadde. Deaktiverte personer vises som «Tidligere tillitsvalgt» uten lenke | Fungerer | `getOrganizationCv` | ja (`get_organization_cv`) | app | §8 |
| Innlegg | Innleggskort med meny (se over). Hentes for siden, også når de ikke er i feeden | Fungerer | `listOrganizationPosts` | ja (`list_post_cards`) | ja | §1, §7 |
| Profil- og coverbilde | Bildene etter hierarkiet (eget → lokallag → fylke → global). Styrer uten eget bilde viser EO-logoen | Fungerer | `getOrganizationImages` | ja (`get_organization_images`) | ja | §14 |
| Last opp / Bytt / Fjern profilbilde og coverbilde | Bare for skole- og styreadministrator (`can_change`). Viser om bildet er eget eller arvet. Kodes om i nettleseren og kontrolleres av `process-media`; den gamle filen slettes. Låste bilder kan ikke endres | Fungerer | `setOrganizationImage` | ja (`set_organization_image`) | app | §11, §14 |

## Meldinger (`#/meldinger`)

Meldinger er alltid mellom personer (§9): direktemeldinger, vanlige grupper og systemstyrte grupper for skoler og styrer som følger de aktive vervene. Uten innlogging vises innloggingen i stedet for siden. På mobil vises enten samtalelisten eller samtalen, med «← Alle samtaler» tilbake.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Samtaleliste | Viser samtalene med siste melding, antall uleste og «Dempet». Direktesamtaler har navnet til den andre personen, systemstyrte grupper navnet til organisasjonen | Fungerer | `listConversations` | ja (`list_my_conversations`) | ja | §9 |
| Søk (person, elevråd eller fylkeslag) | Filtrerer egne samtaler, og søker etter personer (navn og skole) og organisasjoner fra to tegn | Fungerer | `searchRecipients` | ja (`search_message_recipients`) | ja | §9 |
| Person i søket | Åpner direktesamtalen, eller oppretter den | Fungerer | `startDirectConversation` | ja (`start_direct_conversation`) | app | §9 |
| Organisasjon i søket | Viser offentlige kontaktpersoner med «Send melding», og «Opprett gruppe med alle kontaktpersonene». Ingen organisasjonsinnboks | Fungerer | `listOrganizationContacts`, `createOrganizationGroup` | ja (`list_organization_contacts`, `create_organization_group`) | app | §9 |
| Ny gruppe | Navn og medlemmer (personsøk). Den som oppretter, blir gruppeadministrator | Fungerer | `createGroup` | ja (`create_group_conversation`) | app | §9 |
| Innstillinger: Lest-status | Av som standard. Lest-status vises bare mellom personer som begge har slått den på | Fungerer | `getMessageSettings`, `setReadReceipts` | ja (`get_message_settings`, `set_read_receipts`) | app | §9 |
| Innstillinger: Blokkerte personer, Opphev blokkering | Lister og opphever egne blokkeringer | Fungerer | `listBlockedUsers`, `unblockUser` | ja (`list_my_blocks`, `unblock_user`) | app | §9 |
| Samtale i listen | Åpner samtalen og markerer den som lest | Fungerer | `listMessages`, `markConversationRead` | ja (`get_conversation_messages`, `mark_conversation_read`) | ja | §9 |
| Navn i samtalehodet | Åpner organisasjonssiden (systemstyrte grupper) | Fungerer | – | – | ja | §9 |
| Demp / Slå på varsler | Demper samtalen. Dempede samtaler teller ikke i menyen, og gir ikke varsler | Fungerer | `setConversationMuted` | ja (`set_conversation_muted`) | app | §9 |
| Medlemmer | Viser medlemmene. Gruppeadministrator kan legge til personer; nye medlemmer ser bare meldinger fra de ble lagt til | Fungerer | `listConversationMembers`, `addConversationMembers` | ja (`list_conversation_members`, `add_conversation_members`) | app | §9 |
| Forlat (vanlige grupper) | Spør først, og tar brukeren ut av gruppen. Systemstyrte grupper kan ikke forlates | Fungerer | `leaveConversation` | ja (`leave_conversation`) | app | §9 |
| Blokker (direktesamtaler) | Spør først. Stopper direktemeldinger begge veier og skjuler meldingene fra personen, også i grupper | Fungerer | `blockUser` | ja (`block_user`) | app | §9 |
| ⋯ på en melding: Slett for meg | Skjuler meldingen bare for brukeren selv | Fungerer | `hideMessage` | ja (`hide_message`) | app | §9 |
| ⋯ på en melding: Rapporter | Kategori og valgfri beskrivelse. Bare den ene meldingen deles med moderator. Ikke for egne meldinger | Fungerer | `reportMessage` | ja (`report_message`) | app | §9, §15 |
| Lest / Lest av N | Vises på egne meldinger når lest-status er slått på | Fungerer | `listMessages` | ja | app | §9 |
| + (Legg ved bilde eller PDF) | Inntil fem filer på maks 25 MB. Bilder kodes om i nettleseren (fjerner EXIF og GPS) | Fungerer | `sendMessage` | ja (`private-message-attachments`, `send_message`) | app | §9, §11 |
| Vedlegg i en melding | Åpnes med en tidsbegrenset lenke (ti minutter) | Fungerer | `getAttachmentUrl` | ja (signed URL) | app | §9 |
| Meldingsfelt og Send | Sender melding med tekst og/eller vedlegg | Fungerer | `sendMessage` | ja (`send_message`) | ja | §9 |
| Nye meldinger | Samtalelisten og den åpne samtalen oppdateres i sanntid | Fungerer | `subscribeToMessages` | ja (sanntid) | app | §9 |

## Profil (`#/profil`)

Uten innlogging vises innloggingen i stedet for profilen.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Legg til bilde / Bytt bilde | Velger bilde, beskjærer til kvadrat og koder om i nettleseren (fjerner EXIF og GPS), laster opp til `public-avatars/<bruker-id>/` | Fungerer | `setAvatar` | ja (`set_avatar`) | app | §10, §11 |
| Fjern (profilbilde) | Fjerner profilbildet og sletter filen | Fungerer | `removeAvatar` | ja | app | §10, §11 |
| Rediger profil, Navn, Lagre / Avbryt | Endrer navnet | Fungerer | `updateProfile` | ja (`update_profile`) | app | §10 |
| Åpne elevrådets side | Åpner skolens elevrådsside | Fungerer | – | – | ja | §3, §10 |
| Bytt skole, søk, Bytt til … / Avbryt | Bytter skole selv. Verv ved gammel skole avsluttes med sluttdato, ingen rettigheter følger med. Siste skoleadministrator stoppes | Fungerer | `changeSchool` | ja (`change_school`) | app | §1, §3 |
| Skolehistorikk | Viser nåværende og tidligere skoler | Fungerer | `listSchoolHistory` | ja (`get_my_school_history`) | app | §1, §3 |
| Representasjon (navn) | Åpner organisasjonssiden | Fungerer | – | – | app | §3, §10 |
| Bruk | Bytter aktiv representasjon og henter feeden for den. Verv i deaktiverte organisasjoner er merket «Deaktivert» og kan ikke brukes | Fungerer | `switchRepresentation`, `listFeed` | ja | app | §3 |
| Verv og rettigheter: offentlige verv, interne rettigheter, tidligere verv | Egne verv og rettigheter med datoer, også avsluttede. Innholdsansvarlig vises for personen selv. Erstatter de statiske brikkene «Roller i systemet» | Fungerer | `listMyRoles` | ja (`get_my_roles`) | ja | §3, §4 |
| Gå av (verv) | Avslutter eget verv med sluttdato etter bekreftelse | Fungerer | `endPublicOffice` | ja (`end_public_office`) | app | §4, §19 |
| Gi fra deg (rettighet) | Gir fra seg egen rettighet etter bekreftelse. Siste administrator stoppes | Fungerer | `revokeRole` | ja (`revoke_role`) | app | §4, §17 |
| Be om å bli skoleadministrator, melding, Send / Avbryt | Sender forespørsel for egen skole til styret. Vises ikke for skoleadministratorer | Fungerer | `requestSchoolAdmin` | ja (`request_school_admin`) | app | §4 |
| Forespørsel: status og Trekk | Viser egne forespørsler og lar en ventende trekkes | Fungerer | `listSchoolAdminRequests`, `cancelSchoolAdminRequest` | ja | app | §4 |
| Du er meldt på som delegat: Jeg kommer / Kan ikke | Egne ubesvarte og bekreftede invitasjoner | Fungerer | `getPersonCv`, `respondToDelegation` | ja (`get_person_cv`, `respond_event_delegation`) | app | §8 |
| Arrangementer (CV) med stjerner | Egne arrangementer med bekreftet oppmøte | Fungerer | `getPersonCv` | ja | app | §8 |
| Se CV-en slik andre ser den | Åpner `#/person/<id>` | Fungerer | – | – | app | §8 |
| Innlogging: e-post, Telefonnummer og Feide («Kommer senere») | Visning. Telefonnummer kan ikke lagres i piloten | Fungerer | `getSession` | ja | app | §1, §3 |
| Logg ut | Logger ut og går til Hjem | Fungerer | `signOut` | ja | app | §3 |

## Logg inn (`#/logg-inn`, innloggingsdialogen og innlogging på Meldinger, Profil og Administrasjon)

Samme flyt alle steder. Fra `#/logg-inn` sendes brukeren tilbake til siden de kom fra.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logg inn med: E-post | Valgt | Fungerer | – | – | ja | §3 |
| Logg inn med: Telefonnummer («Kommer senere») | Deaktivert; SMS koster | Mangler | – | – | ja | §1 |
| E-post og Send kode | Sender en sekssifret engangskode. Svarer likt om kontoen finnes eller ikke | Fungerer | `requestLoginCode` | ja (Supabase Auth) | ja | §3, §17 |
| Engangskode og Logg inn | Logger inn. Nye brukere går videre til onboarding | Fungerer | `verifyLoginCode` | ja (Supabase Auth) | app | §3 |
| Send ny kode (etter 60 s) / Bruk en annen e-post | Ny kode eller tilbake til e-post | Fungerer | `requestLoginCode` | ja | app | §3 |
| Logg inn med Feide (Ikke tilgjengelig) | Deaktivert | Mangler | – | – | ja | §1 |
| Onboarding: Søk etter skole og treffliste | Velger skole | Fungerer | – | – | ja | §3 |
| Onboarding: Navn | Fritekst, 2–120 tegn | Fungerer | – | – | ja | §3 |
| Onboarding: Dato for neste valg | Valgfri dato, fra i dag og inntil to år frem | Fungerer | `completeOnboarding` | ja | app | §5 |
| Onboarding: Fortsett / Tilbake / Fullfør / Hopp over | Oppretter profilen med skole og eventuell valgdato | Fungerer | `completeOnboarding` | ja (`complete_onboarding`) | ja | §3, §5 |
| Onboarding: Logg ut | Avbryter onboarding | Fungerer | `signOut` | ja | app | §3 |
| Allerede innlogget: Til forsiden / Logg ut | Vises på `#/logg-inn` når brukeren er logget inn | Fungerer | `signOut` | ja | app | §3 |

## Administrasjon (`#/admin`)

Uten innlogging vises innloggingen. Innlogget uten administratorrettigheter vises en forklaring med lenke til profilen. Hvilke organisasjoner og rettigheter som vises, kommer fra serveren (`list_my_admin_organizations`); klienten avgjør ingenting selv. Finnes ikke i designet.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Organisasjon (velger og søk) | Velger blant organisasjonene brukeren administrerer: egne, eget lokallag (fylkesstyreregelen), skolene i området, eller alle for superadministrator. Søkefeltet vises ved mer enn åtte | Fungerer | `listAdminOrganizations` | ja | app | §4, §12 |
| Merke for egen rolle | Skoleadministrator, styreadministrator (i området) eller superadministrator | Fungerer | `listAdminOrganizations` | ja | app | §4 |
| MFA-port for superadministrator | Vises bare når serveren sier at tofaktor kreves (`admin_mfa_required`). Av i piloten: innlogging med e-postkode er nok. Når kravet slås på: oppsett og kodekontroll med autentiseringsapp (TOTP) | Fungerer (av i piloten) | `getMfaStatus`, `enrollTotp`, `verifyTotp`, `challengeTotp` | ja (`has_role` bruker `super_admin_session_ok`) | app | §17 |
| Faner: Oversikt, Brukere, Roller og verv, Forespørsler, Venneråd, Styreoverføring, Organisasjoner, Innhold, Medier, Moderering, CSV | Bytter fane. Venneråd vises bare for skoler der serveren oppgir skole- eller superadministrator | Fungerer | – | – | app | §4, §5, §7, §12 |
| Oversikt: aggregerte nøkkeltall | Aktive brukere/skoler, innlegg og åpne modereringssaker i valgt område. Privat meldingsinnhold inngår ikke | Fungerer | `getAdminDashboard` | ja (`get_admin_dashboard`) | app | §12 |
| Oversikt: Behandle (forespørsler) | Går til Forespørsler | Fungerer | – | – | app | §4 |
| Oversikt: Revisjonslogg | Siste endringer i organisasjonen med navn på den som endret og den det gjaldt | Fungerer | `listAuditLog` | ja (`list_audit_log`) | app | §4, §17, §22 |
| Roller og verv: offentlige verv | Aktive verv med dato og hvem som ga dem. Deaktiverte brukere er merket | Fungerer | `listOrganizationRoles` | ja (`list_organization_roles`) | app | §4 |
| Roller og verv: + Gi verv, personsøk, Verv (med forslag), Gi verv / Avbryt | Gir et offentlig verv. Personsøket viser bare dem serveren tillater | Fungerer | `searchAssignablePeople`, `assignPublicOffice` | ja (`list_assignable_people`, `assign_public_office`) | app | §4 |
| Roller og verv: Avslutt (verv) | Avslutter vervet med sluttdato etter bekreftelse | Fungerer | `endPublicOffice` | ja (`end_public_office`) | app | §4, §19 |
| Roller og verv: interne rettigheter | Aktive rettigheter. Innholdsansvarlig vises bare her og for personen selv | Fungerer | `listOrganizationRoles` | ja | app | §4 |
| Roller og verv: + Gi rettighet, personsøk, Rettighet, Gi rettighet / Avbryt | Tildeler en rettighet. Listen over rettigheter kommer fra serveren. Ingen kan gi seg selv rettigheter | Fungerer | `assignRole` | ja (`assign_role`) | app | §4, §17 |
| Roller og verv: Fjern (rettighet) | Tilbakekaller etter bekreftelse. Vises bare når serveren sier at brukeren kan endre rollen. Siste administrator stoppes | Fungerer | `revokeRole` | ja (`revoke_role`) | app | §4, §17 |
| Roller og verv: Historikk, Vis / Skjul | Avsluttede verv og rettigheter med sluttdato | Fungerer | `listOrganizationRoles` | ja | app | §3, §4 |
| Venneråd: liste | Godkjente venneråd og ventende forespørsler til og fra skolen | Fungerer | `listFriendConnections` | ja (`list_friend_connections`) | app | §7 |
| Venneråd: Godta / Avslå | Svarer på en forespørsel fra en annen skole. Vises bare når serveren sier at brukeren kan avgjøre | Fungerer | `decideFriendRequest` | ja (`decide_friend_request`) | app | §7 |
| Venneråd: Avslutt, Trekk tilbake | Avslutter et venneråd etter bekreftelse, eller trekker en sendt forespørsel | Fungerer | `endFriendConnection` | ja (`end_friend_connection`) | app | §7, §19 |
| Venneråd: Søk etter skole, Send forespørsel | Søker blant aktive skoler og sender forespørsel. Har den andre skolen allerede spurt, blir forbindelsen godkjent | Fungerer | `requestFriendSchool` | ja (`request_friend_school`) | app | §7 |
| Forespørsler: Begrunnelse, Godkjenn, Avslå | Styreadministrator i området avgjør forespørsler om å bli skoleadministrator | Fungerer | `listSchoolAdminRequests`, `decideSchoolAdminRequest` | ja (`list_school_admin_requests`, `decide_school_admin_request`) | app | §4 |
| Styreoverføring: oversikt | Neste styreskifte (med dager igjen eller forsinkelse), styreperioden og antall skoleadministratorer, med advarsel under to. Bare for skoler | Fungerer | `getHandoverOverview` | ja (`get_handover_overview`) | app | §5 |
| Styreoverføring: Endre datoen / Sett datoen | Ny dato for styreskiftet, f.eks. når valget utsettes | Fungerer | `setElectionDate` | ja (`set_election_date`) | app | §5 |
| Styreoverføring: Start styreoverføring | Skoleadministrator åpner veiviseren | Fungerer | – | – | ja | §5 |
| Styreoverføring: Start gjenoppretting | Styreadministrator i området eller superadministrator, når overføringen er minst sju dager forsinket eller skolen mangler skoleadministrator. Krever begrunnelse | Fungerer | `startHandover` | ja (`start_handover`) | app | §5 |
| Veiviser steg 1: datoer (og begrunnelse ved gjenoppretting) | Dato for styreskiftet, sluttdato for gammelt styre og aktivering | Fungerer | – | – | ja | §5 |
| Veiviser steg 2: Dagens styre, søk blant elevene, Verv, Fjern, + Inviter ny bruker | Velger det nye styret blant elevene ved skolen eller på e-post (nye brukere) | Fungerer | `searchAssignablePeople` | ja | ja | §5 |
| Veiviser steg 3: Rettighet per person | Skoleadministrator, innholdsansvarlig eller ingen. Minst én ny skoleadministrator | Fungerer | – | – | ja | §5 |
| Veiviser steg 4: Forhåndsvisning, Send invitasjoner | Viser hva som gis og hva som avsluttes, og sender invitasjonene. Invitasjoner på e-post sendes med det daglige sammendraget | Fungerer | `startHandover` | ja (`start_handover`) | ja | §5, §17 |
| Veiviser: Tilbake / Neste / Avbryt | Går mellom stegene; hvert steg valideres | Fungerer | – | – | ja | §5 |
| Pågående overføring: invitasjoner med status | Venter på svar, Godtatt, Takket nei, Utløpt | Fungerer | `getHandoverOverview` | ja | app | §5 |
| Pågående overføring: Aktiver nå | Aktiverer det nye styret i dag når en ny skoleadministrator har godtatt | Fungerer | `activateHandoverNow` | ja (`complete_handover`) | app | §5 |
| Pågående overføring: Endre datoene, Avlys | Nye datoer, eller avlysning (invitasjonene slutter å gjelde, de inviterte varsles) | Fungerer | `rescheduleHandover`, `cancelHandover` | ja (`reschedule_handover`, `cancel_handover`) | app | §5 |
| Brukere: Administrer | Bytter skole, deaktiverer, reaktiverer eller anonymiserer/sletter personopplysninger med begrunnelse. Egen bruker kan ikke administreres, og selvdeaktivert profil krever samtykke før reaktivering | Fungerer | `getAdminDashboard`, `manageAdminUser` | ja (`admin_manage_user`) | app | §1, §10, §12 |
| Organisasjoner: skole og status | Viser skoler avgrenset til eget område, lokallag, administratorantall og status. Deaktiverer eller reaktiverer med begrunnelse uten å fjerne historikk | Fungerer | `getAdminDashboard`, `setOrganizationStatus` | ja (`set_organization_status`) | app | §1, §12 |
| Innhold: innlegg, kommentarer og arrangementer | Viser status og eierorganisasjon for innhold i eget område | Fungerer | `getAdminDashboard` | ja | app | §12 |
| Medier: behandlingsstatus | Viser mediefiler, eier, behandlingsstatus og placeholdermerking | Fungerer | `getAdminDashboard` | ja | app | §11, §12 |
| Standardbilder og bildelås | Viser om profil-/coverbildet er eget eller arvet, setter standarder og lar bare superadministrator låse | Fungerer | `getAdminDashboard`, `setAdminImages` | ja (`resolve_organization_images`, `set_admin_images`) | app | §12, §14 |
| Placeholders: Slett / Slett alle | Superadministrator kan fjerne enkeltvise eller alle placeholders i valgt område; tilknyttede lagringsstier ryddes | Fungerer | `deletePlaceholder`, `deleteAllPlaceholders` | ja (`delete_placeholder`, `delete_all_placeholders`) | app | §11, §12 |
| Eksempelinnhold: Av / På | Superadministrator skrur eksempelinnhold på eller av. På: seks eksempelbrukere med verv ved hver sin pilotskole, åtte innlegg fra dem, fire arrangementer, og to direktemeldinger og én gruppe med hver aktiv bruker. Alt er merket «(eksempel)». Av: alt slettes, også kommentarer, reaksjoner og samtaler med eksempelbrukerne. «På» igjen gir nye brukere eksempelsamtalene | Fungerer (demo: bare bryteren) | `getPlaceholderContentStatus`, `setPlaceholderContent` | ja (`get_placeholder_content_status`, `set_placeholder_content`) | app | §11, §12 |
| Moderering: kø og Behandle | Viser områdets rapporter, rapportør, innhold, status, moderator og historikk. For meldinger vises bare det ene innholdet rapportøren delte. Støtter skjul, slett, advarsel, begrensning, deaktivering, gjenoppretting og ingen handling | Fungerer | `listModerationReports`, `applyModerationAction` | ja (`list_moderation_queue`, `apply_moderation_action`) | app | §15 |
| Moderering: klage og ny vurdering | Behandlede saker kan påklages av rapportøren eller den rapporterte; saken prioriteres på nytt i køen | Fungerer i tjenestelaget; brukerflate kobles til innholdsrapportering i prompt 7 | `appealModerationReport` | ja (`appeal_moderation_report`) | app | §15 |
| CSV: Last ned mal | Viser bare en melding | Mangler | – | – | app | §13 |
| CSV: Last opp UTF-8 CSV | Viser en fast forhåndsvisning, leser ingen fil | Mangler | – | – (`apply_school_import` finnes) | app | §13 |
| CSV: Gå til bekreftelse | Viser bare en melding | Mangler | – | – | app | §13 |

## Informasjon (`#/info/<side>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Faner: Personvern, Vilkår, Informasjonskapsler, Kontakt | Bytter side | Fungerer | – | – | app | §16 |
| E-postlenke teknisk@elev.no | Åpner e-postklient | Fungerer | – | – | app | §16 |

## Innlegg (`#/innlegg/<id>`)

Delte lenker. Viser ett innlegg hvis det er synlig for den som åpner lenken; ellers «Fant ikke siden».

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Til forsiden | Går til Hjem | Fungerer | – | – | app | §19 |
| Innleggskortet | Som i feeden | Fungerer | `getPost` | ja (`list_posts`) | app | §7 |

## Varsler (`#/varsler`)

Bare innlogget. Varslene lagres på serveren; e-post kommer som ett daglig sammendrag (Edge-funksjonen `send-digest`, prompt 11).

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Merk alle som lest | Merker alle uleste varsler som lest | Fungerer | `markNotificationsRead` | ja (`mark_notifications_read`) | app | §5 |
| Invitasjoner til nytt styre: Godta / Takk nei | Den inviterte svarer selv. Godta krever at brukeren går på skolen. Rollen gjelder fra aktiveringsdatoen | Fungerer | `listMyHandoverInvites`, `respondToHandoverInvite` | ja (`list_my_handover_invites`, `respond_handover_invite`) | app | §5 |
| Invitasjoner: Profil (lenke) | Går til Profil for å bytte skole | Fungerer | – | – | app | §5 |
| Varsel | Merker varselet som lest og åpner lenken i varselet | Fungerer | `markNotificationsRead` | ja | app | §5 |
| Innstillinger: I Elevrådsnett, Daglig sammendrag på e-post | Slår kanalene av og på | Fungerer | `getNotificationPreferences`, `setNotificationPreferences` | ja (`get_notification_preferences`, `set_notification_preferences`) | app | §5 |
| Innstillinger: Pushvarsler | Deaktivert, merket «Kommer senere» (prompt 19) | Mangler | – | – | app | §5 |
| Innstillinger: type per kanal (Meldinger, Arrangementer, Styreoverføring, Verv og rettigheter, Venneråd, Annet) | Slår av typer varsler i hver kanal | Fungerer | `setNotificationPreferences` | ja | app | §5 |
| Lagre innstillingene | Lagrer | Fungerer | `setNotificationPreferences` | ja | app | §5 |

## Fant ikke siden

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Til forsiden | Går til Hjem | Fungerer | – | – | app | §19 |

## Serverfunksjoner uten kontroll ennå

Finnes i databasen (prompt 2), men er ikke koblet til en knapp. Kolonnen *Prompt* viser når de får en kontroll.

| RPC eller tabell | Hva den gjør | Status | Prompt | Kravpunkt |
|---|---|---|---|---|
| `request_personal_data` | Forespørsel om eksport eller sletting av egne data | Mangler kontroll | 14 | §10, §16 |
| `resolve_organization_images` | Bildehierarkiet eget → lokallag → fylke → global, med lås og kilde. Vises på organisasjonssiden fra prompt 6 (`get_organization_images`); standardbilder og lås kommer i adminpanelet | Delvis | 12 | §14 |
