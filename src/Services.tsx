import { ArrowPathIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { Palette, GraduationCap } from 'lucide-react'
import type { HTMLAttributes } from 'react'

const features = [
  {
    name: 'Design',
    description:
      'We can bring your vision to life with cutting-edge technology and a focus on user experience.',
    icon: Palette,
  },
  {
    name: 'Development',
    description:
      'From static sites to full-stack applications, we can help you build it. We offer a wide range of services to help you build your next project.',
    icon: LockClosedIcon,
  },
  {
    name: 'SEO',
    description:
      'Maximize your online visibility and attract more traffic to your website with our expert search engine optimization (SEO) services.',
    icon: ArrowPathIcon,
  },
  {
    name: 'Education',
    description:
      'Through pair programming and mentoring, we can help you learn the skills you need to build your next project.',
    icon: GraduationCap,
  },
]

export function Services(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className='bg-gradient-to-r from-slate-950 to-slate-900 py-24 sm:py-32'
      {...props}
    >
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-2xl lg:text-center'>
          <h2 className='mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl'>
            Everything you need for your business
          </h2>
          <p className='mt-6 text-lg leading-8 text-primary-200'>
            Quis tellus eget adipiscing convallis sit sit eget aliquet quis.
            Suspendisse eget egestas a elementum pulvinar et feugiat blandit at.
            In mi viverra elit nunc.
          </p>
        </div>
        <div className='mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl'>
          <dl className='grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16'>
            {features.map((feature) => (
              <div key={feature.name} className='relative pl-16'>
                <dt className='text-base font-semibold leading-7 text-white'>
                  <div className='absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-white bg-opacity-10'>
                    <feature.icon
                      className='h-6 w-6 text-white'
                      aria-hidden='true'
                    />
                  </div>
                  {feature.name}
                </dt>
                <dd className='mt-2 text-base leading-7 text-primary-200'>
                  {feature.description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
