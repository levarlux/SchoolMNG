/**
 * Client-side CSV export utility.
 * Converts an array of objects to a CSV file and triggers a download.
 */

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) {
    console.warn(`[CSV Export] No data to export for "${filename}"`);
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          // Escape quotes and wrap in quotes if needed
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  console.log(`[CSV Export] Exported ${data.length} rows to "${filename}.csv"`);
}

/**
 * Multi-sheet CSV export: creates separate CSV files for each dataset.
 * Each entry is { name: string, data: Record<string, unknown>[] }.
 */
export function exportMultiSheetCsv(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  baseFilename: string
) {
  if (sheets.length === 0) {
    console.warn(`[CSV Export] No sheets to export for "${baseFilename}"`);
    return;
  }

  for (const sheet of sheets) {
    if (sheet.data.length > 0) {
      exportToCsv(sheet.data, `${baseFilename}_${sheet.name}`);
    }
  }
}
