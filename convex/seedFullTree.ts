/**
 * Full-depth EAV seed — Phase 17A.2 (doc 17).
 *
 * Seeds the exhaustive module → section → subsection → field tree for all
 * 5 buckets from a single declarative template. Idempotent: re-running
 * creates 0 rows. Everything is tagged isSystem: true / isCustom: false so
 * schools can overlay custom structure without touching the defaults.
 *
 * Seeds STRUCTURE only — no records. Backfill of records + fieldValues lives
 * in convex/backfill_eav.ts.
 */
import type { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { logAuditEntry } from "./helpers";

type InputType =
  | "text_short"
  | "text_long"
  | "number"
  | "date"
  | "boolean"
  | "dropdown_single"
  | "dropdown_multi"
  | "file";

type Bucket =
  | "learner"
  | "teaching_staff"
  | "non_teaching_staff"
  | "admin_staff"
  | "leadership";

type SemanticTag = "name" | "admNo" | "amount" | "date" | "marks" | "class" | "status";

interface SeedField {
  name: string;
  inputType: InputType;
  isRequired?: boolean;
  isEnabled?: boolean;
  order?: number;
  aliases?: string[];
  options?: string[];
  isSensitive?: boolean;
  // Phase 18: tells the engine what the school-defined field is FOR (amounts,
  // dates, marks, class, status, admission number). Never a hard-coded input —
  // the label/aliases/options stay the school's.
  semantic?: SemanticTag;
}

interface SeedSection {
  name: string;
  description?: string;
  order: number;
  isRepeatable?: boolean;
  isSensitive?: boolean;
  fields?: SeedField[];
  subsections?: SeedSection[];
}

interface SeedModule {
  bucket: Bucket;
  name: string;
  description?: string;
  order: number;
  isEnabled?: boolean;
  icon?: string;
  sections: SeedSection[];
}

// Shortcuts to keep the template readable. `order` is optional; fields without
// an explicit order are numbered by their position within the section at seed time.
const ts = (name: string, order?: number, aliases?: string[], required = false): SeedField => ({
  name, inputType: "text_short", order, aliases: aliases ?? [], isRequired: required,
});
const tl = (name: string, order?: number, aliases?: string[]): SeedField => ({
  name, inputType: "text_long", order, aliases: aliases ?? [],
});
const num = (name: string, order?: number): SeedField => ({
  name, inputType: "number", order,
});
const dt = (name: string, order?: number, aliases?: string[]): SeedField => ({
  name, inputType: "date", order, aliases: aliases ?? [],
});
const bool = (name: string, order?: number): SeedField => ({
  name, inputType: "boolean", order,
});
const dd = (name: string, order?: number, options?: string[], aliases?: string[]): SeedField => ({
  name, inputType: "dropdown_single", order, options, aliases: aliases ?? [],
});
const dm = (name: string, order?: number, options?: string[], aliases?: string[]): SeedField => ({
  name, inputType: "dropdown_multi", order, options, aliases: aliases ?? [],
});
const file = (name: string, order?: number): SeedField => ({
  name, inputType: "file", order,
});
const sens = (f: SeedField): SeedField => ({ ...f, isSensitive: true });
const sem = (f: SeedField, semantic: SemanticTag): SeedField => ({ ...f, semantic });

const TEMPLATE: SeedModule[] = [
  // ── LEARNERS ───────────────────────────────────────────────────────
  {
    bucket: "learner",
    name: "Student Record",
    description: "Core identity, admission, guardian link and documents.",
    order: 1,
    icon: "Users",
    sections: [
      {
        name: "Bio Data", description: "Basic identifying information", order: 1,
        fields: [
          sem(ts("Full Legal Name", 1, ["firstName", "lastName"], true), "name"),
          ts("Preferred Name", 2, ["preferredName"]),
          sem(dt("Date of Birth", 3, ["dateOfBirth", "DOB"]), "date"),
          dd("Gender", 4, ["male", "female", "other"], ["gender"]),
          file("Photo"),
          ts("Place of Birth", 6, ["placeOfBirth"]),
          ts("Nationality", 7, ["nationality"]),
          ts("National ID / Birth Cert Number", 8, ["nationalId"]),
          tl("Home Address", 9, ["homeAddress"]),
          ts("County/Region", 10, ["county"]),
          ts("Languages Spoken", 11),
          dd("Religion", 12, ["Christian", "Muslim", "Hindu", "Buddhist", "Traditional", "Other"]),
          dd("Blood Group", 13, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], ["bloodGroup"]),
          tl("Physical Features", 14),
        ],
      },
      {
        name: "Admission Info", description: "Enrolment details", order: 2,
        fields: [
          sem(ts("Admission Number", 1, ["admNo", "Adm No", "ADM"], true), "admNo"),
          sem(dt("Admission Date", 2, ["admissionDate"]), "date"),
          sem(dd("Class/Grade", 3, [], ["class", "className", "classId"]), "class"),
          dd("Stream/Section", 4, [], ["stream", "streamName", "streamId"]),
          num("Roll Number"),
          dd("Admission Type", 6, ["new", "transfer", "re-admission"]),
          ts("Previous School", 7),
          dm("Subjects Enrolled", 8, []),
          sem(dd("Admission Status", 9, ["active", "inactive", "graduated", "withdrawn", "transferred-out"], ["status"]), "status"),
          tl("Withdrawal Reason", 10),
          dt("Withdrawal Date", 11),
        ],
      },
      {
        name: "Guardian Link", description: "Guardian entity connection", order: 3,
        fields: [
          ts("Primary Guardian Name", 1, ["guardianName"], true),
          dd("Relationship", 2, ["Parent", "Guardian", "Sibling", "Other"], ["guardianRelation"]),
          ts("Guardian Phone", 3, ["guardianPhone"]),
          ts("Guardian Phone 2", 4, ["guardianPhone2"]),
          ts("Guardian Email", 5, ["guardianEmail"]),
          ts("Secondary Guardian", 6),
          tl("Custody Notes", 7),
          ts("Guardian Occupation", 8),
          dd("Preferred Contact Method", 9, ["call", "sms", "email", "app"]),
        ],
      },
      {
        name: "Identification Documents", description: "Uploaded official documents", order: 4,
        fields: [file("Birth Certificate"), file("National ID/Passport"), file("Passport Photo"), file("Immunization Card")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Academics",
    description: "Grades, report cards, and learning support.",
    order: 2,
    icon: "BookOpen",
    sections: [
      {
        name: "Grades/Exams", order: 1,
        subsections: [
          {
            name: "Continuous Assessment", order: 1, isRepeatable: true,
            fields: [
              dd("Subject", 1, []),
              num("CAT Score"),
              num("Assignment Score"),
              num("Project Score"),
            ],
          },
          {
            name: "Term Exams", order: 2,
            fields: [
              num("Exam Score"),
              dd("Exam Type", 2, ["CAT", "Mid-Term", "End-Term", "Mock"]),
              num("Total Marks"),
              num("Percentage"),
              dd("Grade", 5, ["A", "B", "C", "D", "E"]),
              num("Class Rank"),
              num("Stream Rank"),
              num("Overall Rank"),
            ],
          },
        ],
      },
      {
        name: "Report Cards", order: 2,
        fields: [
          file("Report Card PDF"),
          tl("Teacher Comment"),
          tl("Headteacher Comment"),
          ts("Attendance Summary"),
          dd("Promotion Recommendation", 5, ["Promote", "Repeat", "Under Review"]),
          bool("Parent Acknowledged"),
        ],
      },
      {
        name: "Learning Support", order: 3,
        fields: [bool("Special Needs Flag"), tl("IEP Notes"), bool("Remedial Class"), bool("Gifted Program")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Attendance",
    description: "Daily + period attendance and absence log.",
    order: 3,
    icon: "UserCheck",
    sections: [
      {
        name: "Absence Log", order: 1,
        fields: [
          dd("Absence Reason", 1, ["Sick", "Family", "Transport", "Other"]),
          file("Supporting Document"),
          bool("Excused"),
          bool("Parent Notified"),
        ],
      },
      {
        name: "Attendance Summary", order: 2,
        fields: [num("Term Percentage"), num("Year-to-Date Percentage"), bool("Chronic Absenteeism")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Health/Welfare",
    description: "Medical profile, clinic visits, screenings, counseling, incidents.",
    order: 4,
    icon: "Stethoscope",
    sections: [
      {
        name: "Medical Profile", order: 1,
        subsections: [
          {
            name: "Core Medical Identity", order: 1, isSensitive: true,
            fields: [
              dd("Blood Type", 1, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
              dd("Rh Factor", 2, ["Positive", "Negative"]),
              num("Weight"),
              num("Height"),
              num("BMI"),
              dt("Last Physical Exam"),
              ts("Physician Name"),
              ts("Physician Phone"),
              ts("Insurance Provider"),
              ts("Policy Number"),
              dt("Insurance Expiry"),
            ],
          },
          {
            name: "Allergies", order: 2, isRepeatable: true, isSensitive: true,
            fields: [
              ts("Allergen Name", 1, undefined, true),
              dd("Category", 2, ["Food", "Medication", "Environmental", "Other"]),
              dd("Severity", 3, ["Mild", "Moderate", "Severe"]),
              tl("Reaction", 4),
              bool("Emergency Medication Required"),
              ts("Medication Location", 6),
            ],
          },
          {
            name: "Chronic Conditions", order: 3, isRepeatable: true, isSensitive: true,
            fields: [
              ts("Condition Name", 1, undefined, true),
              ts("ICD-10 Code", 2),
              dt("Diagnosis Date"),
              dd("Severity", 4, ["Mild", "Moderate", "Severe"]),
              tl("Management Plan", 5),
              tl("Activity Restrictions", 6),
            ],
          },
          {
            name: "Current Medications", order: 4, isRepeatable: true, isSensitive: true,
            fields: [
              ts("Medication Name", 1, undefined, true),
              ts("Dosage", 2),
              dd("Frequency", 3, ["Once daily", "Twice daily", "3x daily", "As needed"]),
              dd("Route", 4, ["Oral", "Topical", "Inhalation", "Injection"]),
              ts("Prescribing Physician", 5),
              dt("Start Date"),
              dt("End Date"),
              bool("Administered at School"),
            ],
          },
          {
            name: "Immunization Record", order: 5, isRepeatable: true,
            fields: [
              ts("Vaccine Name", 1, undefined, true),
              num("Dose Number"),
              dt("Date Administered", 3, ["dateGiven"]),
              ts("Provider", 4),
              ts("Batch Number", 5),
              dt("Next Due Date"),
              dd("Compliance Status", 7, ["Complete", "Due", "Overdue"]),
            ],
          },
          {
            name: "Disability & Accessibility", order: 6,
            fields: [
              ts("Disability Type", 1),
              file("Diagnosis Documentation"),
              dm("Accommodations Required", 3, ["Wheelchair", "Visual aid", "Hearing aid", "Extra time", "Other"]),
              tl("Assistive Devices", 4),
            ],
          },
          {
            name: "Dietary & Nutrition", order: 7,
            fields: [
              dd("Restriction Type", 1, ["Allergy", "Intolerance", "Religious", "Medical", "Preference"]),
              tl("Specific Restriction", 2),
              tl("Nutritionist Notes", 3),
            ],
          },
          {
            name: "Family/Emergency Medical Context", order: 8, isSensitive: true,
            fields: [
              tl("Family Medical History", 1),
              ts("Emergency Medical Contact", 2),
              bool("Medical Consent on File"),
              tl("Special Directives", 4),
            ],
          },
        ],
      },
      {
        name: "Screenings & Growth", order: 2,
        subsections: [
          {
            name: "Vision Screening", order: 1, isRepeatable: true,
            fields: [dt("Screening Date"), ts("Screened By"), dd("Result", 3, ["Normal", "Referral", "Re-test"]), ts("Left Eye Acuity", 4), ts("Right Eye Acuity", 5), bool("Corrective Lenses")],
          },
          {
            name: "Hearing Screening", order: 2, isRepeatable: true,
            fields: [dt("Screening Date"), dd("Left Ear Result", 2, ["Normal", "Referral", "Re-test"]), dd("Right Ear Result", 3, ["Normal", "Referral", "Re-test"]), ts("Referral", 4)],
          },
          {
            name: "Dental Checkup", order: 3, isRepeatable: true,
            fields: [dt("Checkup Date"), ts("Dentist/Clinic", 2), tl("Findings", 3), tl("Treatment Recommended", 4)],
          },
          {
            name: "Growth Tracking", order: 4, isRepeatable: true,
            fields: [dt("Date"), num("Height"), num("Weight"), num("BMI"), num("Percentile")],
          },
        ],
      },
      {
        name: "Counseling", order: 3, isSensitive: true,
        subsections: [
          {
            name: "Session Log", order: 1, isRepeatable: true, isSensitive: true,
            fields: [
              dt("Session Date"),
              ts("Counselor Name", 2),
              dd("Session Type", 3, ["Individual", "Group", "Family", "Crisis"]),
              tl("Presenting Concern", 4),
              sens(tl("Session Notes", 5)),
              dd("Risk Level", 6, ["Low", "Medium", "High", "Critical"]),
              bool("Safety Plan on File"),
            ],
          },
          {
            name: "Referrals", order: 2, isSensitive: true,
            fields: [bool("External Referral Made"), ts("Referred To", 2), tl("Reason", 3), bool("Parent Informed")],
          },
          {
            name: "Follow-Up Plan", order: 3, isSensitive: true,
            fields: [tl("Plan Description", 1), dt("Review Date"), ts("Responsible Staff", 3), dd("Status", 4, ["Open", "In progress", "Closed"])],
          },
        ],
      },
      {
        name: "Incident/Injury Reports", order: 4, isSensitive: true,
        subsections: [
          {
            name: "Incident Details", order: 1, isRepeatable: true,
            fields: [dt("Incident Date/Time", 1, ["incidentDateTime"]), ts("Location", 2), tl("Description", 3), tl("Witnesses", 4), ts("Injury Type", 5), dd("Severity", 6, ["Minor", "Moderate", "Severe", "Critical"])],
          },
          {
            name: "Response", order: 2,
            fields: [tl("First Aid Given", 1), ts("Administered By", 2), bool("Hospital Referral"), file("Photos")],
          },
          {
            name: "Notification & Follow-Up", order: 3,
            fields: [bool("Guardian Notified"), file("Incident Report"), bool("Leadership Notified"), tl("Corrective Action", 4)],
          },
        ],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Discipline",
    description: "Incident log, action taken, resolution.",
    order: 5,
    icon: "ShieldAlert",
    sections: [
      {
        name: "Incident Log", order: 1,
        fields: [dt("Date", 1, ["date"]), tl("Description", 2, ["description"]), ts("Reported By", 3, ["reportedBy"]), dd("Category", 4, ["Academic", "Behavioural", "Truancy", "Other"], ["category"])],
      },
      {
        name: "Action Taken", order: 2,
        fields: [dd("Action Type", 1, ["Verbal warning", "Written warning", "Detention", "Suspension", "Expulsion", "Other"]), dt("Action Date"), ts("Duration", 4), ts("Authorized By", 5)],
      },
      {
        name: "Resolution", order: 3,
        fields: [dd("Resolution Status", 1, ["Open", "Investigating", "Resolved", "Escalated"], ["resolutionStatus"]), dt("Resolution Date"), tl("Follow-Up Notes", 3), bool("Parent Acknowledged")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Finance",
    description: "Fee structures, payments and balance summary (display on learner side).",
    order: 6,
    icon: "CircleDollarSign",
    sections: [
      {
        name: "Balance Summary", order: 1,
        fields: [num("Current Balance"), num("Overdue Amount"), dt("Overdue Since"), dd("Payment Plan Status", 4, ["On track", "In arrears", "Not applicable"])],
      },
      {
        name: "Scholarships/Bursaries", order: 2,
        fields: [ts("Sponsor Name", 1), dd("Coverage Type", 2, ["Full", "Partial", "Merit", "Need-based"]), num("Coverage Amount"), dd("Renewal Status", 4, ["Active", "Pending", "Expired"]), tl("Conditions", 5)],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Promotion/Progression",
    description: "Promotion, transfer and graduation history.",
    order: 7,
    icon: "TrendingUp",
    sections: [
      {
        name: "Transfers", order: 1,
        fields: [ts("Transfer-In School", 1), dt("Transfer-In Date"), tl("Transfer-In Reason", 3), ts("Transfer-Out School", 4), dt("Transfer-Out Date"), tl("Transfer-Out Reason", 6), bool("Transfer Letter Issued")],
      },
      {
        name: "Graduation", order: 2,
        fields: [dt("Graduation Date"), bool("Certificate Issued"), file("Final Record Snapshot")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Documents",
    description: "Official and generated documents.",
    order: 8,
    icon: "FileText",
    sections: [
      {
        name: "Official Documents", order: 1,
        fields: [file("Birth Certificate"), file("National ID/Passport"), file("Transfer Letters"), file("Medical Certificates")],
      },
      {
        name: "Generated Documents", order: 2,
        fields: [file("Report Cards"), file("Certificates")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Communication",
    description: "Notices, message history, parent meeting log.",
    order: 9,
    icon: "MessageSquare",
    sections: [
      {
        name: "Notices Sent", order: 1,
        fields: [ts("Notice Title", 1), dt("Date Sent"), dd("Channel", 3, ["SMS", "Email", "App", "Letter"]), tl("Recipients", 4), dd("Delivery Status", 5, ["Sent", "Delivered", "Failed"])],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Extracurricular",
    description: "Clubs, sports and talent participation.",
    order: 10,
    icon: "Trophy",
    sections: [
      {
        name: "Sports", order: 1,
        fields: [ts("Sport", 1), ts("Team", 2), ts("Position", 3), tl("Achievements", 4)],
      },
      {
        name: "Talent/Arts", order: 2,
        fields: [ts("Activity Type", 1), dd("Participation Level", 2, ["School", "Regional", "National", "International"]), tl("Competitions Entered", 3)],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Boarding",
    description: "Hostel accommodation and welfare.",
    order: 11,
    isEnabled: false,
    icon: "BedDouble",
    sections: [
      {
        name: "Accommodation", order: 1,
        fields: [ts("Dorm/House Name", 1, ["houseName"]), ts("Room Number", 2, ["roomNumber"]), ts("Bed Number", 3, ["bedNumber"]), ts("Matron/Patron Assigned", 4)],
      },
      {
        name: "Welfare Checks", order: 2, isRepeatable: true,
        fields: [dt("Check Date"), ts("Checked By", 2), tl("Welfare Status", 3), tl("Concerns Flagged", 4)],
      },
      {
        name: "Leave/Exeat", order: 3, isRepeatable: true,
        fields: [dt("Leave Request Date"), tl("Reason", 2), ts("Destination", 3), ts("Pickup Person", 4), dt("Return Date"), bool("Actual Return Confirmed")],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Transport",
    description: "Route/bus assignment for boarding or commuting students.",
    order: 12,
    isEnabled: false,
    icon: "Bus",
    sections: [
      {
        name: "Route Assignment", order: 1,
        fields: [ts("Route Name", 1), ts("Bus/Vehicle", 2), ts("Pickup Point", 3), ts("Drop-Off Point", 4), ts("Driver", 5)],
      },
    ],
  },
  {
    bucket: "learner",
    name: "Feeding",
    description: "Meal plan and dietary flags.",
    order: 13,
    isEnabled: false,
    icon: "Utensils",
    sections: [
      {
        name: "Meal Plan", order: 1,
        fields: [dd("Plan Type", 1, ["Full board", "Day scholar", "Special diet"]), tl("Dietary Restriction", 2), ts("Allergy Cross-Reference", 3)],
      },
    ],
  },

  // ── TEACHING STAFF ─────────────────────────────────────────────────
  {
    bucket: "teaching_staff",
    name: "Staff Record",
    description: "Bio data, employment info and documents.",
    order: 1,
    icon: "GraduationCap",
    sections: [
      {
        name: "Bio Data", order: 1,
        fields: [
          sem(ts("Full Legal Name", 1, ["firstName", "lastName"], true), "name"),
          dt("Date of Birth", 2, ["dateOfBirth"]),
          dd("Gender", 3, ["male", "female", "other"], ["gender"]),
          file("Photo"),
          ts("National ID / Passport Number", 5, ["nationalId"]),
          tl("Home Address", 6, ["homeAddress"]),
          ts("Email", 7, ["email"]),
          ts("Phone", 8, ["phone"]),
        ],
      },
      {
        name: "Employment Info", order: 2,
        fields: [
          ts("Staff Number", 1, ["staffNo"], true),
          dt("Date Joined", 2),
          dd("Employment Type", 3, ["Permanent", "Contract", "Part-time", "Intern"]),
          tl("Qualifications", 4),
          dm("Subjects Specialized", 5, []),
          dd("Category", 6, ["teaching", "non_teaching"], ["category"]),
          ts("Department", 7, ["department"]),
        ],
      },
      {
        name: "Documents", order: 3,
        fields: [file("CV"), file("Certificates"), file("ID Copy"), file("Contract")],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "Academics & Teaching Load",
    description: "Assignments, timetable, lesson planning.",
    order: 2,
    icon: "BookOpenCheck",
    sections: [
      {
        name: "Teaching Load", order: 1,
        fields: [dm("Classes Assigned", 1, []), dm("Subjects Taught", 2, []), ts("Timetable", 3)],
      },
      {
        name: "Lesson Planning", order: 2,
        fields: [ts("Scheme of Work", 1), file("Lesson Notes"), file("Teaching Resources")],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "Duty Roster",
    description: "Rotating supervisory duties.",
    order: 3,
    icon: "ClipboardList",
    sections: [
      {
        name: "Duties", order: 1, isRepeatable: true,
        fields: [dd("Duty Type", 1, ["Gate", "Lunch", "Compound", "Exam supervision"]), dt("Duty Date"), ts("Assignment", 3)],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "Staff Attendance",
    description: "Daily sign-in/out.",
    order: 4,
    icon: "UserCheck",
    sections: [
      {
        name: "Attendance Record", order: 1,
        fields: [dt("Date"), dd("Status", 2, ["Present", "Absent", "Late", "On leave"]), ts("Signed In", 4), ts("Signed Out", 5)],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "HR & Performance",
    description: "Leave, appraisals, warnings.",
    order: 5,
    icon: "Heart",
    sections: [
      {
        name: "Leave Requests", order: 1, isRepeatable: true,
        fields: [dd("Leave Type", 1, ["Annual", "Sick", "Maternity/Paternity", "Unpaid", "Emergency"]), dt("Start Date"), dt("End Date"), dd("Status", 4, ["Pending", "Approved", "Declined"]), tl("Reason", 5)],
      },
      {
        name: "Appraisals", order: 2, isRepeatable: true,
        fields: [dt("Review Date"), dd("Rating", 2, ["Outstanding", "Good", "Satisfactory", "Needs improvement"]), tl("Notes", 3)],
      },
      {
        name: "Warnings/Conduct", order: 3, isRepeatable: true,
        fields: [dt("Date"), tl("Reason", 2), dd("Severity", 3, ["Verbal", "Written", "Final"]), ts("Issued By", 4)],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "Payroll",
    description: "Salary and payment history (own record, view-only).",
    order: 6,
    icon: "CircleDollarSign",
    sections: [
      {
        name: "Salary Info", order: 1, isSensitive: true,
        fields: [num("Basic Salary"), num("Allowances"), num("Deductions"), num("Net Pay"), ts("Bank Account")],
      },
    ],
  },
  {
    bucket: "teaching_staff",
    name: "Parent Meetings",
    description: "Record of individual parent interactions.",
    order: 7,
    icon: "Users",
    sections: [
      {
        name: "Meeting Log", order: 1, isRepeatable: true,
        fields: [dt("Meeting Date"), ts("Parent Name", 2), ts("Topic", 3), tl("Outcome", 4), dd("Status", 5, ["Scheduled", "Held", "Cancelled"])],
      },
    ],
  },

  // ── NON-TEACHING STAFF ─────────────────────────────────────────────
  {
    bucket: "non_teaching_staff",
    name: "Staff Record",
    description: "Bio data, employment info and documents.",
    order: 1,
    icon: "Briefcase",
    sections: [
      {
        name: "Bio Data", order: 1,
        fields: [sem(ts("Full Legal Name", 1, ["firstName", "lastName"], true), "name"), dt("Date of Birth", 2), dd("Gender", 3, ["male", "female", "other"]), file("Photo"), ts("National ID / Passport Number", 5), tl("Home Address", 6), ts("Email", 7, ["email"]), ts("Phone", 8, ["phone"])],
      },
      {
        name: "Employment Info", order: 2,
        fields: [ts("Staff Number", 1, ["staffNo"], true), dt("Date Joined", 2), dd("Employment Type", 3, ["Permanent", "Contract", "Part-time", "Intern"]), dd("Role", 4, ["Librarian", "Nurse", "Driver", "Cook", "Watchman", "Cleaner", "Groundskeeper", "Other"]), ts("Department", 5, ["department"])],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Attendance",
    description: "Daily sign-in/out and leave.",
    order: 2,
    icon: "UserCheck",
    sections: [
      {
        name: "Attendance Record", order: 1,
        fields: [dt("Date"), dd("Status", 2, ["Present", "Absent", "Late", "On leave"]), ts("Signed In", 3), ts("Signed Out", 4)],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "HR & Performance",
    description: "Leave, appraisals, warnings.",
    order: 3,
    icon: "Heart",
    sections: [
      {
        name: "Leave Requests", order: 1, isRepeatable: true,
        fields: [dd("Leave Type", 1, ["Annual", "Sick", "Unpaid", "Emergency"]), dt("Start Date"), dt("End Date"), dd("Status", 4, ["Pending", "Approved", "Declined"])],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Payroll",
    description: "Salary and payment history (own record, view-only).",
    order: 4,
    icon: "CircleDollarSign",
    sections: [
      {
        name: "Salary Info", order: 1, isSensitive: true,
        fields: [num("Basic Salary"), num("Allowances"), num("Deductions"), num("Net Pay")],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Library",
    description: "Librarian workspace: catalog, borrow/return, fines.",
    order: 5,
    isEnabled: false,
    icon: "Library",
    sections: [
      {
        name: "Catalog", order: 1,
        fields: [ts("Title", 1), ts("Author", 2), ts("ISBN", 3), dd("Genre", 4, ["Fiction", "Non-fiction", "Textbook", "Reference"]), ts("Shelf/Location", 5), dd("Condition", 6, ["New", "Good", "Fair", "Damaged"])],
      },
      {
        name: "Borrow/Return", order: 2,
        fields: [ts("Borrower", 1), ts("Book", 2), dt("Borrowed"), dt("Due"), dt("Returned"), num("Fine")],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Health/Clinic",
    description: "Nurse workspace: clinic log, supplies, referrals.",
    order: 6,
    isEnabled: false,
    icon: "Stethoscope",
    sections: [
      {
        name: "Clinic Log", order: 1, isRepeatable: true,
        fields: [dt("Visit Date"), ts("Student", 2), tl("Reason", 3), tl("Action", 4), tl("Follow-Up", 5)],
      },
      {
        name: "Supplies", order: 2,
        fields: [ts("Item", 1), num("Stock"), num("Re-order Level"), ts("Supplier", 4)],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Transport",
    description: "Driver workspace: routes, logs, maintenance.",
    order: 7,
    isEnabled: false,
    icon: "Bus",
    sections: [
      {
        name: "Routes", order: 1,
        fields: [ts("Route Name", 1), ts("Driver", 2), ts("Vehicle", 3), tl("Pickups", 4)],
      },
      {
        name: "Maintenance", order: 2, isRepeatable: true,
        fields: [dt("Date"), ts("Vehicle", 2), tl("Work Done", 3), num("Cost"), dd("Status", 5, ["Pending", "In progress", "Done"])],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Kitchen/Catering",
    description: "Cook workspace: meal plans, supplies, dietary flags.",
    order: 8,
    isEnabled: false,
    icon: "Utensils",
    sections: [
      {
        name: "Meals", order: 1,
        fields: [dt("Date"), ts("Breakfast", 2), ts("Lunch", 3), ts("Supper", 4), num("Portions"), tl("Dietary Notes", 6)],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Gate/Security",
    description: "Watchman workspace: visitor and student logs.",
    order: 9,
    isEnabled: false,
    icon: "Shield",
    sections: [
      {
        name: "Visitor Log", order: 1, isRepeatable: true,
        fields: [dt("Date/Time"), ts("Visitor Name", 2), ts("Purpose", 3), ts("Signed In", 4), ts("Signed Out", 5)],
      },
      {
        name: "Student Log", order: 2, isRepeatable: true,
        fields: [dt("Date/Time"), ts("Student", 2), dd("Type", 3, ["Early leave", "Late arrival"]), ts("Guardian", 4)],
      },
    ],
  },
  {
    bucket: "non_teaching_staff",
    name: "Facilities",
    description: "Cleaner/groundskeeper workspace: tasks and issues.",
    order: 10,
    isEnabled: false,
    icon: "Wrench",
    sections: [
      {
        name: "Tasks", order: 1, isRepeatable: true,
        fields: [ts("Area", 1), tl("Task", 2), dd("Status", 3, ["Pending", "In progress", "Done"]), tl("Issue Reported", 4)],
      },
    ],
  },

  // ── ADMINISTRATIVE STAFF ───────────────────────────────────────────
  {
    bucket: "admin_staff",
    name: "Staff Record",
    description: "Bio data and employment info.",
    order: 1,
    icon: "Briefcase",
    sections: [
      {
        name: "Bio Data", order: 1,
        fields: [sem(ts("Full Legal Name", 1, ["firstName", "lastName"], true), "name"), dt("Date of Birth", 2), file("Photo"), ts("Email", 4, ["email"]), ts("Phone", 5, ["phone"])],
      },
    ],
  },
  {
    bucket: "admin_staff",
    name: "Finance",
    description: "Bursar home base: fee collection, payroll, expenditure.",
    order: 2,
    icon: "CircleDollarSign",
    sections: [
      {
        name: "Fee Collection", order: 1,
        fields: [ts("Student", 1), num("Amount"), dd("Method", 3, ["Cash", "M-Pesa", "Bank", "Card"]), dt("Date"), ts("Receipt No", 5), tl("Notes", 6)],
      },
      {
        name: "Payroll", order: 2, isSensitive: true,
        fields: [ts("Staff", 1), num("Amount"), dt("Period"), dd("Status", 4, ["Draft", "Approved", "Paid"]), ts("Payslip Ref", 5)],
      },
      {
        name: "Expenditure", order: 3,
        fields: [tl("Item", 1), num("Amount"), dd("Category", 3, ["Utilities", "Maintenance", "Supplies", "Salaries", "Other"]), dt("Date"), ts("Supplier", 5)],
      },
    ],
  },
  {
    bucket: "admin_staff",
    name: "Admissions",
    description: "Secretary home base: intake creates the learner record.",
    order: 3,
    icon: "ClipboardList",
    sections: [
      {
        name: "Intake Form", order: 1,
        fields: [ts("Applicant Name", 1), ts("Admission Number", 2, ["admNo"]), dd("Class", 3, []), dt("Application Date"), dd("Status", 5, ["New", "Under review", "Accepted", "Rejected", "Waitlist"]), tl("Notes", 6)],
      },
    ],
  },
  {
    bucket: "admin_staff",
    name: "Correspondence",
    description: "Letters, visitor log, calls.",
    order: 4,
    icon: "MessageSquare",
    sections: [
      {
        name: "Outgoing Letters", order: 1, isRepeatable: true,
        fields: [dt("Date"), ts("Recipient", 2), ts("Subject", 3), tl("Body", 4), dd("Status", 5, ["Draft", "Sent"])],
      },
    ],
  },
  {
    bucket: "admin_staff",
    name: "Appointments",
    description: "Scheduling for leadership meetings/visitors.",
    order: 5,
    icon: "Calendar",
    sections: [
      {
        name: "Schedule", order: 1, isRepeatable: true,
        fields: [dt("Date/Time"), ts("With", 2), ts("Purpose", 3), dd("Status", 4, ["Scheduled", "Held", "Cancelled"])],
      },
    ],
  },
  {
    bucket: "admin_staff",
    name: "Attendance",
    description: "Daily sign-in/out.",
    order: 6,
    icon: "UserCheck",
    sections: [
      {
        name: "Attendance Record", order: 1,
        fields: [dt("Date"), dd("Status", 2, ["Present", "Absent", "Late", "On leave"])],
      },
    ],
  },

  // ── LEADERSHIP ─────────────────────────────────────────────────────
  {
    bucket: "leadership",
    name: "Staff Record",
    description: "Leadership profile.",
    order: 1,
    icon: "UserCheck",
    sections: [
      {
        name: "Bio Data", order: 1,
        fields: [sem(ts("Full Legal Name", 1, ["firstName", "lastName"], true), "name"), ts("Title", 2), file("Photo"), ts("Email", 4, ["email"]), ts("Phone", 5, ["phone"])],
      },
    ],
  },
  {
    bucket: "leadership",
    name: "Roles & Permissions",
    description: "Staff accounts, permission tree, assignments, delegation.",
    order: 2,
    icon: "Shield",
    sections: [
      {
        name: "Delegations", order: 1, isRepeatable: true,
        fields: [ts("Granted To", 1), ts("Module", 2), dd("Access", 3, ["View", "Edit"]), dt("Start"), dt("End"), tl("Reason", 6)],
      },
    ],
  },
  {
    bucket: "leadership",
    name: "Compliance/Policy",
    description: "Registration, inspections, policy documents.",
    order: 3,
    icon: "ShieldAlert",
    sections: [
      {
        name: "School Registration", order: 1,
        fields: [ts("Registration Number", 1), dt("Renewal Date"), file("License/Registration Doc"), tl("Notes", 4)],
      },
      {
        name: "Inspections", order: 2, isRepeatable: true,
        fields: [dt("Inspection Date"), ts("Inspector", 2), tl("Findings", 3), tl("Action Items", 4)],
      },
      {
        name: "Policy Documents", order: 3,
        fields: [file("Code of Conduct"), file("Safety Policy"), file("Other Policies")],
      },
    ],
  },
  {
    bucket: "leadership",
    name: "Board Reporting",
    description: "Board meetings and ministry reporting.",
    order: 4,
    icon: "ClipboardList",
    sections: [
      {
        name: "Board Meetings", order: 1, isRepeatable: true,
        fields: [dt("Meeting Date"), tl("Attendees", 2), file("Minutes"), tl("Resolutions", 4)],
      },
    ],
  },
  {
    bucket: "leadership",
    name: "Broadcasts",
    description: "School-wide announcements.",
    order: 5,
    icon: "Bell",
    sections: [
      {
        name: "Announcements", order: 1, isRepeatable: true,
        fields: [ts("Title", 1), tl("Message", 2), dd("Audience", 3, ["All staff", "All parents", "All students"]), dt("Date"), dd("Channel", 5, ["SMS", "Email", "App", "Letter"])],
      },
    ],
  },
];

/**
 * Seeds the full tree for a school. Plain async helper so sibling modules
 * (seedEAV, backfill_eav) can invoke it directly without a generated-api
 * circular reference. Idempotent — safe to call on every provisioning.
 */
export async function seedFullTreeData(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
  // Optional filter: only seed modules whose names are in this set.
  // When null/undefined, seeds ALL modules (legacy behaviour).
  modulesToSeed?: Set<string> | null,
  // bare = blank canvas (spec §0): create the module shell only — no
  // sections/fields. Existing schools keep their seeded structure; new
  // schools build their own sections/fields in the Structure Builder.
  bare?: boolean,
): Promise<{ modules: number; sections: number; fields: number }> {
  const created = { modules: 0, sections: 0, fields: 0 };

  // Look up the principal role so we can seed default permissions.
  const principalRole = await ctx.db
    .query("roles")
    .withIndex("by_schoolId_key", (q) =>
      q.eq("schoolId", schoolId).eq("key", "principal" as const)
    )
    .first();
  const principalRoleId = principalRole?._id;

    async function upsertField(sectionId: any, field: SeedField, order: number) {
      const existing = await ctx.db
        .query("fields")
        .withIndex("by_sectionId", (q) => q.eq("sectionId", sectionId))
        .filter((q) => q.eq(q.field("name"), field.name))
        .first();
      if (existing) {
        // Phase 18: back-fill the semantic tag onto already-seeded system
        // fields so existing schools get the tag without a re-seed. Never
        // overwrite a school's own tag on a custom field.
        if (field.semantic && existing.isSystem && existing.semantic !== field.semantic) {
          await ctx.db.patch(existing._id, { semantic: field.semantic });
        }
        return;
      }
      await ctx.db.insert("fields", {
        schoolId,
        sectionId,
        name: field.name,
        inputType: field.inputType,
        options: field.options,
        isRequired: field.isRequired ?? false,
        isCustom: false,
        isSystem: true,
        isEnabled: field.isEnabled ?? true,
        createdBy: undefined,
        aliases: field.aliases ?? [],
        order,
        isSensitive: field.isSensitive,
        semantic: field.semantic,
      });
      created.fields++;
    }

    async function upsertSection(moduleId: any, parentId: any, sec: SeedSection) {
      const existing = await ctx.db
        .query("sections")
        .withIndex("by_moduleId", (q) => q.eq("moduleId", moduleId))
        .filter((q) => q.eq(q.field("name"), sec.name))
        .first();
      // Optional `parentId` is stored as undefined (not null), so a q.eq(..., null)
      // filter would miss rows. Dedup on name within the module, then confirm the
      // parent matches in JS. Section names are unique within a module in the seed.
      let sectionId =
        existing && (existing.parentId ?? null) === (parentId ?? null)
          ? existing._id
          : undefined;
      if (!sectionId) {
        sectionId = await ctx.db.insert("sections", {
          schoolId,
          moduleId,
          parentId: parentId ?? undefined,
          name: sec.name,
          description: sec.description,
          order: sec.order,
          isEnabled: true,
          isSystem: true,
          isRepeatable: sec.isRepeatable,
          isSensitive: sec.isSensitive,
        });
        created.sections++;
      }
      for (const [i, f] of (sec.fields ?? []).entries()) {
        await upsertField(sectionId, f, f.order ?? i + 1);
      }
      for (const sub of sec.subsections ?? []) await upsertSection(moduleId, sectionId, sub);
    }

    for (const mod of TEMPLATE) {
      // If a filter is provided, skip modules not in the set.
      if (modulesToSeed && !modulesToSeed.has(mod.name)) continue;

      const existingModule = await ctx.db
        .query("modules")
        .withIndex("by_schoolId_bucket", (q) =>
          q.eq("schoolId", schoolId).eq("bucket", mod.bucket)
        )
        .filter((q) => q.eq(q.field("name"), mod.name))
        .first();

      let moduleId = existingModule?._id;
      if (!moduleId) {
        moduleId = await ctx.db.insert("modules", {
          schoolId,
          bucket: mod.bucket,
          name: mod.name,
          description: mod.description,
          order: mod.order,
          isEnabled: mod.isEnabled ?? true,
          isCustom: false,
          isSystem: true,
          icon: mod.icon,
        });
        created.modules++;
        await logAuditEntry(ctx, schoolId, "eav.seed", { module: mod.name, bucket: mod.bucket });
      } else if (existingModule?.isSystem) {
        // Keep module metadata (icon) in sync without disturbing user toggles.
        await ctx.db.patch(existingModule._id, { icon: mod.icon });
      }

      // Blank canvas (spec §0): the module shell exists but carries no
      // sections/fields. The school defines its own structure via the
      // Structure Builder. Skipped in bare mode — full sections+fields
      // seeding remains available for backfill/existing schools.
      if (!bare) {
        for (const sec of mod.sections) {
          await upsertSection(moduleId, null, sec);
        }
      }

      // Seed "edit" permission for the principal role on this module.
      // Since resolveEffectiveAccess cascades field → section → module,
      // granting edit on the module grants full access to all its
      // sections and fields without needing a permission row per node.
      if (principalRoleId && moduleId) {
        const existingPerm = await ctx.db
          .query("permissions")
          .withIndex("by_schoolId_roleId", (q) =>
            q.eq("schoolId", schoolId).eq("roleId", principalRoleId)
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("nodeType"), "module" as const),
              q.eq(q.field("nodeId"), moduleId as string),
            )
          )
          .first();
        if (!existingPerm) {
          await ctx.db.insert("permissions", {
            schoolId,
            roleId: principalRoleId,
            nodeType: "module",
            nodeId: moduleId as string,
            access: "edit",
          });
        }
      }
    }

    return created;
  }

export const seedFullTree = internalMutation({
  args: {
    schoolId: v.id("schools"),
    // Optional: only seed modules whose names are in this array.
    // When omitted, seeds ALL modules (legacy behaviour).
    modulesToSeed: v.optional(v.array(v.string())),
    // bare = blank canvas (spec §0): module shells only, no sections/fields.
    bare: v.optional(v.boolean()),
  },
  handler: async (ctx, { schoolId, modulesToSeed, bare }) => {
    const filter = modulesToSeed && modulesToSeed.length > 0 ? new Set(modulesToSeed) : null;
    return await seedFullTreeData(ctx, schoolId, filter, bare);
  },
});
