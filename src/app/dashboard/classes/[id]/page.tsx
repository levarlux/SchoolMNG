import { ClassDetailClient } from "./class-detail-client";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function ClassDetailPage() {
  return <ClassDetailClient />;
}
