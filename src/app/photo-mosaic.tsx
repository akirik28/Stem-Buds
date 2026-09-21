/**
 * The photo wall behind the hero: rows of pictures drifting sideways at
 * different speeds, in alternating directions.
 *
 * No JavaScript. Each row renders its slice of the pool twice and translates
 * by exactly half the track width, so the duplicate lands where the original
 * began and the loop has no seam. Different durations per row keep the rows
 * from ever lining up into an obvious repeating block, and alternating the
 * direction stops the whole wall reading as one flat sheet sliding past.
 *
 * Deliberately a background, not a gallery: the rows are desaturated and sit
 * under a veil so the headline stays the thing you read first, and the whole
 * thing is `aria-hidden` — announcing thirty decorative photographs before
 * the headline would be worse than silence.
 *
 * Cost is bounded by what is rendered rather than by how many photographs
 * exist: each row draws only its own slice, so growing `PHOTOS` widens the
 * variety without adding elements. Under `prefers-reduced-motion` nothing
 * moves at all — this is decoration, so the honest response to "less motion"
 * is none.
 */

const PHOTOS = [
  '/gallery/g-01.jpg',
  '/gallery/g-02.jpg',
  '/gallery/g-03.jpg',
  '/gallery/g-04.jpg',
  '/gallery/g-05.jpg',
  '/gallery/g-06.jpg',
  '/gallery/g-07.jpg',
  '/gallery/g-08.jpg',
  '/gallery/g-09.jpg',
  '/gallery/g-10.jpg',
  '/gallery/g-11.jpg',
  '/gallery/g-12.jpg',
  '/gallery/g-13.jpg',
  '/gallery/g-14.jpg',
  '/hero/stem-1.jpg',
] as const;

/** Slower rows read as further away. */
const ROWS = [
  { seconds: 110, reverse: false },
  { seconds: 150, reverse: true },
  { seconds: 125, reverse: false },
  { seconds: 165, reverse: true },
] as const;

/**
 * Every Nth photograph starting at `start`, so no two rows open on the same
 * run. Repeated until the row is long enough to outrun the widest viewport
 * before it wraps.
 */
function sliceFor(rowIndex: number): string[] {
  const base: string[] = [];
  for (let i = rowIndex; i < PHOTOS.length; i += ROWS.length) {
    const photo = PHOTOS[i];
    if (photo) base.push(photo);
  }
  const out = [...base];
  while (out.length < 10 && base.length > 0) out.push(...base);
  return out;
}

export function PhotoMosaic() {
  return (
    <div aria-hidden="true" className="photo-mosaic">
      {ROWS.map((row, rowIndex) => {
        const photos = sliceFor(rowIndex);
        return (
          <div
            key={rowIndex}
            className={`photo-mosaic-track ${row.reverse ? 'is-reverse' : ''}`}
            style={{ animationDuration: `${row.seconds}s` }}
          >
            {/* Twice through: the duplicate is what the loop wraps onto. */}
            {[...photos, ...photos].map((src, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${src}-${index}`}
                src={src}
                alt=""
                loading={rowIndex < 2 && index < 5 ? 'eager' : 'lazy'}
                decoding="async"
                className="photo-mosaic-tile"
              />
            ))}
          </div>
        );
      })}
      <div className="photo-mosaic-veil" />
    </div>
  );
}
