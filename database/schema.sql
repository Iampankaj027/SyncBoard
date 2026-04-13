-- Run this in Supabase SQL Editor
CREATE TABLE strokes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL,
  path_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast room queries
CREATE INDEX idx_strokes_room_id ON strokes(room_id);