# CLAUDE.md

## Arbeidsflyt: alltid merge

Når du har gjort endringer i repoet, skal du ALLTID avslutte med å merge dem inn i `main`. Brukeren har gitt varig tillatelse til dette, og du skal ikke spørre først.

1. Kjør repoets sjekker (lint, typecheck, test og build) og rett feil til alt går gjennom.
2. Commit og push til arbeidsbranchen.
3. Opprett en PR mot `main` hvis det ikke allerede finnes en for branchen.
4. Vent til CI er grønn, og rett eventuelle feil.
5. Merge PR-en inn i `main`.

Ikke merge hvis sjekkene eller CI feiler. Fiks feilen først, eller forklar brukeren hva som stopper.

## Prosjektdokumenter

- Kravspesifikasjon: `docs/KRAVSPEC.md`
- Promptplan: `docs/PROMPTPLAN.md`
- Design: `docs/design/elevradsnett.dc.html`
