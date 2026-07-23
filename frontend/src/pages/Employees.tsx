import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const totalDebt = employees.reduce((acc, emp) => acc + Number(emp.debt_amount || 0), 0);
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
    <div className="min-h-screen bg-gradient-to-br from-[#f4f7fb] to-[#e6edff]">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start sm:items-center gap-3">
            <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-[#3b82f6] to-[#1e40af] border border-blue-300/30 flex items-center justify-center shrink-0 shadow-lg">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#0f172a]">
                Employees
              </h1>

              <p className="text-[#64748b] text-sm sm:text-base mt-1">
                จัดการข้อมูลแรงงานต่างด้าวทั้งหมดในระบบ
              </p>
            </div>
          </div>

          {!isCydAdmin && <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Button
              onClick={() => setAddOpen(true)}
              size="lg"
              className="rounded-2xl bg-[#2563eb] hover:bg-[#1e40af] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มพนักงาน
            </Button>
          </div>}
        </header>

        {isCydAdmin && (
          <Card className="p-4 rounded-2xl border-blue-200">
            <Label htmlFor="company-scope">บริษัทที่ต้องการตรวจสอบ</Label>
            <select id="company-scope" value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} className="mt-2 w-full h-11 px-3 rounded-xl border">
              <option value="">เลือกบริษัท</option>
              {allCompanies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </Card>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
          <Card className="rounded-3xl bg-gradient-to-r from-[#2563eb] to-[#1e40af] text-white p-5 lg:p-6 shadow-xl">
            <p className="text-sm opacity-80">พนักงานทั้งหมด</p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2">
              {isLoading ? "..." : employees.length}
            </h2>
          </Card>

          <Card className="rounded-3xl border border-[#dbe4f0] bg-white p-5 lg:p-6 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
            <p className="text-sm text-[#64748b]">ยอดหนี้สะสมรวม</p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2 text-red-600">
              {formatTHB(totalDebt)}
            </h2>
          </Card>

          <Card className="rounded-3xl border border-[#dbe4f0] bg-white p-5 lg:p-6 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
            <p className="text-sm text-[#64748b]">สถานะการจ้าง</p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-2 text-[#2563eb]">
              {statusCount} สถานะ
            </h2>
          </Card>
        </section>

        <Card className="rounded-3xl border border-[#dbe4f0] bg-white/95 backdrop-blur-md p-4 sm:p-5 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />

              <Input
                placeholder="ค้นหาชื่อ รหัส หรือบริษัท..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-11 h-11 sm:h-12 rounded-2xl border-[#dbe4f0] bg-[#f8fbff] text-[#0f172a]"
              />
            </div>

            <select
              aria-label="Employment status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-2xl border border-[#dbe4f0] bg-[#f8fbff] px-3 text-sm"
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

        <Card className="rounded-3xl border border-[#dbe4f0] bg-white shadow-[0_10px_30px_rgba(37,99,235,0.08)] overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-[#dbe4f0]">
            <h2 className="text-lg sm:text-xl font-bold text-[#0f172a]">
              รายชื่อพนักงาน
            </h2>

            <p className="text-sm text-[#64748b] mt-1">
              ข้อมูลพนักงานในระบบ
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-[#eef4ff]">
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
                      className="border-b border-[#dbe4f0] hover:bg-[#eef4ff] transition-colors"
                    >
                      <td className="py-4 px-4 sm:px-5">
                        <div className="font-mono text-xs px-3 py-1 rounded-lg bg-[#eef4ff] text-[#1e3a8a] border border-blue-100 inline-block font-bold">
                          {e.emp_code || "-"}
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm shrink-0">
                            <Users className="h-4 w-4 text-[#2563eb]" />
                          </div>

                          <div>
                            <p className="font-semibold text-[#0f172a]">
                              {e.first_name_th || e.first_name || "-"}
                            </p>

                            <p className="text-[10px] text-[#64748b] uppercase tracking-wider">
                              {e.employment_status || "Worker"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <span className="font-semibold text-[#0f172a]">
                          {e.last_name_th || e.last_name || "-"}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <span className="text-sm font-medium text-slate-600">
                          {e.passport_number || "-"}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-[#1e3a8a]">
                            {e.company_name || "-"}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 sm:px-5 text-right font-black text-red-600">
                        {formatTHB(Number(e.debt_amount || 0))}
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
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white shadow-lg shadow-blue-100 transition-all active:scale-95"
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
