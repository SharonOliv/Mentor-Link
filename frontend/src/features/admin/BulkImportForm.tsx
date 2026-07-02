import { ChangeEvent, useRef } from "react";
import { Upload } from "lucide-react";
import { useBulkImport } from "./hooks";

export const BulkImportForm = () => {
  const bulkImport = useBulkImport();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    bulkImport.mutate(file, {
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4">
      <p className="text-sm font-medium text-ink-700">Bulk import from CSV</p>
      <p className="mt-1 text-xs text-ink-300">
        Columns: email, name, role, department, subjects (mentor only, comma-separated)
      </p>
      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded border border-dashed border-ink-300 px-4 py-2 text-sm text-ink-500 hover:border-brass hover:text-brass-dark">
        <Upload size={15} />
        {bulkImport.isPending ? "Uploading…" : "Choose CSV file"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={bulkImport.isPending}
          className="hidden"
        />
      </label>

      {bulkImport.data && (
        <div className="mt-3 text-sm">
          <p className="text-sage-dark">{bulkImport.data.created.length} account(s) created</p>
          {bulkImport.data.skipped.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-terracotta-dark">
                {bulkImport.data.skipped.length} row(s) skipped
              </summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink-500">
                {bulkImport.data.skipped.map((s, i) => (
                  <li key={i}>
                    Row {s.row} ({s.email}): {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
