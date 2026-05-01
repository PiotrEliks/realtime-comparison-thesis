import { Message, User, Reaction, MessageReceipt } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class MessageService {
  async createMessage(data: { roomId: string; userId: string; content: string; type?: string; replyToId?: string }) {
    return await Message.create(data as any);
  }

  async getMessageWithDetails(messageId: string) {
    const message = await Message.findByPk(messageId, {
      include: [
        { model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Message, as: 'replyTo', include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName'] }] },
        { model: Reaction, as: 'reactions', include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName'] }] },
        { model: MessageReceipt, as: 'receipts', include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName'] }] }
      ]
    });
    return message ? message.toJSON() : null;
  }

  async getRoomMessages(roomId: string, limit: number = 50, before?: Date) {
    const where: any = { roomId };
    if (before) where.createdAt = { [Op.lt]: before };

    const messages = await Message.findAll({
      where,
      include: [
        { model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Message, as: 'replyTo', include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName'] }] },
        { model: Reaction, as: 'reactions', include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName'] }] },
        { model: MessageReceipt, as: 'receipts', include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName'] }] }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    return messages.map(m => m.toJSON()).reverse();
  }

  async updateMessage(messageId: string, userId: string, content: string) {
    const message = await Message.findByPk(messageId);
    if (!message) throw new Error('Message not found');
    if (message.userId !== userId) throw new Error('Unauthorized');
    await message.update({ content, isEdited: true, editedAt: new Date() });
    return message;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await Message.findByPk(messageId);
    if (!message) throw new Error('Message not found');
    if (message.userId !== userId) throw new Error('Unauthorized');
    await message.update({ isDeleted: true, content: '' });
    return message;
  }

  async markAsRead(messageId: string, userId: string) {
    const [receipt] = await MessageReceipt.findOrCreate({
      where: { messageId, userId },
      defaults: { messageId, userId, readAt: new Date() } as any
    });
    return receipt;
  }
}
