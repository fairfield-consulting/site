import {
  BookOpenIcon,
  ComputerDesktopIcon,
  MagnifyingGlassIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'Design',
    description:
      'We make your vision a reality through innovative technology, user-friendly design, and a strong focus on user experience.',
    icon: PencilIcon,
  },
  {
    name: 'Development',
    description:
      'We specialize in React and TypeScript websites and applications with proficiency in other languages and frameworks.',
    icon: ComputerDesktopIcon,
  },
  {
    name: 'SEO',
    description:
      'Enhance your web presence and drive more website traffic with our professional SEO services.',
    icon: MagnifyingGlassIcon,
  },
  {
    name: 'Education',
    description:
      'Through pair programming and mentorship, help you and your team learn new technologies and best practices.',
    icon: BookOpenIcon,
  },
]

export function Services() {
  return (
    <div className='bg-gradient-to-r from-primary-950 to-primary-900 py-24 sm:py-32'>
      <div className='mx-auto max-w-7xl px-6 lg:px-8'>
        <div className='mx-auto max-w-2xl lg:text-center'>
          <h2 className='mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl'>
            Our Services
          </h2>
          <p className='mt-6 text-lg leading-8 text-primary-200'>
            Here&apos;s how we can help with your next project.
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
