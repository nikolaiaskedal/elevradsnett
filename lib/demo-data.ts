import type { EventRecord } from '@/lib/domain/events';
import type { Conversation, CurrentUser, InternalRole, Organization, Post, PostDraft, PostRevision } from '@/lib/domain/types';

export const currentUser: CurrentUser = { id:'user-ida', name:'Ida Halvorsen', initials:'IH', schoolId:'elvebakken', email:'ida.halvorsen@example.invalid' };

/**
 * Verv, rettigheter og personer i demoen. Vervene til de tillitsvalgte under lages fra listene over tillitsvalgte
 * på organisasjonene; her står bare id-ene for Idas verv og det som ikke står der.
 */
export const demoRepresentationIds:Record<string,string> = { elvebakken:'rep-school', 'oslo-fylke':'rep-county', 'oslo-sentrum':'rep-local' };
/** Skolen til personer i styrene, så de kan finnes når administratoren gir verv. */
export const demoPersonSchools:Record<string,string> = {
  'Mathilde Rø':'hartvig', 'Omar Haddad':'kuben', 'Vilde Sunde':'ohg', 'Elias Brekke':'kuben', 'Nora Tangen':'hartvig', 'Aksel Vangen':'ohg',
};
export const demoFormerOfficers = [
  { name:'Jonas Berg', organizationId:'elvebakken', title:'Elevrådsleder', startDate:'2024-08-20', endDate:'2025-06-20', personActive:false },
  { name:'Ida Halvorsen', organizationId:'elvebakken', title:'Elevrådsmedlem', startDate:'2024-08-20', endDate:'2025-06-20', personActive:true },
];
export const demoGrants:{ person:string; organizationId:string; role:InternalRole; startDate:string }[] = [
  { person:'Ida Halvorsen', organizationId:'elvebakken', role:'school_admin', startDate:'2025-08-25' },
  { person:'Ida Halvorsen', organizationId:'oslo-fylke', role:'board_admin', startDate:'2025-09-10' },
  { person:'Mathilde Rø', organizationId:'oslo-fylke', role:'board_admin', startDate:'2025-09-10' },
  { person:'Sivert Aune', organizationId:'elvebakken', role:'content_manager', startDate:'2025-08-25' },
];
export const demoSchoolAdminRequests = [
  { person:'Frida Aas', schoolId:'ohg', message:'Jeg er elevrådsleder og vil oppdatere siden vår.', createdAt:'2026-09-28T10:15:00.000Z' },
];

/** Venneråd (§7): Elvebakken og Kuben er venneråd, og Hartvig Nissen har spurt Elvebakken. */
export const demoFriendConnections = [
  { requesterId:'kuben', recipientId:'elvebakken', status:'accepted' as const, createdAt:'2026-08-30T09:00:00.000Z', approvedAt:'2026-08-31T12:00:00.000Z' },
  { requesterId:'hartvig', recipientId:'elvebakken', status:'pending' as const, createdAt:'2026-09-29T14:30:00.000Z' },
];
/** Et utkast Elvebakken ikke har publisert ennå. */
export const demoDrafts:(PostDraft & { actorId:string })[] = [
  { id:'draft-1', organizationId:'elvebakken', actorId:'user-ida', actorName:'Ida Halvorsen', audience:'local', schoolLevel:'both', updatedAt:'2026-09-30T18:20:00.000Z',
    body:'Lederforum for elevrådene i Oslo Sentrum er flyttet til torsdag 15. oktober. Mer info kommer.' },
];
/** Forrige versjon av innlegg 4, som er redigert. */
export const demoRevisions:Record<string,PostRevision[]> = {
  'post-4':[{ id:'rev-4-1', audience:'public', schoolLevel:'both', editedByName:'Ida Halvorsen', createdAt:'2026-09-04T16:05:00.000Z',
    body:'Bilder fra elevrådsuka! Vi hadde stand i kantina, quiz på tvers av trinn og åpent møte om vurdering.\n\n60 elever meldte seg på klassekontaktvervet. Ny rekord.' }],
};

const officers = (prefix:string, list:[string,string][]) => list.map(([name,publicTitle],i)=>({ id:`${prefix}-${i+1}`, name, publicTitle }));

export const organizations: Organization[] = [
  { id:'eo', type:'national', name:'Elevorganisasjonen', initials:'EO', county:'Nasjonalt', status:'active', contactEmail:'post@elev.no', memberCount:460, followers:12843, following:true,
    bio:'Vi er elevenes egen organisasjon. 460 elevråd er medlem, og sammen jobber vi for et bedre skolemiljø, reell elevmedvirkning og en skole elevene er med på å styre.',
    officersTitle:'Sentralstyret', officers:officers('eo',[['Sara Nyborg','Leder'],['Jonas Fjeld','Nestleder'],['Amina Rashid','Politisk nestleder'],['Theo Lindberg','Sentralstyremedlem'],['Live Grøtte','Sentralstyremedlem'],['Kasper Vold','Sentralstyremedlem']]),
    prioritiesTitle:'Prioriterte saker 2026/2027', priorities:[
      { id:'eo-p1', title:'Fraværsgrensa må vekk', description:'Vi krever en tillitsbasert ordning der elever ikke straffes for sykdom.' },
      { id:'eo-p2', title:'Rett til rådgiver på hver skole', description:'Alle elever skal ha tilgang til helsesykepleier og rådgiver hver uke.' },
      { id:'eo-p3', title:'Elevmedvirkning i timeplanen', description:'Elevrådet skal høres før skolen vedtar timeplan og vurderingsformer.' }] },
  { id:'oslo-fylke', type:'county_board', name:'Elevorganisasjonen i Oslo', initials:'OS', county:'Oslo', status:'active', contactEmail:'oslo@elev.no', memberCount:38, followers:1332, following:true,
    bio:'Fylkeslaget for elevråd i Oslo. Vi arrangerer kurs, fylkessamlinger og følger opp skolepolitikken i Oslo kommune.',
    officersTitle:'Fylkesstyret i Oslo', officers:officers('of',[['Mathilde Rø','Fylkesleder'],['Omar Haddad','Nestleder'],['Vilde Sunde','Kursansvarlig'],['Elias Brekke','Politisk ansvarlig'],['Nora Tangen','Fylkesstyremedlem'],['Ida Halvorsen','Fylkesstyremedlem']]),
    prioritiesTitle:'Regionale saker', priorities:[
      { id:'of-p1', title:'Gratis kollektivtransport for elever', description:'Vi følger opp bystyret på skoleskyss og månedskort for elever under 20 år.' },
      { id:'of-p2', title:'Bedre skolemat i Oslo-skolen', description:'Kartlegging av kantinetilbudet på alle 24 videregående skoler i fylket.' }] },
  { id:'oslo-sentrum', type:'local_board', name:'Oslo Sentrum lokallag', initials:'SE', county:'Oslo', localBoard:'Oslo Sentrum', status:'active', memberCount:9, followers:684,
    bio:'Møteplassen for elevråd i Oslo sentrum. Vi samler elevrådsledere til lederforum hvert halvår.',
    officersTitle:'Lokallagsstyret', officers:officers('se',[['Aksel Vangen','Leder'],['Ida Halvorsen','Lokallagsmedlem']]) },
  { id:'elvebakken', type:'school', name:'Elvebakken vgs elevråd', schoolName:'Elvebakken videregående skole', initials:'EV', county:'Oslo', place:'Oslo', localBoard:'Oslo Sentrum', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@elvebakken.elevrad.no', studentCount:1240, followers:214,
    bio:'Elevrådet ved Elvebakken videregående skole. 1 240 elever, 42 klasser og et elevråd som møtes hver torsdag. Vi jobber med skolemiljø, vurdering og et kantinetilbud folk faktisk vil spise.',
    officersTitle:'Tillitsvalgte', officers:officers('ev',[['Ida Halvorsen','Elevrådsleder'],['Sivert Aune','Nestleder'],['Rania Osman','Skolemiljøansvarlig'],['Kristoffer Lie','Økonomiansvarlig'],['Maja Solheim','Elevrådsmedlem'],['Henrik Dahl','Elevrådsmedlem']]) },
  { id:'kuben', type:'school', name:'Kuben vgs elevråd', schoolName:'Kuben videregående skole', initials:'KU', county:'Oslo', place:'Oslo', localBoard:'Oslo Øst', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@kuben.elevrad.no', studentCount:1900, followers:168,
    bio:'Elevrådet på Kuben yrkesarena. Vi er både yrkesfag og studiespesialisering, og jobber for at verkstedene skal ha utstyr som fungerer.',
    officersTitle:'Tillitsvalgte', officers:officers('ku',[['Emil Strand','Elevrådsleder'],['Thea Nikolaisen','Nestleder'],['Yusuf Ali','Yrkesfagansvarlig'],['Hedda Lunde','Elevrådsmedlem']]) },
  { id:'hartvig', type:'school', name:'Hartvig Nissen elevråd', schoolName:'Hartvig Nissens skole', initials:'HN', county:'Oslo', place:'Oslo', localBoard:'Oslo Vest', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@nissen.elevrad.no', studentCount:880, followers:142,
    bio:'Elevrådet ved Hartvig Nissens skole. Vi har fast elevrådstime hver 14. dag og en veldig aktiv skolemiljøgruppe.',
    officersTitle:'Tillitsvalgte', officers:officers('hn',[['Ingrid Haaland','Elevrådsleder'],['Nikolai Berge','Nestleder'],['Sofie Kvam','Elevrådsmedlem'],['Marius Ek','Elevrådsmedlem']]) },
  { id:'ohg', type:'school', name:'Oslo handelsgymnasium elevråd', schoolName:'Oslo handelsgymnasium', initials:'OH', county:'Oslo', place:'Oslo', localBoard:'Oslo Sentrum', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@ohg.elevrad.no', studentCount:760, followers:97,
    bio:'Elevrådet ved Oslo handelsgymnasium. Vi har jobbet mest med vurderingspraksis og eksamensfri uke før heldagsprøver.',
    officersTitle:'Tillitsvalgte', officers:officers('oh',[['Frida Aas','Elevrådsleder'],['Aleksander Ruud','Nestleder'],['Selma Bø','Elevrådsmedlem']]) },
  { id:'nordahl', type:'school', name:'Nordahl Grieg vgs elevråd', schoolName:'Nordahl Grieg videregående skole', initials:'NG', county:'Vestland', place:'Bergen', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@nordahlgrieg.elevrad.no', studentCount:1050, followers:131,
    bio:'Elevrådet ved Nordahl Grieg videregående skole i Bergen. Vi fikk i vår vedtatt fast elevrådstime i timeplanen.',
    officersTitle:'Tillitsvalgte', officers:officers('ng',[['Oda Vikane','Elevrådsleder'],['Sander Hope','Nestleder'],['Iben Rasmussen','Skolemiljøansvarlig'],['Jakob Myre','Elevrådsmedlem']]) },
  { id:'katta', type:'school', name:'Trondheim katedralskole elevråd', schoolName:'Trondheim katedralskole', initials:'TK', county:'Trøndelag', place:'Trondheim', schoolLevel:'upper_secondary', status:'active', contactEmail:'elevrad@katta.elevrad.no', studentCount:1100, followers:186,
    bio:'Elevrådet ved Trondheim katedralskole. Vi arrangerer skoledebatter, russevalg og en ganske stor vinterfest.',
    officersTitle:'Tillitsvalgte', officers:officers('tk',[['Vetle Aunemo','Elevrådsleder'],['Mira Sandnes','Nestleder'],['Elias Storli','Debattansvarlig'],['Tuva Rønning','Elevrådsmedlem']]) },
  { id:'stavanger', type:'school', name:'Stavanger katedralskole elevråd', schoolName:'Stavanger katedralskole', initials:'SK', county:'Rogaland', place:'Stavanger', schoolLevel:'upper_secondary', status:'active', followers:0, bio:'Elevrådet har ikke tatt i bruk Elevrådsnett ennå.' },
  { id:'tromsdalen', type:'school', name:'Tromsdalen vgs elevråd', schoolName:'Tromsdalen videregående skole', initials:'TV', county:'Troms', place:'Tromsø', schoolLevel:'upper_secondary', status:'active', followers:0, bio:'Elevrådet har ikke tatt i bruk Elevrådsnett ennå.' },
  { id:'sandvika', type:'school', name:'Sandvika vgs elevråd', schoolName:'Sandvika videregående skole', initials:'SV', county:'Akershus', place:'Bærum', schoolLevel:'upper_secondary', status:'active', followers:0, bio:'Elevrådet har ikke tatt i bruk Elevrådsnett ennå.' },
  { id:'skien', type:'school', name:'Skien vgs elevråd', schoolName:'Skien videregående skole', initials:'SI', county:'Telemark', place:'Skien', schoolLevel:'upper_secondary', status:'active', followers:0, bio:'Elevrådet har ikke tatt i bruk Elevrådsnett ennå.' },
  { id:'fagerborg', type:'school', name:'Fagerborg skole elevråd', schoolName:'Fagerborg skole', initials:'FS', county:'Oslo', place:'Oslo', localBoard:'Oslo Vest', schoolLevel:'lower_secondary', status:'deactivated', followers:102, bio:'Tidligere elevrådsside.' },
];

export const initialPosts: Post[] = [
  { id:'post-1', organizationId:'eo', initials:'EO', organizationName:'Elevorganisasjonen', actorName:'Sara Nyborg', actorRole:'Leder', createdAt:'5. september 2026', audience:'public', priority:true, likes:284, comments:2,
    body:'Kunnskapsministeren har invitert oss til møte om fraværsgrensa 18. september.\n\nVi tar med oss det elevrådene har meldt inn. Har skolen deres eksempler på hvordan grensa slår ut? Legg dem i kommentarfeltet.',
    tags:['fraværsgrensa','elevpolitikk'],
    commentItems:[
      { id:'c-1-1', organizationId:'kuben', organizationName:'Kuben vgs elevråd', actorName:'Emil Strand', createdAt:'1 t', body:'Vi har tre saker fra i vår. Sender dem på melding!' },
      { id:'c-1-2', organizationId:'nordahl', organizationName:'Nordahl Grieg vgs elevråd', actorName:'Oda Vikane', createdAt:'44 min', body:'Elever med kronisk sykdom taper mest på dagens ordning. Viktig sak.' }] },
  { id:'post-2', organizationId:'katta', initials:'TK', organizationName:'Trondheim katedralskole elevråd', actorName:'Vetle Aunemo', actorRole:'Elevrådsleder', createdAt:'5. september 2026', audience:'public', likes:167, comments:1,
    body:'I går arrangerte vi skoledebatt med seks ungdomspartier i aulaen. 400 elever møtte opp, og spørsmålene fra salen var bedre enn panelet var forberedt på.\n\nTakk til alle som stilte spørsmål om lærlingplasser.',
    tags:['skoledebatt','elevdemokrati'], media:[{ id:'m-2', type:'image', alt:'foto: skoledebatt i aulaen, seks paneldeltakere' }],
    commentItems:[{ id:'c-2-1', organizationId:'elvebakken', organizationName:'Elvebakken vgs elevråd', actorName:'Ida Halvorsen', createdAt:'3 t', body:'Så bra! Vi vurderer det samme til vinteren – kan vi høre hvordan dere planla det?' }] },
  { id:'post-3', organizationId:'nordahl', initials:'NG', organizationName:'Nordahl Grieg vgs elevråd', actorName:'Oda Vikane', actorRole:'Elevrådsleder', createdAt:'5. september 2026', audience:'public', likes:341, comments:2,
    body:'Gjennomslag: skolen innfører fast elevrådstime hver 14. dag fra oktober.\n\nVi har jobbet med dette i to år. Det betyr at klassene får tid til å diskutere saker før elevrådsmøtene – ikke bare etterpå.',
    tags:['gjennomslag','elevmedvirkning'],
    commentItems:[
      { id:'c-3-1', organizationId:'oslo-fylke', organizationName:'Elevorganisasjonen i Oslo', actorName:'Mathilde Rø', createdAt:'6 t', body:'Gratulerer! Dette er et godt eksempel til fylkessamlinga.' },
      { id:'c-3-2', organizationId:'hartvig', organizationName:'Hartvig Nissen elevråd', actorName:'Ingrid Haaland', createdAt:'5 t', body:'Hvordan argumenterte dere overfor rektor?' }] },
  { id:'post-4', organizationId:'elvebakken', initials:'EV', organizationName:'Elvebakken vgs elevråd', actorName:'Ida Halvorsen', actorRole:'Elevrådsleder', createdAt:'4. september 2026', audience:'public', edited:true, likes:198, comments:1,
    body:'Bilder fra elevrådsuka! Vi hadde stand i kantina, quiz på tvers av trinn og åpent møte om vurdering.\n\n62 elever meldte seg på klassekontaktvervet. Ny rekord.',
    tags:['elevrådsuka','skolemiljø'], media:[{ id:'m-4', type:'image', alt:'foto: stand i kantina under elevrådsuka' }],
    commentItems:[{ id:'c-4-1', organizationId:'ohg', organizationName:'Oslo handelsgymnasium elevråd', actorName:'Frida Aas', createdAt:'22 t', body:'Quizen ser gøy ut. Deler dere opplegget?' }] },
  { id:'post-5', organizationId:'oslo-fylke', initials:'OS', organizationName:'Elevorganisasjonen i Oslo', actorName:'Mathilde Rø', actorRole:'Fylkesleder', createdAt:'4. september 2026', audience:'county', priority:true, likes:112, comments:1, eventId:'fylkessamling',
    body:'Invitasjon: fylkessamling 11.–12. oktober på Sundvolden.\n\nAlle elevråd i Oslo kan sende to representanter. Vi setter felles saker for året, og det blir kurs i møteledelse. Påmelding via elevrådets e-post.',
    tags:['fylkessamling','oslo'], media:[{ id:'m-5', type:'image', alt:'foto: gruppearbeid på fylkessamling' }],
    commentItems:[{ id:'c-5-1', organizationId:'kuben', organizationName:'Kuben vgs elevråd', actorName:'Emil Strand', createdAt:'20 t', body:'Vi kommer med to. Blir det buss fra Oslo S?' }] },
  { id:'post-6', organizationId:'eo', initials:'EO', organizationName:'Elevorganisasjonen', actorName:'Amina Rashid', actorRole:'Politisk nestleder', createdAt:'3. september 2026', audience:'public', likes:96, comments:1,
    body:'Spørsmål til elevrådene: hva bør bli EOs viktigste sak fram mot Elevtinget?\n\nSvarene tar vi med inn i sentralstyrets forberedelser.',
    tags:['elevtinget','spørsmål'],
    poll:{ question:'Hva bør bli viktigste sak fram mot Elevtinget?', closesAt:'15. oktober 2026', resultsVisibility:'after_vote', options:[{ id:'a', label:'Fraværsgrensa', votes:412 },{ id:'b', label:'Psykisk helse i skolen', votes:388 },{ id:'c', label:'Gratis skolemat', votes:271 },{ id:'d', label:'Vurdering og eksamen', votes:196 }] },
    commentItems:[{ id:'c-6-1', organizationId:'katta', organizationName:'Trondheim katedralskole elevråd', actorName:'Vetle Aunemo', createdAt:'1 d', body:'Vanskelig valg – psykisk helse og fravær henger sammen.' }] },
  { id:'post-7', organizationId:'kuben', initials:'KU', organizationName:'Kuben vgs elevråd', actorName:'Emil Strand', actorRole:'Elevrådsleder', createdAt:'2. september 2026', audience:'public', likes:154, comments:0,
    body:'Vi har fått ja til at verkstedene holdes åpne to ettermiddager i uka, med lærer til stede.\n\nDet har vært elevrådets hovedsak i høst. Takk til alle klassene som skrev under.',
    tags:['yrkesfag','gjennomslag'], commentItems:[] },
  { id:'post-8', organizationId:'kuben', initials:'KU', organizationName:'Kuben vgs elevråd', actorName:'Emil Strand', actorRole:'Elevrådsleder', createdAt:'1. september 2026', audience:'friends', likes:12, comments:0,
    body:'Til vennerådene våre: vi deler gjerne malen vi brukte for underskriftskampanjen om verkstedene. Send en melding, så får dere den.',
    tags:['venneråd'], commentItems:[] },
];

/** Tidspunkt relativt til i dag, så demoen alltid har kommende og tidligere arrangementer. */
const at = (days:number, hour:number, minute = 0)=>{ const d = new Date(); d.setDate(d.getDate()+days); d.setHours(hour,minute,0,0); return d.toISOString(); };

/** Arrangementer i demoen. otherRegistrations og otherInterest er påmeldte og interesserte utenom demopersonene. */
export type DemoEvent = Omit<EventRecord,'organizerName'|'registered'|'interested'|'interestedByMe'|'canEdit'> & { otherRegistrations:number; otherInterest:number };
export const events: DemoEvent[] = [
  { id:'elevtinget', organizerId:'eo', title:'Elevtinget 2027', category:'landsmote', startsAt:at(160,12), endsAt:at(163,15), location:'Lillestrøm', digital:false, digitalUrl:null,
    registrationDeadline:at(120,23,59), capacity:500, seatsPerOrganization:4, priceLabel:null, status:'published', audience:'public', otherRegistrations:412, otherInterest:57, imageAlt:'foto: plenumssal med delegater',
    summary:'Elevorganisasjonens øverste organ. Hvert medlemselevråd kan sende delegater og stemme på politikken for neste år.',
    description:'Elevtinget er der elevpolitikken vedtas. Over fire dager behandler rundt 500 delegater politisk plattform, resolusjoner og valg av nytt sentralstyre.\n\nElevrådet melder på delegater innen fristen. Reise og opphold dekkes av fylkeslaget.' },
  { id:'skolering', organizerId:'oslo-fylke', title:'Elevrådskurs i Oslo', category:'kurs', startsAt:at(6,17), endsAt:at(6,20), location:'Kuben yrkesarena', digital:false, digitalUrl:null,
    registrationDeadline:null, capacity:120, seatsPerOrganization:null, priceLabel:'Gratis', status:'published', audience:'county', otherRegistrations:64, otherInterest:21, imageAlt:'foto: kursdeltakere rundt bord',
    summary:'Grunnkurs for nye elevrådsmedlemmer: møteledelse, hvordan man får gjennomslag hos rektor, og hvordan man planlegger et halvår.',
    description:'Kurset er for deg som er ny i elevrådet, eller som vil ha litt mer trøkk i arbeidet. Vi går gjennom møteledelse, saksforberedelse og hvordan man faktisk får gjennomslag i skolens ledelse.\n\nGratis for medlemselevråd. Pizza etter kurset.' },
  { id:'fylkessamling', organizerId:'oslo-fylke', title:'Fylkessamling Oslo', category:'samling', startsAt:at(10,12), endsAt:at(11,15), location:'Sundvolden', digital:false, digitalUrl:null,
    registrationDeadline:at(5,23,59), capacity:80, seatsPerOrganization:2, priceLabel:null, status:'published', audience:'county', otherRegistrations:70, otherInterest:12, imageAlt:'foto: gruppearbeid på samling',
    summary:'Helgesamling for alle elevråd i Oslo. Vi setter felles saker for året og blir kjent med elevråd på andre skoler.',
    description:'To dager med workshops, politikkverksted og sosialt program. Alle elevråd i fylket kan sende to representanter.\n\nVi vedtar fylkeslagets prioriterte saker for året, og du får møte elevråd fra 38 skoler.' },
  { id:'skolemiljo', organizerId:'eo', title:'Digitalt møte om skolemiljø', category:'digitalt', startsAt:at(2,18), endsAt:at(2,19), location:null, digital:true, digitalUrl:'https://meet.example.invalid/skolemiljo',
    registrationDeadline:null, capacity:500, seatsPerOrganization:null, priceLabel:null, status:'published', audience:'public', otherRegistrations:143, otherInterest:88, imageAlt:'foto: skjermdeling i digitalt møte',
    summary:'Åpent digitalt møte om kapittel 12 og hva elevrådet kan gjøre når skolemiljøsaker ikke blir tatt tak i.',
    description:'En time på nett med korte innlegg og god tid til spørsmål. Vi går gjennom elevenes rettigheter etter opplæringslova kapittel 12, og hva elevrådet konkret kan gjøre når saker stopper opp.\n\nLenken vises for påmeldte elevråd og delegater.' },
  { id:'elevtinget-i-fjor', organizerId:'eo', title:'Elevtinget i fjor', category:'landsmote', startsAt:at(-200,12), endsAt:at(-197,15), location:'Lillestrøm', digital:false, digitalUrl:null,
    registrationDeadline:null, capacity:500, seatsPerOrganization:4, priceLabel:null, status:'completed', audience:'public', otherRegistrations:430, otherInterest:0, imageAlt:'foto: plenumssal med delegater',
    summary:'Forrige Elevting, der dagens politiske plattform ble vedtatt.', description:'Elevtinget vedtok politisk plattform og valgte sentralstyret.' },
  { id:'fylkessamling-var', organizerId:'oslo-fylke', title:'Vårsamling Oslo', category:'samling', startsAt:at(-150,12), endsAt:at(-149,15), location:'Sundvolden', digital:false, digitalUrl:null,
    registrationDeadline:null, capacity:80, seatsPerOrganization:2, priceLabel:null, status:'completed', audience:'county', otherRegistrations:61, otherInterest:0, imageAlt:'foto: gruppearbeid på samling',
    summary:'Vårens samling for elevråd i Oslo.', description:'Workshops om skolemiljø og vurdering.' },
];

/** Påmeldinger og delegater i demoen: Elvebakken deltok på forrige Elevting og vårsamlingen, og er meldt på fylkessamlingen med Ida som invitert delegat. */
export const demoRegistrations:{ eventId:string; organizationId:string; status:'registered'|'attended'; delegates:{ person:string; status:'invited'|'attended'; officeTitle:string }[] }[] = [
  { eventId:'elevtinget-i-fjor', organizationId:'elvebakken', status:'attended', delegates:[{ person:'Ida Halvorsen', status:'attended', officeTitle:'Elevrådsmedlem' },{ person:'Sivert Aune', status:'attended', officeTitle:'Nestleder' }] },
  { eventId:'fylkessamling-var', organizationId:'elvebakken', status:'attended', delegates:[{ person:'Ida Halvorsen', status:'attended', officeTitle:'Elevrådsmedlem' }] },
  { eventId:'fylkessamling', organizationId:'elvebakken', status:'registered', delegates:[{ person:'Ida Halvorsen', status:'invited', officeTitle:'Elevrådsleder' }] },
];

export const conversations: Conversation[] = [
  { id:'c1', name:'Kuben vgs elevråd', initials:'KU', subtitle:'Elevråd · Oslo', organizationId:'kuben', kind:'group', unread:0, members:9, messages:[
    { id:'1', from:'Emil', text:'Hei! Vi så innlegget om elevrådsuka. Hvordan fikk dere så mange til å stille som klassekontakt?', time:'09:12' },
    { id:'2', from:'Ida', mine:true, text:'Hei! Vi hadde stand i kantina hele uka og lot folk skrive seg på der og da. Mye lettere enn å be dem sende e-post.', time:'09:20' },
    { id:'3', from:'Emil', text:'Smart. Kan vi ta et digitalt møte før fylkessamlinga?', time:'09:24' },
    { id:'4', from:'Ida', mine:true, text:'Ja, gjerne. Torsdag 16:00?', time:'09:26' }] },
  { id:'c2', name:'Elevorganisasjonen i Oslo', initials:'OS', subtitle:'Fylkeslag · verifisert', organizationId:'oslo-fylke', kind:'group', unread:2, members:8, messages:[
    { id:'1', from:'Mathilde', text:'Hei Elvebakken! Har dere valgt de to representantene til fylkessamlinga?', time:'i går' },
    { id:'2', from:'Ida', mine:true, text:'Vi vedtar det på møtet torsdag, sender navn rett etterpå.', time:'i går' },
    { id:'3', from:'Mathilde', text:'Perfekt. Frist er 1. oktober, så det holder fint.', time:'08:40' }] },
  { id:'c3', name:'Trondheim katedralskole elevråd', initials:'TK', subtitle:'Elevråd · Trøndelag', organizationId:'katta', kind:'group', unread:0, members:7, messages:[
    { id:'1', from:'Vetle', text:'Vi deler gjerne debattopplegget vårt. Skal jeg sende dokumentet?', time:'man' },
    { id:'2', from:'Ida', mine:true, text:'Ja takk!', time:'man' }] },
];
