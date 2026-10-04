import { sendError, AppError } from "../utils/response.js";

// Unknown URL -> 404 in our JSON format
export function notFound(req, res) {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, "Not found", 404);
}

// Central error handler: the ONLY place errors become responses.
// Stack traces are logged on the server, never sent to the user.
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.message, err.error, err.status);
  }
  console.error("Unexpected error:", err);
  return sendError(res, "Internal server error", "Server error", 500);
}
