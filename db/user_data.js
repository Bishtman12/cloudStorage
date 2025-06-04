const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_data', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      unique: true
    },
    user_name: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    secret_key: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    },
    secret_iv: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true
    }
  }, {
    sequelize,
    tableName: 'user_data',
    timestamps: false,
    indexes: [
      {
        name: "sqlite_autoindex_user_data_1",
        unique: true,
        fields: [
          { name: "id" },
        ]
      },
      {
        name: "sqlite_autoindex_user_data_2",
        unique: true,
        fields: [
          { name: "user_name" },
        ]
      },
      {
        name: "sqlite_autoindex_user_data_3",
        unique: true,
        fields: [
          { name: "secret_key" },
        ]
      },
      {
        name: "sqlite_autoindex_user_data_4",
        unique: true,
        fields: [
          { name: "secret_iv" },
        ]
      },
    ]
  });
};
