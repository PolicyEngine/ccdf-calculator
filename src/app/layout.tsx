import { PolicyEngineShell } from '@policyengine/ui-kit/layout';
import '@policyengine/ui-kit/styles.css';

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

const SITE_URL = 'https://ccdf-calculator.vercel.app';
const CANONICAL_URL = 'https://policyengine.org/us/ccdf-calculator';
const TITLE =
  'Child care subsidy calculator | Estimate your state CCDF subsidy - PolicyEngine';
const DESCRIPTION =
  'Free child care subsidy calculator. Estimate the monthly subsidy your state pays and the copay your family owes under its Child Care and Development Fund program, and compare all 50 states and DC.';
const OG_IMAGE = `${SITE_URL}/policyengine-logo.png`;
const GA_MEASUREMENT_ID = 'G-2YHG89FY0N';
const TOOL_NAME = 'ccdf-calculator';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const LOGO_PATH = `${BASE_PATH}/policyengine-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'child care subsidy calculator',
    'CCDF',
    'Child Care and Development Fund',
    'child care assistance',
    'child care copay',
    'state child care subsidy',
    'child care voucher',
    'PolicyEngine',
  ],
  alternates: { canonical: CANONICAL_URL },
  robots: { index: true, follow: true },
  icons: {
    icon: LOGO_PATH,
    apple: LOGO_PATH,
  },
  openGraph: {
    type: 'website',
    title: 'Child care subsidy calculator | Estimate your state CCDF subsidy',
    description: DESCRIPTION,
    url: CANONICAL_URL,
    siteName: 'PolicyEngine',
    images: [
      {
        url: OG_IMAGE,
        alt: 'PolicyEngine child care subsidy calculator',
      },
    ],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'Child care subsidy calculator | Estimate your state CCDF subsidy',
    description:
      'Estimate the monthly child care subsidy your state pays and the copay your family owes, and compare all 50 states and DC.',
    images: [
      {
        url: OG_IMAGE,
        alt: 'PolicyEngine child care subsidy calculator',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
  themeColor: '#319795',
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Child care subsidy calculator',
  description:
    'Estimate the monthly child care subsidy a state pays under its Child Care and Development Fund program, the family copay, and how the 51 state programs compare.',
  url: CANONICAL_URL,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'All',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: {
    '@type': 'Organization',
    name: 'PolicyEngine',
    url: 'https://policyengine.org',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}', { tool_name: '${TOOL_NAME}' });
          `}
        </Script>
        <Script id="ga-engagement" strategy="afterInteractive">
          {`
            (function() {
              var TOOL_NAME = '${TOOL_NAME}';
              if (typeof window === 'undefined' || !window.gtag) return;
              var scrollFired = {};
              window.addEventListener('scroll', function() {
                var docHeight = document.documentElement.scrollHeight - window.innerHeight;
                if (docHeight <= 0) return;
                var pct = Math.floor((window.scrollY / docHeight) * 100);
                [25, 50, 75, 100].forEach(function(m) {
                  if (pct >= m && !scrollFired[m]) {
                    scrollFired[m] = true;
                    window.gtag('event', 'scroll_depth', { percent: m, tool_name: TOOL_NAME });
                  }
                });
              }, { passive: true });
              [30, 60, 120, 300].forEach(function(sec) {
                setTimeout(function() {
                  if (document.visibilityState !== 'hidden') {
                    window.gtag('event', 'time_on_tool', { seconds: sec, tool_name: TOOL_NAME });
                  }
                }, sec * 1000);
              });
              document.addEventListener('click', function(e) {
                var link = e.target && e.target.closest ? e.target.closest('a') : null;
                if (!link || !link.href) return;
                try {
                  var url = new URL(link.href, window.location.origin);
                  if (url.hostname && url.hostname !== window.location.hostname) {
                    window.gtag('event', 'outbound_click', { url: link.href, target_hostname: url.hostname, tool_name: TOOL_NAME });
                  }
                } catch (err) {}
              });
            })();
          `}
        </Script>
        <noscript>
          <h1>Child care subsidy calculator</h1>
          <p>
            This calculator estimates the monthly child care subsidy your state
            pays under its Child Care and Development Fund program and the copay
            your family owes, for all 50 states and the District of Columbia.
            Please enable JavaScript to use it.
          </p>
          <p>
            Visit <a href="https://policyengine.org">PolicyEngine.org</a> for
            more policy analysis tools.
          </p>
        </noscript>
        <PolicyEngineShell country="us">{children}</PolicyEngineShell>
      </body>
    </html>
  );
}
