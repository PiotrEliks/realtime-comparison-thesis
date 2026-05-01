// servers/sse-server/src/services/RoomService.ts

import { Room, RoomMember, User, Message } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class RoomService {
  
  async getUserRooms(userId: string) {
    const roomMembers = await RoomMember.findAll({
      where: { userId },
      include: [
        {
          model: Room,
          as: 'room',
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

  async createPrivateRoom(userId1: string, userId2: string) {
    const existingRoom = await this.findPrivateRoom(userId1, userId2);
    if (existingRoom) {
      return existingRoom;
    }

    const room = await Room.create({
      type: 'private',
      createdBy: userId1
    } as any);

    await RoomMember.bulkCreate([
      { roomId: room.id, userId: userId1, role: 'member' } as any,
      { roomId: room.id, userId: userId2, role: 'member' } as any
    ]);

    return this.getRoomById(room.id);
  }

  async createGroupRoom(name: string, creatorId: string, memberIds: string[]) {
    const room = await Room.create({
      name,
      type: 'group',
      createdBy: creatorId
    } as any);

    const members = [
      { roomId: room.id, userId: creatorId, role: 'admin' as const }
    ];

    memberIds.forEach(userId => {
      if (userId !== creatorId) {
        members.push({ roomId: room.id, userId, role: 'member' as const } as any);
      }
    });

    await RoomMember.bulkCreate(members);

    return this.getRoomById(room.id);
  }

  private async findPrivateRoom(userId1: string, userId2: string) {
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

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({
      where: { roomId, userId }
    });

    return member !== null;
  }

  async isAdmin(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({
      where: { roomId, userId, role: 'admin' }
    });

    return member !== null;
  }

  // ========================================
  // ZARZĄDZANIE GRUPAMI - NOWE METODY
  // ========================================

  async updateGroupName(roomId: string, userId: string, newName: string) {
    // Sprawdź czy użytkownik jest adminem
    if (!(await this.isAdmin(roomId, userId))) {
      throw new Error('Only admins can update group name');
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only update group room names');
    }

    await room.update({ name: newName });

    return room;
  }

  async addMemberToGroup(roomId: string, adminUserId: string, newUserId: string) {
  if (!(await this.isAdmin(roomId, adminUserId))) {
    throw new Error('Only admins can add members');
  }
  
  const room = await Room.findByPk(roomId);
  if (!room) throw new Error('Room not found');
  
  const member = await RoomMember.create({
    roomId,
    userId: newUserId,
    role: 'member'
  } as any);
  
  // ✅ POBIERZ PEŁNE DANE UŻYTKOWNIKA
  const user = await User.findByPk(newUserId, {
    attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status']
  });
  
  return {
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    user: user?.toJSON()  // ← WAŻNE!
  };
}

  async removeMemberFromGroup(roomId: string, adminUserId: string, memberUserId: string) {
    // Sprawdź czy użytkownik jest adminem
    if (!(await this.isAdmin(roomId, adminUserId))) {
      throw new Error('Only admins can remove members');
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only remove members from group rooms');
    }

    // Nie można usunąć samego siebie tą metodą (użyj leaveGroup)
    if (adminUserId === memberUserId) {
      throw new Error('Use leave endpoint to remove yourself');
    }

    // Usuń członka
    const deleted = await RoomMember.destroy({
      where: { roomId, userId: memberUserId }
    });

    if (deleted === 0) {
      throw new Error('Member not found');
    }

    return true;
  }

  async promoteToAdmin(roomId: string, adminUserId: string, memberUserId: string) {
    // Sprawdź czy użytkownik jest adminem
    if (!(await this.isAdmin(roomId, adminUserId))) {
      throw new Error('Only admins can promote members');
    }

    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only promote members in group rooms');
    }

    // Znajdź członka
    const member = await RoomMember.findOne({
      where: { roomId, userId: memberUserId }
    });

    if (!member) {
      throw new Error('Member not found');
    }

    if (member.role === 'admin') {
      throw new Error('User is already an admin');
    }

    // Promuj do admina
    await member.update({ role: 'admin' });

    return member;
  }

  async leaveGroup(roomId: string, userId: string) {
    const room = await Room.findByPk(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.type !== 'group') {
      throw new Error('Can only leave group rooms');
    }

    // Sprawdź czy użytkownik jest członkiem
    const member = await RoomMember.findOne({
      where: { roomId, userId }
    });

    if (!member) {
      throw new Error('Not a member of this room');
    }

    // Usuń członka
    await member.destroy();

    // Sprawdź czy był ostatnim członkiem - jeśli tak, usuń pokój
    const remainingMembers = await RoomMember.count({ where: { roomId } });
    
    if (remainingMembers === 0) {
      await room.destroy();
    }

    return true;
  }
}