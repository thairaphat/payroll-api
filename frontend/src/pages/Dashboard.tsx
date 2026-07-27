/**
 * Dashboard — Responsive Modern Payroll Dashboard
 *
 * - ดึงข้อมูลจริงจาก backend/database
 * - API: http://localhost:3001/dashboard/summary
 * - Responsive ทั้ง Mobile / Tablet / Desktop
 */

import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/layout/KpiCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatePanel } from "@/components/layout/StatePanel";
import { SemanticBadge } from "@/components/ui/semantic-badge";
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
import {
  mapTodayFieldEntry,
  type TodayFieldEntry,
} from "@/lib/dashboard-attendance";

type DashboardEmployee = {
  code: string;
  name: string;
  department: string;
  workDays: number;
  ot: number;
  totalIncome: number;
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
  const todayFieldEntry = mapTodayFieldEntry(data?.todayFieldEntry);

  const stats = [
    {
      label: "พนักงานทั้งหมด",
      value: String(data?.totalEmployeeProfiles ?? 0),
      icon: Users,
      tone: "blue" as const,
    },
    {
      label: "พนักงานที่มี Payroll",
      value: String(data?.totalEmployees ?? 0),
      icon: Users,
      tone: "teal" as const,
    },
    {
      label: "OT รวม",
      value: `${data?.totalOt ?? 0} ชม.`,
      icon: Clock,
      tone: "amber" as const,
    },
    {
      label: "ยังไม่ออกสลิป",
      value: String(data?.notIssuedPayslip ?? 0),
      icon: FileWarning,
      tone: "rose" as const,
    },
  ];

  if (isLoading && (!isCydAdmin || Boolean(selectedCompanyId))) {
    return (
      <div className="page-shell"><StatePanel kind="loading" title="กำลังโหลดแดชบอร์ด" /></div>
    );
  }

  if (isError) {
    return (
      <div className="page-shell"><StatePanel kind="error" title="โหลดข้อมูลสรุปไม่สำเร็จ" message="กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่" /></div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="page-shell">
        {/* ================= HEADER ================= */}

        <PageHeader
          title="แดชบอร์ดเงินเดือน"
          description="สรุปข้อมูลค่าแรง การลงเวลา และชั่วโมงล่วงเวลา"
          icon={TrendingUp}
          actions={<SemanticBadge tone="info">เดือนปัจจุบัน</SemanticBadge>}
        />

        {isCydAdmin && (
          <Card className="soft-panel">
            <label htmlFor="dashboard-company" className="text-sm font-semibold text-foreground">บริษัทที่ต้องการดูข้อมูล</label>
            <select
              id="dashboard-company"
              value={selectedCompanyId}
              onChange={(event) => setSearchParams(event.target.value ? { companyId: event.target.value } : {})}
              className="field-control mt-2"
            >
              <option value="">เลือกบริษัท</option>
              {companies.map((company: { id: number; company_name: string }) => (
                <option key={company.id} value={company.id}>{company.company_name}</option>
              ))}
            </select>
            {!selectedCompanyId && <p className="mt-2 text-sm text-muted-foreground">กรุณาเลือกบริษัทก่อนดูข้อมูลการดำเนินงาน</p>}
          </Card>
        )}

        {/* ================= STATS ================= */}

        <section className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => (
            <KpiCard key={s.label} label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
          ))}
        </section>

        {/* ================= TODAY FIELD ENTRY SUMMARY ================= */}

        <Card
          className="
            rounded-2xl
            border border-border bg-card text-card-foreground
            shadow-[0_4px_12px_rgba(0,0,0,0.04)]
            overflow-hidden
          "
        >
          <div className="p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-foreground">
              บันทึกหน้างานวันนี้
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              ยอดรวมที่บันทึกผ่านระบบ Field Entry ประจำวันนี้
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">

              {/* Total count */}
              <div className="shrink-0">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  บันทึกวันนี้
                </p>
                <p className="mt-1 text-4xl font-black text-foreground leading-none">
                  {todayFieldEntry.total}
                  <span className="ml-2 text-base font-semibold text-muted-foreground">คน</span>
                </p>
              </div>

              <div className="hidden h-12 w-px bg-border sm:block" />

              {/* Status breakdown */}
              <div className="flex gap-6 flex-wrap">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">ฉบับร่าง</p>
                  <p className="text-xl font-bold text-[#f59e0b]">
                    {todayFieldEntry.draft}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">ส่งตรวจแล้ว</p>
                  <p className="text-xl font-bold text-cyan-700">
                    {todayFieldEntry.submitted}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">อนุมัติแล้ว</p>
                  <p className="text-xl font-bold text-[#16a34a]">
                    {todayFieldEntry.approved}
                  </p>
                </div>
              </div>

              {/* Latest entry time */}
              {todayFieldEntry.latestEntry && (
                <div className="sm:ml-auto">
                  <p className="text-xs text-muted-foreground">บันทึกล่าสุด</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {new Date(todayFieldEntry.latestEntry).toLocaleTimeString("th-TH", {
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
