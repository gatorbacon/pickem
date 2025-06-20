import type { Metadata } from 'next'
import { Inter, Bebas_Neue } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'

const inter = Inter({ subsets: ['latin'] })
const bebasNeue = Bebas_Neue({ 
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas'
})

export const metadata: Metadata = {
  title: 'GatorBacon - Wrestling & MMA Pick \'Em',
  description: 'A wrestling and MMA pick \'em with some funk. Grip tight, pick weird.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${bebasNeue.variable}`}>
        <Navigation />
        <main className="min-h-screen" style={{ backgroundColor: 'rgb(245, 237, 216)' }}>
          {children}
        </main>
      </body>
    </html>
  )
} 