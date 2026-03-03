
-- 1. Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  niche TEXT NOT NULL DEFAULT 'funeraria', -- 'funeraria' or 'crediario'
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0ea5e9',
  secondary_color TEXT DEFAULT '#1e293b',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. Create organization_members table (links users to orgs)
CREATE TABLE public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to get user's org id
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 4. Add organization_id to existing tables
ALTER TABLE public.clients ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.plans ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. Drop old RLS policies on clients
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;

-- 6. New org-scoped RLS for clients
CREATE POLICY "Users can view org clients" ON public.clients FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org clients" ON public.clients FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org clients" ON public.clients FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 7. Drop old RLS policies on invoices
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

-- 8. New org-scoped RLS for invoices
CREATE POLICY "Users can view org invoices" ON public.invoices FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org invoices" ON public.invoices FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 9. Drop old RLS policies on plans
DROP POLICY IF EXISTS "Authenticated users can view plans" ON public.plans;
DROP POLICY IF EXISTS "Authenticated users can insert plans" ON public.plans;
DROP POLICY IF EXISTS "Authenticated users can update plans" ON public.plans;
DROP POLICY IF EXISTS "Admins can delete plans" ON public.plans;

-- 10. New org-scoped RLS for plans
CREATE POLICY "Users can view org plans" ON public.plans FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org plans" ON public.plans FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org plans" ON public.plans FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org plans" ON public.plans FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 11. Drop old RLS policies on transactions
DROP POLICY IF EXISTS "Authenticated users can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can delete transactions" ON public.transactions;

-- 12. New org-scoped RLS for transactions
CREATE POLICY "Users can view org transactions" ON public.transactions FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can insert org transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can update org transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Users can delete org transactions" ON public.transactions FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- 13. RLS for organizations
CREATE POLICY "Users can view their org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Owners can update their org" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_organization_id(auth.uid()));

-- 14. RLS for organization_members
CREATE POLICY "Users can view org members" ON public.organization_members FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Owners can manage org members" ON public.organization_members FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid())
    AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role = 'owner'));

-- 15. Update trigger for organizations
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
