/**
 * Attendance Page — Responsive Modern UI
 */

import { useState, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  Users,
  Clock3,
  Search,
  Activity,
  Loader2,
} from "lucide-react";

import {
  syncAttendanceFromSheet,
  getAttendanceRecords,
  submitAttendanceApproval,
  approveAttendanceApproval,
  getAvailableMonths,
} from "@/services/google-sheet.service";

import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { normalizeRole } from "@/lib/authz";
import { getCompanies } from "@/services/employee.service";
import { useSearchParams } from "react-router-dom";

type ApprovalFilter = "all" | "draft" | "submitted" | "approved" | "locked";

type BackendAttendanceRow = {
  id?: string | number;
  employee_code?: string;
  employee_name?: string;
  work_date?: string;
  is_present?: boolean;
  ot1?: number | string;
  ot15?: number | string;
  ot2?: number | string;
  ot_hours?: number | string;
  note?: string | null;
  shift_name?: string | null;
  branch_code?: string | null;
  work_time?: string | null;
  approval_status?: string | null;
  payroll_locked_at?: string | null;
  source_sheet_id?: string | null;
};

type AttendanceView = {
  id: string;
  employeeCode: string;
  employeeName: string;
  workDate: string;
  isPresent: boolean;
  isLeave: boolean;
  ot1: number;
  ot15: number;
  ot2: number;
  otHours: number;
  note?: string | null;
  shiftName?: string | null;
  branchCode?: string | null;
  workTime: string;
  approvalStatus: string;
  payrollLockedAt?: string | null;
  sourceSheetId?: string | null;
};

const toMonthValue = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthRange = (monthValue: string) => {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);

  return { startDate: start, endDate: end };
};

const THIS_MONTH = toMonthValue(new Date());
const lastMonthDate = new Date();
lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
const LAST_MONTH = toMonthValue(lastMonthDate);

export default function Attendance() {
  const queryClient = useQueryClient();
  const userRole = normalizeRole(useAuth((s) => s.user?.role));
  const isCydAdmin = userRole === "cyd_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCompanyId = searchParams.get("companyId") ?? "";
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(THIS_MONTH);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");

  const GOOGLE_SHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID ?? "";

  const { data: companies = [] } = useQuery({
    queryKey: ["companies", "attendance-scope"],
    queryFn: getCompanies,
    enabled: isCydAdmin,
  });

  const { data: availableMonths = [] } = useQuery({
    queryKey: ["available-months", selectedCompanyId],
    queryFn: () => getAvailableMonths(isCydAdmin ? Number(selectedCompanyId) : undefined),
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  const allMonthOptions = useMemo(() => {
    const months = new Set([THIS_MONTH, LAST_MONTH, ...availableMonths]);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [availableMonths]);

  const formatTime = (value?: string | null) => {
    if (!value) return "-";

    return String(value)
      .trim()
      .replace(/^(\d):/, "0$1:");
  };

  const mapBackendRows = (rows: BackendAttendanceRow[]): AttendanceView[] => {
    return rows.map((r) => {
      const ot1 = Number(r.ot1 ?? 0);
      const ot15 = Number(r.ot15 ?? 0);
      const ot2 = Number(r.ot2 ?? 0);

      return {
        id: String(r.id ?? ""),
        employeeCode: r.employee_code ?? "",
        employeeName: r.employee_name ?? "",
        workDate: r.work_date?.split("T")[0] ?? "",
        isPresent: Boolean(r.is_present),
        isLeave: false,

        ot1,
        ot15,
        ot2,

        otHours: r.ot_hours != null ? Number(r.ot_hours) : ot1 + ot15 + ot2,

        note: r.note,
        shiftName: r.shift_name,
        branchCode: r.branch_code,
        workTime: formatTime(r.work_time),
        approvalStatus: r.approval_status ?? "draft",
        payrollLockedAt: r.payroll_locked_at,
        sourceSheetId: r.source_sheet_id,
      };
    });
  };

  const monthRange = getMonthRange(selectedMonth);

  const { data: attendance = [], isLoading, isError } = useQuery({
    queryKey: ["attendance", selectedMonth, approvalFilter, selectedCompanyId],
    queryFn: async () => {
      const rows = await getAttendanceRecords({
        ...monthRange,
        approvalStatus: approvalFilter,
        companyId: isCydAdmin ? Number(selectedCompanyId) : undefined,
      });
      return mapBackendRows(rows as BackendAttendanceRow[]);
    },
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  const dateOptions = Array.from(
    new Set(attendance.map((a) => a.workDate).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const handleSync = async () => {
    if (!GOOGLE_SHEET_ID) {
      toast.error("ยังไม่ได้ตั้งค่า Google Sheet ID");
      return;
    }

    try {
      setSyncing(true);

      const result = await syncAttendanceFromSheet(GOOGLE_SHEET_ID);

      toast.success(
        `Sync สำเร็จ: เพิ่ม ${result.inserted ?? 0} · อัปเดต ${result.updated ?? 0
        } · ข้าม ${result.skipped ?? 0}`
      );

      if (result.errors?.length) {
        toast.warning(`มี error ${result.errors.length} รายการ`);
      }

      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Sync ล้มเหลว");
    } finally {
      setSyncing(false);
    }
  };

  const buildSelectedScope = () => {
    if (!selectedDate) {
      toast.error("Please select a date first");
      return null;
    }

    return { date: selectedDate };
  };

  const handleSubmitAttendance = async () => {
    const scope = buildSelectedScope();
    if (!scope) return;

    try {
      setSubmitting(true);
      const result = await submitAttendanceApproval(scope);
      toast.success(`Submitted ${result.updated ?? 0} attendance record(s)`);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit attendance failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveAttendance = async () => {
    const scope = buildSelectedScope();
    if (!scope) return;

    try {
      setApproving(true);
      const result = await approveAttendanceApproval(scope);
      toast.success(`Approved ${result.updated ?? 0} attendance record(s)`);
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approve attendance failed");
    } finally {
      setApproving(false);
    }
  };

  const getApprovalLabel = (status: string, locked: boolean) => {
    if (locked) return "Locked";
    if (status === "submitted") return "Submitted";
    if (status === "approved") return "Approved";
    return "Draft";
  };

  const getApprovalClass = (status: string, locked: boolean) => {
    if (locked) return "bg-slate-700 text-white";
    if (status === "approved") return "bg-emerald-600 text-white";
    if (status === "submitted") return "bg-amber-500 text-white";
    return "bg-slate-100 text-slate-700 border border-slate-200";
  };

  const recent = [...attendance]
    .filter((a) => !selectedDate || a.workDate === selectedDate)
    .filter((a) => {
      if (approvalFilter === "all") return true;
      if (approvalFilter === "locked") return Boolean(a.payrollLockedAt);
      if (a.payrollLockedAt) return false;
      return (a.approvalStatus ?? "draft") === approvalFilter;
    })
    .filter((a) => {
      const keyword = search.toLowerCase();
      const employeeName = a.employeeName ?? "";

      return (
        employeeName.toLowerCase().includes(keyword) ||
        String(a.employeeCode ?? "").toLowerCase().includes(keyword) ||
        String(a.workDate ?? "").includes(search)
      );
    });

  const canSubmit = userRole === "field_staff";
  const canApprove = userRole === "admin" || userRole === "hr";
  const hasDraft = recent.some((a) => !a.payrollLockedAt && (a.approvalStatus ?? "draft") === "draft");
  const hasSubmitted = recent.some((a) => !a.payrollLockedAt && a.approvalStatus === "submitted");

  const presentCount = recent.filter((a) => a.isPresent).length;
  const leaveCount = recent.filter((a) => a.isLeave).length;
  const absentCount = recent.filter((a) => !a.isPresent && !a.isLeave).length;

  if (isError) {
    return (
      <div className="p-8">
        <Card className="p-6 border-red-200 bg-red-50 text-red-700">
          ไม่สามารถโหลดข้อมูล Attendance ได้ กรุณาตรวจสอบการเชื่อมต่อกับ Backend
        </Card>
      </div>
    );
  }

  return (
  <div className="min-h-screen bg-[#f4f7fb]">
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] border border-blue-300/30 flex items-center justify-center shrink-0">
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#0f172a]">
              ประวัติการมาทำงาน
            </h1>

            <p className="text-[#64748b] text-sm sm:text-base mt-1">
              ข้อมูลการมาทำงานที่ Sync จาก Google Sheet
            </p>
          </div>
        </div>

        {!isCydAdmin && <Button
          onClick={handleSync}
          disabled={syncing}
          size="lg"
          className="rounded-2xl bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "กำลัง Sync..." : "Sync จาก Google Sheet"}
        </Button>}
      </header>

      {isCydAdmin && (
        <Card className="p-4 rounded-2xl border-blue-200">
          <label htmlFor="attendance-company" className="text-sm font-semibold text-slate-700">Company scope</label>
          <select id="attendance-company" value={selectedCompanyId} onChange={(event) => setSearchParams(event.target.value ? { companyId: event.target.value } : {})} className="mt-2 h-11 w-full rounded-xl border px-3 bg-white">
            <option value="">Select a company</option>
            {companies.map((company: { id: number; company_name: string }) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
          </select>
        </Card>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
        <Card className="rounded-xl border border-gray-200 bg-green-100/50 p-5 lg:p-6 shadow-sm text-green-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-green-700/80">มาทำงาน</p>
              <h2 className="text-2xl font-semibold mt-2">
                {presentCount}
              </h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-full p-2 shadow-sm">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="rounded-xl border border-gray-200 bg-orange-100/50 p-5 lg:p-6 shadow-sm text-orange-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-orange-700/80">ลางาน</p>
              <h2 className="text-2xl font-semibold mt-2">
                {leaveCount}
              </h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-full p-2 shadow-sm">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="rounded-xl border border-gray-200 bg-red-100/50 p-5 lg:p-6 shadow-sm text-red-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-red-700/80">ขาดงาน</p>
              <h2 className="text-2xl font-semibold mt-2">
                {absentCount}
              </h2>
            </div>
            <div className="bg-white border border-gray-200 rounded-full p-2 shadow-sm">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </Card>
      </section>

      <Card className="rounded-3xl border border-[#dbe4f0] bg-white p-4 sm:p-5 shadow-[0_8px_24px_rgba(30,58,138,0.08)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />

            <Input
              placeholder="ค้นหาชื่อพนักงาน รหัส หรือ วันที่..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-11 sm:h-12 rounded-2xl border-[#dbe4f0] bg-[#f8fbff] text-[#0f172a]"
            />
          </div>

          <div className="text-sm text-[#64748b]">
            แสดงข้อมูล{" "}
            <span className="font-bold text-[#0f172a]">{recent.length}</span>{" "}
            รายการล่าสุด
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-[#dbe4f0]">
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">เลือกเดือน</label>
            <select
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setSelectedDate("");
              }}
              className="h-11 rounded-2xl border border-[#dbe4f0] bg-[#f8fbff] px-4 text-sm text-[#0f172a] outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {allMonthOptions.map((m) => (
                <option key={m} value={m}>
                  {m === THIS_MONTH ? `เดือนนี้ (${m})` : m === LAST_MONTH ? `เดือนที่แล้ว (${m})` : m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">ระบุวันที่</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-11 rounded-2xl border border-[#dbe4f0] bg-[#f8fbff] px-4 text-sm text-[#0f172a] outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">ทุกวันที่</option>
              {dateOptions.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">สถานะอนุมัติ</label>
            <select
              value={approvalFilter}
              onChange={(e) => setApprovalFilter(e.target.value as ApprovalFilter)}
              className="h-11 rounded-2xl border border-[#dbe4f0] bg-[#f8fbff] px-4 text-sm text-[#0f172a] outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">All approval status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="locked">Locked</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="rounded-3xl border border-[#dbe4f0] bg-white shadow-[0_8px_24px_rgba(30,58,138,0.08)] overflow-hidden">
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#dbe4f0]">
          <div>
            {/* <h2 className="text-lg sm:text-xl font-bold text-foreground">
              ประวัติการมาทำงาน
            </h2> */}

            <p className="text-sm text-[#64748b] mt-1">
              ข้อมูลล่าสุดจาก Database
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canSubmit && (
              <Button
                size="sm"
                onClick={handleSubmitAttendance}
                disabled={submitting || !selectedDate || !hasDraft}
                className="rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit
              </Button>
            )}

            {canApprove && (
              <Button
                size="sm"
                onClick={handleApproveAttendance}
                disabled={approving || !selectedDate || !hasSubmitted}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approve
              </Button>
            )}

            <div className="hidden md:flex items-center gap-2 text-sm text-[#64748b]">
              <Activity className="h-4 w-4" />
              Live Sync
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-[#eef4ff]">
              <tr>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  วันที่
                </th>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  พนักงาน
                </th>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  สถานะ
                </th>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  Approval
                </th>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  เวลา
                </th>
                <th className="py-4 px-4 sm:px-5 text-right text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  OT
                </th>
                <th className="py-4 px-4 sm:px-5 text-left text-xs uppercase tracking-wider text-[#64748b] font-semibold">
                  หมายเหตุ
                </th>
              </tr>
            </thead>

            <tbody>
              {recent.map((a, index) => {
                const employeeName = a.employeeName ?? "-";
                const employeeCode = a.employeeCode ?? "-";
                const isLocked = Boolean(a.payrollLockedAt);
                const approvalStatus = a.approvalStatus ?? "draft";
                const isReadonly = isLocked || approvalStatus === "approved";

                return (
                  <tr
                    key={a.id ?? `${employeeCode}-${a.workDate}-${index}`}
                    className={`border-b border-[#dbe4f0] hover:bg-[#eef4ff] transition-colors ${isReadonly ? "opacity-80" : ""}`}
                  >
                    <td className="py-4 px-4 sm:px-5 whitespace-nowrap">
                      <div className="font-mono text-[11px] sm:text-xs px-3 py-1 rounded-lg bg-[#eef4ff] text-[#1e3a8a] inline-block">
                        {a.workDate ?? "-"}
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-5">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="h-10 w-10 rounded-2xl bg-[#eef4ff] border border-blue-200 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-[#2563eb]" />
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-[#0f172a] truncate">
                            {employeeName}
                          </p>

                          <p className="text-xs text-[#64748b] truncate">
                            {employeeCode}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-5 whitespace-nowrap">
                      {a.isPresent ? (
                        <Badge className="bg-[#2563eb] text-white rounded-xl px-3 py-1">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          มาทำงาน
                        </Badge>
                      ) : a.isLeave ? (
                        <Badge className="bg-[#f59e0b] text-white rounded-xl px-3 py-1">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          ลางาน
                        </Badge>
                      ) : (
                        <Badge
                          variant="destructive"
                          className="bg-[#ef4444] text-white rounded-xl px-3 py-1"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          ขาดงาน
                        </Badge>
                      )}
                    </td>

                    <td className="py-4 px-4 sm:px-5 whitespace-nowrap">
                      <Badge className={`rounded-xl px-3 py-1 ${getApprovalClass(approvalStatus, isLocked)}`}>
                        {getApprovalLabel(approvalStatus, isLocked)}
                      </Badge>
                    </td>

                    <td className="py-4 px-4 sm:px-5 text-[#64748b] whitespace-nowrap">
                      {a.workTime}
                    </td>

                    <td className="py-4 px-4 sm:px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 font-semibold text-[#2563eb]">
                        <Clock3 className="h-4 w-4" />
                        {a.otHours ?? 0}
                      </div>
                    </td>

                    <td className="py-4 px-4 sm:px-5 text-[#64748b] min-w-[220px]">
                      <div className="truncate">{a.note ?? "-"}</div>
                    </td>
                  </tr>
                );
              })}

              {recent.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-[#64748b]"
                  >
                    ไม่พบข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>
);
}
