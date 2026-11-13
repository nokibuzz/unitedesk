import { useState } from 'react';
import type { UsefulLink } from './types';

export function iconSource(link: UsefulLink): string {
  if (link.iconUrl) return link.iconUrl;
  try { return new URL('/favicon.ico', link.url).href; }
  catch { return ''; }
}

export default function LinkIcon({ link }: { link: UsefulLink }) {
  const [image, setImage] = useState({ source: '', failed: false, loaded: false });
  const source = iconSource(link);
  const state = image.source === source ? image : { source, failed: false, loaded: false };
  return <span className="useful-link-icon" aria-hidden="true"><span>{link.label.slice(0, 1).toUpperCase()}</span>{source && !state.failed ? <img key={source} src={source} alt="" loading="lazy" style={{ opacity: state.loaded ? 1 : 0 }} onLoad={() => setImage({ source, failed: false, loaded: true })} onError={() => setImage({ source, failed: true, loaded: false })} /> : null}</span>;
}
