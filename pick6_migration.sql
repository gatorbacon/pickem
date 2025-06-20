-- Pick 6 Migration: Add support for Pick 6 contest format
-- Run this after the existing database is set up

-- 1. Add contest_type and pick_count to events table
ALTER TABLE events 
ADD COLUMN contest_type TEXT DEFAULT 'match_picks' CHECK (contest_type IN ('match_picks', 'pick_6')),
ADD COLUMN pick_count INTEGER DEFAULT 6;

-- 2. Add american_odds and finish_type to matches table
ALTER TABLE matches 
ADD COLUMN american_odds INTEGER,
ADD COLUMN american_odds_a INTEGER,
ADD COLUMN american_odds_b INTEGER,
ADD COLUMN finish_type TEXT CHECK (finish_type IN ('decision', 'ko_tko', 'submission'));

-- 3. Create pick6_entries table
CREATE TABLE pick6_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    double_down_pick_id UUID, -- References pick6_selections.id
    total_points DECIMAL(10,1) DEFAULT 0,
    picks_correct INTEGER DEFAULT 0,
    is_complete BOOLEAN DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one entry per user per event
    UNIQUE(user_id, event_id)
);

-- 4. Create pick6_selections table
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

-- 5. Add foreign key for double_down_pick_id
ALTER TABLE pick6_entries 
ADD CONSTRAINT fk_double_down_pick 
FOREIGN KEY (double_down_pick_id) REFERENCES pick6_selections(id) ON DELETE SET NULL;

-- 6. Create indexes for performance
CREATE INDEX idx_pick6_entries_user_event ON pick6_entries(user_id, event_id);
CREATE INDEX idx_pick6_entries_event ON pick6_entries(event_id);
CREATE INDEX idx_pick6_selections_entry ON pick6_selections(pick6_entry_id);
CREATE INDEX idx_pick6_selections_match ON pick6_selections(match_id);

-- 7. Update event_participants for Pick 6 events
-- Add pick6_entry_id to track Pick 6 entries
ALTER TABLE event_participants 
ADD COLUMN pick6_entry_id UUID REFERENCES pick6_entries(id) ON DELETE SET NULL;

-- 8. Create function to calculate Pick 6 points
CREATE OR REPLACE FUNCTION calculate_pick6_points(
    p_american_odds INTEGER,
    p_is_winner BOOLEAN,
    p_finish_type TEXT DEFAULT NULL,
    p_is_double_down BOOLEAN DEFAULT FALSE
) RETURNS TABLE (
    base_points DECIMAL(10,1),
    finish_bonus DECIMAL(10,1),
    underdog_bonus DECIMAL(10,1),
    double_down_multiplier INTEGER,
    total_points DECIMAL(10,1)
) AS $$
BEGIN
    -- If fighter loses, return 0 points
    IF NOT p_is_winner THEN
        RETURN QUERY SELECT 
            0.0::DECIMAL(10,1),
            0.0::DECIMAL(10,1),
            0.0::DECIMAL(10,1),
            1::INTEGER,
            0.0::DECIMAL(10,1);
        RETURN;
    END IF;
    
    DECLARE
        v_base_points DECIMAL(10,1);
        v_finish_bonus DECIMAL(10,1) := 0;
        v_underdog_bonus DECIMAL(10,1) := 0;
        v_double_down_multiplier INTEGER := CASE WHEN p_is_double_down THEN 2 ELSE 1 END;
        v_subtotal DECIMAL(10,1);
        v_total_points DECIMAL(10,1);
    BEGIN
        -- Calculate base points
        IF p_american_odds > 0 THEN
            v_base_points := p_american_odds;
        ELSE
            v_base_points := ROUND((10000.0 / ABS(p_american_odds))::DECIMAL(10,1), 1);
        END IF;
        
        -- Calculate finish bonus
        IF p_finish_type IS NOT NULL AND p_finish_type != 'decision' THEN
            v_finish_bonus := 50.0;
        END IF;
        
        -- Calculate underdog bonus
        IF p_american_odds >= 100 THEN
            v_underdog_bonus := ROUND((v_base_points * 0.1)::DECIMAL(10,1), 1);
        END IF;
        
        -- Calculate total
        v_subtotal := v_base_points + v_finish_bonus + v_underdog_bonus;
        v_total_points := ROUND((v_subtotal * v_double_down_multiplier)::DECIMAL(10,1), 1);
        
        RETURN QUERY SELECT 
            v_base_points,
            v_finish_bonus,
            v_underdog_bonus,
            v_double_down_multiplier,
            v_total_points;
    END;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger to update Pick 6 points when match results change
CREATE OR REPLACE FUNCTION update_pick6_points_on_result_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Update all Pick 6 selections for this match
    UPDATE pick6_selections 
    SET 
        is_winner = CASE 
            WHEN NEW.winner IS NULL THEN NULL
            WHEN (NEW.winner = 'A' AND fighter_id = 'A') OR (NEW.winner = 'B' AND fighter_id = 'B') THEN TRUE
            ELSE FALSE
        END
    WHERE match_id = NEW.id;
    
    -- Recalculate points for affected selections
    UPDATE pick6_selections 
    SET 
        base_points = calc.base_points,
        finish_bonus = calc.finish_bonus,
        underdog_bonus = calc.underdog_bonus,
        double_down_multiplier = calc.double_down_multiplier,
        final_points = calc.total_points
    FROM calculate_pick6_points(
        pick6_selections.american_odds,
        pick6_selections.is_winner,
        NEW.finish_type,
        pick6_selections.is_double_down
    ) AS calc
    WHERE pick6_selections.match_id = NEW.id
    AND pick6_selections.is_winner IS NOT NULL;
    
    -- Update entry totals
    UPDATE pick6_entries 
    SET 
        total_points = (
            SELECT COALESCE(SUM(final_points), 0)
            FROM pick6_selections 
            WHERE pick6_entry_id = pick6_entries.id
        ),
        picks_correct = (
            SELECT COUNT(*)
            FROM pick6_selections 
            WHERE pick6_entry_id = pick6_entries.id 
            AND is_winner = TRUE
        )
    WHERE id IN (
        SELECT DISTINCT pick6_entry_id 
        FROM pick6_selections 
        WHERE match_id = NEW.id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pick6_points
    AFTER UPDATE OF winner, finish_type ON matches
    FOR EACH ROW
    EXECUTE FUNCTION update_pick6_points_on_result_change();

-- 10. Enable RLS on new tables
ALTER TABLE pick6_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pick6_selections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pick6_entries
CREATE POLICY "Users can view their own Pick 6 entries" ON pick6_entries
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Pick 6 entries" ON pick6_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Pick 6 entries" ON pick6_entries
    FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for pick6_selections
CREATE POLICY "Users can view their own Pick 6 selections" ON pick6_selections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE id = pick6_entry_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own Pick 6 selections" ON pick6_selections
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE id = pick6_entry_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own Pick 6 selections" ON pick6_selections
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM pick6_entries 
            WHERE id = pick6_entry_id 
            AND user_id = auth.uid()
        )
    );

-- 11. Update existing MMA events to use Pick 6 format
UPDATE events 
SET contest_type = 'pick_6', pick_count = 6 
WHERE event_type_id IN (
    SELECT id FROM event_types WHERE name ILIKE '%mma%'
);

-- 12. Create view for Pick 6 leaderboards
CREATE OR REPLACE VIEW pick6_leaderboard AS
SELECT 
    e.id as event_id,
    e.name as event_name,
    pe.user_id,
    u.email as user_email,
    pe.total_points,
    pe.picks_correct,
    pe.is_complete,
    pe.submitted_at,
    ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY pe.total_points DESC, pe.submitted_at ASC) as rank
FROM pick6_entries pe
JOIN events e ON pe.event_id = e.id
JOIN auth.users u ON pe.user_id = u.id
WHERE e.contest_type = 'pick_6'
AND pe.is_complete = TRUE
ORDER BY e.id, pe.total_points DESC;

COMMENT ON TABLE pick6_entries IS 'Stores user entries for Pick 6 format contests';
COMMENT ON TABLE pick6_selections IS 'Stores individual fighter selections within Pick 6 entries';
COMMENT ON FUNCTION calculate_pick6_points IS 'Calculates points for Pick 6 selections based on odds, results, and bonuses'; 