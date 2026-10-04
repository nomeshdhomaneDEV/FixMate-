// Every API reply goes through these two helpers,
// so the JSON shape is always the same (spec section 18).

export function sendSuccess(res, data = {}, message = "OK", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

export function sendError(res, message = "Something went wrong", error = "Error", status = 500) {
  return res.status(status).json({ success: false, message, error });
}

// Custom error class: throw it anywhere, the central handler turns it into JSON.
export class AppError extends Error {
  constructor(message, status = 400, error = "Bad request") {
    super(message);
    this.status = status;
    this.error = error;
  }
}
