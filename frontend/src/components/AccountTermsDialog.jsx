import React, { useId } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useUser } from "../context/userStore";

const sharedTerms = [
  ["Account security", "Use your assigned account. Keep your password and verification codes private, and sign out when you finish using a shared device."],
  ["Appropriate use", "Use the Exam Scheduler for exam administration, proctoring, and student scheduling. Keep chats and requests exam-related and respectful."],
  ["Privacy", "Access only the information needed for your role. Protect other people’s personal information in messages, screenshots, printouts, and exports. Share it only with authorized recipients who need it for exam-related duties."],
  ["Reporting concerns", "Report incorrect information, suspected unauthorized access, or account problems to your Program Head or authorized school support."],
];

const termsByRole = {
  admin: {
    name: "Administrator / Program Head",
    items: [
      ["Administrative access", "Use administrative tools only for the programs and exam operations assigned to you."],
      ["Imports and publishing", "Verify curriculum, student, room, and faculty records before using them. Confirm the proctor and workbook before uploading or replacing a teaching schedule on their behalf. Review the exam term, dates, sections, rooms, and proctor assignments before publishing a draft schedule."],
      ["Rescheduling and notifications", "Review requests within your approval authority and verify the details of any replacement exam. Use the system to communicate confirmed changes to affected students and proctors."],
      ["Attendance records and exports", "Use student rosters, sign-in sheets, and proof photos only for authorized exam operations. Keep copies secure and follow school procedures for storing and disposing of them."],
    ],
  },
  proctor: {
    name: "Proctor",
    items: [
      ["Teaching schedule", "Review the teaching schedule uploaded by your administrator. Confirm it if the days, times, and courses are correct. Use Report Incorrect Schedule if it needs correction."],
      ["Posted assignments", "Check the selected term, exam time, and room in My Assignments. Use Request Substitute promptly if you cannot attend an assignment, and check your notifications for the administrator’s response."],
      ["Attendance confirmation", "After taking attendance, sign the exam attendance list. Upload a photo showing you in the assigned room with the signed list visible, then confirm before the exam ends. Keep student faces, ID cards, and exam materials out of the photo. Contact the Program Head if you cannot complete the check-in."],
    ],
  },
  student: {
    name: "Student",
    items: [
      ["Your exam schedule", "Check the posted term, courses, dates, times, and rooms. Report missing or incorrect exams through Chat Support. Check the current dashboard before relying on a printed or saved timetable."],
      ["Irregular student selections", "If you are an irregular student, select the courses and sections you are enrolled in. Contact your Program Head if the dashboard differs from your enrollment records."],
      ["Rescheduling requests", "Give accurate details when requesting a change to your own exam. Follow your current posted schedule until the new date, time, and room are confirmed."],
    ],
  },
};

export default function AccountTermsDialog({ dialogRef, isDark, onClose }) {
  const { user } = useUser();
  const titleId = useId();
  const role = user?.role;
  const roleKey = role === "program_head" ? "admin" : role === "teacher" ? "proctor" : role;
  const terms = termsByRole[roleKey];
  const sections = [
    { title: "For all accounts", items: sharedTerms },
    ...(terms ? [{ title: `${terms.name} responsibilities`, items: terms.items }] : []),
  ];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,42rem)] overflow-y-auto rounded-2xl border shadow-2xl backdrop:bg-black/60 ${
        isDark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"
      }`}
    >
      <div className={`sticky top-0 flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6 ${
        isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
      }`}>
        <h2 id={titleId} className="text-lg font-bold sm:text-xl">Terms and Conditions</h2>
        <form method="dialog">
          <button
            type="submit"
            aria-label="Close Terms and Conditions"
            className={`rounded-lg p-2 transition focus-visible:outline-2 focus-visible:outline-blue-500 ${
              isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </form>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {sections.map(({ title, items }) => (
          <section key={title}>
            <h3 className="mb-3 text-base font-bold">{title}</h3>
            <dl className="space-y-3.5 text-sm leading-relaxed">
              {items.map(([label, description]) => (
                <div key={label}>
                  <dt className="font-semibold">{label}</dt>
                  <dd className={isDark ? "text-slate-300" : "text-slate-600"}>{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
