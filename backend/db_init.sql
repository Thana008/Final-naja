CREATE DATABASE vision_search_db;
\c vision_search_db;
CREATE TABLE IF NOT EXISTS search_history (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255),
  labels JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
