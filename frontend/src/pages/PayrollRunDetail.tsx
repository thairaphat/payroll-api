import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, LockKeyhole, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatePanel } from "@/components/layout/StatePanel";
import { PayrollRunStatus } from "@/components/payroll/PayrollRunStatus";
import { useAuth } from "@/store/auth";
import { normalizeRole } from "@/lib/authz";
import { formatTHB, parsePayrollCompanyId } from "@/services/payroll.service";
import type { PayrollPdfData } from "@/services/pdf.service";
import {
  exportPayrollRunItems,
  getPayrollRun,
  getPayrollRunItems,
  isPayrollRunSchemaNotInitializedError,
  mutatePayrollRun,
  payrollRunQueryRetry,
  payrollRunQueryKey,
  type PayrollRun,
  type PayrollRunItem,
} from "@/services/payroll-run.service";

function payrollRunItemToPdf(item: PayrollRunItem): PayrollPdfData {
  const wage = item.wage_config_snapshot;
  const hourlyRate =
    Number(wage?.workHoursPerDay) > 0
      ? Number(wage?.dailyWage) / Number(wage?.workHoursPerDay)
      : 0;
  const income = (hours: string, multiplier?: string) =>
    Number(hours) * hourlyRate * Number(multiplier ?? 0);
  return {
    employee_code: item.employee_code_snapshot,
    employee_name: item.employee_name_snapshot,
    branch_code: item.branch_code_snapshot ?? "",
    work_days: item.work_days,
    total_ot_hours:
      Number(item.ot1_hours) + Number(item.ot15_hours) + Number(item.ot2_hours),
    total_ot1: item.ot1_hours,
    total_ot15: item.ot15_hours,
    total_ot2: item.ot2_hours,
    base_income: item.base_income,
    ot1_income: income(item.ot1_hours, wage?.ot1Multiplier),
    ot15_income: income(item.ot15_hours, wage?.ot15Multiplier),
    ot2_income: income(item.ot2_hours, wage?.ot2Multiplier),
    other_income: item.other_income,
    gross_income: item.gross_income,
    deduction_amount: item.total_deductions,
    net_income: item.net_income,
  };
}

async function downloadPayrollRunPdf(
  run: PayrollRun,
  rows: PayrollRunItem[]
) {
  const {
    createPayrollPdfDocument,
    downloadBlob,
    generateNativePayrollSlipPdf,
  } = await import("@/services/pdf.service");
  const pdf = createPayrollPdfDocument();
  const paymentDate = new Date(`${String(run.payment_date).slice(0, 10)}T00:00:00`);
  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0) pdf.addPage();
    await generateNativePayrollSlipPdf(
      payrollRunItemToPdf(rows[index]),
      String(run.payment_date).slice(0, 10),
      paymentDate.getMonth() + 1,
      paymentDate.getFullYear(),
      pdf,
      "th",
      String(run.period_start).slice(0, 10),
      String(run.period_end).slice(0, 10)
    );
    if (run.status !== "LOCKED" && run.status !== "PAID") {
      pdf.setTextColor(220, 38, 38);
      pdf.setFontSize(54);
      pdf.text("DRAFT", 148.5, 105, { align: "center", angle: 30 });
    }
  }
  downloadBlob(
    pdf.output("blob"),
    `payroll-run-${run.id}-${String(run.period_start).slice(0, 10)}.pdf`
  );
}

export default function PayrollRunDetail() {
  const { runId = "" } = useParams();
  const [params] = useSearchParams();
  const companyValue = params.get("companyId") ?? "";
  const companyId = parsePayrollCompanyId(companyValue);
  const role = normalizeRole(useAuth((state) => state.user?.role));
  const isCydAdmin = role === "cyd_admin";
  const enabled = Boolean(runId) && (!isCydAdmin || companyId !== undefined);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const run = useQuery({
    queryKey: payrollRunQueryKey(runId, companyValue),
    queryFn: () => getPayrollRun(runId, isCydAdmin ? companyId : undefined),
    enabled,
    retry: payrollRunQueryRetry,
  });
  const items = useQuery({
    queryKey: [...payrollRunQueryKey(runId, companyValue), "items"],
    queryFn: () => getPayrollRunItems(runId, isCydAdmin ? companyId : undefined),
    enabled: enabled && run.isSuccess,
    retry: payrollRunQueryRetry,
  });
  const mutate = useMutation({
    mutationFn: ({ action, body = {} }: { action: Parameters<typeof mutatePayrollRun>[1]; body?: Record<string, unknown> }) =>
      mutatePayrollRun(runId, action, {
        ...body,
        ...(isCydAdmin ? { companyId } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: payrollRunQueryKey(runId, companyValue) }),
  });
  const data = run.data;
  const rows = items.data ?? [];
  const act = (action: Parameters<typeof mutatePayrollRun>[1], body?: Record<string, unknown>) => mutate.mutate({ action, body });
  const cancel = () => {
    if (!cancelReason.trim()) return;
    act("cancel", { reason: cancelReason.trim() });
    setCancelOpen(false);
    setCancelReason("");
  };
  const exportPdf = async () => {
    if (!data || rows.length === 0) return;
    try {
      const snapshotRows = await exportPayrollRunItems(
        runId,
        isCydAdmin ? companyId : undefined
      );
      await downloadPayrollRunPdf(data, snapshotRows);
      toast.success("ดาวน์โหลด PDF สำเร็จ");
    } catch {
      toast.error("สร้าง PDF ไม่สำเร็จ");
    }
  };

  if (!enabled) return <div className="page-shell"><StatePanel kind="empty" title="กรุณาเลือกบริษัท" /></div>;
  if (run.isLoading || items.isLoading) return <div className="page-shell"><StatePanel kind="loading" title="กำลังโหลดรายละเอียดรอบเงินเดือน" /></div>;
  if (run.isError || items.isError || !data) {
    const schemaNotInitialized =
      isPayrollRunSchemaNotInitializedError(run.error) ||
      isPayrollRunSchemaNotInitializedError(items.error);
    return (
      <div className="page-shell">
        <StatePanel
          kind={schemaNotInitialized ? "warning" : "error"}
          title={schemaNotInitialized ? "ระบบรอบเงินเดือนยังไม่พร้อมใช้งาน" : "โหลดรายละเอียดรอบเงินเดือนไม่สำเร็จ"}
          message={
            schemaNotInitialized
              ? "ระบบรอบเงินเดือนยังไม่ได้เปิดใช้งานในฐานข้อมูล กรุณาดำเนินการ Migration ก่อน"
              : "กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่"
          }
          action={!schemaNotInitialized ? <Button variant="outline" onClick={() => run.refetch()}><RefreshCw />ลองใหม่</Button> : undefined}
        />
      </div>
    );
  }

  const canHr = role === "admin" || role === "hr";
  const canAccounting = role === "admin" || role === "accounting";

  return (
    <div className="page-shell">
      <PageHeader
        title={`รอบเงินเดือน ${String(data.period_start).slice(0, 10)}`}
        description={`งวด ${String(data.period_start).slice(0, 10)} – ${String(data.period_end).slice(0, 10)}`}
        icon={LockKeyhole}
        actions={
          <>
            <PayrollRunStatus status={data.status} />
            <Button asChild variant="outline">
              <Link to={`/payroll-runs${companyValue ? `?companyId=${companyValue}` : ""}`}>
                <ArrowLeft />
                กลับไปรายการ
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="surface-card p-4 sm:p-5"><p className="text-xs font-semibold text-slate-500 sm:text-sm">พนักงาน</p><strong className="mt-2 block text-xl sm:text-2xl">{data.employee_count} คน</strong></Card>
        <Card className="surface-card p-4 sm:p-5"><p className="text-xs font-semibold text-slate-500 sm:text-sm">ค่าจ้างฐาน</p><strong className="mt-2 block text-lg sm:text-2xl">{formatTHB(Number(data.base_income_total))}</strong></Card>
        <Card className="surface-card p-4 sm:p-5"><p className="text-xs font-semibold text-slate-500 sm:text-sm">ค่าล่วงเวลา</p><strong className="mt-2 block text-lg sm:text-2xl">{formatTHB(Number(data.overtime_income_total))}</strong></Card>
        <Card className="surface-card border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-800/60 dark:bg-cyan-950/40 sm:p-5"><p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 sm:text-sm">เงินสุทธิ</p><strong className="mt-2 block text-lg text-card-foreground sm:text-2xl">{formatTHB(Number(data.net_income_total))}</strong></Card>
      </div>
      <Card className="surface-card flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap">
        {canHr && ["DRAFT", "CALCULATED"].includes(data.status) && <Button onClick={() => act("calculate")}>คำนวณ{data.status === "CALCULATED" ? "ใหม่" : ""}</Button>}
        {canHr && data.status === "CALCULATED" && <Button onClick={() => act("review")}>ส่งตรวจ</Button>}
        {canAccounting && data.status === "REVIEWED" && <Button onClick={() => act("approve")}>อนุมัติ</Button>}
        {canHr && ["REVIEWED", "APPROVED"].includes(data.status) && <Button variant="outline" onClick={() => act("return")}>ส่งกลับแก้</Button>}
        {canAccounting && data.status === "APPROVED" && <Button onClick={() => act("lock", { idempotencyKey: `lock:${data.id}` })}>ล็อกรอบเงินเดือน</Button>}
        {canAccounting && data.status === "LOCKED" && <Button onClick={() => act("mark-paid")}>บันทึกว่าจ่ายแล้ว</Button>}
        {role === "admin" && data.status !== "PAID" && data.status !== "CANCELLED" && <Button variant="destructive" onClick={() => setCancelOpen(true)}>ยกเลิกรอบ</Button>}
        <Button variant="outline" disabled={rows.length === 0} onClick={exportPdf}><Download />PDF ทั้งหมดจาก Snapshot</Button>
      </Card>
      {data.status !== "LOCKED" && data.status !== "PAID" && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center font-semibold text-amber-900">ฉบับร่าง — เอกสารนี้ยังไม่ใช่หลักฐานการจ่ายเงินจริง</div>}
      <div className="grid gap-3 md:hidden">
        {rows.map((item) => (
          <Card key={item.id} className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-950">{item.employee_name_snapshot}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{item.employee_code_snapshot}</p>
              </div>
              <Button size="sm" variant="outline" aria-label={`ดาวน์โหลดสลิปของ ${item.employee_name_snapshot}`} onClick={() => downloadPayrollRunPdf(data, [item])}>
                <Download />
                PDF
              </Button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
              <div><dt className="text-slate-500">วันทำงาน</dt><dd className="font-semibold">{item.work_days}</dd></div>
              <div><dt className="text-slate-500">OT</dt><dd className="font-semibold">{Number(item.ot1_hours) + Number(item.ot15_hours) + Number(item.ot2_hours)} ชม.</dd></div>
              <div><dt className="text-slate-500">รายการหัก</dt><dd className="font-semibold text-red-700">{formatTHB(Number(item.total_deductions))}</dd></div>
              <div><dt className="text-slate-500">เงินสุทธิ</dt><dd className="font-bold text-primary">{formatTHB(Number(item.net_income))}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <Card className="surface-card hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead><tr><th className="text-left">รหัส</th><th className="text-left">ชื่อพนักงาน</th><th className="text-right">วันทำงาน</th><th className="text-right">OT</th><th className="text-right">ค่าจ้างฐาน</th><th className="text-right">รายการหัก</th><th className="text-right">เงินสุทธิ</th><th className="text-right">สลิป</th></tr></thead>
          <tbody>{rows.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{item.employee_code_snapshot}</td><td className="p-3">{item.employee_name_snapshot}</td><td className="p-3 text-right">{item.work_days}</td><td className="p-3 text-right">{Number(item.ot1_hours) + Number(item.ot15_hours) + Number(item.ot2_hours)}</td><td className="p-3 text-right">{formatTHB(Number(item.base_income))}</td><td className="p-3 text-right">{formatTHB(Number(item.total_deductions))}</td><td className="p-3 text-right font-bold">{formatTHB(Number(item.net_income))}</td><td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => downloadPayrollRunPdf(data, [item])}>PDF</Button></td></tr>)}</tbody>
        </table>
      </Card>
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการยกเลิกรอบเงินเดือน</AlertDialogTitle>
            <AlertDialogDescription>
              การยกเลิกมีผลต่อ workflow ของรอบนี้ กรุณาระบุเหตุผลเพื่อบันทึกในประวัติการตรวจสอบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payroll-run-cancel-reason">เหตุผลการยกเลิก</Label>
            <Input
              id="payroll-run-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="ระบุเหตุผล"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับ</AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelReason.trim() || mutate.isPending}
              onClick={(event) => {
                event.preventDefault();
                cancel();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              ยืนยันยกเลิก
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
