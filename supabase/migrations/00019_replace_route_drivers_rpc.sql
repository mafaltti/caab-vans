-- Atomic replace of route_drivers for a given route.
-- Runs delete + insert in a single transaction so a failed insert
-- does not leave the route with cleared assignments.
CREATE OR REPLACE FUNCTION replace_route_drivers(
  p_route_id uuid,
  p_driver_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM route_drivers WHERE route_id = p_route_id;

  IF array_length(p_driver_ids, 1) IS NOT NULL THEN
    INSERT INTO route_drivers (route_id, driver_id)
    SELECT p_route_id, unnest(p_driver_ids);
  END IF;
END;
$$;
