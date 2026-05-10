'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Facility } from '@/types';

export default function ClockPage() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/facilities')
      .then(r => r.json())
      .then(data => setFacilities(data.facilities || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-lg mx-auto py-4">
      <h1 className="font-display font-bold text-2xl text-near-black mb-8">
        Where are you working today?
      </h1>

      {loading ? (
        <p className="text-sage text-sm font-body">Loading facilities…</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {facilities.map(facility => (
              <button
                key={facility.id}
                onClick={() => router.push(`/scan?facility=${facility.id}`)}
                className="w-full text-left bg-white border border-tan rounded-lg p-6 cursor-pointer transition-all hover:border-warm-brown hover:shadow-md"
              >
                <p className="font-display font-bold text-xl text-near-black">{facility.name}</p>
                {facility.location && (
                  <p className="font-body text-sm text-sage mt-1">{facility.location}</p>
                )}
              </button>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/scan?facility=remote"
              className="font-body text-sm text-warm-brown underline underline-offset-2 hover:text-warm-brown/80 transition-colors"
            >
              Working remotely today?
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
