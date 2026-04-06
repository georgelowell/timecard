import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardNav from '@/components/DashboardNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col bg-off-white">
      <DashboardNav role={session.user.role} userName={session.user.name || ''} />
      <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
        {children}
      </main>
    </div>
  );
}
