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
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null)

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

      // Fetch leaderboard data
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('pick6_leaderboard')
        .select('*')
        .eq('event_id', eventId)
        .order('rank')

      if (leaderboardError) throw leaderboardError

      // Fetch detailed picks if needed
      if (showDetails) {
        const entriesWithPicks = await Promise.all(
          (leaderboardData || []).map(async (entry) => {
            const { data: picksData, error: picksError } = await supabase
              .from('pick6_selections')
              .select(`
                fighter_name,
                final_points,
                is_winner,
                is_double_down
              `)
              .eq('pick6_entry_id', entry.user_id) // This might need adjustment based on the view structure
              .order('created_at')

            if (picksError) {
              console.warn('Error fetching picks for user:', entry.user_email, picksError)
            }

            return {
              ...entry,
              picks: picksData || []
            }
          })
        )
        setEntries(entriesWithPicks)
      } else {
        setEntries(leaderboardData || [])
      }

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getPositionChange = (rank: number) => {
    // This would require historical data to show position changes
    // For now, just return neutral
    return 0
  }

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  const getAccuracyPercentage = (correct: number, total: number) => {
    if (total === 0) return 0
    return Math.round((correct / total) * 100)
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
            {entries.map((entry, index) => (
              <div key={index} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl font-bold min-w-[60px]">
                      {getRankDisplay(entry.rank)}
                    </div>
                    <div>
                      <div className="font-semibold text-lg">
                        {entry.user_email.split('@')[0]}
                      </div>
                      <div className="text-sm text-gray-600">
                        {entry.picks_correct}/{event.pick_count || 6} correct • 
                        {getAccuracyPercentage(entry.picks_correct, event.pick_count || 6)}% accuracy
                      </div>
                      {entry.submitted_at && (
                        <div className="text-xs text-gray-500">
                          Submitted {new Date(entry.submitted_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatPoints(entry.total_points)}
                    </div>
                    <div className="text-sm text-gray-600">points</div>
                    {!entry.is_complete && (
                      <div className="text-xs text-orange-600 font-medium">
                        Incomplete
                      </div>
                    )}
                  </div>

                  {showDetails && entry.picks && entry.picks.length > 0 && (
                    <button
                      onClick={() => setExpandedEntry(expandedEntry === index ? null : index)}
                      className="ml-4 text-blue-600 hover:text-blue-800"
                    >
                      {expandedEntry === index ? '▼' : '▶'}
                    </button>
                  )}
                </div>

                {/* Expanded Pick Details */}
                {showDetails && expandedEntry === index && entry.picks && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h4 className="font-semibold mb-4">Pick Details:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {entry.picks.map((pick, pickIndex) => (
                        <div
                          key={pickIndex}
                          className={`p-4 rounded-lg border-2 ${
                            pick.is_winner === true
                              ? 'border-green-500 bg-green-50'
                              : pick.is_winner === false
                              ? 'border-red-500 bg-red-50'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold">
                                {pick.fighter_name}
                                {pick.is_double_down && (
                                  <span className="ml-2 text-xs bg-orange-500 text-white px-2 py-1 rounded">
                                    2X
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                {pick.is_winner === true && '✅ Winner'}
                                {pick.is_winner === false && '❌ Lost'}
                                {pick.is_winner === null && '⏳ Pending'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg">
                                {formatPoints(pick.final_points)}
                              </div>
                              <div className="text-xs text-gray-500">points</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
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