ALTER TABLE directorio_clubes 
ADD COLUMN facebook_publish_lock TEXT;

CREATE INDEX IF NOT EXISTS idx_stripe_session 
ON directorio_clubes(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_stripe_subscription 
ON directorio_clubes(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_stripe_customer 
ON directorio_clubes(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_visible_directory 
ON directorio_clubes(visible_in_directory);