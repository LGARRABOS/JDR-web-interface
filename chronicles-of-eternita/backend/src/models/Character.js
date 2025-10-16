import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../utils/database.js';
import User from './User.js';

class Character extends Model {}

Character.init(
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    hp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    mana: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    speed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Character'
  }
);

Character.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Character, { foreignKey: 'userId' });

export default Character;
