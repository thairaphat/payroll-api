import { prisma } from "../db";
import { logAudit } from "./audit.service";
import { readEmployeeMasterFromGoogleSheet } from "../modules/attendance/google-sheet.service";
import type { AuthUser } from "../middlewares/auth.middleware";

const UPDATE_CHUNK_SIZE = 100;

// กัน import ซ้อนใน process เดียว
let isImporting = false;

/**
 * นำเข้า employee master จาก Google Sheet → ตาราง employee_master_mapping
 *
 * ขั้นตอนนี้ "เฉพาะ" Google Sheet → employee_master_mapping เท่านั้น:
 *   - ไม่แตะ attendance_records
 *   - ไม่ update employee_document_profiles
 *   - ไม่ auto match / ไม่ payroll / ไม่ approve
 *
 * Dedup/upsert key = (source_sheet_id, code_to_find)
 *   - code_to_find (Column D) = main matching key (จำเป็น)
 *   - ถ้า code_to_find ว่าง → ข้ามแถว + รายงานเป็น error (ห้าม fallback เป็น employee_code)
 */
export async function importEmployeeMasterFromSheet({
  sheetId,
  user,
}: {
  sheetId: string;
  user?: AuthUser | null;
}) {
  if (isImporting) {
    throw new Error("ระบบกำลังนำเข้าข้อมูล master อยู่ กรุณารอสักครู่");
  }

  try {
    isImporting = true;
    const { rows, errors, sheetName } =
      await readEmployeeMasterFromGoogleSheet(sheetId);

    if (rows.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0, errors };
    }

    // ดึง key ที่มีอยู่แล้วของชีตนี้ในครั้งเดียว (เลี่ยง query ต่อแถว)
    const existing = await prisma.employee_master_mapping.findMany({
      where: { source_sheet_id: sheetId },
      select: { code_to_find: true },
    });
    const existingSet = new Set(existing.map((e) => e.code_to_find));

    const toCreate: any[] = [];
    const toUpdate: Array<{ key: string; data: any }> = [];
    let skipped = 0;
    const seenKeys = new Set<string>();

    for (const r of rows) {
      // code_to_find จำเป็น และเป็น matching key — ห้าม fallback เป็น employee_code
      const key = r.codeToFind;
      if (!key) {
        skipped++;
        errors.push(
          `Skipped row: empty code_to_find (employee_code=${r.employeeCode ?? "-"}, name=${r.employeeName ?? "-"})`
        );
        continue;
      }
      // กันซ้ำภายในชีตเดียวกัน (กัน createMany ชน unique key)
      if (seenKeys.has(key)) {
        skipped++;
        errors.push(`Skipped duplicate code_to_find in sheet: ${key}`);
        continue;
      }
      seenKeys.add(key);

      const data = {
        employee_code: r.employeeCode,
        first_name: r.firstName,
        last_name: r.lastName,
        employee_name: r.employeeName,
        source_sheet_name: sheetName,
        raw_row_json: r.rawRowJson,
      };

      if (existingSet.has(key)) {
        toUpdate.push({ key, data });
      } else {
        toCreate.push({ ...data, code_to_find: key, source_sheet_id: sheetId });
      }
    }

    let inserted = 0;
    let updated = 0;

    if (toCreate.length > 0) {
      try {
        const res = await prisma.employee_master_mapping.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        inserted = res.count;
      } catch (err) {
        errors.push(
          `Batch insert error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // update เป็น chunk กัน transaction timeout
    for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + UPDATE_CHUNK_SIZE);
      try {
        await prisma.$transaction(
          chunk.map(({ key, data }) =>
            prisma.employee_master_mapping.update({
              where: {
                uniq_master_mapping: {
                  source_sheet_id: sheetId,
                  code_to_find: key,
                },
              },
              data,
            })
          )
        );
        updated += chunk.length;
      } catch (err) {
        errors.push(
          `Batch update error (chunk ${Math.floor(i / UPDATE_CHUNK_SIZE) + 1}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    await logAudit(
      "employee_master.import",
      "employee_master_mapping",
      { sourceSheetId: sheetId, sourceSheetName: sheetName },
      user ?? null,
      { inserted, updated, skipped, error_count: errors.length }
    );

    return { inserted, updated, skipped, errors };
  } finally {
    isImporting = false;
  }
}
