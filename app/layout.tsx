import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mastery — Learning Dashboard',
  description: 'A shared learning dashboard for mastering software engineering.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
