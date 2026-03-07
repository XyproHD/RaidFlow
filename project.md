RaidFlow
Web Applikation zur Raidverwaltung für WoW TBC Gilden

	Designvorgaben für die UI (Position, Größe, Darstellung, Typografie): siehe UI.md (Abschnitt Designvorgaben).

	- Landing Page (nicht eingeloggt)
		○ Zentraler App-Name "RaidFlow"
		○ Zentraler Login-Button für Discord [Discord.integration]
		○ Leicht dezentraler Button: Discord-Bot dem eigenen Channel/Server hinzufügen [Discord.bot.invite] – nur für Server, auf denen der User **Gründer (Owner)** oder **Manager** (Discord: Administrator bzw. „Server verwalten“ / MANAGE_GUILD) ist [Discord.bot.invite.server_rights]
		○ Schmale Footerbar mit Links: Impressum, Disclaimer

	- After Login
		○ Topbar: "RaidFlow", Burger-Menü, Logout-Button [Auth.logout]
		○ Burger-Menü: Mein Profil; Gildenverwaltung (wenn Rolle RaidFlow-Gildenmeister) [Rights.guildmaster]; Discord Bot einladen; Admin (nur Application-Admins) [Rights.admin]
		○ Zentral: Auflistung der Gilden (Mitgliedschaften auf Discord-Servern die RaidFlow nutzen) [Raid.restriction]
		○ Auflistung aller Raids in Kurzübersicht (Anmeldungen, Steuerungselemente je nach Rechten) [Rights.raidleader], [Rights.raider]

	- Rechteverwaltung (Discord-Rollen)
		○ Gildenverwaltung nur für "RaidFlow-Gildenmeister"
		○ Raidplaner-Funktionen (Neu, Bearbeiten, Setzen, Abschließen) erfordern "RaidFlow-Raidleader"
		○ Raids anzeigen und teilnehmen erfordern "RaidFlow-Raider"; bei Einschränkung zusätzlich "Raidflowgroup-<Group>"
		○ Admin-Menü für Application-Admins (Owner + ernannte Admins; Owner nicht entfernbar)

	- Discord Integration mit Bot und Berechtigungssteuerung über Discord [Discord.integration]
		○ Datenminimierung: Von Discord nur minimal notwendige Daten anfordern und in der App speichern. OAuth-Scopes so gering wie möglich (z. B. nur identify ohne E-Mail). Nicht speichern: E-Mail, Username/Display-Name. Speichern: nur discord_id (User), Server-/Channel-/Rollen-IDs wie im Datenbankschema; Anzeigenamen bei Bedarf zur Laufzeit von der Discord-API abrufen, nicht persistieren.

	- Gilde anlegen / Bot einladen (Bot auf Discord Server hinzufügen) [Discord.bot.invite]; Einladung und Setup nur für User mit Gründer- oder Manager-Rechten auf dem jeweiligen Server [Discord.bot.invite.server_rights]; siehe [DiscordBot.md](DiscordBot.md) Abschnitt 0 (exakte Discord-Prüfung: owner_id, ADMINISTRATOR, MANAGE_GUILD).

	- Eigenes Profil
		○ Anzeige-Modus (Hell/Dunkel) [OwnProfile.Theme] – Auswahl im Profil, Speicherung im User-Profil und per Cookie
		○ Präferierte Raid Tage und Zeiten [OwnProfile.Raidtimes]
			§ Unterscheidung zw. "wahrscheinlich" / "eventuell" [OwnProfile.Raidtimes.timepreferences]
		○ Fokus Werktage oder WE [OwnProfile.Raidtimes.weekpreferences]
		○ Charakters (Name, Gilde, Spec und off Spec) [OwnProfile.Chars]
		○ Übersicht teilgenommene Raids je Dungeon und je Gilde [OwnProfile.Raidstatistik]
		○ Loot je Gilde je Dungeon [OwnProfile.Loottable]
		
	- Gildenprofil (nur RaidFlow-Gildenmeister)
		○ Raidgruppen definieren [Guild.groups] (Bot erstellt Rollen "Raidflowgroup-<Name>"); Anlage neuer Gruppen im Bot (`/raidflow group`) nur für User mit Gründer- oder Manager-Rechten auf dem Server [DiscordBot.md Abschnitt 0]
		○ Übersicht der Chars in der Gilde [Guild.members]
		○ Gruppenzuteilung zu Raidgruppen (über Discord-Rollen mittels Bot) [Discord.Guild.additionalgroups OR Guild.members.groups]
		○ "Lese Channels": Bot liest alle Discord-Channels aus, Dropdown; Gildenmeister wählen Channels in denen der Bot Raid-Threads erstellen darf [Discord.bot.channels.read], [Guild.allowed_thread_channels]; nicht existierende Channels aus Auswahl entfernen [Guild.channel_validation]
		
	- Raidplaner (Neuer Raid) [Raidplaner.New]
		○ Grunddaten [Raidplaner.Data]
			§ Dungeon [Raidplaner.Data.dungeon]
			§ Name [Raidplaner.Data.altname]
			§ Raidleader  [Raidplaner.Data.lead]
			§ Lootmaster  [Raidplaner.Data.Lootmaster]
		○ Mindestbesetzung [Raidplaner.Data.Minimum]
			§ Tank, Melee, Range, Healer  [Raidplaner.Data.Minimum.Roles]
			§ Minimum Spec (z.B. Min FireMage)  [Raidplaner.Data.Minimum.Specs]
		○ Opt. Einschränkung auf Raidgruppe  [Raidplaner.raid.restriction]
		○ Raid Notiz / Bemerkung  [Raidplaner.Data.Note]
		○ Max Teilnehmer  [Raidplaner.Data.maxplayers]
		○ Raidtermin Datum [Raidplaner.Data.date]
		○ DatePicker (analog Outlook Verfügbarkeit)  [Raidplaner.Data.date.picker]
			§ Uhrzeit (horizontal) [16 Uhr - 3 Uhr]   [Raidplaner.Data.date.picker.time]
			§ Potenzielle Teilnehmer (Memberpool) mit Filter (vertikal)   [Guild.Members]
				□ Filter [Guild.Members.Groups.Filter And Guild.Members.Restrictions.Filter]
				□ Gruppiert nach Rolle  [Guild.Members.Roles.Filter]
				□ Verfügbarkeit in der Tabelle [Guild.Members.ownprofiles.Raidtimes]
					® Grün (wahrscheinlich)
					® Orange (eventuell)
			§ Live Aktualisierung zur Mindesbesetzung / Teilnehmer Anzahl [Raidplaner.availible]
		○ "Anmeldung bis" [Raidplaner.data.date.open]
		○ Liste angemeldeter Spieler öffentlich oder nur Raidleader [raidplaner.raid.raiders.visibility]
		○ Anlage eines Discord Threads in einem ausgewählten Channel (aus Gildenverwaltung erlaubte Channels) [Discord.bot.threads]; Channel-Auswahl beim neuen Raid; Prüfung ob Channel noch existiert [Guild.channel_validation]
		○ Weiter Kriterien?
		
	- Raidteilnahme (Member) [Raid.join]
		○ Nur Gildenmember mit Rechten sehen die Gilde und Raids [Raid.restriction]
		○ Anmelden [Raid.join]
			§ Teilnehmen(normal , unsicher, reserve) [raid.join.type]
				□ Wenn normal "Reserve erlauben?" [raid.join.type.allowreserve]
			§ Kommentar für Raidlead (z.B. kann erst 15 Min später) [Raid.note]
			§ Anmeldung nach Anmelden bis --> nur Reserve [raid.data.date.open]
		○ Abmelden [raid.leave]
		○ Übersicht angemeldeter Spieler (je nach Raid Einstellung) [raid.raiders.visibility]
		○ Status Ändern [raid.join.allowreserve]
		○ Übersicht des eigenen Status im Discord Thread "Mein Status:" [Discord.member.raid.status]
		○ Aktualisierung des Discord Threads [Discord.bot.threads.update]
		○ **Discord-Raid-Thread (minimalistisch):** Dungeon, Name, Anmeldungen (Anmeldungen / max_players), fehlende Mindestbesetzung; nur Raids sichtbar, für die der User die nötigen Rollen hat (bei Restrictions); eigener Status; Link „Raid im Browser ansehen“, Link „Raid-Teilnahme im Browser“. Siehe [DiscordBot.md](DiscordBot.md) Abschnitt 4.1.
		○ **Direkte Aufrufe per URL:** Raid ansehen und Raid-Teilnahme sollen direkt über stabile URLs aufrufbar sein (z. B. …/guild/&lt;guildId&gt;/raid/&lt;raidId&gt; und …/raid/&lt;raidId&gt;/signup). Die **Berechtigungsprüfung** (Login, RaidFlow-Raider, ggf. Raidflowgroup) erfolgt **bei jedem Aufruf** in der Webapp – die URL darf die Prüfung **nicht umgehen**; bei fehlender Berechtigung Redirect oder Fehlerseite. [Raid.url.view], [Raid.url.signup]
		
	- Raidplaner (Bearbeiten)
		○ Grunddaten ändern [raid.data]
		○ Auswahlfeld aus dem Pool der gesetzten Spieler [Raidplaner.Data.lead.raider.select], [Raidplaner.Data.raider.select]
			§ Raidleader [Raidplaner.Data.lead.raider.select]
			§ Lootmeister [Raidplaner.Data.raider.select]
		○ Termin verschieben (alle Anmeldungen resettet)  [raid.data.date.new]
		○ Termin absagen [raid.status]
		○ Übersicht aller Anmeldungen / Filter Optionen [raid.members.list]
			§ Spalten nach "normal, unsicher, reserve" 
			§ Gruppiert nach Rolle
			§ Anzahl bisheriger Teilnahmen an diesem Dungeon
			§ Hinweis wenn Spieler eine Notiz hinterlegt hat
			§ Anzeige der Notiz bei Mouseover
		○ Funktion zum Einblenden aller Spieler-Notizen [raid.members.list]
		○ Angemeldete Spieler auf "Gesetzt" setzen [raid.members.list]
			§ Aktualisierung der Mindestanforderungen
			§ Manuelles Hinzufügen von Spieler aus dem Gildenpool die nicht angemeldet sind
		○ Raid setzen (Status "fertig"/locked) [Discord.bot.threads.update]
			§ Liste gesetzter Spieler veröffentlichen (wenn Raidoption nicht öffentlich)
			§ Spieler über Discord informieren
			§ Discord Thread aktualisieren
		○ Prüfen ob genügend Anmeldungen vorhanden sind um 2 Gruppen zu starten (2× Max, 2× Min Rollen/Specs)
			§ 2x Maxanzahl
			§ 2x Mindestanzahl je Rolle
			§ 2x Mindestanzahl je Spec
		
	- Raidplaner (abschließen) (Status "Abgeschlossen"/completed)
		○ Ansicht wie bei "Bearbeiten"
		○ Nur "Gesetzte" Spieler bearbeiten möglich
			§ Eingabefeld eines Zählers (0–1, dezimal) je Spieler [RaidCompletion]
		○ Möglichkeit Spieler hinzuzufügen die nicht angemeldet waren (aus dem Gildenpool)
		○ Button "Abschließen"
			§ Status "Abgeschlossen"; alle Spieler bekommen für den Dungeon in der Gilde den Zähler gutgeschrieben [RaidParticipationStats]

	- Admin (Application-Admin)
		○ Gilden löschen [Admin.guilds.delete]
		○ Whitelist oder Blacklist für Discord-Server aktivieren (nur eine davon aktiv; Server erlauben oder aussperren) [Admin.whitelist_blacklist]
		○ Admins ernennen oder entfernen (Discord-ID); Owner (gesonderte Discord-ID) nicht entfernbar [Admin.admins.manage]

	- Änderungsprotokoll (Audit-Log)
		○ Gildeneinstellungen: jede Änderung wird protokolliert (Wer, was, alter Wert, neuer Wert, wann) [Audit.guild_settings]
		○ Raid: angelegt, geändert, gelöscht – jeweils Wer, was, alter/neuer Wert, wann [Audit.raid]
		○ Raid-Teilnahme: Anmeldung und Historie aller Statusänderungen pro Spieler (Wer, was, alter Wert, neuer Wert, wann) [Audit.raid_signup]