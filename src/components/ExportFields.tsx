import { useId } from 'react';
import { pxPerU, type ExportOptions, type SizeMode } from '../lib/export';
import { formLabel, formRow, hint, input } from './ui';

const BACKGROUNDS = [
  { value: '', label: 'Transparent', className: 'checker' },
  { value: '#ffffff', label: 'White', className: 'bg-white' },
  { value: '#000000', label: 'Black', className: 'bg-black' },
];

const swatch = 'size-6.5 cursor-pointer rounded-md border border-line-strong p-0 aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent';
const number = `${input} w-24`;

interface Props {
  options: ExportOptions;
  onChange: (patch: Partial<ExportOptions>) => void;
  /** Hide the background picker (SVG-only exports don't use it). */
  showBackground?: boolean;
}

/** Size + background controls shared by the single-shape and bulk exporters. */
export function ExportFields({ options: o, onChange, showBackground = true }: Props) {
  const id = useId();
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

  return (
    <>
      <div className={formRow}>
        <label className={formLabel} htmlFor={`${id}-mode`}>
          Size
        </label>
        <select id={`${id}-mode`} className={input} value={o.sizeMode} onChange={(e) => onChange({ sizeMode: e.target.value as SizeMode })}>
          <option value="ppi">Real-world scale</option>
          <option value="width">Fixed width</option>
          <option value="height">Fixed height</option>
        </select>
        {o.sizeMode === 'ppi' && (
          <>
            <input className={number} type="number" min={1} max={1000} aria-label="Pixels per inch" value={o.ppi} onChange={(e) => onChange({ ppi: num(e.target.value, 1, 1000) })} />
            <span className={hint}>
              px per inch ≈ {Math.round(pxPerU(o.ppi))} px per U · 19″ = {Math.round(o.ppi * 19)} px
            </span>
          </>
        )}
        {o.sizeMode === 'width' && (
          <>
            <input className={number} type="number" min={1} max={16384} aria-label="Width in pixels" value={o.widthPx} onChange={(e) => onChange({ widthPx: num(e.target.value, 1, 16384) })} />
            <span className={hint}>px wide</span>
          </>
        )}
        {o.sizeMode === 'height' && (
          <>
            <input className={number} type="number" min={1} max={16384} aria-label="Height in pixels" value={o.heightPx} onChange={(e) => onChange({ heightPx: num(e.target.value, 1, 16384) })} />
            <span className={hint}>px tall</span>
          </>
        )}
      </div>
      {showBackground && (
        <div className={formRow}>
          <span className={formLabel}>PNG background</span>
          <div className="inline-flex items-center gap-1.5" role="group" aria-label="PNG background">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.label}
                className={`${swatch} ${b.className}`}
                title={b.label}
                aria-label={b.label}
                aria-pressed={o.background === b.value}
                onClick={() => onChange({ background: b.value })}
              />
            ))}
            <input
              type="color"
              className={swatch}
              aria-label="Custom background colour"
              title="Custom colour"
              value={o.background && o.background.length === 7 ? o.background : '#808080'}
              onChange={(e) => onChange({ background: e.target.value })}
            />
          </div>
        </div>
      )}
    </>
  );
}
