import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarCheck, LockKeyhole, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
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

const payrollStatusLabel: Record<CompanySummary["payrollStatus"], string> = {
  locked: "Locked",
  draft: "Draft",
  no_data: "No data",
};

export default function AdminCompanies() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-companies-summary"],
    queryFn: fetchGlobalSummary,
  });
  const companiesWithAttendance = data?.companies.filter((company) => company.attendanceCount > 0).length ?? 0;
  const companiesWithoutEmployees = data?.companies.filter((company) => company.employeeCount === 0).length ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">Company Overview</h1>
        <p className="mt-1 text-slate-500">Cross-company operational summary for CYD administrators</p>
      </header>

      {isError && <Card className="p-5 border-red-200 bg-red-50 text-red-700">Unable to load company data.</Card>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5 flex items-center gap-4">
          <Building2 className="h-9 w-9 text-blue-600" />
          <div><p className="text-sm text-slate-500">Companies</p><p className="text-3xl font-bold">{data?.totalCompanies ?? 0}</p></div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <Users className="h-9 w-9 text-indigo-600" />
          <div><p className="text-sm text-slate-500">Employees</p><p className="text-3xl font-bold">{data?.totalEmployees ?? 0}</p></div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <CalendarCheck className="h-9 w-9 text-green-600" />
          <div><p className="text-sm text-slate-500">With attendance</p><p className="text-3xl font-bold">{companiesWithAttendance}</p></div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <Users className="h-9 w-9 text-amber-600" />
          <div><p className="text-sm text-slate-500">Without employees</p><p className="text-3xl font-bold">{companiesWithoutEmployees}</p></div>
        </Card>
      </section>

      {isLoading ? <p className="text-slate-500">Loading company summary...</p> : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.companies.map((company) => (
            <Card key={company.companyId} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-bold text-lg text-slate-900">{company.companyName}</p><p className="text-xs text-slate-500">Company #{company.companyId}</p></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{payrollStatusLabel[company.payrollStatus]}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" />{company.employeeCount} employees</div>
                <div className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-green-600" />{company.attendanceCount} records</div>
              </div>
              <div className="flex items-center justify-between border-t pt-4">
                <span className="flex items-center gap-2 text-xs text-slate-500"><LockKeyhole className="h-4 w-4" />Payroll: {payrollStatusLabel[company.payrollStatus]}</span>
                <Link className="text-sm font-semibold text-blue-700 hover:underline" to={`/dashboard?companyId=${company.companyId}`}>View details</Link>
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
