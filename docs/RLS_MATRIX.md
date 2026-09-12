# RLS-matrise

| Område | Anonym | Innlogget bruker | Organisasjonsadministrator | Superadministrator |
|---|---|---|---|---|
| Organisasjoner | Aktive, offentlige felt | Aktive + relevant inaktiv historikk | Oppdatere eget område | Alle |
| Profiler | Kun `public_profiles` uten e-post/roller | Egen full profil | Relevante profiler i området | Alle |
| Medlemskap/verv | Ingen | Egne | Egne organisasjoner | Alle |
| Interne roller | Ingen | Egne | Relevante brukere; innholdsansvarlig er privat | Alle |
| Innlegg | Publisert + offentlig + synlig | Offentlig og tillatte fylke/lokallag/venneråd | Egne utkast og moderering | Alle |
| Kommentarer | Synlige kommentarer til lesbare innlegg | Lese + skrive med aktivt verv | Moderere eget/område | Alle |
| Reaksjoner/avstemning | Aggregerte resultater via sikre spørringer | Egen reaksjon; én organisasjonsstemme | Som bruker | Alle |
| Arrangementer | Publiserte | Interesse og egne delegatinvitasjoner | Påmelding og delegater for egen organisasjon | Alle |
| Samtaler/meldinger | Ingen | Kun aktivt medlemskap og egen historikkgrense | Ingen ekstra lesetilgang | Ingen ekstra lesetilgang |
| Private vedlegg | Ingen | Signed URL for aktivt samtalemedlem | Ingen ekstra tilgang | Ingen ekstra tilgang |
| Moderering | Ingen | Egne rapporter | Konkrete saker i området | Alle saker |
| Revisjonslogg/import | Ingen | Ingen | Relevant område / egen import | Alle |
| Varsler/samtykker | Ingen | Egne | Ingen ekstra tilgang | Ingen ekstra tilgang |

Alle basetabeller har `ENABLE ROW LEVEL SECURITY` og `FORCE ROW LEVEL SECURITY`. Service role brukes bare i kontrollerte serverfunksjoner og planlagte jobber.
