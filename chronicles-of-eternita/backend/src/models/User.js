import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../utils/database.js';

class User extends Model {}

User.init(
  {
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('MJ', 'player'),
      defaultValue: 'player'
    }
  },
  {
    sequelize,
    modelName: 'User'
  }
);

export default User;
