import { cn } from "@/lib/utils";

export function Label({ className, ...props }) {
  return (
    <label
      className={cn("text-sm font-medium text-slate-700 mb-1 block", className)}
      {...props}
    />
  );
}
