for (const button of document.querySelectorAll('.password-toggle')) {
  const input = document.getElementById(button.getAttribute('aria-controls'));

  function setVisibility(visible) {
    input.type = visible ? 'text' : 'password';
    const action = visible ? 'Hide password' : 'Show password';
    button.setAttribute('aria-label', action);
    button.title = action;
  }

  button.addEventListener('click', () => setVisibility(input.type === 'password'));
  input.form.addEventListener('submit', () => setVisibility(false));
  window.addEventListener('pagehide', () => setVisibility(false));
  button.hidden = false;
}
