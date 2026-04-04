
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS temperature text NOT NULL DEFAULT 'frio';
