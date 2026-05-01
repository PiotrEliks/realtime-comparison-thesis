import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

export const sequelize = new Sequelize({
  dialect:  'postgres',
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.KANBAN_DB   || 'realtime_kanban',
  username: process.env.DB_USER     || 'thesis_user',
  password: process.env.DB_PASSWORD || 'thesis_password',
  logging:  process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

export const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Kanban DB connected');
    return true;
  } catch (err) {
    console.error('❌ Kanban DB error:', err);
    return false;
  }
};