UPDATE public.whatsapp_instances
SET name = 'Jeova-Unitv-Legada',
    status = 'disconnected',
    updated_at = now()
WHERE id = '7863d311-f83d-434b-96f8-25c7b3805777'::uuid
  AND organization_id = '7187a907-bfeb-4980-bd45-dd9679aa818b'::uuid;

UPDATE public.global_settings
SET value = '', updated_at = now()
WHERE key = 'default_instance_name';

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_instances_name_unique_ci
ON public.whatsapp_instances (lower(name));