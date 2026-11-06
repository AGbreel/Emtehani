import React from 'react';

const CELL_COUNT = 70;

export default function ExamWatermark({ name, code }) {
  const label = [name || 'طالب', code ? `#${code}` : '', 'امتحاني']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="exam-watermark" aria-hidden="true">
      {Array.from({ length: CELL_COUNT }).map((_, index) => (
        <span key={index}>{label}</span>
      ))}
    </div>
  );
}
