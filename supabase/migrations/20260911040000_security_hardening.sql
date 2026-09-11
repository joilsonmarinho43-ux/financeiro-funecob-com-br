-- FuneCob security hardening
-- Adds tenant-scoped uniqueness for WhatsApp instance names.
-- Does not alter existing rows or application behavior unless a duplicate
-- instance name already exists across organizations.

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_instances_name_ci
  ON public.whatsapp_instances (lower(name));
