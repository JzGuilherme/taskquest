import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthService } from './auth.service';
import { DashboardComponent } from './dashboard/dashboard.component';
import { PasswordRecoveryComponent } from './password-recovery.component';
@Component({
  selector: 'app-root', standalone: true, imports: [ReactiveFormsModule, DashboardComponent, PasswordRecoveryComponent],
  template: `
    @if (restoring()) {
      <p role="status" class="p-10 font-sans text-sm text-gray-600">Verificando sessão…</p>
    } @else if (auth.user()) {
      <div class="flex items-center justify-end gap-4 border-b border-gray-200 bg-white px-6 py-3 text-xs">
        <span>{{ auth.user()?.name }} · {{ auth.user()?.role }}</span>
        <button type="button" (click)="logout()" [disabled]="busy()" class="rounded-md border border-gray-200 px-3 py-1 hover:bg-gray-100">Sair</button>
      </div>
      @if (error()) { <p role="alert" class="p-4 text-sm">{{ error() }}</p> }
      <app-dashboard />
    } @else {
      <main class="mx-auto max-w-sm px-6 py-16 font-sans text-gray-800 antialiased sm:py-24">
        <h1 class="text-2xl font-bold">TaskCorp Insights</h1>
        <p class="mb-6 mt-2 text-sm text-gray-500">{{ registering() ? 'Crie sua conta para colaborar com o time.' : 'Entre com sua conta para acessar o workspace.' }}</p>
        <div class="mb-6 flex gap-2" aria-label="Acesso à conta">
          <button type="button" (click)="setMode(false)" [disabled]="busy()" [attr.aria-pressed]="!registering()" class="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100" [class.bg-gray-100]="!registering()">Entrar</button>
          <button type="button" (click)="setMode(true)" [disabled]="busy()" [attr.aria-pressed]="registering()" class="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-100" [class.bg-gray-100]="registering()">Criar conta</button>
        </div>
        @if (success()) { <p role="status" class="mb-5 rounded-md border border-gray-200 p-3 text-sm">{{ success() }}</p> }
        @if (recovering()) {
          <app-password-recovery (back)="setMode(false)" (completed)="recoveryCompleted($event)" />
        } @else if (registering()) {
          <form [formGroup]="registration" (ngSubmit)="register()" class="space-y-5">
            <div><label for="register-name" class="field-label">Nome</label><input id="register-name" formControlName="name" autocomplete="name" maxlength="100" class="field-input" /></div>
            <div><label for="register-email" class="field-label">E-mail</label><input id="register-email" type="email" formControlName="email" autocomplete="email" maxlength="254" class="field-input" /></div>
            <div><label for="register-password" class="field-label">Senha</label><input id="register-password" type="password" formControlName="password" autocomplete="new-password" aria-describedby="password-help" class="field-input" /><p id="password-help" class="mt-2 text-xs text-gray-500">Use pelo menos 12 caracteres, até 72 bytes.</p></div>
            <div><label for="register-confirm" class="field-label">Confirmar senha</label><input id="register-confirm" type="password" formControlName="confirmation" autocomplete="new-password" class="field-input" /></div>
            @if (error()) { <p role="alert" class="text-sm">{{ error() }}</p> }
            <button type="submit" [disabled]="busy()" class="primary-button">{{ busy() ? 'Salvando…' : 'Cadastrar' }}</button>
          </form>
        } @else {
          <form [formGroup]="form" (ngSubmit)="login()" class="space-y-5">
            <div><label for="login-email" class="field-label">E-mail</label><input id="login-email" type="email" formControlName="email" autocomplete="username" class="field-input" /></div>
            <div><label for="login-password" class="field-label">Senha</label><input id="login-password" type="password" formControlName="password" autocomplete="current-password" class="field-input" /></div>
            @if (error()) { <p role="alert" class="text-sm">{{ error() }}</p> }
            <button type="submit" [disabled]="busy()" class="primary-button">{{ busy() ? 'Entrando…' : 'Entrar' }}</button>
            <button type="button" [disabled]="busy()" (click)="openRecovery()" class="block text-sm text-gray-600 underline hover:text-black">Esqueci minha senha</button>
          </form>
        }
      </main>
    }
  `,
})
export class AppComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly form = this.fb.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  readonly registration = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/^[^\u0000-\u001f\u007f]+$/u)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(12), (control: AbstractControl<string>) => new TextEncoder().encode(control.value).length <= 72 ? null : { passwordBytes: true }]],
    confirmation: ['', Validators.required],
  });
  readonly registering = signal(false);
  readonly recovering = signal(false);
  readonly restoring = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  ngOnInit(): void { this.auth.restore().pipe(finalize(() => this.restoring.set(false))).subscribe(); }
  setMode(registering: boolean): void {
    if (this.busy()) return;
    this.recovering.set(false);
    this.registering.set(registering); this.error.set(''); this.success.set('');
    this.registration.reset(); this.form.controls.password.reset();
  }
  openRecovery(): void { this.setMode(false); this.recovering.set(true); }
  recoveryCompleted(message: string): void { this.setMode(false); this.success.set(message); }
  register(): void {
    if (this.busy()) return;
    this.registration.patchValue({ name: this.registration.controls.name.value.trim(), email: this.registration.controls.email.value.trim().toLowerCase() });
    if (this.registration.invalid) { this.registration.markAllAsTouched(); this.error.set('Preencha nome, e-mail válido e uma senha com pelo menos 12 caracteres e até 72 bytes.'); return; }
    const { name, email, password, confirmation } = this.registration.getRawValue();
    if (password !== confirmation) { this.error.set('As senhas não coincidem.'); return; }
    this.busy.set(true); this.error.set('');
    this.auth.register(name, email, password).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => { this.registration.reset(); this.registering.set(false); this.form.reset({ email, password: '' }); this.success.set('Conta criada com sucesso. Entre com seu e-mail e senha.'); },
      error: (error: HttpErrorResponse) => this.error.set(error.status === 409 ? 'Este e-mail já está cadastrado. Entre com sua conta.' : error.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Não foi possível cadastrar. Verifique os dados e tente novamente.'),
    });
  }
  login(): void {
    if (this.form.invalid || this.busy()) { this.form.markAllAsTouched(); this.error.set('Informe seu e-mail e senha.'); return; }
    this.error.set(''); this.busy.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).pipe(finalize(() => this.busy.set(false))).subscribe({ next: () => { this.form.reset(); this.success.set(''); }, error: () => this.error.set('Não foi possível entrar. Verifique as credenciais ou tente novamente mais tarde.') });
  }
  logout(): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.auth.logout().pipe(finalize(() => this.busy.set(false))).subscribe({ error: () => this.error.set('Não foi possível encerrar a sessão. Tente novamente.') });
  }
}
