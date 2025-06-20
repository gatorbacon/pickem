"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/useUser'
import { Event, LeaderboardEntry, EventLeaderboard } from '@/lib/types'
import { getErrorMessage } from '@/lib/errors'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Pick6Leaderboard from '@/components/Pick6Leaderboard'

export default function LeaderboardPage() {
  const { user, loading: userLoading } = useUser()
  const [events, setEvents] = useState<Event[]>([])
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [eventLeaderboard, setEventLeaderboard] = useState<LeaderboardEntry[]>([])
  const [overallLeaderboard, setOverallLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'event' | 'overall'>('event')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: false })
      
      if (eventsError) throw eventsError
      setEvents(eventsData || [])

      // Set current event to the most recent one
      if (eventsData && eventsData.length > 0) {
        const recentEvent = eventsData[0]
        setCurrentEvent(recentEvent)
        await fetchEventLeaderboard(recentEvent.id)
      }

      // Fetch overall leaderboard
      await fetchOverallLeaderboard()

    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const fetchEventLeaderboard = async (eventId: string) => {
    try {
      const { data, error } = await supabase.rpc('get_event_leaderboard', {
        event_id_param: eventId
      })
      
      if (error) throw error
      setEventLeaderboard(data || [])
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const fetchOverallLeaderboard = async () => {
    try {
      const { data, error } = await supabase.rpc('get_overall_leaderboard')
      
      if (error) throw error
      setOverallLeaderboard(data || [])
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleEventChange = async (event: Event) => {
    setCurrentEvent(event)
    setError(null)
    await fetchEventLeaderboard(event.id)
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  const getPointsColor = (points: number) => {
    if (points >= 5000) return 'text-yellow-600 font-bold'
    if (points >= 3000) return 'text-orange-600 font-semibold'
    if (points >= 1000) return 'text-blue-600 font-medium'
    return 'text-gray-600'
  }

  if (userLoading || loading) {
    return <LoadingSpinner size="lg" text="Loading leaderboard..." />
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">Leaderboard</h1>
      
      <ErrorMessage error={error} className="mb-4" />

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'event' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('event')}
        >
          Event Leaderboard
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'overall' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('overall')}
        >
          Overall Leaderboard
        </button>
      </div>

      {/* Event Leaderboard Tab */}
      {activeTab === 'event' && (
        <div className="space-y-6">
          {/* Event Selector */}
          {events.length > 1 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold mb-3">Select Event</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map(event => (
                  <button
                    key={event.id}
                    onClick={() => handleEventChange(event)}
                    className={`p-4 rounded-lg border-2 text-left transition-colors ${
                      currentEvent?.id === event.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{event.name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      📅 {event.event_date}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {event.event_type}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Event Leaderboard */}
          {currentEvent && (
            <>
              {/* Pick 6 Leaderboard for Pick 6 Events */}
              {currentEvent.contest_type === 'pick_6' ? (
                <Pick6Leaderboard eventId={currentEvent.id} showDetails={true} />
              ) : (
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold">{currentEvent.name} Leaderboard</h2>
                    <p className="text-gray-600 text-sm mt-1">
                      Event Date: {currentEvent.event_date}
                    </p>
                  </div>
              <div className="divide-y divide-gray-200">
                {eventLeaderboard.length > 0 ? (
                  eventLeaderboard.map((entry, index) => (
                    <div key={entry.username} className="p-6 flex justify-between items-center hover:bg-gray-50">
                      <div className="flex items-center space-x-4">
                        <span className="text-2xl font-bold w-12">
                          {getRankIcon(index + 1)}
                        </span>
                        <div>
                          <div className="font-medium text-lg">{entry.username}</div>
                          <div className="text-sm text-gray-600">
                            {entry.correct_picks}/{entry.total_picks} picks correct
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${getPointsColor(entry.total_points)}`}>
                          {entry.total_points.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600">
                          {entry.accuracy_percentage.toFixed(1)}% accuracy
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    No participants yet for this event
                  </div>
                )}
              </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Overall Leaderboard Tab */}
      {activeTab === 'overall' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Overall Leaderboard</h2>
            <p className="text-gray-600 text-sm mt-1">
              Across all events and competitions
            </p>
          </div>
          <div className="divide-y divide-gray-200">
            {overallLeaderboard.length > 0 ? (
              overallLeaderboard.map((entry, index) => (
                <div key={entry.username} className="p-6 flex justify-between items-center hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl font-bold w-12">
                      {getRankIcon(index + 1)}
                    </span>
                    <div>
                      <div className="font-medium text-lg">{entry.username}</div>
                      <div className="text-sm text-gray-600">
                        {entry.correct_picks}/{entry.total_picks} picks • {entry.events_participated || 0} events
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${getPointsColor(entry.total_points)}`}>
                      {entry.total_points.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">
                      {entry.accuracy_percentage.toFixed(1)}% accuracy
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500">
                No participants yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-blue-600">
            {activeTab === 'event' ? eventLeaderboard.length : overallLeaderboard.length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {activeTab === 'event' ? 'Event Participants' : 'Total Participants'}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-green-600">
            {events.length}
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Total Events
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-purple-600">
            {activeTab === 'event' && eventLeaderboard.length > 0 
              ? Math.max(...eventLeaderboard.map(e => e.total_points)).toLocaleString()
              : activeTab === 'overall' && overallLeaderboard.length > 0
              ? Math.max(...overallLeaderboard.map(e => e.total_points)).toLocaleString()
              : '0'
            }
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Highest Score
          </div>
        </div>
      </div>
    </div>
  )
} 