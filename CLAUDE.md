# CLAUDE.md

Faste regler for alt arbeid i dette repoet. Kravene står i `docs/KRAVSPEC.md`; prompter viser til punktnumrene der.

## Stack

- Ren Vite + React SPA med hash-routing (`components/routing.ts`). Ingen Next, vinext, Workers eller server-rendering.
- Publiseres som statiske filer på Cloudflare Pages (`dist/`, se README). Sikkerhetsheadere ligger i `public/_headers`.
- Miljøvariabler til nettleseren har `VITE_`-prefiks. Hemmeligheter (service role o.l.) skal aldri ha det.
- Font: Graphik (Regular, Regular Italic, Semibold) fra `app/fonts/`. Ingen eksterne fonter.

## Farger

Hvit bakgrunn. Fargene brukes bare som CSS-variabler fra `:root` i `app/globals.css`, aldri som fargekoder direkte i CSS eller komponenter.

| Variabel | Farge | Bruk |
|---|---|---|
| `--white` | `#FFFFFF` | Bakgrunn |
| `--accent` | `#FF6340` | Aksent |
| `--accent-300` | `#FFB19F` | Aksent, undertone |
| `--accent-200` | `#FFE0D9` | Aksent, undertone |
| `--accent-100` | `#FFEFEC` | Aksent, undertone |
| `--navy` | `#0A466E` | Tekst og primærfarge |
| `--navy-300` | `#85A2B7` | Navy, undertone (dempet tekst) |
| `--navy-200` | `#CEDAE2` | Navy, undertone (linjer) |
| `--navy-100` | `#E7ECF0` | Navy, undertone (linjer, flater) |

De øvrige variablene i `:root` (`--accent-hover`, `--accent-50`, `--ink`, `--slate`, `--hair`, `--soft`, `--green` osv.) er avledede toner fra designet. Ikke legg til nye farger utenfor paletten uten at det er avklart.

## Språk

All tekst i grensesnittet er på norsk (bokmål): knapper, feilmeldinger, valideringsmeldinger, tomtilstander og `aria-label`.

## Arkitektur

- Én fil per visning i `components/views/`. Felles komponenter i `components/shared/`.
- Komponenter henter og endrer data bare via `useService()` (`components/service-provider.tsx`). Ingen komponent importerer `lib/demo-data` direkte.
- `ElevradsnettService` (`lib/services/contracts.ts`) er kontrakten for alt UI-et leser og gjør. Nye handlinger legges til der, i `DemoElevradsnettService` og i `SupabaseElevradsnettService`. Mangler RPC-en, kaster Supabase-adapteren `NotImplementedError`.
- Valideringsskjemaer (zod) ligger i `lib/domain/validation.ts`, så iOS og Android kan bruke de samme.

## Sikkerhet

- **Ingen rolle- eller tilgangslogikk i frontend.** Klienten avgjør aldri hva brukeren har lov til; den viser det serveren returnerer. Tilgang håndheves av RLS og RPC-er i Supabase.
- **RLS på alt.** Alle tabeller har `ENABLE` og `FORCE ROW LEVEL SECURITY`. Nye tabeller får policyer i samme migrasjon, og privilegerte operasjoner går via `security definer`-funksjoner som sjekker rettigheter selv.

## Dokumentasjon

Når noe endres, oppdater i samme commit:

- `docs/RLS_MATRIX.md`: hvem som kan lese og skrive hva.
- `docs/FUNKSJONSKART.md`: hver knapp og kontroll per side, med status (fungerer, demo eller mangler), tjenestemetode og kravpunkt.

## Før hver commit

```sh
npm run lint && npm run typecheck && npm test && npm run build
```

Alt skal være grønt. CI kjører det samme på alle pull requests.

## Mobil

Hver visning skal sjekkes på mobilbredde (375px), i tillegg til desktop: ingen horisontal scrolling, og alle knapper skal kunne nås og trykkes.
