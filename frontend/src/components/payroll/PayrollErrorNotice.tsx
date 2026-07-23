import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isWageNotConfiguredError } from "@/services/payroll.service";
import type { Role } from "@/types/domain";

export function PayrollErrorNotice({
  error,
  role,
}: {
  error: unknown;
  role: Role | null;
}) {
  if (isWageNotConfiguredError(error)) {
    return (
      <div className="p-4 sm:p-8">
        <Card
          role="alert"
          className="border-amber-300 bg-amber-50 p-6 text-amber-950"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">
                  ยังไม่สามารถคำนวณเงินเดือนได้
                </h2>
                <p className="mt-1">
                  ยังไม่ได้ตั้งค่าค่าแรง กรุณาติดต่อแอดมิน
                </p>
              </div>
              {role === "cyd_admin" && (
                <Button asChild className="bg-amber-700 hover:bg-amber-800">
                  <a href="/admin/company-wages">
                    ไปหน้าจัดการค่าแรงบริษัท
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Card className="bg-red-50 p-6 text-red-700">
        Error loading payroll
      </Card>
    </div>
  );
}
