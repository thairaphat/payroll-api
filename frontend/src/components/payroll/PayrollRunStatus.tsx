import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  CALCULATED: "คำนวณแล้ว",
  REVIEWED: "ตรวจสอบแล้ว",
  APPROVED: "อนุมัติแล้ว",
  LOCKED: "ล็อกแล้ว",
  PAID: "จ่ายแล้ว",
  CANCELLED: "ยกเลิก",
};

const styles: Record<string, string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-800",
  CALCULATED: "border-sky-200 bg-sky-100 text-sky-800",
  REVIEWED: "border-cyan-200 bg-cyan-50 text-cyan-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  LOCKED: "border-indigo-200 bg-indigo-50 text-indigo-800",
  PAID: "border-green-200 bg-green-50 text-green-800",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-700",
};

export function PayrollRunStatus({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap rounded-full px-2.5 py-1", styles[status])}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {labels[status] ?? status}
    </Badge>
  );
}
