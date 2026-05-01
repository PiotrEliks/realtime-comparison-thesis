import { Reaction, User } from '@realtime-thesis/shared-server/models/chat';

export class ReactionService {
  async addReaction(messageId: string, userId: string, emoji: string) {
    const [reaction] = await Reaction.findOrCreate({
      where: { messageId, userId, emoji },
      defaults: { messageId, userId, emoji } as any
    });
    return reaction;
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const deleted = await Reaction.destroy({ where: { messageId, userId, emoji } });
    return deleted > 0;
  }

  async getMessageReactions(messageId: string) {
    const reactions = await Reaction.findAll({
      where: { messageId },
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName'] }]
    });
    return reactions.map(r => r.toJSON());
  }
}
