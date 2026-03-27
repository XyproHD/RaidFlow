-- TBC Dungeons & Raids für RaidFlow (Preview-DB)
-- Reset EU: weekly = Mittwoch 04:00 UTC; daily = 07:00 UTC (Server); per_run = beim Verlassen
-- Addons: AtlasLoot, InstanceID, Atlas (DungeonLoot) listen Instanzen

-- Raids (10/25), weekly reset Wed 04:00 UTC
INSERT INTO rf_dungeon (id, name, expansion, instance_type, max_players, reset_type, reset_weekday, reset_time_utc, addon_names) VALUES
  ('a1000001-0000-4000-8000-000000000001', 'Karazhan', 'TBC', 'raid', 10, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000002', 'Zul''Aman', 'TBC', 'raid', 10, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000003', 'Magtheridon''s Lair', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000004', 'Serpentshrine Cavern', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000005', 'Tempest Keep: The Eye', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000006', 'Gruul''s Lair', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000007', 'Hyjal Summit', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000008', 'Black Temple', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000009', 'Sunwell Plateau', 'TBC', 'raid', 25, 'weekly', 3, '04:00', '["AtlasLoot","InstanceID","Atlas"]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  expansion = EXCLUDED.expansion,
  instance_type = EXCLUDED.instance_type,
  max_players = EXCLUDED.max_players,
  reset_type = EXCLUDED.reset_type,
  reset_weekday = EXCLUDED.reset_weekday,
  reset_time_utc = EXCLUDED.reset_time_utc,
  addon_names = EXCLUDED.addon_names;

-- Dungeons (5), daily reset 07:00 UTC (Heroic) / per_run (Normal)
INSERT INTO rf_dungeon (id, name, expansion, instance_type, max_players, reset_type, reset_weekday, reset_time_utc, addon_names) VALUES
  ('a1000001-0000-4000-8000-000000000011', 'Hellfire Ramparts', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000012', 'The Blood Furnace', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000013', 'The Shattered Halls', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000014', 'The Slave Pens', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000015', 'The Underbog', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000016', 'The Steam Vault', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000017', 'Mana-Tombs', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000018', 'Auchenai Crypts', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000019', 'Sethekk Halls', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001a', 'Shadow Labyrinth', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001b', 'Old Hillsbrad Foothills', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001c', 'The Black Morass', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001d', 'The Mechanar', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001e', 'The Botanica', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-00000000001f', 'The Arcatraz', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]'),
  ('a1000001-0000-4000-8000-000000000020', 'Magister''s Terrace', 'TBC', 'dungeon', 5, 'daily', NULL, '07:00', '["AtlasLoot","InstanceID","Atlas"]')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  expansion = EXCLUDED.expansion,
  instance_type = EXCLUDED.instance_type,
  max_players = EXCLUDED.max_players,
  reset_type = EXCLUDED.reset_type,
  reset_weekday = EXCLUDED.reset_weekday,
  reset_time_utc = EXCLUDED.reset_time_utc,
  addon_names = EXCLUDED.addon_names;
