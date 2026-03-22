import { prisma } from '@/lib/prisma';

const ENTITY = 'raid_signup';

export async function logRaidSignupAudit(args: {
  signupId: string;
  raidId: string;
  guildId: string;
  changedByUserId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}): Promise<void> {
  try {
    await prisma.rfAuditLog.create({
      data: {
        entityType: ENTITY,
        entityId: args.signupId,
        action: args.action,
        changedByUserId: args.changedByUserId,
        fieldName: args.fieldName ?? null,
        oldValue: args.oldValue ?? null,
        newValue: args.newValue ?? null,
        guildId: args.guildId,
        raidId: args.raidId,
      },
    });
  } catch (e) {
    console.error('[logRaidSignupAudit]', e);
  }
}

export function snapshotSignup(s: Record<string, unknown>): string {
  return JSON.stringify(s);
}
