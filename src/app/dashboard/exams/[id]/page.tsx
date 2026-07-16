import { ExamDetailClient } from "./exam-detail-client";

export function generateStaticParams() {
  return [{ id: "placeholder" }];
}

export default function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ExamDetailClient params={params} />;
}
