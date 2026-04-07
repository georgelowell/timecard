'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { UserRole } from '@/types';

interface Props {
  role: UserRole;
  userName: string;
}

export default function DashboardNav({ role, userName }: Props) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const navItems = [
    { href: '/dashboard',           label: 'Overview',  roles: ['employee', 'manager', 'admin'] },
    { href: '/dashboard/history',   label: 'History',   roles: ['employee'] },
    { href: '/dashboard/timecards', label: 'Timecards', roles: ['manager', 'admin'] },
    { href: '/dashboard/reports',   label: 'Reports',   roles: ['manager', 'admin'] },
    { href: '/dashboard/analytics', label: 'Analytics', roles: ['manager', 'admin'] },
    { href: '/dashboard/taxonomy',  label: 'Taxonomy',  roles: ['manager', 'admin'] },
    { href: '/dashboard/users',     label: 'Users',     roles: ['admin'] },
    { href: '/dashboard/qrcodes',   label: 'Locations', roles: ['admin'] },
    { href: '/dashboard/settings',  label: 'Settings',  roles: ['admin'] },
  ].filter(item => item.roles.includes(role));

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Close menu when clicking outside the nav
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <nav ref={navRef} className="bg-near-black sticky top-0 z-30">

      {/* ── Main bar ──────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link href="/dashboard" className="flex-shrink-0 mr-4">
            <span className="font-display font-black text-tan text-lg tracking-tight">LOWELL</span>
          </Link>

          {/* Desktop tab bar — hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto scrollbar-hide">
            {navItems.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded text-sm font-display font-bold whitespace-nowrap transition-colors ${
                    active ? 'text-tan' : 'text-off-white/70 hover:text-off-white'
                  }`}
                >
                  {item.label}
                  {active && <span className="block h-0.5 bg-tan mt-0.5 rounded-full" />}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0 ml-auto md:ml-4">
            {/* User info — desktop only */}
            <span className="text-xs text-off-white/50 hidden lg:block truncate max-w-32 font-body">
              {userName}
            </span>
            <span className="text-xs px-2 py-0.5 rounded border border-tan/40 text-tan font-display font-bold capitalize hidden md:block">
              {role}
            </span>
            {/* Sign out — desktop only */}
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="hidden md:block text-xs text-off-white/50 hover:text-off-white transition-colors font-body"
            >
              Sign out
            </button>

            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden flex flex-col justify-center items-center w-11 h-11 gap-[5px] flex-shrink-0"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className={`block w-5 h-0.5 bg-off-white rounded-full transition-all duration-200 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
              <span className={`block w-5 h-0.5 bg-off-white rounded-full transition-all duration-200 ${menuOpen ? 'opacity-0 scale-x-0' : ''}`} />
              <span className={`block w-5 h-0.5 bg-off-white rounded-full transition-all duration-200 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
            </button>
          </div>

        </div>
      </div>

      {/* ── Mobile dropdown ────────────────────────────────────────────────── */}
      {menuOpen && (
        <div className="md:hidden border-t border-off-white/10 bg-near-black">
          <div className="container mx-auto max-w-6xl">
            {navItems.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-4 text-sm font-display font-bold
                              border-b border-off-white/5 last:border-b-0 min-h-[44px] transition-colors ${
                    active ? 'text-warm-brown' : 'text-off-white/70 active:text-off-white'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-warm-brown' : 'bg-transparent'}`} />
                  {item.label}
                </Link>
              );
            })}

            {/* Sign out + user info at bottom of menu */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-off-white/10">
              <div>
                <p className="text-xs text-off-white/40 font-body truncate max-w-48">{userName}</p>
                <p className="text-xs text-tan/70 font-display font-bold capitalize mt-0.5">{role}</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="text-sm text-off-white/50 hover:text-off-white transition-colors font-body min-h-[44px] px-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
