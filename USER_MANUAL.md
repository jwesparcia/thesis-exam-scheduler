# Automated Examination Timetable and Proctor Scheduling System
# Master System User Manual (All User Roles)

**Document Version:** 2.4.0 (Current System Release)  
**Applicable Roles:** Program Head / Administrator, Faculty Proctors, Regular & Irregular Students  
**System Architecture:** FastAPI Backend + React 19 / Vite Frontend + PostgreSQL + Redis + Genetic Algorithm Engine  

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Program Head / Administrator Manual](#2-program-head--administrator-manual)
   - [2.1 Examination Schedule Generator (Genetic Algorithm Engine)](#21-examination-schedule-generator-genetic-algorithm-engine)
   - [2.2 Master Timetable Views & Excel Export](#22-master-timetable-views--excel-export)
   - [2.3 Subject Management & Custom Exam Durations](#23-subject-management--custom-exam-durations)
   - [2.4 Room Management & Dynamic Seating Capacities](#24-room-management--dynamic-seating-capacities)
   - [2.5 Proctor Availability Management & Live Attendance Monitoring](#25-proctor-availability-management--live-attendance-monitoring)
   - [2.6 Student Rescheduling & Irregular Student Smart Resolution](#26-student-rescheduling--irregular-student-smart-resolution)
   - [2.7 Academic Distribution Rules Engine](#27-academic-distribution-rules-engine)
   - [2.8 Data Ingestion (Curriculum, Proctors, Students) & Section Attendance Sheets](#28-data-ingestion-curriculum-proctors-students--section-attendance-sheets)
   - [2.9 In-App Real-Time Chat & Notification Broadcasts](#29-in-app-real-time-chat--notification-broadcasts)
3. [Faculty Proctor Manual](#3-faculty-proctor-manual)
   - [3.1 Supervisory Assignments Dashboard (Grid View vs List View)](#31-supervisory-assignments-dashboard-grid-view-vs-list-view)
   - [3.2 On-Site Exam Room Attendance Check-in](#32-on-site-exam-room-attendance-check-in)
   - [3.3 Teaching Schedule Upload & Availability Matrix](#33-teaching-schedule-upload--availability-matrix)
   - [3.4 Workload Safeguards & The 2-Consecutive Duty Rule](#34-workload-safeguards--the-2-consecutive-duty-rule)
   - [3.5 In-App Chat Support with Administration and Students](#35-in-app-chat-support-with-administration-and-students)
   - [3.6 Notification Center, Theme Settings & Profile Management](#36-notification-center-theme-settings--profile-management)
4. [Student Manual (Regular & Irregular Students)](#4-student-manual-regular--irregular-students)
   - [4.1 Reading Your Personalized Exam Timetable](#41-reading-your-personalized-exam-timetable)
   - [4.2 Automated Conflict Detection & Exam Clashes](#42-automated-conflict-detection--exam-clashes)
   - [4.3 Smart Rescheduling & Automated Slot Assignment](#43-smart-rescheduling--automated-slot-assignment)
   - [4.4 The 5:00 PM Consultation Area Overflow Protocol](#44-the-500-pm-consultation-area-overflow-protocol)
   - [4.5 Tracking Petition Statuses & Administrator Feedback](#45-tracking-petition-statuses--administrator-feedback)
   - [4.6 Customized Schedule Builder for Irregular Students](#46-customized-schedule-builder-for-irregular-students)
   - [4.7 In-App Direct Chat with Proctors and Administrators](#47-in-app-direct-chat-with-proctors-and-administrators)
5. [Frequently Asked Questions (FAQ) & Troubleshooting](#5-frequently-asked-questions-faq--troubleshooting)
6. [Policy & Constraint Reference Matrix](#6-policy--constraint-reference-matrix)

---

## 1. System Overview & Architecture

The **Automated Examination Timetable and Proctor Scheduling System** eliminates common scheduling failures—such as room double-bookings, overlapping student exam slots, faculty teaching clashes, and uneven subject distribution—by combining mathematical constraint programming with a multi-generation **Genetic Algorithm (GA)**.

### Core Mathematical & Operational Principles:
- **Strict Hard Constraints (Must Never Be Violated):**
  1. *Zero Student Section Conflicts:* No student cohort or section is scheduled for multiple exams at the same time.
  2. *Mandatory Break Intervals:* Admin-configured rest intervals (e.g., 15 or 30 minutes) between consecutive exams per section to prevent cognitive exhaustion.
  3. *Room Capacity Hard Limit:* Section enrollment must not exceed the maximum seating capacity of the assigned room ($Enrollment \le RoomCapacity$).
  4. *Zero Room Overlaps:* No room is assigned to more than one exam session during any timeslot.
  5. *Zero Proctor Clashes:* Proctors are never assigned to supervise exams during hours when they have scheduled teaching classes or outside their declared contractual availability.
  6. *2-Consecutive Proctor Duty Cap:* Proctors cannot be assigned more than 2 consecutive exam slots without a mandatory break period.
  7. *Building & Wing Restrictions:* Exams and rescheduled requests must remain within designated departmental wings (College vs Senior High School).
- **Soft Constraints (Optimized by GA Fitness Scoring):**
  1. *Same-Floor & Cluster Optimization:* Minimizes student and faculty transit by scheduling sections on the same floor level whenever feasible.
  2. *Room Load Balancing:* Spreads students evenly across available venues to optimize personal workspace and ventilation.
  3. *Departmental Proctor Matching:* Assigns proctors from matching academic departments before utilizing cross-departmental pools.
  4. *Subject Workload Spacing:* Balances major technical courses across distinct examination days according to institutional distribution rules.

---

## 2. Program Head / Administrator Manual

The Program Head dashboard serves as the administrative command center for the entire examination lifecycle.

### 2.1 Examination Schedule Generator (Genetic Algorithm Engine)

#### Purpose:
Executes the AI-driven scheduling engine to generate a multi-day examination timetable for College or Senior High School (SHS).

#### Step-by-Step Procedure:
1. **Navigate:** Click **Generate Schedule** under the *Scheduling* group in the left sidebar.
2. **Select Parameters:**
   - **Academic Department:** Select `College` or `Senior High School (SHS)`.
   - **Examination Term:** Select `Prelim`, `Midterm`, `Semi-Final`, or `Final`.
   - **Date Range:** Select the **Start Date** and **End Date** of the examination week.
3. **Configure Section-Preferred Rooms (Optional Override):**
   - In the section roster table, locate sections with specialized room requirements (e.g., `BSIT 3-201` requiring a computer lab).
   - Use the **Preferred Room** dropdown to pin that section to a specific room (e.g., `Computer Lab 1 (Cap: 40)`). The GA engine will prioritize reserving this room for all exams of that section.
4. **Exclude Subjects:**
   - Use the **Exclude Subjects** search input to exclude non-classroom subjects (e.g., Online-only courses, OJT/Practicum, Physical Education, Thesis Defense).
   - Check the boxes next to subjects that should be omitted from the automated timetable.
5. **Run GA Optimization:**
   - Click **Generate Schedule**.
   - Monitor the live progress bar through the four GA execution phases:
     - *Phase 1:* Chromosome Population Initialization & Hard Constraint Validation
     - *Phase 2:* Crossover, Mutation, and Fitness Evaluation
     - *Phase 3:* Soft Constraint Optimization (Same-floor room clustering, break interval enforcement)
     - *Phase 4:* Proctor Availability Matching & 2-Consecutive Duty Verification
6. **Review Draft & Publish:**
   - Review generated draft slots for conflicts or warnings.
   - Click **Publish Schedule**. Once published, the timetable becomes immutable and is instantly visible to all faculty proctors and enrolled students.

---

### 2.2 Master Timetable Views & Excel Export

#### Purpose:
Inspects published and draft timetables, filters by criteria, and downloads officially formatted spreadsheets for institutional archiving.

#### Features & Usage:
- **Dual View Modes:**
  - **Grid / Matrix View:** Displays a visual 2D matrix of examination dates, timeslots, and room allocations. Ideal for auditing room occupancy and overall day balance.
  - **List / Table View:** Presents a chronological tabular list showing Course Code, Subject Title, Section, Room, Floor, Proctor, and Headcount.
- **Dynamic Multi-Filters:**
  - Filter by **Date**, **Room Code**, **Section**, **Proctor Name**, or **Course**.
- **Master Excel Export (`.xlsx`):**
  - Click **Export to Excel** in the top-right toolbar.
  - The system downloads a styled spreadsheet with separate tabs for College Timetables, SHS Timetables, and Proctor Duty Rosters.

---

### 2.3 Subject Management, Durations & Shared Subjects

#### Purpose:
Configures custom allotted examination durations, exam terms, and multi-program shared course assignments (General Education and common Major subjects) across all sections.

#### Key Features:
- **Centralized Shared Subjects:** Instead of creating duplicate subject rows for every section or program, General Education courses (e.g., *Understanding the Self*, *Purposive Communication*, *Mathematics in the Modern World*) and common majors (e.g., *Intro to Computing* for IT & CS) are defined once and mapped across all relevant degree programs.
- **Multi-Program Assignment (`SubjectProgram`):** Link a single subject to multiple programs/strands with quick-selection buttons (**+ All College**, **+ All SHS**). The AI engine automatically generates synchronized exams across all sections under the selected programs.
- **One-Click Subject Consolidation:** The **Consolidate Shared** button automatically detects duplicate subjects with matching names and year levels, merges them into a single canonical record, links all degree programs via `SubjectProgram`, and re-links existing teacher teachings and exams with zero data loss.
- **Duration Configurations:**
  - **60 Minutes:** Recommended for 1 to 2-unit minor courses or values education.
  - **75 Minutes (Standard):** Universal institutional standard for collegiate lecture subjects and SHS strands.
  - **120 Minutes:** Reserved for rigorous technical majors (e.g., BSA accounting simulations, engineering calculus).

#### Procedure:
1. Navigate to **Subject Durations** in the left sidebar.
2. Click **Consolidate Shared** to merge duplicate subjects into unified multi-program entries across curricula.
3. To assign a subject to multiple programs manually, click **Edit**, navigate to **Multi-Program Assignment**, click **+ All College** or **+ All SHS**, and click **Save Changes**.
4. Adjust duration or exam terms inline or in bulk, then click **Save**. The scheduler automatically synchronizes timeslots across all assigned sections during the next generation run.

---

### 2.4 Room Management & Dynamic Seating Capacities

#### Purpose:
Registers campus physical infrastructure, updates seating limits, and configures building restriction zones.

#### Room Inventory Properties:
- **Room Code:** Unique identifier (e.g., `RM-301`, `COMP-LAB-1`, `CONSULT-1`).
- **Building Name:** Campus wing (e.g., `Main Building`, `SHS Wing`, `IT Annex`).
- **Floor Level:** Integer floor number (used by the engine for same-floor transit optimization).
- **Seating Capacity:** Maximum number of examinees permitted in the room simultaneously.
- **Special Designation:**
  - `Consultation Area`: Dedicated overflow room reserved for after 5:00 PM irregular student clashes.

#### Capacity Enforcement Rule:
The scheduling engine enforces $Enrollment \le RoomCapacity$. If a section of 45 students is scheduled into a room with capacity 40, the system flags a **Capacity Breach** error and prevents schedule publishing until an appropriately sized venue is allocated.

---

### 2.5 Proctor Availability Management & Live Attendance Monitoring

#### Purpose:
Uploads faculty teaching hours to prevent supervisory conflicts and tracks proctor room presence in real-time.

#### 1. Faculty Loading Ingestion:
1. Open **Proctor Management**.
2. Upload the official faculty loading spreadsheet (`.xlsx`).
3. The engine extracts teacher lecture and lab hours and marks those blocks as **Unavailable**.
4. Enforces faculty **Start Time** and **End Time** boundaries according to contractual employment hours.

#### 2. Faculty Exclusions & Fairness Limits:
- Toggle the **Exclude from Proctoring** switch for Deans, Research Directors, part-time instructors, or staff on official leave.
- The system automatically enforces the **2-Consecutive Duty Limit**: No proctor will be assigned to more than 2 consecutive examination slots.

#### 3. Real-Time Proctor Attendance Monitoring Board:
1. Open **Proctor Monitoring** in the sidebar during active examination days.
2. Active rooms display real-time status indicators:
   - `Pending` (Yellow): Proctor has not yet checked in.
   - `Checked In` (Green): Proctor has verified presence at the room.
   - `Late / Attention` (Red): Proctor has not checked in 10 minutes past exam commencement.
3. **Emergency Substitute Re-assignment:** If a proctor fails to report, click **Reassign Proctor** to select an available standby faculty member.

---

### 2.6 Student Rescheduling & Irregular Student Smart Resolution

#### Purpose:
Manages student petitions for overlapping examinations caused by cross-year or irregular enrollments.

#### Irregular Student Automated Slot Assignment Workflow:
When an irregular student submits a conflict petition, approving the request initiates the automated placement solver:
1. **Earliest Conflict-Free Timeslot:** The solver searches for the earliest daytime slot on the scheduled exam date that has zero conflict with any other exam the student is taking.
2. **Mandatory 15-Minute Break:** Ensures the student has at least 15 minutes of rest before or after adjacent exams.
3. **Room Capacity & Load Balancing:** Selects a room within the student's designated building that has available capacity and the lowest current student headcount.
4. **After 5:00 PM Consultation Area Fallback:**
   - If all daytime slots (7:00 AM – 5:00 PM) are fully booked or conflict with other student subjects, the engine automatically routes the rescheduled exam to **5:00 PM onwards in the Consultation Area**.
   - These slots are scheduled *without a proctor*, and the system generates an immediate high-priority alert for the Program Head to personally appoint an examiner.

#### Manual Review Workflow:
1. Click **Manual Review** on any pending petition.
2. Inspect conflicting subjects, overlapping timeslots, and attached medical or institutional proof documents.
3. Manually select an alternate Date, Timeslot, and Room.
4. The system validates building restrictions and room capacity in real time.
5. Click **Approve & Reschedule** or **Reject** with custom feedback remarks.

---

### 2.7 Academic Distribution Rules Engine

#### Purpose:
Enforces institutional curriculum distribution directives to prevent student exam fatigue.

#### Configuration Options:
- **Category Time Windows:**
  - *General Education (GE):* Restrict GE exams to morning sessions across Days 1–3.
  - *Major / Professional Courses:* Spread heavy technical subjects across alternating days.
  - *SHS Core vs Specialized:* Core subjects in morning blocks; specialized strands in afternoon blocks.
- **Daily Student Exam Limits:**
  - Cap maximum exams per section per day (e.g., maximum 2 or 3 exams daily).

---

### 2.8 Data Ingestion (Curriculum, Proctors, Students) & Section Attendance Sheets

#### Features:
- **Curriculum & Catalog Import:** Upload Excel rosters containing course codes, titles, prerequisites, and lecture/lab unit distributions.
- **Proctor Accounts Import:** Bulk ingest faculty profiles, departmental affiliations, and contract hours.
- **Student Accounts Import:** Bulk ingest student rosters with automatic classification into **Regular** or **Irregular** based on curriculum adherence.
- **Section List & Printable Attendance Sheets:**
  - View enrolled students per section.
  - Click **Export Attendance Sheet** to download official printable room sign-in sheets for proctors.

---

### 2.9 In-App Real-Time Chat & Notification Broadcasts

- **Directory Messaging:** Search for any faculty proctor or student to initiate direct communication regarding room directions or special accommodations.
- **Message Management:** Edit typos in sent messages, delete messages, or clear message threads with confirmation modals.
- **Notification Broadcasts:** Publishing schedules or approving reschedule petitions triggers instant in-app alerts and automated transactional email notifications.

---

## 3. Faculty Proctor Manual

The Proctor Portal is tailored for mobile, tablet, and desktop devices to facilitate duty tracking and attendance verification.

### 3.1 Supervisory Assignments Dashboard (Grid View vs List View)

#### Viewing Your Timetable:
1. Log in with your faculty credentials.
2. The **My Assignments** tab opens by default.
3. Each supervisory card displays:
   - **Exam Date & Timeslot Range:** (e.g., `Monday, Oct 26 | 7:30 AM - 9:00 AM`).
   - **Venue Location:** Room code, building name, and floor number (e.g., `Room 402, 4th Floor`).
   - **Course Details:** Subject code, descriptive title, and assigned student section (e.g., `BSIT 3-201`).
   - **Student Headcount:** Total examinees expected in the room.

#### View Modes:
- **Grid View:** Interactive date-by-date cards with horizontal scrolling.
- **List View:** Chronological tabular view ideal for printing personal duty schedules.

---

### 3.2 On-Site Exam Room Attendance Check-in

#### Mandatory Procedure:
1. Arrive at your assigned examination venue **15 minutes prior** to the exam start time.
2. Open the **My Assignments** tab on your smartphone, tablet, or laptop.
3. Locate the active assignment for the current timeslot.
4. Click the green **Check In** button.
5. The badge status changes immediately from `Pending` to `Checked In`.
6. The Program Head monitoring board updates simultaneously, confirming room supervision coverage.

> [!WARNING]
> If an unexpected emergency or medical issue prevents you from proctoring an assigned session, immediately notify the Program Head via the in-app **Chat** tab so an emergency substitute can be deployed.

---

### 3.3 Teaching Schedule Upload & Availability Matrix

#### Procedure:
1. Navigate to **My Schedule** in the navigation bar.
2. Click **Choose File** and select your official faculty load Excel spreadsheet (`.xlsx`).
3. Click **Confirm Upload**.
4. The system parses your classroom teaching assignments and blocks out those hours on your availability matrix.
5. Review your weekly teaching grid to verify that all class slots are highlighted and protected from exam duties.

---

### 3.4 Workload Safeguards & The 2-Consecutive Duty Rule

To safeguard faculty well-being and maintain alertness during exam supervision, the scheduling engine strictly enforces:
- **Maximum 2 Consecutive Slots:** You will never be assigned to more than 2 back-to-back exam sessions. After supervising two consecutive slots, the system mandates a rest period.
- **Operating Hours Compliance:** Supervisory duties are strictly confined within your contractual daily start time and end time.

---

### 3.5 In-App Chat Support with Administration and Students

- **Chat Tab:** Access real-time messaging with Program Heads and students enrolled in your assigned sections.
- **Message Editing & Deletion:** Hover over any message you have sent to make edits or delete it.

---

### 3.6 Notification Center, Theme Settings & Profile Management

- **Notification Bell:** Live bell counter alerts you to newly published timetables, emergency room shifts, or reminders.
- **Theme Toggle:** Switch seamlessly between **Light Mode** and **Dark Mode** for optimal viewing in any room lighting.
- **Password Security:** First-time logins prompt a secure password update modal.

---

## 4. Student Manual (Regular & Irregular Students)

The Student Portal provides students with clear timetable access, conflict resolution tools, and direct administrative support.

### 4.1 Reading Your Personalized Exam Timetable

1. Log in with your student credentials.
2. Navigate to **My Schedule**.
3. Each exam block outlines:
   - **Subject Code & Title:** (e.g., `ITEC 301 - Advanced Database Systems`).
   - **Exam Date & Window:** (e.g., `Wednesday, Oct 28 | 9:15 AM - 10:45 AM`).
   - **Room & Building Floor:** (e.g., `Room 302, 3rd Floor, Main Building`).
   - **Assigned Proctor:** Name of the faculty examiner.
4. **Print / Export:** Click **Export Timetable** to generate a printable PDF or image copy.

---

### 4.2 Automated Conflict Detection & Exam Clashes

If you are an irregular student taking subjects across different year levels or sections, the system's conflict detection engine actively audits your schedule:
- **Overlapping Exams:** Two exams falling within the same timeslot.
- **Back-to-Back Exams Without Rest:** Exams scheduled without the required 15-minute recovery interval.
- **Visual Alert:** A prominent red **Conflict Detected** banner appears over your schedule, and clashing cards are highlighted in red.
- **Direct Action:** Click **Request Reschedule** directly on the conflicting card to start the resolution process.

---

### 4.3 Smart Rescheduling & Automated Slot Assignment

#### Automated Placement for Irregular Students:
When submitting a rescheduling request, irregular students **do not need to guess open timeslots**:
1. Click **Request Reschedule** on the conflicting subject.
2. State your reason and upload supporting evidence (e.g., conflict screenshot, medical certificate).
3. Click **Submit Request**.
4. When the Program Head approves the petition, the system's automated placement algorithm:
   - Calculates the earliest conflict-free timeslot on your exam date.
   - Guarantees a mandatory **15-minute rest interval** before and after other exams.
   - Assigns you to a room with the lowest headcount within capacity limits.
   - Respects building and departmental restrictions.

---

### 4.4 The 5:00 PM Consultation Area Overflow Protocol

#### What happens if all daytime slots are full?
If no conflict-free daytime timeslot (7:00 AM – 5:00 PM) fits your schedule due to full room capacities or subject overlaps:
1. The system automatically reschedules your exam to **5:00 PM onwards in the Consultation Area**.
2. This assignment is created without a proctor, triggering an immediate notification for the Program Head.
3. The Program Head will personally assign a dedicated examiner for your consultation session.

---

### 4.5 Tracking Petition Statuses & Administrator Feedback

Track all submitted petitions under **My Rescheduling Requests**:
- `PENDING` (Yellow): Your petition is awaiting Program Head review.
- `APPROVED` (Green): Your exam has been successfully rescheduled. The card displays your new date, timeslot, and room number.
- `REJECTED` (Red): Your petition was declined. Click to view the administrator's explanatory remarks.

---

### 4.6 Customized Schedule Builder for Irregular Students

If you are cross-enrolled across multiple sections:
1. Click the **Customized Schedule** tab.
2. Select your current **Degree Program**.
3. Search and select all courses you are taking this term.
4. Use the **Aligned Subjects** helper to automatically identify matching sections.
5. For cross-enrolled subjects, select the specific section attended (e.g., `BSIT 3-201` for major, `BSIT 2-202` for elective).
6. Click **Save My Selections**. Your personalized unified exam timetable will compile automatically.

---

### 4.7 In-App Direct Chat with Proctors and Administrators

- Click the **Chat** tab to reach out directly to your assigned proctors or Program Heads.
- Ask questions regarding exam venue locations, approved rescheduling requests, or special accommodations.

---

## 5. Frequently Asked Questions (FAQ) & Troubleshooting

### For Program Heads & Administrators:
**Q: What should I do if the Genetic Algorithm indicates a room capacity failure during generation?**  
*A:* Navigate to **Room Management** and verify that your registered room capacities can accommodate your largest student sections. Alternatively, in the **Generate Schedule** console, assign sections to larger venues (e.g., Computer Labs or Auditoriums) using the **Preferred Room** selector.

**Q: Can I manually adjust a timeslot or room after generating the schedule?**  
*A:* Yes. In **Generated Exam Schedules**, you can perform manual overrides on individual exam slots before or after publishing.

**Q: How does the system prevent proctor burnout during finals week?**  
*A:* The engine enforces the 2-consecutive proctor duty rule and balances total supervisory hours across all available faculty proctors.

---

### For Faculty Proctors:
**Q: What if my teaching load changes after I already uploaded my schedule?**  
*A:* Simply upload your updated faculty load spreadsheet under **My Schedule**. The system will re-parse your teaching hours and block out updated class slots.

**Q: I arrived at the exam room but forgot to click Check In until 10 minutes into the exam. What happens?**  
*A:* You can still click **Check In**. If the Program Head already noticed the late check-in on the monitoring board, send a quick note via the in-app **Chat** to confirm you are in the room.

---

### For Students:
**Q: I have two exams scheduled at 9:00 AM on the same day. What should I do?**  
*A:* Click **Request Reschedule** on one of the conflicting exam cards. As an irregular student, the system will automatically compute the earliest valid conflict-free slot for you once the Program Head approves your petition.

**Q: What does it mean if my exam is rescheduled to the "Consultation Area at 5:00 PM"?**  
*A:* This means no daytime slots were available without creating another conflict or exceeding room capacity. Your exam will take place in the Consultation Area, and an administrator will supervise the session.

---

## 6. Policy & Constraint Reference Matrix

| Constraint / Feature | Implementation Type | Rule Definition & System Behavior |
| :--- | :--- | :--- |
| **Section Clashes** | Hard Constraint | A section or student cohort is never scheduled for overlapping exams simultaneously. |
| **Consecutive Break Interval** | Hard Constraint | Configurable break (15 or 30 minutes) enforced between consecutive exams per section. |
| **Room Seating Limits** | Hard Constraint | Section enrollment cannot exceed room seating capacity ($Enrollment \le Capacity$). |
| **Proctor Teaching Clashes** | Hard Constraint | No proctoring duties assigned during faculty teaching lecture/lab hours. |
| **2-Consecutive Proctor Cap** | Hard Constraint | Proctors are capped at maximum 2 consecutive exam slots; mandatory rest follows. |
| **Proctor Availability Window**| Hard Constraint | Duties are strictly scheduled within proctor's declared contractual start/end hours. |
| **Building Restrictions** | Hard Constraint | Exams and reschedules remain within designated department building wings. |
| **Same-Floor Optimization** | Soft Constraint | Minimizes stair climbing and transit by scheduling a section on the same floor level. |
| **Room Load Balancing** | Soft Constraint | Distributes students evenly across available rooms to optimize space and safety. |
| **Consultation Area Overflow**| Fallback Protocol | Irregular reschedules that cannot fit before 5:00 PM route to 5:00 PM Consultation Area. |
