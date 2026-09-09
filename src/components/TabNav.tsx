'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Calculator' },
  { href: '/compare', label: 'Compare states' },
  { href: '/impact', label: 'Population impact' },
];

function normalize(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export default function TabNav() {
  const pathname = normalize(usePathname() ?? '/');

  return (
    <nav className="tab-bar tab-bar-nav" aria-label="Dashboard pages">
      {TABS.map(({ href, label }) => {
        const active = pathname === normalize(href);
        return (
          <Link
            key={href}
            href={href}
            className={`tab-btn ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
