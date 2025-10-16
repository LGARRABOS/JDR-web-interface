import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../utils/database.js';

class Map extends Model {}

Map.init(
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    filePath: {
      type: DataTypes.STRING,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'Map'
  }
);

export default Map;
