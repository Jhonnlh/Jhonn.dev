// Private Page PIN Management
const PIN_HASH = '0e1a3aec7fd93fa52fea73290fec50e6cf62fb1fa6d03b9ebc0a0a3272232339'; // SHA-256 del PIN 2530 (cámbialo generando tu propio hash)
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 30000;

const pinInputs = document.querySelectorAll('.pin-input');
const pinSubmit = document.getElementById('pinSubmit');
const pinScreen = document.getElementById('pinScreen');
const privateContent = document.getElementById('privateContent');
const pinError = document.getElementById('pinError');

async function hashPin(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getLockoutUntil() {
  return Number(sessionStorage.getItem('pinLockoutUntil') || 0);
}

function getAttempts() {
  return Number(sessionStorage.getItem('pinAttempts') || 0);
}

function isLockedOut() {
  return getLockoutUntil() > Date.now();
}

function updateLockUI() {
  const remaining = Math.ceil((getLockoutUntil() - Date.now()) / 1000);
  if (remaining > 0) {
    pinInputs.forEach(input => input.disabled = true);
    pinSubmit.disabled = true;
    showError(`Demasiados intentos. Espera ${remaining}s`, false);
    setTimeout(updateLockUI, 1000);
  } else {
    pinInputs.forEach(input => input.disabled = false);
    pinSubmit.disabled = false;
    sessionStorage.removeItem('pinAttempts');
    sessionStorage.removeItem('pinLockoutUntil');
    pinError.classList.remove('show');
  }
}

// Auto-move to next input
pinInputs.forEach((input, index) => {
  input.addEventListener('input', (e) => {
    if (e.target.value.length === 1 && index < pinInputs.length - 1) {
      pinInputs[index + 1].focus();
    }
  });

  // Backspace navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
      pinInputs[index - 1].focus();
    }
    // Enter to submit
    if (e.key === 'Enter') {
      verifyPin();
    }
  });
});

async function verifyPin() {
  if (isLockedOut()) return;

  const enteredPin = Array.from(pinInputs).map(input => input.value).join('');

  if (enteredPin.length !== 4) {
    showError('Por favor completa el PIN');
    return;
  }

  const enteredHash = await hashPin(enteredPin);

  if (enteredHash === PIN_HASH) {
    sessionStorage.removeItem('pinAttempts');
    sessionStorage.removeItem('pinLockoutUntil');
    pinScreen.style.display = 'none';
    privateContent.classList.add('unlocked');
    pinError.classList.remove('show');
  } else {
    const attempts = getAttempts() + 1;
    sessionStorage.setItem('pinAttempts', String(attempts));

    if (attempts >= MAX_ATTEMPTS) {
      sessionStorage.setItem('pinLockoutUntil', String(Date.now() + LOCKOUT_MS));
      clearPin();
      updateLockUI();
    } else {
      showError(`PIN incorrecto (${attempts}/${MAX_ATTEMPTS})`);
      clearPin();
    }
  }
}

function showError(message, autoHide = true) {
  pinError.textContent = message;
  pinError.classList.add('show');
  if (autoHide) {
    setTimeout(() => pinError.classList.remove('show'), 3000);
  }
}

function clearPin() {
  pinInputs.forEach(input => input.value = '');
  pinInputs[0].focus();
}

pinSubmit.addEventListener('click', verifyPin);

// La página siempre pide el PIN al abrirse; no se guarda acceso entre visitas
document.addEventListener('DOMContentLoaded', () => {
  if (isLockedOut()) {
    updateLockUI();
  } else {
    pinInputs[0].focus();
  }

  const lockBtn = document.createElement('button');
  lockBtn.className = 'unlock-button';
  lockBtn.textContent = '🔒 Bloquear';
  lockBtn.onclick = () => location.reload();
  privateContent.appendChild(lockBtn);
});