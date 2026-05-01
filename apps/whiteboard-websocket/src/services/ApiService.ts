// src/services/ApiService.ts - COMPLETE WITH ALL METHODS

import type { User, Board } from '../types';

const API_BASE = '/api';

class ApiService {
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const token = localStorage.getItem('whiteboard-storage');
    let parsedToken = null;
    
    if (token) {
      try {
        const stored = JSON.parse(token);
        parsedToken = stored.state?.token;
      } catch (e) {
        console.error('Error parsing token:', e);
      }
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(parsedToken && { Authorization: `Bearer ${parsedToken}` }),
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async register(username: string, email: string, password: string, displayName?: string) {
    return this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, displayName })
    });
  }

  async login(username: string, password: string) {
    return this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  async findUserByUsername(username: string) {
    return this.request<{ user: User }>(`/auth/user/${username}`);
  }

  // ✅ NEW: Get all users
  async getAllUsers() {
    return this.request<{ users: User[] }>('/auth/users');
  }

  // Boards
  async getBoards(userId: string) {
    return this.request<{ boards: Board[] }>(`/boards?userId=${userId}`);
  }

  async getBoard(id: string, userId: string) {
    return this.request<{ board: Board }>(`/boards/${id}?userId=${userId}`);
  }

  async createBoard(name: string, userId: string, description?: string) {
    return this.request<{ board: Board }>('/boards', {
      method: 'POST',
      body: JSON.stringify({ name, userId, description })
    });
  }

  async updateBoard(id: string, userId: string, data: { name?: string; description?: string }) {
    return this.request<{ board: Board }>(`/boards/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...data, userId })
    });
  }

  async deleteBoard(id: string, userId: string) {
    return this.request<{ success: boolean }>(`/boards/${id}?userId=${userId}`, {
      method: 'DELETE'
    });
  }

  async getBoardMembers(boardId: string) {
    return this.request<{ members: any[] }>(`/boards/${boardId}/members`);
  }

  // ✅ FIXED: Now accepts userId directly instead of username
  async addBoardMember(boardId: string, userId: string, newUserId: string, role: string) {
    return this.request<{ member: any }>(`/boards/${boardId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, newUserId, role })
    });
  }

  async removeBoardMember(boardId: string, userId: string, memberId: string) {
    return this.request<{ success: boolean }>(
      `/boards/${boardId}/members/${memberId}?userId=${userId}`,
      { method: 'DELETE' }
    );
  }
}

export const apiService = new ApiService();