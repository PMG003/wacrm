-- Fix: infinite recursion in organization_members RLS policies.
-- The old policies queried organization_members *inside* a policy on
-- organization_members, causing PostgreSQL to recurse infinitely.
-- Solution: use SECURITY DEFINER functions which bypass RLS.

-- Admin-check helper (SECURITY DEFINER → bypasses RLS, no recursion)
CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
$$;

-- Replace the recursive policies
DROP POLICY IF EXISTS "Members can view their org members" ON organization_members;
DROP POLICY IF EXISTS "Owners can manage members" ON organization_members;

-- SELECT: any member can see others in their org
CREATE POLICY "Members can view their org members" ON organization_members
  FOR SELECT USING (org_id = public.org_id());

-- ALL: admins/owners can insert, update, delete members in their org
CREATE POLICY "Owners can manage members" ON organization_members
  FOR ALL USING (public.is_org_admin() AND org_id = public.org_id());
