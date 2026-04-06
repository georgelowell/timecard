import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Enforce role-based access at route level
    if (pathname.startsWith('/dashboard/users') || pathname.startsWith('/dashboard/qrcodes') || pathname.startsWith('/dashboard/settings')) {
      if (token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    if (pathname.startsWith('/dashboard/timecards') || pathname.startsWith('/dashboard/reports') || pathname.startsWith('/dashboard/taxonomy')) {
      if (token?.role !== 'manager' && token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/scan'],
};
