
-- Add user_agent to system_logs
ALTER TABLE public.system_logs ADD COLUMN IF NOT EXISTS user_agent text;

-- Add reminder_date to billing_reminders
ALTER TABLE public.billing_reminders ADD COLUMN IF NOT EXISTS reminder_date date NOT NULL DEFAULT CURRENT_DATE;

-- Backfill reminder_date from created_at for existing records
UPDATE public.billing_reminders SET reminder_date = created_at::date WHERE reminder_date = CURRENT_DATE AND created_at::date != CURRENT_DATE;

-- Delete duplicates keeping earliest
DELETE FROM public.billing_reminders a
USING public.billing_reminders b
WHERE a.invoice_id = b.invoice_id
  AND a.reminder_type = b.reminder_type
  AND a.reminder_date = b.reminder_date
  AND a.id != b.id
  AND a.created_at > b.created_at;

-- Create unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_reminders_one_per_day
ON public.billing_reminders (invoice_id, reminder_type, reminder_date);
