'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * The hero's rotating image.
 *
 * Cross-fades rather than slides: the hero sits next to a headline someone is
 * reading, and lateral movement in the corner of the eye pulls attention off
 * the text. A fade changes the picture without asking to be watched.
 *
 * Under `prefers-reduced-motion` it stops on the first frame entirely — this
 * is decoration, so the honest response to "less motion" is none, not less.
 */

const SLIDES = [
  { src: '/hero/stem-1.jpg', alt: 'Bir deney sırasında erlene renkli sıvı aktaran eller' },
  { src: '/hero/stem-2.jpg', alt: 'Işığı kıran bir prizmayı tutan el' },
  { src: '/hero/stem-3.jpg', alt: 'Sarkaç deneyi yapan eller' },
] as const;

const INTERVAL_MS = 6000;

export function HeroSlideshow() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // No timer at all under reduced motion, rather than a slower one: this
    // is decoration, so the honest response is to stop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] border border-line bg-surface-2 lg:aspect-[5/4]">
      {SLIDES.map((slide, i) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={i === index ? slide.alt : ''}
          fill
          // The hero is the first thing on the page; the visible frame should
          // not wait on lazy loading.
          priority={i === 0}
          sizes="(min-width: 1024px) 560px, 100vw"
          className={`object-cover transition-opacity duration-1000 ease-in-out ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden={i === index ? undefined : true}
        />
      ))}

      {/* Hidden when the slideshow is not advancing — dots that never move
          would be a lie about what the component is doing. */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 motion-reduce:hidden">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.src}
            aria-hidden="true"
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === index ? 'w-5 bg-ink' : 'w-1.5 bg-ink/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
