import { Reaction, User } from '@realtime-thesis/shared-server/models/chat';

export class ReactionService {
  
  async addReaction(messageId: string, userId: string, emoji: string) {
    const existing = await Reaction.findOne({
      where: { messageId, userId, emoji }
    });

    if (existing) {
      await existing.destroy();
      return null;
    }

    const reaction = await Reaction.create({
      messageId,
      userId,
      emoji
    } as any);

    return reaction;
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const reaction = await Reaction.findOne({
      where: { messageId, userId, emoji }
    });

    if (reaction) {
      await reaction.destroy();
    }

    return reaction;
  }

  async getMessageReactions(messageId: string) {
    const reactions = await Reaction.findAll({
      where: { messageId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'displayName', 'avatarUrl']
        }
      ]
    });

    const grouped = reactions.reduce((acc: any, reaction) => {
      const reactionJson = reaction.toJSON() as any;
      const emoji = reactionJson.emoji;
      
      if (!acc[emoji]) {
        acc[emoji] = { emoji, users: [] };
      }
      
      acc[emoji].users.push({
        id: reactionJson.user.id,
        username: reactionJson.user.username,
        displayName: reactionJson.user.displayName,
        avatarUrl: reactionJson.user.avatarUrl
      });
      
      return acc;
    }, {});

    return Object.values(grouped);
  }

  async hasUserReacted(messageId: string, userId: string, emoji: string): Promise<boolean> {
    const reaction = await Reaction.findOne({
      where: { messageId, userId, emoji }
    });

    return reaction !== null;
  }
}
