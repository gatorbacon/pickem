-- Supplementary Migration: Fix CASCADE DELETE constraints
-- Run this in Supabase SQL Editor to enable proper cascading deletes

-- First, we need to drop existing foreign key constraints and recreate them with CASCADE DELETE

-- Drop existing foreign key constraints (if they exist)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_event_id_fkey;
ALTER TABLE picks DROP CONSTRAINT IF EXISTS picks_match_id_fkey;
ALTER TABLE event_participants DROP CONSTRAINT IF EXISTS event_participants_event_id_fkey;

-- Recreate foreign key constraints with CASCADE DELETE
ALTER TABLE matches 
ADD CONSTRAINT matches_event_id_fkey 
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

ALTER TABLE picks 
ADD CONSTRAINT picks_match_id_fkey 
FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE;

ALTER TABLE event_participants 
ADD CONSTRAINT event_participants_event_id_fkey 
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- Also ensure picks reference users properly
ALTER TABLE picks DROP CONSTRAINT IF EXISTS picks_user_id_fkey;
ALTER TABLE picks 
ADD CONSTRAINT picks_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; 