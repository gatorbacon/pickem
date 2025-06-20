'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Event, EventType } from '@/lib/types'
import { useUser } from '@/lib/useUser'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

interface EventWithType extends Event {
  event_types?: EventType
  participant_count?: number
  match_count?: number
}

interface SportCategory {
  eventType: EventType
  events: EventWithType[]
}

export default function Home() {
  const { user } = useUser()
  const [sportCategories, setSportCategories] = useState<SportCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEventsAndSports()
  }, [])

  const fetchEventsAndSports = async () => {
    try {
      setLoading(true)
      
      // Fetch all event types
      const { data: eventTypes, error: eventTypesError } = await supabase
        .from('event_types')
        .select('*')
        .order('name')
      
      if (eventTypesError) throw eventTypesError

      // Fetch all active events with their types and stats
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          event_types(id, name, icon, description)
        `)
        .eq('is_active', true)
        .gte('picks_deadline', new Date().toISOString())
        .order('event_date', { ascending: true })
      
      if (eventsError) throw eventsError

      // Get participant and match counts for each event
      const eventsWithStats = await Promise.all(
        (events || []).map(async (event) => {
          // Get participant count
          const { count: participantCount } = await supabase
            .from('event_participants')
            .select('*', { count: 'exact' })
            .eq('event_id', event.id)
          
          // Get match count
          const { count: matchCount } = await supabase
            .from('matches')
            .select('*', { count: 'exact' })
            .eq('event_id', event.id)
          
          return {
            ...event,
            participant_count: participantCount || 0,
            match_count: matchCount || 0
          }
        })
      )

      // Group events by sport type
      const categories: SportCategory[] = (eventTypes || []).map(eventType => ({
        eventType,
        events: eventsWithStats.filter(event => event.event_type_id === eventType.id)
      })).filter(category => category.events.length > 0)

      setSportCategories(categories)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const getDeadlineStatus = (deadline: string) => {
    const deadlineDate = new Date(deadline)
    const now = new Date()
    const timeDiff = deadlineDate.getTime() - now.getTime()
    
    if (timeDiff < 0) {
      return { status: 'passed', text: 'Closed', color: 'text-red-600' }
    } else if (timeDiff < 3600000) { // Less than 1 hour
      return { status: 'urgent', text: `${Math.floor(timeDiff / 60000)}m left`, color: 'text-orange-600' }
    } else if (timeDiff < 86400000) { // Less than 24 hours
      return { status: 'soon', text: `${Math.floor(timeDiff / 3600000)}h left`, color: 'text-yellow-600' }
    } else {
      const days = Math.floor(timeDiff / 86400000)
      return { status: 'open', text: `${days}d left`, color: 'text-green-600' }
    }
  }

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading events..." />
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <ErrorMessage error={error} className="mb-6" />
      
      {/* Hero Section - Horizontal layout */}
      <div className="mb-8">
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 mb-8">
          {/* Logo */}
          <div className="flex-shrink-0">
            <img 
              src="/images/gb-logo-trans.png" 
              alt="GatorBacon" 
              className="h-64 lg:h-80 w-auto"
            />
          </div>
          
          {/* Text Content */}
          <div className="text-center lg:text-left max-w-2xl">
            <h1 className="font-gritty text-4xl md:text-5xl lg:text-6xl text-gray-900 mb-4 tracking-wider leading-tight">
              THE SWAMP<br />IS CALLING.
            </h1>
            <p className="text-xl lg:text-2xl text-gray-700 mb-6 font-medium leading-relaxed">
              A wrestling and MMA pick 'em with some funk. You're either slamming big favorites or you're pulling off wild upsets.
            </p>
            
            {/* CTA Buttons moved here */}
            {!user && (
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link
                  href="/auth"
                  className="inline-flex items-center justify-center px-8 py-4 border-2 border-blue-900 font-gritty text-lg tracking-wide text-blue-900 bg-transparent hover:bg-blue-900 hover:text-white transition-all duration-200 rounded-lg"
                >
                  JOIN A CONTEST
                </Link>
                <Link
                  href="/auth"
                  className="inline-flex items-center justify-center px-8 py-4 border-2 border-orange-600 font-gritty text-lg tracking-wide text-white bg-orange-600 hover:bg-orange-700 hover:border-orange-700 transition-all duration-200 rounded-lg"
                >
                  CREATE ACCOUNT
                </Link>
              </div>
            )}
          </div>
        </div>
        
        {/* Sport Selection Banners - Different backgrounds */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-8">
          {/* Wrestling Banner - Dark Green Background */}
          <div className="bg-green-900 rounded-lg p-4 shadow-xl">
            <Link
              href={user ? "/picks?sport=wrestling" : "/auth"}
              className="group block rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <img 
                src="/images/wrestlingbanner.png" 
                alt="Enter Wrestling Brackets" 
                className="w-full h-auto rounded-lg"
              />
            </Link>
          </div>

          {/* MMA Banner - Dark Red Background */}
          <div className="bg-red-900 rounded-lg p-4 shadow-xl">
            <Link
              href={user ? "/picks?sport=mma" : "/auth"}
              className="group block rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
            >
              <img 
                src="/images/mmabanner.png" 
                alt="Make MMA Picks" 
                className="w-full h-auto rounded-lg"
              />
            </Link>
          </div>
        </div>
      </div>

      {/* Sports Categories - Upcoming Events */}
      {sportCategories.length === 0 ? (
        <div className="text-center py-12 mb-12">
          <div className="text-gray-500 text-lg">
            No upcoming events available for picks.
          </div>
          <p className="text-gray-400 mt-2">
            Check back soon for new events!
          </p>
        </div>
      ) : (
        <div className="space-y-12 mb-12">
          {sportCategories.map((category) => (
            <div key={category.eventType.id} className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-6">
                <span className="text-3xl mr-3">{category.eventType.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{category.eventType.name}</h2>
                  <p className="text-gray-600">{category.eventType.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {category.events.map((event) => {
                  const deadlineStatus = getDeadlineStatus(event.picks_deadline)
                  
                  return (
                    <Link
                      key={event.id}
                      href={user ? `/picks?event=${event.id}` : '/auth'}
                      className="block bg-gray-50 rounded-lg p-6 hover:bg-gray-100 transition-colors border border-gray-200 hover:border-blue-300"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                          {event.name}
                        </h3>
                        <span className={`text-sm font-medium ${deadlineStatus.color}`}>
                          {deadlineStatus.text}
                        </span>
                      </div>
                      
                      {event.description && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      
                      <div className="flex justify-between items-center text-sm text-gray-500">
                        <div className="flex space-x-4">
                          <span>📅 {new Date(event.event_date).toLocaleDateString()}</span>
                          <span>🥊 {event.match_count} matches</span>
                        </div>
                        <span>👥 {event.participant_count}</span>
                      </div>
                      
                      <div className="mt-4 text-center">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {user ? 'Make Picks' : 'Sign In to Play'}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clubhouse Content Modules */}
      <div className="space-y-8 mb-12">
        {/* Top Picks of the Week */}
        <div className="bg-white bg-opacity-80 rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-3">🔥</span>
            <h2 className="font-gritty text-2xl text-gray-900 tracking-wide">TOP PICKS OF THE WEEK</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="font-bold text-lg text-gray-900">John "The Hammer" Smith</div>
              <div className="text-sm text-gray-600">87% of players picked him</div>
              <div className="text-xs text-green-600 font-semibold mt-1">SAFE PICK</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="font-bold text-lg text-gray-900">Maria "Lightning" Rodriguez</div>
              <div className="text-sm text-gray-600">72% of players picked her</div>
              <div className="text-xs text-blue-600 font-semibold mt-1">CROWD FAVORITE</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="font-bold text-lg text-gray-900">Tommy "Wildcard" Johnson</div>
              <div className="text-sm text-gray-600">15% of players picked him</div>
              <div className="text-xs text-red-600 font-semibold mt-1">RISKY PLAY</div>
            </div>
          </div>
        </div>

        {/* Sharp vs Crowd */}
        <div className="bg-gradient-to-r from-blue-900 to-green-900 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-3">🧠</span>
            <h2 className="font-gritty text-2xl tracking-wide">SHARP VS CROWD</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">68%</div>
              <div className="text-sm opacity-90">Your picks match the crowd</div>
              <div className="text-xs opacity-75 mt-1">Playing it safe this week</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">32%</div>
              <div className="text-sm opacity-90">Your contrarian plays</div>
              <div className="text-xs opacity-75 mt-1">Bold moves pay off big</div>
            </div>
          </div>
        </div>

        {/* Upset Radar */}
        <div className="bg-red-900 bg-opacity-90 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-3">🎯</span>
            <h2 className="font-gritty text-2xl tracking-wide">UPSET RADAR</h2>
          </div>
          <div className="bg-black bg-opacity-30 rounded-lg p-4">
            <div className="text-center">
              <div className="font-bold text-xl mb-2">Danny "Dark Horse" Williams</div>
              <div className="text-lg mb-2">Only <span className="text-yellow-400 font-bold">12%</span> of people picked this dude</div>
              <div className="text-sm opacity-90 mb-3">Are you bold enough?</div>
              <div className="inline-block bg-yellow-500 text-black px-4 py-2 rounded-full font-bold text-sm">
                1000 POINT UPSET SPECIAL
              </div>
            </div>
          </div>
        </div>

        {/* Trashboard Feed */}
        <div className="bg-gray-900 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center mb-4">
            <span className="text-2xl mr-3">🗣</span>
            <h2 className="font-gritty text-2xl tracking-wide">TRASHBOARD FEED</h2>
          </div>
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-sm font-bold">
                  G
                </div>
                <div>
                  <div className="font-semibold">GatorMaster2024</div>
                  <div className="text-sm text-gray-300">"Y'all sleeping on the undercard fights. That's where the real money is 💰"</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-sm font-bold">
                  W
                </div>
                <div>
                  <div className="font-semibold">WrestleFanatic</div>
                  <div className="text-sm text-gray-300">"Called the last 3 upsets in a row. This week I'm going ALL underdogs 🐊"</div>
                </div>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                  B
                </div>
                <div>
                  <div className="font-semibold">BaconBiter</div>
                  <div className="text-sm text-gray-300">"Safe picks are for safe people. GRIP TIGHT, PICK WEIRD! 🔥"</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* Quick Links */}
      <div className="mt-16 text-center">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Link
            href="/leaderboard"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Leaderboard</h3>
            <p className="text-gray-600 text-sm">See who&apos;s dominating the competition</p>
          </Link>
          
          {user && (
            <Link
              href="/picks"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="text-3xl mb-3">🎯</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">My Picks</h3>
              <p className="text-gray-600 text-sm">View and manage your predictions</p>
            </Link>
          )}
          
          {user && (
            <Link
              href="/profile"
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="text-3xl mb-3">👤</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Profile</h3>
              <p className="text-gray-600 text-sm">Track your stats and achievements</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
} 