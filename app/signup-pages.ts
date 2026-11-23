import { escape, layout, passwordField } from './pages.ts';
import { verificationMinutes } from './signup.ts';

export function signupPage(error = '', fields = { name: '', email: '' }) {
  return layout('Create a practice account', `<section class="panel narrow auth-panel">
  <h1>Create a practice account</h1>
  <p class="auth-intro">Use a fictional email such as <strong>driver-new@example.test</strong> and a practice password.</p>
  ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : ''}
  <form method="post" action="/signup">
    <label>Full name <input name="name" placeholder="Enter full name" value="${escape(fields.name)}" required maxlength="80" autocomplete="name"></label>
    <label>Email <input name="email" type="email" placeholder="Enter email" value="${escape(fields.email)}" required maxlength="150" autocomplete="email"></label>
    ${passwordField('signup')}
    <p id="password-hint" class="field-hint">Use 8 to 128 characters.</p>
    <button>Create account</button>
  </form>
</section>`);
}

export function verifyEmailPage(email?: string, error = '') {
  return layout('Verify your email', `<section class="panel narrow auth-panel">
  <h1>Verify your email</h1>
  ${email ? `<p class="auth-intro">Your six-digit code for <strong>${escape(email)}</strong> is in the <a href="/practice-inbox">practice inbox</a>.</p>` : ''}
  ${error ? `<p class="notice" role="alert">${escape(error)}</p>` : ''}
  ${email ? `<form method="post" action="/verify-email">
    <label>Verification code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
    <button>Verify email</button>
  </form>` : ''}
  <p class="auth-footer"><a href="/signup">Start a new sign-up</a></p>
</section>`);
}

export function inboxPage(email: string, code: string) {
  return layout('Practice inbox', `<section class="panel narrow auth-panel">
  <h1>Practice inbox</h1>
  <p class="auth-intro">This inbox is local to your sign-up.</p>
  <article class="practice-message">
    <h2>Verify your Flowstride Practice account</h2>
    <p>To <strong>${escape(email)}</strong></p>
    <p>Your verification code</p>
    <output id="verification-code">${code}</output>
    <p>Use this code within ${verificationMinutes} minutes.</p>
  </article>
  <p class="auth-footer"><a href="/verify-email">Back to verification</a></p>
</section>`);
}
