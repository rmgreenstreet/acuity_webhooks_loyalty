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

module.exports = { 
    connectToMongoose: (delay) => {
        attempts++;
        
        mongoose.connect(`mongodb://localhost:27017/${process.env.DATABASE_NAME}`, { useNewUrlParser: true, useUnifiedTopology: true })
          .then(() => {
              console.log(`Mongoose Connected to ${process.env.DATABASE_NAME} in MongoDB`);
          })
          .catch((err) => {
            console.error(`Failed to connect to MongoDB (attempt ${attempts}): ${err.message}`);
            
            if (attempts < maxRetries) {
              const nextDelay = delay * 2; // Exponential backoff
              console.log(`Retrying in ${delay / 1000} seconds...`);
              setTimeout(() => connectWithRetry(nextDelay), delay);
            } else {
              console.error('Max retries reached. Exiting...');
              process.exit(1); // Exit with failure code
            }
          });
      },
      ExpressError
}