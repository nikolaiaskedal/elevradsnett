import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDataRequest, PrivacyStatus } from '@/lib/domain/privacy';
import { acceptTermsSchema, consentSchema, decideDataRequestSchema, idSchema } from '@/lib/domain/validation';
import type { Database } from '@/lib/supabase/database.types';
import type { AcceptTermsInput, ConsentInput, DecideDataRequestInput } from './contracts';
import type { Run } from './supabase-messaging';

type Client = SupabaseClient<Database>;

/** Feilmeldinger fra RPC-ene i 202610150001_personvern.sql, oversatt til norsk. */
export const personvernServerMessages:Record<string,string> = {
  'outdated legal version':'Vilkårene er oppdatert. Last siden på nytt og les dem før du godtar.',
  'invalid consent':'Valget kunne ikke lagres.',
  'too many requests':'For mange forsøk. Vent litt og prøv igjen.',
  'deactivated by administrator':'Profilen ble deaktivert av en administrator. Ta kontakt med teknisk@elev.no for å få den aktivert igjen.',
  'invalid request':'Forespørselen er ugyldig.',
  'you are last administrator':'Du er den eneste administratoren i en organisasjon. Gi rollen til en annen under Administrasjon før du deaktiverer profilen.',
};

/**
 * Personvern mot Supabase (§10, §16). Alt går via RPC-ene i 202610150001_personvern.sql, som sjekker hvem som spør.
 * Tabellene for godkjenninger og samtykke kan bare leses, ikke skrives, fra klienten.
 */
export class SupabasePersonvern {
  constructor(private client:Promise<Client>, private run:Run) {}

  async getPrivacyStatus() {
    return await this.run((await this.client).rpc('get_my_privacy'),'Kunne ikke hente personverninnstillingene.') as unknown as PrivacyStatus;
  }
  async acceptTerms(input:AcceptTermsInput) {
    const value = acceptTermsSchema.parse(input);
    await this.run((await this.client).rpc('accept_terms',{ p_terms_version:value.termsVersion, p_privacy_version:value.privacyVersion }),'Kunne ikke lagre at du har godtatt vilkårene.');
  }
  async recordConsent(input:ConsentInput) {
    const value = consentSchema.parse(input);
    await this.run((await this.client).rpc('record_consent',{ p_anonymous_id:(value.anonymousId ?? null) as string, p_version:value.version, p_purposes:value.purposes }),'Kunne ikke lagre valget.');
  }
  async deactivateAccount() {
    await this.run((await this.client).rpc('deactivate_my_account'),'Kunne ikke deaktivere profilen.');
  }
  async reactivateAccount() {
    await this.run((await this.client).rpc('reactivate_my_account'),'Kunne ikke aktivere profilen.');
  }
  async exportMyData() {
    return await this.run((await this.client).rpc('export_my_data'),'Kunne ikke hente dataene dine.') as unknown as Record<string,unknown>;
  }
  async requestDeletion() {
    await this.run((await this.client).rpc('request_personal_data',{ p_kind:'deletion' }),'Kunne ikke sende forespørselen.');
  }
  async cancelDataRequest(requestId:string) {
    await this.run((await this.client).rpc('cancel_personal_data_request',{ p_request:idSchema.parse(requestId) }),'Kunne ikke trekke forespørselen.');
  }
  async listDataRequests() {
    return await this.run((await this.client).rpc('list_data_subject_requests'),'Kunne ikke hente forespørslene.') as unknown as AdminDataRequest[];
  }
  async decideDataRequest(input:DecideDataRequestInput) {
    const value = decideDataRequestSchema.parse(input);
    await this.run((await this.client).rpc('decide_data_subject_request',{ p_request:value.requestId, p_status:value.status, p_notes:(value.notes || null) as string }),'Kunne ikke behandle forespørselen.');
  }
}
