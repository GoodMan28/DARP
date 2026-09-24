import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'DARP · Accreditation Data Portal · BIT Mesra',
  description: 'Institutional accreditation data portal for NAAC, NIRF and QS reporting.',
  robots: { index: false, follow: false },   // internal system — never indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
