/**
 * Dashboard — Responsive Modern Payroll Dashboard
 *
 * - ดึงข้อมูลจริงจาก backend/database
 * - API: http://localhost:3001/dashboard/summary
 * - Responsive ทั้ง Mobile / Tablet / Desktop
 */

import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import {
  Users,
  Clock,
  FileWarning,
  TrendingUp,
} from "lucide-react";
import { authFetch } from "@/lib/authz";
import { getCompanies } from "@/services/employee.service";
import { useAuth } from "@/store/auth";
import { hasRole } from "@/lib/authz";

type DashboardEmployee = {
  code: string;
  name: string;
  department: string;
  workDays: number;
  ot: number;
  totalIncome: number;
};

type TodayFieldEntry = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  latestEntry: string | null;
};

type DashboardSummary = {
  totalEmployeeProfiles: number;
  totalEmployees: number;
  totalSalary: number;
  totalOt: number;
  notIssuedPayslip: number;
  employees: DashboardEmployee[];
  todayFieldEntry?: TodayFieldEntry;
};

const fetchDashboardSummary = async (companyId?: number): Promise<DashboardSummary> => {
  const query = companyId != null ? `?companyId=${companyId}` : "";
  const res = await authFetch(`${import.meta.env.VITE_API_URL || ""}/dashboard/summary${query}`);
  if (!res.ok) {
    throw new Error("โหลด Dashboard ไม่สำเร็จ");
  }
  return res.json();
};

export default function Dashboard() {
  const user = useAuth((state) => state.user);
  const isCydAdmin = hasRole(user?.role, "cyd_admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCompanyId = searchParams.get("companyId") ?? "";
  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "dashboard-scope"],
    queryFn: getCompanies,
    enabled: isCydAdmin,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-summary", selectedCompanyId],
    queryFn: () => fetchDashboardSummary(isCydAdmin ? Number(selectedCompanyId) : undefined),
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  const stats = [
    {
      label: "พนักงานทั้งหมด",
      value: String(data?.totalEmployeeProfiles ?? 0),
      icon: Users,
      gradient: "from-blue-600 to-blue-800",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      glow: "shadow-blue-200/50",
    },
    {
      label: "พนักงานที่มี Payroll",
      value: String(data?.totalEmployees ?? 0),
      icon: Users,
      gradient: "from-indigo-600 to-indigo-800",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      glow: "shadow-indigo-200/50",
    },
    {
      label: "OT รวม",
      value: `${data?.totalOt ?? 0} ชม.`,
      icon: Clock,
      gradient: "from-amber-500 to-amber-700",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      glow: "shadow-amber-200/50",
    },
    {
      label: "ยังไม่ออกสลิป",
      value: String(data?.notIssuedPayslip ?? 0),
      icon: FileWarning,
      gradient: "from-rose-500 to-rose-700",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
      glow: "shadow-rose-200/50",
    },
  ];

  if (isLoading && (!isCydAdmin || Boolean(selectedCompanyId))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f4f7fb] to-[#e6edff] p-8">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <div className="text-[#64748b] font-medium">กำลังโหลดข้อมูล Dashboard...</div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f4f7fb] to-[#e6edff] p-8">
        <Card className="p-6 border-red-200 bg-red-50 text-red-700">
          ไม่สามารถโหลดข้อมูลสรุปได้ กรุณาตรวจสอบการเชื่อมต่อกับ Backend
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
        {/* ================= HEADER ================= */}

        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-[#1e3a8a] flex items-center justify-center border border-blue-300/30 shadow-lg">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#0f172a]">
                Payroll Dashboard
              </h1>

              <p className="text-[#64748b] mt-1 text-sm sm:text-base">
                สรุปข้อมูลค่าแรง การมาทำงาน และ OT
              </p>
            </div>
          </div>

          <div className="flex items-center">
            <div className="px-4 py-2 rounded-2xl bg-[#2563eb] text-white shadow-lg text-sm font-medium">
              เดือนปัจจุบัน
            </div>
          </div>
        </header>

        {isCydAdmin && (
          <Card className="p-4 rounded-2xl border-blue-200">
            <label htmlFor="dashboard-company" className="text-sm font-semibold text-slate-700">Company scope</label>
            <select
              id="dashboard-company"
              value={selectedCompanyId}
              onChange={(event) => setSearchParams(event.target.value ? { companyId: event.target.value } : {})}
              className="mt-2 h-11 w-full rounded-xl border px-3 bg-white"
            >
              <option value="">Select a company</option>
              {companies.map((company: { id: number; company_name: string }) => (
                <option key={company.id} value={company.id}>{company.company_name}</option>
              ))}
            </select>
            {!selectedCompanyId && <p className="mt-2 text-sm text-slate-500">Select a company before viewing detailed operational data.</p>}
          </Card>
        )}

        {/* ================= STATS ================= */}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 lg:gap-5">
          {stats.map((s) => (
            <Card
              key={s.label}
              className={`
                relative overflow-hidden
                rounded-[2rem]
                border border-[#e5e7eb]
                bg-white
                p-5 lg:p-6
                shadow-[0_4px_12px_rgba(0,0,0,0.04)]
                ${s.glow} shadow-xl
                hover:shadow-2xl
                transition-all duration-500
                hover:-translate-y-2
                group
              `}
            >
              {/* Premium Gradient Overlay */}
              <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${s.gradient} opacity-[0.08] blur-3xl group-hover:opacity-20 transition-opacity duration-500`} />
              
              <div className="relative flex items-start justify-between gap-3">
                <div className="space-y-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]/80">{s.label}</p>

                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0f172a]">
                    {s.value}
                  </h2>
                  
                  <div className={`h-1 w-8 rounded-full bg-gradient-to-r ${s.gradient}`} />
                </div>

                <div
                  className={`
                    h-14 w-14 sm:h-16 sm:w-16 rounded-[1.5rem]
                    flex items-center justify-center
                    ${s.iconBg} border border-white/50
                    shadow-sm group-hover:scale-110 transition-transform duration-500
                  `}
                >
                  <s.icon className={`h-6 w-6 sm:h-7 sm:w-7 ${s.iconColor}`} />
                </div>
              </div>
            </Card>
          ))}
        </section>

        {/* ================= TODAY FIELD ENTRY SUMMARY ================= */}

        <Card
          className="
            rounded-3xl
            border border-[#e5e7eb]
            bg-white
            shadow-[0_4px_12px_rgba(0,0,0,0.04)]
            overflow-hidden
          "
        >
          <div className="p-5 sm:p-6 border-b border-[#e5e7eb]">
            <h2 className="text-lg sm:text-xl font-bold text-[#0f172a]">
              บันทึกหน้างานวันนี้
            </h2>

            <p className="text-sm text-[#64748b] mt-1">
              ยอดรวมที่บันทึกผ่านระบบ Field Entry ประจำวันนี้
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">

              {/* Total count */}
              <div className="shrink-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]/80">
                  Today Entered
                </p>
                <p className="mt-1 text-4xl font-black text-[#0f172a] leading-none">
                  {data?.todayFieldEntry?.total ?? 0}
                  <span className="text-base font-semibold text-[#64748b] ml-2">คน</span>
                </p>
              </div>

              <div className="w-px h-12 bg-[#e5e7eb] hidden sm:block" />

              {/* Status breakdown */}
              <div className="flex gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-[#64748b] mb-1">Draft</p>
                  <p className="text-xl font-bold text-[#f59e0b]">
                    {data?.todayFieldEntry?.draft ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#64748b] mb-1">Submitted</p>
                  <p className="text-xl font-bold text-[#2563eb]">
                    {data?.todayFieldEntry?.submitted ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#64748b] mb-1">Approved</p>
                  <p className="text-xl font-bold text-[#16a34a]">
                    {data?.todayFieldEntry?.approved ?? 0}
                  </p>
                </div>
              </div>

              {/* Latest entry time */}
              {data?.todayFieldEntry?.latestEntry && (
                <div className="sm:ml-auto">
                  <p className="text-xs text-[#64748b]">Latest entry</p>
                  <p className="text-sm font-semibold text-[#0f172a] mt-0.5">
                    {new Date(data.todayFieldEntry.latestEntry).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              )}

            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
