# Baptist Preparatory School — Demo Dataset 2026

Realistic, industry-grade mock data to stress-test the School Management System. All names, contacts, phones and references are **fictional**; the data is generated deterministically and mirrors how a real Kenyan private school records its operations.

## School at a Glance
- **Name:** Baptist Preparatory School  
- **Head Teacher:** Andreah Smithh  
- **Type:** Private — Day School (Lower Primary & Junior Secondary)  
- **Curriculum:** CBC — Grade 1-6 Lower Primary, Grade 7-9 Junior Secondary  
- **Students:** 560  ·  **Staff:** 30 (20 teaching, all of whom are class teachers, + 10 non-teaching)  
- **Classes:** 20  
- **Tuition:** Term 1 **KES 30,000** · Term 2 **KES 15,000** · Term 3 **KES 9,000**


## Data Volumes
| File | Rows |  
|---|---|  
| 03-students.csv | 560 |  
| 07-fee-payments.csv | 3,031 |  
| 08-marks-term-1.csv | 4,820 |  
| 09-marks-term-2.csv | 4,820 |  
| 10-attendance-summary.csv | 1,120 |  
| 11-attendance-register-week-1.csv | 2,800 |


## Fee Realism
- Payment **profiles** are mixed: full early payment, staged installments, partial payment (arrears), a few overpayments that **carry forward as credit**, and a small number of zero payments.  
- A prior-year balance carries into 2026 for ~11% of learners (debt or credit).  
- Methods: M-PESA, bank transfer, cash, cheque — each with reference numbers and recorded by the bursary cashier.

## Exam & Attendance Realism
- Scores follow a realistic distribution per learner with subject-level ability offsets; a handful of learners are marked **ABS** for an exam.  
- Attendance: ~1.5% of learners are chronic absentees (12-24 days lost) — good for testing follow-up/alert workflows.

## How to Import (Import Studio)
1. **Students:** upload `03-students.csv`. Headers match the app template exactly (`FirstName, LastName, Admission No, Class, Stream, …`). Approve auto-create for classes (Grade 1-9 + streams A/B/C).  
2. **Fees:** upload `07-fee-payments.csv` or use `14-fee-payments-import.json` — expect a large batch; the resolution UI should match most rows by admission number.  
3. **Marks/Attendance:** import the CSV files via the exam/attendance screens.  
4. **Excel/Word/PDF:** open `15-…master-data.xlsx` for pivot-style checks; `16-…register.docx` and the PDFs replicate typical school documents.

## Stress-Test Scenarios
1. Import 560 students in one batch; verify duplicate detection (admission numbers are unique) and class/stream auto-creation.  
2. Record bulk fee payments; confirm balances, arrears lists and the top-10 debtors view, plus overpayment credit carry-over.  
3. Push marks for a whole grade; check report-card ranking and grade distribution.  
4. Run end-of-term fee statements against Term 2 arrears (see `21-…-Term-2.pdf` for expected figures).  
5. Export students/fees to Excel/CSV and confirm numbers reconcile with the master workbook.