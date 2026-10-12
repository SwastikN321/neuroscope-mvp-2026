import type { ReactNode } from 'react';

export function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: ReactNode;
}) {
  return (
    <p className="section-label">
      <span className="text-cyan">{number}</span>
      <span aria-hidden="true">/</span>
      {children}
    </p>
  );
}
