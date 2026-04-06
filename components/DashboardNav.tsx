'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/types';

interface Props {
  role: UserRole;
  userName: string;
}

export default function DashboardNav({ role, userName }: Props) {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard',           label: 'Overview',  roles: ['employee', 'manager', 'admin'] },
    { href: '/dashboard/history',   label: 'History',   roles: ['employee'] },
    { href: '/dashboard/timecards', label: 'Timecards', roles: ['manager', 'admin'] },
    { href: '/dashboard/reports',   label: 'Reports',   roles: ['manager', 'admin'] },
    { href: '/dashboard/taxonomy',  label: 'Taxonomy',  roles: ['manager', 'admin'] },
    { href: '/dashboard/users',     label: 'Users',     roles: ['admin'] },
    { href: '/dashboard/qrcodes',   label: 'Locations', roles: ['admin'] },
    { href: '/dashboard/settings',  label: 'Settings',  roles: ['admin'] },
  ].filter(item => item.roles.includes(role));

  return (
    <nav className="bg-near-black sticky top-0 z-20">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-14">

          {/* Logo / wordmark */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex-shrink-0">
              {/* Logo placeholder — replace with <Image> import */}
              <span className="font-display font-black text-tan text-lg tracking-tight">
                LOWELL
              </span>
            </Link>

            <div className="flex items-center gap-1 overflow-x-auto">
              {navItems.map(item => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded text-sm font-display font-bold whitespace-nowrap transition-colors ${
                      active
                        ? 'text-tan'
                        : 'text-off-white/70 hover:text-off-white'
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="block h-0.5 bg-tan mt-0.5 rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User info + sign out */}
          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
            <span className="text-xs text-off-white/50 hidden sm:block truncate max-w-32 font-body">
              {userName}
            </span>
            <span className="text-xs px-2 py-0.5 rounded border border-tan/40 text-tan font-display font-bold capitalize hidden sm:block">
              {role}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-xs text-off-white/50 hover:text-off-white transition-colors font-body"
            >
              Sign out
            </button>
          </div>

        </div>
      </div>
    </nav>
  );
}
