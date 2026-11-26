export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function openPrintDocument(html) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  printWindow.opener = null;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.requestAnimationFrame(() => printWindow.print());
  return true;
}
