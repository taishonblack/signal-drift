import { cn } from "@/lib/utils";

interface MakoFinMarkProps {
  className?: string;
  size?: number;
}

/**
 * MAKO Fin Mark — Hard geometric wedge.
 * 
 * Geometry (16×20 viewBox):
 *   Bottom-left: (0, 20)
 *   Bottom-right: (16, 20)
 *   Top-right: (16, 0)
 *   Top-left: (4, 6)
 * 
 * Flat vector only. No gradients, no glow, no detail.
 */
const MakoFinMark = ({ className, size = 20 }: MakoFinMarkProps) => (
  <svg
    width={size * 0.8}
    height={size}
    viewBox="0 0 16 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("shrink-0", className)}
    aria-label="MAKO"
  >
    <polygon points="4,6 16,0 16,20 0,20" />
  </svg>
);

export default MakoFinMark;
