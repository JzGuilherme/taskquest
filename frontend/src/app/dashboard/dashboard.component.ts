import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { AuthService } from '../auth.service';
import { TaskService } from '../task.service';
import { FocusHistoryEntry, Task, TaskStatus, User } from '../models';
import { filterFocusHistory, focusFilterError } from '../focus-history-filter';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly service = inject(TaskService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  readonly assignees = computed(() => this.auth.user()?.role === 'Admin' ? this.users() : this.users().filter(user => user.id === this.auth.user()?.id));
  readonly statuses: readonly TaskStatus[] = ['To Do', 'Doing', 'Done'];
  readonly tasks = signal<Task[]>([]);
  readonly users = signal<User[]>([]);
  readonly focusHistory = signal<FocusHistoryEntry[]>([]);
  readonly historyFilterForm = this.fb.group({
    user_id: this.fb.control<number | null>(null),
    start_date: this.fb.nonNullable.control(''),
    end_date: this.fb.nonNullable.control(''),
  });
  private readonly historyFilterValues = toSignal(this.historyFilterForm.valueChanges, {
    initialValue: this.historyFilterForm.getRawValue(),
  });
  readonly historyFilters = computed(() => {
    const values = this.historyFilterValues();
    return { user_id: values.user_id ?? null, start_date: values.start_date ?? '', end_date: values.end_date ?? '' };
  });
  readonly historyFilterError = computed(() => focusFilterError(this.historyFilters()));
  readonly filteredFocusHistory = computed(() => filterFocusHistory(this.focusHistory(), this.historyFilters()));
  readonly totalFocusMinutes = computed(() => this.filteredFocusHistory().reduce((total, session) => total + session.duration_minutes, 0));
  private readonly focusDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza',
  });
  readonly loading = signal(false);
  readonly apiReady = signal(false);
  readonly savingFocus = signal(false);
  readonly savingTask = signal(false);
  readonly savingUser = signal(false);
  readonly movingIds = signal<ReadonlySet<number>>(new Set());
  readonly deletingIds = signal<ReadonlySet<number>>(new Set());
  readonly pendingDeletion = signal<number | null>(null);
  readonly error = signal('');
  readonly feedback = signal('');
  readonly completed = computed(() => this.tasks().filter(task => task.status === 'Done').length);
  readonly columns = computed(() => this.statuses.map(status => ({
    status, tasks: this.tasks().filter(task => task.status === status),
  })));

  readonly focusForm = this.fb.group({
    user_id: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    duration_minutes: this.fb.nonNullable.control(25, [
      Validators.required, Validators.min(1), Validators.max(1440), Validators.pattern(/^\d+$/),
    ]),
  });

  readonly taskForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]),
    description: this.fb.nonNullable.control('', Validators.maxLength(2000)),
    assigned_to: this.fb.control<number | null>(null, Validators.required),
  });

  readonly userForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(12), (control: AbstractControl<string>) => new TextEncoder().encode(control.value).length > 72 ? { maxBytes: true } : null]],
    role: this.fb.nonNullable.control<'Admin' | 'Dev'>('Dev'),
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254), Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]],
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.loading() || this.savingUser() || this.savingTask() || this.savingFocus() || this.movingIds().size || this.deletingIds().size) return;
    this.loading.set(true);
    this.apiReady.set(false);
    this.error.set('');
    forkJoin({ tasks: this.service.getTasks(), users: this.service.getUsers(), focusHistory: this.service.getFocusHistory() })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ tasks, users, focusHistory }) => {
          this.tasks.set(tasks);
          this.users.set(users);
          this.focusHistory.set(focusHistory);
          this.apiReady.set(true);
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  userName(id: number): string {
    return this.users().find(user => user.id === id)?.name ?? 'Usuário indisponível';
  }

  formatFocusDate(value: string): string {
    return this.focusDateFormatter.format(new Date(value));
  }

  clearHistoryFilters(): void {
    this.historyFilterForm.reset({ user_id: null, start_date: '', end_date: '' });
  }

  createUser(): void {
    this.userForm.markAllAsTouched();
    if (this.userForm.invalid || this.savingUser() || this.loading() || !this.apiReady()) return;
    const { name, email, password, role } = this.userForm.getRawValue();
    this.savingUser.set(true);
    this.error.set('');
    this.feedback.set('');
    this.service.createUser({ name: name.trim(), email: email.trim().toLowerCase(), password, role })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.savingUser.set(false)))
      .subscribe({
        next: user => {
          this.users.update(users => [...users, user].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
          this.userForm.reset();
          this.feedback.set(`${user.name} cadastrado com sucesso.`);
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  nextStatus(status: TaskStatus): TaskStatus | null {
    return status === 'To Do' ? 'Doing' : status === 'Doing' ? 'Done' : null;
  }

  moveTask(task: Task): void {
    const status = this.nextStatus(task.status);
    if (!status || this.movingIds().has(task.id) || this.deletingIds().has(task.id) || !this.apiReady()) return;
    this.error.set('');
    this.movingIds.update(ids => new Set([...ids, task.id]));
    this.service.updateStatus(task.id, status).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.movingIds.update(ids => {
        const next = new Set(ids); next.delete(task.id); return next;
      })),
    ).subscribe({
      next: updated => this.tasks.update(tasks => tasks.map(item => item.id === updated.id ? updated : item)),
      error: (error: unknown) => this.showError(error),
    });
  }

  createTask(): void {
    this.taskForm.markAllAsTouched();
    const { title, description, assigned_to } = this.taskForm.getRawValue();
    if (this.taskForm.invalid || assigned_to === null || this.savingTask() || !this.apiReady()) return;
    this.savingTask.set(true);
    this.error.set('');
    this.feedback.set('');
    this.service.createTask({ title: title.trim(), description: description.trim(), assigned_to })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.savingTask.set(false)))
      .subscribe({
        next: task => {
          this.tasks.update(tasks => [task, ...tasks]);
          this.taskForm.reset();
          this.feedback.set('Tarefa criada com sucesso.');
        },
        error: (error: unknown) => this.showError(error),
      });
  }
  canManageTask(task: Task): boolean {
    return this.auth.user()?.role === 'Admin' || this.auth.user()?.id === task.assigned_to;
  }
  deleteTask(task: Task): void {
    if (this.pendingDeletion() !== task.id || !this.canManageTask(task) || !this.apiReady() || this.loading() || this.deletingIds().has(task.id) || this.movingIds().has(task.id)) return;
    this.error.set(''); this.feedback.set('');
    this.deletingIds.update(ids => new Set([...ids, task.id]));
    this.service.deleteTask(task.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.deletingIds.update(ids => { const next = new Set(ids); next.delete(task.id); return next; });
    })).subscribe({
      next: () => { this.tasks.update(tasks => tasks.filter(item => item.id !== task.id)); this.pendingDeletion.set(null); this.feedback.set('Tarefa excluída.'); },
      error: (error: unknown) => this.showError(error),
    });
  }

  logFocus(): void {
    this.focusForm.markAllAsTouched();
    const { user_id, duration_minutes } = this.focusForm.getRawValue();
    if (this.focusForm.invalid || user_id === null || this.savingFocus() || !this.apiReady()) return;
    this.savingFocus.set(true);
    this.error.set('');
    this.feedback.set('');
    this.service.logFocus({ user_id, duration_minutes })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.savingFocus.set(false)))
      .subscribe({
        next: session => {
          this.focusHistory.update(history => [
            { ...session, user_name: this.userName(session.user_id) }, ...history,
          ].sort((a, b) => Date.parse(b.logged_date) - Date.parse(a.logged_date) || b.id - a.id));
          this.feedback.set(`${session.duration_minutes} minutos de foco registrados para ${this.userName(session.user_id)}.`);
          this.focusForm.reset({ user_id, duration_minutes: 25 });
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  private showError(error: unknown): void {
    const message: unknown = error instanceof HttpErrorResponse ? error.error?.message : null;
    this.error.set(typeof message === 'string' ? message : 'Não foi possível acessar a API. Verifique a conexão e tente novamente.');
  }
}



