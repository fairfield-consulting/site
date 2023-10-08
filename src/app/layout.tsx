import './globals.css'

import { Analytics } from '@vercel/analytics/react'
import clsx from 'clsx'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`
  ),
  title: 'Fairfield Consulting LLC',
  description:
    'Fairfield Consulting is a full-service web development consultancy based in Detroit. We specialize in building custom web applications and websites for small businesses and startups.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang='en'>
      <body className={clsx(inter.className, 'scroll-smooth bg-white')}>
        <div className='bg-white'>{children}</div>
        <Analytics />
      </body>
    </html>
  )
}
