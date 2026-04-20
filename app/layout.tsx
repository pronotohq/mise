import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PostHogInit } from './lib/posthog';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  title: 'FreshNudge — Know your fridge',
  description: 'Fridge tracking + meal suggestions. Never wonder what to cook again.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mise',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#C94A3A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=DM+Serif+Display&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,700&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PostHogInit/>
        {children}
        <Analytics/>
      </body>
    </html>
  );
}
