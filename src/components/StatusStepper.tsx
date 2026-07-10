import { APPLICATION_STATUS_ORDER, type ApplicationStatus } from "@/types/application";
import { STATUS_STYLES } from "@/lib/status";

export function StatusStepper({ current }: { current: ApplicationStatus }) {
  const currentIndex = APPLICATION_STATUS_ORDER.indexOf(current);

  return (
    <div className="flex items-center">
      {APPLICATION_STATUS_ORDER.map((status, i) => {
        const done = i <= currentIndex;
        const style = STATUS_STYLES[status];
        return (
          <div key={status} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-3 w-3 rounded-full ${
                  done ? style.dot : "bg-border"
                }`}
              />
              <span
                className={`text-center text-[10px] font-bold leading-tight ${
                  done ? style.fg : "text-muted"
                }`}
              >
                {status}
              </span>
            </div>
            {i < APPLICATION_STATUS_ORDER.length - 1 && (
              <div
                className={`mx-1 mb-4 h-0.5 flex-1 ${
                  i < currentIndex ? style.dot : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
