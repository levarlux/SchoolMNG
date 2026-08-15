import { DashboardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="p-4 lg:p-8">
      <DashboardSkeleton />
    </div>
  );
}
