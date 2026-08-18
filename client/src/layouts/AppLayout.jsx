import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  MapPin,
  Building2,
  Receipt,
  FileSpreadsheet,
  Database,
  ScrollText,
  UserCog,
  Tags,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/barangays", label: "Barangays", icon: MapPin },
  { to: "/business-registry", label: "Business Registry", icon: Building2 },
  { to: "/tax-collection", label: "Tax Collection", icon: Receipt },
  { to: "/fee-options", label: "Fee Options", icon: Tags },
  { to: "/reports", label: "Reports", icon: FileSpreadsheet },
  { to: "/backup", label: "Backup & Restore", icon: Database },
  { to: "/activity-logs", label: "Activity Logs", icon: ScrollText },
  { to: "/users", label: "Users", icon: UserCog, adminOnly: true },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "administrator"
  );

  return (
    <div className="min-h-screen flex">
      {/* Spacer keeps main content in place; the panel below overlays on hover */}
      <div className="w-16 shrink-0" />
      <aside className="group fixed inset-y-0 left-0 z-30 flex w-16 flex-col overflow-hidden bg-primary text-white shadow-lg transition-[width] duration-200 ease-in-out hover:w-64">
        <div className="flex items-center gap-3 border-b border-white/20 p-3">
          <img
            src={logo}
            alt="Santa Catalina seal"
            className="h-10 w-10 shrink-0 rounded-full bg-white/95 p-0.5"
          />
          <div className="min-w-0">
            <p className="whitespace-nowrap text-xs uppercase tracking-wide opacity-0 transition-opacity duration-200 group-hover:opacity-80">
              MTO Santa Catalina
            </p>
            <h1 className="whitespace-nowrap text-sm font-semibold leading-snug opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Taxpayer Record System
            </h1>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm hover:bg-white/10",
                  isActive && "bg-white/15 font-medium"
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/20 p-3 text-sm">
          <div className="overflow-hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <p className="whitespace-nowrap font-medium">{user?.fullName}</p>
            <p className="whitespace-nowrap text-xs capitalize opacity-80">{user?.role}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            title="Logout"
            className="mt-3 w-full justify-start border-white/30 bg-transparent px-2.5 text-white hover:bg-white/10"
            onClick={logout}
          >
            <LogOut size={16} className="shrink-0" />
            <span className="ml-2 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Logout
            </span>
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}