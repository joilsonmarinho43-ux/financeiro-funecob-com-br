
-- Allow admins to INSERT new organizations (Super Admin panel)
CREATE POLICY "Admins can insert organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to UPDATE any organization (suspend/reactivate, change niche)
CREATE POLICY "Admins can update all organizations"
ON public.organizations FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to DELETE organizations
CREATE POLICY "Admins can delete organizations"
ON public.organizations FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
