/**
 * Centralized error handling utilities
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'DATABASE_ERROR', 500)
    this.name = 'DatabaseError'
    
    // Log the original error for debugging
    if (originalError) {
      console.error('Database Error Details:', originalError)
    }
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthError'
  }
}

/**
 * Safely extract error message from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'An unexpected error occurred'
}

/**
 * Handle Supabase errors and convert to appropriate AppError types
 */
export function handleSupabaseError(error: unknown): AppError {
  if (!error) return new AppError('Unknown error occurred')
  
  // Type guard for error-like objects
  const errorObj = error as { message?: string; code?: string }
  const message = errorObj.message || 'Database operation failed'
  
  // Handle specific Supabase error codes
  switch (errorObj.code) {
    case '23505': // Unique constraint violation
      return new ValidationError('This record already exists')
    case '23503': // Foreign key violation
      return new ValidationError('Referenced record does not exist')
    case '42501': // Insufficient privilege
      return new AuthError('You do not have permission to perform this action')
    default:
      return new DatabaseError(message, error)
  }
}

/**
 * Toast notification helper (to be used with a toast library later)
 */
export function showErrorToast(error: unknown) {
  const message = getErrorMessage(error)
  console.error('Error:', message)
  // TODO: Integrate with toast notification library
  return message
} 