import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard } from "@/components/layout/KpiCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Plus, Search, Users, Loader2, Save } from "lucide-react";

import { useState } from "react";
import { formatTHB } from "@/services/payroll.service";
import {
  fetchEmployees,
  getCompanies,
  addManualEmployee,
} from "@/services/employee.service";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { hasRole } from "@/lib/authz";
import {
  normalizeEmployeeDebtAmount,
  sumEmployeeDebt,
} from "@/lib/employee-amount";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Employee = {
  id: number;
  emp_code: string | null;
  first_name: string | null;
  last_name: string | null;
  first_name_th: string | null;
  last_name_th: string | null;
  first_name_en?: string | null;
  last_name_en?: string | null;
  display_name?: string | null;
  employee_name?: string | null;
  full_name_th?: string | null;
  full_name_en?: string | null;
  passport_number: string | null;
  company_name: string | null;
  employment_status: string | null;
  debt_amount: number | string | null;
};

type Company = { id: number; company_name: string };

export default function Employees() {
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const isCydAdmin = hasRole(user?.role, "cyd_admin");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // --- Add Employee State ---
  const [addOpen, setAddOpen] = useState(false);
  const [empCode, setEmpCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [adding, setAdding] = useState(false);

  const { data: employeeData, isLoading, isError } = useQuery({
    queryKey: ["employees", selectedCompanyId],
    queryFn: () => fetchEmployees(isCydAdmin ? Number(selectedCompanyId) : undefined),
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  const { data: companyData } = useQuery({
    queryKey: ["companies"],
    queryFn: getCompanies,
  });

  const employees: Employee[] = Array.isArray(employeeData) ? employeeData : [];
  const allCompanies: Company[] = Array.isArray(companyData) ? companyData : [];

  const filtered = employees.filter((e) => {
    if (statusFilter !== "all" && e.employment_status !== statusFilter) return false;
    const keyword = q.toLowerCase();
    const names = [e.first_name_th, e.last_name_th, e.first_name, e.last_name]
      .filter(Boolean).join(" ").toLowerCase();
    const code = (e.emp_code || "").toLowerCase();
    const passport = (e.passport_number || "").toLowerCase();
    const company = (e.company_name || "").toLowerCase();

    return (
      names.includes(keyword) ||
      code.includes(keyword) ||
      passport.includes(keyword) ||
      company.includes(keyword)
    );
  });

  const totalDebt = sumEmployeeDebt(employees);
  const statusCount = new Set(employees.map((e) => e.employment_status).filter(Boolean)).size;

  const handleAddSubmit = async () => {
    if (!empCode || !firstName || !lastName) {
      toast.error("กรุณากรอกข้อมูลให้ครบถ้วน (รหัส, ชื่อ, นามสกุล)");
      return;
    }

    try {
      setAdding(true);
      const res = await addManualEmployee({
        emp_code: empCode,
        first_name: firstName,
        last_name: lastName,
        company_id: companyId ? Number(companyId) : undefined,
      });

      if (res.status === "success") {
        toast.success("เพิ่มพนักงานเข้าสู่ระบบสำเร็จ");
        setAddOpen(false);
        setEmpCode("");
        setFirstName("");
        setLastName("");
        setCompanyId("");
        queryClient.invalidateQueries({ queryKey: ["employees"] });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "เพิ่มพนักงานไม่สำเร็จ";
      if (message.includes("มีอยู่แล้ว")) {
        toast.warning(message);
      } else {
        toast.error(message);
      }
    } finally {
      setAdding(false);
    }
  };

  if (isError) {
    return (
      <div className="p-8">
        <Card className="p-6 border-red-200 bg-red-50 text-red-700">
          ไม่สามารถโหลดข้อมูลพนักงานได้ กรุณาตรวจสอบการเชื่อมต่อกับ Backend
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
        <PageHeader
          title="พนักงาน"
          description="ค้นหา ตรวจสอบ และจัดการข้อมูลพนักงานในบริษัท"
          icon={Users}
          actions={!isCydAdmin ? <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              onClick={() => setAddOpen(true)}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มพนักงาน
            </Button>
          </div> : undefined}
        />

        {isCydAdmin && (
          <Card className="soft-panel">
            <Label htmlFor="company-scope">บริษัทที่ต้องการตรวจสอบ</Label>
            <select id="company-scope" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className="mt-2 w-full h-11 px-3 rounded-xl border">
              <option value="">เลือกบริษัท</option>
              {allCompanies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </Card>
        )}

        <section className="grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="พนักงานทั้งหมด" value={isLoading ? "..." : employees.length} icon={Users} tone="blue" />
          <KpiCard label="ยอดหนี้สะสมรวม" value={formatTHB(totalDebt)} icon={Users} tone="rose" />
          <KpiCard label="สถานะการจ้าง" value={`${statusCount} สถานะ`} icon={Users} tone="teal" />
        </section>

        <Card className="soft-panel shadow-card">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />

              <Input
                placeholder="ค้นหาชื่อ รหัส หรือบริษัท..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="field-control pl-11 sm:h-12"
              />
            </div>

            <select
              aria-label="สถานะการจ้าง"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="field-control px-3"
            >
              <option value="all">ทุกสถานะ</option>
              {[...new Set(employees.map((employee) => employee.employment_status).filter((status): status is string => Boolean(status)))].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>

            <div className="text-sm text-[#64748b]">
              พบทั้งหมด{" "}
              <span className="font-bold text-[#0f172a]">
                {filtered.length}
              </span>{" "}
              รายการ
            </div>
          </div>
        </Card>

        <Card className="surface-card overflow-hidden">
          <div className="border-b border-[#D9E7EA] p-5 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-[#0f172a]">
              รายชื่อพนักงาน
            </h2>

            <p className="text-sm text-[#64748b] mt-1">
              ข้อมูลพนักงานในระบบ
            </p>
          </div>

          <div className="grid gap-3 p-4 md:hidden" aria-label="รายชื่อพนักงาน">
            {isLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                กำลังโหลดข้อมูลพนักงาน...
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((employee) => (
                <article
                  key={employee.id}
                  className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-bold text-card-foreground">
                        {[employee.first_name_th || employee.first_name, employee.last_name_th || employee.last_name]
                          .filter(Boolean)
                          .join(" ") || "-"}
                      </h3>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {employee.emp_code || "-"}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                      {employee.employment_status || "Worker"}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">บริษัท</dt>
                      <dd className="mt-1 break-words font-semibold text-card-foreground">
                        {employee.company_name || "-"}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-slate-500">ยอดหนี้สะสม</dt>
                      <dd className="mt-1 font-bold text-red-700">
                        {formatTHB(normalizeEmployeeDebtAmount(employee.debt_amount))}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                {isCydAdmin && selectedCompanyId
                  ? "ไม่พบข้อมูลพนักงานในบริษัทนี้"
                  : "ไม่พบข้อมูลพนักงาน"}
              </p>
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-muted/60 text-muted-foreground dark:bg-slate-900/60">
                <tr>
                  <th className="py-4 px-4 sm:px-5 text-left text-xs text-[#64748b] font-semibold">
                    Code
                  </th>
                  <th className="py-4 px-4 sm:px-5 text-left text-xs text-[#64748b] font-semibold">
                    ชื่อ
                  </th>
                  <th className="py-4 px-4 sm:px-5 text-left text-xs text-[#64748b] font-semibold">
                    นามสกุล
                  </th>
                  <th className="py-4 px-4 sm:px-5 text-left text-xs text-[#64748b] font-semibold">
                    เลขพาสปอร์ต
                  </th>
                  <th className="py-4 px-4 sm:px-5 text-left text-xs text-[#64748b] font-semibold">
                    บริษัท
                  </th>
                  <th className="py-4 px-4 sm:px-5 text-right text-xs text-[#64748b] font-semibold">
                    ยอดหนี้สะสม
                  </th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#64748b]">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        กำลังโหลดข้อมูลพนักงาน...
                      </div>
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border text-card-foreground transition-colors hover:bg-muted/40"
                    >
                      <td className="py-4 px-4 sm:px-5">
                        <div className="inline-block rounded-lg border border-teal-100 bg-teal-50 px-3 py-1 font-mono text-xs font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200">
                          {e.emp_code || "-"}
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                            <Users className="h-4 w-4 text-teal-700 dark:text-teal-300" />
                          </div>

                          <div>
                            <p className="font-semibold text-foreground">
                              {e.first_name_th || e.first_name || "-"}
                            </p>

                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {e.employment_status || "Worker"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <span className="font-semibold text-foreground">
                          {e.last_name_th || e.last_name || "-"}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <span className="text-sm font-medium text-muted-foreground">
                          {e.passport_number || "-"}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                            {e.company_name || "-"}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-right font-black text-rose-600 dark:text-rose-300 sm:px-5">
                        {formatTHB(normalizeEmployeeDebtAmount(e.debt_amount))}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-[#64748b]">
                      {isCydAdmin && selectedCompanyId
                        ? "ไม่พบข้อมูลพนักงานในบริษัทนี้"
                        : "ไม่พบข้อมูลพนักงาน"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* --- ADD EMPLOYEE DIALOG --- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">เพิ่มพนักงานใหม่</DialogTitle>
            <DialogDescription>
              บันทึกข้อมูลพนักงานเข้าสู่ฐานข้อมูลหลักของระบบ
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="add-code" className="font-bold text-slate-600">รหัสพนักงาน <span className="text-red-500">*</span></Label>
              <Input
                id="add-code"
                placeholder="เช่น EMP001"
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                className="rounded-xl h-12 font-bold"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="add-fname" className="font-bold text-slate-600">ชื่อ <span className="text-red-500">*</span></Label>
                <Input
                  id="add-fname"
                  placeholder="ชื่อ"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-xl h-12"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-lname" className="font-bold text-slate-600">นามสกุล <span className="text-red-500">*</span></Label>
                <Input
                  id="add-lname"
                  placeholder="นามสกุล"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-xl h-12"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-comp" className="font-bold text-slate-600">บริษัท (เลือกจากระบบ)</Label>
              <select
                id="add-comp"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
              >
                <option value="">เลือกบริษัท...</option>
                {allCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={adding}
              onClick={handleAddSubmit}
              className="h-12 w-full rounded-xl font-bold text-white shadow-lg transition-all active:scale-95"
            >
              {adding ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
              บันทึกข้อมูลพนักงาน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
