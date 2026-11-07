import React, { useId, useMemo } from 'react';

function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Each word gets a stable random tilt/shift, and the whole block passes through an
// SVG displacement filter. A human reads it normally; OCR sees warped, doubled
// glyphs mixed with noise lines, which makes extracted text unusable for AI tools.
// The layout is deterministic so refreshing or re-rendering never moves the words.
export default function ObfuscatedText({ text = '', className = '', as: Tag = 'span' }) {
  const rawId = useId();
  const filterId = `exam-warp-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const content = String(text ?? '');
  const { words, seed, strokes } = useMemo(() => {
    const baseSeed = hashString(content);
    const random = mulberry32(baseSeed);
    const parts = content.split(/(\s+)/).filter((part) => part.length > 0);
    const mapped = parts.map((part, index) => {
      if (/^\s+$/.test(part)) return { space: true, value: part, index };
      const rotation = (random() * 8 - 4).toFixed(2);
      const offsetY = (random() * 2.6 - 1.3).toFixed(2);
      const offsetX = (random() * 1.4 - 0.7).toFixed(2);
      const spacing = (random() * 0.8 - 0.3).toFixed(2);
      return { space: false, value: part, index, rotation, offsetY, offsetX, spacing };
    });
    const lines = Array.from({ length: 7 }, (_, index) => {
      const startX = random() * 100;
      const startY = random() * 100;
      const endX = random() * 100;
      const endY = random() * 100;
      const c1 = random() * 100;
      const c2 = random() * 100;
      return { index, d: `M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${c1.toFixed(1)} ${c2.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}` };
    });
    return { words: mapped, seed: baseSeed % 97, strokes: lines };
  }, [content]);

  return (
    <Tag className={`obf-text ${className}`.trim()} aria-label={content} data-obfuscated="true">
      <span className="sr-only">{content}</span>
      <svg className="obf-filter" aria-hidden="true" focusable="false" width="0" height="0">
        <filter id={filterId} x="-8%" y="-14%" width="116%" height="128%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.035 0.06" numOctaves="2" seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="warped" />
        </filter>
      </svg>
      <span className="obf-layer" aria-hidden="true" style={{ filter: `url(#${filterId})` }}>
        {words.map((word) => (
          word.space
            ? <span key={`space-${word.index}`} className="obf-space">{word.value}</span>
            : (
              <span
                key={`${word.value}-${word.index}`}
                className="obf-word"
                style={{ transform: `rotate(${word.rotation}deg) translate(${word.offsetX}px, ${word.offsetY}px)`, letterSpacing: `${word.spacing}px` }}
              >{word.value}</span>
            )
        ))}
      </span>
      <span className="obf-layer obf-ghost" aria-hidden="true">
        {words.map((word) => (
          word.space
            ? <span key={`ghost-space-${word.index}`} className="obf-space">{word.value}</span>
            : <span key={`ghost-${word.value}-${word.index}`} className="obf-word">{word.value}</span>
        ))}
      </span>
      <svg className="obf-noise" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {strokes.map((stroke) => <path key={stroke.index} d={stroke.d} />)}
      </svg>
    </Tag>
  );
}
