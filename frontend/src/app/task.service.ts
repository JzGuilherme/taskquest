import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateFocusSession, CreateTask, CreateUser, FocusHistoryEntry, FocusSession, Task, TaskStatus, User } from './models';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';

  getTasks(): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.apiUrl}/tasks`);
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }
  deleteTask(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tasks/${id}`);
  }

  createUser(user: CreateUser): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users`, user);
  }

  createTask(task: CreateTask): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/tasks`, task);
  }

  updateStatus(id: number, status: TaskStatus): Observable<Task> {
    return this.http.patch<Task>(`${this.apiUrl}/tasks/${id}/status`, { status });
  }

  logFocus(session: CreateFocusSession): Observable<FocusSession> {
    return this.http.post<FocusSession>(`${this.apiUrl}/focus`, session);
  }

  getFocusHistory(): Observable<FocusHistoryEntry[]> {
    return this.http.get<FocusHistoryEntry[]>(`${this.apiUrl}/focus`);
  }
}


