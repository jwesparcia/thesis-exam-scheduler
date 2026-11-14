"""Plan room-safe overflow batches for fixed papers on their configured day."""

from itertools import groupby


def plan_fixed_subject_batches(
    groups, timeslots, generated_slot_ids, rooms, posted_exams,
    section_sizes, section_limits, break_after_exam,
):
    fixed = {index: group for index, group in enumerate(groups) if group.get("is_fixed")}
    if not fixed:
        return groups

    def interval(slot):
        return (slot.date, slot.start_time.hour * 3600 + slot.start_time.minute * 60,
                slot.end_time.hour * 3600 + slot.end_time.minute * 60)

    def overlaps(first, second):
        return first[0] == second[0] and first[1] < second[2] and second[1] < first[2]

    room_bookings = {room.id: [] for room in rooms}
    section_bookings = {}
    for exam in posted_exams:
        if not exam.timeslot:
            continue
        booking = interval(exam.timeslot)
        if exam.room_id in room_bookings:
            room_bookings[exam.room_id].append(booking)
        section_bookings.setdefault(exam.section_id, []).append((
            *booking, break_after_exam(exam.subject.category if exam.subject else "major"),
        ))

    candidates_by_group = {}
    pending = []
    for index, group in fixed.items():
        primary = timeslots[group["fixed_slot_id"]]
        candidates_by_group[index] = {
            slot.id for slot in timeslots.values()
            if slot.id in generated_slot_ids and slot.date == primary.date
            and slot.start_time >= primary.start_time
            and (interval(slot)[2] - interval(slot)[1]) == group["duration"] * 60
        }
        for position, (section, subject) in enumerate(group["sections"]):
            pending.append((index, position, section, subject))

    candidate_ids = set().union(*candidates_by_group.values())
    ordered_slots = sorted((timeslots[slot_id] for slot_id in candidate_ids),
                           key=lambda slot: (slot.date, slot.start_time, slot.end_time))
    batches = {}
    reserved_rooms = {}

    def priority(task, slot):
        index, position, section, _ = task
        previous_ends = [used[2] for used in section_bookings.get(section.id, [])
                         if used[0] == slot.date and used[2] <= interval(slot)[1]]
        # Finish the next paper for sections already taking exams before
        # starting another set of sections, including across exam durations.
        return (0 if previous_ends else 1, max(previous_ends) if previous_ends else 0,
                timeslots[fixed[index]["fixed_slot_id"]].start_time,
                index, -section_sizes[section.id], position)

    for _, simultaneous_slots in groupby(ordered_slots, key=lambda slot: (slot.date, slot.start_time)):
        start_slots = sorted(simultaneous_slots, key=lambda slot: min(
            (priority(task, slot) for task in pending if slot.id in candidates_by_group[task[0]]),
            default=(2,),
        ))
        for slot in start_slots:
            booking = interval(slot)
            available_rooms = [room for room in rooms
                               if not any(overlaps(booking, used) for used in room_bookings[room.id])]
            if not available_rooms:
                continue
            eligible = sorted((task for task in pending if slot.id in candidates_by_group[task[0]]),
                              key=lambda task: priority(task, slot))
            completed = set()
            for index, position, section, subject in eligible:
                if not available_rooms:
                    break
                day_bookings = [used for used in section_bookings.get(section.id, []) if used[0] == slot.date]
                required_break = fixed[index]["break_seconds_by_section"][section.id]
                if len(day_bookings) >= section_limits[section.id]:
                    continue
                if any(
                    overlaps(booking, used)
                    or (used[2] <= booking[1] and booking[1] - used[2] < used[3])
                    or (booking[2] <= used[1] and used[1] - booking[2] < required_break)
                    for used in day_bookings
                ):
                    continue
                suitable = [room for room in available_rooms if (room.capacity or 40) >= section_sizes[section.id]]
                if not suitable:
                    continue
                room = min(suitable, key=lambda room: (
                    0 if room.id == section.preferred_room_id else 1,
                    (room.capacity or 40) - section_sizes[section.id], room.name,
                ))
                batches.setdefault((index, slot.id), []).append((section, subject))
                reserved_rooms.setdefault((index, slot.id), []).append(room.id)
                room_bookings[room.id].append(booking)
                section_bookings.setdefault(section.id, []).append((*booking, required_break))
                available_rooms.remove(room)
                completed.add((index, position))
            pending = [task for task in pending if (task[0], task[1]) not in completed]

    if pending:
        index = pending[0][0]
        primary = timeslots[fixed[index]["fixed_slot_id"]]
        remaining = sum(task[0] == index for task in pending)
        raise ValueError(
            f"Unable to finish fixed subject '{fixed[index]['sections'][0][1].name}' on its fixed day "
            f"{primary.date} at or after {primary.start_time.strftime('%I:%M %p')}: {remaining} section exam(s) "
            "cannot fit with the available rooms, seat capacities, section breaks, and daily limits. "
            "Add suitable rooms or move the fixed start earlier. Fixed batches never spill into another day."
        )

    changed_days = {
        timeslots[slot_id].date for (index, slot_id) in batches
        if slot_id != fixed[index]["fixed_slot_id"]
    }
    result = []
    for index, group in enumerate(groups):
        if index not in fixed or timeslots[group["fixed_slot_id"]].date not in changed_days:
            # Keep uncontested fixed papers and all ordinary papers unchanged.
            result.append(group)
            continue
        group_batches = [(slot.id, batches[(index, slot.id)]) for slot in ordered_slots if (index, slot.id) in batches]
        starts_after_original = group_batches[0][0] != group["fixed_slot_id"]
        for number, (slot_id, sections) in enumerate(group_batches, start=1):
            result.append({
                **group,
                "name": f"{group['name']} batch {number}" if len(group_batches) > 1 else group["name"],
                "sections": sections,
                "batch_number": number + int(starts_after_original),
                "allowed_slots": [slot_id], "preferred_slots": [slot_id], "fixed_slot_id": slot_id,
                # Reserve this room pool so later batches retain their seating
                # capacity even when exams of different durations overlap.
                "fixed_room_ids": reserved_rooms[(index, slot_id)],
            })
    return result
