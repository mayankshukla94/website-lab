import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { cn } from '@/lib/utils';

interface IconProps {
  icon: IconDefinition;
  className?: string;
}

export function Icon({ icon, className }: IconProps) {
  return <FontAwesomeIcon icon={icon} className={cn(className)} />;
}
