-- Test Pick 6 Tables
-- Run this in Supabase SQL Editor to verify everything is working

-- 1. Check if tables exist and are accessible
SELECT 'pick6_entries table exists' as test, count(*) as count FROM pick6_entries;
SELECT 'pick6_selections table exists' as test, count(*) as count FROM pick6_selections;

-- 2. Check if matches have the new columns
SELECT 
  id, 
  wrestler_a, 
  wrestler_b, 
  american_odds_a, 
  american_odds_b,
  CASE 
    WHEN american_odds_a IS NOT NULL AND american_odds_b IS NOT NULL THEN 'Pick 6 Ready'
    ELSE 'Missing Pick 6 Odds'
  END as status
FROM matches 
LIMIT 5;

-- 3. Check events table
SELECT 
  id, 
  name, 
  contest_type, 
  pick_count,
  CASE 
    WHEN contest_type = 'pick_6' THEN 'Pick 6 Event'
    ELSE 'Traditional Event'
  END as event_format
FROM events 
ORDER BY created_at DESC 
LIMIT 5; 