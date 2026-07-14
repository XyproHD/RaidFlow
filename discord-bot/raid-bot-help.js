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
      'Add at least one WoW character in the web portal (Profile → Characters). Assign it to your guild if you are a member.',
      '• Use the **exact spelling as in-game** — including special characters and upper/lowercase.',
      '• Your **Battle.net profile must not be set to “Private”**, otherwise RaidFlow cannot find the character via BNet Sync.',
      '• Run **BNet Sync** to match name and realm with Battle.net before saving.',
      '',
      '**3. Sign up**',
      'Click **Quickjoin** (main char, fast) or **Sign up** (with options) on the raid post.',
      '',
      '**Note:** You must be a guild member with raid access, or — if the raid allows guests — be eligible to join via the guest channel.',
    ].join('\n');
  }
  return [
    '**1. RaidFlow mit Discord verbinden**',
    `Melde dich im [RaidFlow-Webportal](${url}) an und verknüpfe dein Discord-Konto mit RaidFlow.`,
    '',
    '**2. Charakter anlegen**',
    'Lege im Webportal mindestens einen WoW-Charakter an (Profil → Charaktere). Ordne ihn deiner Gilde zu, wenn du Mitglied bist.',
    '• **Exakte Schreibweise wie im Spiel** — inklusive Sonderzeichen und Groß-/Kleinschreibung.',
    '• Dein **Battle.net-Profil darf nicht auf „Privat“** gestellt sein, sonst kann RaidFlow den Charakter nicht per BNet Sync finden.',
    '• Nutze **BNet Sync**, um Name und Server mit Battle.net abzugleichen, bevor du speicherst.',
    '',
    '**3. Anmelden**',
    'Klicke am Raid-Beitrag auf **Quickjoin** (Hauptchar, schnell) oder **Anmelden** (mit Optionen).',
    '',
    '**Hinweis:** Zum Anmelden musst du Gildenmitglied mit Raid-Zugang sein oder — wenn der Raid Gäste erlaubt — als Gast über den Gastkanal teilnehmen dürfen.',
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
        '**Quickjoin** — Schnellanmeldung mit deinem Hauptcharakter (Standard-Spec, „Bin da“, rechtzeitig).',
        '',
        '**Anmelden** — Schrittweise Anmeldung:',
        '• Charakter wählen (bei mehreren)',
        '• Spec per Button',
        '• Pünktlichkeit: Rechtzeitig / Wird knapp / Später (bei „Später“ ist eine Notiz Pflicht)',
        '• Teilnahmeart: Bin da → Unklar → Reserve (zyklisch umschaltbar)',
        '• Reserve sperren — verhindert Verschiebung auf Reserve',
        '• Spec sperren — Char wird nur in der gewählten Spec geplant',
        '• Notiz optional (Pflicht bei „Später“)',
        '',
        '**Bearbeiten** — Bestehende Anmeldung ändern (Spec, Pünktlichkeit, Art, Notiz).',
        '',
        '**Abmelden** — Anmeldung zurückziehen (ggf. Begründung nötig).',
        '',
        '**Bin nicht da** — Als abwesend markieren (nur im Raidkanal für Mitglieder; **nicht für Gäste**).',
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
        '**Quickjoin** — Fast sign-up with your main character (default spec, attending, on time).',
        '',
        '**Sign up** — Step-by-step sign-up:',
        '• Pick character (if you have several)',
        '• Spec via buttons',
        '• Punctuality: On time / Might be tight / Late (note required for “Late”)',
        '• Attendance type: Attending → Uncertain → Reserve (cycle with type button)',
        '• Block reserve — prevents being moved to reserve',
        '• Lock spec — character is only considered in the chosen spec',
        '• Note optional (required for “Late”)',
        '',
        '**Edit** — Change an existing sign-up (spec, punctuality, type, note).',
        '',
        '**Withdraw** — Remove your sign-up (reason may be required).',
        '',
        '**Not attending** — Mark yourself absent (raid channel members only; **not available for guests**).',
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
  return ['newcomer', 'signup', 'leaderinfo', 'raidtools'];
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
