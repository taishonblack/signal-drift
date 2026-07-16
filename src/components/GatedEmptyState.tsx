import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

interface Props {
  title: string;
  body: string;
  cta?: string;
  ctaHref?: string;
  icon?: React.ReactNode;
}

/**
 * Educational empty state for features that need an account.
 * Never blur — always explain what signing in unlocks.
 */
const GatedEmptyState = ({
  title,
  body,
  cta = "Sign In",
  ctaHref = "/account?mode=login",
  icon,
}: Props) => (
  <div className="mako-glass rounded-lg border border-dashed border-border/30 p-5 text-center space-y-2">
    <div className="flex justify-center text-muted-foreground/60">
      {icon ?? <Lock className="h-5 w-5" />}
    </div>
    <p className="text-sm text-foreground">{title}</p>
    <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
      {body}
    </p>
    <Link
      to={ctaHref}
      className="inline-block text-xs text-primary hover:underline mt-2"
    >
      {cta}
    </Link>
  </div>
);

export default GatedEmptyState;
