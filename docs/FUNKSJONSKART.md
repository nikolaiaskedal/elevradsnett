# Funksjonskart

Alle synlige knapper og kontroller i appen, per side, sammenholdt med designet i `docs/design/elevradsnett.dc.html`. Oppdateres når en kontroll legges til, endres eller kobles til Supabase.

**Status**

- **Fungerer**: gjør det den skal uten server (navigasjon, filtrering og søk i data som allerede er lastet, lokale skjemasteg).
- **Demo**: går gjennom `ElevradsnettService` og virker mot `DemoElevradsnettService`, men er ikke ferdig mot Supabase. Kolonnen *Supabase* viser om metoden har en RPC eller tabelltilgang (`ja`) eller kaster `NotImplementedError` (`nei`).
- **Mangler**: knappen vises, men gjør ingenting reelt (bare en melding, deaktivert eller statiske data).

Merk: Med Supabase konfigurert laster appen ikke i dag, fordi `getSession`, `listOrganizations`, `listEvents` og `listConversations` mangler RPC. Alle datadrevne kontroller er derfor *demo* inntil disse finnes.

**Kravpunkt** viser til punktnumrene i `docs/KRAVSPEC.md`. Kolonnen fylles ut når kravspesifikasjonen er lagt inn (se merknaden øverst i den filen); til da står den som «–».

**I designet** sier om kontrollen finnes i designfila (`ja`), bare i appen (`app`).

## Felles (alle sider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logo | Går til Hjem | Fungerer | – | – | ja | – |
| Meny: Hjem, Arrangementer, Profil, Logg inn | Navigasjon | Fungerer | – | – | ja | – |
| Meny: Meldinger med antall uleste | Navigasjon; tallet summerer uleste samtaler | Demo | `listConversations` | nei | ja | – |
| Nytt innlegg (toppmeny) | Åpner innleggsdialogen | Fungerer | – | – | ja | – |
| Bunnmeny: Personvern, Vilkår, Informasjonskapsler, Kontakt | Åpner informasjonssidene | Fungerer | – | – | app | – |
| Bunnmeny: Administrasjon | Åpner administrasjonen | Fungerer | – | – | app | – |
| Lastefeil | Viser feilmeldingen hvis data ikke kan lastes | Fungerer | alle lesemetoder | – | app | – |

## Innleggsdialog (Nytt innlegg)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Lukk (×), Avbryt, Esc, klikk utenfor | Lukker dialogen | Fungerer | – | – | ja | – |
| Tekstfelt | Innleggstekst, maks 6000 tegn | Fungerer | – | – | ja | – |
| Legg til poll / fjern | Viser tre felt for svaralternativer | Demo | `publishPost` | nei (RPC tar ikke poll) | ja | – |
| Svaralternativ 1–3 | Minst to må fylles ut | Demo | `publishPost` | nei | ja | – |
| Legg til bilde / fjern | Legger til et plassholderbilde, ingen opplasting | Mangler | `publishPost` | nei | ja | – |
| Synlig for (Alle elevråd, Elevråd i fylket, Venneråd) | Velger målgruppe | Demo | `publishPost` | ja | app | – |
| Publiser | Publiserer som aktiv representasjon; deaktivert uten publiseringsrett | Demo | `publishPost` | ja (bare tekst) | ja | – |
| Varsel om manglende publiseringsrett | Vises når aktiv representasjon ikke kan publisere | Demo | `getSession` | nei | app | – |

## Innleggskort (Hjem og organisasjonssider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Avatar og organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| ··· (flere valg) | Åpner menyen | Fungerer | – | – | ja | – |
| Meny: Del innlegget | Deler via systemdeling, ellers kopieres lenken | Fungerer | – | – | app | – |
| Meny: Rapporter innlegg | Rapporterer til moderatorene | Demo | `reportPost` | nei | app | – |
| Støtt (tommel) med antall | Gir eller fjerner støtte | Demo | `setPostSupport` | nei | ja | – |
| Kommentarer med antall | Viser og skjuler kommentarer | Fungerer | – | – | ja | – |
| Kommentarfelt og Send | Kommenterer som aktiv representasjon | Demo | `addComment` | ja | ja | – |
| Del (pil) | Som «Del innlegget» | Fungerer | – | – | app | – |
| Avstemningsalternativ | Stemmer på vegne av aktiv organisasjon; kan endres | Demo | `vote` | ja | ja | – |
| Koblet arrangement | Åpner arrangementet | Fungerer | – | – | ja | – |

## Hjem (`#/`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt og Søk | Går til Utforsk med søket | Fungerer | – | – | ja | – |
| Nettverk: Se alle | Går til Utforsk | Fungerer | – | – | ja | – |
| Nettverk: organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| Nettverk: Følg / Følger | Følger eller slutter å følge elevråd | Demo | `setFollow` | nei | ja | – |
| Nettverk: Åpne (fylkeslag og EO) | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| Arrangementer: Se alle | Går til Arrangementer | Fungerer | – | – | ja | – |
| Arrangementer: kort | Åpner arrangementet | Fungerer | – | – | ja | – |
| Filter: Alle / fylket | Filtrerer feeden på brukerens fylke | Fungerer | – | – | ja | – |
| Feed | Viser innlegg | Demo | `listFeed` | ja | ja | – |

## Utforsk (`#/utforsk`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søkefelt | Filtrerer elevråd og innlegg i lastede data | Fungerer | – | – | ja | – |
| Elevråd: navn og Se side | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| Elevråd: Følg / Følger | Følger eller slutter å følge | Demo | `setFollow` | nei | ja | – |
| Fylkeslag og EO: navn og Åpne | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| Nye innlegg: utdrag | Åpner organisasjonen som publiserte | Fungerer | – | – | ja | – |

## Arrangementer (`#/arrangementer`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Bilde og Detaljer | Åpner arrangementet | Fungerer | – | – | ja | – |
| Skal | Melder organisasjonen på / av | Demo | `setEventResponse` | ja | ja | – |
| Interessert | Markerer interesse / fjerner | Demo | `setEventResponse` | ja | ja | – |
| Liste over arrangementer | Viser arrangementer | Demo | `listEvents` | nei | ja | – |

## Arrangement (`#/arrangementer/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Alle arrangementer | Tilbake til listen | Fungerer | – | – | ja | – |
| Skal / Interessert | Som i listen; tallene under oppdateres | Demo | `setEventResponse` | ja | ja | – |
| Arrangør | Åpner arrangørens side | Fungerer | – | – | ja | – |

## Organisasjon (`#/org/<id>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Nytt innlegg som … | Åpner innleggsdialogen (egen organisasjon med publiseringsrett) | Fungerer | – | – | ja | – |
| Kontakt EO / fylkesstyret / lokallaget, Foreslå samarbeid | Åpner eller oppretter samtale og går til Meldinger | Demo | `openConversation` | nei | ja | – |
| Prioriterte saker, tillitsvalgte, statistikk | Visning | Demo | `listOrganizations` | nei | ja | – |
| Kommende arrangementer | Åpner arrangementet | Fungerer | – | – | ja | – |
| Innlegg | Innleggskort uten meny (se over) | Demo | `listFeed` | ja | ja | – |

## Meldinger (`#/meldinger`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søk i samtaler | Filtrerer samtalelisten | Fungerer | – | – | ja | – |
| Samtale i listen | Åpner samtalen og markerer den som lest | Demo | `markConversationRead` | nei | ja | – |
| Navn i samtalehodet | Åpner organisasjonssiden | Fungerer | – | – | ja | – |
| Meldingsfelt og Send | Sender melding | Demo | `sendMessage` | ja (tabell) | ja | – |
| Samtaleliste | Viser samtaler | Demo | `listConversations` | nei | ja | – |

## Profil (`#/profil`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Åpne elevrådets side | Åpner skolens elevrådsside | Fungerer | – | – | ja | – |
| Representasjon (navn) | Åpner organisasjonssiden | Fungerer | – | – | app | – |
| Bruk | Bytter aktiv representasjon | Demo | `switchRepresentation` | ja | app | – |
| Roller i systemet (brikker) | Visning | Demo | `getSession` | nei | ja | – |

## Logg inn (`#/logg-inn`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søk etter skole og treffliste | Velger skole | Fungerer | – | – | ja | – |
| Fortsett / Tilbake | Går mellom stegene | Fungerer | – | – | ja | – |
| Logg inn med Feide (Ikke tilgjengelig) | Deaktivert | Mangler | – | – | ja | – |
| Navn | Fritekst | Fungerer | – | – | ja | – |
| Telefonnummer / E-post og felt | Velger kontaktmåte; ingen engangskode sendes | Mangler | – | – | ja | – |
| Måned for ledervalg | Valgfri måned | Demo | `completeOnboarding` | ja | ja | – |
| Fullfør innlogging / Hopp over | Lagrer onboarding og går til Hjem; ingen ekte innlogging | Demo | `completeOnboarding` | ja | ja | – |

## Administrasjon (`#/admin`)

Hele administrasjonen er statiske demodata i komponenten, og ingen av handlingene går gjennom tjenestelaget ennå. Finnes ikke i designet.

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Faner: Oversikt, Styreoverføring, Roller og verv, Skoler, Moderering, CSV | Bytter fane | Fungerer | – | – | app | – |
| Oversikt: nøkkeltall, oppgaver, nylige handlinger | Statisk visning | Mangler | – | – | app | – |
| Styreoverføring: datoer, avkrysninger, valg av administrator | Statiske skjemafelt | Mangler | – | – (`complete_handover` finnes) | app | – |
| Styreoverføring: Tilbake / Neste | Går mellom fire steg | Fungerer | – | – | app | – |
| Styreoverføring: + Inviter ny bruker, Send invitasjoner | Viser bare en melding | Mangler | – | – | app | – |
| Roller og verv: + Tildel rolle | Viser bare en melding | Mangler | – | – (`assign_role` finnes) | app | – |
| Skoler: skolenavn | Viser bare en melding | Mangler | – | – (`deactivate_school` finnes) | app | – |
| Moderering: Behandle | Viser bare en melding | Mangler | – | – (`apply_moderation_action` finnes) | app | – |
| CSV: Last ned mal | Viser bare en melding | Mangler | – | – | app | – |
| CSV: Last opp UTF-8 CSV | Viser en fast forhåndsvisning, leser ingen fil | Mangler | – | – (`apply_school_import` finnes) | app | – |
| CSV: Gå til bekreftelse | Viser bare en melding | Mangler | – | – | app | – |

## Informasjon (`#/info/<side>`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Faner: Personvern, Vilkår, Informasjonskapsler, Kontakt | Bytter side | Fungerer | – | – | app | – |
| E-postlenke teknisk@elev.no | Åpner e-postklient | Fungerer | – | – | app | – |

## Fant ikke siden

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| ← Til forsiden | Går til Hjem | Fungerer | – | – | app | – |
