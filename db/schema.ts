import {sqliteTable, text, real, integer} from 'drizzle-orm/sqlite-core';
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  business: text('business').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull(),
  category: text('category').notNull(),
  pay: real('pay').notNull(),
  payType: text('pay_type').notNull(),
  hours: real('hours').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  radius: real('radius').notNull(),
  start: text('start').notNull(),
  contact: text('contact').notNull(),
  createdAt: integer('created_at').notNull(),
});
