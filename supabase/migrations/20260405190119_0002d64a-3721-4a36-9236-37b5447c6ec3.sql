ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS reminder_days_before_2 integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reminder_days_after integer NOT NULL DEFAULT 1;