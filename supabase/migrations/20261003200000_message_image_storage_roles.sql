-- Storage connects as this role and explicitly switches to JWT roles.
GRANT anon, authenticated, service_role TO supabase_storage_admin;

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS message_image_url text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS message_image_enabled boolean NOT NULL DEFAULT true;
