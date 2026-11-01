-- Hand-written migration: security hardening and database-side invariants.

--> statement-breakpoint
-- 1) Keep `updated_at` correct on every UPDATE, whichever code path writes the row.
--    clock_timestamp() (not now()) so long transactions don't back-date rows that the live feed polls for.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END $$;

--> statement-breakpoint
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t.table_name || '_set_updated_at', t.table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t.table_name || '_set_updated_at', t.table_name);
  END LOOP;
END $$;

--> statement-breakpoint
-- 2) The order status history is an append-only audit trail.
CREATE OR REPLACE FUNCTION public.forbid_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_status_history is append-only (% blocked)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;

--> statement-breakpoint
DROP TRIGGER IF EXISTS order_status_history_append_only ON public.order_status_history;

--> statement-breakpoint
CREATE TRIGGER order_status_history_append_only BEFORE UPDATE OR DELETE ON public.order_status_history
  FOR EACH ROW EXECUTE FUNCTION public.forbid_history_mutation();

--> statement-breakpoint
-- 3) Row Level Security: the app talks to Postgres directly over a server-side connection (which bypasses RLS).
--    Enabling RLS with NO policies means Supabase's public Data API (anon / authenticated keys) can read or
--    write NOTHING, even if those keys leak. Never add permissive policies to these tables.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_\_drizzle%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

--> statement-breakpoint
-- 4) Defence in depth on Supabase (roles don't exist on plain Postgres / PGlite, so check first).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
  END IF;
END $$;
