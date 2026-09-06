const apiBase = 'http://127.0.0.1:3000/api';
let authToken = sessionStorage.getItem('adminToken') || '';
const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const loginForm = document.getElementById('loginForm');
const loginFeedback = document.getElementById('loginFeedback');
const connectionStatus = document.getElementById('connectionStatus');
const feedback = document.getElementById('feedback');
const projectsList = document.getElementById('projectsList');
const projectForm = document.getElementById('projectForm');
const projectId = document.getElementById('projectId');
const projectTitle = document.getElementById('projectTitle');
const projectDescription = document.getElementById('projectDescription');
const projectImageUrl = document.getElementById('projectImageUrl');
const projectUrl = document.getElementById('projectUrl');
const formHeading = document.getElementById('formHeading');
const onlineMessagesList = document.getElementById('onlineMessagesList');
const contactMessagesList = document.getElementById('contactMessagesList');
const themeButton = document.getElementById('themeButton');
let activeChatId = '';
let activeChatKind = 'chat';
let knownMessageIds = null;

function showPanelNotification(message, type) {
  const container = document.getElementById('panelNotifications');
  const notification = document.createElement('div');
  notification.className = 'panel-notification';
  const title = document.createElement('strong');
  title.textContent = type === 'Chat online' ? 'Nuevo chat online' : 'Nuevo formulario de contacto';
  const body = document.createElement('span');
  body.textContent = message;
  notification.append(title, body);
  container.appendChild(notification);
  setTimeout(() => notification.remove(), 6500);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title.textContent, { body: message });
  }
}

function showView(view) {
  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  document.querySelectorAll('.dashboard-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  if (view !== 'messages') document.getElementById('activeChatPanel').hidden = true;
}
const authHeaders = () => ({ Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' });
const splitValues = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
  themeButton.setAttribute('aria-label', theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro');
  localStorage.setItem('portfolioTheme', theme);
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle('error', isError);
}

function renderProjects(projects) {
  projectsList.replaceChildren();
  if (!projects.length) {
    showFeedback('Todavía no hay proyectos guardados.');
    return;
  }

  for (const project of projects) {
    const item = document.createElement('article');
    item.className = 'project-row';
    const title = document.createElement('h3');
    title.textContent = project.title;
    const description = document.createElement('p');
    description.textContent = project.description || 'Sin descripción';
    const link = document.createElement('span');
    link.textContent = project.project_url || 'Sin enlace';
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editButton = document.createElement('button');
    editButton.className = 'button-secondary';
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => fillForm(project));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'danger-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', () => deleteProject(project.id));
    actions.append(editButton, deleteButton);
    item.append(title, description, link, actions);
    projectsList.appendChild(item);
  }
}

function fillForm(project) {
  projectId.value = project.id;
  projectTitle.value = project.title || '';
  projectDescription.value = project.description || '';
  projectImageUrl.value = project.image_url || '';
  projectUrl.value = project.project_url || '';
  formHeading.textContent = 'Editar proyecto';
  projectTitle.focus();
}

function resetForm() {
  projectForm.reset();
  projectId.value = '';
  formHeading.textContent = 'Nuevo proyecto';
}

async function deleteProject(id) {
  if (!window.confirm('¿Eliminar este proyecto?')) return;
  const response = await fetch(`${apiBase}/projects/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });
  if (!response.ok) throw new Error('No se pudo eliminar el proyecto.');
  await refresh();
}

async function loadStatus() {
  const response = await fetch(`${apiBase}/health`);
  const data = await response.json();
  connectionStatus.textContent = `MySQL: ${data.mysql} | Firebase: ${data.firebase}`;
  connectionStatus.classList.toggle('connected', data.ok);
}

async function loadProjects() {
  const response = await fetch(`${apiBase}/projects`);
  if (!response.ok) throw new Error('No se pudieron cargar los proyectos.');
  renderProjects(await response.json());
}

async function loadMessages() {
  const response = await fetch(`${apiBase}/messages`, { headers: authHeaders() });
  if (!response.ok) throw new Error('No se pudieron cargar los mensajes.');
  const messages = await response.json();
  const currentIds = new Set(messages.map((message) => message.id));
  if (knownMessageIds) {
    messages.filter((message) => !knownMessageIds.has(message.id)).forEach((message) => {
      showPanelNotification(`${message.name}: ${message.message}`, message.subject);
    });
  }
  knownMessageIds = currentIds;
  document.getElementById('messagesCount').textContent = messages.filter((message) => message.status === 'new').length;
  onlineMessagesList.replaceChildren();
  contactMessagesList.replaceChildren();
  const onlineMessages = [];
  const contactMessages = messages.filter((message) => message.subject !== 'Chat online');

  function emptyMessage(text) {
    const empty = document.createElement('p');
    empty.className = 'feedback';
    empty.textContent = text;
    return empty;
  }

  if (!onlineMessages.length) onlineMessagesList.appendChild(emptyMessage('No hay chats online.'));
  if (!contactMessages.length) contactMessagesList.appendChild(emptyMessage('No hay formularios recibidos.'));

  async function renderMessage(message, target) {
    const item = document.createElement('article');
    item.className = `message-row${message.status === 'new' ? ' unread' : ''}`;
    const title = document.createElement('h3');
    title.textContent = message.subject;
    const sender = document.createElement('p');
    sender.textContent = `${message.name} · ${message.email}${message.phone ? ` · ${message.phone}` : ''}`;
    const body = document.createElement('p');
    body.textContent = message.message;
    item.append(title, sender, body);

    if (message.status === 'new') {
      const readButton = document.createElement('button');
      readButton.className = 'button-secondary';
      readButton.type = 'button';
      readButton.textContent = 'Marcar como leído';
      readButton.addEventListener('click', async () => {
        await fetch(`${apiBase}/messages/${encodeURIComponent(message.id)}/read`, { method: 'PATCH', headers: authHeaders() });
        await loadMessages();
      });
      item.appendChild(readButton);
    }
    const archiveButton = document.createElement('button');
    archiveButton.className = 'button-secondary';
    archiveButton.type = 'button';
    archiveButton.textContent = 'Archivar';
    archiveButton.addEventListener('click', async () => {
      await fetch(`${apiBase}/messages/${encodeURIComponent(message.id)}/archive`, { method: 'PATCH', headers: { Authorization: `Bearer ${authToken}` } });
      await loadMessages();
    });
    const deleteButton = document.createElement('button');
    deleteButton.className = 'danger-button';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', async () => {
      if (!window.confirm('¿Eliminar este mensaje?')) return;
      await fetch(`${apiBase}/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } });
      await loadMessages();
    });
    item.append(archiveButton, deleteButton);
    target.appendChild(item);
  }

  await Promise.all([
    ...contactMessages.map((message) => renderMessage(message, contactMessagesList))
  ]);
  await loadOnlineChats();
}

async function loadOnlineChats() {
  const response = await fetch(`${apiBase}/admin/chats`, { headers: authHeaders() });
  if (!response.ok) return;
  const chats = await response.json();
  const chatButton = document.getElementById('panelFloatingChat');
  chatButton.dataset.count = chats.length;
  chatButton.classList.toggle('has-chats', chats.length > 0);
  onlineMessagesList.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement('p');
    empty.className = 'feedback';
    empty.textContent = 'No hay chats online activos.';
    onlineMessagesList.appendChild(empty);
    return;
  }
  chats.forEach((chat) => {
    const item = document.createElement('article');
    item.className = 'message-row unread';
    const title = document.createElement('h3'); title.textContent = chat.name;
    const sender = document.createElement('p'); sender.textContent = chat.email;
    const body = document.createElement('p'); body.textContent = chat.lastMessage;
    const open = document.createElement('button'); open.className = 'button-secondary'; open.type = 'button'; open.textContent = 'Abrir chat';
    open.addEventListener('click', () => openPanelChat({ ...chat, subject: 'Chat online' }));
    const end = document.createElement('button'); end.className = 'danger-button'; end.type = 'button'; end.textContent = 'Terminar chat';
    end.addEventListener('click', async () => { await fetch(`${apiBase}/admin/chats/${encodeURIComponent(chat.id)}`, { method: 'DELETE', headers: authHeaders() }); await loadMessages(); });
    item.append(title, sender, body, open, end);
    onlineMessagesList.appendChild(item);
  });
}

let messageRefreshInProgress = false;
async function refreshMessagesSilently() {
  if (messageRefreshInProgress || !authToken) return;
  messageRefreshInProgress = true;
  try {
    await loadMessages();
    if (activeChatId) await loadPanelChat();
  } finally {
    messageRefreshInProgress = false;
  }
}

async function openPanelChat(message) {
  activeChatId = message.id;
  activeChatKind = message.subject === 'Chat online' ? 'chat' : 'contact';
  document.getElementById('activeChatPanel').hidden = false;
  document.getElementById('activeChatHeading').textContent = `${message.name} · ${message.email}`;
  await loadPanelChat();
}

async function loadPanelChat() {
  if (!activeChatId) return;
  const endpoint = activeChatKind === 'chat'
    ? `${apiBase}/admin/chats/${encodeURIComponent(activeChatId)}/replies`
    : `${apiBase}/messages/${encodeURIComponent(activeChatId)}/replies`;
  const response = await fetch(endpoint, { headers: authHeaders() });
  if (!response.ok) return;
  const replies = await response.json();
  const container = document.getElementById('panelChatMessages');
  container.replaceChildren(...replies.map((reply) => {
    const bubble = document.createElement('div');
    bubble.className = `panel-chat-message ${reply.sender}`;
    bubble.textContent = `${reply.sender === 'admin' ? 'Tú' : 'Visitante'}: ${reply.body}`;
    return bubble;
  }));
}

async function loadContentSummary() {
  const headers = { Authorization: `Bearer ${authToken}` };
  const contentTypes = ['services', 'experience', 'about_content', 'site_settings'];
  const results = await Promise.all(contentTypes.map(async (type) => {
    const response = await fetch(`${apiBase}/content/${type}`, { headers });
    if (!response.ok) throw new Error('No se pudo cargar el contenido.');
    return { type, rows: await response.json() };
  }));
  const summary = document.getElementById('contentStatus');
  summary.replaceChildren();
  for (const result of results) {
    const item = document.createElement('div');
    item.className = 'content-pill';
    item.textContent = `${result.type}: ${result.rows.length}`;
    summary.appendChild(item);
    if (result.type === 'services') document.getElementById('servicesCount').textContent = result.rows.length;
    if (result.type === 'experience') document.getElementById('experienceCount').textContent = result.rows.length;
    if (result.type === 'services' || result.type === 'experience') renderContentList(result.type, result.rows);
    if (result.type === 'about_content' && result.rows[0]) fillAboutForm(result.rows[0]);
    if (result.type === 'site_settings' && result.rows[0]) fillSettingsForm(result.rows[0]);
  }
}

async function sendPresenceHeartbeat() {
  if (!authToken) return;
  await fetch(`${apiBase}/admin/presence`, { method: 'POST', headers: authHeaders() }).catch(() => {});
}

setInterval(() => {
  void sendPresenceHeartbeat();
  void refreshMessagesSilently();
}, 5000);

function fillAboutForm(data) {
  document.getElementById('aboutTitle').value = data.title || '';
  document.getElementById('aboutDescription').value = data.description || '';
  document.getElementById('aboutBiography').value = data.biography || '';
  document.getElementById('aboutPhotoUrl').value = data.photo_url || '';
}

function fillSettingsForm(data) {
  document.getElementById('settingsSiteName').value = data.site_name || '';
  document.getElementById('settingsHeroTitle').value = data.hero_title || '';
  document.getElementById('settingsHeroDescription').value = data.hero_description || '';
  document.getElementById('settingsEmail').value = data.email || '';
  document.getElementById('settingsLocation').value = data.location || '';
  document.getElementById('settingsGithub').value = data.github_url || '';
  document.getElementById('settingsLinkedin').value = data.linkedin_url || '';
  document.getElementById('settingsInstagram').value = data.instagram_url || '';
}

function renderContentList(type, rows) {
  const container = document.getElementById('contentLists');
  let list = container.querySelector(`[data-content-list="${type}"]`);
  if (!list) {
    list = document.createElement('div');
    list.dataset.contentList = type;
    list.className = 'content-list';
    container.appendChild(list);
  }
  list.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = type === 'services' ? 'Servicios guardados' : 'Experiencia guardada';
  list.appendChild(heading);
  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'content-row';
    const title = document.createElement('strong');
    title.textContent = row.title || row.role;
    const details = document.createElement('span');
    details.textContent = row.description;
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const edit = document.createElement('button');
    edit.className = 'button-secondary'; edit.type = 'button'; edit.textContent = 'Editar';
    edit.addEventListener('click', () => {
      if (type === 'services') {
        document.getElementById('serviceId').value = row.id;
        document.getElementById('serviceTitle').value = row.title || '';
        document.getElementById('serviceDescription').value = row.description || '';
        document.getElementById('serviceFeatures').value = (Array.isArray(row.features) ? row.features : JSON.parse(row.features || '[]')).join(', ');
      } else {
        document.getElementById('experienceId').value = row.id;
        document.getElementById('experienceRole').value = row.role || '';
        document.getElementById('experienceCompany').value = row.company || '';
        document.getElementById('experienceDescription').value = row.description || '';
        document.getElementById('experienceStart').value = row.start_year || '';
        document.getElementById('experienceEnd').value = row.end_year || '';
        document.getElementById('experienceSkills').value = (Array.isArray(row.skills) ? row.skills : JSON.parse(row.skills || '[]')).join(', ');
      }
    });
    const remove = document.createElement('button');
    remove.className = 'danger-button'; remove.type = 'button'; remove.textContent = 'Eliminar';
    remove.addEventListener('click', async () => {
      if (!window.confirm('¿Eliminar este contenido?')) return;
      await fetch(`${apiBase}/content/${type}/${encodeURIComponent(row.id)}`, { method: 'DELETE', headers: authHeaders() });
      await refresh();
    });
    actions.append(edit, remove);
    item.append(title, details, actions);
    list.appendChild(item);
  });
}

async function saveContent(type, id, payload) {
  const endpoint = id ? `${apiBase}/content/${type}/${encodeURIComponent(id)}` : `${apiBase}/content/${type}`;
  const response = await fetch(endpoint, { method: id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo guardar el contenido.');
}

document.getElementById('serviceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveContent('services', document.getElementById('serviceId').value, {
      title: document.getElementById('serviceTitle').value,
      description: document.getElementById('serviceDescription').value,
      features: splitValues(document.getElementById('serviceFeatures').value)
    });
    showFeedback('Servicio guardado.'); await refresh();
  } catch (error) { showFeedback(error.message, true); }
});

document.getElementById('experienceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveContent('experience', document.getElementById('experienceId').value, {
      role: document.getElementById('experienceRole').value,
      company: document.getElementById('experienceCompany').value,
      description: document.getElementById('experienceDescription').value,
      startYear: document.getElementById('experienceStart').value,
      endYear: document.getElementById('experienceEnd').value,
      skills: splitValues(document.getElementById('experienceSkills').value)
    });
    showFeedback('Experiencia guardada.'); await refresh();
  } catch (error) { showFeedback(error.message, true); }
});

document.getElementById('aboutForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveContent('about_content', '', {
      id: 'about', title: document.getElementById('aboutTitle').value,
      description: document.getElementById('aboutDescription').value,
      biography: document.getElementById('aboutBiography').value,
      photoUrl: document.getElementById('aboutPhotoUrl').value
    });
    showFeedback('Información personal guardada.'); await refresh();
  } catch (error) { showFeedback(error.message, true); }
});

document.getElementById('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveContent('site_settings', '', {
      id: 'site', siteName: document.getElementById('settingsSiteName').value,
      heroTitle: document.getElementById('settingsHeroTitle').value,
      heroDescription: document.getElementById('settingsHeroDescription').value,
      email: document.getElementById('settingsEmail').value,
      location: document.getElementById('settingsLocation').value,
      githubUrl: document.getElementById('settingsGithub').value,
      linkedinUrl: document.getElementById('settingsLinkedin').value,
      instagramUrl: document.getElementById('settingsInstagram').value
    });
    showFeedback('Configuración guardada.'); await refresh();
  } catch (error) { showFeedback(error.message, true); }
});

async function refresh() {
  try {
    await loadStatus();
    await loadProjects();
    await loadMessages();
    document.getElementById('projectsCount').textContent = document.querySelectorAll('.project-row').length;
    await loadContentSummary();
    await sendPresenceHeartbeat();
    showFeedback('Datos cargados correctamente.');
  } catch (error) {
    connectionStatus.textContent = 'Backend desconectado';
    connectionStatus.classList.remove('connected');
    showFeedback(error.message, true);
    setTimeout(() => {
      if (!appShell.hidden) refresh();
    }, 1500);
  }
}

document.getElementById('reloadButton').addEventListener('click', refresh);
document.getElementById('syncButton').addEventListener('click', async () => {
  try {
    showFeedback('Sincronizando Firebase y MySQL...');
    const response = await fetch(`${apiBase}/sync/projects`, { method: 'POST', headers: authHeaders() });
    if (!response.ok) throw new Error('La sincronización falló.');
    await refresh();
    showFeedback('Sincronización completada.');
  } catch (error) {
    showFeedback(error.message, true);
  }
});

projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: projectTitle.value,
    description: projectDescription.value,
    imageUrl: projectImageUrl.value,
    projectUrl: projectUrl.value
  };
  try {
    const method = projectId.value ? 'PUT' : 'POST';
    const endpoint = projectId.value
      ? `${apiBase}/projects/${encodeURIComponent(projectId.value)}`
      : `${apiBase}/projects`;
    const response = await fetch(endpoint, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('No se pudo guardar el proyecto.');
    resetForm();
    await refresh();
    showFeedback('Proyecto guardado. Pulsa Sincronizar ahora para enviarlo a Firebase.');
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById('cancelButton').addEventListener('click', resetForm);
document.getElementById('reloadMessagesButton').addEventListener('click', loadMessages);
document.querySelectorAll('.dashboard-tab').forEach((tab) => {
  tab.addEventListener('click', () => showView(tab.dataset.view));
});
document.getElementById('panelFloatingChat').addEventListener('click', () => {
  const chatPanel = document.getElementById('activeChatPanel');
  if (activeChatId) chatPanel.hidden = !chatPanel.hidden;
  else showView('messages');
});
document.getElementById('closeActiveChat').addEventListener('click', () => { document.getElementById('activeChatPanel').hidden = true; activeChatId = ''; });
document.getElementById('panelReplyForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activeChatId) return;
  const input = document.getElementById('panelReplyInput');
  const endpoint = activeChatKind === 'chat'
    ? `${apiBase}/admin/chats/${encodeURIComponent(activeChatId)}/replies`
    : `${apiBase}/messages/${encodeURIComponent(activeChatId)}/replies`;
  const response = await fetch(endpoint, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ body: input.value }) });
  if (response.ok) { input.value = ''; await loadPanelChat(); }
});
themeButton.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginFeedback.textContent = 'Comprobando...';
  try {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('loginUser').value.trim(),
        password: document.getElementById('loginPassword').value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesión.');
    authToken = result.token;
    sessionStorage.setItem('adminToken', authToken);
    loginScreen.hidden = true;
    appShell.hidden = false;
    await refresh();
  } catch (error) {
    loginFeedback.textContent = error.message;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  const tokenToRevoke = authToken;
  sessionStorage.removeItem('adminToken');
  authToken = '';
  appShell.hidden = true;
  loginScreen.hidden = false;
  loginForm.reset();
  loginFeedback.textContent = 'Sesión cerrada. Puedes volver a entrar.';
  connectionStatus.textContent = 'Sesión cerrada';

  if (tokenToRevoke) {
    fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenToRevoke}` }
    }).catch(() => {});
  }
});

if (authToken) {
  loginScreen.hidden = true;
  appShell.hidden = false;
  refresh();
}

applyTheme(localStorage.getItem('portfolioTheme') || 'light');

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => {});
}