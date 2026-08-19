# Next Phase 3 action

The next irreversible-sensitive action is the private-state copy from Neon to Supabase. It must happen before any explicit Supabase write cutover.

Preferred path: temporary PostgreSQL FDW bridge created in Supabase using a user mapping entered directly in the Supabase SQL editor, followed by copy/validation and immediate bridge cleanup. Do not transmit the Neon database password through chat or source control.
