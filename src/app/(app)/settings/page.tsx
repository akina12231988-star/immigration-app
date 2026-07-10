import { AppHeader } from "@/components/AppHeader";
import { SettingsForm } from "./SettingsForm";

export default function SettingsPage() {
  return (
    <div className="-mx-4 -mt-4">
      <AppHeader title="ログイン設定" backHref="/" />
      <div className="px-4 pt-4">
        <SettingsForm />
      </div>
    </div>
  );
}
