import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Elevrådsnett',
  description: 'Den digitale møteplassen for elevråd og Elevorganisasjonen.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Root layout i App Router gjelder alle sider; regelen er skrevet for Pages Router. */}
        {/* oxlint-disable-next-line nextjs/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
