import { Component, inject, output, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
@Component({
  selector: 'app-password-recovery', standalone: true, imports: [ReactiveFormsModule],
  template: `
    <h2 class="mb-2 text-lg font-semibold">Recuperar senha</h2>
    <p class="mb-5 text-sm text-gray-500">{{ codeSent() ? 'Preencha o código recebido e escolha sua nova senha.' : 'Informe o e-mail da sua conta para receber um código.' }}</p>
    @if (message()) { <p role="status" class="mb-4 text-sm">{{ message() }}</p> }
    <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
      <div><label for="recovery-email" class="field-label">E-mail da conta</label><input id="recovery-email" type="email" autocomplete="email" formControlName="email" class="field-input" [readOnly]="codeSent()" /></div>
      @if (codeSent()) {
        <div><label for="recovery-code" class="field-label">Código de 8 dígitos</label><input id="recovery-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" formControlName="code" class="field-input" /></div>
        <div><label for="recovery-password" class="field-label">Nova senha</label><input id="recovery-password" type="password" autocomplete="new-password" formControlName="password" class="field-input" /><p class="mt-2 text-xs text-gray-500">Pelo menos 12 caracteres e até 72 bytes.</p></div>
        <div><label for="recovery-confirm" class="field-label">Confirmar nova senha</label><input id="recovery-confirm" type="password" autocomplete="new-password" formControlName="confirmation" class="field-input" /></div>
      }
      @if (error()) { <p role="alert" class="text-sm">{{ error() }}</p> }
      <button type="submit" [disabled]="busy()" class="primary-button">{{ busy() ? 'Aguarde…' : codeSent() ? 'Salvar nova senha' : 'Enviar código' }}</button>
      <button type="button" [disabled]="busy()" (click)="back.emit()" class="block text-sm text-gray-600 underline hover:text-black">Voltar para entrar</button>
    </form>
  `,
})
export class PasswordRecoveryComponent {
  private readonly http = inject(HttpClient);
  readonly back = output<void>();
  readonly completed = output<string>();
  readonly codeSent = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    code: ['', [Validators.required, Validators.pattern(/^\d{8}$/)]],
    password: ['', [Validators.required, Validators.minLength(12), (control: AbstractControl<string>) => new TextEncoder().encode(control.value).length <= 72 ? null : { bytes: true }]],
    confirmation: ['', Validators.required],
  });
  submit(): void {
    if (this.busy()) return;
    this.error.set('');
    this.form.controls.email.setValue(this.form.controls.email.value.trim().toLowerCase());
    if (this.form.controls.email.invalid || (this.codeSent() && this.form.invalid)) { this.error.set('Confira o e-mail, o código e os requisitos da senha.'); this.form.markAllAsTouched(); return; }
    const { email, code, password, confirmation } = this.form.getRawValue();
    if (this.codeSent() && password !== confirmation) { this.error.set('As senhas não coincidem.'); return; }
    const resetting = this.codeSent();
    this.busy.set(true);
    this.http.post<{ message: string }>(resetting ? '/api/auth/reset-password' : '/api/auth/forgot-password', resetting ? { email, code, password } : { email }, { withCredentials: true, headers: { 'X-Taskcorp-Client': 'web' } }).pipe(finalize(() => this.busy.set(false))).subscribe({
      next: result => { if (resetting) { this.form.reset(); this.completed.emit(result.message); } else { this.codeSent.set(true); this.message.set(result.message); } },
      error: (error: HttpErrorResponse) => this.error.set(error.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : error.status === 503 ? 'O envio de e-mail ainda não foi configurado. Contate o administrador.' : resetting && error.status === 400 ? 'Código inválido ou expirado.' : 'Não foi possível concluir. Tente novamente mais tarde.'),
    });
  }
}
