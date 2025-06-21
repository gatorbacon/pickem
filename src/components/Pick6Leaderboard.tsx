'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, Pick6Entry } from '@/lib/types'
import { formatPoints } from '@/lib/pick6-scoring'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'

interface Pick6LeaderboardEntry {
  rank: number
  user_email: string
  total_points: number
  picks_correct: number
  is_complete: boolean
  submitted_at: string
  picks: Array<{
    fighter_name: string
    final_points: number
    is_winner: boolean | null
    is_double_down: boolean
    american_odds: number
    base_points: number
    finish_bonus: number
    underdog_bonus: number
  }>
}

interface Pick6LeaderboardProps {
  eventId: string
  showDetails?: boolean
}

export default function Pick6Leaderboard({ eventId, showDetails = false }: Pick6LeaderboardProps) {
  const [event, setEvent] = useState<Event | null>(null)
  const [entries, setEntries] = useState<Pick6LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLeaderboard()
  }, [eventId])

  const fetchLeaderboard = async () => {
    try {
      setLoading(true)

      // Fetch event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError
      setEvent(eventData)

      // Fetch leaderboard data with detailed picks
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('pick6_leaderboard')
        .select('*')
        .eq('event_id', eventId)
        .order('rank')

      if (leaderboardError) throw leaderboardError

      // Fetch detailed picks for all entries
      const entriesWithPicks = await Promise.all(
        (leaderboardData || []).map(async (entry) => {
          // Find the pick6_entry_id for this user and event
          const { data: entryData, error: entryError } = await supabase
            .from('pick6_entries')
            .select('id')
            .eq('user_id', entry.user_id)
            .eq('event_id', eventId)
            .single()

          if (entryError) {
            console.warn('Error fetching entry for user:', entry.user_email, entryError)
            return { ...entry, picks: [] }
          }

          const { data: picksData, error: picksError } = await supabase
            .from('pick6_selections')
            .select(`
              fighter_name,
              final_points,
              is_winner,
              is_double_down,
              american_odds,
              base_points,
              finish_bonus,
              underdog_bonus
            `)
            .eq('pick6_entry_id', entryData.id)
            .order('created_at')

          if (picksError) {
            console.warn('Error fetching picks for user:', entry.user_email, picksError)
            return { ...entry, picks: [] }
          }

          return {
            ...entry,
            picks: picksData || []
          }
        })
      )

      setEntries(entriesWithPicks)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  // Calculate potential points for remaining picks
  const calculatePotentialPoints = (picks: Pick6LeaderboardEntry['picks']) => {
    const currentPoints = picks.reduce((sum, pick) => sum + (pick.final_points || 0), 0)
    
    // Calculate maximum potential points for remaining picks
    const potentialPoints = picks.reduce((sum, pick) => {
      if (pick.is_winner === null) {
        // For pending picks, calculate maximum possible points
        const basePoints = pick.american_odds >= 0 ? pick.american_odds : Math.floor(10000 / Math.abs(pick.american_odds))
        const finishBonus = 50 // Maximum finish bonus
        const underdog_bonus = pick.american_odds >= 100 ? Math.floor(basePoints * 0.1) : 0
        const maxPoints = (basePoints + finishBonus + underdog_bonus) * (pick.is_double_down ? 2 : 1)
        return sum + maxPoints
      }
      return sum + (pick.final_points || 0)
    }, 0)

    return {
      current: currentPoints,
      potential: potentialPoints
    }
  }

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading leaderboard..." />
  }

  if (!event) {
    return <ErrorMessage error="Event not found" />
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <ErrorMessage error={error} className="mb-6" />

      {/* Header */}
      <div className="bg-gradient-to-r from-green-900 to-red-900 text-white rounded-lg p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-gritty text-3xl tracking-wide">PICK 6 LEADERBOARD</h1>
            <h2 className="text-xl opacity-90">{event.name}</h2>
            <p className="text-sm opacity-75 mt-1">
              📅 {new Date(event.event_date).toLocaleDateString()} • 
              👥 {entries.length} participants
            </p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              {event.pick_count || 6}
            </div>
            <div className="text-sm opacity-75">fighters to pick</div>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      {entries.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-gray-500 text-lg">No entries yet</div>
          <p className="text-gray-400 mt-2">Be the first to submit your picks!</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="divide-y divide-gray-200">
            {entries.map((entry, index) => {
              const points = calculatePotentialPoints(entry.picks)
              
              return (
                <div key={index} className="p-6">
                  <div className="grid grid-cols-4 gap-6 items-center">
                    {/* Column 1: Rank */}
                    <div className="text-4xl font-normal text-gray-900">
                      {entry.rank}
                    </div>

                    {/* Column 2: Username */}
                    <div className="font-semibold text-lg text-gray-900">
                      {entry.user_email.split('@')[0]}
                    </div>

                    {/* Column 3: Picks with win/loss indicators */}
                    <div className="space-y-1">
                      {entry.picks.map((pick, pickIndex) => (
                        <div key={pickIndex} className="flex items-center space-x-2">
                          {/* Win/Loss indicator */}
                          <div className="w-4 h-4 flex items-center justify-center">
                            {pick.is_winner === true && (
                              <span className="text-green-600 text-sm">✓</span>
                            )}
                            {pick.is_winner === false && (
                              <span className="text-red-600 text-sm">✗</span>
                            )}
                          </div>
                          
                          {/* Fighter name with double down highlighting */}
                          <span 
                            className={`text-sm ${
                              pick.is_double_down 
                                ? 'bg-yellow-500 text-white px-2 py-1 rounded font-semibold' 
                                : 'text-gray-900'
                            }`}
                          >
                            {pick.fighter_name}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Column 4: Points */}
                    <div className="text-right">
                      <div className="text-4xl font-bold text-blue-600">
                        {Math.round(points.current)}
                      </div>
                      <div className="text-sm text-gray-600">
                        points
                      </div>
                      <div className="text-sm text-blue-500 mt-1">
                        {Math.round(points.potential)}
                      </div>
                      <div className="text-xs text-gray-500">
                        potential
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {entries.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatPoints(Math.max(...entries.map(e => e.total_points)))}
            </div>
            <div className="text-sm text-gray-600">Highest Score</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatPoints(entries.reduce((sum, e) => sum + e.total_points, 0) / entries.length)}
            </div>
            <div className="text-sm text-gray-600">Average Score</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {Math.max(...entries.map(e => e.picks_correct))}
            </div>
            <div className="text-sm text-gray-600">Most Correct</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {entries.filter(e => e.is_complete).length}
            </div>
            <div className="text-sm text-gray-600">Complete Entries</div>
          </div>
        </div>
      )}
    </div>
  )
} 