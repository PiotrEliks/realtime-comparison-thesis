import { Message, User, MessageReceipt, Reaction } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class MessageService {
  
  async createMessage(data: {
    roomId: string;
    userId: string;
    content: string;
    type?: 'text' | 'system' | 'file';
    replyToId?: string;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileMimeType?: string;
  }) {
    const message = await Message.create({
      roomId: data.roomId,
      userId: data.userId,
      content: data.content,
      type: data.type || 'text',
      replyToId: data.replyToId,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileMimeType: data.fileMimeType,
      isDeleted: false,
      isEdited: false
    } as any);

    return message;
  }

  async getMessageWithDetails(messageId: string) {
    const message = await Message.findByPk(messageId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'displayName', 'avatarUrl']
        },
        {
          model: MessageReceipt,
          as: 'receipts',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'displayName']
            }
          ]
        },
        {
          model: Reaction,
          as: 'reactions',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'displayName', 'avatarUrl']
            }
          ]
        },
        {
          model: Message,
          as: 'replyTo',
          attributes: ['id', 'content', 'type', 'createdAt'],
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'username', 'displayName']
            }
          ]
        }
      ]
    });

    if (!message) return null;

    const messageJson = message.toJSON() as any;

    const groupedReactions = messageJson.reactions?.reduce((acc: any, reaction: any) => {
      const emoji = reaction.emoji;
      if (!acc[emoji]) {
        acc[emoji] = { emoji, users: [] };
      }
      acc[emoji].users.push({
        id: reaction.user.id,
        username: reaction.user.username,
        displayName: reaction.user.displayName,
        avatarUrl: reaction.user.avatarUrl
      });
      return acc;
    }, {});

    const formattedReceipts = messageJson.receipts?.map((receipt: any) => ({
      userId: receipt.user.id,
      userName: receipt.user.displayName || receipt.user.username,
      readAt: receipt.readAt
    }));

    return {
      id: messageJson.id,
      roomId: messageJson.roomId,
      content: messageJson.content,
      type: messageJson.type,
      isDeleted: messageJson.isDeleted,
      isEdited: messageJson.isEdited,
      editedAt: messageJson.editedAt,
      createdAt: messageJson.createdAt,
      author: messageJson.author,
      receipts: formattedReceipts || [],
      reactions: groupedReactions ? Object.values(groupedReactions) : [],
      replyTo: messageJson.replyTo || null
    };
  }

  async getRoomMessages(roomId: string, limit: number = 50, before?: Date) {
    const whereClause: any = { roomId };
    
    if (before) {
      whereClause.createdAt = { [Op.lt]: before };
    }

    const messages = await Message.findAll({
      where: whereClause,
      limit,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'username', 'displayName', 'avatarUrl']
        },
        {
          model: MessageReceipt,
          as: 'receipts',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'displayName']
            }
          ]
        },
        {
          model: Reaction,
          as: 'reactions',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'displayName', 'avatarUrl']
            }
          ]
        },
        {
          model: Message,
          as: 'replyTo',
          attributes: ['id', 'content', 'type', 'createdAt'],
          include: [
            {
              model: User,
              as: 'author',
              attributes: ['id', 'username', 'displayName']
            }
          ]
        }
      ]
    });

    const reversed = messages.reverse();

    return reversed.map(msg => {
      const msgJson = msg.toJSON() as any;

      const groupedReactions = msgJson.reactions?.reduce((acc: any, reaction: any) => {
        const emoji = reaction.emoji;
        if (!acc[emoji]) {
          acc[emoji] = { emoji, users: [] };
        }
        acc[emoji].users.push({
          id: reaction.user.id,
          username: reaction.user.username,
          displayName: reaction.user.displayName,
          avatarUrl: reaction.user.avatarUrl
        });
        return acc;
      }, {});

      const formattedReceipts = msgJson.receipts?.map((receipt: any) => ({
        userId: receipt.user.id,
        userName: receipt.user.displayName || receipt.user.username,
        readAt: receipt.readAt
      }));

      return {
        id: msgJson.id,
        roomId: msgJson.roomId,
        content: msgJson.content,
        type: msgJson.type,
        isDeleted: msgJson.isDeleted,
        isEdited: msgJson.isEdited,
        editedAt: msgJson.editedAt,
        createdAt: msgJson.createdAt,
        author: msgJson.author,
        receipts: formattedReceipts || [],
        reactions: groupedReactions ? Object.values(groupedReactions) : [],
        replyTo: msgJson.replyTo || null
      };
    });
  }

  async updateMessage(messageId: string, userId: string, content: string) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.userId !== userId) {
      throw new Error('Unauthorized');
    }

    await message.update({
      content,
      isEdited: true,
      editedAt: new Date()
    } as any);

    return message;
  }

  async deleteMessage(messageId: string, userId: string) {
    const message = await Message.findByPk(messageId);

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.userId !== userId) {
      throw new Error('Unauthorized');
    }

    await message.update({
      isDeleted: true,
      content: ''
    } as any);

    return message;
  }

  async markAsRead(messageId: string, userId: string) {
    const existing = await MessageReceipt.findOne({
      where: { messageId, userId }
    });

    if (existing) {
      return existing;
    }

    const receipt = await MessageReceipt.create({
      messageId,
      userId,
      readAt: new Date()
    } as any);

    return receipt;
  }

  async getMessage(messageId: string) {
    return await Message.findByPk(messageId);
  }
}
