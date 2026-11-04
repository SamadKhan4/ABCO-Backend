import writeExcelFile from "write-excel-file/node";
import PDFDocument from "pdfkit";
import { audit, fail } from "../../shared/workflow.js";
function csvCell(value) {
  let string = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(string)) string = "'" + string;
  return '"' + string.replaceAll('"', '""') + '"';
}
export async function exportReport(req, res, kind, records, format) {
  const rows = records.map((record) =>
    Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !["_id", "__v"].includes(key))
        .map(([key, value]) => [
          kind === "payroll" &&
          ["gross", "deductionsTotal", "net"].includes(key)
            ? key + "_INR"
            : key,
          kind === "payroll" &&
          ["gross", "deductionsTotal", "net"].includes(key)
            ? (value / 100).toFixed(2)
            : value instanceof Date
              ? value.toISOString()
              : typeof value === "object"
                ? JSON.stringify(value)
                : value,
        ]),
    ),
  );
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  await audit(req, "report.exported", kind);
  res.set("Cache-Control", "no-store");
  if (format === "csv") {
    const content = [
      headers.map(csvCell).join(","),
      ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
    ].join("\r\n");
    return res
      .set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ABCO-${kind}.csv"`,
      })
      .send("\uFEFF" + content);
  }
  if (format === "xlsx") {
    const data = [
      headers.map((value) => ({
        value,
        type: String,
        fontWeight: "bold",
        backgroundColor: "#0B1F3A",
        color: "#FFFFFF",
      })),
      ...rows.map((row) =>
        headers.map((key) => ({ value: String(row[key] ?? ""), type: String })),
      ),
    ];
    const buffer = await writeExcelFile(data, {
      columns: headers.map(() => ({ width: 24 })),
    }).toBuffer();
    return res
      .set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ABCO-${kind}.xlsx"`,
      })
      .send(buffer);
  }
  if (format === "pdf") {
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ABCO-${kind}.pdf"`,
    });
    const pdf = new PDFDocument({ margin: 45, size: "A4" });
    pdf.pipe(res);
    pdf
      .fillColor("#0B1F3A")
      .fontSize(20)
      .text("ABCO COMPUTERS")
      .fontSize(12)
      .text(kind.toUpperCase() + " REPORT");
    pdf
      .fontSize(9)
      .fillColor("#64748B")
      .text(`Generated ${new Date().toISOString()} · ${rows.length} records`)
      .moveDown();
    for (const [rowIndex, row] of rows.entries()) {
      if (pdf.y > 690) pdf.addPage();
      pdf
        .fillColor("#0B1F3A")
        .fontSize(11)
        .text(`Record ${rowIndex + 1}`);
      for (const key of headers) {
        const value = String(row[key] ?? "");
        pdf
          .fillColor("#344054")
          .fontSize(8)
          .text(`${key}: ${value}`, { paragraphGap: 3 });
      }
      pdf.moveDown();
    }
    pdf.end();
    return;
  }
  fail(422, "Choose csv, xlsx or pdf export");
}
