/**
 * Payroll Page — Responsive + Modern UI
 */
import { useRef, useState, useMemo, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";

import {
  addPayrollSlipElementToPdf,
  createPayrollPdfDocument,
  downloadBlob,
  generatePayrollSlipPdfFromElement,
  PayrollLanguage,
} from "@/services/pdf.service";

import {
  Download,
  Loader2,
  Wallet,
  Users,
  Receipt,
  CalendarRange,
  TrendingUp,
  Eye,
  Languages,
  Save,
  Printer,
} from "lucide-react";

import {
  formatTHB,
  fetchPayrollSummary,
  lockPayrollPeriod,
  canViewAllPayrollRecords,
  parsePayrollCompanyId,
  payrollQueryKey,
  payrollQueryRetry,
} from "@/services/payroll.service";
import { PayrollErrorNotice } from "@/components/payroll/PayrollErrorNotice";
import { getAvailableMonths, getAvailableDates } from "@/services/google-sheet.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { normalizeRole } from "@/lib/authz";
import { getCompanies } from "@/services/employee.service";
import { useSearchParams } from "react-router-dom";
import { EmployeeProfileName } from "@/components/employee/EmployeeProfileName";
import { isEmployeeProfileMissing } from "@/lib/employee-profile";

type PayrollRow = {
  employee_code: string;
  employee_name: string | null;
  employee_profile_status?: "FOUND" | "NOT_FOUND";
  branch_code: string;
  work_days: number | string;
  total_ot1: number | string;
  total_ot15: number | string;
  total_ot2: number | string;
  total_ot_hours: number | string;
  base_income: number | string;
  ot15_income: number | string;
  ot2_income: number | string;
  total_income: number | string;
  gross_income: number | string;
  net_income: number | string;
  deduction_amount?: number | string;
  insuranceDeduction?: number | string;
  employerChangeDeduction?: number | string;
  report90DaysDeduction?: number | string;
  registrationDeduction?: number | string;
  extensionDeduction?: number | string;
  absentDeduction?: number | string;
  transportDeduction?: number | string;
  documentFeeDeduction?: number | string;
};

const num = (value: number | string | undefined | null) => Number(value ?? 0);

const DEDUCTION_FIELDS = [
  { labelKey: "INSURANCE_DEDUCTION", field: "insuranceDeduction" },
  { labelKey: "EMPLOYER_CHANGE_DEDUCTION", field: "employerChangeDeduction" },
  { labelKey: "REPORT_90_DAYS_DEDUCTION", field: "report90DaysDeduction" },
  { labelKey: "REGISTRATION_DEDUCTION", field: "registrationDeduction" },
  { labelKey: "EXTENSION_DEDUCTION", field: "extensionDeduction" },
  { labelKey: "ABSENT_DEDUCTION", field: "absentDeduction" },
  { labelKey: "TRANSPORT_DEDUCTION", field: "transportDeduction" },
  { labelKey: "DOCUMENT_FEE_DEDUCTION", field: "documentFeeDeduction" },
] as const;

const getDeductionValue = (
  slip: PayrollRow,
  field: (typeof DEDUCTION_FIELDS)[number]["field"]
) => {
  const value = slip[field];
  if (field === "documentFeeDeduction" && value == null) {
    return num(slip.deduction_amount);
  }
  return num(value);
};

const getTotalDeduction = (slip: PayrollRow) =>
  DEDUCTION_FIELDS.reduce(
    (sum, item) => sum + getDeductionValue(slip, item.field),
    0
  );

const getNetIncome = (slip: PayrollRow) =>
  num(slip.gross_income) - getTotalDeduction(slip);

const toMonthValue = (date: Date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthRange = (monthValue: string) => {
  const [year, month] = monthValue.split("-").map(Number);
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: new Date(year, month, 0).toISOString().slice(0, 10),
    month,
    year,
  };
};

const THIS_MONTH = toMonthValue(new Date());
const lastMonthDate = new Date();
lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
const LAST_MONTH = toMonthValue(lastMonthDate);

// ... (rest of the file remains same, just replacing the useQuery fetch part)

// 1. ชุดคำแปลที่สมบูรณ์ (Myanmar Translations) — Synchronized keys
const PAYROLL_TRANSLATIONS: Record<string, { th: string; mm: string }> = {
  EMPLOYEE_CODE: { th: "รหัสพนักงาน", mm: "ဝန်ထမ်းနံပါတ်" },
  EMPLOYEE_NAME: { th: "ชื่อพนักงาน", mm: "အမည်" },
  BRANCH: { th: "สาขา", mm: "ဌာန" },
  PERIOD: { th: "งวด", mm: "ကာလ" },
  INCOME: { th: "รายรับ", mm: "ဝင်ငွေ" },
  AMOUNT: { th: "จำนวนเงิน", mm: "ငွေပမာဏ" },
  DEDUCTION: { th: "หักเงิน", mm: "ဖြတ်တောက်ငွေ" },
  DEDUCTIONS_SUMMARY: { th: "รายการหักและสรุป", mm: "ဖြတ်တောက်မှုและအကျဉ်းချုပ်" },
  BASE_INCOME: { th: "รายได้พื้นฐาน", mm: "အခြေခံဝင်ငွေ" },
  NORMAL_WAGE: { th: "ค่าจ้างปกติ", mm: "အခြေခံလုပ်အားခ" },
  WORK_DAY_COUNT: { th: "จำนวนวัน", mm: "အလုပ်ရက်" },
  DAILY_WAGE: { th: "ค่าจ้างวันละ", mm: "တစ်ရက်လုပ်အားခ" },
  PERIOD_START: { th: "งวดวันที่เริ่ม", mm: "ကာလအစ" },
  PERIOD_END: { th: "งวดวันที่สิ้นสุด", mm: "ကာလအဆုံး" },
  SHIFT_ALLOWANCE: { th: "ค่ากะ", mm: "အဆိုင်းကြေး" },
  FOOD_ALLOWANCE: { th: "ค่าข้าว", mm: "အစားအသောက်ကြေး" },
  OT1: { th: "OT 1", mm: "အချိန်ပို ၁" },
  OT: { th: "OT", mm: "အချိန်ပို" },
  OT15: { th: "OT 1.5", mm: "အချိန်ပို ၁.၅" },
  OT2: { th: "OT 3", mm: "အချိန်ပို ၃" },
  OT_HOURS: { th: "OT (ชั่วโมง)", mm: "အချိန်ပို (နာရီ)" },
  OTHER_ALLOWANCE: { th: "รายรับอื่นๆ", mm: "အခြားထောက်ပံ့ကြေး" },
  DEDUCTION_PENDING: { th: "รายการหักรอสรุป", mm: "ဖြတ်တောက်မှုစောင့်ဆိုင်း" },
  INSURANCE_DEDUCTION: { th: "ประกัน", mm: "အာမခံ" },
  EMPLOYER_CHANGE_DEDUCTION: { th: "เปลี่ยนนายจ้าง", mm: "အလုပ်ရှင်ပြောင်း" },
  REPORT_90_DAYS_DEDUCTION: { th: "รายงานตัว 90 วัน", mm: "ရက် 90 အစီရင်ခံ" },
  REGISTRATION_DEDUCTION: { th: "ขึ้นทะเบียน", mm: "မှတ်ပုံတင်" },
  EXTENSION_DEDUCTION: { th: "ต่อมติ", mm: "သက်တမ်းတိုး" },
  ABSENT_DEDUCTION: { th: "ขาดงาน", mm: "အလုပ်ပျက်" },
  TRANSPORT_DEDUCTION: { th: "ค่ารถรับ-ส่ง", mm: "ကြိုပို့ကားခ" },
  DOCUMENT_FEE_DEDUCTION: { th: "ค่าเนินการเอกสาร", mm: "စာရွက်စာတမ်းကြေး" },
  WORK_DAYS: { th: "วันทำงาน", mm: "အလုပ်ဆင်းရက်" },
  TOTAL_INCOME: { th: "รวมรายได้", mm: "စုစုပေါင်းဝင်ငွေ" },
  TOTAL_DEDUCTION: { th: "รวมรายการหัก", mm: "စုစုပေါင်းဖြတ်တောက်ငွေ" },
  NET_INCOME: { th: "เงินสุทธิที่ได้รับ", mm: "အသားတင်ရငွေ" },
  NET_PAYABLE_BOX: { th: "ยอดเงินสุทธิ", mm: "စုစုပေါင်းအသားတင်ရငွေ" },
  RECEIVER_SIGNATURE: { th: "ลายมือชื่อผู้รับเงิน", mm: "လက်ခံသူလက်မှတ်" },
  AUTHORIZED_SIGNATURE: { th: "ผู้อนุมัติจ่ายเงิน", mm: "ခွင့်ပြုသူလက်မှတ်" },
  DATE_LABEL: { th: "วันที่", mm: "ရက်စွဲ" },
  };

// 2. ฟังก์ชัน getLabel สำหรับ SlipTemplate
const getLabel = (key: string, lang: PayrollLanguage) => {
  const normalizedKey = key.toUpperCase();
  const item = PAYROLL_TRANSLATIONS[normalizedKey];

  if (!item) return key;

  const isDual = lang === "dual";

  if (isDual) {
    return `${item.th} / ${item.mm}`;
  }

  if (lang === "mm") {
    return item.mm;
  }

  return item.th;
};

/**
 * SlipTemplate — Optimized for Display (RESTORED TO ORIGINAL)
 */
function SlipTemplate({
  slip,
  payDate,
  month,
  year,
  periodStart,
  periodEnd,
  lang = "th",
}: {
  slip: PayrollRow;
  payDate?: string;
  month: number;
  year: number;
  periodStart?: string;
  periodEnd?: string;
  lang?: PayrollLanguage;
}) {
  const isDual = lang === "dual";
  const formatVal = (v: number | string | undefined | null) => num(v).toLocaleString("en-US", { minimumFractionDigits: 2 });
  const dailyWage = num(slip.work_days) > 0 ? num(slip.base_income) / num(slip.work_days) : 0;
  const deductionRows = DEDUCTION_FIELDS.map((item) => ({
    label: getLabel(item.labelKey, lang),
    value: getDeductionValue(slip, item.field),
  }));
  const totalDeduction = getTotalDeduction(slip);
  const netIncome = getNetIncome(slip);

  return (
    <div 
      className="payslip-document mx-auto w-full max-w-[950px] overflow-hidden border border-black bg-white p-6 pb-8 text-black"
      style={{ 
        fontFamily: "'Noto Sans Myanmar', 'Sarabun', Arial, sans-serif",
        color: '#000000',
        backgroundColor: '#ffffff',
        boxSizing: "border-box"
      }}
    >
      {/* Header */}
      <div className="grid grid-cols-3 items-start mb-10">
        <div className="pt-2">
          <p className="text-[10px] text-gray-700 leading-tight">
            88/88 Moo 1, Bang Phli, Samut Prakan, Thailand 10540
          </p>
        </div>

        <div className="text-center text-[#1e3a8a]">
          <h1 className="text-3xl font-black tracking-tight">PAY SLIP</h1>
          <p className="text-xs font-bold leading-tight whitespace-normal">
            {lang === "mm" ? "လစာမှတ်တမ်း" : (isDual ? "ใบแจ้งยอดเงินเดือนนี้ / လစာမှတ်တမ်း" : "ใบแจ้งยอดเงินเดือนนี้")}
          </p>
        </div>

        <div />
      </div>

      <div className="h-[1px] bg-gray-400 mb-4" />

      {/* Info Bar */}
      <div className={cn(
        "grid bg-gray-100 border border-gray-400 mb-0 text-[12px] text-black",
        isDual ? "grid-cols-2 md:grid-cols-4" : "grid-cols-4"
      )}>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("EMPLOYEE_CODE", lang)}:</span>
          <span className="font-semibold whitespace-normal break-words">{slip.employee_code}</span>
        </div>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("EMPLOYEE_NAME", lang)}:</span>
          <div className="font-semibold whitespace-normal break-words">
            <EmployeeProfileName
              employeeCode={slip.employee_code}
              employee_name={slip.employee_name}
              employee_profile_status={slip.employee_profile_status}
            />
          </div>
        </div>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("BRANCH", lang)}:</span>
          <span className="font-semibold whitespace-normal break-words">{slip.branch_code}</span>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("PERIOD", lang)}:</span>
          <span className="font-semibold whitespace-normal break-words">{payDate || `${month}/${year}`}</span>
        </div>
      </div>

      <div className={cn(
        "grid bg-white border border-gray-400 border-t-0 mb-6 text-[12px] text-black",
        isDual ? "grid-cols-2 md:grid-cols-4" : "grid-cols-4"
      )}>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("WORK_DAY_COUNT", lang)}:</span>
          <span className="font-semibold">{num(slip.work_days)}</span>
        </div>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("DAILY_WAGE", lang)}:</span>
          <span className="font-semibold">{formatVal(dailyWage)}</span>
        </div>
        <div className="px-3 py-2 border-r border-gray-400 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("PERIOD_START", lang)}:</span>
          <span className="font-semibold">{periodStart || "-"}</span>
        </div>
        <div className="px-3 py-2 flex flex-col gap-1">
          <span className="font-bold leading-snug whitespace-normal break-words">{getLabel("PERIOD_END", lang)}:</span>
          <span className="font-semibold">{periodEnd || "-"}</span>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="flex gap-2 text-[12px] text-black">
        {/* Earnings */}
        <div className="flex-1">
          <table className="w-full border-collapse border border-black">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="py-3 px-2 text-left border-r border-black font-bold text-[11px] leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("INCOME", lang)}</th>
                <th className="py-3 px-2 text-right w-32 font-bold text-[11px] leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("AMOUNT", lang)}</th>
              </tr>
            </thead>
            <tbody>
              {[
                [getLabel("NORMAL_WAGE", lang), formatVal(slip.base_income)],
                [getLabel("SHIFT_ALLOWANCE", lang), "0.00"],
                [getLabel("FOOD_ALLOWANCE", lang), "0.00"],
                [getLabel("OT1", lang), "0.00"],
                [getLabel("OT15", lang), formatVal(slip.ot15_income)],
                [getLabel("OT2", lang), formatVal(slip.ot2_income)],
                [getLabel("OTHER_ALLOWANCE", lang), "0.00"],
              ].map(([label, value], index) => (
                <tr key={String(label)} className={index % 2 === 1 ? "border-b border-black bg-gray-50 min-h-[34px]" : "border-b border-black min-h-[34px]"}>
                  <td className="py-2 px-2 border-r border-black align-top leading-snug whitespace-normal break-words">{label}</td>
                  <td className="py-2 px-2 text-right font-bold align-top leading-snug">{value}</td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-bold border-t border-black min-h-[38px]">
                <td className="py-3 px-2 border-r border-black text-[#1e3a8a] uppercase align-top leading-snug whitespace-normal break-words">{getLabel("TOTAL_INCOME", lang)}</td>
                <td className="py-3 px-2 text-right text-[#1e3a8a] align-top leading-snug">{formatVal(slip.gross_income)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Deductions */}
        <div className="flex-1">
          <table className="w-full border-collapse border border-black">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="py-3 px-2 text-left border-r border-black font-bold text-[11px] leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("DEDUCTIONS_SUMMARY", lang)}</th>
                <th className="py-3 px-2 text-right w-32 font-bold text-[11px] leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("AMOUNT", lang)}</th>
              </tr>
            </thead>
            <tbody>
              {deductionRows.map((item, index) => (
                <tr key={item.label} className={index % 2 === 1 ? "border-b border-black bg-gray-50 min-h-[34px]" : "border-b border-black min-h-[34px]"}>
                  <td className="py-2 px-2 border-r border-black align-top leading-snug whitespace-normal break-words">{item.label}</td>
                  <td className="py-2 px-2 text-right font-bold align-top leading-snug">{formatVal(item.value)}</td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-bold border-t border-black text-red-700 min-h-[44px]">
                <td className="py-3 px-2 border-r border-black uppercase align-top leading-snug whitespace-normal break-words">{getLabel("TOTAL_DEDUCTION", lang)}</td>
                <td className="py-3 px-2 text-right align-top leading-snug">{formatVal(totalDeduction)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Net Pay Box */}
      <div className="flex justify-center mt-8">
        <div className="flex border-2 border-[#1e3a8a] min-w-[450px]">
          <div className="bg-[#1e3a8a] text-white px-6 py-4 flex flex-col justify-center w-[220px]">
            <span className="text-[10px] font-bold uppercase tracking-widest leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("NET_PAYABLE_BOX", lang)}</span>
            <span className="text-[10px] font-bold leading-snug whitespace-normal" style={{ color: '#ffffff' }}>{getLabel("NET_INCOME", lang)}</span>
          </div>
          <div className="flex-1 px-8 py-4 flex items-center justify-end gap-3 bg-white">
            <span className="text-4xl font-black text-[#1e3a8a]">{formatVal(netIncome)}</span>
            <span className="text-sm font-bold text-[#1e3a8a] self-end mb-1">THB</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-2 mt-6 mb-4 text-[11px] text-black px-10">
        <div className="text-center">
          <div className="w-56 h-[1px] bg-black mx-auto mb-2" />
          <p className="font-bold leading-snug whitespace-normal break-words">{getLabel("RECEIVER_SIGNATURE", lang)}</p>
          <p className="mt-1 font-bold leading-snug whitespace-normal break-words">{getLabel("DATE_LABEL", lang)}: ......../......../........</p>
        </div>
        <div className="text-center">
          <div className="w-56 h-[1px] bg-black mx-auto mb-2" />
          <p className="font-bold leading-snug whitespace-normal break-words">{getLabel("AUTHORIZED_SIGNATURE", lang)}</p>
          <p className="mt-1 font-bold leading-snug whitespace-normal break-words">{getLabel("DATE_LABEL", lang)}: ......../......../........</p>
        </div>
      </div>

      <div className="text-center text-[10px] text-gray-500 mt-4 italic">
        * This is a computer-generated document. Digital verification is authorized.
      </div>
    </div>
  );
}

export default function Payroll() {
  const queryClient = useQueryClient();
  const userRole = normalizeRole(useAuth((s) => s.user?.role));
  const isCydAdmin = userRole === "cyd_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCompanyId = searchParams.get("companyId") ?? "";
  const selectedCompanyNumber = parsePayrollCompanyId(selectedCompanyId);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(THIS_MONTH);
  const [payrollScope, setPayrollScope] = useState<"ready" | "all">("ready");

  const selectedRange = getMonthRange(selectedMonth);
  const payrollMonth = selectedRange.month;
  const payrollYear = selectedRange.year;

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<PayrollRow | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [language, setLanguage] = useState<PayrollLanguage>("dual");

  const [selectedCompany, setSelectedCompany] = useState("");
  const [payDate, setPayDate] = useState("");
  const [lockStartDate, setLockStartDate] = useState("");
  const [lockEndDate, setLockEndDate] = useState("");
  const [lockingPayroll, setLockingPayroll] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const slipRef = useRef<HTMLDivElement | null>(null);

  const waitForSlipFonts = async () => {
    try {
      await Promise.all([
        document.fonts.load('400 12px "Sarabun"'),
        document.fonts.load('700 12px "Sarabun"'),
        document.fonts.load('400 12px "Noto Sans Myanmar"'),
        document.fonts.load('700 12px "Noto Sans Myanmar"'),
      ]);
      await document.fonts.ready;
    } catch (fe) {
      console.warn("Font loading timed out or failed, proceeding anyway", fe);
    }
  };

  const renderSlipElementForPdf = async (row: PayrollRow) => {
    await waitForSlipFonts();

    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = "1000px";
    host.style.height = "auto";
    host.style.overflow = "visible";
    host.style.background = "#ffffff";
    host.style.opacity = "1";
    host.style.visibility = "visible";
    document.body.appendChild(host);

    let root: Root | null = createRoot(host);
    try {
      root.render(
        <SlipTemplate
          slip={row}
          payDate={payDate}
          month={payrollMonth}
          year={payrollYear}
          periodStart={selectedRange.startDate}
          periodEnd={selectedRange.endDate}
          lang={language}
        />
      );

      // Allow React + CSS to fully paint before capture
      await new Promise((resolve) => setTimeout(resolve, 150));

      const element = host.firstElementChild as HTMLElement | null;
      if (!element) {
        throw new Error("Payslip render failed");
      }

      return {
        element,
        cleanup: () => {
          root?.unmount();
          root = null;
          host.remove();
        },
      };
    } catch (error) {
      root.unmount();
      host.remove();
      throw error;
    }
  };

  const { data: scopedCompanies = [] } = useQuery({
    queryKey: ["companies", "payroll-scope"],
    queryFn: getCompanies,
    enabled: isCydAdmin,
  });

  const { data: availableMonths = [] } = useQuery({
    queryKey: ["available-months", selectedCompanyId],
    queryFn: () => getAvailableMonths(isCydAdmin ? Number(selectedCompanyId) : undefined),
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  const { data: availableDates = [], isLoading: loadingDates } = useQuery({
    queryKey: ["available-dates", selectedMonth, selectedCompanyId],
    queryFn: () => getAvailableDates(selectedMonth, isCydAdmin ? Number(selectedCompanyId) : undefined),
    enabled: !isCydAdmin || Boolean(selectedCompanyId),
  });

  useEffect(() => {
    if (availableDates.length > 0) {
      // Auto-select latest date (first in sorted list from backend)
      setPayDate(availableDates[0]);
    } else {
      setPayDate("");
    }
  }, [availableDates]);

  useEffect(() => {
    setSelectedSlip(null);
    setIsPreviewOpen(false);
  }, [selectedCompanyId, selectedMonth, payrollScope]);

  const allMonthOptions = useMemo(() => {
    const months = new Set([THIS_MONTH, LAST_MONTH, ...availableMonths]);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [availableMonths]);

  const canSeeAllRecords = canViewAllPayrollRecords(userRole);
  const payrollQueryEnabled =
    !isCydAdmin || selectedCompanyNumber !== undefined;

  const {
    data: rows = [],
    isLoading: loading,
    isFetching: fetching,
    isError,
    error: payrollError,
    refetch: refetchPayroll,
  } = useQuery({
    queryKey: payrollQueryKey({
      startDate: selectedRange.startDate,
      endDate: selectedRange.endDate,
      scope: payrollScope,
      companyId: selectedCompanyId,
      language,
      paymentDate: payDate,
    }),
    queryFn: () => fetchPayrollSummary({
      startDate: selectedRange.startDate,
      endDate: selectedRange.endDate,
      includeDraft: payrollScope === "all",
      companyId: isCydAdmin ? selectedCompanyNumber : undefined,
    }),
    enabled: payrollQueryEnabled,
    retry: payrollQueryRetry,
  });

  const shouldCheckDraftRows =
    canSeeAllRecords &&
    payrollQueryEnabled &&
    payrollScope === "ready" &&
    !loading &&
    !isError &&
    rows.length === 0;
  const {
    data: allScopeRows = [],
    isLoading: loadingAllScopeRows,
    isError: allScopeError,
    refetch: refetchAllScopeRows,
  } = useQuery({
    queryKey: payrollQueryKey({
      startDate: selectedRange.startDate,
      endDate: selectedRange.endDate,
      scope: "all",
      companyId: selectedCompanyId,
      language,
      paymentDate: payDate,
    }),
    queryFn: () => fetchPayrollSummary({
      startDate: selectedRange.startDate,
      endDate: selectedRange.endDate,
      includeDraft: true,
      companyId: isCydAdmin ? selectedCompanyNumber : undefined,
    }),
    enabled: shouldCheckDraftRows,
    retry: payrollQueryRetry,
  });

  const canLockPayroll = userRole === "admin" || userRole === "accounting";
  const defaultPeriodStart = selectedRange.startDate;
  const defaultPeriodEnd = selectedRange.endDate;

  const companies = Array.from(
    new Set(rows.map((r) => r.branch_code).filter(Boolean))
  );

  const filteredRows = selectedCompany
    ? rows.filter((r) => r.branch_code === selectedCompany)
    : rows;

  const totalNet = filteredRows.reduce((s, r) => s + getNetIncome(r), 0);
  const missingProfileRows = filteredRows.filter(isEmployeeProfileMissing);
  const hasMissingProfiles = missingProfileRows.length > 0;

  const warnMissingProfile = () =>
    toast.warning(
      "พบรายการลงเวลาที่ไม่เชื่อมโยงกับข้อมูลพนักงาน กรุณาติดต่อผู้ดูแลระบบ"
    );

  const handlePrint = () => {
    if (selectedSlip && isEmployeeProfileMissing(selectedSlip)) {
      warnMissingProfile();
      return;
    }
    window.print();
  };

  const handleDownload = async () => {
    if (!selectedSlip) return;
    if (isEmployeeProfileMissing(selectedSlip)) {
      warnMissingProfile();
      return;
    }
    setDownloadingId(selectedSlip.employee_code);

    try {
      if (slipRef.current) {
         await waitForSlipFonts();
         const blob = await generatePayrollSlipPdfFromElement(slipRef.current);
         downloadBlob(blob, `payslip-${selectedSlip.employee_code}.pdf`);
         toast.success("ดาวน์โหลด PDF สำเร็จ");
      }
    } catch (e) {
      console.error("PDF ERROR:", e);
      toast.error("สร้างสลิปไม่สำเร็จ");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadRow = async (row: PayrollRow) => {
    if (isEmployeeProfileMissing(row)) {
      warnMissingProfile();
      return;
    }
    setDownloadingId(row.employee_code);
    let renderedSlip: Awaited<ReturnType<typeof renderSlipElementForPdf>> | null = null;
    try {
      renderedSlip = await renderSlipElementForPdf(row);
      const blob = await generatePayrollSlipPdfFromElement(renderedSlip.element);
      downloadBlob(blob, `payslip-${row.employee_code}.pdf`);
      toast.success("ดาวน์โหลด PDF สำเร็จ");
    } catch (e) {
      toast.error("สร้างสลิปไม่สำเร็จ");
    } finally {
      renderedSlip?.cleanup();
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!payDate) {
      toast.error("กรุณาเลือกวันที่ก่อน");
      return;
    }
    if (filteredRows.length === 0) {
      toast.error("ไม่พบข้อมูลเงินเดือนสำหรับวันที่เลือก");
      return;
    }
    if (hasMissingProfiles) {
      warnMissingProfile();
      return;
    }
    setBulkDownloading(true);
    try {
      const pdf = createPayrollPdfDocument();
      for (let i = 0; i < filteredRows.length; i++) {
        let renderedSlip: Awaited<ReturnType<typeof renderSlipElementForPdf>> | null = null;
        try {
          renderedSlip = await renderSlipElementForPdf(filteredRows[i]);
          await addPayrollSlipElementToPdf(pdf, renderedSlip.element, { addPage: i > 0 });
        } finally {
          renderedSlip?.cleanup();
        }
      }
      downloadBlob(pdf.output("blob"), `payroll-${payDate}.pdf`);
      toast.success("ดาวน์โหลดสำเร็จ");
    } catch (e) {
      toast.error("สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBulkDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="page-shell">
        <PageHeader
          title="เงินเดือน"
          description={`ตรวจสอบรายได้ รายการหัก และเงินสุทธิ ประจำเดือน ${payrollMonth}/${payrollYear}`}
          icon={Wallet}
        />

        <Card className="soft-panel">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.15fr_auto_1fr_auto] xl:items-end">
            <div className="flex flex-col gap-1 min-w-[150px]">
               <label className="text-sm font-semibold text-foreground">ขอบเขตข้อมูล</label>
               <select
                 value={payrollScope}
                 onChange={(e) => setPayrollScope(e.target.value as "ready" | "all")}
                 className="field-control"
               >
                 <option value="ready">พร้อมคำนวณเงินเดือน</option>
                 {canSeeAllRecords && <option value="all">ทุกรายการ รวมฉบับร่าง</option>}
               </select>
            </div>

            <div className="flex flex-col gap-1 min-w-[180px]">
               <label className="text-sm font-semibold text-foreground">เลือกเดือน</label>
               <select
                 value={selectedMonth}
                 onChange={(e) => {
                   setSelectedMonth(e.target.value);
                   setSelectedCompany("");
                 }}
                 className="field-control"
               >
                 {allMonthOptions.map((m) => (
                   <option key={m} value={m}>
                     {m === THIS_MONTH ? `เดือนนี้ (${m})` : m === LAST_MONTH ? `เดือนที่แล้ว (${m})` : m}
                   </option>
                 ))}
               </select>
            </div>

            <div className="flex flex-col gap-1">
               <label className="text-sm font-semibold text-foreground">ภาษาสลิป</label>
               <div className="flex min-h-11 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
                  <Languages className="h-4 w-4 mx-2 text-slate-400" />
                  {["th", "mm", "dual"].map((l) => (
                    <button 
                     key={l}
                     onClick={() => setLanguage(l as PayrollLanguage)}
                     className={cn("min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold uppercase", language === l ? "bg-[linear-gradient(135deg,#0D9488,#2563EB)] text-white shadow-sm" : "text-slate-500 hover:bg-teal-50")}
                    >{l === "th" ? "ไทย" : l === "mm" ? "เมียนมา" : "สองภาษา"}</button>
                  ))}
               </div>
            </div>
{/* 
            <div className="flex flex-col gap-1 min-w-[150px]">
               <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">บริษัท</label>
               <select
                 value={selectedCompany}
                 onChange={(e) => setSelectedCompany(e.target.value)}
                 className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-primary/20"
               >
                 <option value="">เลือกบริษัท</option>
                 {companies.map((c) => <option key={c} value={c}>{c}</option>)}
               </select>
            </div> */}

            <div className="flex flex-col gap-1 min-w-[150px]">
               <label className="text-sm font-semibold text-foreground">วันที่จ่าย</label>
               <select
                 value={payDate}
                 onChange={(e) => setPayDate(e.target.value)}
                 className="field-control"
               >
                 <option value="">เลือกวันที่</option>
                 {availableDates.map((d) => (
                   <option key={d} value={d}>{d}</option>
                 ))}
               </select>
            </div>

            <div className="flex items-end">
              <Button onClick={handleDownloadAll} disabled={!payDate || bulkDownloading || rows.length === 0 || hasMissingProfiles} className="w-full xl:w-auto">
                {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                PDF ทั้งหมด
              </Button>
            </div>
          </div>
        </Card>

        {isCydAdmin && (
          <Card className="soft-panel">
            <label htmlFor="payroll-company" className="text-sm font-semibold text-foreground">บริษัทที่ต้องการดูข้อมูล</label>
            <select id="payroll-company" value={selectedCompanyId} onChange={(event) => setSearchParams(event.target.value ? { companyId: event.target.value } : {})} className="field-control mt-2">
              <option value="">เลือกบริษัท</option>
              {scopedCompanies.map((company: { id: number; company_name: string }) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </Card>
        )}

        {hasMissingProfiles && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-900"
          >
            พบรายการลงเวลาที่ไม่เชื่อมโยงกับข้อมูลพนักงาน กรุณาติดต่อผู้ดูแลระบบ
          </div>
        )}

        {isError && (
          <div className="space-y-3">
            <PayrollErrorNotice error={payrollError} role={userRole} />
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={() => refetchPayroll()}>
                ลองใหม่
              </Button>
            </div>
          </div>
        )}

        {!isError && (
        <Card className="surface-card overflow-hidden">
          <div className="flex items-center justify-between p-5 sm:p-6">
             <h2 className="font-bold text-foreground">รายการพนักงาน ({filteredRows.length})</h2>
             <Badge className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
               {payrollScope === "ready" ? "พร้อมคำนวณเงินเดือน" : "ทุกรายการ"}
             </Badge>
          </div>
          <div className="overflow-x-auto font-['Sarabun',_'Noto_Sans_Myanmar',_sans-serif]">
            {isCydAdmin && !selectedCompanyId ? (
              <div className="p-8 text-center text-muted-foreground">กรุณาเลือกบริษัท</div>
            ) : isCydAdmin && selectedCompanyNumber === undefined ? (
              <div role="alert" className="p-8 text-center text-red-700">
                รหัสบริษัทไม่ถูกต้อง
              </div>
            ) : loading || fetching || loadingAllScopeRows ? (
              <div className="flex items-center justify-center gap-2 p-8 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                กำลังโหลดข้อมูลเงินเดือน
              </div>
            ) : filteredRows.length === 0 &&
              payrollScope === "ready" &&
              allScopeRows.length > 0 ? (
              <div className="p-8 text-center text-amber-800">
                ยังไม่มีรายการที่พร้อมทำเงินเดือน พบรายการฉบับร่างจำนวน{" "}
                {allScopeRows.length} รายการ กรุณาอนุมัติหรือเปลี่ยน Scope เป็น All Records
              </div>
            ) : allScopeError ? (
              <div role="alert" className="space-y-3 p-8 text-center text-red-700">
                <p>ไม่สามารถตรวจสอบรายการฉบับร่างได้ กรุณาลองใหม่</p>
                <Button type="button" variant="outline" onClick={() => refetchAllScopeRows()}>
                  ลองใหม่
                </Button>
              </div>
            ) : filteredRows.length === 0 && !allScopeError ? (
              <div className="p-8 text-center text-slate-600">
                ไม่พบข้อมูลบันทึกหน้างานของบริษัทนี้ในเดือนที่เลือก
              </div>
            ) : (
            <table className="w-full">
              <thead className="bg-muted text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                <tr>
                  <th className="py-4 px-6 text-left">Code</th>
                  <th className="py-4 px-6 text-left">พนักงาน</th>
                  <th className="py-4 px-6 text-right">วันทำงาน</th>
                  <th className="py-4 px-6 text-right">OT</th>
                  <th className="py-4 px-6 text-right">เงินสุทธิ</th>
                  <th className="py-4 px-6 text-right">สลิป</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((row) => (
                  <tr key={row.employee_code} className="transition-colors hover:bg-muted/50">
                    <td className="py-4 px-6 font-mono text-xs font-bold text-muted-foreground">{row.employee_code}</td>
                    <td className="py-4 px-6">
                      <EmployeeProfileName
                        employeeCode={row.employee_code}
                        employee_name={row.employee_name}
                        employee_profile_status={row.employee_profile_status}
                      />
                    </td>
                    <td className="py-4 px-6 text-right text-foreground">{num(row.work_days)}</td>
                    <td className="py-4 px-6 text-right font-medium text-indigo-600 dark:text-indigo-300">{num(row.total_ot_hours)}</td>
                    <td className="py-4 px-6 text-right font-black text-indigo-600 dark:text-sky-300">{formatTHB(getNetIncome(row))}</td>
                    <td className="py-4 px-6 text-right flex justify-end gap-2">
                       <Button size="sm" variant="outline" onClick={() => { setSelectedSlip(row); setIsPreviewOpen(true); }} className="rounded-xl border-border text-primary hover:bg-primary/10">
                         <Eye className="h-4 w-4" />
                       </Button>
                       <Button size="sm" variant="outline" disabled={isEmployeeProfileMissing(row)} onClick={() => handleDownloadRow(row)} className="rounded-xl border-border text-primary hover:bg-primary/10">
                         <Download className="h-4 w-4" />
                       </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </Card>
        )}
      </div>

      {selectedSlip && (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto", !isPreviewOpen && "hidden")}>
          <div className="relative w-full max-w-[1000px] rounded-2xl bg-card p-4 text-card-foreground shadow-2xl sm:p-8">
            <div className="absolute right-8 top-8 flex gap-3 z-10 no-print">
               <Button variant="secondary" onClick={() => { setIsPreviewOpen(false); setSelectedSlip(null); }} className="rounded-xl shadow-md border border-slate-200">ปิด</Button>
               <Button disabled={isEmployeeProfileMissing(selectedSlip)} onClick={handlePrint} variant="outline" className="rounded-xl border-blue-600 text-blue-600 hover:bg-blue-50 shadow-md">
                  <Printer className="h-4 w-4 mr-2" /> พิมพ์ / Save as PDF
               </Button>
               <Button disabled={isEmployeeProfileMissing(selectedSlip)} onClick={handleDownload} className="rounded-xl text-white shadow-lg">
                  <Download className="h-4 w-4 mr-2" /> ดาวน์โหลด PDF (Legacy)
               </Button>
            </div>
            {isEmployeeProfileMissing(selectedSlip) && (
              <div role="alert" className="mt-16 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900">
                พบรายการลงเวลาที่ไม่เชื่อมโยงกับข้อมูลพนักงาน กรุณาติดต่อผู้ดูแลระบบ
              </div>
            )}
            <div className="mt-4 overflow-x-hidden flex justify-center text-black">
              <div ref={slipRef} className="payslip-document print-only flex w-full justify-center">
                <SlipTemplate slip={selectedSlip} payDate={payDate} month={payrollMonth} year={payrollYear} periodStart={selectedRange.startDate} periodEnd={selectedRange.endDate} lang={language} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
