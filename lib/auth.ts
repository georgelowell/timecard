import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { adminDb } from './firebase-admin';
import { User, UserRole } from '@/types';

const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'gmail.com';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!user.email) return false;

      const domain = user.email.split('@')[1];
      if (domain !== ALLOWED_DOMAIN) {
        return false;
      }

      // Upsert user in Firestore
      const userRef = adminDb.collection('users').doc(user.id);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        // Check for a pending invite
        const inviteRef = adminDb.collection('user_invites').doc(user.email.toLowerCase());
        const inviteDoc = await inviteRef.get();

        // Check if this is the first user (auto-assign admin)
        const usersSnapshot = await adminDb.collection('users').limit(1).get();
        const isFirstUser = usersSnapshot.empty;

        let role: UserRole = isFirstUser ? 'admin' : 'employee';
        let facilityId: string | undefined;

        if (inviteDoc.exists) {
          const invite = inviteDoc.data()!;
          role = invite.role as UserRole;
          facilityId = invite.facilityId || undefined;
          await inviteRef.delete();
        }

        const newUser: Omit<User, 'id'> = {
          email: user.email,
          name: user.name || '',
          photoUrl: user.image || '',
          role,
          ...(facilityId ? { facilityId } : {}),
          createdAt: new Date().toISOString(),
          active: true,
        };
        await userRef.set(newUser);
      } else {
        // Update name/photo in case they changed
        await userRef.update({
          name: user.name || userDoc.data()?.name,
          photoUrl: user.image || userDoc.data()?.photoUrl,
        });

        // Check if user is active
        if (!userDoc.data()?.active) {
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }

      if (token.userId) {
        try {
          const userDoc = await adminDb.collection('users').doc(token.userId as string).get();
          if (userDoc.exists) {
            const data = userDoc.data() as User;
            token.role = data.role;
            token.facilityId = data.facilityId;
            token.active = data.active;
          }
        } catch {
          // Firestore might not be reachable during build
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        session.user.role = token.role as UserRole;
        session.user.facilityId = token.facilityId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
};
