import { NextResponse } from 'next/server';

export type AffectedSignupRef = {
  signupId: string;
  displayName: string;
};

export function jsonSignupValidationError(
  error: string,
  status: number,
  affectedSignups?: AffectedSignupRef[]
): NextResponse {
  return NextResponse.json(
    affectedSignups?.length ? { error, affectedSignups } : { error },
    { status }
  );
}

export function formatSignupApiErrorPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed || 'Error';
  try {
    const j = JSON.parse(trimmed) as {
      error?: string;
      affectedSignups?: Array<{ displayName?: string }>;
    };
    const base = typeof j.error === 'string' ? j.error : trimmed;
    const names = (j.affectedSignups ?? [])
      .map((s) => (typeof s.displayName === 'string' ? s.displayName.trim() : ''))
      .filter(Boolean);
    if (names.length === 0) return base;
    return `${base}\n${names.join(', ')}`;
  } catch {
    return trimmed;
  }
}

export function displayNameForSignupRow(row: {
  character?: { name?: string | null; guildDiscordDisplayName?: string | null } | null;
}): string {
  const charName = row.character?.name?.trim();
  const discord = row.character?.guildDiscordDisplayName?.trim() || '';
  if (charName && discord) return `${charName} (${discord})`;
  return charName || discord || 'Unknown';
}
