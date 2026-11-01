import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdminPage } from "@/lib/auth/session";
import { AdminPageHeader, AdminPageSkeleton } from "@/components/admin/page-header";
import { FinanceView } from "@/components/admin/finance/finance-view";
import { defaultRange, getProfitReport, listExpenses } from "@/services/finance.service";

export const metadata: Metadata = { title: "Expenses & profit" };

export default function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  return (
    <>
      <AdminPageHeader title="Expenses & profit" description="Track what you spend and see what the kitchen actually earns." />
      <Suspense fallback={<AdminPageSkeleton rows={8} />}>
        <ExpensesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ExpensesContent({ searchParams }: { searchParams: PageProps<"/expenses">["searchParams"] }) {
  await requireAdminPage();
  await connection();
  const sp = await searchParams;
  const def = defaultRange();
  const isKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let from = isKey(sp.from) ? sp.from : def.from;
  let to = isKey(sp.to) ? sp.to : def.to;
  if (from > to) [from, to] = [to, from];
  const category = typeof sp.category === "string" ? sp.category : "";
  const [report, expenses] = await Promise.all([getProfitReport(from, to), listExpenses({ from, to, category })]);
  return <FinanceView report={report} expenses={expenses} filters={{ from, to, category }} />;
}
