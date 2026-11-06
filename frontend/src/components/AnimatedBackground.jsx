import React from 'react';
import { BookOpenCheck, FileText, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from './ui';

const shapeSets = {
  landing: [
    { Icon: GraduationCap, className: 'left-[6%] top-[18%] size-14', delay: '0s', tone: '' },
    { Icon: FileText, className: 'right-[9%] top-[12%] size-12', delay: '-2.4s', tone: 'ui-float-shape--gold' },
    { Icon: BookOpenCheck, className: 'right-[14%] bottom-[16%] size-16', delay: '-4.1s', tone: 'ui-float-shape--emerald' },
    { Icon: ShieldCheck, className: 'left-[13%] bottom-[22%] size-11', delay: '-5.4s', tone: 'ui-float-shape--emerald' },
  ],
  auth: [
    { Icon: ShieldCheck, className: 'left-[7%] top-[20%] size-12', delay: '-1.2s', tone: 'ui-float-shape--emerald' },
    { Icon: GraduationCap, className: 'right-[10%] top-[16%] size-14', delay: '-3.6s', tone: '' },
    { Icon: Sparkles, className: 'left-[16%] bottom-[16%] size-10', delay: '-5.1s', tone: 'ui-float-shape--gold' },
  ],
  app: [
    { Icon: BookOpenCheck, className: 'right-[4%] top-[12%] size-12', delay: '-2s', tone: 'ui-float-shape--emerald' },
    { Icon: FileText, className: 'left-[8%] bottom-[14%] size-10', delay: '-4.5s', tone: 'ui-float-shape--gold' },
  ],
  exam: [],
};

export default function AnimatedBackground({ variant = 'app', className = '', grid = true }) {
  const shapes = shapeSets[variant] || shapeSets.app;

  return (
    <div className={cn('ui-animated-bg ui-page-glow', className)} aria-hidden="true">
      {grid ? (
        <div className="absolute inset-0 ui-grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]" />
      ) : null}

      <span className="ui-orb ui-orb--primary -right-24 -top-28 size-[26rem] sm:size-[32rem]" />
      <span className="ui-orb ui-orb--emerald ui-orb--delay -bottom-32 -left-24 size-[22rem] sm:size-[28rem]" />
      <span className="ui-orb ui-orb--gold ui-orb--soft left-1/2 top-1/3 size-[16rem]" />

      <span className="ui-ring left-[12%] top-[14%] size-40 sm:size-56" />
      <span className="ui-ring right-[18%] bottom-[10%] size-28 sm:size-40 [animation-direction:reverse]" />

      {shapes.map(({ Icon, className: shapeClass, delay, tone }, index) => (
        <span
          key={index}
          className={cn('ui-float-shape hidden sm:grid', shapeClass, tone)}
          style={{ animationDelay: delay }}
        >
          <Icon className="size-[42%]" strokeWidth={1.7} />
        </span>
      ))}
    </div>
  );
}
