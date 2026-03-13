ALTER TABLE directorio_clubes
ADD COLUMN stripe_subscription_id TEXT;

ALTER TABLE directorio_clubes
ADD COLUMN stripe_customer_id TEXT;

ALTER TABLE directorio_clubes
ADD COLUMN facebook_post_id TEXT;

ALTER TABLE directorio_clubes
ADD COLUMN facebook_publish_status TEXT DEFAULT 'pending';

ALTER TABLE directorio_clubes
ADD COLUMN facebook_published_at DATETIME;

ALTER TABLE directorio_clubes
ADD COLUMN facebook_error TEXT;
