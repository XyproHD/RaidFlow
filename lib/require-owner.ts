import { requireAdmin, AdminDatabaseError } from '@/lib/require-admin';
import { OWNER_DISCORD_ID } from '@/lib/app-config';

/**
 * Nur der feste Application-Owner (OWNER_DISCORD_ID), nicht andere App-Admins.
 */
export async function requireOwner() {
  try {
    const admin = await requireAdmin();
    if (!admin || admin.discordId !== OWNER_DISCORD_ID) return null;
    return admin;
  } catch (e) {
    if (e instanceof AdminDatabaseError) return null;
    throw e;
  }
}
