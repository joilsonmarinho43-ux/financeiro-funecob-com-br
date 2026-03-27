
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS cnpj text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS support_phone text;
