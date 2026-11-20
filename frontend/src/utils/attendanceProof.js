export const MAX_ATTENDANCE_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const hasCurrentAttendanceProof = (exam) => Boolean(exam?.attendance_proof?.matches_assignment);

export const attendancePhotoError = (file) => {
  if (!file || file.size === 0) return "Choose a photo showing that you are in the assigned exam room.";
  if (file.size > MAX_ATTENDANCE_PHOTO_BYTES) return "The photo is too large. Choose an image up to 10 MB.";
  if (file.type && !PHOTO_TYPES.includes(file.type)) return "Choose a JPG, PNG, or WebP photo.";
  return "";
};
