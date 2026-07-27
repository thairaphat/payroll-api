import { Badge } from "@/components/ui/badge";
import {
  type EmployeeProfileLike,
  isEmployeeProfileMissing,
} from "@/lib/employee-profile";

type EmployeeProfileNameProps = EmployeeProfileLike & {
  employeeCode: string;
};

export function EmployeeProfileName(props: EmployeeProfileNameProps) {
  const name = props.employee_name ?? props.employeeName;

  if (!isEmployeeProfileMissing(props)) {
    return <span>{name}</span>;
  }

  return (
    <div className="space-y-1">
      <div className="font-semibold text-foreground">ไม่พบข้อมูลพนักงาน</div>
      <div className="text-xs text-muted-foreground">รหัส {props.employeeCode}</div>
      <Badge className="border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100">
        ข้อมูลพนักงานไม่ครบ
      </Badge>
    </div>
  );
}
