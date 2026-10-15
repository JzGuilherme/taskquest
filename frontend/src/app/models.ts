export type TaskStatus = 'To Do' | 'Doing' | 'Done';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface CreateUser {
  password: string;
  role: 'Admin' | 'Dev';
  name: string;
  email: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: number;
  created_at: string;
}

export interface CreateTask {
  title: string;
  description?: string | null;
  assigned_to: number;
  status?: TaskStatus;
}

export interface CreateFocusSession {
  user_id: number;
  duration_minutes: number;
}

export interface FocusSession extends CreateFocusSession {
  id: number;
  logged_date: string;
}

export interface FocusHistoryEntry extends FocusSession {
  user_name: string;
}


