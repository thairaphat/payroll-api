import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarRange, Loader2, Plus, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatePanel } from "@/components/layout/StatePanel";
import { PayrollRunStatus } from "@/components/payroll/PayrollRunStatus";
import { useAuth } from "@/store/auth";
import { normalizeRole } from "@/lib/authz";
import { getCompanies } from "@/services/employee.service";
import {
  createPayrollRun,
  isPayrollRunSchemaNotInitializedError,
  listPayrollRuns,
  payrollRunQueryRetry,
  payrollRunsQueryKey,
} from "@/services/payroll-run.service";
import { formatTHB, parsePayrollCompanyId } from "@/services/payroll.service";

export default function PayrollRuns() {
  const role = normalizeRole(useAuth((state) => state.user?.role));
  const isCydAdmin = role === "cyd_admin";
  const [params, setParams] = useSearchParams();
  const companyValue = params.get("companyId") ?? "";
  const companyId = parsePayrollCompanyId(companyValue);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [paymentDate, setPaymentDate] = useState("");
  const queryClient = useQueryClient();
  const enabled = !isCydAdmin || companyId !== undefined;

  const companies = useQuery({
    queryKey: ["companies", "payroll-runs"],
    queryFn: getCompanies,
    enabled: isCydAdmin,
  });
  const runs = useQuery({
    queryKey: payrollRunsQueryKey(companyValue, year),
    queryFn: () => listPayrollRuns(isCydAdmin ? companyId : undefined, year),
    enabled,
    retry: payrollRunQueryRetry,
  });
  const create = useMutation({
    mutationFn: () => {
      const [selectedYear, selectedMonth] = month.split("-").map(Number);
      const periodStart = `${month}-01`;
      const periodEnd = new Date(selectedYear, selectedMonth, 0)
        .toISOString()
        .slice(0, 10);
      return createPayrollRun({
        companyId: isCydAdmin ? companyId : undefined,
        periodStart,
        periodEnd,
        paymentDate,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["payroll-runs", companyValue],
      }),
  });

  const canCreate = role === "admin" || role === "hr";
  const rows = runs.data ?? [];
  const schemaNotInitialized = isPayrollRunSchemaNotInitializedError(runs.error);
  const years = useMemo(
    () => Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 3 + index),
    []
  );

  return (
    <div className="page-shell">
      <PageHeader
        title="รอบเงินเดือน"
        description="สร้าง ตรวจสอบ อนุมัติ และติดตามสถานะรอบจ่ายเงินเดือน"
        icon={CalendarRange}
      />

      <Card className={`soft-panel grid gap-4 md:grid-cols-2 ${canCreate ? (isCydAdmin ? "xl:grid-cols-5" : "xl:grid-cols-4") : "xl:grid-cols-2"}`}>
        {isCydAdmin && (
          <div className={canCreate ? "xl:col-span-2" : ""}>
            <Label htmlFor="payroll-runs-company">บริษัท</Label>
            <select
              id="payroll-runs-company"
              value={companyValue}
              onChange={(event) =>
                setParams(event.target.value ? { companyId: event.target.value } : {})
              }
              className="field-control mt-2"
            >
              <option value="">กรุณาเลือกบริษัท</option>
              {(companies.data ?? []).map((company: { id: number; company_name: string }) => (
                <option key={company.id} value={company.id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="payroll-runs-year">ปี</Label>
          <select
            id="payroll-runs-year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="field-control mt-2"
          >
            {years.map((value) => <option key={value}>{value}</option>)}
          </select>
        </div>
        {canCreate && (
          <>
            <div>
              <Label htmlFor="payroll-runs-month">เดือนรอบเงินเดือน</Label>
              <input id="payroll-runs-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="field-control mt-2" />
            </div>
            <div>
              <Label htmlFor="payroll-runs-payment-date">วันที่จ่าย</Label>
              <input id="payroll-runs-payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="field-control mt-2" />
            </div>
            <Button className="mt-auto w-full" disabled={!enabled || !month || !paymentDate || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              สร้างรอบเงินเดือน
            </Button>
          </>
        )}
      </Card>

      {!enabled ? (
        <StatePanel kind="empty" title="กรุณาเลือกบริษัท" message="เลือกบริษัทก่อนดูหรือสร้างรอบเงินเดือน" />
      ) : runs.isLoading ? (
        <StatePanel kind="loading" title="กำลังโหลดรอบเงินเดือน" />
      ) : runs.isError ? (
        <StatePanel
          kind={schemaNotInitialized ? "warning" : "error"}
          title={schemaNotInitialized ? "ระบบรอบเงินเดือนยังไม่พร้อมใช้งาน" : "โหลดรอบเงินเดือนไม่สำเร็จ"}
          message={
            schemaNotInitialized
              ? "ระบบรอบเงินเดือนยังไม่ได้เปิดใช้งานในฐานข้อมูล กรุณาดำเนินการ Migration ก่อน"
              : "กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่"
          }
          action={
            <Button variant="outline" onClick={() => runs.refetch()}>
              <RefreshCw />
              ลองใหม่
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <StatePanel
          kind="empty"
          title="ยังไม่มีรอบเงินเดือน"
          message={`ยังไม่มีรอบเงินเดือนสำหรับปี ${year}`}
        />
      ) : (
        <>
        <div className="grid gap-3 md:hidden" aria-label="รายการรอบเงินเดือน">
          {rows.map((run) => (
            <Link
              key={run.id}
              className="surface-card-interactive block p-4"
              to={`/payroll-runs/${run.id}${companyValue ? `?companyId=${companyValue}` : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">รอบเริ่มวันที่</p>
                  <p className="mt-1 font-bold text-card-foreground">{String(run.period_start).slice(0, 10)}</p>
                </div>
                <PayrollRunStatus status={run.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
                <div><dt className="text-slate-500">พนักงาน</dt><dd className="font-semibold">{run.employee_count} คน</dd></div>
                <div className="text-right"><dt className="text-slate-500">เงินสุทธิ</dt><dd className="font-bold text-primary">{formatTHB(Number(run.net_income_total))}</dd></div>
                <div><dt className="text-slate-500">รายได้รวม</dt><dd className="font-semibold">{formatTHB(Number(run.gross_income_total))}</dd></div>
                <div className="text-right"><dt className="text-slate-500">รายการหัก</dt><dd className="font-semibold text-red-700">{formatTHB(Number(run.deduction_total))}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
        <Card className="surface-card hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th className="p-3">รอบ</th><th className="p-3">สถานะ</th>
                <th className="p-3 text-right">พนักงาน</th><th className="p-3 text-right">รายได้รวม</th>
                <th className="p-3 text-right">รายการหัก</th><th className="p-3 text-right">เงินสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="p-3"><Link className="font-semibold text-blue-700" to={`/payroll-runs/${run.id}${companyValue ? `?companyId=${companyValue}` : ""}`}>{String(run.period_start).slice(0, 10)}</Link></td>
                  <td className="p-3"><PayrollRunStatus status={run.status} /></td>
                  <td className="p-3 text-right">{run.employee_count}</td>
                  <td className="p-3 text-right">{formatTHB(Number(run.gross_income_total))}</td>
                  <td className="p-3 text-right">{formatTHB(Number(run.deduction_total))}</td>
                  <td className="p-3 text-right font-bold">{formatTHB(Number(run.net_income_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </div>
  );
}
