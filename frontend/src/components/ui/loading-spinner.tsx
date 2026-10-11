import { Loader2 } from "lucide-react";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center w-full min-h-[200px] ${className || ""}`}>
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}
