/**
 * PDF Generator Module
 *
 * Uses PDF-lib to generate reports, certificates, and documents.
 * Runs as a Convex action (server-side) since PDF-lib needs Node.js.
 */
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Generate a student report card as PDF.
 */
export const generateStudentReport = action({
  args: {
    schoolId: v.id("schools"),
    studentName: v.string(),
    className: v.string(),
    term: v.string(),
    subjects: v.array(
      v.object({
        name: v.string(),
        marks: v.number(),
        grade: v.string(),
      })
    ),
    overallGrade: v.string(),
    teacherComment: v.optional(v.string()),
    schoolName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { studentName, className, term, subjects, overallGrade, teacherComment, schoolName }
  ) => {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width } = page.getSize();

    // Header
    page.drawText(schoolName ?? "SchoolMNG", {
      x: width / 2 - 80,
      y: 740,
      size: 20,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });

    page.drawText("Student Report Card", {
      x: width / 2 - 70,
      y: 710,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Student info
    let y = 670;
    const leftMargin = 50;

    page.drawText(`Name: ${studentName}`, {
      x: leftMargin,
      y,
      size: 12,
      font: helveticaBold,
    });

    page.drawText(`Class: ${className}`, {
      x: 350,
      y,
      size: 12,
      font: helvetica,
    });

    y -= 25;
    page.drawText(`Term: ${term}`, {
      x: leftMargin,
      y,
      size: 12,
      font: helvetica,
    });

    page.drawText(`Overall Grade: ${overallGrade}`, {
      x: 350,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0.0, 0.5, 0.0),
    });

    // Table header
    y -= 40;
    page.drawRectangle({
      x: leftMargin,
      y: y - 5,
      width: width - 100,
      height: 25,
      color: rgb(0.9, 0.9, 0.95),
    });

    page.drawText("Subject", {
      x: leftMargin + 10,
      y,
      size: 11,
      font: helveticaBold,
    });

    page.drawText("Marks", {
      x: 350,
      y,
      size: 11,
      font: helveticaBold,
    });

    page.drawText("Grade", {
      x: 450,
      y,
      size: 11,
      font: helveticaBold,
    });

    // Subject rows
    y -= 25;
    for (const subject of subjects) {
      page.drawText(subject.name, {
        x: leftMargin + 10,
        y,
        size: 10,
        font: helvetica,
      });

      page.drawText(String(subject.marks), {
        x: 360,
        y,
        size: 10,
        font: helvetica,
      });

      page.drawText(subject.grade, {
        x: 460,
        y,
        size: 10,
        font: helvetica,
      });

      y -= 20;
    }

    // Teacher comment
    if (teacherComment) {
      y -= 30;
      page.drawText("Teacher's Comment:", {
        x: leftMargin,
        y,
        size: 11,
        font: helveticaBold,
      });

      y -= 20;
      // Wrap text if needed
      const words = teacherComment.split(" ");
      let line = "";
      for (const word of words) {
        const testLine = line + word + " ";
        if (helvetica.widthOfTextAtSize(testLine, 10) > width - 120) {
          page.drawText(line, {
            x: leftMargin + 10,
            y,
            size: 10,
            font: helvetica,
          });
          y -= 15;
          line = word + " ";
        } else {
          line = testLine;
        }
      }
      page.drawText(line, {
        x: leftMargin + 10,
        y,
        size: 10,
        font: helvetica,
      });
    }

    // Footer
    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: leftMargin,
      y: 50,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    return Array.from(pdfBytes);
  },
});

/**
 * Generate a fee receipt as PDF.
 */
export const generateFeeReceipt = action({
  args: {
    receiptNumber: v.string(),
    studentName: v.string(),
    admNo: v.string(),
    amount: v.number(),
    method: v.string(),
    term: v.string(),
    date: v.string(),
    schoolName: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { receiptNumber, studentName, admNo, amount, method, term, date, schoolName }
  ) => {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]);
    const { width } = page.getSize();
    const leftMargin = 50;

    // Header
    page.drawText(schoolName ?? "SchoolMNG", {
      x: width / 2 - 80,
      y: 740,
      size: 20,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });

    page.drawText("Fee Payment Receipt", {
      x: width / 2 - 70,
      y: 710,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Receipt details
    let y = 660;

    page.drawText(`Receipt No: ${receiptNumber}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helveticaBold,
    });

    page.drawText(`Date: ${date}`, {
      x: 400,
      y,
      size: 11,
      font: helvetica,
    });

    y -= 30;
    page.drawText(`Student: ${studentName}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
    });

    page.drawText(`Adm No: ${admNo}`, {
      x: 400,
      y,
      size: 11,
      font: helvetica,
    });

    y -= 25;
    page.drawText(`Term: ${term}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
    });

    y -= 30;
    // Amount box
    page.drawRectangle({
      x: leftMargin,
      y: y - 10,
      width: width - 100,
      height: 40,
      color: rgb(0.95, 0.98, 0.95),
      borderColor: rgb(0.2, 0.6, 0.2),
      borderWidth: 1,
    });

    page.drawText("Amount Paid:", {
      x: leftMargin + 20,
      y,
      size: 12,
      font: helvetica,
    });

    page.drawText(`KES ${amount.toLocaleString()}`, {
      x: 350,
      y,
      size: 16,
      font: helveticaBold,
      color: rgb(0.0, 0.5, 0.0),
    });

    y -= 40;
    page.drawText(`Payment Method: ${method}`, {
      x: leftMargin,
      y,
      size: 11,
      font: helvetica,
    });

    // Footer
    y -= 60;
    page.drawText("Thank you for your payment.", {
      x: leftMargin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
      x: leftMargin,
      y: 50,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    return Array.from(pdfBytes);
  },
});

/**
 * Generate a class list as PDF.
 */
export const generateClassList = action({
  args: {
    className: v.string(),
    students: v.array(
      v.object({
        name: v.string(),
        admNo: v.string(),
        gender: v.optional(v.string()),
      })
    ),
    schoolName: v.optional(v.string()),
  },
  handler: async ({}, { className, students, schoolName }) => {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]);
    const { width } = page.getSize();
    const leftMargin = 50;

    // Header
    page.drawText(schoolName ?? "SchoolMNG", {
      x: width / 2 - 80,
      y: 740,
      size: 20,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });

    page.drawText(`Class List: ${className}`, {
      x: width / 2 - 70,
      y: 710,
      size: 14,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Table header
    let y = 670;
    page.drawRectangle({
      x: leftMargin,
      y: y - 5,
      width: width - 100,
      height: 25,
      color: rgb(0.9, 0.9, 0.95),
    });

    page.drawText("#", { x: leftMargin + 10, y, size: 11, font: helveticaBold });
    page.drawText("Name", { x: leftMargin + 40, y, size: 11, font: helveticaBold });
    page.drawText("Adm No", { x: 300, y, size: 11, font: helveticaBold });
    page.drawText("Gender", { x: 430, y, size: 11, font: helveticaBold });

    // Student rows
    y -= 25;
    students.forEach((s, i) => {
      if (y < 80) return; // Stop if page is full

      page.drawText(String(i + 1), { x: leftMargin + 15, y, size: 10, font: helvetica });
      page.drawText(s.name, { x: leftMargin + 40, y, size: 10, font: helvetica });
      page.drawText(s.admNo, { x: 310, y, size: 10, font: helvetica });
      page.drawText(s.gender ?? "—", { x: 440, y, size: 10, font: helvetica });

      y -= 18;
    });

    // Footer
    page.drawText(`Total: ${students.length} students`, {
      x: leftMargin,
      y: 50,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    return Array.from(pdfBytes);
  },
});
