// Turns technical/server error text into messages users can understand.
const RULES = [
  [/network error|failed to fetch|econnrefused|err_network|load failed/i,
    "Cannot reach the server. Please check your internet connection or make sure the system is running, then try again."],
  [/timeout|timed out|econnaborted/i,
    "The server took too long to respond. Please wait a moment and try again."],
  [/foreign key|still referenced/i,
    "This record is still being used by other data (such as exams, students or schedules), so it cannot be changed or removed."],
  [/duplicate key|unique constraint/i,
    "This record already exists. Please check for duplicates and try again."],
  [/psycopg2|sqlalchemy|\[sql:|background on this error|traceback|keyerror|indexerror|attributeerror|typeerror|nonetype|object has no attribute|unsupported operand|list index|internal server error/i,
    "Something went wrong on the server. Please try again, and contact the system administrator if the problem continues."],
];

const STATUS_FALLBACK = {
  400: "The request could not be processed. Please check your input and try again.",
  401: "Your session has expired or your login is invalid. Please sign in again.",
  403: "You do not have permission to do this action.",
  404: "The requested item could not be found. It may have been deleted or moved.",
  409: "This action conflicts with existing data. Please refresh the page and try again.",
  413: "The file is too large to upload.",
  422: "Some of the information you entered is invalid. Please check the fields and try again.",
  429: "Too many requests. Please wait a moment before trying again.",
  500: "Something went wrong on the server. Please try again, and contact the system administrator if the problem continues.",
  502: "The server is temporarily unavailable. Please try again shortly.",
  503: "The server is temporarily unavailable. Please try again shortly.",
  504: "The server took too long to respond. Please try again.",
};

const FIELD_LABELS = { school_email: "School email", email: "Email", password: "Password", student_id: "Student ID" };

export const friendlyText = (text) => {
  if (typeof text !== "string") return text;
  for (const [pattern, message] of RULES) {
    if (pattern.test(text)) return message;
  }
  return text;
};

const formatValidationItem = (item) => {
  if (typeof item === "string") return item;
  const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
  const label = field ? (FIELD_LABELS[field] || String(field).replace(/_/g, " ")) : null;
  const msg = item?.msg || "is invalid";
  if (/field required/i.test(msg)) return label ? `${label} is required.` : "A required field is missing.";
  if (/valid email/i.test(msg)) return "Please enter a valid email address.";
  if (/not a valid integer|valid number|unable to parse/i.test(msg)) return label ? `${label} must be a number.` : "A number is expected.";
  return label ? `${label}: ${msg}` : msg;
};

// Produces a friendly message for an axios error (or any error).
export const getFriendlyErrorMessage = (err, fallback) => {
  if (!err) return fallback || STATUS_FALLBACK[500];
  const status = err.response?.status;
  if (!err.response) {
    return friendlyText(err.message || "") !== (err.message || "") ? friendlyText(err.message) : (fallback || STATUS_FALLBACK[500]);
  }
  const detail = err.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map(formatValidationItem).join(" ");
  if (typeof detail === "string" && detail.trim()) {
    const friendly = friendlyText(detail);
    if (friendly !== detail) return friendly;
    return status >= 500 && !fallback ? STATUS_FALLBACK[status] || detail : detail;
  }
  return STATUS_FALLBACK[status] || fallback || STATUS_FALLBACK[500];
};
