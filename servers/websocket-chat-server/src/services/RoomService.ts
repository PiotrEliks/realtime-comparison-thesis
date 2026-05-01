import { Room, RoomMember, User, Message } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class RoomService {
  
  /**
   * Pobiera pokoje użytkownika z wszystkimi szczegółami
   */
  async getUserRooms(userId: string) {
    // Znajdź wszystkie room_members dla tego użytkownika
    const roomMembers = await RoomMember.findAll({
      where: { userId },
      include: [
        {
          model: Room,
          as: 'room',
          include: [
            {
              model: RoomMember,
              as: 'members',  // ✅ Poprawny alias
              include: [
                {
                  model: User,
                  as: 'user',
                  attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status']
                }
              ]
            },
             {
            model: Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']],
            include: [
              {
                model: User,
                as: 'author',
                attributes: ['id', 'username', 'displayName', 'avatarUrl']
              }
            ]
          }
          ]
        }
      ]
    });

    // Formatuj do oczekiwanej struktury
    return roomMembers.map(rm => {
      const room = rm.room as any;
      return {
        id: room.id,
        name: room.name,
        type: room.type,
        createdBy: room.createdBy,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        members: room.members?.map((m: any) => ({
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user
        })) || [],
        messages: room.messages || []
      };
    });
  }

  /**
   * Pobiera pojedynczy pokój
   */
  async getRoomById(roomId: string) {
    const room = await Room.findByPk(roomId, {
      include: [
        {
          model: RoomMember,
          as: 'members',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status']
            }
          ]
        }
      ]
    });

    if (!room) return null;

    const roomJson = room.toJSON() as any;

    return {
      id: roomJson.id,
      name: roomJson.name,
      type: roomJson.type,
      createdBy: roomJson.createdBy,
      createdAt: roomJson.createdAt,
      updatedAt: roomJson.updatedAt,
      members: roomJson.members?.map((m: any) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user
      })) || []
    };
  }

  /**
   * Tworzy prywatny pokój (1-on-1)
   */
  async createPrivateRoom(userId1: string, userId2: string) {
    // Sprawdź czy pokój już istnieje
    const existingRoom = await this.findPrivateRoom(userId1, userId2);
    if (existingRoom) {
      return existingRoom;
    }

    // Stwórz nowy pokój
    const room = await Room.create({
      type: 'private',
      createdBy: userId1
    });

    // Dodaj członków
    await RoomMember.bulkCreate([
      { roomId: room.id, userId: userId1, role: 'member' },
      { roomId: room.id, userId: userId2, role: 'member' }
    ]);

    return this.getRoomById(room.id);
  }

  /**
   * Tworzy grupowy pokój
   */
  async createGroupRoom(name: string, creatorId: string, memberIds: string[]) {
    const room = await Room.create({
      name,
      type: 'group',
      createdBy: creatorId
    });

    // Dodaj twórcy jako admina
    const members: { roomId: string; userId: string; role: 'admin' | 'member' }[] = [
    { roomId: room.id, userId: creatorId, role: 'admin' as const }
  ];

    // Dodaj pozostałych członków
    memberIds.forEach(userId => {
      if (userId !== creatorId) {
        members.push({ roomId: room.id, userId, role: 'member' as const });
      }
    });

    await RoomMember.bulkCreate(members);

    return this.getRoomById(room.id);
  }

  /**
   * Znajduje prywatny pokój między dwoma użytkownikami
   */
  private async findPrivateRoom(userId1: string, userId2: string) {
    // Znajdź pokoje typu private gdzie są obaj użytkownicy
    const rooms = await Room.findAll({
      where: { type: 'private' },
      include: [
        {
          model: RoomMember,
          as: 'members',
          where: {
            userId: { [Op.in]: [userId1, userId2] }
          }
        }
      ]
    });

    // Znajdź pokój gdzie są dokładnie ci dwaj użytkownicy
    for (const room of rooms) {
      const roomJson = room.toJSON() as any;
      const memberIds = roomJson.members.map((m: any) => m.userId);
      
      if (
        memberIds.length === 2 &&
        memberIds.includes(userId1) &&
        memberIds.includes(userId2)
      ) {
        return this.getRoomById(room.id);
      }
    }

    return null;
  }

  /**
   * Dodaje członka do pokoju
   */
  async addMemberToRoom(roomId: string, userId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only add members to group rooms');
    }

    // Sprawdź czy już nie jest członkiem
    const existing = await RoomMember.findOne({
      where: { roomId, userId }
    });

    if (existing) {
      throw new Error('User is already a member');
    }

    await RoomMember.create({
      roomId,
      userId,
      role: 'member'
    });

    return this.getRoomById(roomId);
  }

  /**
   * Aktualizuje nazwę grupy
   */
  async updateGroupName(roomId: string, requesterId: string, name: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only update group room names');
    }

    // Sprawdź czy requester jest adminem
    const member = await RoomMember.findOne({
      where: { roomId, userId: requesterId }
    });

    if (!member || member.role !== 'admin') {
      throw new Error('Only admins can update room name');
    }

    await room.update({ name });
    return this.getRoomById(roomId);
  }

  /**
   * Usuwa członka z grupy
   */
  async removeMemberFromGroup(roomId: string, requesterId: string, targetUserId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only remove members from group rooms');
    }

    // Sprawdź czy requester jest adminem
    const requesterMember = await RoomMember.findOne({
      where: { roomId, userId: requesterId }
    });

    if (!requesterMember || requesterMember.role !== 'admin') {
      throw new Error('Only admins can remove members');
    }

    // Nie można usunąć siebie
    if (requesterId === targetUserId) {
      throw new Error('Cannot remove yourself. Use leave group instead');
    }

    // Usuń członka
    await RoomMember.destroy({
      where: { roomId, userId: targetUserId }
    });

    return this.getRoomById(roomId);
  }

  async addMemberToGroup(roomId: string, requesterId: string, targetUserId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only remove members from group rooms');
    }

    const isAlreadyMember = await this.isMember(roomId, targetUserId);
    if (isAlreadyMember) throw new Error('User is already a member of this group');

    // 3. Dodaj członka
    await RoomMember.create({
      roomId,
      userId: targetUserId,
      role: 'member'
    } as any);

    // Zwróć odświeżony obiekt pokoju
    return this.getRoomById(roomId);
  }

  /**
   * Promuje użytkownika do admina
   */
  async promoteToAdmin(roomId: string, requesterId: string, targetUserId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only promote members in group rooms');
    }

    // Sprawdź czy requester jest adminem
    const requesterMember = await RoomMember.findOne({
      where: { roomId, userId: requesterId }
    });

    if (!requesterMember || requesterMember.role !== 'admin') {
      throw new Error('Only admins can promote members');
    }

    // Promuj członka
    const targetMember = await RoomMember.findOne({
      where: { roomId, userId: targetUserId }
    });

    if (!targetMember) {
      throw new Error('User is not a member of this room');
    }

    await targetMember.update({ role: 'admin' });
    return this.getRoomById(roomId);
  }

  /**
   * Opuszcza grupę
   */
  async leaveGroup(roomId: string, userId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only leave group rooms');
    }

    // Usuń członkostwo
    await RoomMember.destroy({
      where: { roomId, userId }
    });

    // Sprawdź czy to był ostatni członek
    const remainingMembers = await RoomMember.count({
      where: { roomId }
    });

    // Jeśli nikogo nie ma, usuń pokój
    if (remainingMembers === 0) {
      await room.destroy();
    }

    return true;
  }

  /**
   * Sprawdza czy użytkownik jest członkiem pokoju
   */
  async isMember(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({
      where: { roomId, userId }
    });

    return member !== null;
  }

  /**
   * Sprawdza czy użytkownik jest adminem pokoju
   */
  async isAdmin(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({
      where: { roomId, userId, role: 'admin' }
    });

    return member !== null;
  }
}