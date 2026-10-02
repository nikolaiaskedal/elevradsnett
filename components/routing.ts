// Hash-basert routing, så det statiske bygget fungerer uten omskrivinger på serveren.

export type LegalPage = 'privacy'|'terms'|'cookies'|'contact';
export const legalPages:[LegalPage,string][] = [['privacy','Personvern'],['terms','Vilkår'],['cookies','Informasjonskapsler'],['contact','Kontakt']];

export type Route =
  | { view:'feed' } | { view:'post'; id:string } | { view:'explore' } | { view:'events' } | { view:'event'; id:string } | { view:'organization'; id:string } | { view:'person'; id:string }
  | { view:'messages' } | { view:'notifications' } | { view:'profile' } | { view:'login' } | { view:'admin' } | { view:'legal'; page:LegalPage };

const simpleRoutes:Record<string,Route> = { '':{view:'feed'}, utforsk:{view:'explore'}, arrangementer:{view:'events'}, meldinger:{view:'messages'}, varsler:{view:'notifications'}, profil:{view:'profile'}, 'logg-inn':{view:'login'}, admin:{view:'admin'} };

export function parseHash(hash:string):Route {
  const [first='',second] = decodeURIComponent(hash.replace(/^#\/?/,'')).split('/');
  if (first==='arrangementer' && second) return { view:'event', id:second };
  if (first==='org' && second) return { view:'organization', id:second };
  if (first==='innlegg' && second) return { view:'post', id:second };
  if (first==='person' && second) return { view:'person', id:second };
  if (first==='info') return { view:'legal', page:legalPages.some(([id])=>id===second)?second as LegalPage:'privacy' };
  return simpleRoutes[first] ?? { view:'feed' };
}

export function routeHash(route:Route) {
  switch (route.view) {
    case 'event': return `#/arrangementer/${route.id}`;
    case 'organization': return `#/org/${route.id}`;
    case 'post': return `#/innlegg/${route.id}`;
    case 'person': return `#/person/${route.id}`;
    case 'legal': return `#/info/${route.page}`;
    default: return `#/${Object.entries(simpleRoutes).find(([,r])=>r.view===route.view)?.[0] ?? ''}`;
  }
}
