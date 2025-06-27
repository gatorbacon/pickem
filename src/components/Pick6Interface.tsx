'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Match, Pick6Entry } from '@/lib/types'
import { 
  formatPoints, 
  formatOdds, 
  getFighterStatus,
  validatePick6Entry,
  calculateBasePoints
} from '@/lib/pick6-scoring'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'

interface Pick6InterfaceProps {
  eventId: string
  userId: string
  pickCount: number
}

interface FighterOption {
  id: string
  name: string
  americanOdds: number
  matchId: string
  fighterPosition: 'A' | 'B'
}

interface SelectedPick {
  matchId: string
  fighter: FighterOption
  potentialPoints: number
}

export default function Pick6Interface({ eventId, userId, pickCount }: Pick6InterfaceProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedPicks, setSelectedPicks] = useState<SelectedPick[]>([])
  const [showDoubleDown, setShowDoubleDown] = useState(false)
  const [doubleDownPickId, setDoubleDownPickId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingEntry, setExistingEntry] = useState<Pick6Entry | null>(null)

  useEffect(() => {
    fetchEventData()
  }, [eventId, userId])

  const fetchEventData = async () => {
    try {
      setLoading(true)

      // Fetch matches for the event
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('*')
        .eq('event_id', eventId)
        .order('match_order')

      if (matchesError) throw matchesError

      // Check for existing Pick 6 entry
      const { data: entryData, error: entryError } = await supabase
        .from('pick6_entries')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single()

      if (entryError && entryError.code !== 'PGRST116') {
        throw entryError
      }

      setMatches(matchesData || [])
      setExistingEntry(entryData)

      // If entry exists, fetch selections separately
      if (entryData) {
        const { data: selectionsData, error: selectionsError } = await supabase
          .from('pick6_selections')
          .select('*')
          .eq('pick6_entry_id', entryData.id)

        if (selectionsError) throw selectionsError

        if (selectionsData && selectionsData.length > 0) {
          const picks: SelectedPick[] = selectionsData.map((selection: any) => ({
            matchId: selection.match_id,
            fighter: {
              id: selection.fighter_id,
              name: selection.fighter_name,
              americanOdds: selection.american_odds,
              matchId: selection.match_id,
              fighterPosition: selection.fighter_id as 'A' | 'B'
            },
            potentialPoints: calculateBasePoints(selection.american_odds) * (selection.is_double_down ? 2 : 1)
          }))
          setSelectedPicks(picks)
          setDoubleDownPickId(entryData.double_down_pick_id)
        } else {
          // Entry exists but no selections - reset state
          setSelectedPicks([])
          setDoubleDownPickId(null)
          setShowDoubleDown(false)
        }
      } else {
        // No entry exists for this event - reset all state
        setSelectedPicks([])
        setDoubleDownPickId(null)
        setShowDoubleDown(false)
      }

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getFighterOptions = (match: Match): FighterOption[] => {
    // For Pick 6 format, use individual fighter odds
    if (!match.american_odds_a || !match.american_odds_b) return []

    return [
      {
        id: 'A',
        name: match.wrestler_a,
        americanOdds: match.american_odds_a,
        matchId: match.id,
        fighterPosition: 'A'
      },
      {
        id: 'B', 
        name: match.wrestler_b,
        americanOdds: match.american_odds_b,
        matchId: match.id,
        fighterPosition: 'B'
      }
    ]
  }

  const handleFighterSelect = (fighter: FighterOption) => {
    if (existingEntry?.is_complete) return

    const existingPickIndex = selectedPicks.findIndex(pick => pick.matchId === fighter.matchId)
    const newPicks = [...selectedPicks]

    if (existingPickIndex >= 0) {
      // Check if clicking the same fighter that's already selected
      const existingPick = selectedPicks[existingPickIndex]
      if (existingPick.fighter.fighterPosition === fighter.fighterPosition) {
        // Deselect - remove this pick entirely
        newPicks.splice(existingPickIndex, 1)
      } else {
        // Replace with different fighter from same match
        newPicks[existingPickIndex] = {
          matchId: fighter.matchId,
          fighter,
          potentialPoints: calculateBasePoints(fighter.americanOdds)
        }
      }
    } else if (selectedPicks.length < pickCount) {
      // Add new pick
      newPicks.push({
        matchId: fighter.matchId,
        fighter,
        potentialPoints: calculateBasePoints(fighter.americanOdds)
      })
    }

    setSelectedPicks(newPicks)

    // Show double down selection when all picks are made
    if (newPicks.length === pickCount && !showDoubleDown) {
      setShowDoubleDown(true)
    }
    
    // Hide double down if we no longer have enough picks
    if (newPicks.length < pickCount && showDoubleDown) {
      setShowDoubleDown(false)
      setDoubleDownPickId(null)
    }
  }

  const handleDoubleDownSelect = (pickIndex: number) => {
    setDoubleDownPickId(selectedPicks[pickIndex].matchId)
    
    // Recalculate base points with double down multiplier
    const updatedPicks = selectedPicks.map((pick, index) => ({
      ...pick,
      potentialPoints: calculateBasePoints(pick.fighter.americanOdds) * (index === pickIndex ? 2 : 1)
    }))
    setSelectedPicks(updatedPicks)
  }

  const getTotalPotentialPoints = () => {
    return selectedPicks.reduce((total, pick) => total + pick.potentialPoints, 0)
  }

  const handleSubmit = async () => {
    if (selectedPicks.length !== pickCount) {
      setError(`Must select exactly ${pickCount} fighters`)
      return
    }

    if (!doubleDownPickId) {
      setError('Must select a Double Down pick')
      return
    }

    // Transform selectedPicks to match validation function expectations
    const picksForValidation = selectedPicks.map(pick => ({
      match_id: pick.matchId
    }))
    
    const validation = validatePick6Entry(picksForValidation, pickCount)
    if (!validation.isValid) {
      setError(validation.errors.join(', '))
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      // Create or update Pick 6 entry
      const { data: entryData, error: entryError } = await supabase
        .from('pick6_entries')
        .upsert({
          user_id: userId,
          event_id: eventId,
          is_complete: true,
          submitted_at: new Date().toISOString()
        })
        .select()
        .single()

      if (entryError) throw entryError

      // Create selections
      const selectionsData = selectedPicks.map(pick => ({
        pick6_entry_id: entryData.id,
        match_id: pick.matchId,
        fighter_id: pick.fighter.fighterPosition,
        fighter_name: pick.fighter.name,
        american_odds: pick.fighter.americanOdds,
        is_double_down: pick.matchId === doubleDownPickId,
        base_points: calculateBasePoints(pick.fighter.americanOdds)
      }))

      const { error: selectionsError } = await supabase
        .from('pick6_selections')
        .upsert(selectionsData)

      if (selectionsError) throw selectionsError

      // Update double down reference
      const doubleDownSelection = await supabase
        .from('pick6_selections')
        .select('id')
        .eq('pick6_entry_id', entryData.id)
        .eq('match_id', doubleDownPickId)
        .single()

      if (doubleDownSelection.data) {
        await supabase
          .from('pick6_entries')
          .update({ double_down_pick_id: doubleDownSelection.data.id })
          .eq('id', entryData.id)
      }

      // Success - refresh data
      await fetchEventData()
      setShowDoubleDown(false)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading fights..." />
  }

  const remainingPicks = pickCount - selectedPicks.length
  const isComplete = existingEntry?.is_complete || false

  return (
    <div className="max-w-6xl mx-auto p-6">
      <ErrorMessage error={error} className="mb-6" />

      {/* Header with pick counter */}
      <div className="bg-gradient-to-r from-green-900 to-red-900 text-white rounded-lg p-6 mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-gritty text-3xl tracking-wide">PICK {pickCount}</h1>
            <p className="text-lg opacity-90">Select {pickCount} fighters to win their fights</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">
              {remainingPicks > 0 ? remainingPicks : '✓'}
            </div>
            <div className="text-sm opacity-75">
              {remainingPicks > 0 ? 'picks remaining' : 'complete'}
            </div>
          </div>
        </div>
        
        {selectedPicks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white border-opacity-20">
            <div className="flex justify-between items-center">
              <span className="text-lg">Base Points Total:</span>
              <span className="text-2xl font-bold">{formatPoints(getTotalPotentialPoints())}</span>
            </div>
            <div className="text-sm opacity-75 mt-1">
              +Finish bonuses (+50 each) and underdog bonuses (+10%) will be added when fights complete
            </div>
          </div>
        )}
      </div>

      {/* Fight Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {matches.map((match) => {
          return (
            <div key={match.id} className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-center mb-4">
                <h3 className="font-bold text-lg text-gray-900">{match.weight_class}</h3>
                <div className="text-sm text-gray-600">Fight #{match.match_order}</div>
              </div>

              {/* Fighter Options - Stacked Vertically */}
              <div className="space-y-3">
                {/* Fighter A */}
                <div
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedPicks.some(f => f.matchId === match.id && f.fighter.fighterPosition === 'A')
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => handleFighterSelect({
                    id: 'A',
                    name: match.wrestler_a,
                    americanOdds: match.american_odds_a || 0,
                    matchId: match.id,
                    fighterPosition: 'A'
                  })}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{match.wrestler_a}</h4>
                      <p className="text-sm text-gray-600">
                        {formatOdds(match.american_odds_a || 0)} • {getFighterStatus(match.american_odds_a || 0)}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="bg-blue-500 text-white px-3 py-1 rounded-lg">
                        <span className="text-2xl font-bold">{calculateBasePoints(match.american_odds_a || 0)}</span>
                        <span className="text-sm ml-1">pts</span>
                      </div>
                      {(match.american_odds_a || 0) >= 100 && (
                        <div className="text-sm font-medium text-orange-500 mt-1">
                          +{Math.round(calculateBasePoints(match.american_odds_a || 0) * 0.1)} upset bonus
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fighter B */}
                <div
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedPicks.some(f => f.matchId === match.id && f.fighter.fighterPosition === 'B')
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                  onClick={() => handleFighterSelect({
                    id: 'B',
                    name: match.wrestler_b,
                    americanOdds: match.american_odds_b || 0,
                    matchId: match.id,
                    fighterPosition: 'B'
                  })}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg">{match.wrestler_b}</h4>
                      <p className="text-sm text-gray-600">
                        {formatOdds(match.american_odds_b || 0)} • {getFighterStatus(match.american_odds_b || 0)}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="bg-blue-500 text-white px-3 py-1 rounded-lg">
                        <span className="text-2xl font-bold">{calculateBasePoints(match.american_odds_b || 0)}</span>
                        <span className="text-sm ml-1">pts</span>
                      </div>
                      {(match.american_odds_b || 0) >= 100 && (
                        <div className="text-sm font-medium text-orange-500 mt-1">
                          +{Math.round(calculateBasePoints(match.american_odds_b || 0) * 0.1)} upset bonus
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Double Down Selection Modal */}
      {showDoubleDown && selectedPicks.length === pickCount && !isComplete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
            <h2 className="font-gritty text-2xl text-center mb-6">SELECT YOUR DOUBLE DOWN</h2>
            <p className="text-center text-gray-600 mb-6">
              Choose one pick to double. If they win, you get 2x points. If they lose, you get 0.
            </p>
            
            <div className="space-y-3 mb-6">
              {selectedPicks.map((pick, index) => (
                <button
                  key={pick.matchId}
                  onClick={() => handleDoubleDownSelect(index)}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    doubleDownPickId === pick.matchId
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="text-left">
                      <div className="font-semibold">{pick.fighter.name}</div>
                      <div className="text-sm text-gray-600">
                        {formatOdds(pick.fighter.americanOdds)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-orange-600">
                        {formatPoints(calculateBasePoints(pick.fighter.americanOdds) * 2)}
                      </div>
                      <div className="text-xs text-gray-500">base points (2x)</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowDoubleDown(false)}
                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!doubleDownPickId || submitting}
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Picks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      {selectedPicks.length === pickCount && !showDoubleDown && !isComplete && (
        <div className="text-center">
          <button
            onClick={() => setShowDoubleDown(true)}
            className="px-8 py-4 bg-green-600 text-white font-gritty text-lg rounded-lg hover:bg-green-700"
          >
            SUBMIT PICKS
          </button>
        </div>
      )}

      {/* Completion Message */}
      {isComplete && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg text-center">
          <div className="font-bold text-lg">Picks Submitted!</div>
          <div>Your {pickCount} fighters are locked in. Good luck!</div>
        </div>
      )}
    </div>
  )
} 