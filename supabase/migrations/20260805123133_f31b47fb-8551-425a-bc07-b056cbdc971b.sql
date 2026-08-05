-- Aponta a organização Unitv para a instância real conectada no servidor
UPDATE public.whatsapp_instances
SET name = 'Jeova',
    api_key = '5CFE1F6F-78DA-41AF-B11A-652619B66DC7',
    api_url = 'http://161.97.181.130:8080',
    status = 'connected',
    updated_at = now()
WHERE id = '7863d311-f83d-434b-96f8-25c7b3805777';

-- Corrige a chave da instância Jeova (Sol da Vida) para a chave válida do servidor
UPDATE public.whatsapp_instances
SET api_key = '5CFE1F6F-78DA-41AF-B11A-652619B66DC7',
    api_url = 'http://161.97.181.130:8080',
    status = 'connected',
    updated_at = now()
WHERE id = '3a706d3f-acc9-4cb9-bad0-6a299c9af3d0';

-- Fallback global aponta para a instância existente
UPDATE public.global_settings SET value = 'Jeova' WHERE key = 'default_instance_name';
UPDATE public.global_settings SET value = 'http://161.97.181.130:8080' WHERE key = 'api_host';

-- Destrava mensagens presas em "sending" e reprograma para envio imediato
UPDATE public.whatsapp_queue
SET status = 'queued', scheduled_for = NULL, error_message = NULL
WHERE status = 'sending';

-- Reprograma mensagens de hoje que estavam aguardando com horário já vencido
UPDATE public.whatsapp_queue
SET scheduled_for = NULL
WHERE status IN ('queued','retry') AND scheduled_for < now();