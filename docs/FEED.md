# Feed og søk

Denne filen dokumenterer rangeringsmodellen og søket fra prompt 8 (KRAVSPEC §6). Koden står i `supabase/migrations/202610120001_feed_sok.sql` (`get_ranked_feed`, `list_posts` og `search_directory`). Demotjenesten regner på samme måte, se `listFeed` i `lib/services/demo-service.ts`.

## Hvem feeden beregnes for

- **Utlogget:** offentlige innlegg, nyeste først. Ingen rangering.
- **Innlogget med aktiv representasjon:** konteksten er organisasjonen brukeren representerer, hvis vervet er aktivt og organisasjonen er aktiv.
- **Innlogget uten verv:** konteksten er skolen brukeren går på.

Feeden regnes ut på nytt ved hvert kall. Når brukeren bytter skole eller representasjon, henter appen feeden på nytt, og den bygger på den nye konteksten.

## Hva som er med

Alle innlegg brukeren kan lese (`can_view_post`): offentlige innlegg, og innlegg til fylket, lokallaget eller vennerådene når brukeren hører til der. Innlegg som er rettet mot en annen skoleform enn konteksten, tas ikke med. En vgs-elev ser for eksempel ikke innlegg som bare er for ungdomsskolen.

## Poeng i anbefalt feed

Hvert innlegg får summen av poengene under. Innleggene sorteres etter summen, og ved likhet kommer det nyeste først.

| Del | Poeng |
|---|---|
| Prioritering | 100 hvis innlegget er prioritert og kommer fra EO nasjonalt eller fra fylket til konteksten. 15 hvis det er prioritert, men fra et annet fylke |
| Geografi | Den høyeste av: egen organisasjon eller egen skole 60, lokallaget 45, venneråd 40, samme fylke 30, EO nasjonalt 20 |
| Følging | 40 hvis brukeren følger avsenderen |
| Skoleform | 12 hvis innlegget eller avsenderen har samme skoleform som konteksten |
| Ferskhet | 48 · 0,5^(timer siden publisering / 24): 48 poeng for et helt nytt innlegg, halvparten etter ett døgn |
| Engasjement | 4 · ln(1 + reaksjoner + 2 · kommentarer), maks 15 |

Engasjement teller lite med vilje, så populære innlegg ikke fortrenger det som er nært og nytt. Ferske innlegg fra andre skoler får likevel en plass gjennom ferskhetspoengene. Det dekker kravet om «nye og relevante innlegg fra andre skoler».

**Brukes aldri:** meldinger, hvem som har reagert, profilopplysninger utover skole, representasjon og følging, eller annen privat aktivitet.

## Kronologisk feed

Samme innlegg som i anbefalt feed, men sortert bare på publiseringstidspunkt. Brukeren velger mellom Anbefalt og Nyeste på Hjem. Valget huskes i nettleseren.

## Søk

`search_directory` søker i skoler, fylkesstyrer, lokallag, EO, personer, arrangementer og innlegg.

- Norsk fulltekstsøk (`norwegian`), slik at for eksempel «fraværet» finner «fravær». I tillegg prefikssøk på navn, så «elveb» finner Elvebakken. Søket starter fra to tegn.
- Vanlig søk viser bare aktive skoler og aktive personer.
- Filteret **Vis tidligere tillitsvalgte og deaktiverte skoler** tar med deaktiverte skoler og personer med avsluttede offentlige verv, også deaktiverte profiler. Personer som har deaktivert kontoen selv, vises aldri. Treffene merkes, og deaktiverte personer kan ikke åpnes, siden de ikke har offentlig CV.
- Innlegg følger samme synlighet som feeden (`can_view_post`). Arrangementer må være publisert eller avsluttet.
- Bare offentlige felt returneres: navn, skole og offentlige verv, ingen e-post eller interne rettigheter.

Begrensning av antall søk per bruker (§17) kommer i prompt 16.
