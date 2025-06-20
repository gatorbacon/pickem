-- Safe Pick 6 Migration for Supabase
-- This script handles existing objects and conflicts

-- 1. Drop existing views first (if they exist)
DROP VIEW IF EXISTS pick6_leaderboard CASCADE;

-- 2. Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS pick6_selections CASCADE;
DROP TABLE IF EXISTS pick6_entries CASCADE;

-- 3. Add columns to existing tables (safe with IF NOT EXISTS)
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS contest_type TEXT DEFAULT 'match_picks',
ADD COLUMN IF NOT EXISTS pick_count INTEGER DEFAULT 6;

-- Add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'events_contest_type_check'
    ) THEN
        ALTER TABLE events ADD CONSTRAINT events_contest_type_check 
        CHECK (contest_type IN ('match_picks', 'pick_6'));
    END IF;
END $$;

ALTER TABLE matches 
ADD COLUMN IF NOT EXISTS american_odds_a INTEGER,
ADD COLUMN IF NOT EXISTS american_odds_b INTEGER,
ADD COLUMN IF NOT EXISTS finish_type TEXT;

-- Add constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.check_constraints 
        WHERE constraint_name = 'matches_finish_type_check'
    ) THEN
        ALTER TABLE matches ADD CONSTRAINT matches_finish_type_check 
        CHECK (finish_type IN ('decision', 'ko_tko', 'submission'));
    END IF;
END $$;

-- 4. Create pick6_entries table
CREATE TABLE pick6_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    double_down_pick_id UUID, -- Will reference pick6_selections.id
    total_points DECIMAL(10,1) DEFAULT 0,
    picks_correct INTEGER DEFAULT 0,
    is_complete BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one entry per user per event
    UNIQUE(user_id, event_id)
);

-- 5. Create pick6_selections table
CREATE TABLE pick6_selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pick6_entry_id UUID NOT NULL REFERENCES pick6_entries(id) ON DELETE CASCADE,
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    fighter_id TEXT NOT NULL CHECK (fighter_id IN ('A', 'B')),
    fighter_name TEXT NOT NULL,
    american_odds INTEGER NOT NULL,
    base_points DECIMAL(10,1) DEFAULT 0,
    finish_bonus DECIMAL(10,1) DEFAULT 0,
    underdog_bonus DECIMAL(10,1) DEFAULT 0,
    double_down_multiplier INTEGER DEFAULT 1,
    final_points DECIMAL(10,1) DEFAULT 0,
    is_winner BOOLEAN,
    is_double_down BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one pick per match per entry
    UNIQUE(pick6_entry_id, match_id)
);

-- 6. Add the foreign key constraint for double_down_pick_id
ALTER TABLE pick6_entries 
ADD CONSTRAINT fk_double_down_pick 
FOREIGN KEY (double_down_pick_id) REFERENCES pick6_selections(id) ON DELETE SET NULL;

-- 7. Create indexes for performance
CREATE INDEX idx_pick6_entries_user_event ON pick6_entries(user_id, event_id);
CREATE INDEX idx_pick6_entries_event ON pick6_entries(event_id);
CREATE INDEX idx_pick6_selections_entry ON pick6_selections(pick6_entry_id);
CREATE INDEX idx_pick6_selections_match ON pick6_selections(match_id);

-- 8. Enable RLS on new tables
ALTER TABLE pick6_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick6_selections ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS Policies for pick6_entries
CREATE POLICY "Users can view their own Pick 6 entries" ON pick6_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Pick 6 entries" ON pick6_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Pick 6 entries" ON pick6_entries
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Pick 6 entries" ON pick6_entries
    FOR DELETE USING (auth.uid() = user_id);

-- 10. Create RLS Policies for pick6_selections
CREATE POLICY "Users can view their own Pick 6 selections" ON pick6_selections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE pick6_entries.id = pick6_selections.pick6_entry_id 
            AND pick6_entries.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own Pick 6 selections" ON pick6_selections
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE pick6_entries.id = pick6_selections.pick6_entry_id 
            AND pick6_entries.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own Pick 6 selections" ON pick6_selections
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE pick6_entries.id = pick6_selections.pick6_entry_id 
            AND pick6_entries.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own Pick 6 selections" ON pick6_selections
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE pick6_entries.id = pick6_selections.pick6_entry_id 
            AND pick6_entries.user_id = auth.uid()
        )
    );

-- 11. Create Pick 6 leaderboard view
CREATE VIEW pick6_leaderboard AS
SELECT 
    pe.event_id,
    u.email as user_email,
    pe.user_id,
    pe.total_points,
    pe.picks_correct,
    pe.is_complete,
    pe.submitted_at,
    ROW_NUMBER() OVER (PARTITION BY pe.event_id ORDER BY pe.total_points DESC, pe.submitted_at ASC) as rank
FROM pick6_entries pe
JOIN auth.users u ON pe.user_id = u.id
WHERE pe.is_complete = true
ORDER BY pe.event_id, rank;

-- 12. Update existing events to have contest_type if null
UPDATE events SET contest_type = 'match_picks' WHERE contest_type IS NULL;
UPDATE events SET pick_count = 6 WHERE pick_count IS NULL;

-- 13. Grant necessary permissions
GRANT SELECT ON pick6_leaderboard TO authenticated;
GRANT ALL ON pick6_entries TO authenticated;
GRANT ALL ON pick6_selections TO authenticated;

-- 14. Verification queries (optional - you can run these to check)
-- SELECT 'Tables created successfully' as status;
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'pick6%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'events' AND column_name IN ('contest_type', 'pick_count'); 