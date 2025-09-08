-- Business Cards Management System - Initial Database Schema
-- Created: 2025-09-08

-- Business cards table
CREATE TABLE IF NOT EXISTS business_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  department TEXT,
  position TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  image_url TEXT,
  registered_by TEXT NOT NULL DEFAULT 'admin',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags table for categorization
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Business card tags junction table
CREATE TABLE IF NOT EXISTS business_card_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_card_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_card_id) REFERENCES business_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE(business_card_id, tag_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_business_cards_name ON business_cards(name);
CREATE INDEX IF NOT EXISTS idx_business_cards_company ON business_cards(company);
CREATE INDEX IF NOT EXISTS idx_business_cards_email ON business_cards(email);
CREATE INDEX IF NOT EXISTS idx_business_cards_registered_by ON business_cards(registered_by);
CREATE INDEX IF NOT EXISTS idx_business_cards_created_at ON business_cards(created_at);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_business_card_tags_business_card_id ON business_card_tags(business_card_id);
CREATE INDEX IF NOT EXISTS idx_business_card_tags_tag_id ON business_card_tags(tag_id);

-- Create full-text search virtual table for advanced search
CREATE VIRTUAL TABLE IF NOT EXISTS business_cards_fts USING fts5(
  name,
  company,
  department,
  position,
  email,
  notes,
  content=business_cards,
  content_rowid=id
);

-- Triggers to keep FTS table in sync
CREATE TRIGGER IF NOT EXISTS business_cards_fts_insert AFTER INSERT ON business_cards BEGIN
  INSERT INTO business_cards_fts(rowid, name, company, department, position, email, notes) 
  VALUES (new.id, new.name, new.company, new.department, new.position, new.email, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS business_cards_fts_delete AFTER DELETE ON business_cards BEGIN
  INSERT INTO business_cards_fts(business_cards_fts, rowid, name, company, department, position, email, notes) 
  VALUES('delete', old.id, old.name, old.company, old.department, old.position, old.email, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS business_cards_fts_update AFTER UPDATE ON business_cards BEGIN
  INSERT INTO business_cards_fts(business_cards_fts, rowid, name, company, department, position, email, notes) 
  VALUES('delete', old.id, old.name, old.company, old.department, old.position, old.email, old.notes);
  INSERT INTO business_cards_fts(rowid, name, company, department, position, email, notes) 
  VALUES (new.id, new.name, new.company, new.department, new.position, new.email, new.notes);
END;

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_business_cards_timestamp 
  AFTER UPDATE ON business_cards 
  FOR EACH ROW WHEN NEW.updated_at <= OLD.updated_at
BEGIN
  UPDATE business_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;