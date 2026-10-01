# Pilotdata

Skolene og fylkene som brukes i piloten, hentet fra Elevorganisasjonens medlemsregister 2025/2026.

- `skoler.csv`: én rad per medlemsskole, i importformatet fra kravspesifikasjonen (§13). Dette er kilden.
- `seed.sql`: generert fra CSV-en med `npm run pilot:seed`. Oppretter ett fylkesstyre per fylke («Elevorganisasjonen i …»), skolene og koblingen mellom dem. Oppdaterer etter ekstern ID, så den kan kjøres flere ganger.

Utvalg:

- De 15 fylkesarkene i registeret. De gamle arkene for Viken, Vestfold og Telemark og Troms og Finnmark er ikke tatt med.
- Ikke tatt med: individuelle medlemmer, arket «Uten fylkeslag» og Lærlingrådet i Sør-Trøndelag (ikke en skole).
- Manndalen skole (Troms) manglet skoleform i registeret og er satt til ungdomsskole.
- Organisasjonsnummer er ikke tatt med. I registeret er flere skoler oppført med samme nummer (fylkeskommunens), så de kan ikke brukes som skolens nummer.
- Lokallag og kontakt-e-post er tomme. De fylles inn i CSV-en når de er kjent.

Dataene er ekte, ikke demodata, og har `is_placeholder = false`. Det står ingen personopplysninger i filene.
