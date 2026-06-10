
-- Service role tem tudo (já tem por padrão, mas garantimos via policy explícita)
CREATE POLICY "Service role full access to receipts"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'receipts') WITH CHECK (bucket_id = 'receipts');

-- Usuários autenticados leem só recibos da própria org (primeiro segmento do path = organization_id)
CREATE POLICY "Users read receipts from own org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'receipts'
  AND (storage.foldername(name))[1] = public.get_user_organization_id(auth.uid())::text
);
