(() => {
  const chatApi = 'http://127.0.0.1:3000/api';
  let conversationId = localStorage.getItem('jhonnChatConversationId') || '';
  let chatStarted = Boolean(conversationId);

  const button = document.createElement('button');
  button.className = 'chat-widget-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Abrir chat con Jhonn');
  button.title = 'Chat con Jhonn';
  button.innerHTML = '<span aria-hidden="true">◌</span><span class="chat-button-label">Chat</span>';

  const widget = document.createElement('section');
  widget.className = 'chat-widget';
  widget.hidden = true;
  widget.setAttribute('aria-label', 'Chat con Jhonn');
  widget.innerHTML = `
    <header class="chat-widget-header">
      <div><strong>Jhonn</strong><span class="chat-online-label">Comprobando estado...</span><a class="chat-contact-link" href="contact.html#contacto" hidden>Dejar mis datos</a></div>
    </header>
    <div class="chat-messages"></div>
    <form class="chat-form">
      <input name="name" required maxlength="120" placeholder="Tu nombre" autocomplete="name" />
      <textarea name="message" required rows="3" placeholder="Comprobando disponibilidad..." disabled></textarea>
      <button type="submit" disabled>Enviar</button>
      <p class="chat-status" role="status"></p>
    </form>
  `;

  document.body.append(button, widget);
  const onlineLabel = widget.querySelector('.chat-online-label');
  const contactLink = widget.querySelector('.chat-contact-link');
  const messages = widget.querySelector('.chat-messages');
  const status = widget.querySelector('.chat-status');
  let firstMessageSent = Boolean(conversationId);
  let statusTimer = null;

  function showTemporaryStatus(message) {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = window.setTimeout(() => {
      status.textContent = '';
    }, 4000);
  }

  button.addEventListener('click', () => {
    widget.hidden = !widget.hidden;
    if (!widget.hidden) {
      loadPresence();
      loadReplies();
    }
  });

  async function loadPresence() {
    try {
      const response = await fetch(`${chatApi}/public/presence`);
      const data = await response.json();
      onlineLabel.textContent = data.online
        ? 'En línea. Puedes enviarme un mensaje.'
        : 'No está en línea. Vuelve más tarde o deja tus datos.';
      contactLink.hidden = data.online;
      widget.querySelector('.chat-form textarea').disabled = !data.online;
      widget.querySelector('.chat-form button[type="submit"]').disabled = !data.online;
      widget.querySelector('.chat-form textarea').placeholder = data.online ? 'Escribe tu mensaje...' : 'El chat está cerrado ahora';
    } catch (_error) {
      onlineLabel.textContent = 'No está en línea. Vuelve más tarde o deja tus datos.';
      contactLink.hidden = false;
    }
  }

  contactLink.addEventListener('click', (event) => {
    if (!document.getElementById('contactMeButton')) return;
    event.preventDefault();
    document.getElementById('contactMeButton').click();
  });

  async function loadReplies() {
    if (!conversationId) return;
    try {
      const response = await fetch(`${chatApi}/chat/${conversationId}/replies`);
      if (response.status === 404) {
        conversationId = '';
        chatStarted = false;
        localStorage.removeItem('jhonnChatConversationId');
        messages.replaceChildren();
        showNameField();
        status.textContent = 'Conversación terminada. Puedes iniciar un chat nuevo.';
        return;
      }
      if (!response.ok) return;
      const replies = await response.json();
      messages.replaceChildren(...replies.map((reply) => {
        const bubble = document.createElement('div');
        bubble.className = `chat-message ${reply.sender}`;
        bubble.textContent = reply.body;
        return bubble;
      }));
    } catch (_error) {}
  }

  function showNameField() {
    const nameInput = widget.querySelector('[name="name"]');
    nameInput.hidden = false;
    nameInput.required = true;
  }

  function hideNameField() {
    const nameInput = widget.querySelector('[name="name"]');
    nameInput.hidden = true;
    nameInput.required = false;
  }

  widget.querySelector('.chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.conversationId = conversationId;
    window.clearTimeout(statusTimer);
    status.textContent = 'Enviando...';
    try {
      const response = await fetch(`${chatApi}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const responseText = await response.text();
      let result = {};
      try { result = responseText ? JSON.parse(responseText) : {}; } catch (_parseError) {}
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar.');
      conversationId = result.id;
      chatStarted = true;
      localStorage.setItem('jhonnChatConversationId', conversationId);
      hideNameField();
      form.querySelector('[name="message"]').value = '';
      if (!firstMessageSent) {
        firstMessageSent = true;
        showTemporaryStatus('Mensaje enviado.');
      } else {
        status.textContent = '';
      }
      loadReplies();
    } catch (_error) {
      showTemporaryStatus('No se pudo enviar. Comprueba tu conexión.');
    }
  });


  loadPresence();
  setInterval(() => { loadPresence(); loadReplies(); }, 2500);
})();
