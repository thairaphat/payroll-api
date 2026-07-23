import type { Prisma } from "@prisma/client";

export type CompanyWageConfig = {
  id: bigint;
  company_id: number;
  daily_wage: Prisma.Decimal;
  work_hours_per_day: Prisma.Decimal;
  ot1_multiplier: Prisma.Decimal;
  ot15_multiplier: Prisma.Decimal;
  ot2_multiplier: Prisma.Decimal;
  ot3_multiplier: Prisma.Decimal;
  is_active: boolean;
  created_by: bigint | null;
  updated_by: bigint | null;
  created_at: Date;
  updated_at: Date;
};

export type CompanyWageListRow = {
  company_id: number;
  company_name: string;
  id: bigint | null;
  daily_wage: Prisma.Decimal | null;
  work_hours_per_day: Prisma.Decimal | null;
  ot1_multiplier: Prisma.Decimal | null;
  ot15_multiplier: Prisma.Decimal | null;
  ot2_multiplier: Prisma.Decimal | null;
  ot3_multiplier: Prisma.Decimal | null;
  is_active: boolean | number | bigint | null;
  created_by: bigint | null;
  updated_by: bigint | null;
  created_at: Date | null;
  updated_at: Date | null;
};

export type CompanyWageInput = {
  dailyWage: unknown;
  workHoursPerDay?: unknown;
  ot1Multiplier?: unknown;
  ot15Multiplier?: unknown;
  ot2Multiplier?: unknown;
  ot3Multiplier?: unknown;
  isActive?: unknown;
};

export type CompanyWagePatch = Partial<CompanyWageInput>;
