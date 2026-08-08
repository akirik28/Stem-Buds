import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'STEM & BUDS',
    template: '%s · STEM & BUDS',
  },
  description:
    'STEM & BUDS, lise öğrencilerini mentorlarla bir araya getirerek fikirleri gerçek araştırma ve proje çalışmalarına dönüştüren öğrenci liderliğinde bir programdır.',
  applicationName: 'STEM & BUDS',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#102244',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white"
        >
          Ana içeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
