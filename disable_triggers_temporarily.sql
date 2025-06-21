-- Temporarily disable triggers on matches table to allow result recording
-- Run this if you need to record results immediately while we debug

-- Disable all triggers on matches table
ALTER TABLE matches DISABLE TRIGGER ALL;

-- To re-enable later (after we fix the issue):
-- ALTER TABLE matches ENABLE TRIGGER ALL;

-- Check that triggers are disabled
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    status
FROM information_schema.triggers 
WHERE event_object_table = 'matches'; 