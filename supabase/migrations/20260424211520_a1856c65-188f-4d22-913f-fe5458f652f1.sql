-- Allow service role / system to insert webhook logs from gateway receivers
CREATE POLICY "System can insert webhook logs"
ON public.webhook_logs
FOR INSERT
TO service_role
WITH CHECK (true);