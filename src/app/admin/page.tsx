"use client"

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Event, EventType, Match, EventFormData, MatchFormData } from '@/lib/types'
import { validateEvent, validateMatch, validateOrThrow } from '@/lib/validation'
import { 
  calculateMatchPointsFromAmerican, 
  formatAmericanOdds, 
  getAmericanOddsDescription,
  validateAmericanOdds,
  americanOddsToDecimal,
  decimalToAmericanOdds
} from '@/lib/points'
import { handleSupabaseError, getErrorMessage } from '@/lib/errors'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

export default function AdminPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'matches' | 'results'>('events')

  // Form states
  const [eventForm, setEventForm] = useState<EventFormData>({
    name: '',
    description: '',
    event_date: '',
    picks_deadline: '',
    event_type_id: '',
    max_picks: 10,
    contest_type: 'pick_6',
    pick_count: 6
  })

  const [matchForm, setMatchForm] = useState<MatchFormData>({
    weight_class: '',
    wrestler_a: '',
    wrestler_b: '',
    match_order: 1,
    favorite: 'A',
    odds_ratio: 1.0,
    american_odds: 0, // Default to pick-em - legacy
    american_odds_a: -110, // Default favorite odds
    american_odds_b: +110, // Default underdog odds
    base_points: 1000 // Default base points - legacy
  })

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null)
  const [editMatchForm, setEditMatchForm] = useState<MatchFormData>({
    weight_class: '',
    wrestler_a: '',
    wrestler_b: '',
    match_order: 1,
    favorite: 'A',
    odds_ratio: 1.0,
    american_odds: 0,
    american_odds_a: -110,
    american_odds_b: +110,
    base_points: 1000
  })

  const fetchMatches = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('event_id', eventId)
        .order('match_order', { ascending: true })
      
      if (error) throw error
      setMatches(data || [])
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch event types
      const { data: eventTypesData, error: eventTypesError } = await supabase
        .from('event_types')
        .select('*')
        .order('name')
      
      if (eventTypesError) throw eventTypesError
      setEventTypes(eventTypesData || [])

      // Fetch events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          event_types(name, icon)
        `)
        .order('event_date', { ascending: false })
      
      if (eventsError) throw eventsError
      setEvents(eventsData || [])

      // Set current event to the most recent active one
      const activeEvent = eventsData?.find(e => e.is_active) || eventsData?.[0]
      if (activeEvent) {
        setCurrentEvent(activeEvent)
        await fetchMatches(activeEvent.id)
      }

    } catch (error) {
      setError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [fetchMatches])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleEventFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    let updatedForm = { ...eventForm, [name]: value }
    
    // Convert numeric fields
    if (name === 'max_picks' || name === 'pick_count') {
      updatedForm[name] = parseInt(value) || (name === 'pick_count' ? 6 : 10)
    }
    
    setEventForm(updatedForm)
  }

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      // Validate form
      const validation = validateEvent({
        name: eventForm.name,
        event_date: eventForm.event_date,
        picks_deadline: eventForm.picks_deadline
      })
      
      // Debug logging
      console.log('Event validation:', {
        data: {
          name: eventForm.name,
          event_date: eventForm.event_date,
          picks_deadline: eventForm.picks_deadline
        },
        validation,
        eventDate: new Date(eventForm.event_date),
        deadline: new Date(eventForm.picks_deadline)
      })
      
      validateOrThrow(validation, 'Event validation')

      // Get event type details
      const eventType = eventTypes.find(et => et.id === eventForm.event_type_id)
      
      const { data, error } = await supabase.from('events').insert([{
        name: eventForm.name,
        description: eventForm.description,
        event_date: eventForm.event_date,
        picks_deadline: eventForm.picks_deadline,
        event_type: eventType?.name || 'wrestling',
        event_type_id: eventForm.event_type_id,
        max_picks: eventForm.max_picks,
        contest_type: eventForm.contest_type,
        pick_count: eventForm.pick_count,
        is_active: true
      }]).select().single()

      if (error) throw handleSupabaseError(error)
      
      setCurrentEvent(data)
      setEvents([data, ...events])
      setEventForm({
        name: '',
        description: '',
        event_date: '',
        picks_deadline: '',
        event_type_id: '',
        max_picks: 10,
        contest_type: 'pick_6',
        pick_count: 6
      })
      setActiveTab('matches')

    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleMatchFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    let updatedForm = { ...matchForm, [name]: value }
    
    // Convert numeric fields to proper types
    if (name === 'match_order') {
      updatedForm.match_order = parseInt(value) || 1
    } else if (name === 'american_odds') {
      const americanOdds = parseFloat(value)
      if (!isNaN(americanOdds)) {
        updatedForm.american_odds = americanOdds
        updatedForm.odds_ratio = americanOddsToDecimal(americanOdds)
      }
    } else if (name === 'american_odds_a' || name === 'american_odds_b') {
      const americanOdds = parseFloat(value)
      if (!isNaN(americanOdds)) {
        updatedForm[name] = americanOdds
      }
    } else if (name === 'odds_ratio') {
      updatedForm.odds_ratio = parseFloat(value) || 1.0
    } else if (name === 'base_points') {
      updatedForm.base_points = parseInt(value) || 1000
    }
    
    setMatchForm(updatedForm)
  }

  const handleAddMatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!currentEvent) return

    try {
      // Validate form
      const validation = validateMatch({
        weight_class: matchForm.weight_class,
        wrestler_a: matchForm.wrestler_a,
        wrestler_b: matchForm.wrestler_b,
        match_order: matchForm.match_order
      })
      validateOrThrow(validation, 'Match validation')

      // Prepare match data based on contest type
      const matchData = {
        event_id: currentEvent.id,
        weight_class: matchForm.weight_class,
        wrestler_a: matchForm.wrestler_a,
        wrestler_b: matchForm.wrestler_b,
        match_order: matchForm.match_order
      }

      if (currentEvent.contest_type === 'pick_6') {
        // For Pick 6, store individual fighter odds
        matchData.american_odds_a = matchForm.american_odds_a || -110
        matchData.american_odds_b = matchForm.american_odds_b || +110
      } else {
        // For traditional match picks, calculate points and use legacy fields
        const points = calculateMatchPointsFromAmerican(matchForm.american_odds || 0, matchForm.base_points || 1000)
        matchData.favorite = matchForm.favorite
        matchData.odds_ratio = matchForm.odds_ratio
        matchData.favorite_points = points.favorite_points
        matchData.underdog_points = points.underdog_points
      }

      const { error } = await supabase.from('matches').insert([matchData])

      if (error) throw handleSupabaseError(error)
      
      await fetchMatches(currentEvent.id)
      setMatchForm({
        weight_class: '',
        wrestler_a: '',
        wrestler_b: '',
        match_order: matches.length + 1,
        favorite: 'A',
        odds_ratio: 1.0,
        american_odds: 0,
        american_odds_a: -110,
        american_odds_b: +110,
        base_points: 1000
      })

    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleEditClick = (match: Match) => {
    setEditingMatchId(match.id)
    setEditMatchForm({
      weight_class: match.weight_class,
      wrestler_a: match.wrestler_a,
      wrestler_b: match.wrestler_b,
      match_order: match.match_order,
      favorite: match.favorite || 'A',
      odds_ratio: match.odds_ratio,
      american_odds: decimalToAmericanOdds(match.odds_ratio),
      american_odds_a: match.american_odds_a || -110,
      american_odds_b: match.american_odds_b || +110,
      base_points: match.underdog_points || 1000 // Use existing underdog points as base
    })
  }

  const handleUpdateMatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!currentEvent || !editingMatchId) return

    try {
      // Prepare update data based on contest type
      const updateData = {
        weight_class: editMatchForm.weight_class,
        wrestler_a: editMatchForm.wrestler_a,
        wrestler_b: editMatchForm.wrestler_b,
        match_order: editMatchForm.match_order
      }

      if (currentEvent.contest_type === 'pick_6') {
        // For Pick 6, update individual fighter odds
        updateData.american_odds_a = editMatchForm.american_odds_a || -110
        updateData.american_odds_b = editMatchForm.american_odds_b || +110
      } else {
        // For traditional format, calculate points and use legacy fields
        const points = calculateMatchPointsFromAmerican(editMatchForm.american_odds || 0, editMatchForm.base_points || 1000)
        updateData.favorite = editMatchForm.favorite
        updateData.odds_ratio = editMatchForm.odds_ratio
        updateData.favorite_points = points.favorite_points
        updateData.underdog_points = points.underdog_points
      }

      const { error } = await supabase.from('matches').update(updateData).eq('id', editingMatchId)

      if (error) throw handleSupabaseError(error)
      
      await fetchMatches(currentEvent.id)
      setEditingMatchId(null)

    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleDeleteMatch = async (id: string) => {
    setError(null)
    if (!currentEvent) return

    try {
      const { error } = await supabase.from('matches').delete().eq('id', id)
      if (error) throw handleSupabaseError(error)
      
      await fetchMatches(currentEvent.id)
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleRecordResult = async (matchId: string, winner: 'A' | 'B', finishType: 'decision' | 'ko_tko' | 'submission') => {
    setError(null)
    
    try {
      const { error } = await supabase
        .from('matches')
        .update({
          winner,
          finish_type: finishType,
          is_complete: true
        })
        .eq('id', matchId)
      
      if (error) throw handleSupabaseError(error)
      
      // Refresh matches to show updated results
      if (currentEvent) {
        await fetchMatches(currentEvent.id)
      }
      
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleRecalculatePoints = async () => {
    setError(null)
    
    try {
      // Manual points calculation since trigger is broken
      
      // Step 1: Update is_winner for all completed matches
      const { error: updateWinnersError } = await supabase.rpc('execute_sql', {
        sql: `
          UPDATE pick6_selections 
          SET is_winner = CASE 
            WHEN m.winner IS NULL THEN NULL
            WHEN m.winner = pick6_selections.fighter_id THEN TRUE
            ELSE FALSE
          END
          FROM matches m
          WHERE pick6_selections.match_id = m.id
          AND m.is_complete = true;
        `
      })
      
      if (updateWinnersError) {
        // Fallback: Use direct SQL queries
        console.log('RPC failed, using direct updates...')
        
        // Get all completed matches and their selections
        const { data: completedMatches, error: matchesError } = await supabase
          .from('matches')
          .select('id, winner')
          .eq('is_complete', true)
        
        if (matchesError) throw matchesError
        
        // Update each match's selections individually
        for (const match of completedMatches || []) {
          // Reset points first
          await supabase
            .from('pick6_selections')
            .update({
              base_points: 0,
              finish_bonus: 0,
              underdog_bonus: 0,
              final_points: 0,
              is_winner: null
            })
            .eq('match_id', match.id)
          
          if (match.winner) {
            // Set winners
            await supabase
              .from('pick6_selections')
              .update({ is_winner: true })
              .eq('match_id', match.id)
              .eq('fighter_id', match.winner)
            
            // Set losers
            await supabase
              .from('pick6_selections')
              .update({ is_winner: false })
              .eq('match_id', match.id)
              .neq('fighter_id', match.winner)
            
            // Calculate points for winners
            const { data: winners } = await supabase
              .from('pick6_selections')
              .select('id, american_odds, is_double_down')
              .eq('match_id', match.id)
              .eq('is_winner', true)
            
            const { data: matchData } = await supabase
              .from('matches')
              .select('finish_type')
              .eq('id', match.id)
              .single()
            
            for (const winner of winners || []) {
              const basePoints = winner.american_odds >= 0 
                ? winner.american_odds 
                : Math.floor(10000 / Math.abs(winner.american_odds))
              
              const finishBonus = matchData?.finish_type === 'ko_tko' || matchData?.finish_type === 'submission' ? 50 : 0
              const underdogBonus = winner.american_odds >= 100 ? Math.floor(basePoints * 0.1) : 0
              const finalPoints = (basePoints + finishBonus + underdogBonus) * (winner.is_double_down ? 2 : 1)
              
              await supabase
                .from('pick6_selections')
                .update({
                  base_points: basePoints,
                  finish_bonus: finishBonus,
                  underdog_bonus: underdogBonus,
                  final_points: finalPoints
                })
                .eq('id', winner.id)
            }
          }
        }
        
        // Update pick6_entries totals
        const { data: entries } = await supabase
          .from('pick6_entries')
          .select('id')
        
        for (const entry of entries || []) {
          const { data: selections } = await supabase
            .from('pick6_selections')
            .select('final_points, is_winner')
            .eq('pick6_entry_id', entry.id)
          
          const totalPoints = selections?.reduce((sum, sel) => sum + (sel.final_points || 0), 0) || 0
          const picksCorrect = selections?.filter(sel => sel.is_winner === true).length || 0
          
          await supabase
            .from('pick6_entries')
            .update({
              total_points: totalPoints,
              picks_correct: picksCorrect
            })
            .eq('id', entry.id)
        }
      }
      
      alert('Points recalculated successfully! All completed matches have been updated.')
      
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const handleDeleteEvent = async (eventId: string) => {
    setError(null)
    
    if (!confirm('Are you sure you want to delete this event? This will also delete all associated matches and picks. This action cannot be undone.')) {
      return
    }

    try {
      // Try simple delete first (will work if CASCADE DELETE constraints are set up)
      const { error: eventError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
      
      if (eventError) {
        // If simple delete fails, try manual cascading delete
        console.log('Simple delete failed, trying manual cascade:', eventError)
        
        // 1. Get all match IDs for this event
        const { data: matchIds, error: matchIdsError } = await supabase
          .from('matches')
          .select('id')
          .eq('event_id', eventId)
        
        if (matchIdsError) throw handleSupabaseError(matchIdsError)
        
        const matchIdList = matchIds?.map(m => m.id) || []
        
        // 2. Delete picks for these matches
        if (matchIdList.length > 0) {
          const { error: picksError } = await supabase
            .from('picks')
            .delete()
            .in('match_id', matchIdList)
          
          if (picksError) throw handleSupabaseError(picksError)
        }

        // 3. Delete event participants
        const { error: participantsError } = await supabase
          .from('event_participants')
          .delete()
          .eq('event_id', eventId)
        
        if (participantsError) throw handleSupabaseError(participantsError)

        // 4. Delete matches
        const { error: matchesError } = await supabase
          .from('matches')
          .delete()
          .eq('event_id', eventId)
        
        if (matchesError) throw handleSupabaseError(matchesError)

        // 5. Finally, delete the event
        const { error: finalEventError } = await supabase
          .from('events')
          .delete()
          .eq('id', eventId)
        
        if (finalEventError) throw handleSupabaseError(finalEventError)
      }
      
      // Remove from local state
      setEvents(events.filter(e => e.id !== eventId))
      
      // If we deleted the current event, clear it
      if (currentEvent?.id === eventId) {
        setCurrentEvent(null)
        setMatches([])
      }

    } catch (error) {
      setError(getErrorMessage(error))
    }
  }

  const getPointsPreview = (americanOdds: number, favorite: 'A' | 'B', basePoints: number = 1000) => {
    const points = calculateMatchPointsFromAmerican(americanOdds, basePoints)
    return {
      wrestler_a: favorite === 'A' ? points.favorite_points : points.underdog_points,
      wrestler_b: favorite === 'B' ? points.favorite_points : points.underdog_points
    }
  }

  if (loading) return <LoadingSpinner size="lg" text="Loading admin panel..." />

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-3xl font-bold text-center mb-6">Admin Panel</h1>
      
      <ErrorMessage error={error} className="mb-4" />

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'events' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('events')}
        >
          Events ({events.length})
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'matches' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('matches')}
        >
          Matches {currentEvent && `(${matches.length})`}
        </button>
        <button
          className={`py-2 px-4 font-medium ${activeTab === 'results' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('results')}
        >
          Results {currentEvent && `(${matches.length})`}
        </button>
      </div>

      {/* Events Tab */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Create Event Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Create New Event</h2>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="Event Name"
                    value={eventForm.name}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Type
                  </label>
                  <select
                    name="event_type_id"
                    value={eventForm.event_type_id}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    required
                  >
                    <option value="">Select Event Type</option>
                    {eventTypes.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.icon} {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Event Description
                </label>
                <textarea
                  name="description"
                  placeholder="Event Description"
                  value={eventForm.description}
                  onChange={handleEventFormChange}
                  className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Date
                  </label>
                  <input
                    type="date"
                    name="event_date"
                    value={eventForm.event_date}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Picks Deadline
                  </label>
                  <input
                    type="datetime-local"
                    name="picks_deadline"
                    value={eventForm.picks_deadline}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contest Type
                  </label>
                  <select
                    name="contest_type"
                    value={eventForm.contest_type}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    required
                  >
                    <option value="pick_6">Pick 6 Format</option>
                    <option value="match_picks">Match-by-Match Picks</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {eventForm.contest_type === 'pick_6' ? 'Required Picks' : 'Maximum Picks per User'}
                  </label>
                  <input
                    type="number"
                    name={eventForm.contest_type === 'pick_6' ? 'pick_count' : 'max_picks'}
                    placeholder={eventForm.contest_type === 'pick_6' ? 'Pick Count (e.g., 6)' : 'Max Picks'}
                    value={eventForm.contest_type === 'pick_6' ? eventForm.pick_count : eventForm.max_picks}
                    onChange={handleEventFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                    min={1}
                    max={50}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <div className="text-sm text-gray-600 p-3">
                    {eventForm.contest_type === 'pick_6' 
                      ? `Users must select exactly ${eventForm.pick_count} fighters`
                      : `Users can pick up to ${eventForm.max_picks} matches`
                    }
                  </div>
                </div>
              </div>
              <button 
                type="submit" 
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 font-medium"
              >
                Create Event
              </button>
            </form>
          </div>

          {/* Events List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold">All Events</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {events.map(event => (
                <div key={event.id} className="p-6 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium">{event.name}</h3>
                      <p className="text-gray-600 mt-1">{event.description}</p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                        <span>📅 {event.event_date}</span>
                        <span>⏰ Picks due: {new Date(event.picks_deadline).toLocaleString()}</span>
                        <span>🎯 Max picks: {event.max_picks}</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setCurrentEvent(event)
                          fetchMatches(event.id)
                          setActiveTab('matches')
                        }}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                      >
                        Manage Matches
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                      >
                        Delete Event
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Matches Tab */}
      {activeTab === 'matches' && currentEvent && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-800">
              Managing: {currentEvent.name}
            </h2>
            <p className="text-blue-600 text-sm mt-1">
              {matches.length} matches • Event Date: {currentEvent.event_date}
            </p>
          </div>

          {/* Add Match Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold mb-4">Add New Match</h3>
            <form onSubmit={handleAddMatch} className="space-y-4">
              {/* Common Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  name="weight_class"
                  placeholder="Weight Class (e.g., Heavyweight)"
                  value={matchForm.weight_class}
                  onChange={handleMatchFormChange}
                  className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  type="text"
                  name="wrestler_a"
                  placeholder="Fighter A"
                  value={matchForm.wrestler_a}
                  onChange={handleMatchFormChange}
                  className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  type="text"
                  name="wrestler_b"
                  placeholder="Fighter B"
                  value={matchForm.wrestler_b}
                  onChange={handleMatchFormChange}
                  className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="number"
                  name="match_order"
                  placeholder="Match Order"
                  value={matchForm.match_order}
                  onChange={handleMatchFormChange}
                  className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                  min={1}
                  max={50}
                  required
                />
                
                {/* Contest Type Specific Fields */}
                {currentEvent.contest_type === 'pick_6' ? (
                  <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded-md">
                    Pick 6 Format: Individual fighter odds will be used for scoring
                  </div>
                ) : (
                  <select
                    name="favorite"
                    value={matchForm.favorite}
                    onChange={handleMatchFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="A">Wrestler A is Favorite</option>
                    <option value="B">Wrestler B is Favorite</option>
                  </select>
                )}
              </div>

              {/* Pick 6 Format: Individual Fighter Odds */}
              {currentEvent.contest_type === 'pick_6' ? (
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-700">Fighter Odds (American Format)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {matchForm.wrestler_a || 'Fighter A'} Odds
                      </label>
                      <input
                        type="number"
                        name="american_odds_a"
                        placeholder="-150 (favorite) or +200 (underdog)"
                        value={matchForm.american_odds_a}
                        onChange={handleMatchFormChange}
                        className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 w-full"
                        min={-10000}
                        max={10000}
                        step={5}
                        required
                      />
                      <div className="text-xs text-gray-500">
                        {formatAmericanOdds(matchForm.american_odds_a || -110)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        {matchForm.wrestler_b || 'Fighter B'} Odds
                      </label>
                      <input
                        type="number"
                        name="american_odds_b"
                        placeholder="+150 (underdog) or -200 (favorite)"
                        value={matchForm.american_odds_b}
                        onChange={handleMatchFormChange}
                        className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 w-full"
                        min={-10000}
                        max={10000}
                        step={5}
                        required
                      />
                      <div className="text-xs text-gray-500">
                        {formatAmericanOdds(matchForm.american_odds_b || +110)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Traditional Format: Single Odds + Base Points */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <input
                      type="number"
                      name="american_odds"
                      placeholder="Vegas Odds (0 = Pick-em, -150 = Favorite, +200 = Underdog)"
                      value={matchForm.american_odds}
                      onChange={handleMatchFormChange}
                      className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500 w-full"
                      min={-10000}
                      max={10000}
                      step={1}
                      required
                    />
                    <div className="text-xs text-gray-500">
                      {formatAmericanOdds(matchForm.american_odds || 0)} • {getAmericanOddsDescription(matchForm.american_odds || 0, matchForm.base_points || 1000)}
                    </div>
                  </div>
                  <input
                    type="number"
                    name="base_points"
                    placeholder="Base Points (1000 = Main Event, 500 = Undercard)"
                    value={matchForm.base_points}
                    onChange={handleMatchFormChange}
                    className="border border-gray-300 p-3 rounded-md focus:ring-2 focus:ring-blue-500"
                    min={50}
                    max={5000}
                    step={50}
                    required
                  />
                </div>
              )}
              
              {/* Points Preview */}
              {currentEvent.contest_type === 'pick_6' ? (
                /* Pick 6 Points Preview */
                (matchForm.american_odds_a !== undefined && matchForm.american_odds_b !== undefined) && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-700 mb-2">Pick 6 Points Preview:</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className={`p-3 rounded ${(matchForm.american_odds_a || 0) < 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                        <span className="font-medium">{matchForm.wrestler_a || 'Fighter A'}</span>
                        <div className={`text-lg font-bold ${(matchForm.american_odds_a || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {(matchForm.american_odds_a || 0) >= 0 
                            ? (matchForm.american_odds_a || 0) 
                            : Math.round(10000 / Math.abs(matchForm.american_odds_a || 110))
                          } points
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatAmericanOdds(matchForm.american_odds_a || -110)} • {(matchForm.american_odds_a || 0) < 0 ? 'Favorite' : 'Underdog'}
                        </div>
                      </div>
                      <div className={`p-3 rounded ${(matchForm.american_odds_b || 0) < 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                        <span className="font-medium">{matchForm.wrestler_b || 'Fighter B'}</span>
                        <div className={`text-lg font-bold ${(matchForm.american_odds_b || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                          {(matchForm.american_odds_b || 0) >= 0 
                            ? (matchForm.american_odds_b || 0) 
                            : Math.round(10000 / Math.abs(matchForm.american_odds_b || 110))
                          } points
                        </div>
                        <div className="text-xs text-gray-600">
                          {formatAmericanOdds(matchForm.american_odds_b || +110)} • {(matchForm.american_odds_b || 0) < 0 ? 'Favorite' : 'Underdog'}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Base points only • +50 bonus for finish • +10% bonus for underdogs • 2x possible with Double Down
                    </p>
                  </div>
                )
              ) : (
                /* Traditional Points Preview */
                matchForm.american_odds !== undefined && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-700 mb-2">Points Preview:</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {(() => {
                        const preview = getPointsPreview(matchForm.american_odds, matchForm.favorite, matchForm.base_points || 1000)
                        const isPickEm = matchForm.american_odds === 0
                        return (
                          <>
                            <div className={`p-2 rounded ${isPickEm ? 'bg-green-100' : (matchForm.favorite === 'A' ? 'bg-blue-100' : 'bg-orange-100')}`}>
                              <span className="font-medium">{matchForm.wrestler_a || 'Wrestler A'}</span>
                              <div className={isPickEm ? 'text-green-600 font-bold' : (matchForm.favorite === 'A' ? 'text-blue-600' : 'text-orange-600 font-bold')}>
                                {preview.wrestler_a} points {isPickEm ? '' : (matchForm.favorite === 'A' ? '(Favorite)' : '(Underdog)')}
                              </div>
                            </div>
                            <div className={`p-2 rounded ${isPickEm ? 'bg-green-100' : (matchForm.favorite === 'B' ? 'bg-blue-100' : 'bg-orange-100')}`}>
                              <span className="font-medium">{matchForm.wrestler_b || 'Wrestler B'}</span>
                              <div className={isPickEm ? 'text-green-600 font-bold' : (matchForm.favorite === 'B' ? 'text-blue-600' : 'text-orange-600 font-bold')}>
                                {preview.wrestler_b} points {isPickEm ? '' : (matchForm.favorite === 'B' ? '(Favorite)' : '(Underdog)')}
                              </div>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatAmericanOdds(matchForm.american_odds)} • {getAmericanOddsDescription(matchForm.american_odds)}
                    </p>
                  </div>
                )
              )}
              
              <button 
                type="submit" 
                className="w-full bg-green-600 text-white py-3 px-6 rounded-md hover:bg-green-700 font-medium"
              >
                Add {currentEvent.contest_type === 'pick_6' ? 'Fight' : 'Match'}
              </button>
            </form>
          </div>

          {/* Matches List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold">Matches ({matches.length})</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {matches.map(match => (
                <div key={match.id} className="p-6">
                  {editingMatchId === match.id ? (
                    <form onSubmit={handleUpdateMatch} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Weight Class
                          </label>
                          <input
                            type="text"
                            name="weight_class"
                            value={editMatchForm.weight_class}
                            onChange={(e) => setEditMatchForm({...editMatchForm, weight_class: e.target.value})}
                            className="border border-gray-300 p-2 rounded w-full"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Wrestler A
                          </label>
                          <input
                            type="text"
                            name="wrestler_a"
                            value={editMatchForm.wrestler_a}
                            onChange={(e) => setEditMatchForm({...editMatchForm, wrestler_a: e.target.value})}
                            className="border border-gray-300 p-2 rounded w-full"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Wrestler B
                          </label>
                          <input
                            type="text"
                            name="wrestler_b"
                            value={editMatchForm.wrestler_b}
                            onChange={(e) => setEditMatchForm({...editMatchForm, wrestler_b: e.target.value})}
                            className="border border-gray-300 p-2 rounded w-full"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Match Order
                          </label>
                          <input
                            type="number"
                            name="match_order"
                            value={editMatchForm.match_order}
                            onChange={(e) => setEditMatchForm({...editMatchForm, match_order: parseInt(e.target.value)})}
                            className="border border-gray-300 p-2 rounded w-full"
                            min={1}
                            required
                          />
                        </div>
                        {/* Contest Type Specific Edit Fields */}
                        {currentEvent.contest_type === 'pick_6' ? (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {editMatchForm.wrestler_a || 'Fighter A'} Odds
                              </label>
                              <input
                                type="number"
                                name="american_odds_a"
                                value={editMatchForm.american_odds_a}
                                onChange={(e) => setEditMatchForm({...editMatchForm, american_odds_a: parseInt(e.target.value)})}
                                className="border border-gray-300 p-2 rounded w-full"
                                min={-10000}
                                max={10000}
                                step={5}
                                required
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                {formatAmericanOdds(editMatchForm.american_odds_a || -110)}
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                {editMatchForm.wrestler_b || 'Fighter B'} Odds
                              </label>
                              <input
                                type="number"
                                name="american_odds_b"
                                value={editMatchForm.american_odds_b}
                                onChange={(e) => setEditMatchForm({...editMatchForm, american_odds_b: parseInt(e.target.value)})}
                                className="border border-gray-300 p-2 rounded w-full"
                                min={-10000}
                                max={10000}
                                step={5}
                                required
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                {formatAmericanOdds(editMatchForm.american_odds_b || +110)}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Favorite
                              </label>
                              <select
                                name="favorite"
                                value={editMatchForm.favorite}
                                onChange={(e) => setEditMatchForm({...editMatchForm, favorite: e.target.value as 'A' | 'B'})}
                                className="border border-gray-300 p-2 rounded w-full"
                              >
                                <option value="A">{editMatchForm.wrestler_a || 'Wrestler A'} is Favorite</option>
                                <option value="B">{editMatchForm.wrestler_b || 'Wrestler B'} is Favorite</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Vegas Odds
                              </label>
                              <input
                                type="number"
                                name="american_odds"
                                value={editMatchForm.american_odds}
                                onChange={(e) => {
                                  const americanOdds = parseFloat(e.target.value)
                                  setEditMatchForm({
                                    ...editMatchForm, 
                                    american_odds: americanOdds,
                                    odds_ratio: americanOddsToDecimal(americanOdds)
                                  })
                                }}
                                className="border border-gray-300 p-2 rounded w-full"
                                min={-10000}
                                max={10000}
                                step={1}
                                required
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                {formatAmericanOdds(editMatchForm.american_odds || 0)} • {getAmericanOddsDescription(editMatchForm.american_odds || 0, editMatchForm.base_points || 1000)}
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Base Points
                              </label>
                              <input
                                type="number"
                                name="base_points"
                                value={editMatchForm.base_points}
                                onChange={(e) => setEditMatchForm({...editMatchForm, base_points: parseInt(e.target.value)})}
                                className="border border-gray-300 p-2 rounded w-full"
                                min={50}
                                max={5000}
                                step={50}
                                required
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                1000 = Main Event, 500 = Undercard
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Points Preview for Edit */}
                      {currentEvent.contest_type === 'pick_6' ? (
                        /* Pick 6 Edit Points Preview */
                        (editMatchForm.american_odds_a !== undefined && editMatchForm.american_odds_b !== undefined) && (
                          <div className="bg-gray-50 p-4 rounded-md">
                            <h4 className="font-medium text-gray-700 mb-2">Updated Pick 6 Points Preview:</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className={`p-3 rounded ${(editMatchForm.american_odds_a || 0) < 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                                <span className="font-medium">{editMatchForm.wrestler_a || 'Fighter A'}</span>
                                <div className={`text-lg font-bold ${(editMatchForm.american_odds_a || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                  {(editMatchForm.american_odds_a || 0) >= 0 
                                    ? (editMatchForm.american_odds_a || 0) 
                                    : Math.round(10000 / Math.abs(editMatchForm.american_odds_a || 110))
                                  } points
                                </div>
                                <div className="text-xs text-gray-600">
                                  {formatAmericanOdds(editMatchForm.american_odds_a || -110)} • {(editMatchForm.american_odds_a || 0) < 0 ? 'Favorite' : 'Underdog'}
                                </div>
                              </div>
                              <div className={`p-3 rounded ${(editMatchForm.american_odds_b || 0) < 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                                <span className="font-medium">{editMatchForm.wrestler_b || 'Fighter B'}</span>
                                <div className={`text-lg font-bold ${(editMatchForm.american_odds_b || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                  {(editMatchForm.american_odds_b || 0) >= 0 
                                    ? (editMatchForm.american_odds_b || 0) 
                                    : Math.round(10000 / Math.abs(editMatchForm.american_odds_b || 110))
                                  } points
                                </div>
                                <div className="text-xs text-gray-600">
                                  {formatAmericanOdds(editMatchForm.american_odds_b || +110)} • {(editMatchForm.american_odds_b || 0) < 0 ? 'Favorite' : 'Underdog'}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      ) : (
                        /* Traditional Edit Points Preview */
                        editMatchForm.american_odds !== undefined && (
                          <div className="bg-gray-50 p-4 rounded-md">
                            <h4 className="font-medium text-gray-700 mb-2">Updated Points Preview:</h4>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {(() => {
                                const preview = getPointsPreview(editMatchForm.american_odds, editMatchForm.favorite, editMatchForm.base_points || 1000)
                                const isPickEm = editMatchForm.american_odds === 0
                                return (
                                  <>
                                    <div className={`p-2 rounded ${isPickEm ? 'bg-green-100' : (editMatchForm.favorite === 'A' ? 'bg-blue-100' : 'bg-orange-100')}`}>
                                      <span className="font-medium">{editMatchForm.wrestler_a || 'Wrestler A'}</span>
                                      <div className={isPickEm ? 'text-green-600 font-bold' : (editMatchForm.favorite === 'A' ? 'text-blue-600' : 'text-orange-600 font-bold')}>
                                        {preview.wrestler_a} points {isPickEm ? '' : (editMatchForm.favorite === 'A' ? '(Favorite)' : '(Underdog)')}
                                      </div>
                                    </div>
                                    <div className={`p-2 rounded ${isPickEm ? 'bg-green-100' : (editMatchForm.favorite === 'B' ? 'bg-blue-100' : 'bg-orange-100')}`}>
                                      <span className="font-medium">{editMatchForm.wrestler_b || 'Wrestler B'}</span>
                                      <div className={isPickEm ? 'text-green-600 font-bold' : (editMatchForm.favorite === 'B' ? 'text-blue-600' : 'text-orange-600 font-bold')}>
                                        {preview.wrestler_b} points {isPickEm ? '' : (editMatchForm.favorite === 'B' ? '(Favorite)' : '(Underdog)')}
                                      </div>
                                    </div>
                                  </>
                                )
                              })()}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              {formatAmericanOdds(editMatchForm.american_odds)} • {getAmericanOddsDescription(editMatchForm.american_odds)}
                            </p>
                          </div>
                        )
                      )}
                      
                      <div className="flex space-x-2">
                        <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                          Save Changes
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setEditingMatchId(null)}
                          className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <div className="flex items-center space-x-4">
                          <span className="font-semibold text-lg">{match.weight_class}</span>
                          <span className="text-gray-500">#{match.match_order}</span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">
                            {currentEvent.contest_type === 'pick_6' ? 'Pick 6' : 'Traditional'}
                          </span>
                        </div>
                        
                        {/* Pick 6 Display */}
                        {currentEvent.contest_type === 'pick_6' ? (
                          <div className="mt-2 grid grid-cols-2 gap-4">
                            <div className={`p-3 rounded ${(match.american_odds_a || 0) < 0 ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
                              <div className="font-medium">{match.wrestler_a}</div>
                              <div className={`text-sm font-bold ${(match.american_odds_a || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                {(match.american_odds_a || 0) >= 0 
                                  ? (match.american_odds_a || 0) 
                                  : Math.round(10000 / Math.abs(match.american_odds_a || 110))
                                } points
                              </div>
                              <div className="text-xs text-gray-600">
                                {formatAmericanOdds(match.american_odds_a || 0)} • {(match.american_odds_a || 0) < 0 ? 'Favorite' : 'Underdog'}
                              </div>
                            </div>
                            <div className={`p-3 rounded ${(match.american_odds_b || 0) < 0 ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
                              <div className="font-medium">{match.wrestler_b}</div>
                              <div className={`text-sm font-bold ${(match.american_odds_b || 0) < 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                {(match.american_odds_b || 0) >= 0 
                                  ? (match.american_odds_b || 0) 
                                  : Math.round(10000 / Math.abs(match.american_odds_b || 110))
                                } points
                              </div>
                              <div className="text-xs text-gray-600">
                                {formatAmericanOdds(match.american_odds_b || 0)} • {(match.american_odds_b || 0) < 0 ? 'Favorite' : 'Underdog'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Traditional Display */
                          <div className="mt-2 grid grid-cols-2 gap-4">
                            <div className={`p-3 rounded ${match.favorite === 'A' ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
                              <div className="font-medium">{match.wrestler_a}</div>
                              <div className={`text-sm ${match.favorite === 'A' ? 'text-blue-600' : 'text-orange-600 font-bold'}`}>
                                {match.favorite === 'A' ? match.favorite_points : match.underdog_points} points
                                {match.favorite === 'A' ? ' (Favorite)' : ' (Underdog)'}
                              </div>
                            </div>
                            <div className={`p-3 rounded ${match.favorite === 'B' ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
                              <div className="font-medium">{match.wrestler_b}</div>
                              <div className={`text-sm ${match.favorite === 'B' ? 'text-blue-600' : 'text-orange-600 font-bold'}`}>
                                {match.favorite === 'B' ? match.favorite_points : match.underdog_points} points
                                {match.favorite === 'B' ? ' (Favorite)' : ' (Underdog)'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button 
                          onClick={() => handleEditClick(match)}
                          className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDeleteMatch(match.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          {!currentEvent ? (
            <div className="text-center py-12">
              <div className="text-gray-500 text-lg">
                Please select an event first to record results.
              </div>
              <p className="text-gray-400 mt-2">
                Go to the Events tab and click "Manage Matches" on an event.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold">Record Results - {currentEvent.name}</h2>
                    <p className="text-gray-600 mt-1">Click on the winner of each match to record results</p>
                  </div>
                  <button
                    onClick={handleRecalculatePoints}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Recalculate Points</span>
                  </button>
                </div>
              </div>
              
              <div className="divide-y divide-gray-200">
                {matches.map((match) => (
                  <div key={match.id} className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">{match.weight_class}</h3>
                        <div className="text-sm text-gray-500">Fight #{match.match_order}</div>
                        {match.is_complete && (
                          <div className="flex items-center mt-2">
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-medium">
                              ✓ Complete
                            </span>
                            <span className="ml-2 text-sm text-gray-600">
                              Winner: {match.winner === 'A' ? match.wrestler_a : match.wrestler_b} 
                              ({match.finish_type?.replace('_', '/').toUpperCase()})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Fighter A */}
                      <div className={`border-2 rounded-lg p-4 transition-all ${
                        match.is_complete && match.winner === 'A' 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-gray-200 hover:border-blue-300'
                      }`}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-lg font-semibold">{match.wrestler_a}</h4>
                          {currentEvent.contest_type === 'pick_6' ? (
                            <div className="text-sm text-gray-600">
                              {(match.american_odds_a || 0) >= 0 
                                ? (match.american_odds_a || 0) 
                                : Math.round(10000 / Math.abs(match.american_odds_a || 110))
                              } pts
                            </div>
                          ) : (
                            <div className="text-sm text-gray-600">
                              {match.favorite === 'A' ? match.favorite_points : match.underdog_points} pts
                            </div>
                          )}
                        </div>
                        
                        {!match.is_complete && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700 mb-2">Record as Winner:</div>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                onClick={() => handleRecordResult(match.id, 'A', 'decision')}
                                className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
                              >
                                Decision
                              </button>
                              <button
                                onClick={() => handleRecordResult(match.id, 'A', 'ko_tko')}
                                className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
                              >
                                KO/TKO
                              </button>
                              <button
                                onClick={() => handleRecordResult(match.id, 'A', 'submission')}
                                className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700"
                              >
                                Submission
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Fighter B */}
                      <div className={`border-2 rounded-lg p-4 transition-all ${
                        match.is_complete && match.winner === 'B' 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-gray-200 hover:border-blue-300'
                      }`}>
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-lg font-semibold">{match.wrestler_b}</h4>
                          {currentEvent.contest_type === 'pick_6' ? (
                            <div className="text-sm text-gray-600">
                              {(match.american_odds_b || 0) >= 0 
                                ? (match.american_odds_b || 0) 
                                : Math.round(10000 / Math.abs(match.american_odds_b || 110))
                              } pts
                            </div>
                          ) : (
                            <div className="text-sm text-gray-600">
                              {match.favorite === 'B' ? match.favorite_points : match.underdog_points} pts
                            </div>
                          )}
                        </div>
                        
                        {!match.is_complete && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-gray-700 mb-2">Record as Winner:</div>
                            <div className="grid grid-cols-3 gap-2">
                              <button
                                onClick={() => handleRecordResult(match.id, 'B', 'decision')}
                                className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
                              >
                                Decision
                              </button>
                              <button
                                onClick={() => handleRecordResult(match.id, 'B', 'ko_tko')}
                                className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
                              >
                                KO/TKO
                              </button>
                              <button
                                onClick={() => handleRecordResult(match.id, 'B', 'submission')}
                                className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700"
                              >
                                Submission
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reset Result Button */}
                    {match.is_complete && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={async () => {
                            try {
                              const { error } = await supabase
                                .from('matches')
                                .update({
                                  winner: null,
                                  finish_type: null,
                                  is_complete: false
                                })
                                .eq('id', match.id)
                              
                              if (error) throw error
                              
                              if (currentEvent) {
                                await fetchMatches(currentEvent.id)
                              }
                            } catch (error: any) {
                              setError(error.message)
                            }
                          }}
                          className="bg-gray-500 text-white px-4 py-2 rounded text-sm hover:bg-gray-600"
                        >
                          Reset Result
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
} 