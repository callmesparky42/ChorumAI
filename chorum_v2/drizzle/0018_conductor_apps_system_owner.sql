-- Make owner_id nullable so system-owned apps don't require a real user UUID.
-- System apps (chorum-core, chorum-health, midnight-musings) will have owner_id = NULL.

ALTER TABLE conductor_apps ALTER COLUMN owner_id DROP NOT NULL;

UPDATE conductor_apps
SET owner_id = NULL
WHERE slug IN ('chorum-core', 'chorum-health', 'midnight-musings');
