// Versjonene av vilkårene, personvernerklæringen og informasjonen om informasjonskapsler (§16).
// Teksten står i components/views/legal-view.tsx. Endres teksten vesentlig, får den en ny versjon her og i en ny
// migrasjon (legal_document_versions), og brukerne må godta vilkårene på nytt.

export const LEGAL_VERSIONS = { privacy:'2026-10-05', terms:'2026-10-05', cookies:'2026-10-05' } as const;
export const LEGAL_UPDATED = '5. oktober 2026';
export const CONTACT_EMAIL = 'teknisk@elev.no';

/** En valgfri tjeneste som krever samtykke før den lastes, f.eks. analyse (§16). */
export type OptionalPurpose = { id:string; label:string; description:string; provider:string; enabled:boolean };

/**
 * Valgfrie tjenester. Banneret for samtykke vises bare når minst én er slått på. Ingen er slått på i piloten;
 * PostHog kobles på i prompt 17.
 */
export const OPTIONAL_PURPOSES:OptionalPurpose[] = [
  { id:'analytics', label:'Bruksstatistikk', description:'Hjelper oss å se hvilke deler av Elevrådsnett som brukes, så vi kan gjøre tjenesten bedre. Ingen meldinger eller profilopplysninger sendes med.', provider:'PostHog (EU)', enabled:false },
];

export const enabledPurposes = (purposes:OptionalPurpose[] = OPTIONAL_PURPOSES)=>purposes.filter(p=>p.enabled);

/** Valget for alle tjenestene som er slått på. Det som ikke er valgt, er avslått. */
export function consentChoice(accepted:string[],purposes:OptionalPurpose[] = OPTIONAL_PURPOSES):Record<string,boolean> {
  return Object.fromEntries(enabledPurposes(purposes).map(p=>[p.id,accepted.includes(p.id)]));
}

/** Banneret vises når en tjeneste er slått på og brukeren ikke har valgt for gjeldende versjon. */
export function needsConsent(stored:{ version:string; purposes:Record<string,boolean> }|null,purposes:OptionalPurpose[] = OPTIONAL_PURPOSES) {
  const enabled = enabledPurposes(purposes);
  if (!enabled.length) return false;
  if (!stored || stored.version!==LEGAL_VERSIONS.cookies) return true;
  return enabled.some(p=>!(p.id in stored.purposes));
}
