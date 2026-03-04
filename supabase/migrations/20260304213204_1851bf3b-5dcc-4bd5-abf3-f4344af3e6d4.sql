
-- Create storage bucket for organization logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- Allow authenticated users to upload to their org folder
CREATE POLICY "Users can upload org logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = get_user_organization_id(auth.uid())::text);

-- Allow public read
CREATE POLICY "Public can read logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'logos');

-- Allow users to update/delete their org logos
CREATE POLICY "Users can update org logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logos' AND (storage.foldername(name))[1]::uuid = get_user_organization_id(auth.uid()));

CREATE POLICY "Users can delete org logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos' AND (storage.foldername(name))[1]::uuid = get_user_organization_id(auth.uid()));
