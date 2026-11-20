-- SeeServe platform core: branches, menu, reservations, queue, orders, auth, analytics inputs.
-- Idempotent so it can be applied by the migration runner on any existing database.
-- Personal data kept here: guest name + email for reservations/tickets/receipts only (see docs/DATA-LIFECYCLE.md).

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  phone TEXT,
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES branches(id);
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity > 0);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  cost_price NUMERIC(10, 2) NOT NULL CHECK (cost_price >= 0),
  prep_minutes INTEGER NOT NULL DEFAULT 12 CHECK (prep_minutes > 0),
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_available BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  reserved_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'seated', 'completed', 'cancelled', 'no_show')),
  table_id TEXT REFERENCES restaurant_tables(id),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'chat', 'staff', 'mcp', 'synthetic')),
  notes TEXT NOT NULL DEFAULT '',
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_branch_time_idx ON reservations (branch_id, reserved_for);

CREATE TABLE IF NOT EXISTS queue_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'seated', 'served', 'left', 'cancelled')),
  table_id TEXT REFERENCES restaurant_tables(id),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'chat', 'staff', 'mcp', 'synthetic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seated_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS queue_tickets_branch_status_idx ON queue_tickets (branch_id, status, created_at);

-- One row per seating; vacated_at - seated_at is the table turn time used for wait estimates.
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  table_id TEXT NOT NULL REFERENCES restaurant_tables(id),
  party_size INTEGER NOT NULL DEFAULT 2,
  seated_at TIMESTAMPTZ NOT NULL,
  vacated_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('cctv', 'staff', 'synthetic'))
);
CREATE INDEX IF NOT EXISTS table_sessions_branch_seated_idx ON table_sessions (branch_id, seated_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  table_id TEXT REFERENCES restaurant_tables(id),
  table_session_id UUID REFERENCES table_sessions(id),
  covers INTEGER NOT NULL DEFAULT 1 CHECK (covers > 0),
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'preparing', 'ready', 'served', 'paid', 'cancelled')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'online')),
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('qr', 'staff', 'synthetic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_branch_created_idx ON orders (branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL,
  unit_cost NUMERIC(10, 2) NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_menu_idx ON order_items (menu_item_id);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  category TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  incurred_on DATE NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS daily_weather (
  branch_id TEXT NOT NULL REFERENCES branches(id),
  day DATE NOT NULL,
  temp_max_c NUMERIC(4, 1),
  precipitation_mm NUMERIC(6, 1),
  source TEXT NOT NULL DEFAULT 'synthetic' CHECK (source IN ('open-meteo', 'synthetic')),
  PRIMARY KEY (branch_id, day)
);

-- Auth: admin allow-list, single-use magic-link tokens and sessions. Only SHA-256 hashes are stored.
CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every AI/tool action that changes data is recorded here (who, which tool, which target).
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Token usage per chat turn, used for per-conversation spend caps and cost reporting.
CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE table_events DROP CONSTRAINT IF EXISTS table_events_event_type_check;
ALTER TABLE table_events ADD CONSTRAINT table_events_event_type_check
  CHECK (event_type IN ('state_changed', 'unattended', 'hand_raise', 'overstay', 'staff_visit'));
