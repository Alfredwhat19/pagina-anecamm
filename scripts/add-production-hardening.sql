ALTER TABLE directorio_clubes
ADD COLUMN facebook_publish_lock TEXT;

CREATE INDEX IF NOT EXISTS idx_directorio_clubes_stripe_session_id
ON directorio_clubes(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_directorio_clubes_stripe_subscription_id
ON directorio_clubes(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_directorio_clubes_stripe_customer_id
ON directorio_clubes(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_directorio_clubes_visible_in_directory
ON directorio_clubes(visible_in_directory);
