-- Phase: Lineage tracking — records when a learning was created by refining a near-duplicate.
-- The referenced original learning remains active and decays naturally (provenance, not supersession).

ALTER TABLE learnings ADD COLUMN IF NOT EXISTS refined_from UUID;
