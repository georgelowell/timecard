import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { UserRole } from '@/types';
import { NextResponse } from 'next/server';

export async function requireAuth(minRole?: UserRole) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if (minRole) {
    const roleHierarchy: Record<UserRole, number> = {
      employee: 0,
      manager: 1,
      admin: 2,
    };

    const userRoleLevel = roleHierarchy[session.user.role as UserRole] ?? -1;
    const requiredLevel = roleHierarchy[minRole];

    if (userRoleLevel < requiredLevel) {
      return {
        session: null,
        error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      };
    }
  }

  return { session, error: null };
}
