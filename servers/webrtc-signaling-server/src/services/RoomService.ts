import { Room, User, RoomMember, Message } from '@realtime-thesis/shared-server/models/chat';
import { Op } from 'sequelize';

export class RoomService {
  async getUserRooms(userId: string) {
    const roomMembers = await RoomMember.findAll({
      where: { userId },
      include: [{
        model: Room, as: 'room',
        include: [{
          model: RoomMember, as: 'members',
          include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatarUrl', 'status'] }]
        }, {
          model: Message, as: 'messages', limit: 1, order: [['createdAt', 'DESC']],
          include: [{ model: User, as: 'author', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }]
        }]
      }]
    });

    return roomMembers.map(rm => {
      const room = rm.room as any;
      return {
        id: room.id, name: room.name, type: room.type,
        createdBy: room.createdBy, createdAt: room.createdAt, updatedAt: room.updatedAt,
        members: room.members?.map((m: any) => ({ userId: m.userId, role: m.role, joinedAt: m.joinedAt, user: m.user })) || [],
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
          include: [{ model: User, as: 'user', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }]
        }
      ]
    });

    return room ? room.toJSON() : null;
  }

  async createPrivateRoom(userId: string, targetUserId: string) {
    const existingRoom = await Room.findOne({
      where: { type: 'private' },
      include: [{
        model: RoomMember,
        as: 'members',
        where: { userId: { [Op.in]: [userId, targetUserId] } },
        required: true
      }],
      having: { '$members.userId$': { [Op.in]: [userId, targetUserId] } }
    });

    if (existingRoom) {
      return this.getRoomById(existingRoom.id);
    }

    const room = await Room.create({ type: 'private', createdBy: userId } as any);
    await RoomMember.bulkCreate([
      { roomId: room.id, userId, role: 'member' },
      { roomId: room.id, userId: targetUserId, role: 'member' }
    ] as any[]);

    return this.getRoomById(room.id);
  }

  async createGroupRoom(name: string, creatorId: string, memberIds: string[]) {
    const room = await Room.create({
      type: 'group',
      name,
      createdBy: creatorId
    } as any);

    const members = [
      { roomId: room.id, userId: creatorId, role: 'admin' },
      ...memberIds.map(id => ({ roomId: room.id, userId: id, role: 'member' }))
    ];

    await RoomMember.bulkCreate(members as any[]);
    return this.getRoomById(room.id);
  }

  async isMember(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({ where: { roomId, userId } });
    return !!member;
  }

  async isAdmin(roomId: string, userId: string): Promise<boolean> {
    const member = await RoomMember.findOne({ where: { roomId, userId, role: 'admin' } });
    return !!member;
  }

  async updateGroupName(roomId: string, userId: string, name: string) {
    if (!(await this.isAdmin(roomId, userId))) {
      throw new Error('Only admins can update group name');
    }
    await Room.update({ name }, { where: { id: roomId } });
  }

  async addMemberToGroup(roomId: string, adminId: string, newMemberId: string) {
    if (!(await this.isAdmin(roomId, adminId))) {
      throw new Error('Only admins can add members');
    }

    const existingMember = await RoomMember.findOne({ where: { roomId, userId: newMemberId } });
    if (existingMember) {
      throw new Error('User is already a member');
    }

    const member = await RoomMember.create({ roomId, userId: newMemberId, role: 'member' } as any);
    const user = await User.findByPk(newMemberId, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    
    return {
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      user: user?.toJSON()
    };
  }

  async removeMemberFromGroup(roomId: string, adminId: string, memberId: string) {
    if (!(await this.isAdmin(roomId, adminId))) {
      throw new Error('Only admins can remove members');
    }
    await RoomMember.destroy({ where: { roomId, userId: memberId } });
  }

  async promoteToAdmin(roomId: string, adminId: string, memberId: string) {
    if (!(await this.isAdmin(roomId, adminId))) {
      throw new Error('Only admins can promote members');
    }
    await RoomMember.update({ role: 'admin' }, { where: { roomId, userId: memberId } });
  }

  async leaveGroup(roomId: string, userId: string) {
    await RoomMember.destroy({ where: { roomId, userId } });
  }
}
