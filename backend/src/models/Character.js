import mongoose from 'mongoose';

const characterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    health: { type: Number, default: 0 },
    mana: { type: Number, default: 0 },
    imageUrl: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    campaignId: { type: String, default: 'default' },
  },
  { timestamps: true },
);

export const Character = mongoose.model('Character', characterSchema);
