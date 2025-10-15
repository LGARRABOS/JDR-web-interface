import mongoose from 'mongoose';

/**
 * Establish a connection to MongoDB using the connection string provided in the
 * environment variables. The function logs successful connections and reports
 * detailed errors to ease debugging in development environments.
 */
export const connectDatabase = async () => {
  const { MONGO_URI } = process.env;

  if (!MONGO_URI) {
    throw new Error('Missing MONGO_URI environment variable.');
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[MongoDB] Connection established');
  } catch (error) {
    console.error('[MongoDB] Connection error:', error.message);
    throw error;
  }
};
