import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ElevradsnettApp from '@/components/elevradsnett-app';
import { ServiceProvider } from '@/components/service-provider';
import './globals.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ServiceProvider><ElevradsnettApp/></ServiceProvider></StrictMode>);
