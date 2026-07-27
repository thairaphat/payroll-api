import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarCheck, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/layout/KpiCard";
import { StatePanel } from "@/components/layout/StatePanel";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import { authFetch } from "@/lib/authz";

type CompanySummary = {
  companyId: number;
  companyName: string;
  employeeCount: number;
  attendanceCount: number;
  payrollStatus: "locked" | "draft" | "no_data";
};

type GlobalSummary = {
  totalCompanies: number;
  totalEmployees: number;
  companies: CompanySummary[];
};

async function fetchGlobalSummary(): Promise<GlobalSummary> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const response = await authFetch(`${apiUrl}/admin/companies/summary`);
  if (!response.ok) throw new Error("Unable to load the company summary");
  return response.json();
}

const payrollStatus: Record<
  CompanySummary["payrollStatus"],
  { label: string; tone: "neutral" | "warning" | "violet" }
> = {
  locked: { label: "ล็อกแล้ว", tone: "violet" },
  draft: { label: "ฉบับร่าง", tone: "warning" },
  no_data: { label: "ยังไม่มีข้อมูล", tone: "neutral" },
};

export default function AdminCompanies() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-companies-summary"],
    queryFn: fetchGlobalSummary,
  });
  const companiesWithAttendance = data?.companies.filter((company) => company.attendanceCount > 0).length ?? 0;
  const companiesWithoutEmployees = data?.companies.filter((company) => company.employeeCount === 0).length ?? 0;

  return (
    <div className="page-shell">
      <PageHeader
        title="ภาพรวมทุกบริษัท"
        description="สรุปข้อมูลพนักงาน การลงเวลา และสถานะเงินเดือนของทุกบริษัท"
        icon={Building2}
      />

      {isError && (
        <StatePanel
          kind="error"
          title="โหลดข้อมูลบริษัทไม่สำเร็จ"
          message="กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่"
        />
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="บริษัททั้งหมด" value={data?.totalCompanies ?? 0} icon={Building2} tone="teal" />
        <KpiCard label="พนักงานทั้งหมด" value={data?.totalEmployees ?? 0} icon={Users} tone="blue" />
        <KpiCard label="บริษัทที่มีการลงเวลา" value={companiesWithAttendance} icon={CalendarCheck} tone="emerald" />
        <KpiCard label="บริษัทที่ยังไม่มีพนักงาน" value={companiesWithoutEmployees} icon={Users} tone="rose" />
      </section>

      {isLoading ? <StatePanel kind="loading" title="กำลังโหลดภาพรวมบริษัท" /> : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.companies.map((company) => (
            <Card key={company.companyId} className="surface-card-interactive flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="line-clamp-2 min-h-12 text-base font-bold leading-6 text-card-foreground">{company.companyName}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">บริษัท #{company.companyId}</p>
                </div>
                <SemanticBadge tone={payrollStatus[company.payrollStatus].tone}>
                  {payrollStatus[company.payrollStatus].label}
                </SemanticBadge>
              </div>
              <div className="my-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-teal-50 p-3 dark:border dark:border-slate-700 dark:bg-slate-900/60"><Users className="mb-2 h-4 w-4 text-teal-700 dark:text-teal-300" /><span className="block text-xs text-muted-foreground">พนักงาน</span><strong className="mt-0.5 block text-card-foreground">{company.employeeCount} คน</strong></div>
                <div className="rounded-xl bg-cyan-50 p-3 dark:border dark:border-slate-700 dark:bg-slate-900/60"><CalendarCheck className="mb-2 h-4 w-4 text-cyan-700 dark:text-cyan-300" /><span className="block text-xs text-muted-foreground">รายการลงเวลา</span><strong className="mt-0.5 block text-card-foreground">{company.attendanceCount} รายการ</strong></div>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                <span className="text-xs font-medium text-muted-foreground">สถานะเงินเดือน</span>
                <Link className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-teal-50 px-3 text-sm font-semibold text-teal-800 transition-colors hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500" to={`/dashboard?companyId=${company.companyId}`}>
                  ดูรายละเอียด
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
