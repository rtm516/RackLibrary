import { useEffect, useRef, useState } from 'react';
import { getSvg, getThumb } from '../lib/db';

// Object URLs are cached for the session so scrolling back doesn't reload them.
const thumbUrls = new Map<string, string>();

let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function observe(el: Element, onVisible: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer!.unobserve(e.target);
        callbacks.get(e.target)?.();
        callbacks.delete(e.target);
      }
    },
    { rootMargin: '400px 0px' },
  );
  callbacks.set(el, onVisible);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    callbacks.delete(el);
  };
}

async function thumbUrl(shapeId: string): Promise<string | undefined> {
  const cached = thumbUrls.get(shapeId);
  if (cached) return cached;
  let blob: Blob | undefined = await getThumb(shapeId);
  if (!blob) {
    // No raster thumbnail (it failed at import); fall back to the SVG itself.
    const svg = await getSvg(shapeId);
    if (svg) blob = new Blob([svg], { type: 'image/svg+xml' });
  }
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  thumbUrls.set(shapeId, url);
  return url;
}

export function Thumb({ shapeId, alt }: { shapeId: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(() => thumbUrls.get(shapeId));

  useEffect(() => {
    if (url || !ref.current) return;
    let cancelled = false;
    const stop = observe(ref.current, () => {
      thumbUrl(shapeId).then((u) => !cancelled && setUrl(u));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [shapeId, url]);

  return (
    <div className="relative aspect-video bg-surface-2" ref={ref}>
      {url ? <img className="absolute inset-3 size-[calc(100%-24px)] object-contain" src={url} alt={alt} loading="lazy" draggable={false} /> : null}
    </div>
  );
}

/** Full-resolution SVG as an object URL, for the detail view. */
export function useSvgUrl(shapeId: string | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!shapeId) return;
    let objectUrl: string | undefined;
    let cancelled = false;
    getSvg(shapeId).then((svg) => {
      if (cancelled || !svg) return;
      objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      setUrl(undefined);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [shapeId]);
  return url;
}
