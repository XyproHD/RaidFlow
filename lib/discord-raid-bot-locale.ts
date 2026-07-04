export type RaidBotLocale = 'de' | 'en';

export function resolveRaidBotLocale(
  channelId: string | null | undefined,
  discordGuestChannelId: string | null | undefined
): RaidBotLocale {
  const ch = channelId?.trim();
  const guest = discordGuestChannelId?.trim();
  if (ch && guest && ch === guest) return 'en';
  return 'de';
}

const MESSAGES = {
  de: {
    NOT_LINKED:
      'Discord-Konto ist nicht mit RaidFlow verknüpft. Nutze die RaidFlow-Startansicht (App Home), um dein Konto zu verbinden.',
    NOT_GUILD_MEMBER: 'Du bist kein RaidFlow-Mitglied dieser Gilde.',
    NO_CHARACTER:
      'Kein Charakter für diese Gilde gefunden. Bitte erst einen Charakter in der WebApp anlegen.',
    NO_CHARACTER_GUILD: 'Kein Charakter in dieser Gilde gefunden.',
    ALREADY_SIGNED_UP: 'Du bist mit diesem Charakter bereits angemeldet.',
    SIGNUP_CLOSED: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.',
    NOT_SIGNED_UP:
      "Keine Abmeldung möglich da Du nicht angemeldet bist. Nutze 'Nicht da' um dich als abwesend zu markieren.",
    REASON_REQUIRED:
      'Nach dem Anmeldeschluss ist eine Begründung für die Abmeldung erforderlich.',
    REASON_REQUIRED_SET:
      'Als gesetzter Spieler ist eine Begründung nötig (mind. {min} Zeichen).',
    QUICKJOIN_OK: 'Quickjoin erfolgreich!',
    SIGNUP_OK: 'Anmeldung erfolgreich!',
    SIGNUP_UPDATED: 'Anmeldung aktualisiert!',
    DECLINED_OK: 'Du bist als „nicht da“ markiert.',
    UNREGISTER_OK: 'Abmeldung erfolgreich.',
    BACKEND_FAILED: 'Verbindung zum Backend fehlgeschlagen.',
    CHAR_ASSIGNED: 'Charakter zugeordnet.',
    CHAR_ASSIGNED_UNCLEAR: 'Charakter zugeordnet, aber Gildenstatus unklar.',
    RAID_NOT_FOUND: 'Raid nicht gefunden.',
    CHARACTER_NOT_FOUND: 'Charakter nicht gefunden oder bereits dieser Gilde zugeordnet.',
    ASSIGN_MENU_TITLE:
      '**Du bist Mitglied, aber kein Charakter ist dieser Gilde zugeordnet.**\nWähle einen bestehenden Charakter:',
    ASSIGN_PLACEHOLDER: 'Charakter der Gilde zuordnen…',
    MAIN_CHAR: 'Hauptcharakter',
    TWINK: 'Twink',
    PICK_CHAR_SIGNUP: '**Welchen Charakter möchtest du anmelden?**',
    PICK_CHAR_PLACEHOLDER: 'Charakter auswählen…',
    PICK_CHARS_PLACEHOLDER: 'Charaktere auswählen…',
    RESERVE_ONLY: 'Reserve (nur noch möglich)',
    RESERVE: 'Reserve',
    UNCERTAIN: 'Unklar',
    ATTEND_NORMAL: 'Bin da',
    RESERVE_ONLY_HINT:
      '\n*Nur noch Reserve — Raid ist angekündigt oder der Anmeldeschluss ist vorbei.*',
    RESERVE_ONLY_PLACEHOLDER: 'Nur Reserve…',
    ATTENDANCE_PLACEHOLDER: 'Teilnahme wählen…',
    PUNC_ON_TIME: 'Rechtzeitig',
    PUNC_TIGHT: 'Wird knapp',
    PUNC_LATE: 'Später',
    PUNC_ON_TIME_BTN: '🟢 Rechtzeitig',
    PUNC_TIGHT_BTN: '🟡 Wird knapp',
    PUNC_LATE_BTN: '🕒 Später',
    TYPE_NORMAL: 'Bin da',
    TYPE_RESERVE: 'Reserve',
    TYPE_UNCERTAIN: 'Unklar',
    FORBID_RESERVE: 'Reserve sperren',
    FORBID_RESERVE_ON: '✋ Reserve gesperrt',
    RESERVE_ONLY_BTN: 'Nur Reserve möglich',
    LOCK_SPEC: 'Nur angemeldete Spec',
    FORBID_RESERVE_OPT: 'Reserve verbieten',
    NO_CHAR_SELECTION: 'Keine Charakterauswahl vorhanden. Bitte starte „Anmelden 2“ erneut.',
    FORBIDDEN_RAIDTOOLS: 'Nur Raidleader oder Gildenmeister dürfen RaidTools nutzen.',
    SYNC_OK: 'Discord-Beitrag wurde aktualisiert.',
    SYNC_FAILED: 'Beitrag konnte nicht synchronisiert werden.',
    LEADER_INFO_EMPTY: 'Bitte eine Nachricht eingeben.',
    LEADER_INFO_OK: 'Nachricht wurde an den Raidleader-Kanal gesendet.',
    LEADER_INFO_NO_CHANNEL: 'Für diesen Raid ist kein Raidleader-Kanal hinterlegt.',
    LEADER_INFO_FAILED: 'Nachricht konnte nicht gesendet werden.',
  },
  en: {
    NOT_LINKED:
      'Your Discord account is not linked to RaidFlow yet. Open RaidFlow App Home to connect your account.',
    NOT_GUILD_MEMBER: 'You are not a RaidFlow member of this guild.',
    NO_CHARACTER:
      'No character for this guild. Please create a character in the web app first.',
    NO_CHARACTER_GUILD: 'No character found for this guild.',
    ALREADY_SIGNED_UP: 'You are already signed up with this character.',
    SIGNUP_CLOSED: 'Sign-up is closed or this raid is no longer open.',
    NOT_SIGNED_UP:
      'Cannot withdraw because you are not signed up.',
    REASON_REQUIRED: 'A reason is required for withdrawal after the sign-up deadline.',
    REASON_REQUIRED_SET: 'As a set player, a reason is required (min. {min} characters).',
    QUICKJOIN_OK: 'Quick join successful!',
    SIGNUP_OK: 'Sign-up successful!',
    SIGNUP_UPDATED: 'Sign-up updated!',
    DECLINED_OK: 'You are marked as not attending.',
    UNREGISTER_OK: 'Withdrawal successful.',
    BACKEND_FAILED: 'Connection to the backend failed.',
    CHAR_ASSIGNED: 'Character assigned.',
    CHAR_ASSIGNED_UNCLEAR: 'Character assigned, but guild status is unclear.',
    RAID_NOT_FOUND: 'Raid not found.',
    CHARACTER_NOT_FOUND: 'Character not found or already assigned to this guild.',
    ASSIGN_MENU_TITLE:
      '**You are a member, but no character is assigned to this guild yet.**\nPick an existing character:',
    ASSIGN_PLACEHOLDER: 'Assign character to guild…',
    MAIN_CHAR: 'Main character',
    TWINK: 'Twink',
    PICK_CHAR_SIGNUP: '**Which character do you want to sign up?**',
    PICK_CHAR_PLACEHOLDER: 'Select character…',
    PICK_CHARS_PLACEHOLDER: 'Select characters…',
    RESERVE_ONLY: 'Reserve (only option left)',
    RESERVE: 'Reserve',
    UNCERTAIN: 'Uncertain',
    ATTEND_NORMAL: 'Attending',
    RESERVE_ONLY_HINT:
      '\n*Reserve only — the raid is announced or the sign-up deadline has passed.*',
    RESERVE_ONLY_PLACEHOLDER: 'Reserve only…',
    ATTENDANCE_PLACEHOLDER: 'Choose attendance…',
    PUNC_ON_TIME: 'On time',
    PUNC_TIGHT: 'Might be tight',
    PUNC_LATE: 'Late',
    PUNC_ON_TIME_BTN: '🟢 On time',
    PUNC_TIGHT_BTN: '🟡 Might be tight',
    PUNC_LATE_BTN: '🕒 Late',
    TYPE_NORMAL: 'Attending',
    TYPE_RESERVE: 'Reserve',
    TYPE_UNCERTAIN: 'Uncertain',
    FORBID_RESERVE: 'Block reserve',
    FORBID_RESERVE_ON: '✋ Reserve blocked',
    RESERVE_ONLY_BTN: 'Reserve only',
    LOCK_SPEC: 'Locked to signed spec',
    FORBID_RESERVE_OPT: 'Forbid reserve',
    NO_CHAR_SELECTION: 'No character selection available. Please start sign-up again.',
    FORBIDDEN_RAIDTOOLS: 'Only raid leaders or guild masters may use RaidTools.',
    SYNC_OK: 'Discord post was updated.',
    SYNC_FAILED: 'Could not sync the post.',
    LEADER_INFO_EMPTY: 'Please enter a message.',
    LEADER_INFO_OK: 'Message was sent to the raid leader channel.',
    LEADER_INFO_NO_CHANNEL: 'No raid leader channel is configured for this raid.',
    LEADER_INFO_FAILED: 'Message could not be sent.',
  },
} as const;

export type RaidBotMessageKey = keyof typeof MESSAGES.de;

export function raidBotMessage(locale: RaidBotLocale, key: RaidBotMessageKey): string {
  return MESSAGES[locale][key];
}

export function raidBotErrorMessage(
  locale: RaidBotLocale,
  error: string,
  json?: { profileUrl?: string }
): string {
  switch (error) {
    case 'NOT_LINKED':
      return `❌ ${raidBotMessage(locale, 'NOT_LINKED')}`;
    case 'NOT_GUILD_MEMBER':
      return `❌ ${raidBotMessage(locale, 'NOT_GUILD_MEMBER')}`;
    case 'NO_CHARACTER':
      return json?.profileUrl
        ? `❌ ${raidBotMessage(locale, 'NO_CHARACTER')} ${json.profileUrl}`
        : `❌ ${raidBotMessage(locale, 'NO_CHARACTER')}`;
    case 'ALREADY_SIGNED_UP':
      return `⚠️ ${raidBotMessage(locale, 'ALREADY_SIGNED_UP')}`;
    case 'SIGNUP_CLOSED':
      return `🔒 ${raidBotMessage(locale, 'SIGNUP_CLOSED')}`;
    case 'NOT_SIGNED_UP':
      return `⚠️ ${raidBotMessage(locale, 'NOT_SIGNED_UP')}`;
    default:
      return `❌ ${error}`;
  }
}
