/**
 * Enhanced TypeScript types for Phase 2: Multi-Event and Point-Based System
 */

export interface EventType {
  id: string
  name: string
  description: string
  icon: string
  created_at: string
}

export interface Event {
  id: string
  name: string
  description?: string
  event_date: string
  picks_deadline: string
  is_active: boolean
  event_type: string
  event_type_id?: string
  status: 'upcoming' | 'active' | 'completed' | 'cancelled'
  max_picks: number
  contest_type: 'match_picks' | 'pick_6'
  pick_count?: number // For Pick 6 format (default 6)
  created_at: string
  updated_at?: string
}

export interface Match {
  id: string
  event_id: string
  weight_class: string
  wrestler_a: string
  wrestler_b: string
  winner: 'A' | 'B' | null
  match_order: number
  favorite: 'A' | 'B' | null
  odds_ratio: number
  american_odds?: number
  american_odds_a?: number // Fighter A odds
  american_odds_b?: number // Fighter B odds
  favorite_points: number
  underdog_points: number
  finish_type?: 'decision' | 'ko_tko' | 'submission' | null
  status: 'upcoming' | 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at?: string
}

export interface Pick {
  id: string
  user_id: string
  match_id: string
  selected_wrestler: 'A' | 'B'
  points_earned: number
  is_correct: boolean | null
  created_at: string
  updated_at?: string
}

// Pick 6 specific types
export interface Pick6Entry {
  id: string
  user_id: string
  event_id: string
  picks: Pick6Selection[]
  double_down_pick_id?: string
  total_points: number
  picks_correct: number
  is_complete: boolean
  submitted_at?: string
  created_at: string
  updated_at?: string
}

export interface Pick6Selection {
  id: string
  pick6_entry_id: string
  match_id: string
  fighter_id: string // 'A' or 'B'
  fighter_name: string
  american_odds: number
  base_points: number
  finish_bonus: number
  underdog_bonus: number
  double_down_multiplier: number
  final_points: number
  is_winner: boolean | null
  is_double_down: boolean
  created_at: string
}

export interface Pick6Scoring {
  base_points: number
  finish_bonus: number // +50 if KO/TKO/Sub
  underdog_bonus: number // +10% if odds > +100
  double_down_multiplier: number // 2x if selected
  total_points: number
}

export interface UserStats {
  id: string
  user_id: string
  total_picks: number
  correct_picks: number
  total_points: number
  accuracy_percentage: number
  best_event_score: number
  current_streak: number
  longest_streak: number
  favorite_event_type?: string
  created_at: string
  updated_at: string
}

export interface EventParticipant {
  id: string
  event_id: string
  user_id: string
  joined_at: string
  total_points: number
  picks_submitted: boolean
}

export interface LeaderboardEntry {
  username: string
  total_points: number
  correct_picks: number
  total_picks: number
  accuracy_percentage: number
  events_participated?: number
}

export interface MatchWithPoints extends Match {
  user_pick?: Pick
  potential_points: {
    wrestler_a: number
    wrestler_b: number
  }
}

export interface EventWithStats extends Event {
  total_participants: number
  total_matches: number
  completed_matches: number
  user_participated: boolean
  user_picks_submitted: boolean
}

export interface PickSubmission {
  match_id: string
  selected_wrestler: 'A' | 'B'
  potential_points: number
}

export interface EventLeaderboard {
  event: Event
  entries: LeaderboardEntry[]
  user_rank?: number
  user_entry?: LeaderboardEntry
}

export interface OddsCalculation {
  favorite_points: number
  underdog_points: number
  odds_ratio: number
  favorite: 'A' | 'B'
}

export interface UserProfile {
  id: string
  username: string
  email: string
  stats: UserStats
  recent_events: EventWithStats[]
  achievements: Achievement[]
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlocked_at?: string
  progress?: number
  target?: number
}

// Form types for admin and user interfaces
export interface EventFormData {
  name: string
  description: string
  event_date: string
  picks_deadline: string
  event_type_id: string
  max_picks: number
  contest_type: 'match_picks' | 'pick_6'
  pick_count: number
}

export interface MatchFormData {
  weight_class: string
  wrestler_a: string
  wrestler_b: string
  match_order: number
  favorite: 'A' | 'B'
  odds_ratio: number
  american_odds?: number // For UI input - legacy
  american_odds_a?: number // Fighter A odds
  american_odds_b?: number // Fighter B odds
  base_points?: number // Override default 1000 points - legacy
  finish_type?: 'decision' | 'ko_tko' | 'submission' | null
  winner?: 'A' | 'B' | null
}

export interface MatchWithOdds extends MatchFormData {
  favorite_points: number
  underdog_points: number
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  has_more: boolean
}

// Validation types
export interface PickValidation {
  match_id: string
  is_valid: boolean
  errors: string[]
  deadline_passed: boolean
}

export interface EventValidation {
  is_valid: boolean
  errors: string[]
  can_join: boolean
  can_submit_picks: boolean
}

// Statistics and analytics types
export interface EventAnalytics {
  total_picks: number
  favorite_pick_percentage: number
  underdog_pick_percentage: number
  average_points_per_pick: number
  most_popular_pick: {
    match_id: string
    wrestler: 'A' | 'B'
    pick_count: number
  }
}

export interface UserAnalytics {
  favorite_accuracy: number
  underdog_accuracy: number
  best_event_type: string
  points_trend: Array<{
    date: string
    points: number
    cumulative_points: number
  }>
  monthly_stats: Array<{
    month: string
    total_picks: number
    correct_picks: number
    points_earned: number
  }>
} 