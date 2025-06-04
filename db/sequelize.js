const fs = require('graceful-fs');
const path = require('path');
const Sequelize = require('sequelize');
const SequelizeAuto = require('sequelize-auto')
const basename = path.basename(__filename);
const { UPLOADER_PREFIX, ENN_SECRET_KEY, ENC_IV } = require("../config")

const db = {};

const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: path.join(__dirname, 'sql.db'), // Path to SQLite database file,
	logging: false
});

sequelize.authenticate().then(async () => {
	console.log('Database is connected!');
	try {
		await db.user_data.upsert(
			{
				user_name: UPLOADER_PREFIX,
				secret_key: ENN_SECRET_KEY,
				secret_iv: ENC_IV
			},
			{
				conflictFields: ['user_name']
			}
		);
		console.log('Go to Browser via : http://localhost:3000');
	} catch (error) {
		console.error('Error in Creating the User ENCRYPTION KEYS PLEASE CHECK YOUR CONFIG.JS', error);
	}
}).catch(err => {
	console.error('Unable to connect to the database:', err);
});

fs
	.readdirSync(__dirname)
	.filter(file => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
	.forEach(file => {
		const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
		db[model.name] = model;
	});

Object.keys(db).forEach(modelName => {
	if (db[modelName].associate) {
		db[modelName].associate(db);
	}
});



db.sequelize = sequelize;
db.Sequelize = Sequelize;

const option = {
	directory: './db',
	additional: {
		timestamps: false
	},
	noInitModels: true,
	tables: ["user_media_items", "user_data"],

}

// uncomment this code when you want to fetch the model from db and change the option accordingly
const auto = new SequelizeAuto(sequelize, null, null, option);
// auto.run();

module.exports = db;
global.db = db;