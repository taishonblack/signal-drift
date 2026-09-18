import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface FieldGuidanceProps {
  title: string;
  body: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FieldGuidance = ({ title, body, open, onOpenChange }: FieldGuidanceProps) => (
  <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`About ${title.toLowerCase()}`}
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onMouseEnter={() => onOpenChange(true)}
        onMouseLeave={() => onOpenChange(false)}
        onFocus={() => onOpenChange(true)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      className="mako-glass-solid w-72 border-border/20 p-3"
      onMouseEnter={() => onOpenChange(true)}
      onMouseLeave={() => onOpenChange(false)}
    >
      <p className="text-xs font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
    </PopoverContent>
  </Popover>
);

export default FieldGuidance;