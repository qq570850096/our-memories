import { Suspense } from "react";
import { AnniversaryReplayPage } from "@/components/anniversaries/AnniversaryReplayPage";
import { Spinner } from "@/components/ui/spinner";

export default function ReplayPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner /></div>}>
      <AnniversaryReplayPage />
    </Suspense>
  );
}
