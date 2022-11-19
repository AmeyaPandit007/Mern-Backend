class HttpError extends Error {
  constructor(message, errorCode) {
    super(message); //  Add a "message" Property
    this.code = errorCode;  // Adds a "code" property
  }
}

module.exports = HttpError;