import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, finalize, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
export interface AuthUser { id: number; name: string; role: 'Admin' | 'Dev'; }
interface Session { accessToken: string; expiresIn: number; user: AuthUser; }
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<AuthUser | null>(null);
  private accessToken: string | null = null;
  private refreshRequest?: Observable<Session>;
  token(): string | null { return this.accessToken; }
  private accept(session: Session): void { this.accessToken = session.accessToken; this.user.set(session.user); }
  clear(): void { this.accessToken = null; this.user.set(null); }
  register(name: string, email: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/register', { name, email, password }, { withCredentials: true, headers: { 'X-Taskcorp-Client': 'web' } });
  }
  login(email: string, password: string): Observable<Session> {
    return this.http.post<Session>('/api/auth/login', { email, password }, { withCredentials: true, headers: { 'X-Taskcorp-Client': 'web' } }).pipe(tap(session => this.accept(session)));
  }
  refresh(): Observable<Session> {
    if (!this.refreshRequest) {
      this.refreshRequest = this.http.post<Session>('/api/auth/refresh', {}, { withCredentials: true, headers: { 'X-Taskcorp-Client': 'web' } }).pipe(
        tap(session => this.accept(session)), catchError(error => { this.clear(); return throwError(() => error); }),
        finalize(() => { this.refreshRequest = undefined; }), shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshRequest;
  }
  restore(): Observable<Session | null> { return this.refresh().pipe(catchError(() => of(null))); }
  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}, { withCredentials: true, headers: { 'X-Taskcorp-Client': 'web' } }).pipe(tap(() => this.clear()));
  }
}
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/')) return next(req);
  const auth = inject(AuthService);
  const withToken = (token: string | null) => token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(withToken(auth.token())).pipe(catchError(error => {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
    return auth.refresh().pipe(switchMap(session => next(withToken(session.accessToken))));
  }));
};
