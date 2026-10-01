# Funksjonskart

Alle synlige knapper og kontroller i appen, per side, sammenholdt med designet i `docs/design/elevradsnett.dc.html`. Oppdateres når en kontroll legges til, endres eller kobles til Supabase.

**Status**

- **Fungerer**: gjør det den skal, enten uten server (navigasjon, filtrering i data som allerede er lastet, lokale skjemasteg) eller via en tjenestemetode som er koblet til Supabase.
- **Demo**: går gjennom `ElevradsnettService` og virker mot `DemoElevradsnettService`, men er ikke ferdig mot Supabase. Kolonnen *Supabase* viser om metoden har en RPC eller tabelltilgang (`ja`) eller kaster `NotImplementedError` (`nei`).
- **Mangler**: knappen vises, men gjør ingenting reelt (bare en melding, deaktivert eller statiske data).

Fra prompt 3 laster appen mot Supabase: økt, organisasjoner, innlegg, arrangementer og tillitsvalgte hentes via RPC-er som også virker uten innlogging (§1). `listConversations` mangler fortsatt RPC for innloggede (prompt 10); Meldinger viser da en feilmelding i stedet for at appen stopper.

**Uten innlogging** kan alt offentlig leses. Kontroller som endrer noe (støtte, kommentere, følge, stemme, svare på arrangementer, nytt innlegg, rapportere, kontakte) åpner innloggingsdialogen, og handlingen gjøres når brukeren er logget inn. Meldinger, Profil og Administrasjon viser innloggingen i stedet for siden.

**Kravpunkt** viser til punktnumrene (§) i `docs/KRAVSPEC.md`. §19 (brukeropplevelse og universell utforming) gjelder i tillegg alle kontroller.

**I designet** sier om kontrollen finnes i designfila (`ja`), bare i appen (`app`).

## Felles (alle sider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logo | Går til Hjem | Fungerer | – | – | ja | §19 |
| Meny: Hjem, Arrangementer, Profil | Navigasjon | Fungerer | – | – | ja | §19 |
| Meny: Logg inn | Vises bare uten innlogging | Fungerer | `getSession` | ja | ja | §1, §3 |
| Meny: Meldinger med antall uleste | Navigasjon; tallet summerer uleste samtaler | Demo | `listConversations` | nei | ja | §9 |
| Nytt innlegg (toppmeny) | Åpner innleggsdialogen. Uten innlogging: innloggingsdialogen først. Uten verv: melding om at verv trengs | Fungerer | – | – | ja | §7 |
| Innloggingsdialog | Åpnes av handlinger som krever innlogging, og fullfører handlingen etterpå. Lukk (×) avbryter | Fungerer | `requestLoginCode`, `verifyLoginCode` | ja | app | §1, §7 |
| Varsel om deaktivert profil | Vises øverst når profilen er deaktivert | Fungerer | `getSession` | ja | app | §10 |
| Bunnmeny: Personvern, Vilkår, Informasjonskapsler, Kontakt | Åpner informasjonssidene | Fungerer | – | – | app | §16 |
| Bunnmeny: Administrasjon | Åpner administrasjonen | Fungerer | – | – | app | §12 |
| Lastefeil og Prøv igjen | Viser feilmeldingen hvis data ikke kan lastes, og laster på nytt | Fungerer | alle lesemetoder | – | app | §19 |

## Innleggsdialog (Nytt innlegg)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Lukk (×), Avbryt, Esc, klikk utenfor | Lukker dialogen | Fungerer | – | – | ja | §7 |
| Tekstfelt | Innleggstekst, maks 6000 tegn | Fungerer | – | – | ja | §7 |
| Legg til poll / fjern | Viser tre felt for svaralternativer | Demo | `publishPost` | nei (RPC tar ikke poll) | ja | §7 |
| Svaralternativ 1–3 | Minst to må fylles ut | Demo | `publishPost` | nei | ja | §7 |
| Legg til bilde / fjern | Legger til et plassholderbilde, ingen opplasting | Mangler | `publishPost` | nei | ja | §7, §11 |
| Synlig for (Alle elevråd, Elevråd i fylket, Venneråd) | Velger målgruppe | Demo | `publishPost` | ja | app | §7 |
| Publiser | Publiserer som aktiv representasjon; deaktivert uten publiseringsrett | Demo | `publishPost` | ja (bare tekst) | ja | §3, §7 |
| Varsel om manglende publiseringsrett | Vises når aktiv representasjon ikke kan publisere (serveren regner ut retten i `get_my_session`) | Fungerer | `getSession` | ja | app | §3, §4 |

## Innleggskort (Hjem og organisasjonssider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Avatar og organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | §7 |
| ··· (flere valg) | Åpner menyen | Fungerer | – | – | ja | §7 |
| Meny: Del innlegget | Deler via systemdeling, ellers kopieres lenken | Fungerer | – | – | app | §7 (Deling) |
| Meny: Rapporter innlegg | Rapporterer til moderatorene | Demo | `reportPost` | nei | app | §15 |
| Støtt (tommel) med antall | Gir eller fjerner støtte. Antall og egen støtte kommer fra serveren | Demo | `setPostSupport` | nei | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarer med antall | Viser og skjuler kommentarer | Fungerer | – | – | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarfelt og Send | Kommenterer som aktiv representasjon. Uten innlogging: knappen «Logg inn for å kommentere». Uten verv: forklaring | Demo | `addComment` | ja | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
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
| Feed | Viser innlegg. Uten innlogging eller verv: offentlige innlegg, nyeste først. Med representasjon: feeden for den | Fungerer | `listFeed` | ja (`get_post_cards`) | ja | §1, §6 |

## Utforsk (`#/utforsk`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt | Filtrerer elevråd og innlegg i lastede data | Fungerer | – | – | ja | §6 |
| Elevråd: navn og Se side | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Elevråd: Følg / Følger | Følger eller slutter å følge | Demo | `setFollow` | nei | ja | §6 |
| Fylkeslag og EO: navn og Åpne | Åpner organisasjonssiden | Fungerer | – | – | ja | §6 |
| Nye innlegg: utdrag | Åpner organisasjonen som publiserte | Fungerer | – | – | ja | §6 |

## Arrangementer (`#/arrangementer`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Bilde og Detaljer | Åpner arrangementet | Fungerer | – | – | ja | §8 |
| Skal | Melder organisasjonen på / av | Demo | `setEventResponse` | ja | ja | §8 |
| Interessert | Markerer interesse / fjerner | Demo | `setEventResponse` | ja | ja | §8 |
| Liste over arrangementer | Viser arrangementer, også uten innlogging | Fungerer | `listEvents` | ja (`list_public_events`) | ja | §1, §8 |

## Arrangement (`#/arrangementer/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Alle arrangementer | Tilbake til listen | Fungerer | – | – | ja | §8 |
| Skal / Interessert | Som i listen; tallene under oppdateres | Demo | `setEventResponse` | ja | ja | §8 |
| Arrangør | Åpner arrangørens side | Fungerer | – | – | ja | §8 |

## Organisasjon (`#/org/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Nytt innlegg som … | Åpner innleggsdialogen (egen organisasjon med publiseringsrett) | Fungerer | – | – | ja | §2, §6 |
| Kontakt EO / fylkesstyret / lokallaget, Foreslå samarbeid | Åpner eller oppretter samtale og går til Meldinger | Demo | `openConversation` | nei | ja | §9 |
| Prioriterte saker, tillitsvalgte, statistikk | Visning, også uten innlogging | Fungerer | `listOrganizations`, `listPublicOfficers` | ja (`list_public_organizations`, `get_public_officers`) | ja | §1, §2, §4 |
| Kommende arrangementer | Åpner arrangementet | Fungerer | – | – | ja | §8 |
| Innlegg | Innleggskort uten meny (se over). Hentes for siden, også når de ikke er i feeden | Fungerer | `listOrganizationPosts` | ja (`get_post_cards`) | ja | §1, §7 |

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
| Bruk | Bytter aktiv representasjon og henter feeden for den | Fungerer | `switchRepresentation`, `listFeed` | ja | app | §3 |
| Roller i systemet (brikker) | Visning | Fungerer | `getSession` | ja | ja | §4 |
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

Uten innlogging vises innloggingen. Innlogget uten verv vises en forklaring i stedet for panelet.

Hele administrasjonen er statiske demodata i komponenten, og ingen av handlingene går gjennom tjenestelaget ennå. Finnes ikke i designet.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Faner: Oversikt, Styreoverføring, Roller og verv, Skoler, Moderering, CSV | Bytter fane | Fungerer | – | – | app | §5 |
| Oversikt: nøkkeltall, oppgaver, nylige handlinger | Statisk visning | Mangler | – | – | app | §12 |
| Styreoverføring: datoer, avkrysninger, valg av administrator | Statiske skjemafelt | Mangler | – | – (`complete_handover` finnes) | app | §5 |
| Styreoverføring: Tilbake / Neste | Går mellom fire steg | Fungerer | – | – | app | §5 |
| Styreoverføring: + Inviter ny bruker, Send invitasjoner | Viser bare en melding | Mangler | – | – | app | §5 |
| Roller og verv: + Tildel rolle | Viser bare en melding | Mangler | – | – (`assign_role` finnes) | app | §4, §12 |
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
| `edit_post`, `post_revisions` | Redigerer innlegg, merker det redigert og lagrer historikk for administratorer | Mangler kontroll | 5 | §7 |
| `publish_post(…, p_school_level_target)` | Målgruppe etter skoleform (vgs, ungdomsskole eller begge) | Mangler kontroll | 5 | §7 |
| `user_blocks` | Blokkering i meldinger | Mangler kontroll | 10 | §9 |
| `request_school_admin`, `decide_school_admin_request`, `cancel_school_admin_request` | Forespørsel om å bli skoleadministrator, godkjent av styreadministrator i området | Mangler kontroll | 4 | §4 |
| `request_personal_data` | Forespørsel om eksport eller sletting av egne data | Mangler kontroll | 14 | §10, §16 |
| `resolve_organization_images` | Bildehierarkiet eget → lokallag → fylke → global, med lås og kilde | Mangler kontroll | 6, 12 | §14 |
