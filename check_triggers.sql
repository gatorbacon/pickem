-- Check for triggers on the matches table that might be causing the error
-- Run this to see what triggers exist

-- Check triggers on matches table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'matches'
ORDER BY trigger_name;

-- Check for functions that might be called by triggers
SELECT 
    routine_name,
    routine_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND (routine_name LIKE '%pick6%' OR routine_name LIKE '%match%' OR routine_name LIKE '%score%')
ORDER BY routine_name; 