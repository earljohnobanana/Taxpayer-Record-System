import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const accentMap = {
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-700",
    ring: "ring-blue-100",
  },
  green: {
    bg: "bg-green-50",
    icon: "text-green-700",
    ring: "ring-green-100",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-700",
    ring: "ring-amber-100",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-700",
    ring: "ring-purple-100",
  },
  red: {
    bg: "bg-red-50",
    icon: "text-red-700",
    ring: "ring-red-100",
  },
  slate: {
    bg: "bg-slate-100",
    icon: "text-slate-700",
    ring: "ring-slate-200",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "blue",
}) {
  const style = accentMap[accent] || accentMap.blue;

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="flex items-center justify-between p-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {title}
          </p>

          <h2 className="text-3xl font-bold text-slate-800">
            {value}
          </h2>

          {subtitle && (
            <p className="text-xs text-slate-500">
              {subtitle}
            </p>
          )}
        </div>

        {Icon && (
          <div
            className={cn(
              "rounded-xl p-3 ring-1",
              style.bg,
              style.ring
            )}
          >
            <Icon className={style.icon} size={28} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}