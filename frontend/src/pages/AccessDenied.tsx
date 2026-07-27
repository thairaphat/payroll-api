import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 flex items-center justify-center">
      <Card className="surface-card w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-950">ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="mt-2 text-sm text-slate-600">
          บัญชีของคุณไม่มีสิทธิ์เปิดหน้านี้
        </p>
        <Button
          className="mt-6"
          onClick={() => navigate(-1)}
        >
          กลับหน้าก่อนหน้า
        </Button>
      </Card>
    </div>
  );
}
