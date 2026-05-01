import { Request, Response } from 'express';
import { RoomService } from '../services/RoomService.js';
import { MessageService } from '../services/MessageService.js';

export class RoomController {
  private roomService: RoomService;
  private messageService: MessageService;

  constructor() {
    this.roomService = new RoomService();
    this.messageService = new MessageService();
  }

  getUserRooms = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const rooms = await this.roomService.getUserRooms(userId);
      res.json({ rooms });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  createPrivateRoom = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user ID required' });
      }

      const room = await this.roomService.createPrivateRoom(userId, targetUserId);
      res.json({ room });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  createGroupRoom = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { name, memberIds } = req.body;

      if (!name || !memberIds || !Array.isArray(memberIds)) {
        return res.status(400).json({ error: 'Invalid request data' });
      }

      const room = await this.roomService.createGroupRoom(name, userId, memberIds);
      res.json({ room });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  getRoomMessages = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { limit, before } = req.query;

      const messages = await this.messageService.getRoomMessages(
        roomId,
        limit ? parseInt(limit as string) : 50,
        before ? new Date(before as string) : undefined
      );

      res.json({ messages });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  addMember = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID required' });
      }

      const room = await this.roomService.addMemberToRoom(roomId, userId);
      res.json({ room });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };
}