import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardNav from '@/components/DashboardNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col bg-off-white overflow-x-hidden">
      <DashboardNav role={session.user.role} userName={session.user.name || ''} />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 min-w-0">
        {children}
      </main>
    </div>
  );
}
