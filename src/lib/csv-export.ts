/**
 * Convert an array of objects to CSV and trigger a browser download.
 * Keys become column headers, values become cell values.
 */
export function exportToCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? "" : String(val);
          // Escape quotes and wrap in quotes if contains comma/newline/quote
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    ),
  ];

  const csv = csvRows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export multiple data sets as separate CSV files (one per sheet).
 * Each sheet is downloaded as a separate file.
 */
export function exportMultiSheetCsv(
  sheets: { name: string; data: Record<string, unknown>[] }[],
  filename: string
) {
  for (const sheet of sheets) {
    if (sheet.data.length === 0) continue;
    exportToCsv(sheet.data, `${filename}_${sheet.name}`);
  }
}
