import { Reaction } from '@realtime-thesis/shared-server/models/chat/Reaction';
import { User } from '@realtime-thesis/shared-server/models/chat';

export class ReactionService {
  
  /**
   * Dodaje reakcję do wiadomości (lub usuwa jeśli już istnieje - toggle)
   */
  async addReaction(messageId: string, userId: string, emoji: string) {
    try {
      // Sprawdź czy reakcja już istnieje
      const existing = await Reaction.findOne({
        where: { messageId, userId, emoji }
      });

      if (existing) {
        // Jeśli istnieje, usuń (toggle)
        await existing.destroy();
        return null;
      }

      // Dodaj nową reakcję
      const reaction = await Reaction.create({
        messageId,
        userId,
        emoji
      });

      return reaction;
    } catch (error) {
      console.error('Error adding reaction:', error);
      throw error;
    }
  }

  /**
   * Usuwa reakcję
   */
  async removeReaction(messageId: string, userId: string, emoji: string) {
    try {
      const reaction = await Reaction.findOne({
        where: { messageId, userId, emoji }
      });

      if (reaction) {
        await reaction.destroy();
      }

      return true;
    } catch (error) {
      console.error('Error removing reaction:', error);
      throw error;
    }
  }

  /**
   * Pobiera wszystkie reakcje dla wiadomości
   * Zwraca w formacie: [{ emoji: '👍', users: [{id, username, displayName}, ...] }]
   */
  async getMessageReactions(messageId: string) {
    try {
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

      // Grupuj reakcje po emoji
      const grouped = reactions.reduce((acc: any, reaction: any) => {
        const emoji = reaction.emoji;
        
        if (!acc[emoji]) {
          acc[emoji] = {
            emoji,
            users: []
          };
        }

        acc[emoji].users.push({
          id: reaction.user.id,
          username: reaction.user.username,
          displayName: reaction.user.displayName,
          avatarUrl: reaction.user.avatarUrl
        });

        return acc;
      }, {});

      // Konwertuj na array
      return Object.values(grouped);
    } catch (error) {
      console.error('Error getting message reactions:', error);
      throw error;
    }
  }

  /**
   * Pobiera reakcje wielu wiadomości naraz (optymalizacja)
   */
  async getMultipleMessagesReactions(messageIds: string[]) {
    try {
      const reactions = await Reaction.findAll({
        where: { messageId: messageIds },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'username', 'displayName', 'avatarUrl']
          }
        ]
      });

      // Grupuj po messageId, potem po emoji
      const byMessage: any = {};

      reactions.forEach((reaction: any) => {
        const messageId = reaction.messageId;
        const emoji = reaction.emoji;

        if (!byMessage[messageId]) {
          byMessage[messageId] = {};
        }

        if (!byMessage[messageId][emoji]) {
          byMessage[messageId][emoji] = {
            emoji,
            users: []
          };
        }

        byMessage[messageId][emoji].users.push({
          id: reaction.user.id,
          username: reaction.user.username,
          displayName: reaction.user.displayName,
          avatarUrl: reaction.user.avatarUrl
        });
      });

      // Konwertuj do finalnego formatu
      const result: any = {};
      Object.keys(byMessage).forEach(messageId => {
        result[messageId] = Object.values(byMessage[messageId]);
      });

      return result;
    } catch (error) {
      console.error('Error getting multiple messages reactions:', error);
      throw error;
    }
  }

  /**
   * Sprawdza czy użytkownik zareagował na wiadomość danym emoji
   */
  async hasUserReacted(messageId: string, userId: string, emoji: string): Promise<boolean> {
    try {
      const reaction = await Reaction.findOne({
        where: { messageId, userId, emoji }
      });

      return reaction !== null;
    } catch (error) {
      console.error('Error checking user reaction:', error);
      return false;
    }
  }

  /**
   * Pobiera wszystkie reakcje użytkownika w pokoju (statystyki)
   */
  async getUserReactionsInRoom(userId: string, roomId: string) {
    try {
      // To wymaga joina z Message, żeby sprawdzić roomId
      // Implementacja zależy od struktury relacji
      // Na razie zwracamy pustą tablicę
      return [];
    } catch (error) {
      console.error('Error getting user reactions in room:', error);
      throw error;
    }
  }
}