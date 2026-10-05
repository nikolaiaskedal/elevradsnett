import type { OrganizationStatus } from './types';

/** Status for en forespørsel om sletting av personopplysninger. */
export type DataRequestStatus = 'pending'|'processing'|'completed'|'rejected'|'cancelled';

export type DataRequest = { id:string; kind:'deletion'; status:DataRequestStatus; createdAt:string; completedAt:string|null; notes:string|null };

/** Personvern for den innloggede: godkjente vilkår, siste samtykke og egne forespørsler om sletting. */
export type PrivacyStatus = {
  status:OrganizationStatus;
  /** Brukeren deaktiverte profilen selv, og kan aktivere den igjen. */
  deactivatedByUser:boolean;
  termsVersion:string;
  privacyVersion:string;
  cookiesVersion:string;
  acceptedTermsVersion:string|null;
  acceptedPrivacyVersion:string|null;
  acceptedAt:string|null;
  consent:{ version:string; purposes:Record<string,boolean>; grantedAt:string }|null;
  requests:DataRequest[];
};

/** Forespørsler om sletting, slik superadministrator ser dem. */
export type AdminDataRequest = DataRequest & { userId:string; userName:string; email:string; schoolName:string|null; handledByName:string|null };

export const dataRequestStatusLabel:Record<DataRequestStatus,string> = {
  pending:'Venter', processing:'Under behandling', completed:'Gjennomført', rejected:'Avslått', cancelled:'Trukket',
};

/** Om brukeren må godta vilkårene (på nytt) før appen kan brukes. */
export const mustAcceptTerms = (p:PrivacyStatus)=>p.acceptedTermsVersion!==p.termsVersion || p.acceptedPrivacyVersion!==p.privacyVersion;
