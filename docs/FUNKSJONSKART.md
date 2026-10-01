# Funksjonskart

Alle synlige knapper og kontroller i appen, per side, sammenholdt med designet i `docs/design/elevradsnett.dc.html`. Oppdateres når en kontroll legges til, endres eller kobles til Supabase.

**Status**

- **Fungerer**: gjør det den skal, enten uten server (navigasjon, filtrering i data som allerede er lastet, lokale skjemasteg) eller via en tjenestemetode som er koblet til Supabase.
- **Demo**: går gjennom `ElevradsnettService` og virker mot `DemoElevradsnettService`, men er ikke ferdig mot Supabase. Kolonnen *Supabase* viser om metoden har en RPC eller tabelltilgang (`ja`) eller kaster `NotImplementedError` (`nei`).
- **Mangler**: knappen vises, men gjør ingenting reelt (bare en melding, deaktivert eller statiske data).

Fra prompt 3 laster appen mot Supabase: økt, organisasjoner, innlegg (fra prompt 5 via `list_post_cards`), arrangementer og tillitsvalgte hentes via RPC-er som også virker uten innlogging (§1). `listConversations` mangler fortsatt RPC for innloggede (prompt 10); Meldinger viser da en feilmelding i stedet for at appen stopper.

**Uten innlogging** kan alt offentlig leses. Kontroller som endrer noe (støtte, kommentere, følge, stemme, interesse for arrangementer, nytt innlegg, rapportere, kontakte) åpner innloggingsdialogen, og handlingen gjøres når brukeren er logget inn. Meldinger, Profil og Administrasjon viser innloggingen i stedet for siden.

**Kravpunkt** viser til punktnumrene (§) i `docs/KRAVSPEC.md`. §19 (brukeropplevelse og universell utforming) gjelder i tillegg alle kontroller.

**I designet** sier om kontrollen finnes i designfila (`ja`), bare i appen (`app`).

## Felles (alle sider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logo (EO-merket + «elevrådsnett») | Går til Hjem | Fungerer | – | – | ja | §19 |
| Meny: Hjem, Arrangementer, Profil | Navigasjon | Fungerer | – | – | ja | §19 |
| Meny: Logg inn | Vises bare uten innlogging | Fungerer | `getSession` | ja | ja | §1, §3 |
| Meny: Meldinger med antall uleste | Navigasjon; tallet summerer uleste samtaler | Demo | `listConversations` | nei | ja | §9 |
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
| Legg til poll / fjern | Viser tre felt for svaralternativer. Skjult ved redigering | Demo | `publishPost` | nei (prompt 7) | ja | §7 |
| Svaralternativ 1–3 | Minst to må fylles ut | Demo | `publishPost` | nei | ja | §7 |
| Legg til bilde / fjern | Legger til et plassholderbilde, ingen opplasting | Mangler | `publishPost` | nei (prompt 6) | ja | §7, §11 |
| Tagg arrangement | Kobler innlegget til et publisert arrangement, som vises på kortet | Fungerer | `publishPost`, `saveDraft`, `editPost` | ja | app | §7, §8 |
| Synlig for | Målgrupper som passer avsenderen: skole (alle, fylket, lokallaget hvis skolen har et, venneråd), lokallag (alle, fylket, lokallaget), fylkesstyre (alle, fylket), EO (alle) | Fungerer | `publishPost` | ja (`audience_fits_organization`) | app | §7 |
| Skoleform | Vgs og ungdomsskole, videregående eller ungdomsskole. Feeden skjuler innlegg rettet mot en annen skoleform | Fungerer | `publishPost` | ja | app | §6, §7 |
| Lagre utkast | Lagrer nytt utkast eller oppdaterer det åpne. Deaktivert med poll eller bilde | Fungerer | `saveDraft` | ja (`create_post`, `update_post`) | app | §7 |
| Publiser | Publiserer som aktiv representasjon, eller publiserer det åpne utkastet. Deaktivert uten publiseringsrett | Fungerer | `publishPost` | ja (`create_post`, `update_post`; poll og bilde nei) | ja | §3, §7 |
| Lagre endringer (redigering) | Lagrer endringer i et publisert innlegg. Forrige versjon lagres, og innlegget merkes «redigert» | Fungerer | `editPost` | ja (`update_post`) | app | §7 |
| Varsel om manglende publiseringsrett | Vises når aktiv representasjon ikke kan publisere (serveren regner ut retten i `get_my_session`) | Fungerer | `getSession` | ja | app | §3, §4 |

## Innleggskort (Hjem og organisasjonssider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Avatar og organisasjonsnavn | Åpner organisasjonssiden. Styrer i EO (nasjonalt, fylkeslag, lokallag) har EO-logoen som standard profilbilde; elevråd viser initialer | Fungerer | – | – | ja | §7 |
| Navn under avsender, «redigert» | Personen som publiserte. Er profilen deaktivert, står det «Tidligere tillitsvalgt». Redigerte innlegg merkes | Fungerer | `listFeed` | ja | ja | §1, §7, §10 |
| ··· (flere valg) | Åpner menyen. Vises også på organisasjonssider | Fungerer | – | – | ja | §7 |
| Meny: Del innlegget | Deler via systemdeling, ellers kopieres lenken | Fungerer | – | – | app | §7 (Deling) |
| Meny: Rapporter innlegg | Rapporterer til moderatorene | Demo | `reportPost` | nei | app | §15 |
| Meny: Rediger innlegg | Åpner innleggsdialogen med innlegget. Vises bare når serveren sier at brukeren kan endre det (`can_manage`) | Fungerer | `editPost` | ja (`update_post`) | app | §7 |
| Meny: Vis endringshistorikk | Tidligere versjoner med dato, hvem som endret, målgruppe og skoleform. Bare for redigerte innlegg og administratorer | Fungerer | `listPostHistory` | ja (`get_post_history`) | app | §7 |
| Meny: Slett innlegg | Sletter innlegget etter bekreftelse. Bare med `can_manage` | Fungerer | `deletePost` | ja (`delete_post`) | app | §7, §19 |
| Målgruppe og skoleform | Merke når innlegget ikke er for alle | Fungerer | `listFeed` | ja | app | §7 |
| Støtt (tommel) med antall | Gir eller fjerner støtte. Antall og egen støtte kommer fra serveren | Demo | `setPostSupport` | nei | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarer med antall | Viser og skjuler kommentarer | Fungerer | – | – | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarfelt og Send | Kommenterer som aktiv representasjon. Teksten renses. Uten innlogging: knappen «Logg inn for å kommentere». Uten verv: forklaring | Demo | `addComment` | ja | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Del (pil) | Som «Del innlegget» | Fungerer | – | – | app | §7 (Deling) |
| Avstemningsalternativ | Stemmer på vegne av aktiv organisasjon; kan endres | Demo | `vote` | ja | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Koblet arrangement | Åpner arrangementet | Fungerer | – | – | ja | §8 |

## Hjem (`#/`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt og Søk | Går til Utforsk med søket | Fungerer | – | – | ja | §6 |
| Nettverk: Se alle | Går til Utforsk | Fungerer | – | – | ja | §6 |
| Nettverk: organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Nettverk: Følg / Følger | Følger eller slutter å følge elevråd | Demo | `setFollow` | nei | ja | §6 |
| Nettverk: Åpne (fylkeslag og EO) | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Arrangementer: Se alle | Går til Arrangementer | Fungerer | – | – | ja | §8 |
| Arrangementer: kort | Åpner arrangementet | Fungerer | – | – | ja | §8 |
| Filter: Alle / fylket | Filtrerer feeden på brukerens fylke | Fungerer | – | – | ja | §6 |
| Feed | Viser innlegg. Uten innlogging eller verv: offentlige innlegg, nyeste først. Med representasjon: feeden for den | Fungerer | `listFeed` | ja (`list_post_cards`) | ja | §1, §6 |

## Utforsk (`#/utforsk`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt | Filtrerer elevråd og innlegg i lastede data | Fungerer | – | – | ja | §6 |
| Elevråd: navn og Se side | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Elevråd: Følg / Følger | Følger eller slutter å følge | Demo | `setFollow` | nei | ja | §6 |
| Fylkeslag og EO: navn og Åpne | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Nye innlegg: utdrag | Åpner organisasjonen som publiserte | Fungerer | – | – | ja | §6 |

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
| Kontakt EO / fylkesstyret / lokallaget, Foreslå samarbeid | Åpner eller oppretter samtale og går til Meldinger | Demo | `openConversation` | nei | ja | §9 |
| Prioriterte saker, tillitsvalgte, statistikk | Visning, også uten innlogging | Fungerer | `listOrganizations`, `listPublicOfficers` | ja (`list_public_organizations`, `get_public_officers`) | ja | §1, §2, §4 |
| Kommende arrangementer | Åpner arrangementet. Utkast og passerte arrangementer vises ikke | Fungerer | – | – | ja | §8 |
| Deltakelse på arrangementer (skolens CV) | Arrangementer organisasjonen har deltatt på, med årstall, hvem som representerte den og vervet de hadde. Deaktiverte personer vises som «Tidligere tillitsvalgt» uten lenke | Fungerer | `getOrganizationCv` | ja (`get_organization_cv`) | app | §8 |
| Innlegg | Innleggskort med meny (se over). Hentes for siden, også når de ikke er i feeden | Fungerer | `listOrganizationPosts` | ja (`list_post_cards`) | ja | §1, §7 |

## Meldinger (`#/meldinger`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søk i samtaler | Filtrerer samtalelisten | Fungerer | – | – | ja | §9 |
| Samtale i listen | Åpner samtalen og markerer den som lest | Demo | `markConversationRead` | nei | ja | §9 |
| Navn i samtalehodet | Åpner organisasjonssiden | Fungerer | – | – | ja | §9 |
| Meldingsfelt og Send | Sender melding | Demo | `sendMessage` | ja (tabell) | ja | §9 |
| Samtaleliste | Viser samtaler. Uten innlogging: innloggingen vises i stedet | Demo | `listConversations` | nei (innlogget) | ja | §9 |

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
| Faner: Oversikt, Roller og verv, Forespørsler (med antall), Venneråd, Styreoverføring, Skoler, Moderering, CSV | Bytter fane. Venneråd vises bare for skoler der serveren oppgir skole- eller superadministrator | Fungerer | – | – | app | §4, §5, §7, §12 |
| Oversikt: nøkkeltall | Aktive verv, interne rettigheter og forespørsler som venter | Fungerer | `listOrganizationRoles`, `listSchoolAdminRequests` | ja | app | §12 |
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
| Styreoverføring: datoer, avkrysninger, valg av administrator | Statiske skjemafelt | Mangler | – | – (`complete_handover` finnes) | app | §5 |
| Styreoverføring: Tilbake / Neste | Går mellom fire steg | Fungerer | – | – | app | §5 |
| Styreoverføring: + Inviter ny bruker, Send invitasjoner | Viser bare en melding | Mangler | – | – | app | §5 |
| Skoler: skolenavn | Viser bare en melding | Mangler | – | – (`deactivate_school` finnes) | app | §1, §12 |
| Moderering: Behandle | Viser bare en melding | Mangler | – | – (`apply_moderation_action` finnes) | app | §15 |
| CSV: Last ned mal | Viser bare en melding | Mangler | – | – | app | §13 |
| CSV: Last opp UTF-8 CSV | Viser en fast forhåndsvisning, leser ingen fil | Mangler | – | – (`apply_school_import` finnes) | app | §13 |
| CSV: Gå til bekreftelse | Viser bare en melding | Mangler | – | – | app | §13 |

## Informasjon (`#/info/<side>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Faner: Personvern, Vilkår, Informasjonskapsler, Kontakt | Bytter side | Fungerer | – | – | app | §16 |
| E-postlenke teknisk@elev.no | Åpner e-postklient | Fungerer | – | – | app | §16 |

## Fant ikke siden

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Til forsiden | Går til Hjem | Fungerer | – | – | app | §19 |

## Serverfunksjoner uten kontroll ennå

Finnes i databasen (prompt 2), men er ikke koblet til en knapp. Kolonnen *Prompt* viser når de får en kontroll.

| RPC eller tabell | Hva den gjør | Status | Prompt | Kravpunkt |
|---|---|---|---|---|
| `search` | Fulltekstsøk på norsk etter skoler, styrer, personer, arrangementer og innlegg, med filter for tidligere tillitsvalgte | Mangler kontroll | 8 | §6 |
| `user_blocks` | Blokkering i meldinger | Mangler kontroll | 10 | §9 |
| `request_personal_data` | Forespørsel om eksport eller sletting av egne data | Mangler kontroll | 14 | §10, §16 |
| `resolve_organization_images` | Bildehierarkiet eget → lokallag → fylke → global, med lås og kilde | Mangler kontroll | 6, 12 | §14 |
