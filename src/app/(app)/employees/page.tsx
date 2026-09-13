import { redirect } from "next/navigation";

// 支援体制（従業員）は「登録支援機関」のページにまとめた。古いリンクからも開けるように転送する
export default function EmployeesPage() {
  redirect("/support-org");
}
