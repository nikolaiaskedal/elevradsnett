# Rutine ved personvernbrudd

Gjelder alle brudd på personopplysningssikkerheten i Elevrådsnett: noen har fått tilgang til opplysninger de ikke skulle ha, opplysninger er endret eller slettet ved en feil, eller tjenesten har vært utilgjengelig slik at opplysninger gikk tapt (art. 4 nr. 12, art. 33 og 34).

## 1. Oppdage og melde internt (med en gang)

- Alle som oppdager eller mistenker et brudd, skriver til teknisk@elev.no og sier fra til ansvarlig i Elevorganisasjonen samme dag.
- Noter tidspunkt, hva som er sett, og hvordan det ble oppdaget.

## 2. Begrense skaden (første timer)

- Stopp lekkasjen: slå av funksjonen, trekk tilbake tilganger, eller sett tjenesten i vedlikehold.
- Roter nøkler som kan være kompromittert: service role-nøkkel og JWT-hemmelighet i Supabase, `CRON_SECRET`, appassordet til Gmail, GitHub-tokens.
- Avslutt økter for berørte kontoer (slett radene i `auth.sessions`).
- Ta vare på spor: eksporter loggene fra Supabase (API, Auth og Postgres) og `audit_logs` før de roteres bort.

## 3. Vurdere omfang og risiko (innen 24 timer)

- Hvilke opplysninger, hvor mange personer, og hvilke skoler?
- Er det meldinger, e-postadresser eller bilder av elever? Er det mindreårige?
- Hvor sannsynlig er det at opplysningene misbrukes, og hvor alvorlig vil det være for dem det gjelder?
- Bruk revisjonsloggen og Supabase-loggene til å avgrense hva som er lest eller endret.

## 4. Melde til Datatilsynet (innen 72 timer)

- Meld via Datatilsynets skjema med mindre det er usannsynlig at bruddet medfører risiko for de registrerte.
- Er ikke alt kjent innen 72 timer, meld det som er kjent og ettersend resten.
- Er vurderingen at bruddet ikke skal meldes, dokumenter begrunnelsen.

## 5. Informere de berørte (uten unødig opphold)

- Ved høy risiko: informer de berørte direkte på e-post, på enkelt språk tilpasset elever, med hva som har skjedd, hva det betyr for dem og hva de kan gjøre.
- Vurder å informere skolene og foresatte når mindreårige er berørt.

## 6. Etterarbeid

- Før bruddet i avvikslogg: hva skjedde, årsak, konsekvens, tiltak og hvem som ble varslet.
- Rett årsaken, legg til en test som fanger feilen (RLS-tester i `supabase/tests/`), og oppdater DPIA-en.

## Kontaktpunkter

| Hva | Hvor |
|---|---|
| Intern melding | teknisk@elev.no |
| Supabase-prosjektet | `elevradsnett-pilot` (ref `ibipqyombdmtfvgthugz`) |
| Datatilsynet | datatilsynet.no, skjema for avviksmelding |
