/**
 * Input validation utilities
 */

import { ValidationError } from './errors'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const errors: string[] = []
  
  if (!email) {
    errors.push('Email is required')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please enter a valid email address')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): ValidationResult {
  const errors: string[] = []
  
  if (!password) {
    errors.push('Password is required')
  } else {
    if (password.length < 6) {
      errors.push('Password must be at least 6 characters long')
    }
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters')
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate event data
 */
export function validateEvent(data: {
  name: string
  event_date: string
  picks_deadline: string
}): ValidationResult {
  const errors: string[] = []
  
  if (!data.name?.trim()) {
    errors.push('Event name is required')
  } else if (data.name.length > 100) {
    errors.push('Event name must be less than 100 characters')
  }
  
  if (!data.event_date) {
    errors.push('Event date is required')
  } else {
    const eventDate = new Date(data.event_date)
    if (isNaN(eventDate.getTime())) {
      errors.push('Please enter a valid event date')
    }
  }
  
  if (!data.picks_deadline) {
    errors.push('Picks deadline is required')
  } else {
    const deadline = new Date(data.picks_deadline)
    
    if (isNaN(deadline.getTime())) {
      errors.push('Please enter a valid picks deadline')
    }
    // Removed the date comparison validation entirely for now
    // This allows any deadline as long as it's a valid date
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate match data
 */
export function validateMatch(data: {
  weight_class: string
  wrestler_a: string
  wrestler_b: string
  match_order: number
}): ValidationResult {
  const errors: string[] = []
  
  if (!data.weight_class?.trim()) {
    errors.push('Weight class is required')
  } else if (data.weight_class.length > 50) {
    errors.push('Weight class must be less than 50 characters')
  }
  
  if (!data.wrestler_a?.trim()) {
    errors.push('Wrestler A name is required')
  } else if (data.wrestler_a.length > 100) {
    errors.push('Wrestler A name must be less than 100 characters')
  }
  
  if (!data.wrestler_b?.trim()) {
    errors.push('Wrestler B name is required')
  } else if (data.wrestler_b.length > 100) {
    errors.push('Wrestler B name must be less than 100 characters')
  }
  
  if (data.wrestler_a?.trim().toLowerCase() === data.wrestler_b?.trim().toLowerCase()) {
    errors.push('Wrestler names must be different')
  }
  
  if (!Number.isInteger(data.match_order) || data.match_order < 1 || data.match_order > 20) {
    errors.push('Match order must be a number between 1 and 20')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate pick data
 */
export function validatePick(selectedWrestler: string): ValidationResult {
  const errors: string[] = []
  
  if (!selectedWrestler || !['A', 'B'].includes(selectedWrestler)) {
    errors.push('Please select a wrestler')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Generic required field validator
 */
export function validateRequired(value: unknown, fieldName: string): ValidationResult {
  const errors: string[] = []
  
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    errors.push(`${fieldName} is required`)
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input?.trim().replace(/\s+/g, ' ') || ''
}

/**
 * Throw validation error if validation fails
 */
export function validateOrThrow(validation: ValidationResult, context?: string): void {
  if (!validation.isValid) {
    const message = context 
      ? `${context}: ${validation.errors.join(', ')}`
      : validation.errors.join(', ')
    throw new ValidationError(message)
  }
} 