# Codex-instruksjoner

Les `CLAUDE.md` i sin helhet før du gjør arbeid i dette repoet, og følg den som autoritativ prosjektveiledning. Den beskriver stack, arkitektur, sikkerhetsgrenser, designsystem, dokumentasjonskrav og leveranseflyt.

## Viktige inngangspunkter

- Krav: `docs/KRAVSPEC.md`
- Arbeidsrekkefølge: `docs/PROMPTPLAN.md`
- Design: `docs/design/elevradsnett.dc.html`
- Lokal oppstart og publisering: `README.md`

## Verifisering

Før commit skal alle disse være grønne:

```sh
npm run lint && npm run typecheck && npm test && npm run build
```

Kjør også relevante databasekontroller når migrasjoner, RLS, RPC-er eller genererte databasetyper endres.
