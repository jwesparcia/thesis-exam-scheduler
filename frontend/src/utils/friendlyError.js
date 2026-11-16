// Explain errors while retaining the server's specific cause and diagnostics.
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
    "The server could not complete this action. Share the error details below with the developer."],
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
  500: "The server returned HTTP 500 without an error description. Check the backend logs for the cause.",
  502: "The application server is temporarily unavailable (HTTP 502). Check the backend service and gateway logs.",
  503: "The server is temporarily unavailable (HTTP 503). Check the backend service and retry shortly.",
  504: "The gateway timed out waiting for the server (HTTP 504). Check the backend logs and request duration.",
};

const FIELD_LABELS = { school_email: "School email", email: "Email", password: "Password", student_id: "Student ID" };

export const friendlyText = (text) => {
  if (typeof text !== "string") return text;
  // Backend explanations already include a readable reason and technical cause.
  if (text.includes("Developer details:")) return text;
  for (const [pattern, message] of RULES) {
    // API errors can pass through this formatter again when shown in a toast.
    if (text.startsWith(message)) return text;
    if (pattern.test(text)) return `${message} Details: ${text}`;
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

const formatDetail = (detail) => {
  if (typeof detail === "string") return detail.trim();
  if (Array.isArray(detail)) return detail.map(formatValidationItem).join(" ");
  if (detail && typeof detail === "object") {
    return formatDetail(detail.detail || detail.message || detail.msg || detail.error) || JSON.stringify(detail);
  }
  return "";
};

const requestContext = (err) => {
  const method = err.config?.method?.toUpperCase();
  const path = err.config?.url?.split("?")[0];
  return path ? ` Request: ${method ? `${method} ` : ""}${path}.` : "";
};

// Produces an actionable message without replacing a useful server response.
export const getFriendlyErrorMessage = (err, fallback) => {
  if (!err) return fallback || STATUS_FALLBACK[500];
  const status = err.response?.status;
  if (!err.response) {
    const cause = err.message || err.code;
    return `${cause ? friendlyText(cause) : (fallback || "No response was received from the server.")}${requestContext(err)}`;
  }
  const data = err.response.data;
  const detail = formatDetail(data?.detail || data?.message || data?.error || (typeof data === "string" ? data : null));
  // Plain proxy HTML and bare "Internal Server Error" responses have no cause
  // to display. Include the status and request so a developer can find the log.
  if (detail && !/^\s*</.test(detail) && !/^internal server error[.!]?$/i.test(detail)) {
    return friendlyText(detail);
  }
  const message = STATUS_FALLBACK[status] || fallback || `The server returned HTTP ${status || "unknown"} without an error description. Check the backend logs for the cause.`;
  return `${message}${requestContext(err)}`;
};
