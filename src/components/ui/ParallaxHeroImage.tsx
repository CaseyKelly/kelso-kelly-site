'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'

interface ParallaxHeroImageProps {
  src: string
  alt: string
}

export function ParallaxHeroImage({ src, alt }: ParallaxHeroImageProps) {
  const imageRef = useRef<HTMLDivElement>(null)

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
          className="object-cover object-[center_30%] hero-image"
          priority
          quality={90}
        />
      </div>
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/50 via-zinc-950/40 to-zinc-950/70" />
      {/* Vignette effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.2)_100%)]" />
    </div>
  )
}
