import { useApp } from '@/components/app-context';

export function NotFound() {
  const { go } = useApp();
  return <div className="page"><h1>Fant ikke siden</h1><p className="muted">Lenken kan være utdatert.</p><button className="back-btn" onClick={()=>go({ view:'feed' })}>← Til forsiden</button></div>;
}
