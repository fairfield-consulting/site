import { ImageResponse } from 'next/server'

export const runtime = 'edge'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white',
          padding: '2rem',
        }}
      >
        <div tw='flex flex-row'>
          <div tw='flex flex-row items-center'>
            <span
              tw='rounded bg-slate-900 px-6 py-2 text-6xl font-bold text-white'
              role='img'
            >
              F
            </span>
            <h1 tw='ml-2 font-bold text-slate-900 text-6xl'>
              Fairfield Consulting
            </h1>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
