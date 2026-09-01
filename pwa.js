if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Variable global para almacenar el evento de instalación
let deferredPrompt = null;

// Capturar evento de instalación (antes de que se muestre el prompt nativo)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallPrompt();
});

// Mostrar la interfaz de instalación en móvil
function showInstallPrompt() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (!isMobile || !deferredPrompt) return;
  
  let installBtn = document.getElementById('installAppBtn');
  if (!installBtn) {
    installBtn = document.createElement('button');
    installBtn.id = 'installAppBtn';
    installBtn.textContent = '📱 Instalar en el móvil';
    installBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; padding: 10px 16px; background: linear-gradient(135deg, #ec4899, #f472b6); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; z-index: 999; box-shadow: 0 4px 12px rgba(236, 72, 153, 0.4); font-size: 14px;';
    installBtn.addEventListener('click', handleInstallClick);
    document.body.appendChild(installBtn);
  }
  installBtn.style.display = 'block';
}

// Manejar clic en el botón de instalación
async function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'none';
  }
  deferredPrompt = null;
}

// Ocultar botón cuando la app se instala
window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.style.display = 'none';
});
