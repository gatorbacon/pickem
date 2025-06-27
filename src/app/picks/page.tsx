'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { Event, Match, Pick, MatchWithPoints, EventWithStats } from '@/lib/types'
import { getPickingPoints, formatOdds, getWrestlerRole, getPointsColorClass } from '@/lib/points'
import { handleSupabaseError, getErrorMessage } from '@/lib/errors'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Pick6Interface from '@/components/Pick6Interface'

export default function PicksPage() {
  const { user, loading: userLoading } = useUser()
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<MatchWithPoints[]>([])
  const [picks, setPicks] = useState<{ [matchId: string]: 'A' | 'B' }>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!userLoading && user) {
      fetchEvents()
    }
  }, [user, userLoading])

  const fetchEvents = async () => {
    try {
      setLoading(true)
      
      // Fetch all active events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          event_types(name, icon)
        `)
        .eq('is_active', true)
        .order('event_date', { ascending: true })
      
      if (eventsError) throw eventsError

      // Fetch user's participation data separately
      const eventIds = eventsData?.map(e => e.id) || []
      const { data: participantData, error: participantError } = await supabase
        .from('event_participants')
        .select('event_id, picks_submitted, total_points')
        .eq('user_id', user?.id)
        .in('event_id', eventIds)
      
      if (participantError) throw participantError

      // Transform events data
      const transformedEvents: EventWithStats[] = (eventsData || []).map(event => {
        const userParticipation = participantData?.find(p => p.event_id === event.id)
        
        return {
          ...event,
          total_participants: 0, // We'll need to fetch this separately if needed
          total_matches: 0, // Will be filled when we fetch matches
          completed_matches: 0,
          user_participated: !!userParticipation,
          user_picks_submitted: userParticipation?.picks_submitted || false
        }
      })

      setEvents(transformedEvents)

      // Set current event to the first active one
      if (transformedEvents.length > 0) {
        const firstEvent = transformedEvents[0]
        setCurrentEvent(firstEvent)
        await fetchMatches(firstEvent.id)
      }

    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const fetchMatches = async (eventId: string) => {
    try {
      // Fetch matches with user picks
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select(`
          *,
          picks!left(id, selected_wrestler, points_earned, is_correct)
        `)
        .eq('event_id', eventId)
        .eq('picks.user_id', user?.id)
        .order('match_order', { ascending: true })
      
      if (matchesError) throw matchesError

      // Transform matches data
      const transformedMatches: MatchWithPoints[] = (matchesData || []).map(match => {
        const points = getPickingPoints(match)
        const userPick = match.picks?.[0]
        
        return {
          ...match,
          user_pick: userPick,
          potential_points: points
        }
      })

      setMatches(transformedMatches)

      // Set current picks
      const currentPicks: { [matchId: string]: 'A' | 'B' } = {}
      transformedMatches.forEach(match => {
        if (match.user_pick) {
          currentPicks[match.id] = match.user_pick.selected_wrestler
        }
      })
      setPicks(currentPicks)

    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handlePickChange = (matchId: string, wrestler: 'A' | 'B') => {
    setPicks({ ...picks, [matchId]: wrestler })
    setError(null)
    setSuccess(null)
  }

  const handleSubmitPicks = async () => {
    if (!user || !currentEvent) return

    try {
      setSubmitting(true)
      setError(null)

      // Check if picks deadline has passed
      const deadline = new Date(currentEvent.picks_deadline)
      if (new Date() > deadline) {
        throw new Error('Picks deadline has passed')
      }

      // Validate picks
      const pickEntries = Object.entries(picks)
      if (pickEntries.length === 0) {
        throw new Error('Please make at least one pick')
      }

      // Check max picks limit
      if (pickEntries.length > currentEvent.max_picks) {
        throw new Error(`You can only make ${currentEvent.max_picks} picks for this event`)
      }

      // Prepare picks data
      const picksData = pickEntries.map(([matchId, wrestler]) => ({
        user_id: user.id,
        match_id: matchId,
        selected_wrestler: wrestler,
        points_earned: 0, // Will be calculated when match is scored
        is_correct: null
      }))

      // Delete existing picks for this event
      const matchIds = matches.map(m => m.id)
      await supabase
        .from('picks')
        .delete()
        .eq('user_id', user.id)
        .in('match_id', matchIds)

      // Insert new picks
      const { error: picksError } = await supabase
        .from('picks')
        .insert(picksData)

      if (picksError) throw handleSupabaseError(picksError)

      // Join event if not already joined
      const { error: participantError } = await supabase
        .from('event_participants')
        .upsert({
          event_id: currentEvent.id,
          user_id: user.id,
          picks_submitted: true,
          total_points: 0
        })

      if (participantError) throw handleSupabaseError(participantError)

      setSuccess(`Successfully submitted ${pickEntries.length} picks!`)
      await fetchEvents() // Refresh to update participation status

    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const calculatePotentialPoints = () => {
    return Object.entries(picks).reduce((total, [matchId, wrestler]) => {
      const match = matches.find(m => m.id === matchId)
      if (!match) return total
      
      return total + (wrestler === 'A' ? match.potential_points.wrestler_a : match.potential_points.wrestler_b)
    }, 0)
  }

  const getDeadlineStatus = (deadline: string) => {
    const deadlineDate = new Date(deadline)
    const now = new Date()
    const timeDiff = deadlineDate.getTime() - now.getTime()
    
    if (timeDiff < 0) {
      return { status: 'passed', text: 'Deadline passed', color: 'text-red-600' }
    } else if (timeDiff < 3600000) { // Less than 1 hour
      return { status: 'urgent', text: `${Math.floor(timeDiff / 60000)} minutes left`, color: 'text-orange-600' }
    } else if (timeDiff < 86400000) { // Less than 24 hours
      return { status: 'soon', text: `${Math.floor(timeDiff / 3600000)} hours left`, color: 'text-yellow-600' }
    } else {
      return { status: 'open', text: deadlineDate.toLocaleDateString(), color: 'text-green-600' }
    }
  }

  if (userLoading || loading) {
    return <LoadingSpinner size="lg" text="Loading picks..." />
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Please log in to make picks</h1>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">No Active Events</h1>
        <p className="text-gray-600">There are no events currently accepting picks.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">Make Your Picks</h1>
      
      <ErrorMessage error={error} className="mb-4" />
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      {/* Event Selection */}
      {events.length > 1 && (
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3">Select Event</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map(event => (
              <button
                key={event.id}
                onClick={() => {
                  console.log('🎯 Event clicked:', {
                    eventId: event.id,
                    eventName: event.name,
                    userId: user?.id,
                    eventObject: event
                  })
                  setCurrentEvent(event)
                  fetchMatches(event.id)
                }}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  currentEvent?.id === event.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">{event.name}</div>
                <div className="text-sm text-gray-600 mt-1">{event.description}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">
                    📅 {event.event_date}
                  </span>
                  <span className={`text-xs ${getDeadlineStatus(event.picks_deadline).color}`}>
                    ⏰ {getDeadlineStatus(event.picks_deadline).text}
                  </span>
                </div>
                {event.user_picks_submitted && (
                  <div className="mt-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                    ✓ Picks submitted
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {currentEvent && (
        <>
          {/* Pick 6 Interface for Pick 6 Events */}
          {currentEvent.contest_type === 'pick_6' ? (
            <>
              {console.log('🚀 About to render Pick6Interface with:', {
                eventId: currentEvent.id,
                userId: user.id,
                pickCount: currentEvent.pick_count || 6,
                currentEventObject: currentEvent
              })}
              <Pick6Interface 
                key={currentEvent.id}
                eventId={currentEvent.id}
                userId={user.id}
                pickCount={currentEvent.pick_count || 6}
              />
            </>
          ) : (
            <>
              {/* Traditional Match Picks Interface */}
              {/* Event Info */}
              <div className="mb-6 bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold">{currentEvent.name}</h2>
                <p className="text-gray-600 mt-1">{currentEvent.description}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Event Date</div>
                <div className="font-medium">{currentEvent.event_date}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-blue-600">{matches.length}</div>
                <div className="text-sm text-gray-600">Matches</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{Object.keys(picks).length}</div>
                <div className="text-sm text-gray-600">Your Picks</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-purple-600">{calculatePotentialPoints()}</div>
                <div className="text-sm text-gray-600">Potential Points</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className={`text-2xl font-bold ${getDeadlineStatus(currentEvent.picks_deadline).color}`}>
                  {getDeadlineStatus(currentEvent.picks_deadline).status === 'passed' ? '⏰' : '✓'}
                </div>
                <div className="text-sm text-gray-600">
                  {getDeadlineStatus(currentEvent.picks_deadline).text}
                </div>
              </div>
            </div>
          </div>

          {/* Matches */}
          <div className="space-y-4 mb-6">
            {matches.map(match => {
              const deadlineStatus = getDeadlineStatus(currentEvent.picks_deadline)
              const isDisabled = deadlineStatus.status === 'passed'
              const userPick = picks[match.id]
              const wrestlerARole = getWrestlerRole(match, 'A')
              const wrestlerBRole = getWrestlerRole(match, 'B')

              return (
                <div key={match.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-4">
                      <span className="text-lg font-semibold">{match.weight_class}</span>
                      <span className="text-gray-500">#{match.match_order}</span>
                      {match.odds_ratio > 1.1 && (
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                          {formatOdds(match.odds_ratio)} odds
                        </span>
                      )}
                    </div>
                    {match.user_pick && (
                      <div className="text-sm text-green-600 font-medium">
                        ✓ Pick submitted
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Wrestler A */}
                    <button
                      onClick={() => !isDisabled && handlePickChange(match.id, 'A')}
                      disabled={isDisabled}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        userPick === 'A'
                          ? 'border-blue-500 bg-blue-50'
                          : isDisabled
                          ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-medium text-lg mb-2">{match.wrestler_a}</div>
                        <div className={`text-2xl font-bold mb-1 ${getPointsColorClass(wrestlerARole === 'underdog')}`}>
                          {match.potential_points.wrestler_a}
                        </div>
                        <div className="text-sm text-gray-600">
                          points {wrestlerARole !== 'even' && `(${wrestlerARole})`}
                        </div>
                      </div>
                    </button>

                    {/* Wrestler B */}
                    <button
                      onClick={() => !isDisabled && handlePickChange(match.id, 'B')}
                      disabled={isDisabled}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        userPick === 'B'
                          ? 'border-blue-500 bg-blue-50'
                          : isDisabled
                          ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-medium text-lg mb-2">{match.wrestler_b}</div>
                        <div className={`text-2xl font-bold mb-1 ${getPointsColorClass(wrestlerBRole === 'underdog')}`}>
                          {match.potential_points.wrestler_b}
                        </div>
                        <div className="text-sm text-gray-600">
                          points {wrestlerBRole !== 'even' && `(${wrestlerBRole})`}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Submit Button */}
          {Object.keys(picks).length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Ready to Submit?</h3>
                  <p className="text-gray-600">
                    {Object.keys(picks).length} picks • {calculatePotentialPoints()} potential points
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Max picks allowed</div>
                  <div className="font-medium">{currentEvent.max_picks}</div>
                </div>
              </div>
              
              <button
                onClick={handleSubmitPicks}
                disabled={submitting || getDeadlineStatus(currentEvent.picks_deadline).status === 'passed'}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                  submitting || getDeadlineStatus(currentEvent.picks_deadline).status === 'passed'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {submitting ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Submitting picks...</span>
                  </div>
                ) : getDeadlineStatus(currentEvent.picks_deadline).status === 'passed' ? (
                  'Deadline Passed'
                ) : (
                  'Submit Picks'
                )}
              </button>
            </div>
          )}
            </>
          )}
        </>
      )}
    </div>
  )
}