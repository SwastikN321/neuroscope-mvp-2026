import type { ComponentPropsWithRef } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'text';
type Appearance = { variant?: Variant; className?: string };
function buttonClass({ variant = 'primary', className = '' }: Appearance) {
  return `button button--${variant} ${className}`;
}

export function Button({
  variant,
  className,
  type = 'button',
  ...props
}: ComponentPropsWithRef<'button'> & Appearance) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  className,
  ...props
}: LinkProps & Appearance) {
  return <Link className={buttonClass({ variant, className })} {...props} />;
}
