-- Add missing columns to matches table for recording results
-- Run this in your Supabase SQL editor

-- Add winner column (A or B)
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS winner TEXT CHECK (winner IN ('A', 'B'));

-- Add finish_type column 
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS finish_type TEXT CHECK (finish_type IN ('decision', 'ko_tko', 'submission'));

-- Add is_complete column
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN matches.winner IS 'Winner of the match: A (wrestler_a) or B (wrestler_b)';
COMMENT ON COLUMN matches.finish_type IS 'How the match ended: decision, ko_tko, or submission';
COMMENT ON COLUMN matches.is_complete IS 'Whether the match result has been recorded';

-- Create index for better performance when querying completed matches
CREATE INDEX IF NOT EXISTS idx_matches_is_complete ON matches(is_complete);

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'matches' 
AND column_name IN ('winner', 'finish_type', 'is_complete')
ORDER BY column_name; 