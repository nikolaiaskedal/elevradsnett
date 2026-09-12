import type { Conversation, Event, Organization, Post, Representation, SearchResult } from '@/lib/domain/types';

export const representations: Representation[] = [
  { id:'rep-school', organizationId:'elvebakken', name:'Elvebakken vgs', initials:'EV', publicRole:'Elevrådsleder', canPublish:true, type:'school' },
  { id:'rep-county', organizationId:'oslo-fylke', name:'Fylkesstyret i Oslo', initials:'OF', publicRole:'Fylkesstyremedlem', canPublish:true, type:'county_board' },
  { id:'rep-local', organizationId:'oslo-sentrum', name:'Oslo Sentrum lokallag', initials:'OS', publicRole:'Lokallagsmedlem', canPublish:false, type:'local_board' },
];

export const organizations: Organization[] = [
  { id:'eo', type:'national', name:'EO Nasjonalt', initials:'EO', county:'Nasjonalt', status:'active', bio:'Elevorganisasjonen er av, med og for elever.', followers:12843, following:true },
  { id:'oslo-fylke', type:'county_board', name:'Fylkesstyret i Oslo', initials:'OF', county:'Oslo', status:'active', bio:'Fylkesstyret representerer elever og elevråd i Oslo.', followers:1332, following:true },
  { id:'oslo-sentrum', type:'local_board', name:'Oslo Sentrum lokallag', initials:'OS', county:'Oslo', localBoard:'Oslo Sentrum', status:'active', bio:'Møteplassen for elevråd i Oslo sentrum.', followers:684, following:true },
  { id:'elvebakken', type:'school', name:'Elvebakken vgs', initials:'EV', county:'Oslo', localBoard:'Oslo Sentrum', schoolLevel:'upper_secondary', status:'active', bio:'Elevrådet ved Elvebakken jobber for en tryggere og mer inkluderende skolehverdag.', followers:426, following:true },
  { id:'ohg', type:'school', name:'Oslo Handelsgymnasium', initials:'OH', county:'Oslo', localBoard:'Oslo Sentrum', schoolLevel:'upper_secondary', status:'active', bio:'Elevrådet ved OHG.', followers:309, following:true },
  { id:'kongshavn', type:'school', name:'Kongshavn vgs', initials:'KG', county:'Oslo', localBoard:'Oslo Øst', schoolLevel:'upper_secondary', status:'active', bio:'Elevrådet ved Kongshavn.', followers:238 },
  { id:'hersleb', type:'school', name:'Hersleb vgs', initials:'HF', county:'Oslo', localBoard:'Oslo Øst', schoolLevel:'upper_secondary', status:'active', bio:'Elevrådet ved Hersleb.', followers:194 },
  { id:'fagerborg', type:'school', name:'Fagerborg skole', initials:'FS', county:'Oslo', localBoard:'Oslo Vest', schoolLevel:'lower_secondary', status:'deactivated', bio:'Tidligere elevrådsside.', followers:102 },
];

export const initialPosts: Post[] = [
  { id:'post-1', organizationId:'eo', initials:'EO', organizationName:'EO Nasjonalt', actorName:'Mina Aas', actorRole:'Sentralstyremedlem', createdAt:'for 38 min siden', body:'Nå er påmeldingen til Elevtinget åpen! Skoler kan melde på delegater frem til 15. oktober. Vi gleder oss til tre dager med politikk, verksteder og nye bekjentskaper.', audience:'public', priority:true, likes:84, comments:19, eventId:'elevtinget' },
  { id:'post-2', organizationId:'elvebakken', initials:'EV', organizationName:'Elvebakken vgs', actorName:'Ida Halvorsen', actorRole:'Elevrådsleder', createdAt:'for 2 timer siden', body:'Vi planlegger høstens temauke og vil gjerne lære av andre elevråd: Hvordan har dere fått flere elever til å delta?', audience:'public', likes:31, comments:12, poll:{ question:'Hva fungerer best hos dere?', closesAt:'20. september', options:[{id:'a',label:'Åpne elevrådsmøter',votes:18},{id:'b',label:'Digitale innspill',votes:12},{id:'c',label:'Klasseromsbesøk',votes:25}] } },
  { id:'post-3', organizationId:'oslo-fylke', initials:'OF', organizationName:'Fylkesstyret i Oslo', actorName:'Jonas Berg', actorRole:'Fylkesleder', createdAt:'i går', body:'Takk til alle skolene som deltok på skoleringen. Presentasjonen og arbeidsarket ligger nå i arrangementet.', audience:'county', likes:47, comments:6, edited:true },
];

export const events: Event[] = [
  { id:'skolering', host:'Fylkesstyret i Oslo', title:'Skolering for elevråd', description:'En praktisk ettermiddag om elevmedvirkning, økonomi og godt styrearbeid.', start:'18. september 2026 · 16:00', end:'19:30', place:'Sentralen, Oslo', deadline:'16. september', capacity:120, registered:86, status:'published', audience:'Elevråd i Oslo' },
  { id:'elevtinget', host:'EO Nasjonalt', title:'Elevtinget 2026', description:'Elevorganisasjonens landsmøte med politikk, verksteder og valg.', start:'30. oktober 2026 · 12:00', end:'1. november · 15:00', place:'Oslo kongressenter', deadline:'15. oktober', capacity:450, registered:318, status:'published', audience:'Videregående og ungdomsskole' },
  { id:'lederforum', host:'Oslo Sentrum lokallag', title:'Lederforum: medvirkning', description:'Erfaringsdeling for elevrådsledere i Oslo sentrum.', start:'6. oktober 2026 · 17:00', end:'19:00', place:'Elvebakken vgs', deadline:'3. oktober', capacity:45, registered:29, status:'published', audience:'Oslo Sentrum lokallag' },
];

export const conversations: Conversation[] = [
  { id:'c1', name:'Sofie Nilsen', initials:'SN', kind:'direct', unread:2, members:2, messages:[{id:'1',from:'Sofie',text:'Hei! Kan vi dele opplegget deres for klassens time?',time:'10:24'},{id:'2',from:'Ida',mine:true,text:'Ja, jeg sender det etter møtet i dag.',time:'10:31'},{id:'3',from:'Sofie',text:'Supert, takk!',time:'10:33'}] },
  { id:'c2', name:'Elevrådsstyret · Elvebakken', initials:'EV', kind:'managed', unread:0, members:9, messages:[{id:'1',from:'Aksel',text:'Sakspapirene til torsdag er klare.',time:'i går'},{id:'2',from:'Ida',mine:true,text:'Flott. Jeg legger til saken om temauka.',time:'i går'}] },
  { id:'c3', name:'Elevrådsledere i Oslo', initials:'OL', kind:'group', unread:0, members:18, muted:true, messages:[{id:'1',from:'Nora',text:'Hvem kommer på skoleringen neste uke?',time:'mandag'}] },
];

export const searchResults: SearchResult[] = [
  { id:'elvebakken', type:'Skole', title:'Elvebakken vgs', subtitle:'Oslo · Oslo Sentrum lokallag' },
  { id:'oslo-fylke', type:'Styre', title:'Fylkesstyret i Oslo', subtitle:'Fylkesstyre · 12 offentlige kontaktpersoner' },
  { id:'person-1', type:'Person', title:'Sofie Nilsen', subtitle:'Elevrådsleder · Kongshavn vgs' },
  { id:'elevtinget', type:'Arrangement', title:'Elevtinget 2026', subtitle:'30. oktober–1. november · Oslo' },
  { id:'post-1', type:'Innlegg', title:'Påmeldingen til Elevtinget er åpen', subtitle:'EO Nasjonalt · for 38 min siden' },
  { id:'fagerborg', type:'Skole', title:'Fagerborg skole', subtitle:'Deaktivert · tidligere elevråd', inactive:true },
];
