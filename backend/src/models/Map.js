import mongoose from 'mongoose';

const mapSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    imagePath: { type: String, required: true },
    campaignId: { type: String, default: 'default' },
    state: {
      tokens: [
        {
          id: String,
          name: String,
          x: Number,
          y: Number,
          imageUrl: String,
        },
      ],
    },
  },
  { timestamps: true },
);

export const Map = mongoose.model('Map', mapSchema);
