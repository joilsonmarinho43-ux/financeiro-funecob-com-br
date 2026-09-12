-- FuneCob security hardening
-- Defense-in-depth for direct PostgREST access to whatsapp_instances.
--
-- IMPORTANT:
--   These policies are RESTRICTIVE so they are ANDed with existing
--   permissive policies instead of weakening them. They do not change
--   service-role behavior used by trusted Edge Functions.
--
-- This migration intentionally does NOT add a global UNIQUE(name) constraint:
-- existing production data may legitimately contain historical duplicates.

DO $$
BEGIN
  IF to_regclass('public.whatsapp_instances') IS NULL THEN
    RAISE NOTICE 'whatsapp_instances does not exist; skipping security policies';
    RETURN;
  END IF;

  ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'whatsapp_instances_tenant_select'
  ) THEN
    CREATE POLICY whatsapp_instances_tenant_select
      ON public.whatsapp_instances
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        organization_id = public.get_user_organization_id(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'whatsapp_instances_tenant_insert'
  ) THEN
    CREATE POLICY whatsapp_instances_tenant_insert
      ON public.whatsapp_instances
      AS RESTRICTIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (
        organization_id = public.get_user_organization_id(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'whatsapp_instances_tenant_update'
  ) THEN
    CREATE POLICY whatsapp_instances_tenant_update
      ON public.whatsapp_instances
      AS RESTRICTIVE
      FOR UPDATE
      TO authenticated
      USING (
        organization_id = public.get_user_organization_id(auth.uid())
      )
      WITH CHECK (
        organization_id = public.get_user_organization_id(auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'whatsapp_instances_tenant_delete'
  ) THEN
    CREATE POLICY whatsapp_instances_tenant_delete
      ON public.whatsapp_instances
      AS RESTRICTIVE
      FOR DELETE
      TO authenticated
      USING (
        organization_id = public.get_user_organization_id(auth.uid())
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_organization_id
  ON public.whatsapp_instances (organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_organization_status
  ON public.whatsapp_instances (organization_id, status);
