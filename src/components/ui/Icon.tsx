import type { SVGProps } from 'react';

type IconName = 'arrow' | 'arrow-down' | 'plus' | 'menu' | 'close' | 'corner';
const paths: Record<IconName, string> = {
  arrow: 'M4 12h16M13 5l7 7-7 7',
  'arrow-down': 'M12 4v16M5 13l7 7 7-7',
  plus: 'M12 5v14M5 12h14',
  menu: 'M4 8h16M4 16h16',
  close: 'M6 6l12 12M6 18 18 6',
  corner: 'M6 18 18 6M6 6h12v12',
};

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
