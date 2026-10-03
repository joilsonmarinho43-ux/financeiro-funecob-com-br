-- Install only the requested tenant's brand; refuse ambiguous matches.
DO $$
DECLARE
  matches integer;
BEGIN
  SELECT count(*) INTO matches FROM public.organizations
  WHERE lower(trim(name)) IN ('sol da vida', 'sol da vida assistencial', 'funerária sol da vida', 'funeraria sol da vida');
  IF matches > 1 THEN
    RAISE EXCEPTION 'Logo Sol da Vida: mais de uma organização encontrada; identifique o tenant antes de aplicar';
  END IF;
  UPDATE public.organizations
  SET logo_url = 'https://financeiro.funecob.com.br/branding/sol-da-vida.png'
  WHERE lower(trim(name)) IN ('sol da vida', 'sol da vida assistencial', 'funerária sol da vida', 'funeraria sol da vida');
END $$;
