import { AppHeader } from "@/components/AppHeader";
import { ReceiptRegistrationForm } from "./ReceiptRegistrationForm";

export default function NewApplicationPage() {
  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="受付票登録" backHref="/applications" />
      <div className="px-4 pt-4">
        <ReceiptRegistrationForm />
      </div>
    </div>
  );
}
