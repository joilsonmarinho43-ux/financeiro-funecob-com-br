ALTER TABLE public.billing_settings ADD COLUMN IF NOT EXISTS compact_reminders boolean NOT NULL DEFAULT false;
UPDATE public.billing_settings b SET compact_reminders = true
FROM public.organizations o WHERE o.id = b.organization_id
AND lower(trim(o.name)) IN ('sol da vida', 'sol da vida assistencial', 'funerária sol da vida', 'funeraria sol da vida');

DROP POLICY IF EXISTS "logos_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "logos_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "logos_authenticated_delete" ON storage.objects;
CREATE POLICY "logos_authenticated_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.organization_id::text = (storage.foldername(name))[1]));
CREATE POLICY "logos_authenticated_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.organization_id::text = (storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.organization_id::text = (storage.foldername(name))[1]));
CREATE POLICY "logos_authenticated_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND m.organization_id::text = (storage.foldername(name))[1]));
