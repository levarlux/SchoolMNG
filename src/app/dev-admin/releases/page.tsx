"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GitBranch, GitCommit, CheckCircle2, Clock, ArrowUp,
  ExternalLink, RefreshCw,
} from "lucide-react";

const MOCK_RELEASES = [
  {
    id: "v0.3.0",
    version: "0.3.0",
    status: "production",
    date: "2026-08-08",
    author: "dev@schoolmng.com",
    changes: [
      "OCR document scanning with Tesseract.js",
      "Server-side rate limiting",
      "Security audit documentation",
      "Developer admin dashboard",
    ],
  },
  {
    id: "v0.2.1",
    version: "0.2.1",
    status: "production",
    date: "2026-08-05",
    author: "dev@schoolmng.com",
    changes: [
      "Bulk operations module",
      "Export data as CSV",
      "Audit log queries",
      "Performance optimizations",
    ],
  },
  {
    id: "v0.2.0",
    version: "0.2.0",
    status: "production",
    date: "2026-07-15",
    author: "dev@schoolmng.com",
    changes: [
      "Member invitations",
      "Multi-tenancy improvements",
      "Webhook fixes",
    ],
  },
];

export default function ReleasesPage() {
  const [releases] = useState(MOCK_RELEASES);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Releases</h1>
          <p className="text-muted-foreground mt-1">
            Track deployments and manage release pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <a
            href="https://github.com/your-org/schoolmng/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" /> GitHub
            </Button>
          </a>
        </div>
      </div>

      {/* Current Version */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-800">
                  Current Production Version: v{releases[0]?.version}
                </p>
                <p className="text-sm text-green-700">
                  Deployed on {releases[0]?.date}
                </p>
              </div>
            </div>
            <Badge variant="success">Production</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Release History */}
      <Card>
        <CardHeader>
          <CardTitle>Release History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {releases.map((release, i) => (
              <div
                key={release.id}
                className="flex gap-4 p-4 rounded-lg border border-border"
              >
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      i === 0
                        ? "bg-green-100 text-green-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i === 0 ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <GitCommit className="h-5 w-5" />
                    )}
                  </div>
                  {i < releases.length - 1 && (
                    <div className="w-0.5 flex-1 bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">v{release.version}</h3>
                    <Badge
                      variant={
                        release.status === "production"
                          ? "success"
                          : release.status === "preview"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {release.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {release.date}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {release.changes.map((change, j) => (
                      <li key={j} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Deployment Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Deployment Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {["Internal", "Preview", "Production"].map((stage, i) => (
              <div key={stage} className="flex items-center">
                <div className="text-center">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center ${
                      i <= 2
                        ? "bg-green-100 text-green-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i < 2 ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : (
                      <ArrowUp className="h-6 w-6" />
                    )}
                  </div>
                  <p className="text-sm font-medium mt-2">{stage}</p>
                  <p className="text-xs text-muted-foreground">
                    {i === 0 ? "CI checks" : i === 1 ? "Staging" : "Deploy"}
                  </p>
                </div>
                {i < 2 && (
                  <div className="w-24 h-0.5 bg-green-300 mx-2" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
