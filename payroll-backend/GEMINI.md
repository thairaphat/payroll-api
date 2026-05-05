# Project Instructions: Payroll Backend

This document provides foundational guidance for developing and maintaining the `payroll-backend`.

## Tech Stack
- **Runtime:** [Bun](https://bun.sh/) (Fast JS runtime & package manager)
- **Framework:** [ElysiaJS](https://elysiajs.com/) (High-performance web framework)
- **ORM:** [Prisma](https://www.prisma.io/) (Type-safe database client)
- **Database:** MariaDB / MySQL
- **Validation:** [Zod](https://zod.dev/) (Schema validation)
- **Integration:** Google Sheets API (for attendance syncing)

## Architecture
The project follows a **Modular Monolith** structure located in `src/modules`.

### Module Structure
Each module should ideally contain:
- `*.route.ts`: Defines API endpoints and schema validation using Elysia and Zod.
- `*.controller.ts`: Handles request parsing and maps it to service calls.
- `*.service.ts`: Contains core business logic and database interactions.

### Directory Mapping
- `src/db`: Prisma client initialization and migration scripts.
- `src/middlewares`: Global hooks (Auth, Error handling).
- `src/types`: Shared TypeScript interfaces/types.
- `src/utils`: Helper functions.

## Coding Standards
1. **Type Safety:** Always use Prisma's generated types. Avoid `any`.
2. **Validation:** Validate all incoming request data (params, query, body) using Elysia's schema or Zod.
3. **Services:** Keep controllers thin; business logic belongs in services.
4. **Error Handling:** Use the global error middleware. Throw standard Errors with meaningful messages.
5. **Naming:** Use `camelCase` for variables and functions, `PascalCase` for classes and types, and `snake_case` for database fields (matching the Prisma schema).

## Development Workflow
- **Start Dev Server:** `bun run dev`
- **Database Migrations:** Use `bunx prisma migrate dev` to create and apply migrations.
- **Generate Prisma Client:** `bunx prisma generate` (automatically runs after installs).

## Key Procedures
### Attendance Syncing
The system syncs data from Google Sheets.
- Service: `src/modules/attendance/google-sheet.service.ts`
- Logic: Uses `upsert` in `attendance.service.ts` to ensure idempotency based on `source_sheet_id`, `employee_code`, and `work_date`.

## Security
- Never commit `.env` files.
- Ensure sensitive logic (like password hashing) is handled in the `auth` module using `bcryptjs`.
- Protect routes using the `authMiddleware`.
