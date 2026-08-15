// Express 4 (unlike 5) does not automatically catch rejected promises from
// async route handlers — an unhandled rejection inside one just hangs the
// request forever instead of producing an error response (confirmed the
// hard way: a Mongoose ValidationError inside a POST /reports handler
// hung the request until the client's own timeout fired). Wrapping every
// async handler in this forwards the rejection to Express's error
// middleware instead.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
