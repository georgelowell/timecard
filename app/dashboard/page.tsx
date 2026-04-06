import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin';
import { Timecard, User, Facility } from '@/types';
import { getWeekStartUTC } from '@/lib/tz';
import ManagerOverview from '@/components/ManagerOverview';
import EmployeeOverview from '@/components/EmployeeOverview';

async function getOverviewData(role: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  if (role === 'manager' || role === 'admin') {
    const [activeSnap, pendingSnap, facilitiesSnap, usersSnap] = await Promise.all([
      adminDb.collection('timecards')
        .where('status', 'in', ['checked-in', 'pending-approval'])
        .where('checkInTime', '>=', todayStr)
        .get(),
      adminDb.collection('timecards')
        .where('status', '==', 'pending-approval')
        .get(),
      adminDb.collection('facilities').where('active', '==', true).get(),
      adminDb.collection('users').where('active', '==', true).get(),
    ]);

    const facilities = new Map(facilitiesSnap.docs.map(d => [d.id, d.data() as Facility]));
    const users = new Map(usersSnap.docs.map(d => [d.id, d.data() as User]));

    const activeTimecards = activeSnap.docs.map(d => {
      const tc = d.data() as Timecard;
      return {
        ...tc,
        id: d.id,
        employeeName: users.get(tc.employeeId)?.name || 'Unknown',
        facilityName: facilities.get(tc.facilityId)?.name || 'Unknown',
      };
    });

    const pending = pendingSnap.docs.map(d => {
      const tc = d.data() as Timecard;
      return {
        ...tc,
        id: d.id,
        employeeName: users.get(tc.employeeId)?.name || 'Unknown',
        employeeEmail: users.get(tc.employeeId)?.email || '',
        facilityName: facilities.get(tc.facilityId)?.name || 'Unknown',
      };
    });

    const facilitiesData = facilitiesSnap.docs.map(d => {
      const data = d.data() as Facility;
      return { id: d.id, name: data.name };
    });

    return { activeTimecards, pending, facilities: facilitiesData };
  }

  return null;
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const role = session.user.role;
  const overviewData = await getOverviewData(role);

  if (role === 'manager' || role === 'admin') {
    return <ManagerOverview data={overviewData!} />;
  }

  const weekStartUTC = getWeekStartUTC();
  return <EmployeeOverview userId={session.user.id} weekStartUTC={weekStartUTC} />;
}
