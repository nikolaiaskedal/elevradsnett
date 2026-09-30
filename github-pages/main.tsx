// Statisk inngang for GitHub Pages. Rendrer samme app som app/page.tsx, uten server.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ElevradsnettApp from '@/components/elevradsnett-app';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ElevradsnettApp /></StrictMode>);
