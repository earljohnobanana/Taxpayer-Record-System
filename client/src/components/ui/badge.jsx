import { cn } from "@/lib/utils";

const variants = {
  default:
    "bg-slate-100 text-slate-700",

  success:
    "bg-green-100 text-green-700",

  warning:
    "bg-amber-100 text-amber-700",

  danger:
    "bg-red-100 text-red-700",

  info:
    "bg-blue-100 text-blue-700",

  purple:
    "bg-purple-100 text-purple-700",
};

export function Badge({
  children,
  variant = "default",
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

/*
Alias for compatibility with your Dashboard imports.

Allows:

import { StatusBadge } from "@/components/ui/badge"
*/
export const StatusBadge = Badge;