-- 1. Revoke public execute on SECURITY DEFINER functions, grant only to authenticated where needed by RLS
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_user_organization_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_collector(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_collector(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_baixa_manual(uuid, date, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2. Restrict storage bucket listing for 'logos' (keep individual file access public)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view logos" ON storage.objects;
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;

-- Allow public READ of individual files (by path), but not LIST of bucket contents
CREATE POLICY "logos_public_select_individual"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'logos' AND name IS NOT NULL);

-- Only authenticated users from the org can upload/update/delete logos
CREATE POLICY "logos_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

CREATE POLICY "logos_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

CREATE POLICY "logos_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'logos');