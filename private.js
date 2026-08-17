// Private Page PIN Management
const PIN_CORRECT = '2025'; // Cambia esto por tu PIN
const pinInputs = document.querySelectorAll('.pin-input');
const pinSubmit = document.getElementById('pinSubmit');
const pinScreen = document.getElementById('pinScreen');
const privateContent = document.getElementById('privateContent');
const pinError = document.getElementById('pinError');

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

function verifyPin() {
  const enteredPin = Array.from(pinInputs).map(input => input.value).join('');

  if (enteredPin.length !== 4) {
    showError('Por favor completa el PIN');
    return;
  }

  if (enteredPin === PIN_CORRECT) {
    localStorage.setItem('privateUnlocked', 'true');
    pinScreen.style.display = 'none';
    privateContent.classList.add('unlocked');
    pinError.classList.remove('show');
  } else {
    showError('PIN incorrecto, intenta de nuevo');
    clearPin();
  }
}

function showError(message) {
  pinError.textContent = message;
  pinError.classList.add('show');
  setTimeout(() => {
    pinError.classList.remove('show');
  }, 3000);
}

function clearPin() {
  pinInputs.forEach(input => input.value = '');
  pinInputs[0].focus();
}

pinSubmit.addEventListener('click', verifyPin);

// Check if already unlocked
function checkUnlockedStatus() {
  if (localStorage.getItem('privateUnlocked') === 'true') {
    pinScreen.style.display = 'none';
    privateContent.classList.add('unlocked');
  } else {
    pinInputs[0].focus();
  }
}

// Lock button to clear access
document.addEventListener('DOMContentLoaded', () => {
  checkUnlockedStatus();

  // Add lock button to private content
  const lockBtn = document.createElement('button');
  lockBtn.className = 'unlock-button';
  lockBtn.textContent = '🔓 Logout';
  lockBtn.onclick = () => {
    localStorage.removeItem('privateUnlocked');
    location.reload();
  };
  privateContent.appendChild(lockBtn);
});