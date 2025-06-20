/**
 * Pick 6 Scoring System
 * Based on GatorBacon Pick 6 Format Specification
 */

import { Pick6Scoring } from './types'

/**
 * Calculate base points from American odds
 */
export function calculateBasePoints(americanOdds: number): number {
  if (americanOdds > 0) {
    // Positive odds (underdogs)
    return americanOdds
  } else {
    // Negative odds (favorites)
    return Math.round((10000 / Math.abs(americanOdds)) * 10) / 10
  }
}

/**
 * Calculate finish bonus
 */
export function calculateFinishBonus(finishType: 'decision' | 'ko_tko' | 'submission' | null): number {
  return finishType && finishType !== 'decision' ? 50 : 0
}

/**
 * Calculate underdog bonus (10% of base points if odds > +100)
 */
export function calculateUnderdogBonus(americanOdds: number, basePoints: number): number {
  return americanOdds >= 100 ? Math.round(basePoints * 0.1 * 10) / 10 : 0
}

/**
 * Calculate total points for a Pick 6 selection
 */
export function calculatePick6Points({
  americanOdds,
  isWinner,
  finishType = null,
  isDoubleDown = false
}: {
  americanOdds: number
  isWinner: boolean
  finishType?: 'decision' | 'ko_tko' | 'submission' | null
  isDoubleDown?: boolean
}): Pick6Scoring {
  // If fighter loses, return 0 points
  if (!isWinner) {
    return {
      base_points: 0,
      finish_bonus: 0,
      underdog_bonus: 0,
      double_down_multiplier: 1,
      total_points: 0
    }
  }

  const basePoints = calculateBasePoints(americanOdds)
  const finishBonus = calculateFinishBonus(finishType)
  const underdogBonus = calculateUnderdogBonus(americanOdds, basePoints)
  const doubleDownMultiplier = isDoubleDown ? 2 : 1
  
  // Calculate total before double down
  const subtotal = basePoints + finishBonus + underdogBonus
  const totalPoints = Math.round(subtotal * doubleDownMultiplier * 10) / 10

  return {
    base_points: basePoints,
    finish_bonus: finishBonus,
    underdog_bonus: underdogBonus,
    double_down_multiplier: doubleDownMultiplier,
    total_points: totalPoints
  }
}

/**
 * Calculate potential points (before fight results)
 */
export function calculatePotentialPoints(americanOdds: number, isDoubleDown = false): number {
  const basePoints = calculateBasePoints(americanOdds)
  const maxFinishBonus = 50
  const maxUnderdogBonus = americanOdds >= 100 ? Math.round(basePoints * 0.1 * 10) / 10 : 0
  const doubleDownMultiplier = isDoubleDown ? 2 : 1
  
  const maxPoints = (basePoints + maxFinishBonus + maxUnderdogBonus) * doubleDownMultiplier
  return Math.round(maxPoints * 10) / 10
}

/**
 * Validate Pick 6 entry
 */
export function validatePick6Entry(picks: any[], requiredPickCount: number = 6): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (picks.length !== requiredPickCount) {
    errors.push(`Must select exactly ${requiredPickCount} fighters`)
  }

  // Check for duplicate matches
  const matchIds = picks.map(pick => pick.match_id)
  const uniqueMatchIds = new Set(matchIds)
  if (uniqueMatchIds.size !== matchIds.length) {
    errors.push('Cannot select multiple fighters from the same fight')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Format points for display
 */
export function formatPoints(points: number): string {
  return points.toFixed(1)
}

/**
 * Get odds display text
 */
export function formatOdds(americanOdds: number): string {
  if (americanOdds > 0) {
    return `+${americanOdds}`
  } else {
    return americanOdds.toString()
  }
}

/**
 * Determine if fighter is underdog
 */
export function isUnderdog(americanOdds: number): boolean {
  return americanOdds > 0
}

/**
 * Get fighter status text
 */
export function getFighterStatus(americanOdds: number): string {
  if (americanOdds > 0) {
    return 'Underdog'
  } else if (americanOdds < 0) {
    return 'Favorite'
  } else {
    return 'Pick \'em'
  }
} 