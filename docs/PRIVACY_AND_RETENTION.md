# Personvern og lagring

Elevorganisasjonen er behandlingsansvarlig. Supabase, hosting-, e-post- og eventuell mediebehandlingstjeneste er databehandlere og må ha databehandleravtale.

| Data | Formål | Foreslått lagring |
|---|---|---|
| Konto, skole og aktive verv | Levere tjenesten og dokumentere fullmakt | Kontoens levetid + 12 måneder |
| Historiske offentlige verv/CV | Dokumentere elevdemokratisk erfaring | Til brukeren ber om sletting, med avveining mot dokumentasjonsbehov |
| Offentlige innlegg og arrangementer | Plattformens offentlige innhold | Til organisasjonen sletter eller arkiverer |
| Private meldinger | Kommunikasjon mellom medlemmer | Til brukeren sletter for egen visning; serverretention fastsettes før lansering |
| Revisjonslogg | Sikkerhet, misbruksforebygging og ansvarlighet | 24 måneder, deretter sletting/anonymisering |
| Modereringssak | Trygghet og klagebehandling | 12 måneder etter endelig avgjørelse |
| Importlogger | Sporbar skoleforvaltning | 24 måneder |
| Samtykke | Dokumentere valg og versjon | Så lenge samtykket gjelder + 3 år |

Retting, innsyn, eksport, deaktivering og sletting behandles via kontoinnstillinger og `teknisk@elev.no`. Deaktivering er reverserbar og forskjellig fra permanent sletting. Ved personvernbrudd isoleres hendelsen, tilganger roteres, omfang dokumenteres og Datatilsynet/berørte varsles når lovens terskler er oppfylt.

Før produksjonslansering skal det utføres DPIA. Bilder og video krever dokumentert publiseringsgrunnlag, tydelig informasjon, enkel rapportering/fjerning og ingen identifiserbare personer i AI-genererte placeholders.
