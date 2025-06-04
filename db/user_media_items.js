const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('user_media_items', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: true,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'user_data',
        key: 'id'
      }
    },
    file_name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    base_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    google_photo_id: {
      type: DataTypes.TEXT,
      allowNull: true,
      unique: true
    },
    mime_type: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fetched_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'user_media_items',
    timestamps: false,
    indexes: [
      {
        name: "sqlite_autoindex_user_media_items_1",
        unique: true,
        fields: [
          { name: "google_photo_id" },
        ]
      },
    ]
  });
};
