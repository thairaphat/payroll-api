import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home,
  UsersRound,
  CalendarRange,
  MapPin,
  Banknote,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canAccessRole } from "@/lib/authz";
import type { Role } from "@/types/domain";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  hr: "HR",
  accounting: "Accounting",
  field_staff: "Field Staff",
  viewer: "Viewer",
};

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
};

type NavSection = {
  section?: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { to: "/dashboard", label: "หน้าหลัก", icon: Home, roles: ["admin", "viewer"] },
    ],
  },
  {
    section: "OPERATIONS",
    items: [
      { to: "/field-attendance", label: "บันทึกเข้าออกงาน", icon: MapPin, roles: ["admin", "field_staff"] },
      { to: "/payroll", label: "เงินเดือน", icon: Banknote, roles: ["admin", "accounting"] },
      { to: "/attendance", label: "ประวัติการบันทึกเข้าออกงาน", icon: CalendarRange, roles: ["admin", "hr"] },
    ],
  },
  {
    section: "ADMIN",
    items: [
      { to: "/employees", label: "พนักงาน", icon: UsersRound, roles: ["admin", "hr"] },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessRole(user?.role, item.roles)),
  })).filter((section) => section.items.length > 0);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="h-screen bg-[#f4f6f9] flex overflow-hidden">
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          `
          fixed lg:static inset-y-0 left-0 z-50
          w-72 shrink-0
          bg-[#1e3a8a] text-white
          flex flex-col
          transition-transform duration-300
          lg:translate-x-0
          shadow-2xl
          no-print
          `,
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white p-1.5 shadow-lg flex items-center justify-center">
                <img
                  src="/388286.jpg"
                  alt="A&T World"
                  className="h-full w-full object-contain"
                />
              </div>

              <div>
                <h1 className="font-bold text-lg text-white leading-tight">
                  PayrollPro
                </h1>
                <p className="text-xs text-blue-100">
                  Enterprise HR
                </p>
              </div>
            </div>

            <button
              className="lg:hidden text-white/80 hover:text-white"
              onClick={() => setOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleSections.map((section, si) => (
            <div key={si} className={si > 0 ? "pt-3" : ""}>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        `
                        group flex items-center gap-3
                        px-4 py-3 rounded-2xl
                        text-sm font-semibold
                        transition-all duration-200
                        `,
                        isActive
                          ? `
                          bg-[#1e40af]
                          text-white
                          shadow-lg
                          `
                          : `
                          text-blue-100/90
                          hover:bg-white/10
                          hover:text-white
                          `
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                        {isActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#60a5fa]" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="mb-4">
            <p className="font-semibold text-sm text-white truncate">
              {user?.username}
            </p>

            <p className="text-xs text-blue-100">
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </p>
          </div>

          <Button
            variant="outline"
            className="
              w-full rounded-xl
              bg-white/10
              text-white
              border-white/20
              hover:bg-white/20
              hover:text-white
            "
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            ออกจากระบบ
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="
          h-16
          border-b border-[#dbe4f0]
          bg-white/80 backdrop-blur-xl
          flex items-center justify-between
          px-4
          lg:hidden
          no-print
        "
        >
          <button onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6 text-[#1e3a8a]" />
          </button>

          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-white p-1 shadow flex items-center justify-center">
              <img
                src="/388286.jpg"
                alt="A&T World"
                className="h-full w-full object-contain"
              />
            </div>

            <span className="font-bold text-[#0f172a]">
              PayrollPro
            </span>
          </div>

          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="w-full max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
