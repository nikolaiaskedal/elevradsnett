import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Elevrådsnett',
  description: 'Den digitale møteplassen for elevråd og Elevorganisasjonen.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
