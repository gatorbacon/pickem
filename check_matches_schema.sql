-- Check current schema of matches table
-- Run this in your Supabase SQL editor to see what columns exist

SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'matches'
ORDER BY ordinal_position;

-- Also check for any constraints on the matches table
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    ccu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu 
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_schema = 'public' 
AND tc.table_name = 'matches'
ORDER BY tc.constraint_type, tc.constraint_name; 