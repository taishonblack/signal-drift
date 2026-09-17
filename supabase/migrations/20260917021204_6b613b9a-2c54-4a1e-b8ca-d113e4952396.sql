CREATE OR REPLACE FUNCTION public.normalize_endpoint_host(_host text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT lower(btrim(COALESCE(_host, '')));
$function$;