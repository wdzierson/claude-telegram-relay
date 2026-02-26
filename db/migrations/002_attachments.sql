-- db/migrations/002_attachments.sql

-- Attachments table — tracks uploaded files with searchable embeddings
-- NOTE: The embed Edge Function must be updated to handle the 'attachments' table
-- (it currently checks for record.content which attachments don't have).
-- See supabase/functions/embed/index.ts — Task 10 of the media attachments plan.
CREATE TABLE IF NOT EXISTS attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  user_id TEXT,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'document', 'audio', 'video')),
  mime_type TEXT,
  original_filename TEXT,
  storage_url TEXT NOT NULL,
  description TEXT,
  extracted_text TEXT,
  file_size_bytes INTEGER,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536)
);

CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_file_type ON attachments(file_type);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_embedding
  ON attachments USING hnsw (embedding vector_cosine_ops);

-- RLS
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'attachments'
      AND policyname = 'Allow all for service role'
  ) THEN
    CREATE POLICY "Allow all for service role" ON attachments FOR ALL USING (true);
  END IF;
END $$;

-- Semantic search for attachments
CREATE OR REPLACE FUNCTION match_attachments(
  query_embedding VECTOR(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  file_type TEXT,
  mime_type TEXT,
  original_filename TEXT,
  storage_url TEXT,
  description TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.file_type,
    a.mime_type,
    a.original_filename,
    a.storage_url,
    a.description,
    a.extracted_text,
    a.created_at,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM attachments a
  WHERE a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
