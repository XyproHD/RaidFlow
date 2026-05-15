-- Trennung Restoration: Schamane (wow_restoration) vs. Druide (wow_restoration_druid)
UPDATE rf_app_config
SET value = (
  COALESCE(value::jsonb, '{}'::jsonb)
  || jsonb_build_object(
    'wow_restoration', '<:wow_restoration:1491802260022366439>',
    'wow_restoration_druid', '<:wow_restoration_druid:1504851583421251704>'
  )
)::text
WHERE key = 'discord_emojis';
