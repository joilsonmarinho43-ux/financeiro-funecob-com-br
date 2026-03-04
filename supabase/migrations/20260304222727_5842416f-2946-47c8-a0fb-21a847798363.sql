
-- Drop the recursive policies on organization_members
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners can manage org members" ON public.organization_members;

-- Recreate with non-recursive policies using auth.uid() directly
CREATE POLICY "Users can view own memberships"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage org members"
  ON public.organization_members
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() AND role = 'owner'
  );
