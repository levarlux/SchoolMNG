import { BrandLoader } from "@/components/ui/brand-loader";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <BrandLoader variant="full" size="md" label="Setting up your account…" />
    </div>
  );
}
