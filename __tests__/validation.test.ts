import { 
  validateEmail, 
  validatePassword, 
  validateEvent, 
  validateMatch 
} from '@/lib/validation'

describe('Validation Utilities', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const result = validateEmail('user@example.com')
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid email addresses', () => {
      const result = validateEmail('invalid-email')
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Please enter a valid email address')
    })

    it('should reject empty email', () => {
      const result = validateEmail('')
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Email is required')
    })
  })

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const result = validatePassword('password123')
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject short passwords', () => {
      const result = validatePassword('123')
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password must be at least 6 characters long')
    })

    it('should reject empty password', () => {
      const result = validatePassword('')
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Password is required')
    })
  })

  describe('validateEvent', () => {
    const validEvent = {
      name: 'Final X 2025',
      event_date: '2025-12-31',
      picks_deadline: '2025-12-30T23:59:59'
    }

    it('should validate correct event data', () => {
      const result = validateEvent(validEvent)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject event with empty name', () => {
      const result = validateEvent({ ...validEvent, name: '' })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Event name is required')
    })

    it('should reject event with deadline after event date', () => {
      const result = validateEvent({ 
        ...validEvent, 
        picks_deadline: '2026-01-01T00:00:00' 
      })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Picks deadline must be before the event date')
    })
  })

  describe('validateMatch', () => {
    const validMatch = {
      weight_class: '125 lbs',
      wrestler_a: 'John Doe',
      wrestler_b: 'Jane Smith',
      match_order: 1
    }

    it('should validate correct match data', () => {
      const result = validateMatch(validMatch)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject match with same wrestler names', () => {
      const result = validateMatch({ 
        ...validMatch, 
        wrestler_b: 'John Doe' 
      })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Wrestler names must be different')
    })

    it('should reject invalid match order', () => {
      const result = validateMatch({ 
        ...validMatch, 
        match_order: 0 
      })
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Match order must be a number between 1 and 20')
    })
  })
}) 