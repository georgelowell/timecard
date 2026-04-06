'use client';

import { signIn, useSession } from 'next-auth/react';
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const error = searchParams.get('error');

  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.replace(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-off-white">
        <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-off-white p-8">
      <div className="bg-white rounded-lg border border-tan shadow-card p-10 w-full max-w-sm">

        {/* Logo placeholder */}
        <div className="mb-8 text-center">
          <div className="inline-block w-12 h-12 bg-tan/30 rounded-lg mb-4" aria-hidden="true" />
          <h1 className="text-3xl font-display font-black text-near-black tracking-tight">
            Lowell Timecard
          </h1>
          <p className="font-callout italic text-sage mt-1 text-sm">
            Track your hours.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-near-black text-off-white rounded-lg text-sm font-body">
            {error === 'AccessDenied'
              ? 'Wrong account. Use your company Google login.'
              : 'Something went wrong. Try again.'}
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 bg-off-white border border-tan
                     rounded-lg py-3 px-4 text-near-black font-display font-bold text-sm
                     hover:border-warm-brown hover:bg-tan/10 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="mt-6 text-xs text-sage text-center font-body">
          Company accounts only.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-off-white">
        <div className="w-8 h-8 border-4 border-warm-brown border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
