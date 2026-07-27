import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Home,
  UsersRound,
  CalendarRange,
  MapPin,
  Banknote,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canAccessRole } from "@/lib/authz";
import { useTheme } from "next-themes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/types/domain";

const ROLE_LABELS: Record<string, string> = {
  admin: "ผู้ดูแลบริษัท",
  hr: "ฝ่ายบุคคล",
  accounting: "ฝ่ายบัญชี",
  field_staff: "เจ้าหน้าที่ภาคสนาม",
  viewer: "ผู้ดูข้อมูล",
  cyd_admin: "ผู้ดูแลระบบ CYD",
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
      { to: "/admin/companies", label: "ภาพรวมทุกบริษัท", icon: Home, roles: ["cyd_admin"] },
      { to: "/dashboard", label: "หน้าหลัก", icon: Home, roles: ["cyd_admin", "admin", "viewer"] },
    ],
  },
  {
    section: "OPERATIONS",
    items: [
      { to: "/field-attendance", label: "บันทึกเข้าออกงาน", icon: MapPin, roles: ["admin", "hr", "field_staff"] },
      { to: "/payroll", label: "เงินเดือน", icon: Banknote, roles: ["cyd_admin", "admin", "hr", "accounting"] },
      { to: "/payroll-runs", label: "รอบเงินเดือน", icon: CalendarRange, roles: ["cyd_admin", "admin", "hr", "accounting"] },
      { to: "/attendance", label: "ประวัติการบันทึกเข้าออกงาน", icon: CalendarRange, roles: ["cyd_admin", "admin", "hr", "accounting"] },
    ],
  },
  {
    section: "ADMIN",
    items: [
      { to: "/admin/company-wages", label: "ค่าจ้างรายบริษัท", icon: Banknote, roles: ["cyd_admin"] },
      { to: "/admin/users", label: "จัดการผู้ใช้งาน", icon: UsersRound, roles: ["cyd_admin"] },
      { to: "/employees", label: "พนักงาน", icon: UsersRound, roles: ["cyd_admin", "admin", "hr"] },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("payroll_sidebar_collapsed") === "true"
  );
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessRole(user?.role, item.roles)),
  })).filter((section) => section.items.length > 0);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("payroll_sidebar_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="flex h-dvh min-h-[568px] overflow-hidden bg-background">
      {mobileOpen && (
        <button
          type="button"
          aria-label="ปิดเมนูนำทาง"
          className="fixed inset-0 z-40 cursor-default bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        aria-label="เมนูหลัก"
        className={cn(
          "no-print fixed inset-y-0 left-0 z-50 flex w-[min(19rem,calc(100vw-2rem))] shrink-0 flex-col border-r border-white/15 bg-[linear-gradient(180deg,#0D9488_0%,#0891B2_55%,#2563EB_100%)] dark:bg-[var(--sidebar-gradient)] text-white shadow-2xl transition-[transform,width] duration-200 lg:static lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[5.25rem]" : "lg:w-72"
        )}
      >
        <div className={cn("border-b border-white/15 p-4", !collapsed && "lg:p-5")}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-card">
                <img
                  src="/388286.jpg"
                  alt="A&T World"
                  className="h-full w-full object-contain"
                />
              </div>

              <div className={cn("min-w-0", collapsed && "lg:hidden")}>
                <h1 className="truncate text-lg font-bold leading-tight text-white">
                  PayrollPro
                </h1>
                <p className="truncate text-xs text-white/70">
                  Enterprise Payroll
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label="ปิดเมนู"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
          {visibleSections.map((section, si) => (
            <div key={section.section ?? "main"}>
              {section.section && !collapsed && (
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                  {section.section === "OPERATIONS" ? "งานประจำ" : "การจัดการ"}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                        collapsed && "lg:justify-center lg:px-0",
                        isActive
                          ? "bg-white/20 text-white shadow-sm ring-1 ring-inset ring-white/20"
                          : "text-white/85 hover:bg-white/10 hover:text-white"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className={cn("min-w-0 truncate", collapsed && "lg:hidden")}>
                          {item.label}
                        </span>
                        {isActive && (
                          <span className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]", collapsed && "lg:hidden")} />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="safe-bottom border-t border-white/15 p-3">
          <div className={cn("mb-3 min-w-0 rounded-xl border border-white/15 bg-white/10 p-3", collapsed && "lg:hidden")}>
            <p className="truncate text-sm font-semibold text-white">
              {user?.username}
            </p>

            <p className="text-xs text-white/70">
              {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
            </p>
          </div>

          <Button
            variant="outline"
            title={collapsed ? "ออกจากระบบ" : undefined}
            aria-label={collapsed ? "ออกจากระบบ" : undefined}
            className={cn("w-full border-white/20 bg-white/5 text-white shadow-none hover:border-white/30 hover:bg-white/15 hover:text-white", collapsed && "lg:px-0")}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span className={cn(collapsed && "lg:hidden")}>ออกจากระบบ</span>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="no-print sticky top-0 z-30 flex h-[4.25rem] shrink-0 items-center justify-between gap-3 border-b border-border bg-card/90 px-3 backdrop-blur-md sm:px-5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="เปิดเมนูนำทาง"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
              title={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
              className="hidden lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? <ChevronRight /> : <ChevronLeft />}
            </Button>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-semibold text-foreground">
                ระบบบริหารเงินเดือน
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.companyId ? `บริษัท #${user.companyId}` : "ภาพรวมระบบ"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {user?.companyId && (
              <span className="hidden max-w-40 items-center gap-1.5 truncate rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 md:flex">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                บริษัท #{user.companyId}
              </span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={resolvedTheme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
                    className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  >
                    {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {resolvedTheme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="min-w-0 text-right">
              <p className="max-w-28 truncate text-sm font-semibold text-foreground sm:max-w-48">
                {user?.username}
              </p>
              <p className="hidden max-w-48 truncate text-xs text-muted-foreground sm:block">
                {ROLE_LABELS[user?.role ?? ""] ?? user?.role}
              </p>
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1 overflow-x-hidden overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
