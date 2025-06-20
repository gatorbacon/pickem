/**
 * Point calculation utilities for odds-based scoring system
 */

import { OddsCalculation, Match, Pick } from './types'

/**
 * Convert American odds to decimal odds ratio
 * +150 = 2.5 (underdog), -200 = 1.5 (favorite), 0 = 1.0 (even)
 */
export function americanOddsToDecimal(americanOdds: number): number {
  if (americanOdds === 0) {
    // Even odds - true pick-em
    return 1.0
  } else if (americanOdds > 0) {
    // Positive odds (underdog): +150 means you win $150 for every $100 bet
    return (americanOdds / 100) + 1
  } else {
    // Negative odds (favorite): -200 means you bet $200 to win $100
    return (100 / Math.abs(americanOdds)) + 1
  }
}

/**
 * Convert decimal odds ratio to American odds
 */
export function decimalToAmericanOdds(decimal: number): number {
  if (decimal === 1.0) {
    // Even odds - true pick-em
    return 0
  } else if (decimal >= 2.0) {
    // Underdog (positive odds)
    return Math.round((decimal - 1) * 100)
  } else {
    // Favorite (negative odds)
    return Math.round(-100 / (decimal - 1))
  }
}

/**
 * Convert American odds to implied probability
 */
function americanOddsToImpliedProbability(americanOdds: number): number {
  if (americanOdds > 0) {
    // Positive odds (underdog)
    return 100 / (americanOdds + 100)
  } else {
    // Negative odds (favorite)
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100)
  }
}

/**
 * Calculate points for favorite and underdog based on American odds using balanced expected value
 * Balanced system: Expected value is equal regardless of which fighter you pick
 * Formula: favoriteWinRate × favoritePoints = underdogWinRate × underdogPoints
 */
export function calculateMatchPointsFromAmerican(americanOdds: number, basePoints: number = 1000): OddsCalculation & { americanOdds: number } {
  const decimalOdds = americanOddsToDecimal(americanOdds)
  
  // Special case for true pick-em (even odds)
  if (americanOdds === 0 || Math.abs(americanOdds) <= 5) {
    return {
      favorite_points: basePoints,
      underdog_points: basePoints,
      odds_ratio: 1.0,
      favorite: 'A', // This will be set when creating the match, but doesn't matter for even odds
      americanOdds: 0
    }
  }
  
  // Determine who is favorite/underdog and their win probabilities
  let favoriteWinProbability: number
  let underdogWinProbability: number
  let favorite_points: number
  let underdog_points: number
  
  if (americanOdds < 0) {
    // Negative odds = favorite
    favoriteWinProbability = americanOddsToImpliedProbability(americanOdds)
    underdogWinProbability = 1 - favoriteWinProbability
    
    // Underdog gets base points, calculate favorite points for balance
    underdog_points = basePoints
    favorite_points = Math.floor((underdogWinProbability * basePoints) / favoriteWinProbability)
  } else {
    // Positive odds = underdog (the one with + odds is the underdog)
    underdogWinProbability = americanOddsToImpliedProbability(americanOdds)
    favoriteWinProbability = 1 - underdogWinProbability
    
    // Favorite gets base points, calculate underdog points for balance
    favorite_points = basePoints
    underdog_points = Math.floor((favoriteWinProbability * basePoints) / underdogWinProbability)
  }
  
  // Apply minimum points floor (10% of base points)
  favorite_points = Math.max(Math.floor(basePoints * 0.1), favorite_points)
  underdog_points = Math.max(Math.floor(basePoints * 0.1), underdog_points)
  
  return {
    favorite_points,
    underdog_points,
    odds_ratio: decimalOdds,
    favorite: 'A', // This will be set when creating the match
    americanOdds
  }
}

/**
 * Calculate points for favorite and underdog based on odds ratio
 * Your system: Underdog = 1000 points, Favorite = 1000 / odds_ratio
 */
export function calculateMatchPoints(oddsRatio: number): OddsCalculation {
  const underdog_points = 1000
  
  // Ensure odds ratio is at least 1.0 (even match)
  const normalizedOdds = Math.max(1.0, oddsRatio)
  
  // Calculate favorite points: 1000 / odds_ratio, with minimum of 50 points
  const favorite_points = Math.max(50, Math.floor(1000 / normalizedOdds))
  
  return {
    favorite_points,
    underdog_points,
    odds_ratio: normalizedOdds,
    favorite: 'A' // This will be set when creating the match
  }
}

/**
 * Get points a user would earn for picking each wrestler
 */
export function getPickingPoints(match: Match): { wrestler_a: number; wrestler_b: number } {
  if (!match.favorite) {
    // If no favorite is set, treat as even match
    return {
      wrestler_a: 500,
      wrestler_b: 500
    }
  }
  
  return {
    wrestler_a: match.favorite === 'A' ? match.favorite_points : match.underdog_points,
    wrestler_b: match.favorite === 'B' ? match.favorite_points : match.underdog_points
  }
}

/**
 * Calculate points earned for a completed pick
 */
export function calculatePickPoints(match: Match, pick: Pick): number {
  if (!match.winner || !pick.selected_wrestler) {
    return 0
  }
  
  // Check if pick was correct
  if (pick.selected_wrestler !== match.winner) {
    return 0
  }
  
  // Return points based on whether they picked favorite or underdog
  if (!match.favorite) {
    return 500 // Default points for even matches
  }
  
  const pickedFavorite = pick.selected_wrestler === match.favorite
  return pickedFavorite ? match.favorite_points : match.underdog_points
}

/**
 * Determine if a wrestler is the favorite or underdog
 */
export function getWrestlerRole(match: Match, wrestler: 'A' | 'B'): 'favorite' | 'underdog' | 'even' {
  if (!match.favorite) {
    return 'even'
  }
  
  return wrestler === match.favorite ? 'favorite' : 'underdog'
}

/**
 * Format odds ratio for display (e.g., "9:1", "2:1", "Even")
 */
export function formatOdds(oddsRatio: number): string {
  if (oddsRatio <= 1.1) {
    return 'Even'
  }
  
  const ratio = Math.round(oddsRatio * 10) / 10
  return `${ratio}:1`
}

/**
 * Format American odds for display (e.g., "+150", "-200", "Even")
 */
export function formatAmericanOdds(americanOdds: number): string {
  if (americanOdds === 0) {
    return 'Even (Pick-em)'
  }
  
  if (americanOdds > 0) {
    return `+${americanOdds}`
  } else {
    return `${americanOdds}`
  }
}

/**
 * Get color class for points display based on favorite/underdog status
 */
export function getPointsColorClass(isUnderdog: boolean): string {
  return isUnderdog 
    ? 'text-orange-600 font-bold' // Underdog - higher points, orange
    : 'text-blue-600' // Favorite - lower points, blue
}

/**
 * Calculate potential points for all matches in an event
 */
export function calculateEventPotential(matches: Match[]): {
  max_possible: number
  min_possible: number
  all_favorites: number
  all_underdogs: number
} {
  let max_possible = 0
  let min_possible = 0
  let all_favorites = 0
  let all_underdogs = 0
  
  matches.forEach(match => {
    const points = getPickingPoints(match)
    const higher = Math.max(points.wrestler_a, points.wrestler_b)
    const lower = Math.min(points.wrestler_a, points.wrestler_b)
    
    max_possible += higher
    min_possible += lower
    
    if (match.favorite) {
      all_favorites += match.favorite_points
      all_underdogs += match.underdog_points
    } else {
      all_favorites += 500
      all_underdogs += 500
    }
  })
  
  return {
    max_possible,
    min_possible,
    all_favorites,
    all_underdogs
  }
}

/**
 * Suggest American odds based on perceived strength difference
 */
export function suggestAmericanOdds(strengthDifference: 'slight' | 'moderate' | 'heavy' | 'extreme'): number {
  switch (strengthDifference) {
    case 'slight':
      return -150  // Slight favorite
    case 'moderate':
      return -300  // Moderate favorite
    case 'heavy':
      return -600  // Heavy favorite
    case 'extreme':
      return -1000 // Extreme favorite
    default:
      return 0     // Even match
  }
}

/**
 * Validate American odds input
 */
export function validateAmericanOdds(odds: number): { isValid: boolean; error?: string } {
  if (odds === 0) {
    return { isValid: true } // Even odds
  }
  
  if (odds > 0 && odds < 100) {
    return { isValid: false, error: 'Positive odds must be 100 or greater (e.g., +100, +150)' }
  }
  
  if (odds < 0 && odds > -100) {
    return { isValid: false, error: 'Negative odds must be -100 or less (e.g., -100, -150)' }
  }
  
  if (Math.abs(odds) > 10000) {
    return { isValid: false, error: 'Odds cannot exceed ±10000' }
  }
  
  return { isValid: true }
}

/**
 * Get risk/reward description for American odds
 */
export function getAmericanOddsDescription(americanOdds: number, basePoints: number = 1000): string {
  if (americanOdds === 0 || Math.abs(americanOdds) <= 5) {
    return `True pick-em - both fighters worth ${basePoints} points`
  }
  
  const probability = americanOddsToImpliedProbability(Math.abs(americanOdds))
  const percentChance = Math.round(probability * 100)
  
  if (americanOdds > 0) {
    return `Underdog with ${percentChance}% implied win chance - balanced expected value`
  } else {
    return `Favorite with ${percentChance}% implied win chance - balanced expected value`
  }
}

/**
 * Suggest odds ratio based on perceived strength difference
 * This is a helper for admins when creating matches
 */
export function suggestOddsRatio(strengthDifference: 'slight' | 'moderate' | 'heavy' | 'extreme'): number {
  switch (strengthDifference) {
    case 'slight':
      return 1.5  // 1.5:1 odds, favorite gets 667 points
    case 'moderate':
      return 3.0  // 3:1 odds, favorite gets 333 points
    case 'heavy':
      return 6.0  // 6:1 odds, favorite gets 167 points
    case 'extreme':
      return 10.0 // 10:1 odds, favorite gets 100 points
    default:
      return 1.0  // Even match
  }
}

/**
 * Validate odds ratio input
 */
export function validateOddsRatio(oddsRatio: number): { isValid: boolean; error?: string } {
  if (oddsRatio < 1.0) {
    return { isValid: false, error: 'Odds ratio must be at least 1.0 (even match)' }
  }
  
  if (oddsRatio > 20.0) {
    return { isValid: false, error: 'Odds ratio cannot exceed 20:1 (too extreme)' }
  }
  
  return { isValid: true }
}

/**
 * Get risk/reward description for odds
 */
export function getOddsDescription(oddsRatio: number): string {
  if (oddsRatio <= 1.1) {
    return 'Even match - equal points for both wrestlers'
  } else if (oddsRatio <= 2.0) {
    return 'Slight favorite - small point difference'
  } else if (oddsRatio <= 4.0) {
    return 'Moderate favorite - good risk/reward balance'
  } else if (oddsRatio <= 8.0) {
    return 'Heavy favorite - high risk, high reward for upset'
  } else {
    return 'Extreme favorite - maximum risk/reward scenario'
  }
} 