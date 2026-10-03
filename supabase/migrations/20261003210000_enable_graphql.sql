CREATE EXTENSION IF NOT EXISTS pg_graphql;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE OR REPLACE FUNCTION graphql_public.graphql(
  "operationName" text DEFAULT NULL, query text DEFAULT NULL,
  variables jsonb DEFAULT NULL, extensions jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
  SELECT graphql.resolve(query := query, variables := coalesce(variables, '{}'),
    "operationName" := "operationName", extensions := extensions);
$$;
GRANT USAGE ON SCHEMA graphql, graphql_public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA graphql TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION graphql_public.graphql(text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION graphql_public.graphql(text,text,jsonb,jsonb) TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
