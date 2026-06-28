CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plate TEXT NOT NULL,
  cnh_file_name TEXT,
  cnh_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS cnh_file_url TEXT;

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  extra_emails TEXT,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL UNIQUE,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  document_type TEXT NOT NULL,
  address TEXT NOT NULL,
  plate TEXT NOT NULL,
  notes TEXT,
  nf_photo_url TEXT,
  delivery_photo_url TEXT,
  signature_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  location_label TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'Concluida',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS location_label TEXT;

CREATE INDEX IF NOT EXISTS idx_drivers_email ON drivers(email);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_clients_company_name ON clients(company_name);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_client ON deliveries(client_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_protocol ON deliveries(protocol);
CREATE INDEX IF NOT EXISTS idx_deliveries_delivered_at ON deliveries(delivered_at);
