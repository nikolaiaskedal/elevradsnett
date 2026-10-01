# Funksjonskart

Alle synlige knapper og kontroller i appen, per side, sammenholdt med designet i `docs/design/elevradsnett.dc.html`. Oppdateres når en kontroll legges til, endres eller kobles til Supabase.

**Status**

- **Fungerer**: gjør det den skal uten server (navigasjon, filtrering og søk i data som allerede er lastet, lokale skjemasteg).
- **Demo**: går gjennom `ElevradsnettService` og virker mot `DemoElevradsnettService`, men er ikke ferdig mot Supabase. Kolonnen *Supabase* viser om metoden har en RPC eller tabelltilgang (`ja`) eller kaster `NotImplementedError` (`nei`).
- **Mangler**: knappen vises, men gjør ingenting reelt (bare en melding, deaktivert eller statiske data).

Merk: Med Supabase konfigurert laster appen ikke i dag, fordi `getSession`, `listOrganizations`, `listEvents` og `listConversations` mangler RPC. Alle datadrevne kontroller er derfor *demo* inntil disse finnes.

**Kravpunkt** viser til punktnumrene (§) i `docs/KRAVSPEC.md`. §19 (brukeropplevelse og universell utforming) gjelder i tillegg alle kontroller.

**I designet** sier om kontrollen finnes i designfila (`ja`), bare i appen (`app`).

## Felles (alle sider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Logo | Går til Hjem | Fungerer | – | – | ja | §19 |
| Meny: Hjem, Arrangementer, Profil, Logg inn | Navigasjon | Fungerer | – | – | ja | §19 |
| Meny: Meldinger med antall uleste | Navigasjon; tallet summerer uleste samtaler | Demo | `listConversations` | nei | ja | §9 |
| Nytt innlegg (toppmeny) | Åpner innleggsdialogen | Fungerer | – | – | ja | §7 |
| Bunnmeny: Personvern, Vilkår, Informasjonskapsler, Kontakt | Åpner informasjonssidene | Fungerer | – | – | app | §16 |
| Bunnmeny: Administrasjon | Åpner administrasjonen | Fungerer | – | – | app | §12 |
| Lastefeil | Viser feilmeldingen hvis data ikke kan lastes | Fungerer | alle lesemetoder | – | app | §19 |

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
| Varsel om manglende publiseringsrett | Vises når aktiv representasjon ikke kan publisere | Demo | `getSession` | nei | app | §3, §4 |

## Innleggskort (Hjem og organisasjonssider)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Avatar og organisasjonsnavn | Åpner organisasjonssiden | Fungerer | – | – | ja | §7 |
| ··· (flere valg) | Åpner menyen | Fungerer | – | – | ja | §7 |
| Meny: Del innlegget | Deler via systemdeling, ellers kopieres lenken | Fungerer | – | – | app | §7 (Deling) |
| Meny: Rapporter innlegg | Rapporterer til moderatorene | Demo | `reportPost` | nei | app | §15 |
| Støtt (tommel) med antall | Gir eller fjerner støtte | Demo | `setPostSupport` | nei | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarer med antall | Viser og skjuler kommentarer | Fungerer | – | – | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
| Kommentarfelt og Send | Kommenterer som aktiv representasjon | Demo | `addComment` | ja | ja | §7 (Kommentarer, reaksjoner og avstemninger) |
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
| Feed | Viser innlegg | Demo | `listFeed` | ja | ja | §6 |

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
| Liste over arrangementer | Viser arrangementer | Demo | `listEvents` | nei | ja | §8 |

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
| Prioriterte saker, tillitsvalgte, statistikk | Visning | Demo | `listOrganizations` | nei | ja | §2, §4 |
| Kommende arrangementer | Åpner arrangementet | Fungerer | – | – | ja | §8 |
| Innlegg | Innleggskort uten meny (se over) | Demo | `listFeed` | ja | ja | §7 |

## Meldinger (`#/meldinger`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søk i samtaler | Filtrerer samtalelisten | Fungerer | – | – | ja | §9 |
| Samtale i listen | Åpner samtalen og markerer den som lest | Demo | `markConversationRead` | nei | ja | §9 |
| Navn i samtalehodet | Åpner organisasjonssiden | Fungerer | – | – | ja | §9 |
| Meldingsfelt og Send | Sender melding | Demo | `sendMessage` | ja (tabell) | ja | §9 |
| Samtaleliste | Viser samtaler | Demo | `listConversations` | nei | ja | §9 |

## Profil (`#/profil`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Åpne elevrådets side | Åpner skolens elevrådsside | Fungerer | – | – | ja | §3, §10 |
| Representasjon (navn) | Åpner organisasjonssiden | Fungerer | – | – | app | §3, §10 |
| Bruk | Bytter aktiv representasjon | Demo | `switchRepresentation` | ja | app | §3 |
| Roller i systemet (brikker) | Visning | Demo | `getSession` | nei | ja | §4 |

## Logg inn (`#/logg-inn`)

| Kontroll | Hva den gjør | Status | Tjenestemetode | Supabase | I designet | Kravpunkt |
|---|---|---|---|---|---|---|
| Søk etter skole og treffliste | Velger skole | Fungerer | – | – | ja | §3, §5 |
| Fortsett / Tilbake | Går mellom stegene | Fungerer | – | – | ja | §3, §5 |
| Logg inn med Feide (Ikke tilgjengelig) | Deaktivert | Mangler | – | – | ja | §1 |
| Navn | Fritekst | Fungerer | – | – | ja | §3, §5 |
| Telefonnummer / E-post og felt | Velger kontaktmåte; ingen engangskode sendes. Telefonnummer merkes «Kommer senere» i prompt 3, siden SMS koster | Mangler | – | – | ja | §3, §5 |
| Måned for ledervalg | Valgfri måned | Demo | `completeOnboarding` | ja | ja | §5 |
| Fullfør innlogging / Hopp over | Lagrer onboarding og går til Hjem; ingen ekte innlogging | Demo | `completeOnboarding` | ja | ja | §3, §5 |

## Administrasjon (`#/admin`)

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
