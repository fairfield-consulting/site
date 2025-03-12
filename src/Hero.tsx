import { EnvelopeIcon } from '@heroicons/react/24/solid'

export const Hero = ({ code }: { code: string }) => {
  return (
    <div className='bg-white'>
      <div className='from-primary-100/20 relative isolate overflow-hidden bg-gradient-to-b'>
        <div className='mx-auto max-w-7xl pb-24 pt-10 sm:pb-32 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:px-8 lg:py-40'>
          <div className='px-6 lg:px-0 lg:pt-4'>
            <div className='mx-auto max-w-2xl'>
              <div className='max-w-lg'>
                <div className='inline-flex flex-row items-center'>
                  <span
                    className='rounded bg-slate-950 px-3 py-1.5 text-3xl font-bold text-white'
                    role='img'
                    aria-hidden='true'
                  >
                    F
                  </span>
                  <span className='ml-2 font-bold text-slate-950'>
                    Fairfield Consulting
                  </span>
                </div>
                <h1 className='mt-10 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl'>
                  Creating better web experiences together
                </h1>
                <p className='mt-6 text-lg leading-8 text-gray-600'>
                  Fairfield Consulting is a full-service web development
                  consultancy based in Detroit, MI. We specialize in building
                  custom websites, web applications and APIs for small
                  businesses and startups.
                </p>
                <div className='mt-10 flex items-center gap-x-6'>
                  <a
                    href='mailto:hello@fairfieldconsulting.llc'
                    className='bg-primary-900 hover:bg-primary-800 focus-visible:outline-primary-800 inline-flex items-center rounded-md px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
                  >
                    Let's talk{' '}
                    <EnvelopeIcon
                      aria-hidden='true'
                      className='ml-1.5 h-4 w-4'
                    />
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className='mt-20 sm:mt-24 md:mx-auto md:max-w-2xl lg:mx-0 lg:mt-0 lg:w-screen'>
            <div
              className='shadow-primary-600/10 ring-primary-50 absolute inset-y-0 right-1/2 -z-10 -mr-10 w-[200%] skew-x-[-30deg] bg-white shadow-xl ring-1 md:-mr-20 lg:-mr-36'
              aria-hidden='true'
            />
            <div className='shadow-lg md:rounded-3xl'>
              <div className='bg-blue-500/50 [clip-path:inset(0)] md:[clip-path:inset(0_round_theme(borderRadius.3xl))]'>
                <div
                  className='bg-primary-100 absolute -inset-y-px left-1/2 -z-10 ml-10 w-[200%] skew-x-[-30deg] opacity-20 ring-1 ring-inset ring-white md:ml-20 lg:ml-36'
                  aria-hidden='true'
                />
                <div className='relative px-6 pt-8 sm:pt-16 md:pl-16 md:pr-0'>
                  <div className='mx-auto max-w-2xl md:mx-0 md:max-w-none'>
                    <div className='w-screen overflow-hidden rounded-tl-xl bg-gray-900'>
                      <div className='flex bg-gray-800/40 ring-1 ring-white/5'>
                        <div className='-mb-px flex text-sm font-medium leading-6 text-gray-400'>
                          <div className='border-b border-r border-b-white/20 border-r-white/10 bg-white/5 px-4 py-2 text-white'>
                            components/counter.tsx
                          </div>
                          <div className='border-r border-gray-600/10 px-4 py-2'>
                            app.tsx
                          </div>
                        </div>
                      </div>
                      <div
                        className='px-6 pb-14 pt-6 [&>pre]:!bg-transparent'
                        dangerouslySetInnerHTML={{ __html: code }}
                      ></div>
                    </div>
                  </div>
                  <div
                    className='pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10 md:rounded-3xl'
                    aria-hidden='true'
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-t from-white sm:h-32' />
      </div>
    </div>
  )
}
