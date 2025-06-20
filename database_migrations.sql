-- Phase 2: Multi-Event Support and Enhanced Scoring System
-- Execute these migrations in Supabase SQL Editor

-- 1. Add new columns to events table for better event management
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(50) DEFAULT 'wrestling';
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'upcoming';
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_picks INTEGER DEFAULT 10;

-- 2. Add odds and point values to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS favorite VARCHAR(1); -- 'A' or 'B'
ALTER TABLE matches ADD COLUMN IF NOT EXISTS odds_ratio DECIMAL(5,2) DEFAULT 1.0; -- e.g., 9.0 for 9:1 odds
ALTER TABLE matches ADD COLUMN IF NOT EXISTS favorite_points INTEGER DEFAULT 500; -- calculated: 1000 / odds_ratio
ALTER TABLE matches ADD COLUMN IF NOT EXISTS underdog_points INTEGER DEFAULT 1000;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'upcoming';

-- 3. Enhance picks table for point-based scoring
ALTER TABLE picks ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;

-- 4. Create event_types table for categorizing events
CREATE TABLE IF NOT EXISTS event_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- for UI icons
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default event types
INSERT INTO event_types (name, description, icon) VALUES
('wrestling', 'Wrestling Tournaments and Matches', '🤼'),
('mma', 'Mixed Martial Arts Events', '🥊'),
('boxing', 'Boxing Matches', '🥊'),
('olympics', 'Olympic Games', '🏅'),
('ncaa', 'NCAA Championships', '🏆')
ON CONFLICT (name) DO NOTHING;

-- 5. Add foreign key relationship for event types
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type_id UUID REFERENCES event_types(id);

-- 6. Create user_stats table for tracking performance
CREATE TABLE IF NOT EXISTS user_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    total_picks INTEGER DEFAULT 0,
    correct_picks INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    accuracy_percentage DECIMAL(5,2) DEFAULT 0.0,
    best_event_score INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    favorite_event_type VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 7. Create event_participants table for tracking who joined each event
CREATE TABLE IF NOT EXISTS event_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_points INTEGER DEFAULT 0,
    picks_submitted BOOLEAN DEFAULT FALSE,
    UNIQUE(event_id, user_id)
);

-- 8. Update RLS policies for new tables
ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- Allow public read access to event types
CREATE POLICY "Public can view event types" ON event_types FOR SELECT USING (true);

-- Users can only see their own stats
CREATE POLICY "Users can view own stats" ON user_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own stats" ON user_stats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stats" ON user_stats FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Event participants policies
CREATE POLICY "Users can view event participants" ON event_participants FOR SELECT USING (true);
CREATE POLICY "Users can join events" ON event_participants FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own participation" ON event_participants FOR UPDATE USING (auth.uid() = user_id);

-- 9. Create function to calculate points based on odds
CREATE OR REPLACE FUNCTION calculate_match_points(odds_ratio DECIMAL)
RETURNS TABLE(favorite_pts INTEGER, underdog_pts INTEGER) AS $$
BEGIN
    RETURN QUERY SELECT 
        CASE 
            WHEN odds_ratio <= 1.0 THEN 500
            ELSE GREATEST(50, FLOOR(1000.0 / odds_ratio)::INTEGER)
        END as favorite_pts,
        1000 as underdog_pts;
END;
$$ LANGUAGE plpgsql;

-- 10. Create function to update user stats after picks are scored
CREATE OR REPLACE FUNCTION update_user_stats_after_scoring()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user stats when a pick is scored
    INSERT INTO user_stats (user_id, total_picks, correct_picks, total_points)
    VALUES (
        NEW.user_id,
        1,
        CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
        COALESCE(NEW.points_earned, 0)
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_picks = user_stats.total_picks + 1,
        correct_picks = user_stats.correct_picks + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
        total_points = user_stats.total_points + COALESCE(NEW.points_earned, 0),
        accuracy_percentage = CASE 
            WHEN user_stats.total_picks + 1 > 0 
            THEN ROUND((user_stats.correct_picks + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)::DECIMAL / (user_stats.total_picks + 1) * 100, 2)
            ELSE 0 
        END,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stats updates
DROP TRIGGER IF EXISTS trigger_update_user_stats ON picks;
CREATE TRIGGER trigger_update_user_stats
    AFTER UPDATE OF is_correct, points_earned ON picks
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_after_scoring();

-- 11. Enhanced leaderboard function with points
CREATE OR REPLACE FUNCTION get_event_leaderboard(event_id_param UUID)
RETURNS TABLE(
    username TEXT,
    total_points INTEGER,
    correct_picks INTEGER,
    total_picks INTEGER,
    accuracy_percentage DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.username,
        COALESCE(SUM(p.points_earned), 0)::INTEGER as total_points,
        COUNT(CASE WHEN p.is_correct = true THEN 1 END)::INTEGER as correct_picks,
        COUNT(p.id)::INTEGER as total_picks,
        CASE 
            WHEN COUNT(p.id) > 0 
            THEN ROUND(COUNT(CASE WHEN p.is_correct = true THEN 1 END)::DECIMAL / COUNT(p.id) * 100, 2)
            ELSE 0 
        END as accuracy_percentage
    FROM users u
    LEFT JOIN picks p ON u.id = p.user_id
    LEFT JOIN matches m ON p.match_id = m.id
    WHERE m.event_id = event_id_param
    GROUP BY u.id, u.username
    HAVING COUNT(p.id) > 0
    ORDER BY total_points DESC, accuracy_percentage DESC;
END;
$$ LANGUAGE plpgsql;

-- 12. Function to get overall leaderboard across all events
CREATE OR REPLACE FUNCTION get_overall_leaderboard()
RETURNS TABLE(
    username TEXT,
    total_points INTEGER,
    correct_picks INTEGER,
    total_picks INTEGER,
    accuracy_percentage DECIMAL,
    events_participated INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.username,
        COALESCE(us.total_points, 0)::INTEGER,
        COALESCE(us.correct_picks, 0)::INTEGER,
        COALESCE(us.total_picks, 0)::INTEGER,
        COALESCE(us.accuracy_percentage, 0.0),
        COUNT(DISTINCT ep.event_id)::INTEGER as events_participated
    FROM users u
    LEFT JOIN user_stats us ON u.id = us.user_id
    LEFT JOIN event_participants ep ON u.id = ep.user_id
    GROUP BY u.id, u.username, us.total_points, us.correct_picks, us.total_picks, us.accuracy_percentage
    HAVING COALESCE(us.total_picks, 0) > 0
    ORDER BY COALESCE(us.total_points, 0) DESC, COALESCE(us.accuracy_percentage, 0) DESC;
END;
$$ LANGUAGE plpgsql; 