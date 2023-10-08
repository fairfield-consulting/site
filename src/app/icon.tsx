import { Inter } from 'next/font/google'
import { ImageResponse } from 'next/server'

export const runtime = 'edge'

export const size = {
  width: 32,
  height: 32,
}

const inter = Inter({ weight: '900', subsets: ['latin'] })

export default function Icon() {
  return new ImageResponse(
    (
      <span
        className={inter.className}
        tw='bg-slate-900 text-white w-full h-full flex items-center justify-center text-2xl font-black rounded'
      >
        F
      </span>
    ),
    size
  )
}
