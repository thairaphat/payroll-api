import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#f4f6f9] p-6 flex items-center justify-center">
      <Card className="w-full max-w-md rounded-3xl border border-[#dbe4f0] bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Access Denied</h1>
        <p className="mt-2 text-sm text-[#64748b]">
          Your role does not have permission to view this page.
        </p>
        <Button
          className="mt-6 rounded-xl bg-[#1e40af] text-white hover:bg-[#1e3a8a]"
          onClick={() => navigate(-1)}
        >
          Go Back
        </Button>
      </Card>
    </div>
  );
}
