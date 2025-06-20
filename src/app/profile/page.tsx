'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@/lib/useUser'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { useRouter } from 'next/navigation'

interface UserStats {
  totalEvents: number
  totalPicks: number
  correctPicks: number
  totalPoints: number
  averagePoints: number
  winRate: number
}

interface RecentEvent {
  event_name: string
  event_date: string
  user_points: number
  total_possible_points: number
  rank: number
  total_participants: number
}

export default function ProfilePage() {
  const { user, loading: userLoading } = useUser()
  const router = useRouter()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userLoading && !user) {
      router.push('/auth')
      return
    }
    
    if (user) {
      fetchUserStats()
    }
  }, [user, userLoading, router])

  const fetchUserStats = async () => {
    if (!user) return

    try {
      setLoading(true)

      // Get user's event participations with results
      const { data: participations, error: participationsError } = await supabase
        .from('event_participants')
        .select(`
          *,
          events(name, event_date)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (participationsError) throw participationsError

      // Get total picks count
      const { count: totalPicks } = await supabase
        .from('picks')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)

      // Get correct picks count (where picked fighter won)
      const { data: correctPicksData, error: correctPicksError } = await supabase
        .from('picks')
        .select(`
          *,
          matches!inner(winner_id)
        `)
        .eq('user_id', user.id)
        .not('matches.winner_id', 'is', null)

      if (correctPicksError) throw correctPicksError

      const correctPicks = correctPicksData?.filter(pick => 
        pick.fighter_id === pick.matches?.winner_id
      ).length || 0

      // Calculate stats
      const totalEvents = participations?.length || 0
      const totalPoints = participations?.reduce((sum, p) => sum + (p.total_points || 0), 0) || 0
      const averagePoints = totalEvents > 0 ? totalPoints / totalEvents : 0
      const winRate = totalPicks && totalPicks > 0 ? (correctPicks / totalPicks) * 100 : 0

      setStats({
        totalEvents,
        totalPicks: totalPicks || 0,
        correctPicks,
        totalPoints,
        averagePoints,
        winRate
      })

      // Format recent events data
      const recentEventsData: RecentEvent[] = (participations || [])
        .slice(0, 5)
        .map(p => ({
          event_name: p.events?.name || 'Unknown Event',
          event_date: p.events?.event_date || '',
          user_points: p.total_points || 0,
          total_possible_points: p.max_possible_points || 0,
          rank: p.final_rank || 0,
          total_participants: p.total_participants || 0
        }))

      setRecentEvents(recentEventsData)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (userLoading || loading) {
    return <LoadingSpinner size="lg" text="Loading profile..." />
  }

  if (!user) {
    return null // Will redirect
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ErrorMessage error={error} className="mb-6" />

      {/* Profile Header */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex items-center">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            {user.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="ml-6">
            <h1 className="text-2xl font-bold text-gray-900">
              {user.user_metadata?.full_name || user.email}
            </h1>
            <p className="text-gray-600">{user.email}</p>
            <p className="text-sm text-gray-500">
              Member since {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats?.totalEvents || 0}</div>
          <div className="text-gray-600">Events Played</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-green-600">{stats?.totalPicks || 0}</div>
          <div className="text-gray-600">Total Picks</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-purple-600">
            {stats?.winRate.toFixed(1) || 0}%
          </div>
          <div className="text-gray-600">Win Rate</div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-3xl font-bold text-orange-600">
            {stats?.averagePoints.toFixed(0) || 0}
          </div>
          <div className="text-gray-600">Avg Points</div>
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Stats */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Performance</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Points Earned:</span>
              <span className="font-semibold">{stats?.totalPoints.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Correct Picks:</span>
              <span className="font-semibold">
                {stats?.correctPicks || 0} / {stats?.totalPicks || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Average Points per Event:</span>
              <span className="font-semibold">{stats?.averagePoints.toFixed(0) || 0}</span>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Events</h2>
          {recentEvents.length === 0 ? (
            <p className="text-gray-500">No events participated yet.</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.map((event, index) => (
                <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="font-semibold text-gray-900">{event.event_name}</div>
                  <div className="text-sm text-gray-600">
                    {new Date(event.event_date).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-gray-500">
                    {event.user_points} points • Rank #{event.rank} of {event.total_participants}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Achievement Badges (Future Feature) */}
      <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Achievements</h2>
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">🏆</div>
          <p>Achievement system coming soon!</p>
          <p className="text-sm">Earn badges for your picking prowess.</p>
        </div>
      </div>
    </div>
  )
} 