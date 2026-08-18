import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  children,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div>
        <h1 className="text-3xl font-bold text-slate-800">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-1 text-sm text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <Icon
          size={44}
          className="mb-4 text-slate-300"
        />
      )}

      <h3 className="text-lg font-semibold text-slate-700">
        {title}
      </h3>

      {description && (
        <p className="mt-2 max-w-md text-sm text-slate-500">
          {description}
        </p>
      )}

      {children && (
        <div className="mt-6">
          {children}
        </div>
      )}
    </div>
  );
}