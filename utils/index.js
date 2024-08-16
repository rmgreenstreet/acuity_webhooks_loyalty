const mongoose = require('mongoose');

const maxRetries = 5; // Number of attempts
let attempts = 0;

class ExpressError extends Error {
  constructor(message, statusCode) {
    super();
    this.message = message;
    this.statusCode = statusCode
  }
};

let connectString = ""

if (process.NODE_ENV !== "production") {
  connectString = process.env.DATABASE_URL
} else {
  connectString = `mongodb+srv://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_URL}/?retryWrites=true&w=majority&appName=${process.env.DATABASE_APP_NAME}`
}

module.exports = {
  connectToMongoose: function (delay) {
    const retryFunction = this.connectToMongoose; // Store a reference to the function
    attempts++;
    attempts++;

    mongoose.connect(process.env.DB_CONNECTION_STRING)
      .then(() => {
        console.log(`Mongoose Connected to MongoDB`);
      })
      .catch((err) => {
        console.error(`Failed to connect to MongoDB (attempt ${attempts}): ${err.message}`);

        if (attempts < maxRetries) {
          const nextDelay = delay * 2; // Exponential backoff
          console.log(`Retrying in ${delay / 1000} seconds...`);
          setTimeout(() => retryFunction(nextDelay), delay);
        } else {
          console.error('Max retries reached. Exiting...');
          process.exit(1); // Exit with failure code
        }
      });
  },
  ExpressError
}