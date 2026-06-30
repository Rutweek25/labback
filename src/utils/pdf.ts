import PDFDocument from "pdfkit";
import { Response } from "express";

interface InvoiceInput {
  orderId: string;
  patientName: string;
  tests: Array<{ name: string; price: number }>;
  amount: number;
  status: string;
  invoiceNumber?: string;
}

export const generateInvoicePdf = (res: Response, data: InvoiceInput) => {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  const gstRate = 0.18;
  const taxableAmount = Number(data.amount || 0);
  const gstAmount = taxableAmount * gstRate;
  const grandTotal = taxableAmount + gstAmount;

  doc.fontSize(22).fillColor("#0f172a").text("Lab Management System", { align: "center" });
  doc.fontSize(10).fillColor("#475569").text("Advanced Diagnostics and Reporting", { align: "center" });
  doc.moveDown();
  doc.moveDown(0.25);
  doc.fontSize(12).fillColor("#0f172a").text(`Invoice #: ${data.invoiceNumber || `INV-${data.orderId}`}`);
  doc.text(`Order ID: ${data.orderId}`);
  doc.text(`Patient: ${data.patientName}`);
  doc.text(`Payment Status: ${data.status}`);
  doc.text(`GST: ${(gstRate * 100).toFixed(0)}%`);
  doc.moveDown();
  doc.fontSize(12).text("Tests", { underline: true });

  data.tests.forEach((test) => {
    doc.text(`${test.name} - Rs. ${test.price.toFixed(2)}`);
  });

  doc.moveDown();
  doc.fontSize(12).text(`Subtotal: Rs. ${taxableAmount.toFixed(2)}`);
  doc.text(`GST Amount: Rs. ${gstAmount.toFixed(2)}`);
  doc.fontSize(14).fillColor("#0f172a").text(`Grand Total: Rs. ${grandTotal.toFixed(2)}`);
  doc.end();
};
