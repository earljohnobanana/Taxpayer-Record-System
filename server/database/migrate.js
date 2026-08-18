import { sqlite } from "./db.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('administrator','treasurer','cashier','encoder')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS barangays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    contact_number TEXT,
    tin TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS establishments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    barangay_id INTEGER NOT NULL REFERENCES barangays(id),
    owner_id INTEGER NOT NULL REFERENCES owners(id),
    business_type TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','closed')),
    notes TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tax_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    establishment_id INTEGER NOT NULL REFERENCES establishments(id),
    tax_year INTEGER NOT NULL,
    tax_due REAL NOT NULL,
    payment_schedule TEXT NOT NULL CHECK(payment_schedule IN ('full','quarterly','semi_annual')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(establishment_id, tax_year)
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_record_id INTEGER NOT NULL REFERENCES tax_records(id),
    payment_date TEXT NOT NULL,
    or_number TEXT NOT NULL,
    amount REAL NOT NULL,
    remarks TEXT,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  /* ── Indexes ──
     Every one of these backs a lookup or join your routes already
     perform on every request (establishments by owner/barangay, tax
     records by establishment, payments by tax record, activity logs
     by user for the leftJoin). Without them, SQLite does a full table
     scan on every request — invisible with a handful of rows, but a
     real, growing slowdown as the office accumulates years of records. */
  `CREATE INDEX IF NOT EXISTS idx_establishments_owner_id ON establishments(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_establishments_barangay_id ON establishments(barangay_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tax_records_establishment_id ON tax_records(establishment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_tax_record_id ON payments(tax_record_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON payments(recorded_by)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`,
];

for (const stmt of statements) {
  sqlite.exec(stmt);
}

/* ── Additive column migrations ──
   For databases created before a column existed, add it if missing. SQLite's
   ALTER TABLE ADD COLUMN errors if the column is already there, so we check
   PRAGMA table_info first. Existing rows get the DEFAULT (0), which is correct:
   old payments only ever recorded Business Tax (the `amount` column). */
function addColumnIfMissing(table, column, definition) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migrate] Added ${table}.${column}`);
  }
}

for (const col of [
  "mayors_permit",
  "swm",
  "sanitary_permit",
  "peso",
  "occupancy_fee",
  "inspection_fee",
  "health_cert",
]) {
  addColumnIfMissing("payments", col, "REAL NOT NULL DEFAULT 0");
}

/* ── Itemized payments (fee_options + payment_items) ── */
sqlite.exec(`CREATE TABLE IF NOT EXISTS fee_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS payment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
sqlite.exec(
  `CREATE INDEX IF NOT EXISTS idx_payment_items_payment_id ON payment_items(payment_id)`
);
sqlite.exec(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);

// Seed default fee options only if the catalog is empty.
const optCount = sqlite.prepare("SELECT COUNT(*) AS c FROM fee_options").get().c;
if (optCount === 0) {
  const defaults = {
    business_tax: ["Business Tax", "Refreshments"],
    mayors_permit: [
      "Mayor's Permit",
      "Tobacco",
      "Frozen Products",
      "School Supply",
      "Cereal",
      "Feeds",
      "Oil/Lubricant",
      "Services",
      "Motor Parts",
    ],
    regulatory: [
      "License Fee",
      "Sticker No.",
      "Hook & Line",
      "Police Clearance",
      "MC (Market Clearance)",
      "W/M (Weight/Measure)",
      "SWM",
      "Sanitary Permit",
      "PESO",
      "Occupancy Fee",
      "Inspection Fee",
      "Health Cert",
    ],
  };
  const ins = sqlite.prepare(
    "INSERT INTO fee_options (category, label, sort_order) VALUES (?, ?, ?)"
  );
  for (const [cat, labels] of Object.entries(defaults)) {
    labels.forEach((label, i) => ins.run(cat, label, i));
  }
  console.log("[migrate] Seeded default fee options.");
}

// One-time migration: turn the old fixed fee columns into payment_items and set
// payments.amount to the receipt total. Guarded by an app_meta flag so it runs
// exactly once, ever.
const alreadyMigrated = sqlite
  .prepare("SELECT value FROM app_meta WHERE key = 'payment_items_migrated'")
  .get();
if (!alreadyMigrated) {
  const legacyMap = [
    ["amount", "business_tax", "Business Tax"],
    ["mayors_permit", "mayors_permit", "Mayor's Permit"],
    ["swm", "regulatory", "SWM"],
    ["sanitary_permit", "regulatory", "Sanitary Permit"],
    ["peso", "regulatory", "PESO"],
    ["occupancy_fee", "regulatory", "Occupancy Fee"],
    ["inspection_fee", "regulatory", "Inspection Fee"],
    ["health_cert", "regulatory", "Health Cert"],
  ];
  const pays = sqlite.prepare("SELECT * FROM payments").all();
  const insItem = sqlite.prepare(
    "INSERT INTO payment_items (payment_id, category, label, amount) VALUES (?, ?, ?, ?)"
  );
  const updAmount = sqlite.prepare("UPDATE payments SET amount = ? WHERE id = ?");
  const tx = sqlite.transaction(() => {
    for (const p of pays) {
      let total = 0;
      for (const [col, cat, label] of legacyMap) {
        const val = Number(p[col] || 0);
        if (val > 0) {
          insItem.run(p.id, cat, label, val);
          total += val;
        }
      }
      updAmount.run(total, p.id); // amount now == receipt total
    }
    sqlite
      .prepare("INSERT INTO app_meta (key, value) VALUES ('payment_items_migrated', '1')")
      .run();
  });
  tx();
  console.log(`[migrate] Converted ${pays.length} payment(s) to itemized form.`);
}

console.log("Database migrated successfully.");