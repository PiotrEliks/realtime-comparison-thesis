// servers/shared/src/models/index.ts

import { User } from './User.js';
import { Room } from './Room.js';
import { RoomMember } from './RoomMember.js';
import { Message } from './Message.js';
import { MessageReceipt } from './MessageReceipt.js';
import { Reaction } from './Reaction.js';

// ⚠️ WAŻNE: Flag zapobiegająca wielokrotnej inicjalizacji
let associationsInitialized = false;

export function initializeAssociations() {
  if (associationsInitialized) {
    console.log('⚠️  Associations already initialized, skipping...');
    return;
  }

  console.log('🔗 Initializing database associations...');

  // User <-> Room
  User.belongsToMany(Room, {
    through: RoomMember,
    foreignKey: 'userId',
    as: 'rooms'
  });

  Room.belongsToMany(User, {
    through: RoomMember,
    foreignKey: 'roomId',
    as: 'users'
  });

  // Room -> RoomMember
  Room.hasMany(RoomMember, {
    foreignKey: 'roomId',
    as: 'members'
  });

  RoomMember.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
  });

  // Room -> Message (TYLKO JEDEN alias!)
  Room.hasMany(Message, {
    foreignKey: 'roomId',
    as: 'messages'
  });

  Message.belongsTo(User, {
    foreignKey: 'userId',
    as: 'author'
  });

  // Message -> Reaction
  Message.hasMany(Reaction, {
    foreignKey: 'messageId',
    as: 'reactions'
  });

  // Message -> MessageReceipt
  Message.hasMany(MessageReceipt, {
    foreignKey: 'messageId',
    as: 'receipts'
  });

  RoomMember.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });
  User.hasMany(RoomMember, { foreignKey: 'userId', as: 'memberships' });
  Message.belongsTo(Room, { foreignKey: 'roomId', as: 'room' });
  User.hasMany(Message, { foreignKey: 'userId', as: 'sentMessages' });
  Message.belongsTo(Message, { foreignKey: 'replyToId', as: 'replyTo' });
  Message.hasMany(Message, { foreignKey: 'replyToId', as: 'replies' });
  Reaction.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
  Reaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  MessageReceipt.belongsTo(Message, { foreignKey: 'messageId', as: 'message' });
  MessageReceipt.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  associationsInitialized = true;
  console.log('✅ Database associations initialized');
}

export {
  User,
  Room,
  RoomMember,
  Message,
  MessageReceipt,
  Reaction
};