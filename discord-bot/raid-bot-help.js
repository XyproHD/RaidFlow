/** Raid signup help texts (DE/EN). */

function webPortalUrl(locale) {
  const base = (process.env.WEBAPP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/${locale === 'en' ? 'en' : 'de'}`;
}

function buildNewcomerBody(locale) {
  const url = webPortalUrl(locale);
  if (locale === 'en') {
    return [
      '**1. Connect RaidFlow to Discord**',
      `Sign in at the [RaidFlow web portal](${url}) and link your Discord account to RaidFlow.`,
      '',
      '**2. Create a character**',
      '**Web portal:** Profile → Characters — exact in-game name, BNet Sync, specs.',
      '**Discord (on the raid post):** **Options** → **Add character** — same BNet flow, no sign-up afterward.',
      'If you click **Quick join** or **Sign up** without a character yet, the bot starts the same creation flow and continues with sign-up when done.',
      '',
      '• Use the **exact spelling as in-game** — including special characters and upper/lowercase.',
      '• Your **Battle.net profile must not be set to “Private”**, otherwise RaidFlow cannot find the character.',
      '',
      '**3. Sign up**',
      'Click **Quick join** (main char when set, otherwise pick from a list) or **Sign up** (with options) on the raid post.',
      '',
      '**Note:** You must be a guild member with raid access, or — if the raid allows guests — be eligible to join via the guest channel.',
    ].join('\n');
  }
  return [
    '**1. RaidFlow mit Discord verbinden**',
    `Melde dich im [RaidFlow-Webportal](${url}) an und verknüpfe dein Discord-Konto mit RaidFlow.`,
    '',
    '**2. Charakter anlegen**',
    '**Webportal:** Profil → Charaktere — exakter Name, BNet Sync, Specs.',
    '**Discord (am Raid-Beitrag):** **Optionen** → **Charakter anlegen** — gleicher BNet-Ablauf, danach **keine** automatische Anmeldung.',
    'Klickst du **Quickjoin** oder **Anmelden** ohne Charakter, startet der Bot denselben Anlage-Flow und meldet dich danach an.',
    '',
    '• **Exakte Schreibweise wie im Spiel** — inklusive Sonderzeichen und Groß-/Kleinschreibung.',
    '• Dein **Battle.net-Profil darf nicht auf „Privat“** stehen.',
    '',
    '**3. Anmelden**',
    'Am Raid-Beitrag **Quickjoin** (Hauptchar, wenn gesetzt — sonst Auswahl) oder **Anmelden** (mit Optionen).',
    '',
    '**Hinweis:** Gildenmitglied mit Raid-Zugang oder — bei Gast-Raids — berechtigt über den Gastkanal.',
  ].join('\n');
}

const TOPICS = {
  de: {
    newcomer: {
      label: 'Erste Schritte / Neulinge',
      description: 'Konto verknüpfen, Charakter anlegen',
      title: '🆕 Erste Schritte',
      body: '',
    },
    signup: {
      label: 'Anmelde-Anleitung',
      description: 'Buttons, Optionen und Ablauf',
      title: '📋 Anmelde-Anleitung',
      body: [
        '**Quickjoin** — Schnellanmeldung (Standard-Spec, „Bin da“, rechtzeitig):',
        '• Mit **Hauptcharakter** → dieser Char.',
        '• **Mehrere Chars ohne Hauptcharakter** → Auswahlmenü, dann Anmeldung.',
        '• **Noch kein Char** für diese Gilde → Char-Anlage startet; danach Quickjoin.',
        '• Profil-Char existiert, ist aber **nicht der Gilde zugeordnet** → Char der Gilde zuordnen, dann Quickjoin.',
        '',
        '**Anmelden** — Schrittweise Anmeldung:',
        '• Charakter wählen (bei mehreren)',
        '• Spec per Button',
        '• Pünktlichkeit: Rechtzeitig / Wird knapp / Später (bei „Später“ ist eine Notiz Pflicht)',
        '• Teilnahmeart: Bin da → Unklar → Reserve (zyklisch umschaltbar)',
        '• Reserve sperren — verhindert Verschiebung auf Reserve',
        '• Spec sperren — Char wird nur in der gewählten Spec geplant',
        '• Notiz optional (Pflicht bei „Später“)',
        '• Ohne Charakter startet wie Quickjoin der **Anlage-Dialog** (mit Anmeldung danach).',
        '',
        '**Bearbeiten** — Bestehende Anmeldung ändern (Spec, Pünktlichkeit, Art, Notiz).',
        '',
        '**Abmelden** — Anmeldung vollständig entfernen (ggf. Begründung nötig).',
        '',
        '**Bin nicht da** — Als abwesend markieren (nur im Raidkanal für Mitglieder; **nicht für Gäste**).',
        '',
        '**Optionen** — Weitere Aktionen (siehe Hilfe-Thema „Optionen“):',
        '• **RaidTools** (nur Raidleader/Gildenmeister)',
        '• **Charakter anlegen** ohne direkte Anmeldung',
        '',
        '**Hilfe** — Diese Anleitung (Sprache wählbar).',
      ].join('\n'),
    },
    options: {
      label: 'Optionen',
      description: 'RaidTools, Char anlegen',
      title: '⚙️ Optionen',
      body: [
        'Am Raid-Beitrag **Optionen** (Mitgliederkanal) bzw. **Options** (Gastkanal) öffnet ein Menü:',
        '',
        '**RaidTools** — Nur für Raidleader und Gildenmeister:',
        '• **Beitrag aktualisieren** — Discord-Beitrag mit RaidFlow synchronisieren',
        '• **Raid pushen** — Beitrag erneut posten (nach unten im Kanal)',
        '• **Raid pushen (mit Erwähnung)** — Raider-Rolle erwähnen, dann pushen',
        '',
        '**Charakter anlegen** — WoW-Charakter per Battle.net anlegen:',
        '• Gleicher Ablauf wie bei Anmelden ohne Char (Name → BNet → Specs)',
        '• **Keine** automatische Anmeldung danach',
        '• Hast du bereits Chars in der Gilde, werden sie zuerst aufgelistet',
        '• Für Gäste: Chars gehören zur Raid-Gilde; oft kein „Hauptchar“ — dann bei Quickjoin Char wählen oder **Anmelden** nutzen',
      ].join('\n'),
    },
    leaderinfo: {
      label: 'Info an Raidleitung',
      description: 'Nachricht an RL-Kanal',
      title: '🟡 Info an Raidleitung',
      body: [
        'Mit **Info @ Raidlead** sendest du eine private Nachricht an den Raidleader-Kanal dieses Raids.',
        '',
        '**Wann verfügbar?**',
        'Nur wenn für den Raid ein Raidleader-Kanal hinterlegt ist. Sonst ist die Funktion deaktiviert.',
        '',
        '**Wofür?**',
        'Kurze Infos, Fragen oder Hinweise an die Raidleitung — z. B. Verspätung, Sonderwünsche oder Rückfragen zum Raid.',
        '',
        'Die Nachricht ist nur für Raidleader sichtbar, nicht im öffentlichen Raidkanal.',
      ].join('\n'),
    },
    raidtools: {
      label: 'RaidTools (Raidleader)',
      description: 'Sync, Push, Erwähnung',
      title: '🛠️ RaidTools',
      body: [
        '**RaidTools** steht nur Raidleadern und Gildenmeistern zur Verfügung.',
        'Am Raid-Beitrag: **Optionen** → **RaidTools**.',
        '',
        '**Beitrag aktualisieren** — Synchronisiert den Discord-Beitrag mit dem aktuellen Stand aus RaidFlow (Anmeldungen, Kader, Status).',
        '',
        '**Raid pushen (ohne Erwähnung)** — Postet den Raid-Beitrag erneut (erscheint wieder unten im Kanal).',
        '',
        '**Raid pushen (mit Erwähnung)** — Erwähnt die Raider-Rolle mit optionalem Zusatztext, danach wird der Beitrag nach unten gepusht.',
        '',
        'Nutze Push sparsam, um den Kanal nicht zu überfluten.',
      ].join('\n'),
    },
  },
  en: {
    newcomer: {
      label: 'Getting started',
      description: 'Link account, create character',
      title: '🆕 Getting started',
      body: '',
    },
    signup: {
      label: 'Sign-up guide',
      description: 'Buttons, options, and flow',
      title: '📋 Sign-up guide',
      body: [
        '**Quick join** — Fast sign-up (default spec, attending, on time):',
        '• With a **main character** → that character.',
        '• **Several characters, no main** → pick from a list, then sign up.',
        '• **No character** for this guild yet → creation flow starts; then quick join.',
        '• Profile character exists but **not assigned to the guild** → assign to guild, then quick join.',
        '',
        '**Sign up** — Step-by-step sign-up:',
        '• Pick character (if you have several)',
        '• Spec via buttons',
        '• Punctuality: On time / Might be tight / Late (note required for “Late”)',
        '• Attendance type: Attending → Uncertain → Reserve (cycle with type button)',
        '• Block reserve — prevents being moved to reserve',
        '• Lock spec — character is only considered in the chosen spec',
        '• Note optional (required for “Late”)',
        '• Without a character, the **creation dialog** starts (sign-up continues when done).',
        '',
        '**Edit** — Change an existing sign-up (spec, punctuality, type, note).',
        '',
        '**Withdraw** — Remove your sign-up completely (reason may be required).',
        '',
        '**Not attending** — Mark yourself absent (raid channel members only; **not for guests**).',
        '',
        '**Options** — More actions (see help topic “Options”):',
        '• **Raid Tools** (raid leaders / guild masters only)',
        '• **Add character** without signing up',
        '',
        '**Help** — This guide (language selectable).',
      ].join('\n'),
    },
    options: {
      label: 'Options',
      description: 'Raid Tools, add character',
      title: '⚙️ Options',
      body: [
        'On the raid post, **Options** opens a menu:',
        '',
        '**Raid Tools** — Raid leaders and guild masters only:',
        '• **Update post** — sync Discord post with RaidFlow',
        '• **Push raid** — re-post (moves to bottom of channel)',
        '• **Push raid (with mention)** — mention raider role, then push',
        '',
        '**Add character** — Create a WoW character via Battle.net:',
        '• Same flow as sign-up without a character (name → BNet → specs)',
        '• **No** automatic sign-up afterward',
        '• If you already have guild characters, they are listed first',
        '• Guests: characters belong to the raid guild; often no “main” — use quick join pick or **Sign up**',
      ].join('\n'),
    },
    leaderinfo: {
      label: 'Info @ Raid lead',
      description: 'Message to RL channel',
      title: '🟡 Info @ Raid lead',
      body: [
        '**Info @ Raid lead** sends a private message to this raid\'s raid leader channel.',
        '',
        '**When available?**',
        'Only when a raid leader channel is configured for this raid. Otherwise the button shows a notice.',
        '',
        '**What for?**',
        'Short info, questions, or notes for raid leaders — e.g. delays, special requests, or raid questions.',
        '',
        'The message is visible to raid leaders only, not in the public raid channel.',
      ].join('\n'),
    },
    raidtools: {
      label: 'RaidTools (leaders)',
      description: 'Sync, push, mention',
      title: '🛠️ RaidTools',
      body: [
        '**RaidTools** is available to raid leaders and guild masters only.',
        'On the raid post: **Options** → **Raid Tools**.',
        '',
        '**Update post** — Syncs the Discord post with the current RaidFlow state (sign-ups, roster, status).',
        '',
        '**Push raid (no mention)** — Re-posts the raid (moves it to the bottom of the channel).',
        '',
        '**Push raid (with mention)** — Mentions the raider role with optional text, then pushes the post down.',
        '',
        'Use push sparingly to avoid flooding the channel.',
      ].join('\n'),
    },
  },
};

export function helpTopicKeys() {
  return ['newcomer', 'signup', 'options', 'leaderinfo', 'raidtools'];
}

export function getHelpTopicContent(locale, topic) {
  const lang = locale === 'en' ? 'en' : 'de';
  if (topic === 'newcomer') {
    const t = TOPICS[lang].newcomer;
    return `${t.title}\n\n${buildNewcomerBody(lang)}`;
  }
  const t = TOPICS[lang][topic] ?? TOPICS.de[topic];
  if (!t) return null;
  return `${t.title}\n\n${t.body}`;
}

export function getHelpTopicOptions(locale) {
  const lang = locale === 'en' ? 'en' : 'de';
  return helpTopicKeys().map((key) => {
    const t = TOPICS[lang][key];
    return { label: t.label, value: key, description: t.description };
  });
}

export function helpLangLabel(locale) {
  return locale === 'en' ? 'English' : 'Deutsch';
}
