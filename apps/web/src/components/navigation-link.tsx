'use client';

import type { ReactNode } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';

function Pending() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`nav-pending ${pending ? 'is-pending' : ''}`}
      aria-hidden="true"
    />
  );
}

export function NavigationLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}>
      {children}
      <Pending />
    </Link>
  );
}
