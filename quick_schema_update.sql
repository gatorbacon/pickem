-- Quick schema update to add Pick 6 support
-- Run this in your Supabase SQL Editor

-- 1. Add contest_type and pick_count to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS contest_type TEXT DEFAULT 'match_picks' CHECK (contest_type IN ('match_picks', 'pick_6')),
ADD COLUMN IF NOT EXISTS pick_count INTEGER DEFAULT 6;

-- 2. Add individual fighter odds to matches table
ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS american_odds_a INTEGER,
ADD COLUMN IF NOT EXISTS american_odds_b INTEGER,
ADD COLUMN IF NOT EXISTS finish_type TEXT CHECK (finish_type IN ('decision', 'ko_tko', 'submission'));

-- 3. Update existing events to have contest_type if null
UPDATE events SET contest_type = 'match_picks' WHERE contest_type IS NULL;
UPDATE events SET pick_count = 6 WHERE pick_count IS NULL; 