-- Segment membership for the custom-segment-targeting personalization algorithm.
-- `customer_ids` holds a JSON array of the customer ids that belong to the segment.
-- The `segmentId` set on a personalization variation's criteria references `segments.id`.
-- Schema mirrors the local segment store (.data/segments.sqlite); the worker only
-- reads `id` and `customer_ids`, the remaining columns are descriptive metadata.

CREATE TABLE IF NOT EXISTS segments (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  source_filename TEXT,
  customer_ids    TEXT NOT NULL,
  row_count       INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);

-- Seeded from sample-data.csv. Ids match the `segmentId` emitted by the Uniform
-- segment-targeting criteria editor.
INSERT OR REPLACE INTO segments (id, name, source_filename, customer_ids, row_count, created_at) VALUES ('seg_90d1e85d-2492-4f78-9e5e-63753d801078', 'sample-data.csv', 'sample-data.csv', '["123456","654321","54321","12345","765431"]', 5, '2026-06-23T23:28:23.653Z');
INSERT OR REPLACE INTO segments (id, name, source_filename, customer_ids, row_count, created_at) VALUES ('seg_cda69ae6-17cb-48ac-88e0-7f86a2a5c65a', 'sample-data.csv', 'sample-data.csv', '["123456","654321","54321","12345","765431"]', 5, '2026-06-23T23:29:08.338Z');
