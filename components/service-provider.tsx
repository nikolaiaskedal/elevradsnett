import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ElevradsnettService } from '@/lib/services/contracts';
import { createService } from '@/lib/services/create-service';

const ServiceContext = createContext<ElevradsnettService|null>(null);

export function ServiceProvider({ service, children }:{ service?:ElevradsnettService; children:ReactNode }) {
  const [value] = useState(()=>service ?? createService());
  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

export function useService() {
  const service = useContext(ServiceContext);
  if (!service) throw new Error('useService må brukes inne i ServiceProvider');
  return service;
}
