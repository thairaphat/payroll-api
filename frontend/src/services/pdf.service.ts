import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { SarabunRegular, SarabunBold } from "../assets/fonts/sarabun";
import { NotoSansMyanmarRegular, NotoSansMyanmarBold } from "../assets/fonts/notoSansMyanmar";

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

export type PayrollPdfData = {
  employee_code: string;
  employee_name: string;
  branch_code: string;
  work_days: number | string;
  total_ot_hours: number | string;
  total_ot1: number | string;
  total_ot15: number | string;
  total_ot2: number | string;
  base_income: number | string;
  ot15_income: number | string;
  ot2_income: number | string;
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
  slip: PayrollPdfData,
  field: (typeof DEDUCTION_FIELDS)[number]["field"]
) => {
  const value = slip[field];
  if (field === "documentFeeDeduction" && value == null) {
    return num(slip.deduction_amount);
  }
  return num(value);
};

const getTotalDeduction = (slip: PayrollPdfData) =>
  DEDUCTION_FIELDS.reduce(
    (sum, item) => sum + getDeductionValue(slip, item.field),
    0
  );

const getNetIncome = (slip: PayrollPdfData) =>
  num(slip.gross_income) - getTotalDeduction(slip);

export type PayrollLanguage = "th" | "mm" | "dual";

/**
 * Synchronized with Payroll.tsx for consistency
 */
export const PAYROLL_LABELS = {
  EMPLOYEE_CODE: { en: "Code", th: "รหัสพนักงาน", mm: "ဝန်ထမ်းနံပါတ်" },
  EMPLOYEE_NAME: { en: "Name", th: "ชื่อพนักงาน", mm: "အမည်" },
  BRANCH: { en: "Branch", th: "สาขา", mm: "ဌာန" },
  PERIOD: { en: "Period", th: "งวด", mm: "ကာလ" },
  EARNINGS: { en: "EARNINGS", th: "รายรับ", mm: "ဝင်ငွေ" },
  DEDUCTIONS_SUMMARY: { en: "DEDUCTIONS & SUMMARY", th: "รายการหักและสรุป", mm: "ဖြတ်တောက်မှုและအကျဉ်းချုပ်" },
  AMOUNT: { en: "AMOUNT", th: "จำนวนเงิน", mm: "ငွေပမာဏ" },
  BASE_INCOME: { en: "Base Income", th: "รายได้พื้นฐาน", mm: "အခြေခံဝင်ငွေ" },
  NORMAL_WAGE: { en: "Regular Wage", th: "ค่าจ้างปกติ", mm: "အခြေခံလုပ်အားခ" },
  WORK_DAY_COUNT: { en: "Days", th: "จำนวนวัน", mm: "အလုပ်ရက်" },
  DAILY_WAGE: { en: "Daily Wage", th: "ค่าจ้างวันละ", mm: "တစ်ရက်လုပ်အားခ" },
  PERIOD_START: { en: "Period Start", th: "งวดวันที่เริ่ม", mm: "ကာလအစ" },
  PERIOD_END: { en: "Period End", th: "งวดวันที่สิ้นสุด", mm: "ကာလအဆုံး" },
  SHIFT_ALLOWANCE: { en: "Shift Allowance", th: "ค่ากะ", mm: "အဆိုင်းကြေး" },
  FOOD_ALLOWANCE: { en: "Food Allowance", th: "ค่าข้าว", mm: "အစားအသောက်ကြေး" },
  OT1: { en: "OT 1", th: "OT 1", mm: "အချိန်ပို ၁" },
  OT15: { en: "OT 1.5", th: "OT 1.5", mm: "အချိန်ပို ၁.၅" },
  OT2: { en: "OT 3", th: "OT 3", mm: "အချိန်ပို ၃" },
  OT_HOURS: { en: "OT Hours", th: "OT (ชั่วโมง)", mm: "အချိန်ပို (နာရီ)" },
  OTHER_ALLOWANCE: { en: "Other Allowance", th: "รายรับอื่นๆ", mm: "အခြားထောက်ပံ့ကြေး" },
  DEDUCTION_DEBT: { en: "Deduction / Debt", th: "หักเงิน", mm: "ဖြတ်ตောက်ငွေ" },
  DEDUCTION_PENDING: { en: "Pending Deductions", th: "รายการหักรอสรุป", mm: "ဖြတ်တောက်မှုစောင့်ဆိုင်း" },
  INSURANCE_DEDUCTION: { en: "Insurance", th: "ประกัน", mm: "အာမခံ" },
  EMPLOYER_CHANGE_DEDUCTION: { en: "Employer Change", th: "เปลี่ยนนายจ้าง", mm: "အလုပ်ရှင်ပြောင်း" },
  REPORT_90_DAYS_DEDUCTION: { en: "90-Day Report", th: "รายงานตัว 90 วัน", mm: "ရက် 90 အစီရင်ခံ" },
  REGISTRATION_DEDUCTION: { en: "Registration", th: "ขึ้นทะเบียน", mm: "မှတ်ပုံတင်" },
  EXTENSION_DEDUCTION: { en: "Extension", th: "ต่อมติ", mm: "သက်တမ်းတိုး" },
  ABSENT_DEDUCTION: { en: "Absent", th: "ขาดงาน", mm: "အလုပ်ပျက်" },
  TRANSPORT_DEDUCTION: { en: "Transport", th: "ค่ารถรับ-ส่ง", mm: "ကြိုပို့ကားခ" },
  DOCUMENT_FEE_DEDUCTION: { en: "Document Fee", th: "ค่าเนินการเอกสาร", mm: "စာရွက်စာတမ်းကြေး" },
  WORK_DAYS: { en: "Work Days", th: "วันทำงาน", mm: "အလုပ်ဆင်းရက်" },
  TOTAL_EARNINGS: { en: "TOTAL EARNINGS", th: "รวมรายได้", mm: "စုစုပေါင်းဝင်ငွေ" },
  TOTAL_DEDUCTIONS: { en: "TOTAL DEDUCTIONS", th: "รวมรายการหัก", mm: "စုစုပေါင်းဖြတ်တောက်ငွေ" },
  NET_INCOME: { en: "NET INCOME", th: "เงินสุทธิที่ได้รับ", mm: "အသားတင်ရငွေ" },
  NET_PAYABLE_BOX: { en: "NET PAYABLE", th: "ยอดเงินสุทธิ", mm: "စုစုပေါင်းအသားတင်ရငွေ" },
  RECEIVER_SIGNATURE: { en: "Receiver Signature", th: "ลายมือชื่อผู้รับเงิน", mm: "လက်ခံသူလက်မှတ်" },
  AUTHORIZED_SIGNATURE: { en: "Authorized Signature", th: "ผู้อนุมัติจ่ายเงิน", mm: "ခွင့်ပြုသူလက်မှတ်" },
  DATE_LABEL: { en: "Date", th: "วันที่", mm: "ရက်စွဲ" },
};

/**
 * Standard label fetcher
 */
export const getLabelText = (key: keyof typeof PAYROLL_LABELS, lang: PayrollLanguage) => {
  const item = PAYROLL_LABELS[key];
  if (!item) return "";

  if (lang === "dual") {
    return `${item.th} / ${item.mm}`;
  }

  if (lang === "mm") {
    return item.mm;
  }

  return item.th;
};

/**
 * @deprecated Payroll downloads now capture the shared SlipTemplate DOM for WYSIWYG output.
 *
 * Premium Native PDF drawing (jsPDF)
 * Matching restored Preview layout (~950px equivalent)
 */
export const generateNativePayrollSlipPdf = async (
  slip: PayrollPdfData,
  payDate: string,
  month: number,
  year: number,
  existingPdf?: jsPDF,
  lang: PayrollLanguage = "th",
  periodStart?: string,
  periodEnd?: string
) => {
  const pdf = existingPdf || new jsPDF("l", "mm", "a4");

  // Setup Fonts
  pdf.addFileToVFS("Sarabun-Regular.ttf", SarabunRegular);
  pdf.addFileToVFS("Sarabun-Bold.ttf", SarabunBold);
  pdf.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  pdf.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");

  pdf.addFileToVFS("NotoSansMyanmar-Regular.ttf", NotoSansMyanmarRegular);
  pdf.addFileToVFS("NotoSansMyanmar-Bold.ttf", NotoSansMyanmarBold);
  pdf.addFont("NotoSansMyanmar-Regular.ttf", "NotoSansMyanmar", "normal");
  pdf.addFont("NotoSansMyanmar-Bold.ttf", "NotoSansMyanmar", "bold");

  // Use NotoSansMyanmar for dual/mm to ensure Myanmar characters render
  const primaryFont = (lang === "mm" || lang === "dual") ? "NotoSansMyanmar" : "Sarabun";
  pdf.setFont(primaryFont, "normal");

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 15;

  const formatCurrency = (val: number) => 
    val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dailyWage = num(slip.work_days) > 0 ? num(slip.base_income) / num(slip.work_days) : 0;

  // --- 1. Header ---
  pdf.setTextColor(30, 58, 138); // #1e3a8a
  pdf.setFontSize(18);
  pdf.setFont(primaryFont, "bold");

  pdf.setTextColor(70, 70, 70);
  pdf.setFontSize(9);
  pdf.setFont(primaryFont, "normal");
  pdf.text("88/88 Moo 1, Bang Phli, Samut Prakan, Thailand 10540", margin, y + 13);

  pdf.setTextColor(30, 58, 138);
  pdf.setFontSize(28);
  pdf.setFont(primaryFont, "bold");
  pdf.text("PAY SLIP", pageWidth / 2, y + 10, { align: "center" });

  const isDual = lang === "dual";
  pdf.setFontSize(11);
  const subHeader = lang === "mm" ? "လစာမှတ်တမ်း" : (isDual ? "ใบแจ้งยอดเงินเดือนนี้ / လစာမှတ်တမ်း" : "ใบแจ้งยอดเงินเดือนนี้");
  pdf.text(subHeader, pageWidth / 2, y + 18, { align: "center" });

  y += 28;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 6;

  // --- 2. Info Bar ---
  const rowHeight = (lang === "dual") ? 20 : 12;
  const infoBarHeight = rowHeight * 2;
  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, y, contentWidth, infoBarHeight, "F");
  pdf.setDrawColor(150, 150, 150);
  pdf.rect(margin, y, contentWidth, infoBarHeight, "S");

  const colW = contentWidth / 4;
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);

  const info = [
    { label: getLabelText("EMPLOYEE_CODE", lang), val: slip.employee_code, x: margin, row: 0 },
    { label: getLabelText("EMPLOYEE_NAME", lang), val: slip.employee_name, x: margin + colW, row: 0 },
    { label: getLabelText("BRANCH", lang), val: slip.branch_code, x: margin + colW * 2, row: 0 },
    { label: getLabelText("PERIOD", lang), val: payDate || String(month) + "/" + String(year), x: margin + colW * 3, row: 0 },
    { label: getLabelText("WORK_DAY_COUNT", lang), val: num(slip.work_days), x: margin, row: 1 },
    { label: getLabelText("DAILY_WAGE", lang), val: formatCurrency(dailyWage), x: margin + colW, row: 1 },
    { label: getLabelText("PERIOD_START", lang), val: periodStart || "-", x: margin + colW * 2, row: 1 },
    { label: getLabelText("PERIOD_END", lang), val: periodEnd || "-", x: margin + colW * 3, row: 1 },
  ];

  pdf.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
  info.forEach((item, i) => {
    const itemY = y + item.row * rowHeight;
    pdf.setFont(primaryFont, "bold");
    if (lang === "dual") {
      const wrappedLabel = pdf.splitTextToSize(item.label + ":", colW - 6);
      pdf.text(wrappedLabel, item.x + 3, itemY + 5);
      pdf.setFont(primaryFont, "normal");
      pdf.text(String(item.val), item.x + 3, itemY + 15);
    } else {
      pdf.text(item.label + ":", item.x + 3, itemY + 7.5);
      pdf.setFont(primaryFont, "normal");
      const labelWidth = pdf.getTextWidth(item.label + ": ");
      pdf.text(String(item.val), item.x + 3 + labelWidth, itemY + 7.5);
    }
    if (i % 4 > 0) pdf.line(item.x, itemY, item.x, itemY + rowHeight);
  });

  y += infoBarHeight + 8;

  // --- 3. Ledger Tables ---
  const tableWidth = (contentWidth / 2) - 2;
  const tableHeight = 85;

  pdf.setFillColor(50, 50, 50);
  pdf.rect(margin, y, tableWidth, 12, "F");
  pdf.rect(margin + tableWidth + 4, y, tableWidth, 12, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(lang === "dual" ? 8 : 10);
  pdf.setFont(primaryFont, "bold");
  
  // Header with wrapping for Dual
  const incomeHead = getLabelText("EARNINGS", lang);
  const incomeHeadWrapped = pdf.splitTextToSize(incomeHead, tableWidth - 35);
  pdf.text(incomeHeadWrapped, margin + 4, y + (incomeHeadWrapped.length > 1 ? 4.5 : 7.5));
  
  pdf.text(getLabelText("AMOUNT", lang), margin + tableWidth - 4, y + 7.5, { align: "right" });
  
  const dedHead = getLabelText("DEDUCTIONS_SUMMARY", lang);
  const dedHeadWrapped = pdf.splitTextToSize(dedHead, tableWidth - 35);
  pdf.text(dedHeadWrapped, margin + tableWidth + 8, y + (dedHeadWrapped.length > 1 ? 4.5 : 7.5));
  
  pdf.text(getLabelText("AMOUNT", lang), pageWidth - margin - 4, y + 7.5, { align: "right" });

  y += 12;
  pdf.setDrawColor(0, 0, 0);
  pdf.rect(margin, y, tableWidth, tableHeight, "S");
  pdf.rect(margin + tableWidth + 4, y, tableWidth, tableHeight, "S");

  // Vertical Divider for currency
  pdf.line(margin + tableWidth - 30, y, margin + tableWidth - 30, y + tableHeight);
  pdf.line(pageWidth - margin - 30, y, pageWidth - margin - 30, y + tableHeight);

  const earnings = [
    { label: getLabelText("NORMAL_WAGE", lang), val: num(slip.base_income) },
    { label: getLabelText("SHIFT_ALLOWANCE", lang), val: 0 },
    { label: getLabelText("FOOD_ALLOWANCE", lang), val: 0 },
    { label: getLabelText("OT1", lang), val: 0 },
    { label: getLabelText("OT15", lang), val: num(slip.ot15_income) },
    { label: getLabelText("OT2", lang), val: num(slip.ot2_income) },
    { label: getLabelText("OTHER_ALLOWANCE", lang), val: 0 },
  ];

  const deductions = DEDUCTION_FIELDS.map((item) => ({
    label: getLabelText(item.labelKey as keyof typeof PAYROLL_LABELS, lang),
    val: getDeductionValue(slip, item.field),
  }));
  const deductionRows = [...deductions];
  const rowH = tableHeight / deductionRows.length;
  pdf.setFontSize(lang === "dual" ? 8 : 9);
  for (let i = 0; i < deductionRows.length; i++) {
    const curY = y + (i * rowH);
    if (i < deductionRows.length - 1) {
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, curY + rowH, margin + tableWidth, curY + rowH);
      pdf.line(margin + tableWidth + 4, curY + rowH, pageWidth - margin, curY + rowH);
    }
    
    // Earnings
    if (earnings[i]) {
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(primaryFont, "normal");
      const wrappedLabel = pdf.splitTextToSize(earnings[i].label, tableWidth - 35);
      pdf.text(wrappedLabel, margin + 4, curY + (wrappedLabel.length > 1 ? 4 : 7.5));
      pdf.setFont(primaryFont, "bold");
      pdf.text(formatCurrency(Number(earnings[i].val)), margin + tableWidth - 4, curY + 7.5, { align: "right" });
    }

    // Deductions
    if (deductionRows[i]) {
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(primaryFont, "normal");
      const wrappedLabel = pdf.splitTextToSize(deductionRows[i].label, tableWidth - 35);
      pdf.text(wrappedLabel, margin + tableWidth + 8, curY + (wrappedLabel.length > 1 ? 3.2 : rowH / 2 + 1.5));
      pdf.setFont(primaryFont, "bold");
      pdf.text(formatCurrency(Number(deductionRows[i].val)), pageWidth - margin - 4, curY + rowH / 2 + 1.5, { align: "right" });
    }
  }

  y += tableHeight;

  // --- 4. Summaries ---
  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, y, tableWidth, 12, "F");
  pdf.rect(margin + tableWidth + 4, y, tableWidth, 12, "F");
  pdf.setDrawColor(0, 0, 0);
  pdf.rect(margin, y, tableWidth, 12, "S");
  pdf.rect(margin + tableWidth + 4, y, tableWidth, 12, "S");

  pdf.setTextColor(30, 58, 138);
  pdf.setFont(primaryFont, "bold");
  pdf.setFontSize(lang === "dual" ? 8 : 9);
  
  pdf.text(getLabelText("TOTAL_EARNINGS", lang), margin + 4, y + 7.5);
  pdf.text(formatCurrency(num(slip.gross_income)), margin + tableWidth - 4, y + 7.5, { align: "right" });

  pdf.text(getLabelText("TOTAL_DEDUCTIONS", lang), margin + tableWidth + 8, y + 7.5);
  pdf.setTextColor(180, 0, 0);
  pdf.text(formatCurrency(getTotalDeduction(slip)), pageWidth - margin - 4, y + 7.5, { align: "right" });

  y += 20;

  // --- 5. Net Pay Box ---
  const netW = 160;
  const netX = (pageWidth - netW) / 2;
  pdf.setDrawColor(30, 58, 138);
  pdf.setLineWidth(1);
  pdf.rect(netX, y, netW, 22, "S");
  
  pdf.setFillColor(30, 58, 138);
  pdf.rect(netX, y, 65, 22, "F");
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont(primaryFont, "bold");
  const netHead1 = getLabelText("NET_PAYABLE_BOX", lang);
  const netHead1Wrapped = pdf.splitTextToSize(netHead1, 60);
  pdf.text(netHead1Wrapped, netX + 5, y + (netHead1Wrapped.length > 1 ? 5 : 8));
  
  pdf.setFontSize(8);
  const netHead2 = getLabelText("NET_INCOME", lang);
  const netHead2Wrapped = pdf.splitTextToSize(netHead2, 60);
  pdf.text(netHead2Wrapped, netX + 5, y + 16);
  
  pdf.setTextColor(30, 58, 138);
  pdf.setFontSize(28);
  pdf.setFont(primaryFont, "bold");
  pdf.text(formatCurrency(getNetIncome(slip)), netX + netW - 15, y + 15, { align: "right" });
  pdf.setFontSize(12);
  pdf.text("THB", netX + netW - 5, y + 15, { align: "right" });

  y += 35;

  // --- 6. Signatures ---
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(0, 0, 0);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(9);
  pdf.setFont(primaryFont, "bold");

  const sigW = 75;
  const sigX1 = margin + 15;
  const sigX2 = pageWidth - margin - sigW - 15;

  pdf.line(sigX1, y, sigX1 + sigW, y);
  const sigLabel1 = getLabelText("RECEIVER_SIGNATURE", lang);
  const sigLabel1Wrapped = pdf.splitTextToSize(sigLabel1, sigW);
  pdf.text(sigLabel1Wrapped, sigX1 + sigW/2, y + 5, { align: "center" });
  pdf.text(getLabelText("DATE_LABEL", lang) + ": ......../......../........", sigX1 + sigW/2, y + (sigLabel1Wrapped.length > 1 ? 12 : 10), { align: "center" });

  pdf.line(sigX2, y, sigX2 + sigW, y);
  const sigLabel2 = getLabelText("AUTHORIZED_SIGNATURE", lang);
  const sigLabel2Wrapped = pdf.splitTextToSize(sigLabel2, sigW);
  pdf.text(sigLabel2Wrapped, sigX2 + sigW/2, y + 5, { align: "center" });
  pdf.text(getLabelText("DATE_LABEL", lang) + ": ......../......../........", sigX2 + sigW/2, y + (sigLabel2Wrapped.length > 1 ? 12 : 10), { align: "center" });

  pdf.setFontSize(8);
  pdf.setFont(primaryFont, "normal");
  pdf.setTextColor(150, 150, 150);
  pdf.text("* This is a computer-generated document. Digital verification is authorized.", pageWidth/2, y + 25, { align: "center" });

  if (!existingPdf) return pdf.output("blob");
  return pdf;
};

/**
 * Robust High-Quality html2canvas method
 */
export const generatePayrollSlipPdfFromElement = async (
  element: HTMLElement
) => {
  const pdf = new jsPDF("l", "mm", "a4");
  await addPayrollSlipElementToPdf(pdf, element);
  return pdf.output("blob");
};

export const addPayrollSlipElementToPdf = async (
  pdf: jsPDF,
  element: HTMLElement,
  options: { addPage?: boolean } = {}
) => {
  const canvas = await html2canvas(element, {
    scale: 3,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: true,
    logging: false,
    foreignObjectRendering: false,
    removeContainer: false,
    onclone: (_doc, clonedEl) => {
      clonedEl.style.opacity = "1";
      clonedEl.style.visibility = "visible";
      clonedEl.style.overflow = "visible";
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.debug("[pdf] canvas size:", canvas.width, "×", canvas.height);
  }

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdfWidth = 297;
  const pdfHeight = 210;
  const margin = 0;
  const maxWidth = pdfWidth - margin * 2;
  const maxHeight = pdfHeight - margin * 2;
  const widthRatio = maxWidth / canvas.width;
  const heightRatio = maxHeight / canvas.height;
  const ratio = Math.min(widthRatio, heightRatio);
  const imgWidth = canvas.width * ratio;
  const imgHeight = canvas.height * ratio;
  const xPos = (pdfWidth - imgWidth) / 2;
  const yPos = (pdfHeight - imgHeight) / 2;

  if (options.addPage) {
    pdf.addPage();
  }

  pdf.addImage(imgData, "PNG", xPos, yPos, imgWidth, imgHeight);
  return pdf;
};
