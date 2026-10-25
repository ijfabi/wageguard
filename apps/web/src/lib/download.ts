/** Saves a blob as a file in the browser. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Saves a JSON value as a file in the browser (used for the audit evidence report). */
export function downloadJson(value: unknown, filename: string): void {
  download(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }), filename);
}
