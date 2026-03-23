-- Allow admins to view ALL organizations (needed for admin panel)
CREATE POLICY "Admins can view all organizations"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view ALL organization members (needed for admin panel)
CREATE POLICY "Admins can view all org members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to view ALL subscriptions (needed for admin panel)
-- Already exists via "Admins can manage subscriptions" policy