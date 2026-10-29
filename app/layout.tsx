import type {Metadata} from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Community Work South Africa | Find work close to home',
  description:
    'Discover local shifts across South Africa. Filter jobs by distance, pay and category, or post a job with clear hours and pay in rand.',
  robots: {index: false, follow: false},
};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
