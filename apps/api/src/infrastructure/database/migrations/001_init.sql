CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  zone JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS table_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id TEXT NOT NULL REFERENCES restaurant_tables(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('state_changed', 'unattended', 'hand_raise', 'overstay', 'staff_visit')),
  occurred_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER,
  mode TEXT NOT NULL DEFAULT 'standard',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS table_events_occurred_at_idx ON table_events (occurred_at DESC);

INSERT INTO restaurant_tables (id, label) VALUES
  ('table-1', 'Table 1'), ('table-2', 'Table 2'), ('table-3', 'Table 3'),
  ('table-4', 'Table 4'), ('table-5', 'Table 5'), ('table-6', 'Table 6')
ON CONFLICT (id) DO NOTHING;
