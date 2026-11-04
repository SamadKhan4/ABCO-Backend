import PDFDocument from "pdfkit";
export function payslipPDF(entry) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf
      .fillColor("#0B1F3A")
      .fontSize(23)
      .text(entry.period.companySnapshot?.name || "ABCO COMPUTERS");
    pdf
      .fontSize(11)
      .fillColor("#64748B")
      .text(`PAYSLIP · ${entry.period.month}`, { paragraphGap: 20 });
    if (entry.period.companySnapshot?.address)
      pdf.fontSize(9).text(entry.period.companySnapshot.address);
    if (entry.period.companySnapshot?.logo) {
      try {
        pdf.image(
          Buffer.from(
            entry.period.companySnapshot.logo.split(",")[1],
            "base64",
          ),
          450,
          40,
          { fit: [90, 45] },
        );
      } catch {}
    }
    pdf.moveDown();
    pdf
      .fillColor("#101828")
      .fontSize(12)
      .text(entry.employeeSnapshot.name)
      .fontSize(10)
      .text(
        `${entry.employeeSnapshot.code} | ${entry.employeeSnapshot.department}`,
      )
      .text(entry.employeeSnapshot.designation);
    if (entry.bankSnapshot?.maskedAccount)
      pdf.text(
        `Payment account: ${entry.bankSnapshot.bankName} ${entry.bankSnapshot.maskedAccount}`,
      );
    pdf
      .moveDown()
      .text(`Payable days: ${entry.payableDays} / ${entry.periodDays}`);
    const rupees = (value) => "INR " + (value / 100).toFixed(2);
    pdf.moveDown().fontSize(12).text("Earnings");
    for (const component of entry.earnings)
      pdf.fontSize(10).text(`${component.name}: ${rupees(component.amount)}`);
    pdf.moveDown().fontSize(12).text("Deductions");
    for (const component of entry.deductions)
      pdf.fontSize(10).text(`${component.name}: ${rupees(component.amount)}`);
    pdf
      .moveDown()
      .fontSize(11)
      .text(`Gross: ${rupees(entry.gross)}`)
      .text(`Deductions: ${rupees(entry.deductionsTotal)}`);
    pdf
      .moveDown()
      .fontSize(18)
      .fillColor("#0B1F3A")
      .text(`Net pay: ${rupees(entry.net)}`);
    pdf
      .moveDown()
      .fontSize(8)
      .fillColor("#64748B")
      .text(`Payroll reference: ${entry.period.id} / ${entry.id || entry._id}`)
      .text("Generated from the finalized payroll snapshot.");
    pdf.end();
  });
}
