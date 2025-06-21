-- Add only the missing is_complete column to matches table
-- This is the only column needed for results recording functionality

-- Add is_complete column
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE;

-- Add comment for clarity
COMMENT ON COLUMN matches.is_complete IS 'Whether the match result has been recorded';

-- Create index for better performance when querying completed matches
CREATE INDEX IF NOT EXISTS idx_matches_is_complete ON matches(is_complete);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'matches' 
AND column_name = 'is_complete'; 