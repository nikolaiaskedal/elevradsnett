# Pilotdata

Skolene og fylkene som brukes i piloten, hentet fra Elevorganisasjonens medlemsregister 2025/2026.

- `skoler.csv`: én rad per medlemsskole, i importformatet fra kravspesifikasjonen (§13). Dette er kilden.
- `seed.sql`: generert fra CSV-en med `npm run pilot:seed`. Oppretter ett fylkesstyre per fylke («Elevorganisasjonen i …»), skolene og koblingen mellom dem. Oppdaterer etter ekstern ID, så den kan kjøres flere ganger.

Utvalg:

- De 15 fylkesarkene i registeret.
- I tillegg 18 skoler som bare står i de gamle arkene for Viken, Vestfold og Telemark og Troms og Finnmark, men som fortsatt er medlemmer. De er plassert i fylket kommunen hører til i dag. Skoler som står i de gamle arkene med en annen skrivemåte (f.eks. «Bø vidaregåande skule», «Senja videregående skole, avd Gibostad»), er ikke lagt inn på nytt.
- To avvik fra fylkeskolonnen i Viken-arket: Jessheim videregående skole (Ullensaker) er lagt i Akershus, ikke Østfold, og Svensedammen ungdomsskole (Lillestrøm) i Akershus, ikke Buskerud.
- Sand skole (Troms og Finnmark-arket) er lagt i Troms, ut fra organisasjonsnummeret til Harstad kommune. Bør bekreftes.
- Ikke tatt med: individuelle medlemmer, arket «Uten fylkeslag» og Lærlingrådet i Sør-Trøndelag (ikke en skole).
- Manndalen skole (Troms) manglet skoleform i registeret og er satt til ungdomsskole.
- Rettet i registeret: «Honningvsåg skole» heter Honningsvåg skole, og Kråkerøy ungdomsskole er ungdomsskole (stod som vgs).
- Organisasjonsnummer er ikke tatt med. I registeret er flere skoler oppført med samme nummer (fylkeskommunens), så de kan ikke brukes som skolens nummer.
- Lokallag og kontakt-e-post er tomme. De fylles inn i CSV-en når de er kjent.

Dataene er ekte, ikke demodata, og har `is_placeholder = false`. Det står ingen personopplysninger i filene.
