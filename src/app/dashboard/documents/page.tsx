"use client";

/**
 * Documents Page — Template-based document generation.
 */

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useSchool } from "@/lib/use-school";
import { DocumentGenerator } from "@/components/document-generator";
import { BrandLoader } from "@/components/ui/brand-loader";
import { FileText } from "lucide-react";

export default function DocumentsPage() {
  const school = useSchool();

  if (!school) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <BrandLoader variant="dots" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <FileText className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Generate report cards, receipts, class lists, and certificates from your templates
          </p>
        </div>
      </div>

      <DocumentGenerator schoolId={school._id} />
    </div>
  );
}
