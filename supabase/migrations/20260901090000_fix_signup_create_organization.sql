-- FUNecob — corrige o onboarding do primeiro usuário.
--
-- O fluxo anterior criava auth.users, profiles e user_roles, mas não criava
-- organizations/organization_members. Isso deixava o usuário sem tenant e
-- fazia as políticas RLS multiempresa não encontrarem organization_id.
--
-- Esta migration é idempotente e não remove dados existentes.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id UUID;
  v_name TEXT;
  v_slug TEXT;
  v_base_slug TEXT;
  v_suffix INTEGER := 0;
BEGIN
  -- Perfil e papel continuam sendo criados como antes.
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Se o usuário já tiver vínculo, não cria uma segunda organização.
  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_name := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  IF v_name IS NULL THEN
    v_name := split_part(COALESCE(NEW.email, 'empresa'), '@', 1);
  END IF;
  v_name := left(v_name, 120);

  -- Gera slug estável e único sem depender do frontend.
  v_base_slug := lower(regexp_replace(
    translate(v_name, 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^a-z0-9]+', '-', 'g'
  ));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug = '' THEN
    v_base_slug := 'empresa';
  END IF;

  v_slug := left(v_base_slug, 70) || '-' || substr(replace(NEW.id::text, '-', ''), 1, 8);

  -- Evita colisão mesmo que dois cadastros tenham o mesmo nome.
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := left(v_base_slug, 64) || '-' || substr(replace(NEW.id::text, '-', ''), 1, 8) || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, niche, active)
  VALUES (v_name, v_slug, 'funeraria', true)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, NEW.id, 'owner')
  ON CONFLICT (organization_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, postgres;

-- Recria o trigger de forma segura para garantir que a função nova seja usada.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Corrige contas antigas que eventualmente já existam sem organização.
-- Não altera organizações/memberships existentes.
DO $$
DECLARE
  u RECORD;
  v_org_id UUID;
  v_name TEXT;
  v_slug TEXT;
  v_base_slug TEXT;
BEGIN
  FOR u IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om WHERE om.user_id = au.id
    )
  LOOP
    v_name := NULLIF(btrim(COALESCE(u.raw_user_meta_data->>'full_name', '')), '');
    IF v_name IS NULL THEN
      v_name := split_part(COALESCE(u.email, 'empresa'), '@', 1);
    END IF;
    v_name := left(v_name, 120);

    v_base_slug := lower(regexp_replace(
      translate(v_name, 'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
      '[^a-z0-9]+', '-', 'g'
    ));
    v_base_slug := trim(both '-' from v_base_slug);
    IF v_base_slug = '' THEN v_base_slug := 'empresa'; END IF;
    v_slug := left(v_base_slug, 70) || '-' || substr(replace(u.id::text, '-', ''), 1, 8);

    INSERT INTO public.organizations (name, slug, niche, active)
    VALUES (v_name, v_slug, 'funeraria', true)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations WHERE slug = v_slug LIMIT 1;
    END IF;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, u.id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END LOOP;
END
$$;
