import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../utils/database.js';

class Asset extends Model {}

Asset.init(
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'token'
    }
  },
  {
    sequelize,
    modelName: 'Asset'
  }
);

export default Asset;
