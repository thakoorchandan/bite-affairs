"use server";

import { adminAction } from "./guard";
import { deleteExpense, saveExpense } from "@/services/finance.service";
import { formatINR } from "@/lib/utilities/money";
import type { ExpenseFormInput } from "@/lib/validations/admin";

export async function saveExpenseAction(id: string | null, input: ExpenseFormInput) {
  return adminAction({ action: id ? "expense.update" : "expense.create", entityType: "expense" }, async (admin) => {
    const res = await saveExpense(id, input, admin.id);
    return { data: res, entityId: res.id, summary: `${id ? "Updated" : "Recorded"} expense ${formatINR(res.amount)}` };
  });
}

export async function deleteExpenseAction(id: string) {
  return adminAction({ action: "expense.delete", entityType: "expense" }, async () => {
    const res = await deleteExpense(id);
    return { entityId: id, summary: `Deleted ${res.category} expense ${formatINR(res.amount)}` };
  });
}
