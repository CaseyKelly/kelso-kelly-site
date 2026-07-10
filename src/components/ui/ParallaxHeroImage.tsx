'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

interface ParallaxHeroImageProps {
  src: string
  alt: string
}

export function ParallaxHeroImage({ src, alt }: ParallaxHeroImageProps) {
  const imageRef = useRef<HTMLDivElement>(null)
  const [objectPosition, setObjectPosition] = useState('center 30%')

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = (e: MediaQueryList | MediaQueryListEvent) => {
      setObjectPosition(e.matches ? 'center 30%' : 'center 60%')
    }
    update(mq)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      if (!imageRef.current) return

      const scrolled = window.scrollY
      const parallaxSpeed = 0.5 // Adjust this value for more/less parallax effect

      // Apply transform to create parallax effect
      imageRef.current.style.transform = `translateY(${scrolled * parallaxSpeed}px)`
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <div
        ref={imageRef}
        className="absolute inset-0 will-change-transform"
        style={{
          top: '5%',
          height: '120%',
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover hero-image"
          style={{ objectPosition }}
          sizes="100vw"
          priority
          quality={75}
        />
      </div>
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950/70" />
      {/* Vignette effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.2)_100%)]" />
    </div>
  )
}
