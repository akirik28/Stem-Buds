/**
 * A full-bleed band of photographs that drifts slowly sideways.
 *
 * The motion is the effect, so there is no JavaScript here at all: the list
 * is rendered twice and the track is translated by exactly half its width,
 * which lands the second copy where the first began and makes the loop
 * seamless. Pausing on hover lets someone actually look at a picture instead
 * of chasing it.
 *
 * Decorative, so the tiles carry empty alt text and the band is hidden from
 * assistive technology: nothing here is information the prose around it does
 * not already carry. Under `prefers-reduced-motion` it stops dead rather than
 * slowing down — the honest response to "less motion" is none.
 *
 * The photographs are royalty-free stock (Unsplash License). Swapping in real
 * programme photographs is a matter of replacing the files in
 * `public/gallery` — no code change.
 */
export function PhotoStrip({
  photos,
  reverse = false,
  durationSeconds = 90,
}: {
  photos: readonly string[];
  /** Drifts the other way, so two bands on one page do not move in lockstep. */
  reverse?: boolean;
  durationSeconds?: number;
}) {
  return (
    <div aria-hidden="true" className="photo-strip">
      <div
        className={`photo-strip-track ${reverse ? 'is-reverse' : ''}`}
        style={{ animationDuration: `${durationSeconds}s` }}
      >
        {/* Twice through: the duplicate is what the loop wraps onto. */}
        {[...photos, ...photos].map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${index}`}
            src={src}
            alt=""
            loading={index < 6 ? 'eager' : 'lazy'}
            decoding="async"
            className="photo-strip-tile"
          />
        ))}
      </div>
    </div>
  );
}
