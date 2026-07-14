/** Guest-channel locale helpers (mirrors lib/discord-raid-bot-locale.ts). */

export function resolveRaidBotLocale(channelId, discordGuestChannelId) {
  const ch = typeof channelId === 'string' ? channelId.trim() : '';
  const guest = typeof discordGuestChannelId === 'string' ? discordGuestChannelId.trim() : '';
  if (ch && guest && ch === guest) return 'en';
  return 'de';
}

const MESSAGES = {
  de: {
    NOT_LINKED:
      'Dein Discord-Konto ist noch nicht mit RaidFlow verknüpft. Nutze die RaidFlow-Startansicht (App Home), um dein Konto zu verbinden.',
    NOT_GUILD_MEMBER: 'Du bist kein RaidFlow-Mitglied dieser Gilde.',
    NO_CHARACTER:
      'Kein Charakter für diese Gilde gefunden. Bitte erst einen Charakter in der WebApp anlegen.',
    ALREADY_SIGNED_UP: 'Du bist bereits angemeldet.',
    SIGNUP_CLOSED: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.',
    NOT_SIGNED_UP:
      "Keine Abmeldung möglich da Du nicht angemeldet bist. Nutze 'Nicht da' um dich als abwesend zu markieren.",
    REASON_REQUIRED:
      'Nach dem Anmeldeschluss ist eine Begründung für die Abmeldung erforderlich.',
    REASON_REQUIRED_SET:
      'Als gesetzter Spieler ist eine Begründung nötig (mind. {min} Zeichen).',
    COMMENT_REQUIRED: 'Als gesetzter Spieler ist eine Begründung nötig (mind. 10 Zeichen).',
    COMMENT_REQUIRED_HINT:
      'Als gesetzter Spieler ist eine kurze Begründung nötig. Bitte klicke auf „Begründung eingeben“.',
    BACKEND_FAILED: 'Verbindung zum Backend fehlgeschlagen.',
    ASSIGN_FAILED: 'Zuordnung fehlgeschlagen.',
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
    RESERVE_ONLY_HINT:
      '\n*Nur noch Reserve — Raid ist angekündigt oder der Anmeldeschluss ist vorbei.*',
    RESERVE_ONLY_PLACEHOLDER: 'Nur Reserve…',
    ATTENDANCE_PLACEHOLDER: 'Teilnahme wählen…',
    PUNC_ON_TIME_BTN: '🟢 Rechtzeitig',
    PUNC_TIGHT_BTN: '🟡 Wird knapp',
    PUNC_LATE_BTN: '🕒 Später',
    TYPE_NORMAL: 'Bin da',
    TYPE_RESERVE: 'Reserve',
    TYPE_UNCERTAIN: 'Unklar',
    TYPE_PREFIX: 'Art',
    FORBID_RESERVE: 'Reserve sperren',
    FORBID_RESERVE_ON: '✋ Reserve gesperrt',
    RESERVE_ONLY_BTN: 'Nur Reserve möglich',
    LOCK_SPEC: '🎯 Spec sperren',
    LOCK_SPEC_ON: '🎯 Nur diese Spec',
    CHAR_ASSIGNED: 'Charakter zugeordnet.',
    CHAR_ASSIGNED_UNCLEAR: 'Charakter zugeordnet, aber Gildenstatus unklar.',
    JOIN_TITLE: 'Anmeldung',
    EDIT_TITLE: 'Anmeldung bearbeiten',
    NOTE_ADD: '📝 Notiz hinzufügen',
    NOTE_EDIT: '📝 Notiz bearbeiten',
    SUBMIT_JOIN: '✅ Anmelden',
    SUBMIT_SAVE: '✅ Speichern',
    LOADING_JOIN: '⏳ Anmeldung wird gesendet …',
    LOADING_EDIT: '⏳ Änderungen werden gesendet …',
    LOADING_JOIN2: '⏳ Anmeldungen werden gesendet …',
    PICK_SPEC: '⚠️ Bitte zuerst eine Spec auswählen.',
    LATE_NOTE_REQUIRED:
      'Bei „Später" ist eine kurze Notiz Pflicht. Bitte klicke auf 📝 Notiz.',
    LATE_NOTE_REQUIRED_EDIT:
      'Bei „Später" ist eine kurze Notiz Pflicht. Bitte klicke auf 📝 Notiz bearbeiten.',
    SET_PLAYER_REASON_EDIT:
      'Als gesetzter Spieler ist bei Reserve oder „Nicht da“ eine Begründung nötig (mind. {min} Zeichen). Bitte 📝 Notiz bearbeiten.',
    SESSION_EXPIRED: '⚠️ Sitzung abgelaufen.',
    SESSION_EXPIRED_JOIN: '⚠️ Sitzung abgelaufen. Bitte erneut auf Anmelden klicken.',
    SESSION_EXPIRED_JOIN2: '⚠️ Sitzung abgelaufen. Bitte erneut auf „Anmelden 2“ klicken.',
    NO_SELECTION: '❌ Keine Auswahl.',
    INVALID_SELECTION: '⚠️ Auswahl ungültig. Bitte erneut versuchen.',
    DECLINE_MODAL_TITLE: 'Nicht da — Begründung',
    DECLINE_REASON_LABEL: 'Begründung (Pflicht als gesetzter Spieler)',
    DECLINE_PLACEHOLDER: 'z. B. kurzfristiger Terminkonflikt …',
    DECLINE_REASON_BTN: 'Begründung eingeben',
    DECLINE_FAIL_DM:
      '⚠️ Deine „Nicht da“-Meldung konnte nicht verarbeitet werden.\n{err}\nBitte versuche es später erneut oder wende dich an einen Raidleader.',
    UNREG_MODAL_TITLE: 'Abmeldung bestätigen',
    UNREG_REASON_SET: 'Begründung (Pflicht als gesetzter Spieler)',
    UNREG_REASON_LATE: 'Begründung (Pflicht nach Anmeldeschluss)',
    UNREG_PLACEHOLDER: 'z. B. Krankheit, Terminkonflikt …',
    UNREG_ALL: 'Alle Anmeldungen abmelden',
    UNREG_PICK: '**Welche Anmeldung möchtest du beenden?**',
    UNREG_PICK_PLACEHOLDER: 'Welche Anmeldung beenden?',
    EDIT_PICK: '**Welche Anmeldung möchtest du bearbeiten?**',
    EDIT_PICK_PLACEHOLDER: 'Welche Anmeldung bearbeiten?',
    NOTE_MODAL_JOIN_TITLE: 'Notiz hinzufügen',
    NOTE_MODAL_EDIT_TITLE: 'Notiz bearbeiten',
    NOTE_MODAL_LABEL: 'Notiz (bei „Später" Pflicht, sonst optional)',
    NOTE_MODAL_PLACEHOLDER: 'z. B. „Ca. 15 Minuten später wegen Arbeit"',
    NOTE_SAVED_JOIN:
      '📝 Notiz gespeichert{detail}. Klicke auf **✅ Anmelden** um fortzufahren.',
    NOTE_SAVED_EDIT:
      '📝 Notiz gespeichert{detail}. Klicke auf **✅ Speichern** um die Änderungen zu übernehmen.',
    NOTE_EMPTY: ' (leer)',
    LEADER_INFO_MODAL_TITLE: 'Info an Raidleader',
    LEADER_INFO_MODAL_LABEL: 'Nachricht (nur Raidleader-Kanal)',
    LEADER_INFO_MODAL_PLACEHOLDER: 'Freitext an den Raidleader-Kanal (nur RL lesen)',
    LEADER_INFO_SENT: 'Nachricht gesendet.',
    FORBIDDEN_RAIDTOOLS: 'Nur Raidleader oder Gildenmeister dürfen RaidTools nutzen.',
    RAIDTOOLS_PLACEHOLDER: 'RaidTools – Funktion wählen',
    RAIDTOOLS_TITLE: '🛠️ **RaidTools** – wähle eine Funktion:',
    RAIDTOOLS_SYNC: 'Beitrag aktualisieren',
    RAIDTOOLS_SYNC_DESC: 'Discord-Beitrag mit dem Backend synchronisieren',
    RAIDTOOLS_PUSH: 'Raid pushen (ohne Erwähnung)',
    RAIDTOOLS_PUSH_DESC: 'Beitrag erneut posten (wieder unten im Channel)',
    RAIDTOOLS_PUSH_MENTION: 'Raid pushen (mit Erwähnung)',
    RAIDTOOLS_PUSH_MENTION_DESC: 'Raider-Rolle erwähnen, dann Beitrag nach unten pushen',
    PUSH_MENTION_MODAL_TITLE: 'Raid pushen (mit Erwähnung)',
    PUSH_MENTION_LABEL: 'Zusatztext (nach @Raider-Rolle)',
    PUSH_MENTION_PLACEHOLDER: 'z. B. Es werden noch mehr Anmeldungen benötigt.',
    PUSH_MENTION_OK: 'Erwähnung gesendet und Raid gepusht.',
    SYNC_OK: 'Discord-Beitrag wurde aktualisiert.',
    DONE: 'Erledigt.',
    NORMAL: 'Normal',
    QUICKJOIN_OK: 'Quickjoin erfolgreich!',
    SIGNUP_OK: 'Anmeldung erfolgreich!',
    SIGNUP_UPDATED: 'Anmeldung aktualisiert!',
    DECLINED_OK: 'Du bist als „nicht da“ markiert.',
    UNREGISTER_OK: 'Abmeldung erfolgreich.',
    NO_ACTIVE_SIGNUP: 'Du hast keine aktive Anmeldung zum Bearbeiten.',
    SIGNUP_COUNT: '{n} Anmeldungen',
    HELP_BTN: 'Hilfe',
    HELP_LANG_TITLE: '**Hilfe — Sprache wählen**',
    HELP_LANG_HINT: 'Standard: {lang}. Du kannst die Sprache vor der Themenauswahl wechseln.',
    HELP_LANG_PLACEHOLDER: 'Sprache wählen…',
    HELP_TOPIC_TITLE: '**Hilfe — Thema wählen**',
    HELP_TOPIC_PLACEHOLDER: 'Thema wählen…',
    LEADER_INFO_UNAVAILABLE: 'ℹ️ **Info an Raidleitung** steht für diesen Raid nicht zur Verfügung (kein Raidleader-Kanal hinterlegt).',
    HELP_SWITCH_LANG_EN: '🌐 English',
    HELP_SWITCH_LANG_DE: '🌐 Deutsch',
    HELP_BACK: '← Zurück',
    HELP_TOPIC_NEWCOMER: 'Erste Schritte',
    HELP_TOPIC_SIGNUP: 'Anmeldung',
    HELP_TOPIC_LEADER: 'Info RL',
    HELP_TOPIC_TOOLS: 'RaidTools',
    RAIDTOOLS_LOADING: '⏳ Wird ausgeführt …',
    CO_INTRO:
      '**Charakter anlegen**\n\nDu hast noch keinen Charakter für diese Gilde. Bevor du dich anmelden kannst, lege bitte deinen WoW-Charakter an.',
    CO_NO_REALM:
      '❌ **RaidFlow-Setup unvollständig**\n\nDer Gildenleiter hat das RaidFlow-Setup noch nicht abgeschlossen (WoW-Server/Realm fehlt). Bitte wende dich an die Gildenleitung.',
    CO_STATUS_INTRO: '📋 **Status:** Bereit — bitte Charakternamen eingeben.',
    CO_STATUS_BNET: '⏳ **Status:** Battle.net-Abgleich läuft für `{name}` …',
    CO_STATUS_SPEC: '✅ **Status:** `{name}` gefunden ({className}, Level {level}). Bitte Specs wählen.',
    CO_STATUS_CREATING: '⏳ **Status:** Charakter wird angelegt …',
    CO_STATUS_DONE: '✅ **Status:** Charakter `{name}` angelegt.',
    CO_BTN_NAME: 'Charakternamen eingeben',
    CO_BTN_RETRY: 'Namen korrigieren',
    CO_BTN_CANCEL: 'Abbrechen',
    CO_BTN_CONFIRM: 'Charakter anlegen',
    CO_MODAL_TITLE: 'Charaktername',
    CO_MODAL_LABEL: 'Name (exakt wie im Spiel)',
    CO_MODAL_PLACEHOLDER: 'z. B. Thrall',
    CO_NAME_HINT: '*Der Name muss **exakt** so heißen wie dein Charakter im Spiel (Groß-/Kleinschreibung beachten).*',
    CO_MAIN_SPEC: 'Main Spec (Pflicht)',
    CO_OFF_SPEC: 'Off Spec (optional)',
    CO_OFF_NONE: 'Keine Off Spec',
    CO_MAIN_PLACEHOLDER: 'Main Spec wählen…',
    CO_OFF_PLACEHOLDER: 'Off Spec wählen…',
    CO_PICK_MAIN: '⚠️ Bitte zuerst eine Main Spec wählen.',
    CO_BNET_FAIL_TITLE: '❌ **Battle.net-Abgleich fehlgeschlagen**',
    CO_BNET_FAIL_HINTS:
      '**Mögliche Ursachen:**\n• Tippfehler im Charakternamen\n• Charakter steht auf einem anderen Realm\n• Battle.net-Profil ist auf **privat** gestellt\n• Charakter existiert nicht oder ist unter Level 55\n• Battle.net-API vorübergehend nicht erreichbar',
    CO_BNET_FAIL_DETAIL: '\n\n*Details: {detail}*',
    CO_CREATE_FAIL: '❌ Charakter konnte nicht angelegt werden: {detail}',
    CO_CANCELLED: 'Charakter-Anlage abgebrochen.',
    CO_SESSION_EXPIRED: '⚠️ Sitzung abgebrochen. Bitte erneut über Quickjoin, Anmelden oder Optionen → Charakter anlegen starten.',
    CO_EMPTY_NAME: '⚠️ Bitte einen gültigen Charakternamen eingeben.',
    OPTIONS_BTN: 'Optionen',
    OPTIONS_TITLE: '⚙️ **Optionen** – wähle eine Aktion:',
    OPTIONS_RAID_TOOLS: 'RaidTools',
    OPTIONS_ADD_CHAR: 'Charakter anlegen',
  },
  en: {
    NOT_LINKED:
      'Your Discord account is not linked to RaidFlow yet. Open RaidFlow App Home to connect your account.',
    NOT_GUILD_MEMBER: 'You are not a RaidFlow member of this guild.',
    NO_CHARACTER:
      'No character for this guild. Please create a character in the web app first.',
    ALREADY_SIGNED_UP: 'You are already signed up.',
    SIGNUP_CLOSED: 'Sign-up is closed or this raid is no longer open.',
    NOT_SIGNED_UP: 'Cannot withdraw because you are not signed up.',
    REASON_REQUIRED: 'A reason is required for withdrawal after the sign-up deadline.',
    REASON_REQUIRED_SET: 'As a set player, a reason is required (min. {min} characters).',
    COMMENT_REQUIRED: 'As a set player, a reason is required (min. 10 characters).',
    COMMENT_REQUIRED_HINT:
      'As a set player, a short reason is required. Please click “Enter reason”.',
    BACKEND_FAILED: 'Connection to the backend failed.',
    ASSIGN_FAILED: 'Assignment failed.',
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
    RESERVE_ONLY_HINT:
      '\n*Reserve only — the raid is announced or the sign-up deadline has passed.*',
    RESERVE_ONLY_PLACEHOLDER: 'Reserve only…',
    ATTENDANCE_PLACEHOLDER: 'Choose attendance…',
    PUNC_ON_TIME_BTN: '🟢 On time',
    PUNC_TIGHT_BTN: '🟡 Might be tight',
    PUNC_LATE_BTN: '🕒 Late',
    TYPE_NORMAL: 'Attending',
    TYPE_RESERVE: 'Reserve',
    TYPE_UNCERTAIN: 'Uncertain',
    TYPE_PREFIX: 'Type',
    FORBID_RESERVE: 'Block reserve',
    FORBID_RESERVE_ON: '✋ Reserve blocked',
    RESERVE_ONLY_BTN: 'Reserve only',
    LOCK_SPEC: '🎯 Lock spec',
    LOCK_SPEC_ON: '🎯 Locked to signed spec',
    CHAR_ASSIGNED: 'Character assigned.',
    CHAR_ASSIGNED_UNCLEAR: 'Character assigned, but guild status is unclear.',
    JOIN_TITLE: 'Sign-up',
    EDIT_TITLE: 'Edit sign-up',
    NOTE_ADD: '📝 Add note',
    NOTE_EDIT: '📝 Edit note',
    SUBMIT_JOIN: '✅ Sign up',
    SUBMIT_SAVE: '✅ Save',
    LOADING_JOIN: '⏳ Sending sign-up…',
    LOADING_EDIT: '⏳ Sending changes…',
    LOADING_JOIN2: '⏳ Sending sign-ups…',
    PICK_SPEC: '⚠️ Please select a spec first.',
    LATE_NOTE_REQUIRED:
      'A short note is required when selecting “Late”. Please click 📝 Note.',
    LATE_NOTE_REQUIRED_EDIT:
      'A short note is required when selecting “Late”. Please click 📝 Edit note.',
    SET_PLAYER_REASON_EDIT:
      'As a set player, a reason is required for reserve or not attending (min. {min} characters). Please use 📝 Edit note.',
    SESSION_EXPIRED: '⚠️ Session expired.',
    SESSION_EXPIRED_JOIN: '⚠️ Session expired. Please click Sign up again.',
    SESSION_EXPIRED_JOIN2: '⚠️ Session expired. Please click Sign up again.',
    NO_SELECTION: '❌ No selection.',
    INVALID_SELECTION: '⚠️ Invalid selection. Please try again.',
    DECLINE_MODAL_TITLE: 'Not attending — reason',
    DECLINE_REASON_LABEL: 'Reason (required as set player)',
    DECLINE_PLACEHOLDER: 'e.g. short-notice schedule conflict…',
    DECLINE_REASON_BTN: 'Enter reason',
    DECLINE_FAIL_DM:
      '⚠️ Your “not attending” message could not be processed.\n{err}\nPlease try again later or contact a raid leader.',
    UNREG_MODAL_TITLE: 'Confirm withdrawal',
    UNREG_REASON_SET: 'Reason (required as set player)',
    UNREG_REASON_LATE: 'Reason (required after sign-up deadline)',
    UNREG_PLACEHOLDER: 'e.g. illness, schedule conflict…',
    UNREG_ALL: 'Withdraw all sign-ups',
    UNREG_PICK: '**Which sign-up do you want to end?**',
    UNREG_PICK_PLACEHOLDER: 'Which sign-up to end?',
    EDIT_PICK: '**Which sign-up do you want to edit?**',
    EDIT_PICK_PLACEHOLDER: 'Which sign-up to edit?',
    NOTE_MODAL_JOIN_TITLE: 'Add note',
    NOTE_MODAL_EDIT_TITLE: 'Edit note',
    NOTE_MODAL_LABEL: 'Note (required for “Late”, otherwise optional)',
    NOTE_MODAL_PLACEHOLDER: 'e.g. “About 15 minutes late due to work”',
    NOTE_SAVED_JOIN:
      '📝 Note saved{detail}. Click **✅ Sign up** to continue.',
    NOTE_SAVED_EDIT:
      '📝 Note saved{detail}. Click **✅ Save** to apply changes.',
    NOTE_EMPTY: ' (empty)',
    LEADER_INFO_MODAL_TITLE: 'Info @ Raid lead',
    LEADER_INFO_MODAL_LABEL: 'Message (raid leader channel only)',
    LEADER_INFO_MODAL_PLACEHOLDER: 'Free text to the raid leader channel (RL only)',
    LEADER_INFO_SENT: 'Message sent.',
    FORBIDDEN_RAIDTOOLS: 'Only raid leaders or guild masters may use RaidTools.',
    RAIDTOOLS_PLACEHOLDER: 'RaidTools – choose action',
    RAIDTOOLS_TITLE: '🛠️ **RaidTools** – choose an action:',
    RAIDTOOLS_SYNC: 'Update post',
    RAIDTOOLS_SYNC_DESC: 'Sync Discord post with backend',
    RAIDTOOLS_PUSH: 'Push raid (no mention)',
    RAIDTOOLS_PUSH_DESC: 'Re-post (moves to bottom of channel)',
    RAIDTOOLS_PUSH_MENTION: 'Push raid (with mention)',
    RAIDTOOLS_PUSH_MENTION_DESC: 'Mention raider role, then push post',
    PUSH_MENTION_MODAL_TITLE: 'Push raid (with mention)',
    PUSH_MENTION_LABEL: 'Additional text (after @raider role)',
    PUSH_MENTION_PLACEHOLDER: 'e.g. More sign-ups are still needed.',
    PUSH_MENTION_OK: 'Mention sent and raid pushed.',
    SYNC_OK: 'Discord post was updated.',
    DONE: 'Done.',
    NORMAL: 'Normal',
    SIGNUP_COUNT: '{n} sign-ups',
    QUICKJOIN_OK: 'Quick join successful!',
    SIGNUP_OK: 'Sign-up successful!',
    SIGNUP_UPDATED: 'Sign-up updated!',
    DECLINED_OK: 'You are marked as not attending.',
    UNREGISTER_OK: 'Withdrawal successful.',
    NO_ACTIVE_SIGNUP: 'You have no active sign-up to edit.',
    HELP_BTN: 'Help',
    HELP_LANG_TITLE: '**Help — choose language**',
    HELP_LANG_HINT: 'Default: {lang}. You can switch language before picking a topic.',
    HELP_LANG_PLACEHOLDER: 'Choose language…',
    HELP_TOPIC_TITLE: '**Help — choose a topic**',
    HELP_TOPIC_PLACEHOLDER: 'Choose topic…',
    LEADER_INFO_UNAVAILABLE: 'ℹ️ **Info @ Raid lead** is not available for this raid (no raid leader channel configured).',
    HELP_SWITCH_LANG_EN: '🌐 English',
    HELP_SWITCH_LANG_DE: '🌐 Deutsch',
    HELP_BACK: '← Back',
    HELP_TOPIC_NEWCOMER: 'Getting started',
    HELP_TOPIC_SIGNUP: 'Sign-up',
    HELP_TOPIC_LEADER: 'Info RL',
    HELP_TOPIC_TOOLS: 'RaidTools',
    RAIDTOOLS_LOADING: '⏳ Running …',
    CO_INTRO:
      '**Create character**\n\nYou do not have a character for this guild yet. Please add your WoW character before signing up.',
    CO_NO_REALM:
      '❌ **RaidFlow setup incomplete**\n\nThe guild master has not finished RaidFlow setup (WoW realm missing). Please contact your guild leadership.',
    CO_STATUS_INTRO: '📋 **Status:** Ready — please enter your character name.',
    CO_STATUS_BNET: '⏳ **Status:** Checking Battle.net for `{name}` …',
    CO_STATUS_SPEC: '✅ **Status:** Found `{name}` ({className}, level {level}). Please choose specs.',
    CO_STATUS_CREATING: '⏳ **Status:** Creating character …',
    CO_STATUS_DONE: '✅ **Status:** Character `{name}` created.',
    CO_BTN_NAME: 'Enter character name',
    CO_BTN_RETRY: 'Correct name',
    CO_BTN_CANCEL: 'Cancel',
    CO_BTN_CONFIRM: 'Create character',
    CO_MODAL_TITLE: 'Character name',
    CO_MODAL_LABEL: 'Name (exactly as in-game)',
    CO_MODAL_PLACEHOLDER: 'e.g. Thrall',
    CO_NAME_HINT: '*The name must match your in-game character **exactly** (including capitalization).*',
    CO_MAIN_SPEC: 'Main spec (required)',
    CO_OFF_SPEC: 'Off spec (optional)',
    CO_OFF_NONE: 'No off spec',
    CO_MAIN_PLACEHOLDER: 'Choose main spec…',
    CO_OFF_PLACEHOLDER: 'Choose off spec…',
    CO_PICK_MAIN: '⚠️ Please select a main spec first.',
    CO_BNET_FAIL_TITLE: '❌ **Battle.net lookup failed**',
    CO_BNET_FAIL_HINTS:
      '**Possible causes:**\n• Typo in the character name\n• Character is on a different realm\n• Battle.net profile is set to **private**\n• Character does not exist or is below level 55\n• Battle.net API temporarily unavailable',
    CO_BNET_FAIL_DETAIL: '\n\n*Details: {detail}*',
    CO_CREATE_FAIL: '❌ Could not create character: {detail}',
    CO_CANCELLED: 'Character creation cancelled.',
    CO_SESSION_EXPIRED: '⚠️ Session expired. Start again via Quick join, Sign up, or Options → Add character.',
    CO_EMPTY_NAME: '⚠️ Please enter a valid character name.',
    OPTIONS_BTN: 'Options',
    OPTIONS_TITLE: '⚙️ **Options** – choose an action:',
    OPTIONS_RAID_TOOLS: 'Raid Tools',
    OPTIONS_ADD_CHAR: 'Add Character',
  },
};

export function raidBotMessage(locale, key, vars = {}) {
  const lang = locale === 'en' ? 'en' : 'de';
  let text = MESSAGES[lang][key] ?? MESSAGES.de[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

export function raidBotLocaleFromInteraction(interaction, state) {
  return resolveRaidBotLocale(interaction?.channelId, state?.discordGuestChannelId);
}

export function raidActionErrorText(err, json, locale = 'de') {
  const map = {
    NOT_LINKED: `❌ ${raidBotMessage(locale, 'NOT_LINKED')}`,
    NOT_GUILD_MEMBER: `❌ ${raidBotMessage(locale, 'NOT_GUILD_MEMBER')}`,
    NO_CHARACTER: json?.profileUrl
      ? `❌ ${raidBotMessage(locale, 'NO_CHARACTER')} ${json.profileUrl}`
      : `❌ ${raidBotMessage(locale, 'NO_CHARACTER')}`,
    ALREADY_SIGNED_UP: `⚠️ ${raidBotMessage(locale, 'ALREADY_SIGNED_UP')}`,
    SIGNUP_CLOSED: `🔒 ${raidBotMessage(locale, 'SIGNUP_CLOSED')}`,
    NOT_SIGNED_UP: `⚠️ ${raidBotMessage(locale, 'NOT_SIGNED_UP')}`,
    REASON_REQUIRED: `⚠️ ${raidBotMessage(locale, 'REASON_REQUIRED')}`,
    COMMENT_REQUIRED: `⚠️ ${raidBotMessage(locale, 'COMMENT_REQUIRED')}`,
  };
  return map[err] ?? `❌ ${locale === 'en' ? 'Error' : 'Fehler'}: ${String(err)}`;
}

export function raidToolsErrorText(err, locale = 'de') {
  const map = {
    FORBIDDEN: `❌ ${raidBotMessage(locale, 'FORBIDDEN_RAIDTOOLS')}`,
    SYNC_FAILED: `❌ ${raidBotMessage(locale, 'SYNC_OK').replace('updated', 'not synced')}`,
    MESSAGE_EMPTY: `❌ ${raidBotMessage(locale, 'LEADER_INFO_MODAL_PLACEHOLDER')}`,
    NOT_LINKED: raidActionErrorText('NOT_LINKED', undefined, locale),
  };
  return map[err] ?? `❌ ${locale === 'en' ? 'Error' : 'Fehler'}: ${String(err)}`;
}

export function puncLabels(locale) {
  return {
    on_time: raidBotMessage(locale, 'PUNC_ON_TIME_BTN'),
    tight: raidBotMessage(locale, 'PUNC_TIGHT_BTN'),
    late: raidBotMessage(locale, 'PUNC_LATE_BTN'),
  };
}

export function typeLabels(locale) {
  return {
    normal: raidBotMessage(locale, 'TYPE_NORMAL'),
    reserve: raidBotMessage(locale, 'TYPE_RESERVE'),
    uncertain: raidBotMessage(locale, 'TYPE_UNCERTAIN'),
  };
}

export function botLocale(interaction, ctx) {
  const guestId =
    ctx?.discordGuestChannelId ??
    ctx?.state?.discordGuestChannelId ??
    (typeof ctx === 'object' && ctx !== null && 'locale' in ctx ? null : null);
  if (ctx?.locale === 'en' || ctx?.locale === 'de') return ctx.locale;
  return resolveRaidBotLocale(interaction?.channelId, guestId);
}

export function flowLocale(flow, interaction, ctx) {
  return flow?.locale ?? botLocale(interaction, ctx);
}
