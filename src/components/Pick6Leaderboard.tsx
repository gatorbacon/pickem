'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, Pick6Entry } from '@/lib/types'
import { formatPoints } from '@/lib/pick6-scoring'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'

interface Pick6LeaderboardEntry {
  rank: number
  username: string
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
    match_order: number
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

      // Fetch leaderboard entries with user information
      const { data: entriesData, error: entriesError } = await supabase
        .from('pick6_entries')
        .select(`
          id,
          user_id,
          total_points,
          picks_correct,
          is_complete,
          submitted_at
        `)
        .eq('event_id', eventId)
        .eq('is_complete', true)
        .order('total_points', { ascending: false })
        .order('submitted_at', { ascending: true })

      if (entriesError) throw entriesError

      if (!entriesData || entriesData.length === 0) {
        setEntries([])
        return
      }

      // Try to get actual user emails from auth.users
      let userEmails: Record<string, string> = {}
      try {
        const { data: usersData, error: usersError } = await supabase
          .from('auth.users')
          .select('id, email')
          .in('id', entriesData.map(entry => entry.user_id))
        
        if (usersData && !usersError) {
          userEmails = usersData.reduce((acc, user) => {
            acc[user.id] = user.email
            return acc
          }, {} as Record<string, string>)
        }
      } catch (e) {
        console.log('Could not fetch user emails, using fallback mapping')
      }

      // Fetch all picks for these entries with match information
      const entryIds = entriesData.map(entry => entry.id)
      const { data: allPicksData, error: picksError } = await supabase
        .from('pick6_selections')
        .select(`
          pick6_entry_id,
          fighter_name,
          final_points,
          is_winner,
          is_double_down,
          american_odds,
          base_points,
          finish_bonus,
          underdog_bonus,
          match_id,
          matches!inner(match_order)
        `)
        .in('pick6_entry_id', entryIds)

      if (picksError) {
        console.warn('Error fetching picks data:', picksError)
      }

      // Group picks by entry ID
      const picksByEntry = (allPicksData || []).reduce((acc, pick) => {
        if (!acc[pick.pick6_entry_id]) {
          acc[pick.pick6_entry_id] = []
        }
        acc[pick.pick6_entry_id].push({
          ...pick,
          match_order: pick.matches?.match_order || 0
        })
        return acc
      }, {} as Record<string, any[]>)

      // Combine entries with their picks and determine usernames
      const entriesWithPicks = entriesData.map((entry, index) => {
        const userId = entry.user_id
        let username = 'Unknown User'
        let userEmail = userEmails[userId] || ''

        // If we have an email, extract username from it
        if (userEmail) {
          username = userEmail.split('@')[0]
        } else {
          // Fallback: try to determine username from user ID patterns
          // Updated with actual user ID suffixes from database
          const userIdSuffix = userId.slice(-8)
          
          // Map known user ID suffixes to usernames
          // Updated with actual user ID suffixes from database
          const knownUserMappings: Record<string, string> = {
            'ad1a9c8c': 'livestrong67',     // 88dc6880-fe38-4b6c-bbd0-7e6cad1a9c8c
            '9319f209': 'micahthompson859', // f44a2735-6ed4-4e74-a31b-f01d9319f209
            'c70132d6': 'kdt4g'             // 101603ba-ca31-4d47-91ba-0c26c70132d6
          }
          
          username = knownUserMappings[userIdSuffix] || `User_${userIdSuffix}`
        }

        const picks = (picksByEntry[entry.id] || []).sort((a, b) => 
          a.match_order - b.match_order
        )

        return {
          rank: index + 1,
          username,
          user_email: userEmail || `${username}@example.com`,
          total_points: entry.total_points || 0,
          picks_correct: entry.picks_correct || 0,
          is_complete: entry.is_complete,
          submitted_at: entry.submitted_at,
          picks
        }
      })

      setEntries(entriesWithPicks)

    } catch (error: any) {
      console.error('Leaderboard fetch error:', error)
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
        // For pending picks, calculate maximum possible points based on odds
        let basePoints: number
        if (pick.american_odds >= 0) {
          basePoints = pick.american_odds
        } else {
          basePoints = Math.floor(10000 / Math.abs(pick.american_odds))
        }
        
        const finishBonus = 50 // Maximum finish bonus
        const underdogBonus = pick.american_odds >= 100 ? Math.floor(basePoints * 0.1) : 0
        const maxPoints = (basePoints + finishBonus + underdogBonus) * (pick.is_double_down ? 2 : 1)
        return sum + maxPoints
      }
      return sum + (pick.final_points || 0)
    }, 0)

    return {
      current: currentPoints,
      potential: potentialPoints
    }
  }

  const handleEntryClick = (entryIndex: number) => {
    if (expandedEntry === entryIndex) {
      // If clicking the same entry, collapse it
      setExpandedEntry(null)
    } else {
      // Expand the clicked entry (and collapse any other)
      setExpandedEntry(entryIndex)
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

      {/* Debug Info - Remove this after testing */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          <p><strong>Debug Info:</strong></p>
          <p>Entries found: {entries.length}</p>
          <p>Event ID: {eventId}</p>
          {entries.length > 0 && (
            <div>
              <p>First entry picks: {entries[0].picks.length}</p>
              <p>Usernames: {entries.map(e => e.username).join(', ')}</p>
            </div>
          )}
        </div>
      )}

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
              const isExpanded = expandedEntry === index
              
              return (
                <div key={index} className="transition-all duration-200">
                  {/* Compact Row - Always Visible */}
                  <div 
                    className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleEntryClick(index)}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left Side: Rank and Username */}
                      <div className="flex items-center space-x-4">
                        <div className="text-4xl font-normal text-gray-900 w-12">
                          {entry.rank}
                        </div>
                        <div className="font-semibold text-xl text-gray-900">
                          {entry.username}
                        </div>
                      </div>

                      {/* Right Side: Points and Expand Icon */}
                      <div className="flex items-center space-x-6">
                        {/* Points */}
                        <div className="text-right">
                          <div className="text-4xl font-bold text-blue-600">
                            {Math.round(entry.total_points)}
                          </div>
                          <div className="text-sm text-gray-600">
                            points
                          </div>
                        </div>
                        
                        {/* Potential Points */}
                        <div className="text-right">
                          <div className="text-2xl font-semibold text-blue-500">
                            {Math.round(points.potential)}
                          </div>
                          <div className="text-xs text-gray-500">
                            potential
                          </div>
                        </div>

                        {/* Expand/Collapse Icon */}
                        <div className="text-gray-400 ml-4">
                          <svg 
                            className={`w-6 h-6 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details - Conditionally Visible */}
                  {isExpanded && (
                    <div className="px-6 pb-6 bg-gray-50 border-t border-gray-100">
                      <div className="pt-4">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">
                          {entry.username}'s Picks ({entry.picks_correct}/{entry.picks.length} correct)
                        </h4>
                        
                        {entry.picks.length === 0 ? (
                          <div className="text-gray-500 text-sm">No picks data</div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {entry.picks.map((pick, pickIndex) => (
                              <div 
                                key={pickIndex} 
                                className={`p-4 rounded-lg border-2 ${
                                  pick.is_winner === true 
                                    ? 'border-green-500 bg-green-50' 
                                    : pick.is_winner === false
                                    ? 'border-red-500 bg-red-50'
                                    : 'border-gray-300 bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  {/* Fighter Info */}
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      {/* Win/Loss indicator */}
                                      <div className="w-6 h-6 flex items-center justify-center">
                                        {pick.is_winner === true && (
                                          <span className="text-green-600 text-lg font-bold">✓</span>
                                        )}
                                        {pick.is_winner === false && (
                                          <span className="text-red-600 text-lg font-bold">✗</span>
                                        )}
                                        {pick.is_winner === null && (
                                          <span className="text-gray-400 text-lg">•</span>
                                        )}
                                      </div>
                                      
                                      {/* Fight Number */}
                                      <span className="text-xs text-gray-500 font-medium">
                                        Fight #{pick.match_order}
                                      </span>
                                    </div>
                                    
                                    {/* Fighter name with double down highlighting */}
                                    <div 
                                      className={`font-semibold text-lg mb-1 ${
                                        pick.is_double_down 
                                          ? 'bg-yellow-500 text-white px-2 py-1 rounded font-bold inline-block' 
                                          : 'text-gray-900'
                                      }`}
                                    >
                                      {pick.fighter_name || 'Unknown Fighter'}
                                      {pick.is_double_down && (
                                        <span className="ml-1 text-sm">2x</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Points */}
                                  <div className="text-right ml-4">
                                    <div className={`text-2xl font-bold ${
                                      pick.is_winner === true 
                                        ? 'text-green-600' 
                                        : pick.is_winner === false
                                        ? 'text-red-600'
                                        : 'text-gray-500'
                                    }`}>
                                      {pick.final_points || 0}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      points
                                    </div>
                                  </div>
                                </div>

                                {/* Points Breakdown for Winners */}
                                {pick.is_winner === true && pick.final_points > 0 && (
                                  <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
                                    <div className="space-y-1">
                                      <div className="flex justify-between">
                                        <span>Base:</span>
                                        <span>{pick.base_points || 0}pts</span>
                                      </div>
                                      {pick.finish_bonus > 0 && (
                                        <div className="flex justify-between text-orange-600">
                                          <span>Finish bonus:</span>
                                          <span>+{pick.finish_bonus}pts</span>
                                        </div>
                                      )}
                                      {pick.underdog_bonus > 0 && (
                                        <div className="flex justify-between text-purple-600">
                                          <span>Underdog bonus:</span>
                                          <span>+{pick.underdog_bonus}pts</span>
                                        </div>
                                      )}
                                      {pick.is_double_down && (
                                        <div className="flex justify-between text-yellow-600 font-semibold">
                                          <span>Double down:</span>
                                          <span>×2</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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