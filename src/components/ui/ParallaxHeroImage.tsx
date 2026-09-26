'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'

// Image moves at half the scroll speed; keep in sync with .hero-parallax in globals.css
const PARALLAX_SPEED = 0.5

interface ParallaxHeroImageProps {
  src: string
  alt: string
}

export function ParallaxHeroImage({ src, alt }: ParallaxHeroImageProps) {
  const imageRef = useRef<HTMLDivElement>(null)
  const [objectPosition, setObjectPosition] = useState('center 27%')

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = (e: MediaQueryList | MediaQueryListEvent) => {
      setObjectPosition(e.matches ? 'center 27%' : 'center 60%')
    }
    update(mq)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    // Browsers with scroll-driven animations run the parallax from CSS
    // (.hero-parallax in globals.css) on the compositor thread, in sync with
    // native scrolling. A JS scroll listener lags a frame behind touch
    // scrolling on mobile, which makes the image visibly jitter.
    if (CSS.supports('animation-timeline: scroll()')) return

    // Without CSS support, skip the effect on any device with touch input
    // (including hybrid laptops/tablets), where the JS version shakes, and
    // for users who prefer reduced motion.
    if (window.matchMedia('(any-pointer: coarse), (prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (!imageRef.current) return

        // Clamp so the transform stops updating once the hero is off screen
        const scrolled = Math.min(Math.max(window.scrollY, 0), window.innerHeight)
        imageRef.current.style.transform = `translateY(${scrolled * PARALLAX_SPEED}px)`
      })
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="absolute inset-0">
      <div
        ref={imageRef}
        className="hero-parallax absolute inset-0 will-change-transform"
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
